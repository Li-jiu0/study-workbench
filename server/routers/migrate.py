"""本地笔记迁移：把旧版 localStorage 里的笔记批量导入服务器（当前用户名下）。"""
import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import Comment, Note, get_db, now_str
from schemas import MigrateIn
from security import get_current_user

router = APIRouter(tags=["migrate"])


def _norm_time(ts) -> str:
    """旧格式 '2026-09-08T21:30' 或时间戳 → 'YYYY-MM-DD HH:MM'。"""
    s = str(ts or "").strip()
    if not s:
        return now_str()
    if s.isdigit():
        from datetime import datetime
        return datetime.fromtimestamp(int(s) / 1000 if len(s) > 10 else int(s)).strftime("%Y-%m-%d %H:%M")
    return s.replace("T", " ")[:16]


@router.post("/api/migrate/notes")
def migrate_notes(body: MigrateIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    """按（标题 + 创建时间）去重，可安全重复调用；旧评论导入为当前用户的评论。"""
    existing = {(n.title, n.created_at) for n in user.notes}
    imported, skipped = 0, 0
    for raw in body.notes[:500]:
        title = str(raw.get("title") or "").strip()[:200]
        content = str(raw.get("content") or "")
        if not title and not content:
            continue
        created = _norm_time(raw.get("createdAt"))
        if (title, created) in existing:
            skipped += 1
            continue
        status = raw.get("status") if raw.get("status") in ("published", "draft", "archived") else "draft"
        privacy = raw.get("privacy") if raw.get("privacy") in ("public", "private") else "public"
        tags = [str(t)[:20] for t in (raw.get("tags") or []) if t][:6]
        cover = str(raw.get("cover") or "")[:512]
        views = int(raw.get("views") or 0)
        likes = int(raw.get("likes") or 0)
        now = now_str()
        n = Note(
            user_id=user.id,
            title=title or "（无标题）",
            category=raw.get("category") if raw.get("category") in
            ("cet", "exam", "comm", "interview", "ppt", "other") else "other",
            privacy=privacy,
            status=status,
            cover=cover,
            tags=json.dumps(tags, ensure_ascii=False),
            content=content,
            excerpt=content.replace("\n", " ")[:80] or "（暂无内容）",
            views=views,
            likes_count=likes,  # 本地点赞数原样带入（历史数据）
            created_at=created,
            updated_at=_norm_time(raw.get("updatedAt")) or now,
        )
        db.add(n)
        db.flush()
        # 旧评论：{name, text, time} → 归到当前用户名下（旧版本没有真实多用户）
        for c in (raw.get("comments") or [])[:200]:
            text = str(c.get("text") or "").strip()
            if text:
                db.add(Comment(
                    note_id=n.id,
                    user_id=user.id,
                    content=text[:2000],
                    created_at=_norm_time(c.get("time")) or now,
                ))
                n.comments_count += 1
        existing.add((title, created))
        imported += 1
    db.commit()
    return {"imported": imported, "skipped": skipped}
