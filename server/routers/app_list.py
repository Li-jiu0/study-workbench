"""R171-B：已安装应用列表（应用名 + 图标）上报 / 开关 / 查询接口。

背景：用户端（登录.html / 设置.html）在 App 环境经原生桥采集已安装应用（应用名 label +
包名 pkg + 图标 icon data URL），**默认开启**上报；管理员可在后台查看某用户的列表。
本模块提供【用户侧 3 条 + 管理侧 1 条】共 4 条路由：
    用户侧（需登录）  POST /api/user/app-list          上报（upsert，每用户一行）
                      POST /api/user/app-list/toggle   开关（关闭时清空已存列表）
                      GET  /api/user/app-list/status   查询开关 / 条数 / 更新时间
    管理侧（仅管理员）GET  /api/admin/users/{uid}/apps  查看某用户应用列表（落审计日志）

设计要点（照抄 routers/installed_apps.py 的「每用户一行 upsert」写法）：
  - 每用户一行（user_id 主键），重复上报覆盖更新，不膨胀；
  - 「无行即视为开启」：从未上报 / 从未关过的用户默认 enabled=True；
  - 用户显式关闭（enabled=False）后，再有上报**不写入**，尊重用户选择；
  - 数量上限 200（超限 400）；单条 label≤64 / pkg≤128（str 化后截断）；icon≤8192
    （超限置空字符串，不报错 —— 前端负责首字母色块兜底）。

⚠️ 隐私红线：应用名 / 包名 / 图标属敏感个人信息，**只允许管理员接口返回**；
普通用户接口（含本人）与他人主页 / 好友搜索等一律不得出现本表任何字段。
仅供账号安全与管理风控查看，严禁对外公开、严禁用于用户画像 / 广告投放。
"""
import json
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import AdminOpLog, User, UserAppList, get_db, now_iso
from routers.admin import _require_admin
from security import get_current_user

# 用户侧：/api/user/app-list*（需登录）
router = APIRouter(prefix="/api/user", tags=["app-list"])
# 管理侧：/api/admin/users/{uid}/apps（仅管理员，与 admin_ops 同口径鉴权）
router_admin = APIRouter(prefix="/api/admin", tags=["admin-app-list"])

MAX_APPS = 200       # 单次上报应用条数上限（超限 400）
MAX_LABEL = 64       # 应用名长度上限（超出截断）
MAX_PKG = 128        # 包名长度上限（超出截断）
MAX_ICON = 8192      # 图标（data URL）长度上限（超出置空，不报错）


def _dumps_apps(apps: list[dict]) -> str:
    """把应用列表序列化为 JSON 字符串（保留中文，不转义为 \\uXXXX）。"""
    return json.dumps(apps, ensure_ascii=False)


def _load_apps(raw: str | None) -> list:
    """把库内 apps JSON 字符串解析为列表；损坏 / 空值一律回退 []。"""
    try:
        v = json.loads(raw or "[]")
        return v if isinstance(v, list) else []
    except Exception:
        return []


@router.post("/app-list")
def report_app_list(body: dict | None = Body(default=None),
                    user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """上报当前登录用户的已安装应用列表（upsert，同一用户恒一行）。

    - `apps` 必须是数组，最多 200 条（非数组 / 超限 → 400）；
    - 逐条清洗：非 dict / 缺 label → 跳过；label≤64、pkg≤128（str 化后截断）；
      icon 超 8192 → 置空字符串（不报错）；
    - `saved` = 实际落库条数；`appCount` = 请求里的 appCount（int 化，缺省取 len(apps)）；
    - 若该用户已显式关闭上报（enabled=False）→ 直接返回 saved=0 且不写入。
    """
    data: dict[str, Any] = body if isinstance(body, dict) else {}
    raw_apps = data.get("apps")
    if not isinstance(raw_apps, list):
        raise HTTPException(400, "apps 必须为数组")
    if len(raw_apps) > MAX_APPS:
        raise HTTPException(400, f"应用数量超过上限 {MAX_APPS}")

    cleaned: list[dict] = []
    for item in raw_apps:
        if not isinstance(item, dict):
            continue  # 非法条目（不是 dict）→ 跳过
        label = str(item.get("label") or "").strip()
        if not label:
            continue  # 缺 label / 空 label → 跳过
        pkg = str(item.get("pkg") or "")[:MAX_PKG]
        icon = str(item.get("icon") or "")
        if len(icon) > MAX_ICON:
            icon = ""  # 超限图标置空（不报错，前端首字母色块兜底）
        cleaned.append({"label": label[:MAX_LABEL], "pkg": pkg, "icon": icon})

    # appCount：请求里的 appCount（int 化）；缺省 / 非法 → len(apps)
    raw_count = data.get("appCount")
    try:
        app_count = int(raw_count) if raw_count is not None else len(raw_apps)
    except (TypeError, ValueError):
        app_count = len(raw_apps)

    row = db.get(UserAppList, user.id)
    if row is not None and row.enabled is False:
        # 尊重用户已关闭的选择：不写入，原样返回当前更新时间
        return {"ok": True, "saved": 0, "updatedAt": row.updated_at or ""}

    now = now_iso()
    apps_json = _dumps_apps(cleaned)
    if row is None:
        db.add(UserAppList(user_id=user.id, apps=apps_json,
                           app_count=app_count, enabled=True, updated_at=now))
    else:
        row.apps = apps_json
        row.app_count = app_count
        row.enabled = True
        row.updated_at = now
    db.commit()
    return {"ok": True, "saved": len(cleaned), "updatedAt": now}


class ToggleIn(BaseModel):
    """开关入参：enabled=True 开启上报；False 关闭并清空已存列表。"""
    enabled: bool = True


@router.post("/app-list/toggle")
def toggle_app_list(body: ToggleIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """开关上报。

    - 关闭（enabled=False）：清空已存列表（apps="[]"、app_count=0）并置位；
    - 开启（enabled=True）：仅置位，不动已有列表；
    - 首次调用（无行）且开启 → 不建行（「无行即视为开启」，避免噪声行）。
    """
    enabled = bool(body.enabled)
    row = db.get(UserAppList, user.id)
    if row is None:
        if enabled:
            return {"ok": True, "enabled": True}
        db.add(UserAppList(user_id=user.id, apps="[]", app_count=0,
                           enabled=False, updated_at=""))
        db.commit()
        return {"ok": True, "enabled": False}
    row.enabled = enabled
    if not enabled:
        row.apps = "[]"
        row.app_count = 0
    db.commit()
    return {"ok": True, "enabled": enabled}


@router.get("/app-list/status")
def app_list_status(user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """查询当前用户的上报开关 / 条数 / 更新时间。**无行 = 默认开启**。"""
    row = db.get(UserAppList, user.id)
    if row is None:
        return {"enabled": True, "appCount": 0, "updatedAt": ""}
    return {"enabled": bool(row.enabled),
            "appCount": int(row.app_count or 0),
            "updatedAt": row.updated_at or ""}


@router_admin.get("/users/{uid}/apps")
def admin_user_apps(uid: int, admin: User = Depends(_require_admin),
                    db: Session = Depends(get_db)):
    """管理员查看某用户已安装应用列表（含应用名 + 包名 + 图标）。

    - 用户不存在 → 404「用户不存在」；
    - 无上报记录 → apps=[]、appCount=0、updatedAt=""、enabled=True；
    - apps[].icon 原样透传（可能为空字符串），不做任何截断 / 替换；
    - 每次查看落一条审计日志 action="user_apps_view"。
    """
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "用户不存在")

    row = db.get(UserAppList, uid)
    if row is None:
        enabled, app_count, updated_at, apps = True, 0, "", []
    else:
        enabled = bool(row.enabled)
        app_count = int(row.app_count or 0)
        updated_at = row.updated_at or ""
        apps = _load_apps(row.apps)

    db.add(AdminOpLog(admin_id=admin.id, action="user_apps_view",
                      target_type="user", target_id=uid, detail="",
                      created_at=now_iso()))
    db.commit()

    return {"userId": u.id, "username": u.username, "nickname": u.nickname,
            "enabled": enabled, "appCount": app_count,
            "updatedAt": updated_at, "apps": apps}
