"""互动：点赞 / 收藏 / 评论 / 消息通知（点赞评论提醒笔记作者）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import (BoardLike, BoardMessage, BoardReply, Comment, Favorite, Like, Note, Notification, User,
                      get_db, now_str)
from schemas import CommentIn
from security import get_current_user

router = APIRouter(tags=["social"])


def _visible_note(note_id: int, user: User, db: Session) -> Note:
    n = db.get(Note, note_id)
    if not n or n.deleted_at:  # 软删除视为不存在，禁止互动
        raise HTTPException(404, "笔记不存在")
    if n.user_id != user.id and not (n.status == "published" and n.privacy == "public"):
        raise HTTPException(403, "该笔记不可互动")
    return n


def _notify(db: Session, recipient: Note, actor: User, ntype: str):
    """给笔记作者写一条通知（自己的笔记自己点赞/评论不提醒）。"""
    if recipient.user_id == actor.id:
        return
    db.add(Notification(
        user_id=recipient.user_id,
        actor_id=actor.id,
        type=ntype,
        note_id=recipient.id,
        is_read=False,
        created_at=now_str(),
    ))


@router.post("/api/notes/{note_id}/like")
def toggle_like(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = _visible_note(note_id, user, db)
    exist = db.query(Like).filter(Like.note_id == n.id, Like.user_id == user.id).first()
    if exist:
        db.delete(exist)
        n.likes_count = max(0, n.likes_count - 1)
        liked = False
    else:
        db.add(Like(note_id=n.id, user_id=user.id, created_at=now_str()))
        n.likes_count += 1
        liked = True
        _notify(db, n, user, "like")
    db.commit()
    return {"liked": liked, "likes": n.likes_count}


@router.post("/api/notes/{note_id}/favorite")
def toggle_favorite(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = _visible_note(note_id, user, db)
    exist = db.query(Favorite).filter(Favorite.note_id == n.id, Favorite.user_id == user.id).first()
    if exist:
        db.delete(exist)
        favorited = False
    else:
        db.add(Favorite(note_id=n.id, user_id=user.id, created_at=now_str()))
        favorited = True
    db.commit()
    return {"favorited": favorited}


@router.get("/api/notes/{note_id}/comments")
def list_comments(note_id: int, offset: int = 0, limit: int = 50,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = _visible_note(note_id, user, db)
    all_rows = sorted(n.comments, key=lambda c: c.id)  # 旧→新
    total = len(all_rows)
    page_rows = list(reversed(all_rows))[offset:offset + min(max(limit, 1), 100)]  # 新→旧
    return {"comments": [
        # 空值防御（2026-09-11 热修）：作者已注销时 c.author 为 None，避免 AttributeError 500。
        {"id": c.id, "userId": c.user_id,
         "nickname": c.author.nickname if c.author else "已注销用户",
         "avatarUrl": c.author.avatar if c.author else None,
         "text": c.content, "time": c.created_at}
        for c in page_rows
    ], "total": total, "hasMore": offset + len(page_rows) < total}


@router.post("/api/notes/{note_id}/comments")
def add_comment(note_id: int, body: CommentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = _visible_note(note_id, user, db)
    parent_id = body.parent_id
    if parent_id:
        parent = db.get(Comment, parent_id)
        if not parent or parent.note_id != n.id:
            parent_id = None
    c = Comment(note_id=n.id, user_id=user.id, content=body.content.strip(), created_at=now_str(), parent_id=parent_id)
    db.add(c)
    n.comments_count += 1
    _notify(db, n, user, "comment")
    db.commit()
    return {"id": c.id, "userId": user.id, "nickname": user.nickname,
            "avatarUrl": user.avatar, "text": c.content, "time": c.created_at, "parentId": parent_id}


@router.delete("/api/comments/{comment_id}")
def delete_comment(comment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """允许删除自己的评论，或删除自己笔记下他人的评论。"""
    c = db.get(Comment, comment_id)
    if not c:
        raise HTTPException(404, "评论不存在")
    n = c.note
    if c.user_id != user.id and (not n or n.user_id != user.id):
        raise HTTPException(403, "只能删除自己的评论或自己笔记下的评论")
    db.delete(c)
    if n:
        n.comments_count = max(0, n.comments_count - 1)
    db.commit()
    return {"ok": True}


@router.get("/api/notifications")
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(50)
        .all()
    )
    return {"items": [
        {
            "id": x.id,
            "type": x.type,
            "actor": x.actor.nickname if x.actor else "已注销用户",
            "noteId": x.note_id,
            "noteTitle": x.note.title if x.note else (
                "（动态已删除）" if str(x.type or "").startswith("moment") else "（笔记已删除）"),
            "isRead": bool(x.is_read),
            "createdAt": x.created_at,
        }
        for x in rows
    ], "unread": sum(1 for x in rows if not x.is_read)}


@router.post("/api/notifications/read-all")
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id).update({"is_read": True})
    db.commit()
    return {"ok": True}


# ========== 学习留言板（公开，所有人可见） ==========
@router.get("/api/board")
def list_board(offset: int = 0, limit: int = 50,
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(BoardMessage)
        # 需求01：管理员单向可见——其留言不出现在公开留言板（LEFT JOIN 兼容无作者脏数据）
        .outerjoin(User, BoardMessage.user_id == User.id)
        .filter(or_(User.id.is_(None), User.is_admin.is_(None), User.is_admin.is_(False)))
        .order_by(BoardMessage.id.desc())
        .offset(offset)
        .limit(min(max(limit, 1), 100))
        .all()
    )
    total = (
        db.query(BoardMessage)
        .outerjoin(User, BoardMessage.user_id == User.id)
        .filter(or_(User.id.is_(None), User.is_admin.is_(None), User.is_admin.is_(False)))
        .count()
    )
    liked_ids = set()
    if rows:
        liked_rows = db.query(BoardLike.message_id).filter(
            BoardLike.user_id == user.id,
            BoardLike.message_id.in_([m.id for m in rows])
        ).all()
        liked_ids = set(r[0] for r in liked_rows)
    return {
        "items": [
            {
                "id": m.id,
                "userId": m.user_id,
                "nickname": m.author.nickname if m.author else "已注销",
                "avatarUrl": m.author.avatar if m.author else None,
                "content": m.content,
                "time": m.created_at,
                "isMine": m.user_id == user.id,
                "likes": m.likes_count or 0,
                "replies": m.replies_count or 0,
                "liked": m.id in liked_ids,
            }
            for m in rows
        ],
        "total": total,
        "hasMore": offset + len(rows) < total,
    }


@router.post("/api/board")
def add_board(body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(400, "留言内容不能为空")
    if len(content) > 500:
        raise HTTPException(400, "留言不能超过500字")
    m = BoardMessage(user_id=user.id, content=content, created_at=now_str())
    db.add(m)
    db.commit()
    db.refresh(m)
    return {
        "id": m.id,
        "userId": user.id,
        "nickname": user.nickname,
        "avatarUrl": user.avatar,
        "content": m.content,
        "time": m.created_at,
        "isMine": True,
    }


@router.delete("/api/board/{msg_id}")
def delete_board(msg_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(BoardMessage, msg_id)
    if not m:
        raise HTTPException(404, "留言不存在")
    if m.user_id != user.id:
        raise HTTPException(403, "只能删除自己的留言")
    db.delete(m)
    db.commit()
    return {"ok": True}


# ========== 留言板点赞 ==========
@router.post("/api/board/{msg_id}/like")
def toggle_board_like(msg_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(BoardMessage, msg_id)
    if not m:
        raise HTTPException(404, "留言不存在")
    exist = db.query(BoardLike).filter(BoardLike.message_id == msg_id, BoardLike.user_id == user.id).first()
    if exist:
        db.delete(exist)
        m.likes_count = max(0, (m.likes_count or 0) - 1)
        liked = False
    else:
        db.add(BoardLike(message_id=msg_id, user_id=user.id, created_at=now_str()))
        m.likes_count = (m.likes_count or 0) + 1
        liked = True
    db.commit()
    return {"liked": liked, "likes": m.likes_count}


# ========== 留言板回复 ==========
@router.get("/api/board/{msg_id}/replies")
def list_board_replies(msg_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(BoardMessage, msg_id)
    if not m:
        raise HTTPException(404, "留言不存在")
    rows = db.query(BoardReply).filter(BoardReply.message_id == msg_id).order_by(BoardReply.id.asc()).all()
    return {
        "items": [
            {
                "id": r.id,
                "userId": r.user_id,
                "nickname": r.author.nickname if r.author else "已注销",
                "avatarUrl": r.author.avatar if r.author else None,
                "content": r.content,
                "time": r.created_at,
                "isMine": r.user_id == user.id,
            }
            for r in rows
        ]
    }


@router.post("/api/board/{msg_id}/replies")
def add_board_reply(msg_id: int, body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(BoardMessage, msg_id)
    if not m:
        raise HTTPException(404, "留言不存在")
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(400, "回复内容不能为空")
    if len(content) > 300:
        raise HTTPException(400, "回复不能超过300字")
    r = BoardReply(message_id=msg_id, user_id=user.id, content=content, created_at=now_str())
    db.add(r)
    m.replies_count = (m.replies_count or 0) + 1
    db.commit()
    return {
        "id": r.id,
        "userId": user.id,
        "nickname": user.nickname,
        "avatarUrl": user.avatar,
        "content": r.content,
        "time": r.created_at,
        "isMine": True,
    }


@router.delete("/api/board/replies/{reply_id}")
def delete_board_reply(reply_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(BoardReply, reply_id)
    if not r:
        raise HTTPException(404, "回复不存在")
    if r.user_id != user.id:
        raise HTTPException(403, "只能删除自己的回复")
    m = db.get(BoardMessage, r.message_id)
    if m:
        m.replies_count = max(0, (m.replies_count or 0) - 1)
    db.delete(r)
    db.commit()
    return {"ok": True}


# ========== TTS 代理（避免浏览器 CORS） ==========
import re as _re
import httpx
from urllib.parse import quote as _quote
from fastapi import Response
# 修复（T07 隔离实跑暴露）：JSONResponse 应来自 fastapi.responses 这一稳定公开路径；
# 新版 FastAPI（0.141.x）已不再从顶层 re-export，`from fastapi import JSONResponse`
# 会直接 ImportError，导致整个应用无法启动（requirements 为 fastapi>=0.110 未锁版本，
# 全新安装即触发）。改用 fastapi.responses 后新旧版本通吃。
from fastapi.responses import JSONResponse

# 送上游前保留的字符：中文（含扩展A）、字母、数字、空格、连字符、ASCII 撇号；
# 其余标点/符号一律折叠为空格再合并，规避有道 dictvoice 对带标点整句的上游 500。
_TTS_KEEP_RE = _re.compile(r"[^0-9A-Za-z\u4e00-\u9fff\u3400-\u4dbf \-']")
_TTS_SPACE_RE = _re.compile(r"\s+")


def sanitize_tts_text(text: str) -> str:
    """清洗 TTS 文本，返回可供上游 dictvoice 安全消费的字符串。

    规则：标点/符号（? , . ! ; : " ` ( ) [ ] { } # $ % & * + = ~ ^ | < > / \\ 等）
    统一折叠为空格；仅保留中文/字母/数字/空格/连字符/撇号；最后折叠多空格并 strip。
    返回空字符串表示清洗后无有效内容（调用方应返回 400）。
    """
    if not text:
        return ""
    cleaned = text.replace("\u3000", " ")  # 全角空格
    cleaned = _TTS_KEEP_RE.sub(" ", cleaned)
    cleaned = _TTS_SPACE_RE.sub(" ", cleaned).strip()
    return cleaned


async def _fetch_youdao_voice(piece: str, tts_type: str) -> bytes | None:
    """请求有道 dictvoice，成功返回音频字节，失败返回 None（不抛异常）。"""
    url = ("https://dict.youdao.com/dictvoice?audio=" + _quote(piece, safe="")
           + "&type=" + tts_type)
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        if r.status_code == 200 and r.content:
            return r.content
    return None


@router.get("/api/tts")
async def tts_proxy(text: str = "", lang: str = "en"):
    """代理有道词典 TTS，避免浏览器跨域问题。

    - 送上游前用 sanitize_tts_text 清洗标点，规避 dictvoice 对带标点文本的上游 500；
    - 首选音色失败时改用另一音色重试一次；
    - 两次均失败返回 502 + {"error":"tts_unavailable"}，绝不向上游 500 透传。
    """
    if not text:
        return Response(status_code=400, content="text required")
    piece = sanitize_tts_text(text[:150])
    if not piece:
        return Response(status_code=400, content="text required")

    is_zh = "zh" in lang.lower() or "cn" in lang.lower()
    # 有道 dictvoice：type=2 为英音、type=1 为美音。中文用英音无意义；英文走美音（type=1）。
    primary = "2" if is_zh else "1"
    fallback = "1" if primary == "2" else "2"

    for tts_type in (primary, fallback):
        try:
            content = await _fetch_youdao_voice(piece, tts_type)
        except Exception:
            content = None
        if content:
            return Response(
                content=content,
                media_type="audio/mpeg",
                headers={"Cache-Control": "public, max-age=86400"}
            )
    return JSONResponse(status_code=502, content={"error": "tts_unavailable"})
