"""群聊路由（P0-3，2026-09-11 增量）。

模型：chat_groups + chat_group_members（每人 last_read_msg_id 已读游标）。
已读模型：群内不做逐条「对方已读」回执，只保证自己未读数准确（架构决策 §9-2）。
ws 仅作在线加速：groupMsg / groupInvited 通过 wsmanager 点对点投递，离线静默。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from database import (ChatGroup, ChatGroupMember, Message, User,
                      friend_ids_of, get_db, now_iso)
from rate_limit import rate_limit
from schemas import (GroupCreateIn, GroupMeIn, GroupMsgIn, GroupPatchIn,
                     GroupReadIn)
from security import get_current_user
from wsmanager import send_to

router = APIRouter(prefix="/api/groups", tags=["groups"])

MAX_GROUP_SIZE = 50  # 建群第 51 人被拒（含创建者）


def _group_nick_map(db: Session, gid: int) -> dict[int, str]:
    """构造群名片映射 {user_id: group_nickname}（T04，D5；空串保留以便回退全局昵称）。"""
    rows = db.query(ChatGroupMember.user_id, ChatGroupMember.group_nickname).filter(
        ChatGroupMember.group_id == gid).all()
    return {uid: (nick or "") for uid, nick in rows}


def group_msg_dict(m: Message, sender: User | None, group_id: int,
                   nick_map: dict[int, str] | None = None) -> dict:
    """群消息序列化（公开字段）。

    昵称优先级（T04，D5）：群名片(非空) > 全局昵称 > "已注销用户"；头像恒取全局头像。
    """
    nick = (nick_map or {}).get(m.sender_id) or ""
    if nick.strip():
        display = nick.strip()
    elif sender:
        display = sender.nickname
    else:
        display = "已注销用户"
    return {
        "id": m.id,
        "groupId": group_id,
        "senderId": m.sender_id,
        "senderNickname": display,
        "senderAvatar": sender.avatar if sender else None,
        "kind": m.kind,
        "content": m.content,
        "createdAt": m.created_at,
    }


def require_group(db: Session, gid: int) -> ChatGroup:
    g = db.get(ChatGroup, gid)
    if not g:
        raise HTTPException(404, "群不存在或已解散")
    return g


def require_member(db: Session, gid: int, uid: int) -> ChatGroupMember:
    """仅成员可访问；非成员一律 403。"""
    m = db.query(ChatGroupMember).filter(
        ChatGroupMember.group_id == gid, ChatGroupMember.user_id == uid).first()
    if not m:
        raise HTTPException(403, "你不是该群成员")
    return m


@router.post("")
async def create_group(body: GroupCreateIn, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    """建群：memberIds 须均为我的好友（去重后 2~49 人，加自己 ≤50），创建者自动入群 role=owner。"""
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "群名称不能为空")
    if len(name) > 20:
        raise HTTPException(400, "群名称最长 20 字")
    friend_ids = friend_ids_of(db, user.id)
    member_ids: list[int] = []
    for uid in body.memberIds:
        if uid in member_ids or uid == user.id:
            continue
        if uid not in friend_ids:
            raise HTTPException(400, "只能邀请你的好友入群")
        member_ids.append(uid)
    if len(member_ids) + 1 > MAX_GROUP_SIZE:
        raise HTTPException(400, f"群人数上限 {MAX_GROUP_SIZE} 人")
    g = ChatGroup(name=name, owner_id=user.id, avatar=None, created_at=now_iso())
    db.add(g)
    db.flush()  # 拿到 g.id
    db.add(ChatGroupMember(group_id=g.id, user_id=user.id, role="owner",
                           last_read_msg_id=0, joined_at=now_iso()))
    for uid in member_ids:
        db.add(ChatGroupMember(group_id=g.id, user_id=uid, role="member",
                               last_read_msg_id=0, joined_at=now_iso()))
    db.commit()
    # 在线加速：向每个被邀请成员推送入群提醒（离线静默，靠轮询兜底）
    payload = {"type": "groupInvited", "group": {"id": g.id, "name": g.name, "ownerId": user.id}}
    for uid in member_ids:
        await send_to(uid, payload)
    return {"id": g.id, "name": g.name, "memberCount": len(member_ids) + 1}


@router.get("")
def list_groups(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """我的群列表：memberCount / lastMessage / unreadCount（游标模型一次算清）。"""
    my_members = db.query(ChatGroupMember).filter(
        ChatGroupMember.user_id == user.id).all()
    items = []
    for me in my_members:
        g = db.get(ChatGroup, me.group_id)
        if not g:
            continue
        member_count = db.query(func.count(ChatGroupMember.id)).filter(
            ChatGroupMember.group_id == g.id).scalar() or 0
        last = db.query(Message).filter(Message.group_id == g.id).order_by(
            Message.id.desc()).first()
        unread = db.query(func.count(Message.id)).filter(
            Message.group_id == g.id, Message.id > me.last_read_msg_id,
            Message.sender_id != user.id).scalar() or 0
        items.append({
            "id": g.id,
            "name": g.name,
            "ownerId": g.owner_id,
            "memberCount": member_count,
            "lastMessage": {
                "content": last.content[:80] if last else "",
                "kind": last.kind if last else "text",
                "senderId": last.sender_id if last else 0,
                "createdAt": last.created_at if last else "",
            } if last else None,
            "unreadCount": unread,
            "role": me.role,
        })
    items.sort(key=lambda x: (x["lastMessage"] or {}).get("createdAt", "") or "", reverse=True)
    return {"items": items}


@router.get("/{gid}")
def group_detail(gid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """群详情 + 成员列表（user_brief 白名单 + role；绝不返回 phone/gender/birthday）。

    T04 增量：额外返回 announcement / myRole / myGroupNickname，成员项补 groupNickname。
    """
    g = require_group(db, gid)
    me = require_member(db, gid, user.id)
    rows = db.query(ChatGroupMember, User).join(
        User, ChatGroupMember.user_id == User.id).filter(
        ChatGroupMember.group_id == gid).order_by(ChatGroupMember.id).all()
    return {
        "id": g.id,
        "name": g.name,
        "ownerId": g.owner_id,
        "avatar": g.avatar,
        "announcement": g.announcement or "",
        "myRole": me.role,
        "myGroupNickname": me.group_nickname or "",
        "createdAt": g.created_at,
        "members": [
            {"id": u.id, "nickname": u.nickname, "avatarUrl": u.avatar,
             "role": m.role, "groupNickname": m.group_nickname or "", "joinedAt": m.joined_at}
            for m, u in rows
        ],
    }


@router.patch("/{gid}")
def patch_group(gid: int, body: GroupPatchIn, user: User = Depends(get_current_user),
                db: Session = Depends(get_db), _rl: None = Depends(rate_limit("default"))):
    """改群名 / 群公告（T04，D1）：部分更新，仅群主/管理员。

    权限判定统一写 role in ('owner','admin')。【后续扩展点：设置管理员】
    """
    g = require_group(db, gid)
    me = require_member(db, gid, user.id)
    if me.role not in ("owner", "admin"):  # 【后续扩展点：设置管理员】
        raise HTTPException(403, "仅群主/管理员可以修改")
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "群名称不能为空")
        if len(name) > 20:
            raise HTTPException(400, "群名称最长 20 字")
        g.name = name
    if body.announcement is not None:
        ann = body.announcement.strip()
        if len(ann) > 300:
            raise HTTPException(400, "公告最长 300 字")
        g.announcement = ann
    db.commit()
    return {"id": g.id, "name": g.name, "announcement": g.announcement or ""}


@router.patch("/{gid}/me")
def patch_group_me(gid: int, body: GroupMeIn, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db), _rl: None = Depends(rate_limit("default"))):
    """设置我在本群的群名片（T04，D5）：仅成员本人；空串 = 清除回退全局昵称。"""
    require_group(db, gid)
    me = require_member(db, gid, user.id)
    if body.groupNickname is not None:
        nick = body.groupNickname.strip()
        if len(nick) > 20:
            raise HTTPException(400, "群昵称最长 20 字")
        me.group_nickname = nick
        db.commit()
    return {"groupNickname": me.group_nickname or ""}


@router.get("/{gid}/messages")
async def group_messages(gid: int, before_id: int = 0, limit: int = 30, mark_read: int = 1,
                         user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """群消息分页（id 游标向前，时间正序 + hasMore）。markRead=1 自动推进我的已读游标。"""
    g = require_group(db, gid)
    me = require_member(db, gid, user.id)
    limit = min(max(limit, 1), 100)
    cond = Message.group_id == gid
    if before_id:
        cond = and_(cond, Message.id < before_id)
    rows = db.query(Message, User).join(
        User, Message.sender_id == User.id).filter(cond).order_by(
        Message.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    rows.reverse()
    if mark_read and rows:
        latest_id = max(m.id for m, _ in rows)
        if latest_id > me.last_read_msg_id:
            me.last_read_msg_id = latest_id
            db.commit()
    sender_ids = {m.sender_id for m, _ in rows}
    senders = {u.id: u for u in db.query(User).filter(User.id.in_(sender_ids)).all()} if sender_ids else {}
    nick_map = _group_nick_map(db, gid)
    return {
        "id": g.id,
        "name": g.name,
        "items": [group_msg_dict(m, senders.get(m.sender_id), gid, nick_map) for m, _ in rows],
        "hasMore": has_more,
        "nextBefore": rows[0][0].id if has_more and rows else 0,
    }


@router.post("/{gid}/messages")
async def send_group_message(gid: int, body: GroupMsgIn,
                             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """发群消息：写库后对除发送者外全部在线成员推送 groupMsg（离线靠轮询兜底）。"""
    require_group(db, gid)
    require_member(db, gid, user.id)
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "消息不能为空")
    kind = body.kind if body.kind in ("text", "image", "voice") else "text"
    m = Message(sender_id=user.id, receiver_id=0, group_id=gid, kind=kind,
                content=content, read_at=None, created_at=now_iso())
    db.add(m)
    db.commit()
    db.refresh(m)
    # 推送自身游标之外的成员（自己不需要回显，前端发送成功即本地渲染）
    others = db.query(ChatGroupMember.user_id).filter(
        ChatGroupMember.group_id == gid, ChatGroupMember.user_id != user.id).all()
    nick_map = _group_nick_map(db, gid)
    payload = {"type": "groupMsg", "groupId": gid, "message": group_msg_dict(m, user, gid, nick_map)}
    for (uid,) in others:
        await send_to(uid, payload)
    return group_msg_dict(m, user, gid, nick_map)


@router.post("/{gid}/read")
def mark_group_read(gid: int, body: GroupReadIn,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """推进我的群已读游标（只保证自己的未读数准确，群内不回执逐条已读）。"""
    require_group(db, gid)
    me = require_member(db, gid, user.id)
    if body.upToId > me.last_read_msg_id:
        me.last_read_msg_id = body.upToId
        db.commit()
    return {"ok": True, "lastReadMsgId": me.last_read_msg_id}


@router.delete("/{gid}/members/{uid}")
def kick_member(gid: int, uid: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """群主踢人（最小版群管理）。群主不能踢自己（用退群解散）。"""
    g = require_group(db, gid)
    if g.owner_id != user.id:
        raise HTTPException(403, "仅群主可以移除成员")
    if uid == user.id:
        raise HTTPException(400, "群主不能移除自己，请使用退群解散")
    me = require_member(db, gid, uid)
    db.delete(me)
    db.commit()
    return {"ok": True}


@router.post("/{gid}/quit")
def quit_group(gid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """退群；群主退群 = 解散（成员与群消息一并清理）。【后续扩展点：群主转让】"""
    require_group(db, gid)
    me = require_member(db, gid, user.id)
    if me.role == "owner":
        # 显式清理子表（SQLite 默认不启用外键级联，避免孤儿行）
        db.query(ChatGroupMember).filter(ChatGroupMember.group_id == gid).delete()
        db.query(Message).filter(Message.group_id == gid).delete()
        db.delete(require_group(db, gid))
    else:
        db.delete(me)
    db.commit()
    return {"ok": True, "dissolved": me.role == "owner"}
