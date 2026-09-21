# -*- coding: utf-8 -*-
"""R72 工程师任务一：后端补丁（database/schemas/chat/friends/groups/建表SQL）。

- 二进制读写，保留 CRLF 行尾（改后 loneLF 必须 0）；
- 每个补丁断言 old 恰好命中 1 次、new 尚未存在，否则整体失败不落盘。
"""
import io
import os
import sys

ROOT = r"D:\下载的文件\学习工作台"


def L(*lines):
    return "".join(l + "\r\n" for l in lines)


EDITS = []

# ---------------------------------------------------------------- database.py
EDITS.append((
    r"server\database.py",
    L(
        '    created_at = Column(String(19), nullable=False)',
        '',
        '',
        'class Message(Base):',
    ),
    L(
        '    created_at = Column(String(19), nullable=False)',
        '',
        '',
        'class FriendRemark(Base):',
        '    """好友备注（Bug3，R72）：owner 对 peer 的私有备注名，仅本人可见。',
        '',
        '    - 空串/去空格后为空 = 无备注（路由层删除该行）；',
        '    - 唯一约束 (owner_id, peer_id)：同一人对同一好友只存一条；',
        '    - 不改 friends 表结构（历史库零迁移），备注属「本人私有」，与好友关系解耦。',
        '    """',
        '    __tablename__ = "friend_remarks"',
        '    __table_args__ = (UniqueConstraint("owner_id", "peer_id", name="uq_friend_remark"),)',
        '    id = Column(Integer, primary_key=True)',
        '    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)',
        '    peer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)',
        '    remark = Column(String(20), nullable=False, default="")',
        '    updated_at = Column(String(19), nullable=False)',
        '',
        '',
        'class Message(Base):',
    ),
))

# ---------------------------------------------------------------- schemas.py
EDITS.append((
    r"server\schemas.py",
    L(
        'class GroupMeIn(BaseModel):',
        '    """设置我在本群的群名片（T04，D5）：空串 = 清除，回退全局昵称。"""',
        '    groupNickname: str | None = None',
    ),
    L(
        'class GroupMeIn(BaseModel):',
        '    """设置我在本群的群名片（T04，D5）：空串 = 清除，回退全局昵称。"""',
        '    groupNickname: str | None = None',
        '',
        '',
        'class FriendRemarkIn(BaseModel):',
        '    """好友备注（Bug3，R72）：PUT /api/friends/{peer_id}/remark 请求体。',
        '',
        '    - 空串 / 去空格后为空 = 删除该备注（回退显示对方昵称）；',
        '    - 长度由路由层截断到 20 字（此处不设 max_length，避免超长直接 422，',
        '      统一走「截断」语义，与群名片 groupNickname 的处理风格一致）。',
        '    - 警告：不要把备注塞进 schemas.user_brief()：它被 notes/moments/social 多处复用，',
        '      塞进去会污染公开契约。',
        '    """',
        '    remark: str | None = None',
    ),
))

# ---------------------------------------------------------------- chat.py imports
EDITS.append((
    r"server\routers\chat.py",
    L('from sqlalchemy import and_, or_'),
    L('from sqlalchemy import and_, case, func, or_'),
))
EDITS.append((
    r"server\routers\chat.py",
    L('from database import Message, User, can_message, get_db, is_friend, now_iso'),
    L('from database import (FriendRemark, Message, User, can_message, friend_ids_of,',
      '                     get_db, is_admin_user, is_friend, now_iso)'),
))

# ---------------------------------------------------------------- chat.py conversations
EDITS.append((
    r"server\routers\chat.py",
    L('@router.get("/unread")',
      'def unread(user: User = Depends(get_current_user), db: Session = Depends(get_db)):'),
    L('@router.get("/conversations")',
      'def list_conversations(limit: int = 100, user: User = Depends(get_current_user),',
      '                       db: Session = Depends(get_db)):',
      '    """当前用户的「全部会话」列表（Bug1 修复，R72）。',
      '',
      '    与 /unread 的关键区别：**不受已读状态影响** —— 只要与对端有过消息往来就返回一行，',
      '    因此管理员回复（=把对方消息置已读）后，该会话不会再从列表里消失。',
      '    - 管理员：返回与任何用户有过往来的会话；',
      '    - 普通用户：返回有往来的对端 + 我的好友（好友可无消息，lastMessage 为 null）。',
      '    每条：peerId / peerNickname / peerAvatar / peerRemark / lastMessage / unreadCount / updatedAt，',
      '    按 updatedAt 倒序；limit 默认 100（1~500）。',
      '',
      '    性能：全部走「按对端聚合」的批量查询，**不做逐会话 N+1**。',
      '    """',
      '    limit = min(max(limit, 1), 500)',
      '    me = user.id',
      '    # 1) 每个对端的最后一条消息 id（一次 group by；私聊 group_id IS NULL）',
      '    peer_expr = case((Message.sender_id == me, Message.receiver_id),',
      '                     else_=Message.sender_id)',
      '    last_rows = (',
      '        db.query(peer_expr.label("peer"), func.max(Message.id).label("last_id"))',
      '        .filter(Message.group_id.is_(None),',
      '                or_(Message.sender_id == me, Message.receiver_id == me))',
      '        .group_by(peer_expr)',
      '        .all()',
      '    )',
      '    last_id_by_peer: dict[int, int] = {}',
      '    for peer, last_id in last_rows:',
      '        if peer and peer != me:',
      '            last_id_by_peer[peer] = last_id',
      '    # 2) 普通用户补齐「我的好友」（可能从未聊过）',
      '    peer_ids = set(last_id_by_peer.keys())',
      '    if not is_admin_user(user):',
      '        peer_ids |= friend_ids_of(db, me)',
      '    peer_ids.discard(me)',
      '    if not peer_ids:',
      '        return {"items": [], "total": 0}',
      '    # 3) 批量取：最后一条消息 / 用户资料 / 我的备注 / 未读数（全部一次查询）',
      '    last_ids = list(last_id_by_peer.values())',
      '    last_msgs = {',
      '        m.id: m for m in db.query(Message).filter(Message.id.in_(last_ids)).all()',
      '    } if last_ids else {}',
      '    users = {u.id: u for u in db.query(User).filter(User.id.in_(list(peer_ids))).all()}',
      '    remarks = {',
      '        r.peer_id: (r.remark or "")',
      '        for r in db.query(FriendRemark).filter(',
      '            FriendRemark.owner_id == me,',
      '            FriendRemark.peer_id.in_(list(peer_ids)),',
      '        ).all()',
      '    }',
      '    unread = {',
      '        sid: cnt for sid, cnt in db.query(Message.sender_id, func.count(Message.id))',
      '        .filter(Message.receiver_id == me, Message.group_id.is_(None),',
      '                Message.read_at.is_(None))',
      '        .group_by(Message.sender_id).all()',
      '    }',
      '    items = []',
      '    for pid in peer_ids:',
      '        u = users.get(pid)',
      '        lm = last_msgs.get(last_id_by_peer.get(pid))',
      '        items.append({',
      '            "peerId": pid,',
      '            "peerNickname": (u.nickname if u else "已注销用户"),',
      '            "peerAvatar": (u.avatar if u else None),',
      '            "peerRemark": remarks.get(pid, ""),',
      '            "lastMessage": {',
      '                "id": lm.id,',
      '                "kind": lm.kind,',
      '                "content": lm.content,',
      '                "createdAt": lm.created_at,',
      '                "senderId": lm.sender_id,',
      '            } if lm else None,',
      '            "unreadCount": int(unread.get(pid, 0)),',
      '            "updatedAt": (lm.created_at if lm else ""),',
      '        })',
      '    items.sort(key=lambda x: x["updatedAt"] or "", reverse=True)',
      '    total = len(items)',
      '    return {"items": items[:limit], "total": total}',
      '',
      '',
      '@router.get("/unread")',
      'def unread(user: User = Depends(get_current_user), db: Session = Depends(get_db)):'),
))

# ---------------------------------------------------------------- chat.py unread peerRemark
EDITS.append((
    r"server\routers\chat.py",
    L('        total += 1',
      '    return {"total": total, "items": sorted(by_peer.values(), key=lambda x: -x["lastId"])}'),
    L('        total += 1',
      '    # Bug3（R72）：带上「我对该对端」的私有备注，供会话列表 / 未读角标免二次请求渲染。',
      '    remarks = {',
      '        r.peer_id: (r.remark or "")',
      '        for r in db.query(FriendRemark).filter(',
      '            FriendRemark.owner_id == user.id,',
      '            FriendRemark.peer_id.in_(list(by_peer.keys())),',
      '        ).all()',
      '    } if by_peer else {}',
      '    items = sorted(by_peer.values(), key=lambda x: -x["lastId"])',
      '    for it in items:',
      '        it["peerRemark"] = remarks.get(it["peerId"], "")',
      '    return {"total": total, "items": items}'),
))

# ---------------------------------------------------------------- friends.py imports
EDITS.append((
    r"server\routers\friends.py",
    L('from database import (Friend, FriendRequest, User, UserBlock, friend_pair,',
      '                      get_db, is_admin_user, is_friend, now_iso)'),
    L('from database import (Friend, FriendRemark, FriendRequest, User, UserBlock,',
      '                      can_message, friend_pair, get_db, is_admin_user, is_friend,',
      '                      now_iso)'),
))
EDITS.append((
    r"server\routers\friends.py",
    L('from schemas import user_brief'),
    L('from schemas import FriendRemarkIn, user_brief'),
))

# ---------------------------------------------------------------- friends.py remark endpoint
EDITS.append((
    r"server\routers\friends.py",
    L('    if not f:',
      '        raise HTTPException(404, "对方不是你的好友")',
      '    db.delete(f)',
      '    db.commit()',
      '    return {"ok": True}'),
    L('    if not f:',
      '        raise HTTPException(404, "对方不是你的好友")',
      '    db.delete(f)',
      '    db.commit()',
      '    return {"ok": True}',
      '',
      '',
      '@router.put("/{peer_id}/remark")',
      'def set_friend_remark(peer_id: int, body: FriendRemarkIn,',
      '                      user: User = Depends(get_current_user),',
      '                      db: Session = Depends(get_db)):',
      '    """设置 / 清除对某人的备注（Bug3，R72）。',
      '',
      '    - body.remark 去空格后为空 = 删除该备注（回退显示对方昵称）；',
      '    - 长度截断到 20 字；',
      '    - 校验对象必须是「我可对话的对端」：好友，或管理员↔任意用户（can_message 放行）；',
      '    - 备注是**请求者私有**数据，只有本人能读写，绝不回显给他人。',
      '    """',
      '    if peer_id == user.id:',
      '        raise HTTPException(400, "不能给自己设置备注")',
      '    if not can_message(db, user.id, peer_id):',
      '        raise HTTPException(403, "只能给好友设置备注")',
      '    remark = (body.remark or "").strip()[:20]',
      '    row = db.query(FriendRemark).filter(',
      '        FriendRemark.owner_id == user.id, FriendRemark.peer_id == peer_id',
      '    ).first()',
      '    if not remark:',
      '        if row:',
      '            db.delete(row)',
      '            db.commit()',
      '        return {"ok": True, "peerId": peer_id, "peerRemark": ""}',
      '    if row:',
      '        row.remark = remark',
      '        row.updated_at = now_iso()',
      '    else:',
      '        db.add(FriendRemark(owner_id=user.id, peer_id=peer_id,',
      '                            remark=remark, updated_at=now_iso()))',
      '    db.commit()',
      '    return {"ok": True, "peerId": peer_id, "peerRemark": remark}'),
))

# ---------------------------------------------------------------- friends.py list_friends peerRemark
EDITS.append((
    r"server\routers\friends.py",
    L('    rows = db.query(Friend).filter(',
      '        or_(Friend.user_a == user.id, Friend.user_b == user.id)',
      '    ).all()',
      '    out = []',
      '    for f in rows:',
      '        peer_id = f.user_b if f.user_a == user.id else f.user_a',
      '        # 需求01：管理员不出现在好友列表里',
      '        peer = _visible_peer(db, peer_id)',
      '        if peer:',
      '            out.append({**_peer_brief(peer), "since": f.created_at})',
      '    out.sort(key=lambda x: x["nickname"])',
      '    return {"items": out, "total": len(out)}'),
    L('    rows = db.query(Friend).filter(',
      '        or_(Friend.user_a == user.id, Friend.user_b == user.id)',
      '    ).all()',
      '    # Bug3（R72）：一次性取出「我对各好友的备注」，避免逐行查询（只回请求者自己的备注）。',
      '    remarks = {',
      '        r.peer_id: (r.remark or "")',
      '        for r in db.query(FriendRemark).filter(FriendRemark.owner_id == user.id).all()',
      '    }',
      '    out = []',
      '    for f in rows:',
      '        peer_id = f.user_b if f.user_a == user.id else f.user_a',
      '        # 需求01：管理员不出现在好友列表里',
      '        peer = _visible_peer(db, peer_id)',
      '        if peer:',
      '            out.append({**_peer_brief(peer), "since": f.created_at,',
      '                        "peerRemark": remarks.get(peer_id, "")})',
      '    out.sort(key=lambda x: x["nickname"])',
      '    return {"items": out, "total": len(out)}'),
))

# ---------------------------------------------------------------- groups.py imports
EDITS.append((
    r"server\routers\groups.py",
    L('from database import (ChatGroup, ChatGroupMember, Message, User,',
      '                      friend_ids_of, get_db, now_iso)'),
    L('from database import (ChatGroup, ChatGroupMember, Message, User,',
      '                      friend_ids_of, get_db, is_admin_user, now_iso)'),
))

# ---------------------------------------------------------------- groups.py admin branch
EDITS.append((
    r"server\routers\groups.py",
    L('@router.get("")',
      'def list_groups(user: User = Depends(get_current_user), db: Session = Depends(get_db)):',
      '    """我的群列表：memberCount / lastMessage / unreadCount（游标模型一次算清）。"""',
      '    my_members = db.query(ChatGroupMember).filter(',
      '        ChatGroupMember.user_id == user.id).all()'),
    L('def _admin_group_rows(db: Session) -> list[dict]:',
      '    """管理员视图群列表（Bug2，R72）：返回**全部群**，只读。',
      '',
      '    只在「我的成员行」之外补一条管理员分支，不改 require_member / group_detail：',
      '    管理员点进群详情仍是 403（既定口径），前端按只读卡片渲染、不可点入。',
      '    读语义：管理员不是群成员、无已读游标，unreadCount 恒 0；lastMessage 照常算。',
      '    """',
      '    groups = db.query(ChatGroup).all()',
      '    if not groups:',
      '        return []',
      '    gids = [g.id for g in groups]',
      '    member_counts = dict(',
      '        db.query(ChatGroupMember.group_id, func.count(ChatGroupMember.id))',
      '        .filter(ChatGroupMember.group_id.in_(gids))',
      '        .group_by(ChatGroupMember.group_id).all()',
      '    )',
      '    last_id_by_gid = {',
      '        gid: mid',
      '        for gid, mid in db.query(Message.group_id, func.max(Message.id))',
      '        .filter(Message.group_id.in_(gids))',
      '        .group_by(Message.group_id).all()',
      '        if gid',
      '    }',
      '    last_ids = list(last_id_by_gid.values())',
      '    last_msgs = {',
      '        m.id: m',
      '        for m in db.query(Message).filter(Message.id.in_(last_ids)).all()',
      '    } if last_ids else {}',
      '    items = []',
      '    for g in groups:',
      '        last = last_msgs.get(last_id_by_gid.get(g.id))',
      '        items.append({',
      '            "id": g.id,',
      '            "name": g.name,',
      '            "ownerId": g.owner_id,',
      '            "avatar": g.avatar,',
      '            "memberCount": int(member_counts.get(g.id, 0)),',
      '            "lastMessage": {',
      '                "content": (last.content or "")[:80],',
      '                "kind": last.kind,',
      '                "senderId": last.sender_id,',
      '                "createdAt": last.created_at,',
      '            } if last else None,',
      '            "unreadCount": 0,',
      '            "role": "admin-view",',
      '        })',
      '    items.sort(key=lambda x: (x["lastMessage"] or {}).get("createdAt", "") or "", reverse=True)',
      '    return items',
      '',
      '',
      '@router.get("")',
      'def list_groups(user: User = Depends(get_current_user), db: Session = Depends(get_db)):',
      '    """我的群列表：memberCount / lastMessage / unreadCount（游标模型一次算清）。',
      '',
      '    Bug2（R72）：管理员账号改为返回**全部群**（role=\'admin-view\'、unreadCount=0，只读视图）；',
      '    普通用户逻辑完全不变。',
      '    """',
      '    if is_admin_user(user):',
      '        return {"items": _admin_group_rows(db)}',
      '    my_members = db.query(ChatGroupMember).filter(',
      '        ChatGroupMember.user_id == user.id).all()'),
))

# ---------------------------------------------------------------- 建表SQL.sql
EDITS.append((
    r"server\建表SQL.sql",
    L('CREATE INDEX IF NOT EXISTS ix_study_user_module ON study_logs(user_id, module, created_at);'),
    L('CREATE INDEX IF NOT EXISTS ix_study_user_module ON study_logs(user_id, module, created_at);',
      '',
      '-- ============================================================',
      '-- R72（2026-09-17）增量：好友备注表',
      '-- Bug3 修复：为「好友备注昵称」提供落库；不改 friends / friend_requests 旧列。',
      '-- 备注属「本人私有」，只有 owner 能读写自己的备注；空串/去空格后为空 = 删除该行。',
      '-- 新表由 SQLAlchemy create_all 自动创建，此处为同步 DDL。',
      '-- ============================================================',
      'CREATE TABLE IF NOT EXISTS friend_remarks (',
      '  id         INTEGER PRIMARY KEY AUTOINCREMENT,',
      '  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 备注的拥有者',
      '  peer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 被备注的对象',
      '  remark     TEXT    NOT NULL DEFAULT \'\',                              -- 备注名（≤20 字）',
      '  updated_at TEXT    NOT NULL,                                          -- 最近更新时间',
      '  UNIQUE (owner_id, peer_id)',
      ');',
      'CREATE INDEX IF NOT EXISTS ix_friend_remark_owner ON friend_remarks(owner_id);'),
))


def main():
    ok = True
    for rel, old, new in EDITS:
        p = os.path.join(ROOT, rel)
        raw = open(p, "rb").read()
        ob = old.encode("utf-8")
        nb = new.encode("utf-8")
        c = raw.count(ob)
        if c != 1:
            print("FAIL anchor count=%d for %s :: %r" % (c, rel, old[:70]))
            ok = False
            continue
        if raw.count(nb) >= 1:
            print("FAIL new already present in %s" % rel)
            ok = False
            continue
        raw2 = raw.replace(ob, nb)
        open(p, "wb").write(raw2)
        print("PATCH ok: %s (+%d bytes)" % (rel, len(raw2) - len(raw)))
    if not ok:
        print("RESULT: FAIL (至少一个补丁未命中)")
        sys.exit(1)
    print("RESULT: OK all backend patches applied")


if __name__ == "__main__":
    main()
