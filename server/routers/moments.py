"""个人动态路由（P0-4，2026-09-11 增量）。

可见性（T03 三档 + 双向拉黑）：按作者 users.moment_visibility 判定 ——
public 任何登录用户可见 / friends 仅好友与本人 / private 仅本人；双向拉黑优先拒绝。
feed 可见集 = 好友 ∪ 自己 ∪ {moment_visibility='public' 的作者}，再剔除双向拉黑。
隐私红线：所有响应的作者信息只含 user_brief 白名单（id/nickname/avatarUrl），
绝不返回 phone/gender/birthday。
通知：复用 notifications 表，type 扩展 moment_like / moment_comment，note_id 置 NULL。
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import (Moment, MomentComment, MomentLike, Notification, User,
                      UserBlock, friend_ids_of, get_db, is_admin_user,
                      is_friend, now_str)
from schemas import MomentCommentIn, MomentIn, user_brief
from security import get_current_user

router = APIRouter(prefix="/api/moments", tags=["moments"])

_IMAGE_PREFIX = "/uploads/images/"


def _parse_images(raw: str) -> list[str]:
    try:
        v = json.loads(raw or "[]")
        return v if isinstance(v, list) else []
    except Exception:
        return []


def _is_blocked_either(db: Session, a: int, b: int) -> bool:
    """双向拉黑判定：任一方拉黑另一方即 True（T03 增量，C1）。"""
    return db.query(UserBlock).filter(
        or_(and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b),
            and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a))
    ).first() is not None


def _blocked_ids_either(db: Session, me_id: int) -> set[int]:
    """与我双向拉黑的全部用户 id（我拉黑的人 ∪ 拉黑我的人），feed 剔除用。"""
    rows = db.query(UserBlock.blocker_id, UserBlock.blocked_id).filter(
        or_(UserBlock.blocker_id == me_id, UserBlock.blocked_id == me_id)).all()
    out: set[int] = set()
    for blocker, blocked in rows:
        out.add(blocked if blocker == me_id else blocker)
    return out


def _public_author_ids(db: Session) -> set[int]:
    """moment_visibility='public' 的作者 id 集合（feed 可见集扩展用）。"""
    return {r[0] for r in db.query(User.id).filter(User.moment_visibility == "public").all()}


def _private_author_ids(db: Session) -> set[int]:
    """moment_visibility='private' 的作者 id 集合（feed 剔除用：好友关系不覆盖 privacy 承诺）。"""
    return {r[0] for r in db.query(User.id).filter(User.moment_visibility == "private").all()}


def _can_view(db: Session, viewer_id: int, author_id: int) -> bool:
    """动态可见性判定（T03 三档 + 双向拉黑优先拒绝）。

    - 本人恒可见；
    - 双向拉黑任一成立 → 不可见（优先于三档）；
    - 作者 moment_visibility：public 任何登录用户可见 / friends 好友或本人 / private 仅本人。
    存量 NULL/空值回退 friends（与老库默认一致）。
    """
    if viewer_id == author_id:
        return True
    if _is_blocked_either(db, viewer_id, author_id):
        return False
    author = db.get(User, author_id)
    # 需求01：管理员单向可见——其动态对任何其他人（含好友）均不可见
    if is_admin_user(author):
        return False
    vis = (author.moment_visibility if author else None) or "friends"
    if vis == "public":
        return True
    if vis == "private":
        return False
    return is_friend(db, viewer_id, author_id)


def _can_view(db: Session, viewer_id: int, author_id: int) -> bool:
    """动态可见性判定（T03 三档 + 双向拉黑优先拒绝）。

    - 本人恒可见；
    - 双向拉黑任一成立 → 不可见（优先于三档）；
    - 作者 moment_visibility：public 任何登录用户可见 / friends 好友或本人 / private 仅本人。
    存量 NULL/空值回退 friends（与老库默认一致）。
    """
    if viewer_id == author_id:
        return True
    if _is_blocked_either(db, viewer_id, author_id):
        return False
    return _visibility_allows(db, viewer_id, author_id)


def moment_dict(m: Moment, author: User, me_id: int, db: Session) -> dict:
    """动态序列化：带点赞昵称串 / 评论列表 / likedByMe / canDelete（全部公开字段）。"""
    likes = (
        db.query(MomentLike, User.nickname)
        .join(User, MomentLike.user_id == User.id)
        .filter(MomentLike.moment_id == m.id)
        .order_by(MomentLike.id)
        .all()
    )
    comments = (
        db.query(MomentComment, User.nickname, User.avatar)
        .join(User, MomentComment.user_id == User.id)
        .filter(MomentComment.moment_id == m.id)
        .order_by(MomentComment.id)
        .all()
    )
    return {
        "id": m.id,
        "author": user_brief(author),
        "content": m.content,
        "images": _parse_images(m.images),
        "createdAt": m.created_at,
        "likedByMe": any(l.user_id == me_id for l, _ in likes),
        "likes": [nickname for _, nickname in likes],
        "comments": [
            {
                "id": c.id,
                "userId": c.user_id,
                "nickname": nickname,
                "avatarUrl": avatar,
                "text": c.content,
                "time": c.created_at,
                "canDelete": c.user_id == me_id or m.user_id == me_id,
            }
            for c, nickname, avatar in comments
        ],
        "canDelete": m.user_id == me_id,
    }


def _visible_moment(db: Session, mid: int, me_id: int) -> Moment:
    """按作者可见性三档 + 双向拉黑判定，不可见则 404/403。"""
    m = db.get(Moment, mid)
    if not m:
        raise HTTPException(404, "动态不存在或已删除")
    if not _can_view(db, me_id, m.user_id):
        raise HTTPException(403, "仅好友可见该动态")
    return m


def _notify_moment(db: Session, author_id: int, actor: User, ntype: str) -> None:
    """给动态作者写通知（自己操作自己动态不提醒）。note_id 置 NULL。"""
    if author_id == actor.id:
        return
    db.add(Notification(user_id=author_id, actor_id=actor.id, type=ntype,
                        note_id=None, is_read=False, created_at=now_str()))


@router.post("")
def publish(body: MomentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """发布动态：文字 + ≤9 张图（URL 必须以 /uploads/images/ 开头，复用 uploads 上传）。"""
    content = body.content.strip()
    if not content and not body.images:
        raise HTTPException(400, "内容不能为空")
    images = [u for u in body.images if isinstance(u, str) and u.startswith(_IMAGE_PREFIX)][:9]
    if body.images and not images:
        raise HTTPException(400, "图片地址不合法")
    m = Moment(user_id=user.id, content=content, images=json.dumps(images, ensure_ascii=False),
               created_at=now_str())
    db.add(m)
    db.commit()
    return {"id": m.id}


@router.get("/feed")
def feed(before_id: int = 0, limit: int = 20,
         user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """动态流：可见集 = 好友 ∪ 自己 ∪ {momentVisibility='public' 作者}，剔除双向拉黑。
    id 游标向前翻页，时间倒序（分页语义 hasMore/nextBefore 与现状一致）。"""
    limit = min(max(limit, 1), 50)
    ids = friend_ids_of(db, user.id) | {user.id} | _public_author_ids(db)
    # BUG-1 修复：好友关系不覆盖 privacy 承诺 —— 剔除「仅自己可见」的作者（本人除外）。
    ids -= _private_author_ids(db) - {user.id}
    ids -= _blocked_ids_either(db, user.id)  # 现状 feed 未剔除黑名单
    cond = Moment.user_id.in_(ids)
    if before_id:
        cond = cond & (Moment.id < before_id)
    rows = db.query(Moment, User).join(User, Moment.user_id == User.id).filter(
        cond).order_by(Moment.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return {
        "items": [moment_dict(m, u, user.id, db) for m, u in rows],
        "hasMore": has_more,
        "nextBefore": rows[-1][0].id if has_more and rows else 0,
    }


@router.get("/user/{uid}")
def user_moments(uid: int, before_id: int = 0, limit: int = 20,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """某人动态列表（个人中心「我的动态」用）：按作者三档可见性判定 + 双向拉黑。"""
    target = db.get(User, uid)
    if not target:
        raise HTTPException(404, "用户不存在")
    if not _can_view(db, user.id, uid):
        raise HTTPException(403, "仅好友可见该动态")
    limit = min(max(limit, 1), 50)
    cond = Moment.user_id == uid
    if before_id:
        cond = cond & (Moment.id < before_id)
    rows = db.query(Moment).filter(cond).order_by(Moment.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return {
        "items": [moment_dict(m, target, user.id, db) for m in rows],
        "hasMore": has_more,
        "nextBefore": rows[-1].id if has_more and rows else 0,
    }


@router.post("/{mid}/like")
def toggle_like(mid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """点赞切换；点赞时通知作者 type='moment_like'。"""
    m = _visible_moment(db, mid, user.id)
    exist = db.query(MomentLike).filter(
        MomentLike.moment_id == m.id, MomentLike.user_id == user.id).first()
    if exist:
        db.delete(exist)
        liked = False
    else:
        db.add(MomentLike(moment_id=m.id, user_id=user.id, created_at=now_str()))
        liked = True
        _notify_moment(db, m.user_id, user, "moment_like")
    db.commit()
    count = db.query(MomentLike).filter(MomentLike.moment_id == m.id).count()
    return {"liked": liked, "likesCount": count}


@router.get("/{mid}/comments")
def list_comments(mid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """动态评论列表（旧→新）。"""
    m = _visible_moment(db, mid, user.id)
    rows = (
        db.query(MomentComment, User.nickname, User.avatar)
        .join(User, MomentComment.user_id == User.id)
        .filter(MomentComment.moment_id == m.id)
        .order_by(MomentComment.id)
        .all()
    )
    return {"items": [
        {"id": c.id, "userId": c.user_id, "nickname": nickname, "avatarUrl": avatar,
         "text": c.content, "time": c.created_at,
         "canDelete": c.user_id == user.id or m.user_id == user.id}
        for c, nickname, avatar in rows
    ]}


@router.post("/{mid}/comments")
def add_comment(mid: int, body: MomentCommentIn,
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """发表评论（≤500 字）；通知作者 type='moment_comment'。"""
    m = _visible_moment(db, mid, user.id)
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "评论不能为空")
    c = MomentComment(moment_id=m.id, user_id=user.id, content=content, created_at=now_str())
    db.add(c)
    _notify_moment(db, m.user_id, user, "moment_comment")
    db.commit()
    return {"id": c.id, "userId": user.id, "nickname": user.nickname,
            "avatarUrl": user.avatar, "text": c.content, "time": c.created_at,
            "canDelete": True}


@router.delete("/comments/{cid}")
def delete_comment(cid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """删评论：评论本人 或 动态作者（PRD 明确作者可删他人评论）。"""
    c = db.get(MomentComment, cid)
    if not c:
        raise HTTPException(404, "评论不存在")
    m = db.get(Moment, c.moment_id)
    if not m or (c.user_id != user.id and m.user_id != user.id):
        raise HTTPException(403, "只能删除自己的评论或自己动态下的评论")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.delete("/{mid}")
def delete_moment(mid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """删动态（仅作者本人）：级联删点赞/评论（DB FK CASCADE 由显式删除兜底）。"""
    m = db.get(Moment, mid)
    if not m:
        raise HTTPException(404, "动态不存在或已删除")
    if m.user_id != user.id:
        raise HTTPException(403, "只能删除自己的动态")
    # 显式清理子表（SQLite 默认不启用外键级联，避免孤儿行）
    db.query(MomentLike).filter(MomentLike.moment_id == m.id).delete()
    db.query(MomentComment).filter(MomentComment.moment_id == m.id).delete()
    db.delete(m)
    db.commit()
    return {"ok": True}
