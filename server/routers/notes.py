"""笔记：广场 / 我的 / 回收站 / 详情 / 增删改 / 归档 / 搜索。权限规则：
- 广场（plaza）：所有登录用户可见 published + public 且未删除的笔记；
- 私密 / 草稿 / 归档：仅作者本人可见；
- 回收站：软删除的笔记只有作者本人可查看 / 恢复 / 彻底删除。
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import Favorite, Like, Note, User, get_db, now_str
from schemas import NoteIn, NotePatch, note_card, note_detail
from security import get_current_user

router = APIRouter(prefix="/api/notes", tags=["notes"])


def _active():
    """过滤未删除笔记（软删除列 IS NULL）。"""
    return Note.deleted_at.is_(None)


def _own_note(note_id: int, user: User, db: Session) -> Note:
    n = db.get(Note, note_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "笔记不存在")
    return n


def _active_note(note_id: int, user: User, db: Session) -> Note:
    """取作者自己的“未删除”笔记；若已在回收站则视为不存在。"""
    n = _own_note(note_id, user, db)
    if n.deleted_at:
        raise HTTPException(404, "笔记不存在（已在回收站）")
    return n


@router.get("")
def list_notes(
    scope: str = "plaza",
    category: str = "",
    tag: str = "",
    q: str = "",
    status: str = "",
    with_content: int = 0,
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """scope=plaza 全站公开笔记；scope=mine 我的所有笔记（可按 status 过滤）；scope=favorite 我收藏的。

    分页：page 从 1 开始，page_size 1~100（默认 20）；page_size=0 表示不分页返回全部（供导出/计数）。
    """
    query = db.query(Note)
    if scope == "mine":
        query = query.filter(and_(Note.user_id == user.id, _active()))
        if status:
            query = query.filter(Note.status == status)
    elif scope == "favorite":  # 我收藏的（任意作者的公开笔记）
        fav_ids = [x.note_id for x in db.query(Favorite).filter(Favorite.user_id == user.id)]
        query = query.filter(and_(
            Note.id.in_(fav_ids or [0]),
            Note.status == "published",
            Note.privacy == "public",
            _active(),
        ))
    else:  # plaza
        query = query.filter(and_(Note.status == "published", Note.privacy == "public", _active()))
    if category:
        query = query.filter(Note.category == category)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Note.title.like(like), Note.content.like(like), Note.tags.like(like), Note.excerpt.like(like)))
    rows = query.order_by(Note.created_at.desc()).all()
    if tag:
        rows = [n for n in rows if tag in json.loads(n.tags or "[]")]
    total = len(rows)

    page_size = 0 if page_size == 0 else min(max(page_size, 1), 100)
    start = (max(page, 1) - 1) * page_size if page_size else 0
    page_rows = rows[start:start + page_size] if page_size else rows
    has_more = bool(page_size) and total > start + len(page_rows)

    liked_ids = {x.note_id for x in db.query(Like).filter(Like.user_id == user.id)}
    fav_ids = {x.note_id for x in db.query(Favorite).filter(Favorite.user_id == user.id)}
    return {
        "items": [
            note_card(n, liked=(n.id in liked_ids), favorited=(n.id in fav_ids), with_content=bool(with_content))
            for n in page_rows
        ],
        "total": total,
        "page": start // page_size + 1 if page_size else 1,
        "hasMore": has_more,
    }


@router.get("/trash")
def trash_notes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """我的回收站：软删除的笔记（可按删除时间倒序）。"""
    rows = (
        db.query(Note)
        .filter(and_(Note.user_id == user.id, Note.deleted_at.isnot(None)))
        .order_by(Note.deleted_at.desc())
        .all()
    )
    return {"items": [note_card(n) for n in rows]}


@router.get("/search")
def search_notes(q: str = "", page: int = 1, page_size: int = 20,
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """全局搜索：仅检索公开笔记标题 / 内容 / 标签 / 摘要（支持分页）。"""
    kw = q.strip()
    if not kw:
        return {"items": [], "total": 0}
    like = f"%{kw}%"
    base = (db.query(Note)
            .filter(and_(Note.status == "published", Note.privacy == "public", _active()))
            .filter(or_(Note.title.like(like), Note.content.like(like),
                        Note.tags.like(like), Note.excerpt.like(like))))
    total = base.count()
    size = min(max(page_size, 1), 50)
    rows = (base.order_by(Note.created_at.desc())
            .offset((max(page, 1) - 1) * size).limit(size).all())
    return {"items": [note_card(n) for n in rows], "total": total,
            "hasMore": total > max(page, 1) * size}


@router.get("/mine/stats")
def my_stats(user: User = Depends(get_current_user)):
    notes = [n for n in user.notes if not n.deleted_at]
    return {"total": len(notes)}


@router.post("/{note_id}/restore")
def restore_note(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """从回收站恢复笔记。"""
    n = _own_note(note_id, user, db)
    if not n.deleted_at:
        raise HTTPException(400, "该笔记不在回收站")
    n.deleted_at = None
    db.commit()
    return note_card(n)


@router.delete("/trash/{note_id}")
def purge_note(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """从回收站彻底删除（不可恢复）。"""
    n = _own_note(note_id, user, db)
    if not n.deleted_at:
        raise HTTPException(400, "该笔记不在回收站，无需彻底删除")
    db.delete(n)
    db.commit()
    return {"ok": True}


@router.get("/{note_id}")
def get_note(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.get(Note, note_id)
    if not n or n.deleted_at:
        raise HTTPException(404, "笔记不存在")
    is_owner = n.user_id == user.id
    visible = n.status == "published" and n.privacy == "public"
    if not visible and not is_owner:
        raise HTTPException(403, "该笔记为私密或未发布，仅作者可见")
    # 浏览量 +1（作者本人不计）
    if not is_owner:
        n.views = (n.views or 0) + 1
        db.commit()
        db.refresh(n)
    liked = db.query(Like).filter(Like.note_id == n.id, Like.user_id == user.id).first() is not None
    favorited = db.query(Favorite).filter(Favorite.note_id == n.id, Favorite.user_id == user.id).first() is not None
    # 广场上 / 下一篇（在公开笔记序列内）
    prev = nxt = None
    if visible:
        pubs = (
            db.query(Note)
            .filter(and_(Note.status == "published", Note.privacy == "public", _active()))
            .order_by(Note.created_at.desc())
            .all()
        )
        idx = next((i for i, x in enumerate(pubs) if x.id == n.id), -1)
        if idx > 0:
            prev = pubs[idx - 1]
        if 0 <= idx < len(pubs) - 1:
            nxt = pubs[idx + 1]
    return note_detail(n, liked=liked, favorited=favorited, prev=prev, nxt=nxt)


@router.post("")
def create_note(body: NoteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = now_str()
    n = Note(
        user_id=user.id,
        title=body.title.strip(),
        category=body.category,
        privacy=body.privacy if body.privacy in ("public", "private") else "public",
        status=body.status if body.status in ("published", "draft", "archived") else "draft",
        cover=body.cover or "",
        tags=json.dumps([str(t)[:20] for t in body.tags[:6]], ensure_ascii=False),
        content=body.content,
        excerpt=body.content.replace("\n", " ")[:80] or "（暂无内容）",
        views=0,
        created_at=now,
        updated_at=now,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return note_card(n, with_content=True)


@router.put("/{note_id}")
def update_note(note_id: int, body: NoteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = _active_note(note_id, user, db)
    n.title = body.title.strip()
    n.category = body.category
    n.privacy = body.privacy if body.privacy in ("public", "private") else n.privacy
    n.status = body.status if body.status in ("published", "draft", "archived") else n.status
    n.cover = body.cover or ""
    n.tags = json.dumps([str(t)[:20] for t in body.tags[:6]], ensure_ascii=False)
    n.content = body.content
    n.excerpt = body.content.replace("\n", " ")[:80] or "（暂无内容）"
    n.updated_at = now_str()
    db.commit()
    db.refresh(n)
    return note_card(n, with_content=True)


@router.patch("/{note_id}")
def patch_note(note_id: int, body: NotePatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """局部更新：归档 / 恢复 / 改可见性。"""
    n = _active_note(note_id, user, db)
    if body.status is not None and body.status in ("published", "draft", "archived"):
        n.status = body.status
    if body.privacy is not None and body.privacy in ("public", "private"):
        n.privacy = body.privacy
    n.updated_at = now_str()
    db.commit()
    return note_card(n)


@router.delete("/{note_id}")
def delete_note(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """删除 = 移入回收站（软删除），可在回收站恢复或彻底删除。"""
    n = _active_note(note_id, user, db)
    n.deleted_at = now_str()
    db.commit()
    return {"ok": True, "message": "已移入回收站，可在回收站恢复"}
