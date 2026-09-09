"""互动：点赞 / 收藏 / 评论 / 消息通知（点赞评论提醒笔记作者）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import (Comment, Favorite, Like, Note, Notification, User,
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
        {"id": c.id, "userId": c.user_id, "nickname": c.author.nickname,
         "avatarUrl": c.author.avatar, "text": c.content, "time": c.created_at}
        for c in page_rows
    ], "total": total, "hasMore": offset + len(page_rows) < total}


@router.post("/api/notes/{note_id}/comments")
def add_comment(note_id: int, body: CommentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = _visible_note(note_id, user, db)
    c = Comment(note_id=n.id, user_id=user.id, content=body.content.strip(), created_at=now_str())
    db.add(c)
    n.comments_count += 1
    _notify(db, n, user, "comment")
    db.commit()
    return {"id": c.id, "userId": user.id, "nickname": user.nickname,
            "avatarUrl": user.avatar, "text": c.content, "time": c.created_at}


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
            "noteTitle": x.note.title if x.note else "（笔记已删除）",
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
