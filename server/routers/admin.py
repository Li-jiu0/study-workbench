"""需求01：管理员超级账号 —— 观察台 + 反馈处理（后端，2026-09-13）。

单向可见原则（本需求验收核心）：
  - 管理员**不参与**任何普通用户可见的列表（好友 / 搜索 / 在线状态 / 公开主页 /
    动态 / 留言板…），过滤动作在各业务路由里完成（见 friends.py / users.py /
    moments.py / social.py 的 is_admin 过滤）。
  - 反向**完全放开**：本模块不做任何过滤，管理员可查看所有用户的真实资料与状态。

路由（全部要求「已登录 + is_admin」，否则 403）：
    GET  /api/admin/overview              → {totalUsers, activeToday, onlineCount}
    GET  /api/admin/users                 → 全部用户（新注册自动纳入，无需白名单）
    GET  /api/admin/users/{user_id}       → 单个用户资料详情
    GET  /api/admin/online                → 在线用户列表
    GET  /api/admin/feedback              → 合并两源反馈（public + account）
    POST /api/admin/feedback/{id}/reply   → 回复某条反馈

启动初始化：ensure_admin_user() —— 保证管理员账号存在且 is_admin=1；
密码取自环境变量 ADMIN_PASSWORD（未设置时用内置默认密码并打印一次警告，
警告不含任何密码内容）。
"""
import datetime as _dt
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import config
from database import (Feedback, Note, SessionLocal, StudyLog, User, get_db,
                      is_admin_user, now_iso, now_str)
from routers import feedback_public
from security import get_current_user, hash_password, verify_password

router = APIRouter(prefix="/api/admin", tags=["admin"])

# 在线判定：近 10 分钟有活动（需求01 指定口径）。
# 注意：users.py 的 ONLINE_THRESHOLD_SECONDS（5 分钟）是普通用户侧既有口径，
# 前端 P0-6 在线展示依赖它，此处刻意不复用、不改动。
ONLINE_WINDOW_SECONDS = 10 * 60

_TS_FORMAT = "%Y-%m-%d %H:%M:%S"

# 未设置环境变量时的兜底密码（仅首次创建账号时写入；不写进文档，日志不打印其值）
_ADMIN_DEFAULT_PASSWORD = "Admin@2026"
_admin_password_warned = False


# ---------------- 启动初始化 ----------------
def ensure_admin_user() -> None:
    """保证管理员账号存在且 is_admin=1（幂等，可重复调用）。

    密码策略：
      - 设置了环境变量 ADMIN_PASSWORD → 每次启动与库内密码比对，不一致则同步
        （支持运维直接改环境变量轮换密码）；
      - 未设置 → 仅在该账号首次创建时使用内置默认密码，已存在则保持原密码不变，
        并打印一次警告（只提示未配置，不输出密码）。
    """
    global _admin_password_warned
    username = (config.ADMIN_USERNAME or "").strip() or "管理员"
    env_pwd = (config.ADMIN_PASSWORD or "").strip()
    use_default = not env_pwd
    pwd = env_pwd or _ADMIN_DEFAULT_PASSWORD

    db = SessionLocal()
    try:
        u = db.query(User).filter(User.username == username).first()
        if u is None:
            u = User(
                username=username,
                password_hash=hash_password(pwd),
                nickname=username,
                motto="",
                avatar=None,
                created_at=now_str(),
                is_admin=True,
            )
            db.add(u)
            db.commit()
            db.refresh(u)
        else:
            changed = False
            if not is_admin_user(u):
                u.is_admin = True
                changed = True
            if not use_default and not verify_password(pwd, u.password_hash):
                u.password_hash = hash_password(pwd)
                changed = True
            if changed:
                db.commit()
        if use_default and not _admin_password_warned:
            _admin_password_warned = True
            print("[WARN] 未设置环境变量 ADMIN_PASSWORD，管理员账号沿用内置默认密码，"
                  "请尽快在服务器环境变量中配置 ADMIN_PASSWORD 并重启服务。")
    finally:
        db.close()


# ---------------- 鉴权 ----------------
def _require_admin(user: User = Depends(get_current_user)) -> User:
    """已登录 + is_admin，否则 403（未登录由 get_current_user 先抛 401）。"""
    if not is_admin_user(user):
        raise HTTPException(403, "仅管理员可访问")
    return user


# ---------------- 公共小工具 ----------------
def _parse_ts(value: Optional[str]) -> Optional[_dt.datetime]:
    """解析 last_seen_at（'YYYY-MM-DD HH:MM:SS'）；空/非法返回 None。"""
    if not value:
        return None
    try:
        return _dt.datetime.strptime(value, _TS_FORMAT)
    except ValueError:
        return None


def _is_online(u: User) -> bool:
    """近 10 分钟有活动即在线。"""
    t = _parse_ts(getattr(u, "last_seen_at", "") or "")
    if t is None:
        return False
    return (_dt.datetime.now() - t).total_seconds() <= ONLINE_WINDOW_SECONDS


def _user_row(db: Session, u: User) -> dict:
    """用户行：id/username/nickname/创建时间/活跃时间/在线/管理员 + 简要统计。

    时间类字段 camelCase 与 snake_case 双写，兼容不同调用方。
    """
    last = getattr(u, "last_seen_at", "") or ""
    online = _is_online(u)
    admin = is_admin_user(u)
    notes = db.query(Note).filter(Note.user_id == u.id, Note.deleted_at.is_(None)).count()
    study = db.query(StudyLog).filter(StudyLog.user_id == u.id).count()
    return {
        "id": u.id,
        "username": u.username,
        "nickname": u.nickname,
        "createdAt": u.created_at,
        "created_at": u.created_at,
        "lastActive": last,
        "last_active": last,
        "isOnline": online,
        "is_online": online,
        "isAdmin": admin,
        "is_admin": admin,
        "stats": {"notes": notes, "studyEvents": study},
    }


# ---------------- 观察台 ----------------
@router.get("/overview")
def overview(user: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """总览：总用户数 / 今日活跃数 / 当前在线数。

    三个口径均含管理员账号自身（管理员也是库里的一行，保持与 /users 列表一致）。
    """
    users = db.query(User).all()
    today_str = _dt.datetime.now().strftime("%Y-%m-%d")
    active_today = 0
    online = 0
    for u in users:
        last = getattr(u, "last_seen_at", "") or ""
        if last.startswith(today_str):
            active_today += 1
        if _is_online(u):
            online += 1
    return {
        "totalUsers": len(users),
        "activeToday": active_today,
        "onlineCount": online,
        "onlineWindowSeconds": ONLINE_WINDOW_SECONDS,
    }


@router.get("/users")
def list_users(user: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """全部用户（新注册用户自动纳入观察范围，无需任何白名单维护）。"""
    rows = db.query(User).order_by(User.id.asc()).all()
    return {"items": [_user_row(db, u) for u in rows], "total": len(rows)}


@router.get("/online")
def list_online(user: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """在线用户（近 10 分钟有活动）。"""
    rows = db.query(User).order_by(User.id.asc()).all()
    items = [r for r in (_user_row(db, u) for u in rows) if r["isOnline"]]
    return {"items": items, "total": len(items), "onlineWindowSeconds": ONLINE_WINDOW_SECONDS}


@router.get("/users/{user_id}")
def user_detail(user_id: int, user: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """单个用户资料详情（管理员可看全、看真；绝不含密码哈希）。"""
    t = db.get(User, user_id)
    if not t:
        raise HTTPException(404, "用户不存在")
    return {
        **_user_row(db, t),
        "motto": t.motto,
        "bio": t.bio or "",
        "gender": t.gender or "secret",
        "birthday": t.birthday or "",
        "city": t.city or "",
        "phone": t.phone or "",
        "goal": t.goal or "",
        "tags": t.tags or "",
        "avatarUrl": t.avatar,
    }


# ---------------- 反馈处理 ----------------
class ReplyIn(BaseModel):
    reply: str = Field(min_length=1, max_length=2000)


def _public_item(it: dict) -> dict:
    """免登录反馈（feedback.json 一条）→ 统一结构。"""
    fid = int(it.get("id", 0) or 0)
    replied_at = it.get("repliedAt") or it.get("replied_at") or ""
    reply = it.get("reply") or ""
    return {
        "source": "public",
        "key": f"public-{fid}",
        "id": fid,
        "createdAt": it.get("createdAt") or it.get("created_at") or "",
        "created_at": it.get("createdAt") or it.get("created_at") or "",
        "nickname": it.get("nickname") or "",
        "username": it.get("username") or "",
        "userId": it.get("userId") if it.get("userId") is not None else it.get("user_id"),
        "type": it.get("type") or "",
        "content": it.get("content") or "",
        "status": it.get("status") or ("replied" if reply else "pending"),
        "reply": reply,
        "repliedAt": replied_at,
        "replied_at": replied_at,
    }


def _account_item(f: Feedback, db: Session) -> dict:
    """登录用户反馈（feedbacks 表一行）→ 统一结构。"""
    u = db.get(User, f.user_id) if f.user_id else None
    return {
        "source": "account",
        "key": f"account-{f.id}",
        "id": f.id,
        "createdAt": f.created_at or "",
        "created_at": f.created_at or "",
        "nickname": u.nickname if u else "",
        "username": u.username if u else "",
        "userId": f.user_id,
        "type": f.type or "",
        "content": f.content or "",
        "status": f.status or "pending",
        "reply": f.reply or "",
        "repliedAt": f.replied_at or "",
        "replied_at": f.replied_at or "",
    }


@router.get("/feedback")
def list_feedback(user: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """合并两源反馈：免登录 public（feedback.json）+ 登录 account（feedbacks 表）。

    两源 id 空间独立，用 source + id 唯一定位；key 字段（如 'public-3'）是拼好的
    全局唯一标识，可直接用于回复接口路径。
    """
    items: list[dict] = [_public_item(it) for it in feedback_public._load_all()]
    rows = db.query(Feedback).order_by(Feedback.id.desc()).all()
    items.extend(_account_item(f, db) for f in rows)
    items.sort(key=lambda x: (x.get("createdAt") or ""), reverse=True)
    return {"items": items, "total": len(items)}


def _split_feedback_id(feedback_id: str, source: str) -> tuple[str, int]:
    """解析回复目标的 (source, id)。

    支持两种写法：
      - 复合 id：'public-3' / 'account-7'（列表接口返回的 key 即此形式）
      - 纯数字 id + ?source=public|account
    """
    raw = (feedback_id or "").strip()
    src = (source or "").strip().lower()
    if raw.startswith("public-") or raw.startswith("account-"):
        src, _, raw = raw.partition("-")
    if src not in ("public", "account"):
        raise HTTPException(400, "需指定反馈来源：source=public|account（或用 public-1 / account-1 形式的 id）")
    try:
        fid = int(raw)
    except ValueError:
        raise HTTPException(400, "反馈 id 不合法")
    if fid <= 0:
        raise HTTPException(400, "反馈 id 不合法")
    return src, fid


@router.post("/feedback/{feedback_id}/reply")
def reply_feedback(feedback_id: str, body: ReplyIn, source: str = Query(default=""),
                   user: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """管理员回复一条反馈 → 写 reply / replied_at，status 置为已处理（replied）。

    public 源走 feedback.json（沿用其原子写 + UTF-8 无 BOM），account 源走 feedbacks 表。
    """
    src, fid = _split_feedback_id(feedback_id, source)
    reply = (body.reply or "").strip()
    if not reply:
        raise HTTPException(400, "回复内容不能为空")
    at = now_iso()

    if src == "public":
        with feedback_public._write_lock:
            items = feedback_public._load_all()
            hit = None
            for it in items:
                if int(it.get("id", 0) or 0) == fid:
                    hit = it
                    break
            if hit is None:
                raise HTTPException(404, "反馈不存在")
            hit["reply"] = reply
            hit["repliedAt"] = at
            hit["replied_at"] = at
            hit["status"] = "replied"
            feedback_public._save_all(items)
        return {"ok": True, "source": src, "id": fid, "status": "replied", "repliedAt": at}

    f = db.get(Feedback, fid)
    if not f:
        raise HTTPException(404, "反馈不存在")
    f.reply = reply
    f.replied_at = at
    f.status = "replied"
    db.commit()
    return {"ok": True, "source": src, "id": fid, "status": "replied", "repliedAt": at}
