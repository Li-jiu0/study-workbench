"""私聊消息 REST：历史分页 / 发送 / 未读数 / 已读回执。

发送后若对方在线，会通过 wsmanager 实时推送；不在线则作为未读入库。
权限：仅好友之间可私聊；任一方拉黑对方都禁止发消息（见 friends.is_blocked）。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import Message, User, get_db, is_friend, now_iso
from routers.friends import is_blocked
from security import get_current_user
from wsmanager import send_to

router = APIRouter(prefix="/api/chat", tags=["chat"])


class SendMsgIn(BaseModel):
    content: str = Field(max_length=5000)
    kind: str = "text"  # text / image


class ReadIn(BaseModel):
    upToId: int = Field(gt=0)


def msg_dict(m: Message) -> dict:
    return {
        "id": m.id,
        "senderId": m.sender_id,
        "receiverId": m.receiver_id,
        "kind": m.kind,
        "content": m.content,
        "createdAt": m.created_at,
        "read": bool(m.read_at),
    }


async def store_and_deliver(db: Session, sender: User, receiver_id: int,
                            kind: str, content: str) -> Message:
    """写库并尝试实时推送给接收方；返回入库后的消息。"""
    m = Message(sender_id=sender.id, receiver_id=receiver_id,
                kind=kind, content=content, read_at=None, created_at=now_iso())
    db.add(m)
    db.commit()
    db.refresh(m)
    await send_to(receiver_id, {"type": "msg", "message": msg_dict(m)})
    return m


@router.get("/{peer_id}/messages")
def list_messages(peer_id: int, before_id: int = 0, limit: int = 30,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """单向会话历史：id 游标向前翻页，返回时间正序，带 hasMore。"""
    if not is_friend(db, user.id, peer_id):
        raise HTTPException(403, "仅好友之间可以查看聊天记录")
    limit = min(max(limit, 1), 100)
    cond = and_(
        or_(
            and_(Message.sender_id == user.id, Message.receiver_id == peer_id),
            and_(Message.sender_id == peer_id, Message.receiver_id == user.id),
        ),
        Message.id < before_id if before_id else True,
    )
    rows = db.query(Message).filter(cond).order_by(Message.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    rows.reverse()  # 时间正序返回
    return {"items": [msg_dict(m) for m in rows], "hasMore": has_more,
            "nextBefore": rows[0].id if has_more and rows else 0}


@router.post("/{peer_id}/messages")
async def send_message(peer_id: int, body: SendMsgIn, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    if not is_friend(db, user.id, peer_id):
        raise HTTPException(403, "仅好友之间可以私聊")
    if is_blocked(db, user.id, peer_id) or is_blocked(db, peer_id, user.id):
        raise HTTPException(403, "无法发送消息（已被限制）")
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "消息不能为空")
    if body.kind not in ("text", "image"):
        body.kind = "text"
    m = await store_and_deliver(db, user, peer_id, body.kind, content)
    return msg_dict(m)


@router.get("/unread")
def unread(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """我的未读私信：按好友汇总。"""
    rows = (
        db.query(Message.receiver_id, Message.sender_id, Message.id,
                Message.kind, Message.content, Message.created_at)
        .filter(Message.receiver_id == user.id, Message.read_at.is_(None))
        .order_by(Message.id.desc())
        .all()
    )
    by_peer: dict[int, dict] = {}
    total = 0
    for recv, sid, mid, kind, content, created in rows:
        p = by_peer.setdefault(sid, {"peerId": sid, "count": 0, "lastId": 0, "last": ""})
        p["count"] += 1
        if mid > p["lastId"]:
            p["lastId"] = mid
            p["last"] = f"[图片]" if kind == "image" else content[:80]
        total += 1
    return {"total": total, "items": sorted(by_peer.values(), key=lambda x: -x["lastId"])}


def do_mark_read(db: Session, peer_id: int, me_id: int, up_to_id: int) -> int:
    """把 peer 发给 me、id <= up_to_id 的未读消息标记为已读；返回更新条数。"""
    res = (
        db.query(Message)
        .filter(Message.sender_id == peer_id, Message.receiver_id == me_id,
                Message.id <= up_to_id, Message.read_at.is_(None))
        .update({"read_at": now_iso()}, synchronize_session=False)
    )
    db.commit()
    return res


@router.post("/{peer_id}/read")
async def mark_read(peer_id: int, body: ReadIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """把 peer 发给我的、id <= upToId 的消息标记已读，并回推“已读回执”。"""
    res = do_mark_read(db, peer_id, user.id, body.upToId)
    if res:
        await send_to(peer_id, {"type": "readReceipt", "peerId": user.id, "upToId": body.upToId})
    return {"ok": True, "marked": res}
