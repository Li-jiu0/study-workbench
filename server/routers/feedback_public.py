"""创作者反馈接口（2026-09-13j 批次新增，免登录轻量表单专用）。

与既有 /api/feedbacks（登录用户反馈，SQLite 表）互补、互不影响：
本接口面向「设置页 - 帮助与反馈」的免登录表单，反馈以 JSON 数组
追加写入 server/data/feedback.json（一行一条记录的数组文件）。

路由：
    POST /api/feedback   免登录提交 {nickname, type, content}，成功返回 {"ok": true}
    GET  /api/feedback   创作者查看全部反馈，需请求头 X-Admin-Key == .env 的
                         FEEDBACK_ADMIN_KEY；该 Key 未配置时接口「只写不读」
                         （GET 恒返回 503，POST 不受影响）。

存储格式（data/feedback.json，UTF-8，无 BOM）：
    [ {"id": 1, "createdAt": "...", "nickname": "...", "type": "suggestion",
       "content": "...", "ip": "..."}, ... ]

并发安全：进程内 threading.Lock 串行化读改写；写盘采用临时文件 + os.replace
原子替换，避免写一半被读到脏数据。多进程部署时由 uvicorn 单 worker 保证。
"""
import json
import os
import threading
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import config  # noqa: F401  导入即完成 server/.env 的加载
from database import Feedback, SessionLocal, User, get_db
from security import TYPE_ACCESS, decode_token, get_current_user

router = APIRouter(prefix="/api/feedback", tags=["feedback-public"])

# 管理员查看密钥：仅从 server/.env 读取；为空表示查看功能未启用（只写不读）
ADMIN_KEY = (os.getenv("FEEDBACK_ADMIN_KEY") or "").strip()

# 存储文件：server/data/feedback.json（沿用 config.BASE_DIR，与 data.db 同级）
DATA_FILE = config.BASE_DIR / "data" / "feedback.json"

_write_lock = threading.Lock()


class FeedbackIn(BaseModel):
    """免登录反馈表单的请求体（pydantic 严格校验）。"""

    nickname: str = Field(min_length=1, max_length=20, description="昵称，≤20 字")
    type: Literal["suggestion", "bug", "feature"] = Field(description="反馈类型")
    content: str = Field(min_length=1, max_length=2000, description="反馈正文，≤2000 字")


def _load_all() -> list[dict]:
    """读取全部反馈；文件不存在或损坏时按空列表处理。"""
    if not DATA_FILE.exists():
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save_all(items: list[dict]) -> None:
    """原子写盘：先写临时文件再替换，防止中断留下半截 JSON。"""
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(items, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_FILE)


def _current_user_optional(request: Request) -> User | None:
    """需求01：免登录表单若携带合法 access token，则顺带关联账号。

    拿不到（无 token / token 失效 / 非 access 令牌）一律返回 None，
    **绝不阻断提交** —— 免登录提交必须始终可用。
    """
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    payload = decode_token(auth[7:].strip())
    if not payload or payload.get("typ", TYPE_ACCESS) != TYPE_ACCESS:
        return None
    try:
        uid = int(payload.get("sub") or 0)
    except (TypeError, ValueError):
        return None
    if not uid:
        return None
    db = SessionLocal()
    try:
        return db.get(User, uid)
    finally:
        db.close()


@router.post("")
def submit_feedback(body: FeedbackIn, request: Request, db: Session = Depends(get_db)):
    """免登录提交一条创作者反馈，追加写入 data/feedback.json。

    需求01：若本次请求携带登录 token，额外记录 userId / username 便于后续在
    「我的反馈」里回显；未登录时这两个字段不写入，行为与旧版完全一致。
    """
    client_ip = request.client.host if request.client else "unknown"
    u = _current_user_optional(request)
    with _write_lock:
        items = _load_all()
        record = {
            "id": max((it.get("id", 0) for it in items), default=0) + 1,
            "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "nickname": body.nickname.strip() or body.nickname,
            "type": body.type,
            "content": body.content.strip(),
            "ip": client_ip,
            "status": "pending",
        }
        if u is not None:
            record["userId"] = u.id
            record["username"] = u.username
        items.append(record)
        _save_all(items)
    return {"ok": True}


@router.get("")
def list_feedback(x_admin_key: str = Header(default="")):
    """创作者查看全部反馈（按 id 倒序，最新在前）。

    - .env 未配置 FEEDBACK_ADMIN_KEY：恒返回 503（只写不读）。
    - 请求头 X-Admin-Key 不匹配：返回 401。
    """
    if not ADMIN_KEY:
        raise HTTPException(503, "服务端未配置 FEEDBACK_ADMIN_KEY，反馈查看未启用")
    if x_admin_key.strip() != ADMIN_KEY:
        raise HTTPException(401, "X-Admin-Key 校验失败")
    items = _load_all()
    return {"count": len(items), "items": sorted(items, key=lambda it: it.get("id", 0), reverse=True)}


@router.get("/mine")
def my_feedback(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """需求01：我的反馈（合并两源，含管理员回复 reply）。

    - public 源：data/feedback.json 里携带本账号 userId（或早期仅 username）的记录；
    - account 源：feedbacks 表 user_id == 我的记录。
    字段与 /api/admin/feedback 完全同构（source/key/id/createdAt/type/content/
    status/reply/repliedAt），前端可直接复用同一套渲染。
    """
    items: list[dict] = []
    for it in _load_all():
        owner_ok = (
            (it.get("userId") is not None and it.get("userId") == user.id)
            or (it.get("userId") is None and it.get("username") == user.username)
        )
        if not owner_ok:
            continue
        fid = int(it.get("id", 0) or 0)
        replied_at = it.get("repliedAt") or it.get("replied_at") or ""
        reply = it.get("reply") or ""
        items.append({
            "source": "public",
            "key": f"public-{fid}",
            "id": fid,
            "createdAt": it.get("createdAt") or "",
            "type": it.get("type") or "",
            "content": it.get("content") or "",
            "status": it.get("status") or ("replied" if reply else "pending"),
            "reply": reply,
            "repliedAt": replied_at,
        })
    rows = (
        db.query(Feedback)
        .filter(Feedback.user_id == user.id)
        .order_by(Feedback.id.desc())
        .all()
    )
    for f in rows:
        items.append({
            "source": "account",
            "key": f"account-{f.id}",
            "id": f.id,
            "createdAt": f.created_at or "",
            "type": f.type or "",
            "content": f.content or "",
            "status": f.status or "pending",
            "reply": f.reply or "",
            "repliedAt": f.replied_at or "",
        })
    items.sort(key=lambda x: (x.get("createdAt") or ""), reverse=True)
    return {"items": items, "total": len(items)}
