"""好友：申请 / 收件箱 / 同意 / 拒绝 / 删除 / 用户搜索。

好友表单向存归一化小号在前（见 database.friend_pair），双向查询都命中同一行。
规则：不能加自己；已是好友不能再申请；对方先申请了我则“申请=直接成为好友”。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from typing import Optional

from database import (Friend, FriendRemark, FriendRequest, User, UserBlock,
                      admin_hidden_clause, can_message, friend_pair, get_db,
                      is_friend, is_hidden_from_public, now_iso)
from rate_limit import rate_limit
from schemas import FriendRemarkIn, user_brief
from security import get_current_user

router = APIRouter(prefix="/api/friends", tags=["friends"])


class ReqIn(BaseModel):
    toUserId: int = Field(gt=0)


class BlockIn(BaseModel):
    userId: int = Field(gt=0)


def _peer_brief(u: User) -> dict:
    return {**user_brief(u), "motto": u.motto}


def _visible_peer(db: Session, uid: int) -> Optional[User]:
    """需求01 / R170：取一个「对普通用户可见」的用户；隐身管理员或不存在一律返回 None。

    单向可见：**隐身**管理员不出现在好友列表 / 申请 / 黑名单等任何普通用户可见的返回里；
    现身的管理员（admin_hidden=False）与普通用户同样可见（统一走 helper）。
    管理员自己调用时不受影响（他要能看全、看真，见 /api/admin/*）。
    """
    u = db.get(User, uid)
    if u is None or is_hidden_from_public(u):
        return None
    return u


def require_friend(db: Session, a: int, b: int) -> None:
    """私聊前校验：必须互为好友，否则抛 403。"""
    if not is_friend(db, a, b):
        raise HTTPException(403, "仅好友之间可以私聊")


def is_blocked(db: Session, blocker: int, blocked: int) -> bool:
    return db.query(UserBlock).filter(
        UserBlock.blocker_id == blocker, UserBlock.blocked_id == blocked
    ).first() is not None


@router.post("/requests")
def send_request(body: ReqIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    to = db.get(User, body.toUserId)
    # 需求01 / R170：隐身管理员对普通用户不可见，加好友一律按「用户不存在」处理（现身的管理员可加）
    if not to or is_hidden_from_public(to):
        raise HTTPException(404, "用户不存在")
    if to.id == user.id:
        raise HTTPException(400, "不能添加自己为好友")
    if is_blocked(db, user.id, to.id) or is_blocked(db, to.id, user.id):
        raise HTTPException(400, "暂时无法向该用户发送好友申请")
    if is_friend(db, user.id, to.id):
        raise HTTPException(400, "你们已经是好友")
    # 对方先申请过我 → 直接成为好友（自动同意）
    existing = db.query(FriendRequest).filter(
        FriendRequest.from_user_id == to.id, FriendRequest.to_user_id == user.id
    ).first()
    if existing and existing.status == "pending":
        a, b = friend_pair(user.id, to.id)
        db.add(Friend(user_a=a, user_b=b, created_at=now_iso()))
        existing.status = "accepted"
        db.commit()
        return {"ok": True, "autoAccepted": True, "user": _peer_brief(to)}
    # friend_allow 三档（T03 增量，C2）：优先级＝黑名单 > 已是好友 > 互申请 autoAccept > 三档 > pending 重复。
    # 默认（含存量 NULL/空值）回退 need_confirm，老用户行为零变化。
    allow = to.friend_allow or "need_confirm"
    if allow == "nobody":
        raise HTTPException(400, "对方暂不接受好友申请")
    if allow == "everyone":
        # 免验证直接成为好友：复用上方 autoAccept 的 friend_pair 写法，响应结构同构，前端零适配。
        a, b = friend_pair(user.id, to.id)
        db.add(Friend(user_a=a, user_b=b, created_at=now_iso()))
        # BUG-2 修复：清理同向遗留 pending，避免 everyone 档成好友后仍残留幽灵申请。
        db.query(FriendRequest).filter(
            FriendRequest.from_user_id == user.id, FriendRequest.to_user_id == to.id,
            FriendRequest.status == "pending",
        ).update({"status": "accepted"}, synchronize_session=False)
        db.commit()
        return {"ok": True, "autoAccepted": True, "user": _peer_brief(to)}
    mine = db.query(FriendRequest).filter(
        FriendRequest.from_user_id == user.id, FriendRequest.to_user_id == to.id,
        FriendRequest.status == "pending",
    ).first()
    if mine:
        raise HTTPException(400, "申请已发送，等待对方处理")
    req = FriendRequest(from_user_id=user.id, to_user_id=to.id,
                        status="pending", created_at=now_iso())
    db.add(req)
    db.commit()
    return {"ok": True, "requestId": req.id}


@router.get("/requests")
def list_requests(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    def _row(r: FriendRequest, me_id: int) -> Optional[dict]:
        peer = r.from_user if r.to_user_id == me_id else r.to_user
        # 需求01 / R170：隐身管理员不出现在申请列表里（双向都过滤；现身的管理员可见）
        if peer is None or is_hidden_from_public(peer):
            return None
        return {"id": r.id, "fromMe": r.from_user_id == me_id,
                "status": r.status,
                "user": _peer_brief(peer), "createdAt": r.created_at}
    # 2026-09-11h 差异预检修复：恢复与线上完全一致的返回语义。
    # 收件箱返回【全部状态】(pending/accepted/declined) 并带 status 字段 ——
    # 前端申请列表展示与 DELETE /requests/{rid}（删除申请记录）都依赖它；
    # 未读数 unreadCount 仍只按 pending 子集统计（见 _unread_count）。
    all_in = db.query(FriendRequest).filter(
        FriendRequest.to_user_id == user.id
    ).order_by(FriendRequest.id.desc()).all()
    all_out = db.query(FriendRequest).filter(
        FriendRequest.from_user_id == user.id
    ).order_by(FriendRequest.id.desc()).all()
    pending_in = [r for r in all_in if r.status == "pending"]
    return {
        "incoming": [x for x in (_row(r, user.id) for r in all_in) if x],
        "outgoing": [x for x in (_row(r, user.id) for r in all_out) if x],
        # 2026-09-12 新增（仅新增字段，incoming/outgoing 原语义不变）：
        # 未读申请数走双水位线（BUG-2 同秒边界修复，详见 _unread_count docstring）：
        # 主路径按 last_seen_request_id（id 单调递增）计数；存量用户回退
        # last_request_seen_at 时间比较（格式已确认：created_at 由 now_iso() 写入，
        # 19 字符 'YYYY-MM-DD HH:MM:SS'，与水位线同格式，字典序=时间序）。
        "unreadCount": _unread_count(pending_in, user.last_request_seen_at,
                                     user.last_seen_request_id),
    }


def _unread_count(pending_in: list[FriendRequest], seen_at: str | None,
                  last_seen_request_id: int | None) -> int:
    """计算未读申请数（双水位线，BUG-2 同秒边界修复）。

    主路径：last_seen_request_id 非 NULL（新版 seen 写入过）→ 按申请 id 比较。
    id 单调递增，天然无「同一秒内新申请被当已读」的问题，这是根治。
    回退路径：last_seen_request_id 为 NULL（存量用户，列刚加、还没重新 seen 过）
    → 沿用时间水位线 last_request_seen_at 比较，行为与旧版完全一致：
    存量用户的已读状态不丢、角标不复活。
    """
    if last_seen_request_id is not None:
        return sum(1 for r in pending_in if r.id > last_seen_request_id)
    if seen_at is None:
        return len(pending_in)
    return sum(1 for r in pending_in if (r.created_at or "") > seen_at)


@router.post("/requests/seen")
def mark_requests_seen(user: User = Depends(get_current_user),
                       db: Session = Depends(get_db),
                       _rl: None = Depends(rate_limit("default"))):
    """标记「已查看全部好友申请」：写当前用户的已读水位线。

    配合 GET /api/friends/requests 的 unreadCount 做互动页申请角标：
    前端用户打开申请列表后调本接口，角标即清零；之后新到的申请重新计数。

    双水位线（BUG-2 同秒边界修复）：
    - last_seen_request_id（主）：写当前 pending incoming 的最大申请 id（无 pending
      时写 0）。id 单调递增，计数零歧义，根治「同一秒内新申请被当已读」。
    - last_request_seen_at（辅）：继续写当前时间（now_iso()，19 字符
      'YYYY-MM-DD HH:MM:SS'）。存量用户回退路径仍依赖它，前端无需感知。
    """
    max_pending = db.query(FriendRequest.id).filter(
        FriendRequest.to_user_id == user.id, FriendRequest.status == "pending"
    ).order_by(FriendRequest.id.desc()).first()
    user.last_seen_request_id = max_pending[0] if max_pending else 0
    user.last_request_seen_at = now_iso()
    db.commit()
    return {"ok": True, "unreadCount": 0}


def _own_request(db: Session, rid: int, user: User, *, to_me: bool) -> FriendRequest:
    r = db.get(FriendRequest, rid)
    if not r or (r.to_user_id if to_me else r.from_user_id) != user.id:
        raise HTTPException(404, "申请不存在")
    if r.status != "pending":
        raise HTTPException(400, "该申请已处理")
    return r


@router.post("/requests/{rid}/accept")
def accept_request(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own_request(db, rid, user, to_me=True)
    if not is_friend(db, r.from_user_id, user.id):
        a, b = friend_pair(r.from_user_id, user.id)
        db.add(Friend(user_a=a, user_b=b, created_at=now_iso()))
    r.status = "accepted"
    db.commit()
    return {"ok": True, "user": _peer_brief(db.get(User, r.from_user_id))}


@router.post("/requests/{rid}/decline")
def decline_request(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _own_request(db, rid, user, to_me=True)
    r.status = "declined"
    db.commit()
    return {"ok": True}


# 2026-09-11h 差异预检补回：该接口线上一直存在（本地副本缺失，直接覆盖会删功能）
@router.delete("/requests/{rid}")
def delete_request(rid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """删除申请记录（无论是什么状态）"""
    r = db.get(FriendRequest, rid)
    if not r or (r.from_user_id != user.id and r.to_user_id != user.id):
        raise HTTPException(404, "申请不存在")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.get("/search")
def search_users(q: str = "", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """搜索用户以便加好友（排除自己；已在好友列表或已是对方好友的带标记）。

    R142（2026-09-21）：匹配字段补上「账号」（account）——用户把账号改掉之后，
    仍应能用**新账号**搜到该用户（用户明确要求）。
    """
    kw = q.strip()
    if not kw:
        return {"items": []}
    like = f"%{kw}%"
    rows = (
        db.query(User)
        .filter(User.id != user.id)
        .filter(or_(User.username.like(like), User.nickname.like(like), User.account.like(like)))
        # 需求01 / R170：仅隐身管理员不参与用户搜索（现身的管理员可被搜到）
        .filter(admin_hidden_clause())
        # searchable 过滤（T03 增量，C3）：只收窄搜索路径。
        # 双保险写法：or_(is_(None), !=0) —— 存量历史 NULL 行视为可搜（兼容老库）。
        .filter(or_(User.searchable.is_(None), User.searchable != 0))
        .order_by(User.id.desc())
        .limit(10)
        .all()
    )
    return {"items": [
        {**_peer_brief(u), "isFriend": is_friend(db, user.id, u.id),
         "blockedMe": is_blocked(db, u.id, user.id)}
        for u in rows
    ]}


@router.get("")
def list_friends(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """我的好友（双向）：返回对方资料 + 成为好友时间。"""
    rows = db.query(Friend).filter(
        or_(Friend.user_a == user.id, Friend.user_b == user.id)
    ).all()
    # Bug3（R72）：一次性取出「我对各好友的备注」，避免逐行查询（只回请求者自己的备注）。
    remarks = {
        r.peer_id: (r.remark or "")
        for r in db.query(FriendRemark).filter(FriendRemark.owner_id == user.id).all()
    }
    out = []
    for f in rows:
        peer_id = f.user_b if f.user_a == user.id else f.user_a
        # 需求01：管理员不出现在好友列表里
        peer = _visible_peer(db, peer_id)
        if peer:
            out.append({**_peer_brief(peer), "since": f.created_at,
                        "peerRemark": remarks.get(peer_id, "")})
    out.sort(key=lambda x: x["nickname"])
    return {"items": out, "total": len(out)}


@router.delete("/{peer_id}")
def remove_friend(peer_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a, b = friend_pair(user.id, peer_id)
    f = db.query(Friend).filter(Friend.user_a == a, Friend.user_b == b).first()
    if not f:
        raise HTTPException(404, "对方不是你的好友")
    db.delete(f)
    db.commit()
    return {"ok": True}


@router.put("/{peer_id}/remark")
def set_friend_remark(peer_id: int, body: FriendRemarkIn,
                      user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    """设置 / 清除对某人的备注（Bug3，R72）。

    - body.remark 去空格后为空 = 删除该备注（回退显示对方昵称）；
    - 长度截断到 20 字；
    - 校验对象必须是「我可对话的对端」：好友，或管理员↔任意用户（can_message 放行）；
    - 备注是**请求者私有**数据，只有本人能读写，绝不回显给他人。
    """
    if peer_id == user.id:
        raise HTTPException(400, "不能给自己设置备注")
    if not can_message(db, user.id, peer_id):
        raise HTTPException(403, "只能给好友设置备注")
    remark = (body.remark or "").strip()[:20]
    row = db.query(FriendRemark).filter(
        FriendRemark.owner_id == user.id, FriendRemark.peer_id == peer_id
    ).first()
    if not remark:
        if row:
            db.delete(row)
            db.commit()
        return {"ok": True, "peerId": peer_id, "peerRemark": ""}
    if row:
        row.remark = remark
        row.updated_at = now_iso()
    else:
        db.add(FriendRemark(owner_id=user.id, peer_id=peer_id,
                            remark=remark, updated_at=now_iso()))
    db.commit()
    return {"ok": True, "peerId": peer_id, "peerRemark": remark}


# ---------- 黑名单：拉黑后对方不能发好友申请、不能发消息（is_blocked 已在申请/聊天入口校验） ----------
@router.post("/block")
def block_user(body: BlockIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.userId == user.id:
        raise HTTPException(400, "不能拉黑自己")
    target = db.get(User, body.userId)
    if not target:
        raise HTTPException(404, "用户不存在")
    exist = db.query(UserBlock).filter(
        UserBlock.blocker_id == user.id, UserBlock.blocked_id == body.userId
    ).first()
    if not exist:
        db.add(UserBlock(blocker_id=user.id, blocked_id=body.userId, created_at=now_iso()))
        db.commit()
    return {"ok": True}


@router.delete("/block/{blocked_id}")
def unblock_user(blocked_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(UserBlock).filter(
        UserBlock.blocker_id == user.id, UserBlock.blocked_id == blocked_id
    ).first()
    if not row:
        raise HTTPException(404, "没有拉黑该用户")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/blocked")
def list_blocked(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(UserBlock)
        .filter(UserBlock.blocker_id == user.id)
        .order_by(UserBlock.id.desc())
        .all()
    )
    out = []
    for b in rows:
        # 需求01：管理员不出现在黑名单列表里
        t = _visible_peer(db, b.blocked_id)
        if t:
            out.append({**_peer_brief(t), "since": b.created_at})
    return {"items": out}
