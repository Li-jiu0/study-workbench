"""私聊消息 REST：历史分页 / 发送 / 未读数 / 已读回执。

发送后若对方在线，会通过 wsmanager 实时推送；不在线则作为未读入库。
权限：仅好友之间可私聊；任一方拉黑对方都禁止发消息（见 friends.is_blocked）。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from database import (ChatGroup, ChatGroupMember, FriendRemark, Message, User,
                     can_message, friend_ids_of, get_db, is_admin_user,
                     is_friend, now_iso)
# R170：发内容前的封禁 / 禁言闸门（moderation 模块由 R170-A 落地）
from moderation import assert_can_post
from routers.friends import is_blocked
from schemas import ReplyIn, clamp_duration
from security import get_current_user
from wsmanager import send_to

router = APIRouter(prefix="/api/chat", tags=["chat"])


class SendMsgIn(BaseModel):
    content: str = Field(max_length=5000)
    kind: str = "text"  # text / image / voice / location / location_live
    # R104 项3（位置消息）：可选坐标字段；非位置消息 / 旧前端不传 → 默认空值，零影响
    sub: str = ""
    lat: float | None = None
    lng: float | None = None
    # R104d 批4：True=用户实时精确定位（「我的位置」）；False/缺省 = 用户选择的地点或旧消息
    precise: bool = False
    # 语音消息时长（秒）：可选；经 clamp_duration 夹取 1~600，缺省 None。
    # 仅前端语音条（kind=voice）携带；文本/图片/位置消息不传 → None，行为零变化。
    duration: int | None = None
    # R3b-C U9：可选引用快照；旧前端不传 → None，行为零变化。
    reply: ReplyIn | None = None

    @field_validator("duration")
    @classmethod
    def _clamp_duration(cls, v):
        return clamp_duration(v)


class ReadIn(BaseModel):
    upToId: int = Field(gt=0)


_REPLY_PLACEHOLDER = {"text": "", "image": "[图片]", "voice": "[语音]",
                      "location": "[位置]", "file": "[文件]", "location_live": "[实时位置]"}


def _reply_preview(kind: str, content: str, sub: str = "") -> str:
    """R3b-C U9：被引用消息的展示摘要（≤100 字）。

    - text：取正文前 100 字；空则回退「[消息]」；
    - image/voice/location/file/location_live：用固定占位（图片 / 语音 / 位置 / 文件 / 实时位置）；
    - location 若带地名（content），用「[位置] 地名」；
    - file 名若有（存在 content），用「[文件] 名」。
    """
    k = (kind or "text")
    c = (content or "").strip()
    if k == "image":
        return "[图片]"
    if k == "voice":
        return "[语音]"
    if k == "location_live":
        return "[实时位置]"
    if k == "location":
        return ("[位置] " + c)[:100] if c else "[位置]"
    if k == "file":
        return ("[文件] " + c)[:100] if c else "[文件]"
    return (c[:100] if c else "[消息]")


def msg_dict(m: Message) -> dict:
    d = {
        "id": m.id,
        "senderId": m.sender_id,
        "receiverId": m.receiver_id,
        "kind": m.kind,
        "content": m.content,
        # R104 项3：位置字段；旧消息 / 非位置消息返回 sub: 、lat/lng:null（前端纯文字回退）
        "sub": getattr(m, "sub", "") or "",
        "lat": getattr(m, "lat", None),
        "lng": getattr(m, "lng", None),
        "precise": bool(getattr(m, "precise", False)),
        # 语音时长（秒）：无值 / 旧消息 / 非语音返回 null，前端按需显示占位
        "duration": getattr(m, "duration", None),
        "createdAt": m.created_at,
        "read": bool(m.read_at),
    }
    # R3b-C U9：引用字段。老消息无该四列（NULL）→ reply 为 None，前端按普通消息渲染。
    rtid = getattr(m, "reply_to_id", None)
    if rtid:
        d["reply"] = {
            "toId": rtid,
            "senderName": getattr(m, "reply_sender_name", None) or "",
            "kind": getattr(m, "reply_kind", None) or "text",
            "text": getattr(m, "reply_text", None) or "",
        }
    else:
        d["reply"] = None
    return d


def resolve_reply(db: Session, reply, sender: User, peer_id: int | None,
                  group_id: int | None) -> tuple[int | None, str, str, str]:
    """R3b-C U9：校验并构造引用快照（私聊 + 群聊共用）。

    规则（**非法引用一律忽略，不报错**）：
      1. reply 为空 / toId 非法 → 返回空快照（四值全空）；
      2. 被引用消息必须存在；
      3. 被引用消息必须属于【同一会话】：私聊（group_id IS NULL 且双方对端一致）
         或同一群（group_id 相同）；否则忽略。
    返回 (reply_to_id, sender_name, kind, text)；快照优先取真实被引用消息，
    取不到时回退前端提交的快照（降级展示），但 toId 仍写真实 id（此处即非法则不写）。
    """
    if not reply or not getattr(reply, "toId", None):
        return (None, "", "", "")
    try:
        to_id = int(reply.toId)
    except (TypeError, ValueError):
        return (None, "", "", "")
    src = db.get(Message, to_id)
    if src is None:
        return (None, "", "", "")
    if group_id is not None:
        # 群聊：必须同群
        if src.group_id != group_id:
            return (None, "", "", "")
    else:
        # 私聊：必须 group_id 为空，且双方对端一致（不区分方向）
        if src.group_id is not None:
            return (None, "", "", "")
        pair_ok = (
            (src.sender_id == sender.id and src.receiver_id == peer_id) or
            (src.sender_id == peer_id and src.receiver_id == sender.id)
        )
        if not pair_ok:
            return (None, "", "", "")
    # 快照：优先真实被引用消息（kind / 摘要 / 发送者昵称）
    sn = db.get(User, src.sender_id)
    sender_name = (sn.nickname if sn else "已注销用户") or "已注销用户"
    kind = src.kind or "text"
    text = _reply_preview(kind, src.content, getattr(src, "sub", "") or "")
    return (to_id, sender_name[:64], kind, text[:100])


async def store_and_deliver(db: Session, sender: User, receiver_id: int,
                            kind: str, content: str, sub: str = "",
                            lat: float | None = None, lng: float | None = None,
                            precise: bool = False,
                            duration: int | None = None,
                            reply: tuple[int | None, str, str, str] | None = None) -> Message:
    """写库并尝试实时推送给接收方；返回入库后的消息。

    R104 项3：新增可选 sub / lat / lng，仅位置消息携带；其余消息恒为 '' / None。
    ws.py 既有的 5 参调用保持兼容（新增参数均有默认值）。
    R104d 批4：新增可选 precise（True=用户实时精确定位；False/缺省=选的地点或旧消息）。
    R3b-C U9：新增可选 reply（已解析的引用快照元组），缺省 None → 四列全 NULL，零影响。
    """
    rid, rname, rkind, rtext = reply if reply else (None, "", "", "")
    m = Message(sender_id=sender.id, receiver_id=receiver_id,
                kind=kind, content=content, sub=sub or "", lat=lat, lng=lng,
                precise=precise, duration=duration,
                reply_to_id=rid, reply_sender_name=(rname or None),
                reply_kind=(rkind or None), reply_text=(rtext or None),
                read_at=None, created_at=now_iso())
    db.add(m)
    db.commit()
    db.refresh(m)
    await send_to(receiver_id, {"type": "msg", "message": msg_dict(m)})
    return m


async def send_live_card(db: Session, sender: User, peer_id: int,
                         content: str, share_id: str) -> Message:
    """批5：落一条实时位置共享系统卡片（kind=location_live，sub=shareId）。

    卡片**不含任何坐标**（坐标流走 /api/live/tick，绝不落库）；
    到期自动结束不调用本函数（避免「幽灵」已结束卡片）。
    """
    return await store_and_deliver(db, sender, peer_id, "location_live", content,
                                   sub=share_id)


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
    assert_can_post(user)  # R170：封禁 / 禁言拦截（仅拦「发送」，不拦读消息 / 已读回执）
    # 需求01：好友照旧；任一方是管理员也放行（普通用户可主动给管理员发私信）
    if not can_message(db, user.id, peer_id):
        raise HTTPException(403, "仅好友之间可以私聊")
    if is_blocked(db, user.id, peer_id) or is_blocked(db, peer_id, user.id):
        raise HTTPException(403, "无法发送消息（已被限制）")
    content = body.content.strip()
    # R104 项3：kind 白名单加入 location（**仅私聊放行**；群聊路径 groups.py 本期保持不变）。
    # 未知 kind 仍降级为 text（前向兼容）。
    kind = (body.kind if body.kind in ("text", "image", "voice", "location", "location_live")
            else "text")
    # 位置消息允许「纯坐标、无文本」；其余 kind 仍禁止空消息。
    if not content and kind != "location":
        raise HTTPException(400, "消息不能为空")
    # R3b-C U9：解析引用（非法引用忽略 → 空快照，不报错）
    reply_snap = resolve_reply(db, body.reply, user, peer_id, None)
    m = await store_and_deliver(db, user, peer_id, kind, content,
                                sub=body.sub, lat=body.lat, lng=body.lng,
                                precise=body.precise, duration=body.duration,
                                reply=reply_snap)
    return msg_dict(m)


@router.get("/conversations")
def list_conversations(limit: int = 100, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    """当前用户的「全部会话」列表（Bug1 修复，R72）。

    与 /unread 的关键区别：**不受已读状态影响** —— 只要与对端有过消息往来就返回一行，
    因此管理员回复（=把对方消息置已读）后，该会话不会再从列表里消失。
    - 管理员：返回与任何用户有过往来的会话；
    - 普通用户：返回有往来的对端 + 我的好友（好友可无消息，lastMessage 为 null）。
    每条：peerId / peerNickname / peerAvatar / peerRemark / lastMessage / unreadCount / updatedAt，
    按 updatedAt 倒序；limit 默认 100（1~500）。

    性能：全部走「按对端聚合」的批量查询，**不做逐会话 N+1**。
    """
    limit = min(max(limit, 1), 500)
    me = user.id
    # 1) 每个对端的最后一条消息 id（一次 group by；私聊 group_id IS NULL）
    peer_expr = case((Message.sender_id == me, Message.receiver_id),
                     else_=Message.sender_id)
    last_rows = (
        db.query(peer_expr.label("peer"), func.max(Message.id).label("last_id"))
        .filter(Message.group_id.is_(None),
                or_(Message.sender_id == me, Message.receiver_id == me))
        .group_by(peer_expr)
        .all()
    )
    last_id_by_peer: dict[int, int] = {}
    for peer, last_id in last_rows:
        if peer and peer != me:
            last_id_by_peer[peer] = last_id
    # 2) 普通用户补齐「我的好友」（可能从未聊过）
    peer_ids = set(last_id_by_peer.keys())
    if not is_admin_user(user):
        peer_ids |= friend_ids_of(db, me)
    peer_ids.discard(me)
    if not peer_ids:
        return {"items": [], "total": 0}
    # 3) 批量取：最后一条消息 / 用户资料 / 我的备注 / 未读数（全部一次查询）
    last_ids = list(last_id_by_peer.values())
    last_msgs = {
        m.id: m for m in db.query(Message).filter(Message.id.in_(last_ids)).all()
    } if last_ids else {}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(list(peer_ids))).all()}
    remarks = {
        r.peer_id: (r.remark or "")
        for r in db.query(FriendRemark).filter(
            FriendRemark.owner_id == me,
            FriendRemark.peer_id.in_(list(peer_ids)),
        ).all()
    }
    unread = {
        sid: cnt for sid, cnt in db.query(Message.sender_id, func.count(Message.id))
        .filter(Message.receiver_id == me, Message.group_id.is_(None),
                Message.read_at.is_(None))
        .group_by(Message.sender_id).all()
    }
    items = []
    for pid in peer_ids:
        u = users.get(pid)
        lm = last_msgs.get(last_id_by_peer.get(pid))
        items.append({
            "peerId": pid,
            "peerNickname": (u.nickname if u else "已注销用户"),
            "peerAvatar": (u.avatar if u else None),
            "peerRemark": remarks.get(pid, ""),
            "lastMessage": {
                "id": lm.id,
                "kind": lm.kind,
                "content": lm.content,
                "sub": getattr(lm, "sub", "") or "",
                "lat": getattr(lm, "lat", None),
                "lng": getattr(lm, "lng", None),
                "precise": bool(getattr(lm, "precise", False)),
                "duration": getattr(lm, "duration", None),
                "createdAt": lm.created_at,
                "senderId": lm.sender_id,
            } if lm else None,
            "unreadCount": int(unread.get(pid, 0)),
            "updatedAt": (lm.created_at if lm else ""),
        })
    items.sort(key=lambda x: x["updatedAt"] or "", reverse=True)
    total = len(items)
    return {"items": items[:limit], "total": total}


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
            elif m.kind == "location":
                p["last"] = "[位置]"
            elif m.kind == "location_live":
                p["last"] = "[实时位置]"
            else:
                p["last"] = m.content[:80]
        total += 1
    # Bug3（R72）：带上「我对该对端」的私有备注，供会话列表 / 未读角标免二次请求渲染。
    remarks = {
        r.peer_id: (r.remark or "")
        for r in db.query(FriendRemark).filter(
            FriendRemark.owner_id == user.id,
            FriendRemark.peer_id.in_(list(by_peer.keys())),
        ).all()
    } if by_peer else {}
    items = sorted(by_peer.values(), key=lambda x: -x["lastId"])
    for it in items:
        it["peerRemark"] = remarks.get(it["peerId"], "")
    return {"total": total, "items": items}


def _epoch_ms(created_at: str) -> int:
    """R105：'YYYY-MM-DD HH:MM:SS'（或旧 16 位格式）→ epoch 毫秒；解析失败返回 0。"""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return int(datetime.strptime(created_at, fmt).timestamp() * 1000)
        except (ValueError, TypeError):
            continue
    return 0


def _msg_preview(m: Message) -> str:
    """R105：未读摘要预览文案（与 /unread 的 [图片]/[语音]/[位置] 口径对齐，另加 file）。"""
    if m.kind == "image":
        return "[图片]"
    if m.kind == "voice":
        return "[语音]"
    if m.kind == "location":
        return "[位置]"
    if m.kind == "location_live":
        return "[实时位置]"
    if m.kind == "file":
        return "[文件]"
    if m.kind == "text":
        return (m.content or "")[:50]
    return "[消息]"


@router.get("/unread-summary")
def unread_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """R105：App 前台轮询用未读摘要（私聊 + 群聊一次聚合返回）。

    仅返回 unread>0 的会话，按最后一条消息时间倒序，最多 20 条：
        {"ok": true, "items": [
            {"id": 123, "type": "peer", "name": "昵称", "unread": 2,
             "last": {"preview": "...", "sender": "发送者昵称", "time": 1726700000000}}]}
    - type: peer（私聊）/ group（群聊）；
    - name: 私聊 = 我的备注（有则优先）或对方昵称（与既有会话列表口径一致）；群聊 = 群名；
    - last.preview: image→[图片] voice→[语音] location→[位置] location_live→[实时位置]
                    file→[文件]
                    text→正文前 50 字；未知 kind→[消息]；
    - last.sender: 最后一条消息发送者昵称；last.time: epoch 毫秒。
    复用既有未读模型：私聊 read_at IS NULL；群聊沿用 last_read_msg_id 已读游标。
    性能：聚合 2 条 + 明细批量 4 条，共 6 条定数查询，无 N+1。
    """
    me = user.id
    # 1) 私聊未读：按发送者聚合（未读游标 = read_at IS NULL，与 /unread 同口径）
    peer_rows = (
        db.query(Message.sender_id, func.count(Message.id).label("cnt"),
                 func.max(Message.id).label("last_id"))
        .filter(Message.receiver_id == me, Message.group_id.is_(None),
                Message.read_at.is_(None))
        .group_by(Message.sender_id)
        .all()
    )
    # 2) 群聊未读：join 成员表用 last_read_msg_id 游标（与 groups.py 同口径；排除自己发的）
    group_rows = (
        db.query(ChatGroupMember.group_id, func.count(Message.id).label("cnt"),
                 func.max(Message.id).label("last_id"))
        .join(Message, Message.group_id == ChatGroupMember.group_id)
        .filter(ChatGroupMember.user_id == me,
                Message.id > ChatGroupMember.last_read_msg_id,
                Message.sender_id != me)
        .group_by(ChatGroupMember.group_id)
        .all()
    )
    if not peer_rows and not group_rows:
        return {"ok": True, "items": []}
    # 3) 批量取最后一条消息（一次查询）
    last_ids = [r.last_id for r in peer_rows] + [r.last_id for r in group_rows]
    last_msgs = ({m.id: m for m in db.query(Message).filter(Message.id.in_(last_ids)).all()}
                 if last_ids else {})
    # 4) 批量取展示信息：对端用户 / 群 / 发送者昵称 / 我的备注（各一次查询）
    peer_ids = [r.sender_id for r in peer_rows]
    group_ids = [r.group_id for r in group_rows]
    users = ({u.id: u for u in db.query(User).filter(User.id.in_(peer_ids)).all()}
             if peer_ids else {})
    group_map = ({g.id: g for g in db.query(ChatGroup).filter(ChatGroup.id.in_(group_ids)).all()}
                 if group_ids else {})
    sender_ids = {m.sender_id for m in last_msgs.values()}
    sender_names = (dict(db.query(User.id, User.nickname).filter(User.id.in_(sender_ids)).all())
                    if sender_ids else {})
    remarks = ({
        r.peer_id: (r.remark or "")
        for r in db.query(FriendRemark).filter(
            FriendRemark.owner_id == me, FriendRemark.peer_id.in_(peer_ids)).all()
    } if peer_ids else {})

    def _item(item_id: int, itype: str, name: str, cnt: int, last_id: int) -> tuple:
        lm = last_msgs.get(last_id)
        item = {
            "id": item_id, "type": itype, "name": name, "unread": int(cnt),
            "last": {
                "preview": _msg_preview(lm) if lm else "[消息]",
                "sender": sender_names.get(lm.sender_id, "") if lm else "",
                "time": _epoch_ms(lm.created_at) if lm else 0,
            },
        }
        return (item["last"]["time"], last_id, item)

    ranked = []
    for sid, cnt, last_id in peer_rows:
        u = users.get(sid)
        ranked.append(_item(sid, "peer", remarks.get(sid) or (u.nickname if u else "已注销用户"),
                            cnt, last_id))
    for gid, cnt, last_id in group_rows:
        g = group_map.get(gid)
        ranked.append(_item(gid, "group", (g.name if g else "群聊"), cnt, last_id))
    # 时间倒序（同一秒内按消息 id 兜底），最多 20 条
    ranked.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return {"ok": True, "items": [t[2] for t in ranked[:20]]}


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
