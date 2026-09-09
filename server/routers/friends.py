"""好友：申请 / 收件箱 / 同意 / 拒绝 / 删除 / 用户搜索。

好友表单向存归一化小号在前（见 database.friend_pair），双向查询都命中同一行。
规则：不能加自己；已是好友不能再申请；对方先申请了我则“申请=直接成为好友”。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import (Friend, FriendRequest, User, UserBlock, friend_pair,
                      get_db, is_friend, now_iso)
from schemas import user_brief
from security import get_current_user

router = APIRouter(prefix="/api/friends", tags=["friends"])


class ReqIn(BaseModel):
    toUserId: int = Field(gt=0)


class BlockIn(BaseModel):
    userId: int = Field(gt=0)


def _peer_brief(u: User) -> dict:
    return {**user_brief(u), "motto": u.motto}


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
    if not to:
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
    def _row(r: FriendRequest, me_id: int) -> dict:
        peer = r.from_user if r.to_user_id == me_id else r.to_user
        return {"id": r.id, "fromMe": r.from_user_id == me_id,
                "user": _peer_brief(peer), "createdAt": r.created_at}
    pending_in = db.query(FriendRequest).filter(
        FriendRequest.to_user_id == user.id, FriendRequest.status == "pending"
    ).order_by(FriendRequest.id.desc()).all()
    pending_out = db.query(FriendRequest).filter(
        FriendRequest.from_user_id == user.id, FriendRequest.status == "pending"
    ).order_by(FriendRequest.id.desc()).all()
    return {
        "incoming": [_row(r, user.id) for r in pending_in],
        "outgoing": [_row(r, user.id) for r in pending_out],
    }


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


@router.get("/search")
def search_users(q: str = "", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """搜索用户以便加好友（排除自己；已在好友列表或已是对方好友的带标记）。"""
    kw = q.strip()
    if not kw:
        return {"items": []}
    like = f"%{kw}%"
    rows = (
        db.query(User)
        .filter(User.id != user.id)
        .filter(or_(User.username.like(like), User.nickname.like(like)))
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
    out = []
    for f in rows:
        peer_id = f.user_b if f.user_a == user.id else f.user_a
        peer = db.get(User, peer_id)
        if peer:
            out.append({**_peer_brief(peer), "since": f.created_at})
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
        t = db.get(User, b.blocked_id)
        if t:
            out.append({**_peer_brief(t), "since": b.created_at})
    return {"items": out}
