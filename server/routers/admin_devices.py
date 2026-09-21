"""R3-L4：管理员「设备统计」后台（纯增量，2026-09-22）。

背景：R105 已实现 App 设备信息上报（POST /api/user/device，落库 user_devices 表，
每用户一行），但管理后台一直没有查看 / 统计入口。本模块补齐该缺口。

路由（全部要求「已登录 + is_admin」，鉴权复用 admin.py 的 _require_admin，
非管理员一律 403、未登录由 get_current_user 先抛 401）：
    GET /api/admin/devices            → 分页设备明细（androidId 脱敏）
    GET /api/admin/devices/stats      → 聚合统计（品牌 / 型号 / App 版本 / 系统版本 / 活跃）
    GET /api/admin/devices/export     → 导出 CSV（UTF-8 BOM，androidId 脱敏）

⚠️ 隐私红线（不可越）：
  - 本模块**只读** user_devices 表，不做任何采集，绝不引入 IMEI / MAC / 通讯录 /
    短信等敏感字段；
  - androidId 展示 / 导出**必须脱敏**（只保留前 4 后 4，中间用 * 掩码）；
  - 本模块仅管理员可访问，普通用户请求必须 401 / 403。

设计取舍：新建独立文件（而非改动 admin.py 既有逻辑），符合 lead「最小变更 +
只改自己负责的文件」的要求；仅 import admin.py 的 _require_admin 复用其鉴权依赖。
"""
import csv
import datetime as _dt
import io
import json
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import User, UserDevice, get_db
from routers.admin import _require_admin

router = APIRouter(prefix="/api/admin", tags=["admin-devices"])

# 设备 JSON 白名单字段（与 routers/device.py 的 DeviceIn 严格一致）。
# 这是「读」侧白名单：仅这些键会出现在管理后台的响应里，杜绝任何未声明字段外泄。
_DEVICE_KEYS = (
    "brand", "model", "osVersion", "appVersion", "androidId",
    "screenWidth", "screenHeight", "language",
)

# androidId 脱敏：保留前 4 后 4，中间统一用 4 个星号掩码。
# 长度 ≤8 时不返回任何原始字符，只回掩码，避免短串被还原。
_MASK = "****"
_MASK_PREFIX = 4
_MASK_SUFFIX = 4


def mask_android_id(raw: str) -> str:
    """androidId 脱敏（隐私红线，唯一出口）。

    规则：
      - 空 -> 返回空串；
      - 长度 ≤ 8 -> 返回固定掩码 '****'（原样暴露会泄露乃至被关联）；
      - 否则 -> 前 4 位 + '****' + 后 4 位。

    示例：'abcdef1234567890' -> 'abcd****7890'
    """
    s = (raw or "").strip()
    if not s:
        return ""
    if len(s) <= _MASK_PREFIX + _MASK_SUFFIX:
        return _MASK
    return s[:_MASK_PREFIX] + _MASK + s[-_MASK_SUFFIX:]


def _safe_device(raw: Optional[str]) -> dict:
    """把 user_devices.device（JSON 串）解析为白名单 dict；任何异常都退回空值。

    容错：老行 / 手工脏数据 / 非法 JSON 一律当空对象处理，绝不让接口 500。
    """
    out = {k: "" for k in _DEVICE_KEYS}
    out["screenWidth"] = 0
    out["screenHeight"] = 0
    if not raw:
        return out
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return out
    if not isinstance(data, dict):
        return out
    for k in _DEVICE_KEYS:
        if k not in data:
            continue
        v = data.get(k)
        if v is None:
            continue
        if k in ("screenWidth", "screenHeight"):
            try:
                n = int(v)
            except (TypeError, ValueError):
                n = 0
            out[k] = n if n >= 0 else 0
        else:
            out[k] = str(v)
    return out


def _screen_text(dev: dict) -> str:
    """屏幕尺寸展示：宽x高；缺失（0x0）返回空串。"""
    w = int(dev.get("screenWidth", 0) or 0)
    h = int(dev.get("screenHeight", 0) or 0)
    if w <= 0 or h <= 0:
        return ""
    return f"{w}x{h}"


def _row_from(db: Session, dev_row: UserDevice) -> dict:
    """单条设备明细行（含用户信息 + 脱敏 androidId）。"""
    u = db.get(User, dev_row.user_id)
    dev = _safe_device(dev_row.device)
    return {
        "userId": dev_row.user_id,
        "user_id": dev_row.user_id,
        "username": (u.username if u else "") or "",
        "nickname": (u.nickname if u else "") or "",
        "brand": dev.get("brand", "") or "",
        "model": dev.get("model", "") or "",
        "osVersion": dev.get("osVersion", "") or "",
        "appVersion": dev.get("appVersion", "") or "",
        "screen": _screen_text(dev),
        "screenWidth": dev.get("screenWidth", 0) or 0,
        "screenHeight": dev.get("screenHeight", 0) or 0,
        "language": dev.get("language", "") or "",
        # 隐私红线：androidId 只以脱敏形式外泄，永不明文。
        "androidId": mask_android_id(dev.get("androidId", "")),
        "androidIdMasked": True,
        "lastActive": dev_row.last_active or "",
        "last_active": dev_row.last_active or "",
    }


def _parse_ts(value: Optional[str]) -> Optional[_dt.datetime]:
    """解析 'YYYY-MM-DD HH:MM:SS'；空 / 非法返回 None（与 admin.py 口径一致）。"""
    if not value:
        return None
    try:
        return _dt.datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def _within_days(value: Optional[str], days: int) -> bool:
    """last_active 是否落在最近 days 天内（含今天）。"""
    t = _parse_ts(value)
    if t is None:
        return False
    return (_dt.datetime.now() - t).total_seconds() <= days * 86400


def _match(dev: dict, brand: str, model: str, app_version: str) -> bool:
    """过滤匹配：均为「包含匹配、忽略大小写」，空参数不过滤。"""
    b = (brand or "").strip().lower()
    m = (model or "").strip().lower()
    a = (app_version or "").strip().lower()
    if b and b not in (dev.get("brand", "") or "").lower():
        return False
    if m and m not in (dev.get("model", "") or "").lower():
        return False
    if a and a not in (dev.get("appVersion", "") or "").lower():
        return False
    return True


def _top(counter: Counter, limit: int) -> list[dict]:
    """Counter -> [{name, count}]，按数量降序、同名升序，取前 limit 条。"""
    items = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"name": k, "count": v} for k, v in items[:limit]]


def _load_all(db: Session) -> list[dict]:
    """一次性取出全部设备行并解码为 (user, dev) 组合，供明细 / 聚合共用。"""
    rows = db.query(UserDevice).order_by(UserDevice.last_active.desc(),
                                         UserDevice.user_id.asc()).all()
    result: list[dict] = []
    for r in rows:
        u = db.get(User, r.user_id)
        result.append({
            "row": r,
            "user": u,
            "dev": _safe_device(r.device),
        })
    return result


# ---------------- 分页明细 ----------------
@router.get("/devices")
def list_devices(page: int = Query(default=1, ge=1),
                 size: int = Query(default=20, ge=1, le=200),
                 brand: str = Query(default=""),
                 model: str = Query(default=""),
                 appVersion: str = Query(default=""),
                 user: User = Depends(_require_admin),
                 db: Session = Depends(get_db)):
    """分页设备明细（管理员）。

    返回字段：用户名 / 昵称、brand、model、osVersion、appVersion、屏幕、语言、
    last_active；androidId 已脱敏（前 4 后 4）。

    过滤：brand / model / appVersion 均为「包含匹配、忽略大小写」的可选参数。
    分页：page 从 1 起；size 上限 200。响应同时给 total / page / size / pages。
    """
    all_rows = _load_all(db)
    if brand.strip() or model.strip() or appVersion.strip():
        all_rows = [x for x in all_rows if _match(x["dev"], brand, model, appVersion)]

    total = len(all_rows)
    pages = (total + size - 1) // size if total else 0
    start = (page - 1) * size
    page_rows = all_rows[start:start + size]
    items = [_row_from(db, x["row"]) for x in page_rows]
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": pages,
    }


# ---------------- 聚合统计 ----------------
@router.get("/devices/stats")
def device_stats(topN: int = Query(default=10, ge=1, le=50),
                 user: User = Depends(_require_admin),
                 db: Session = Depends(get_db)):
    """设备聚合统计（管理员）。

    - totalDevices：设备行总数（= 上报过设备的用户数，每用户一行）；
    - activeUsers7d / activeUsers30d：最近 7 / 30 天有上报活动的用户数；
    - brandDist：品牌分布（全量，降序）；
    - modelTop：型号 Top N（topN 可调）；
    - appVersionDist / osVersionDist：App 版本 / Android 版本分布（降序）；
    - languageDist：语言分布（附加，便于排查）；
    - empty 系列：字段缺失（空串 / 全 0）的数量，反映上报质量。
    """
    rows = _load_all(db)

    brand_counter: Counter = Counter()
    model_counter: Counter = Counter()
    app_counter: Counter = Counter()
    os_counter: Counter = Counter()
    lang_counter: Counter = Counter()

    active7 = 0
    active30 = 0
    missing_brand = 0
    missing_model = 0
    missing_app = 0

    for x in rows:
        dev = x["dev"]
        b = (dev.get("brand", "") or "").strip()
        m = (dev.get("model", "") or "").strip()
        a = (dev.get("appVersion", "") or "").strip()
        o = (dev.get("osVersion", "") or "").strip()
        lg = (dev.get("language", "") or "").strip()

        if b:
            brand_counter[b] += 1
        else:
            missing_brand += 1
        if m:
            model_counter[m] += 1
        else:
            missing_model += 1
        if a:
            app_counter[a] += 1
        else:
            missing_app += 1
        if o:
            os_counter[o] += 1
        if lg:
            lang_counter[lg] += 1

        last = x["row"].last_active or ""
        if _within_days(last, 7):
            active7 += 1
        if _within_days(last, 30):
            active30 += 1

    return {
        "totalDevices": len(rows),
        "totalUsers": len(rows),
        "activeUsers7d": active7,
        "activeUsers30d": active30,
        # 兼容 camelCase 的 7d/30d 写法，前端两套都能取
        "active7d": active7,
        "active30d": active30,
        "brandDist": _top(brand_counter, len(brand_counter) or 1),
        "modelTop": _top(model_counter, topN),
        "appVersionDist": _top(app_counter, len(app_counter) or 1),
        "osVersionDist": _top(os_counter, len(os_counter) or 1),
        "languageDist": _top(lang_counter, len(lang_counter) or 1),
        "missing": {
            "brand": missing_brand,
            "model": missing_model,
            "appVersion": missing_app,
        },
        "topN": topN,
    }


def _csv_cell(v) -> str:
    """CSV 单元格取值（转字符串；None -> 空串）。"""
    if v is None:
        return ""
    return str(v)


# ---------------- 导出 CSV ----------------
@router.get("/devices/export")
def export_devices(brand: str = Query(default=""),
                   model: str = Query(default=""),
                   appVersion: str = Query(default=""),
                   user: User = Depends(_require_admin),
                   db: Session = Depends(get_db)):
    """导出设备明细 CSV（管理员）。

    关键点（中文乱码必须解决）：
      - 文本**前缀 UTF-8 BOM（\\ufeff）**，Excel 才会按 UTF-8 正确解码中文；
      - media_type 用 'text/csv; charset=utf-8'；
      - Content-Disposition 同时给 filename 与 filename*（RFC 5987）以兼容中文名。
    过滤参数与 GET /devices 完全一致；androidId 同样脱敏。
    """
    rows = _load_all(db)
    if brand.strip() or model.strip() or appVersion.strip():
        rows = [x for x in rows if _match(x["dev"], brand, model, appVersion)]

    header = ["用户ID", "用户名", "昵称", "品牌", "型号", "系统版本", "App版本",
              "屏幕", "语言", "androidId(脱敏)", "最近活跃"]

    buf = io.StringIO()
    # QUOTE_MINIMAL + lineterminator=\r\n：Excel / WPS 双兼容。
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(header)
    for x in rows:
        item = _row_from(db, x["row"])
        writer.writerow([
            _csv_cell(item["userId"]),
            _csv_cell(item["username"]),
            _csv_cell(item["nickname"]),
            _csv_cell(item["brand"]),
            _csv_cell(item["model"]),
            _csv_cell(item["osVersion"]),
            _csv_cell(item["appVersion"]),
            _csv_cell(item["screen"]),
            _csv_cell(item["language"]),
            _csv_cell(item["androidId"]),
            _csv_cell(item["lastActive"]),
        ])

    csv_text = buf.getvalue()
    body = ("\ufeff" + csv_text).encode("utf-8")  # UTF-8 BOM，防 Excel 中文乱码
    stamp = _dt.datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"devices_{stamp}.csv"
    disposition = (
        f'attachment; filename="{filename}"; '
        f"filename*=UTF-8''{filename}"
    )
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": disposition,
            "Cache-Control": "no-store",
        },
    )
