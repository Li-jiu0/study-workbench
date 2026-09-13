"""私聊消息 REST：历史分页 / 发送 / 未读数 / 已读回执。

发送后若对方在线，会通过 wsmanager 实时推送；不在线则作为未读入库。
权限：仅好友之间可私聊；任一方拉黑对方都禁止发消息（见 friends.is_blocked）。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import Message, User, can_message, get_db, is_friend, now_iso
from routers.friends import is_blocked
from security import get_current_user
from wsmanager import send_to

router = APIRouter(prefix="/api/chat", tags=["chat"])


class SendMsgIn(BaseModel):
    content: str = Field(max_length=5000)
    kind: str = "text"  # text / image / voice


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
async def list_messages(peer_id: int, before_id: int = 0, limit: int = 30, mark_read: int = 1,
                        user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """单向会话历史：id 游标向前翻页，返回时间正序，带 hasMore。

    mark_read=1（默认）时实现「拉取即已读」：把对方发给我、id<=会话最新一条
    的未读消息批量置已读，并向对方回推 readReceipt（前端无需再显式调 read 接口；
    POST /{peer_id}/read 保留兼容）。
    """
    # 需求01：好友照旧；任一方是管理员也放行（普通用户可主动给管理员发私信）
    if not can_message(db, user.id, peer_id):
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
    # 拉取即已读：以会话内最新消息 id 为上界推进已读标记
    if mark_read and rows:
        latest_id = max(m.id for m in rows)
        marked = do_mark_read(db, peer_id, user.id, latest_id)
        if marked:
            await send_to(peer_id, {"type": "readReceipt", "peerId": user.id, "upToId": latest_id})
        for m in rows:  # 本地同步已读状态，让本次返回的 read 字段准确
            if m.sender_id == peer_id and not m.read_at:
                m.read_at = now_iso()
    return {"items": [msg_dict(m) for m in rows], "hasMore": has_more,
            "nextBefore": rows[0].id if has_more and rows else 0}


@router.post("/{peer_id}/messages")
async def send_message(peer_id: int, body: SendMsgIn, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    # 需求01：好友照旧；任一方是管理员也放行（普通用户可主动给管理员发私信）
    if not can_message(db, user.id, peer_id):
        raise HTTPException(403, "仅好友之间可以私聊")
    if is_blocked(db, user.id, peer_id) or is_blocked(db, peer_id, user.id):
        raise HTTPException(403, "无法发送消息（已被限制）")
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "消息不能为空")
    # 放行 voice（A7）：kind 列已是 String(16)，无需改表；未知 kind 仍降级为 text（前向兼容）
    if body.kind not in ("text", "image", "voice"):
        body.kind = "text"
    m = await store_and_deliver(db, user, peer_id, body.kind, content)
    return msg_dict(m)


@router.get("/unread")
def unread(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """我的未读私信：按好友汇总（补昵称头像，供会话列表免二次请求渲染角标）。"""
    rows = (
        db.query(Message, User.nickname, User.avatar)
        .join(User, Message.sender_id == User.id)
        .filter(Message.receiver_id == user.id, Message.read_at.is_(None))
        .order_by(Message.id.desc())
        .all()
    )
    by_peer: dict[int, dict] = {}
    total = 0
    for m, nickname, avatar in rows:
        p = by_peer.setdefault(m.sender_id, {
            "peerId": m.sender_id, "count": 0, "lastId": 0, "last": "",
            "nickname": nickname, "avatar": avatar,
        })
        p["count"] += 1
        if m.id > p["lastId"]:
            p["lastId"] = m.id
            # 预览文案：图片 → [图片]，语音 → [语音]，其余按文本（前向兼容未知 kind）
            if m.kind == "image":
                p["last"] = "[图片]"
            elif m.kind == "voice":
                p["last"] = "[语音]"
            else:
                p["last"] = m.content[:80]
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
