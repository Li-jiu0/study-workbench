"""WebSocket 私聊通道：/ws/chat?token=<access JWT>

协议（JSON 文本帧）：
  客户端 → 服务端：
    {"type":"ping"}                                 心跳（每 ~25s）
    {"type":"msg","to":<userId>,"content":"..","kind":"text|image"}
    {"type":"read","peer":<userId>,"upToId":<消息id>} 已读回执
  服务端 → 客户端：
    {"type":"hello","userId":..}                    建立成功
    {"type":"msg","message":{...}}                  新消息（含自己发的回显）
    {"type":"readReceipt","peerId":..,"upToId":..}  对方已读
    {"type":"pong"} / {"type":"error","detail":".."}

心跳由客户端定时发送；服务端 120s 内收不到任何帧则断开（客户端会自动重连）。
"""
import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from database import SessionLocal, User, is_friend
from routers.chat import (do_mark_read, msg_dict, store_and_deliver)
from routers.friends import is_blocked
from security import TYPE_ACCESS, decode_token
from wsmanager import register, send_to, unregister

router = APIRouter()
_RECV_TIMEOUT = 120.0


def _authed_uid(ws: WebSocket) -> int | None:
    payload = decode_token(ws.query_params.get("token", ""))
    if not payload or payload.get("typ", TYPE_ACCESS) != TYPE_ACCESS:
        return None
    try:
        return int(payload.get("sub") or 0)
    except (TypeError, ValueError):
        return None


async def _handle_msg(uid: int, msg: dict) -> None:
    to = int(msg.get("to") or 0)
    kind = msg.get("kind") if msg.get("kind") in ("text", "image") else "text"
    content = str(msg.get("content") or "").strip()
    if not to or to == uid or not content:
        return
    if len(content) > 5000:
        content = content[:5000]
    db = SessionLocal()
    try:
        if not is_friend(db, uid, to):
            await send_to(uid, {"type": "error", "detail": "仅好友之间可以私聊"})
            return
        if is_blocked(db, uid, to) or is_blocked(db, to, uid):
            await send_to(uid, {"type": "error", "detail": "无法发送消息（已被限制）"})
            return
        m = await store_and_deliver(db, db.get(User, uid), to, kind, content)
        await send_to(uid, {"type": "msg", "message": msg_dict(m)})  # 自己的回显
    finally:
        db.close()


async def _handle_read(uid: int, msg: dict) -> None:
    peer = int(msg.get("peer") or 0)
    up = int(msg.get("upToId") or 0)
    if not peer or up <= 0:
        return
    db = SessionLocal()
    try:
        if do_mark_read(db, peer, uid, up):
            await send_to(peer, {"type": "readReceipt", "peerId": uid, "upToId": up})
    finally:
        db.close()


@router.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    uid = _authed_uid(ws)
    if not uid:
        await ws.close(code=4401, reason="未授权")
        return
    db = SessionLocal()
    try:
        if not db.get(User, uid):
            await ws.close(code=4401, reason="账号不存在")
            return
    finally:
        db.close()
    await ws.accept()
    await register(uid, ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "userId": uid}, ensure_ascii=False))
        while True:
            raw = await asyncio.wait_for(ws.receive_text(), timeout=_RECV_TIMEOUT)
            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            t = msg.get("type")
            if t == "ping":
                await ws.send_text('{"type":"pong"}')
            elif t == "msg":
                await _handle_msg(uid, msg)
            elif t == "read":
                await _handle_read(uid, msg)
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        await unregister(uid, ws)
