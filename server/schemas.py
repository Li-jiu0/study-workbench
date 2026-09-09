"""Pydantic 请求/响应模型与笔记序列化。"""
import json

from pydantic import BaseModel, Field


# ---------- 请求 ----------
class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    password: str = Field(min_length=6, max_length=64)
    nickname: str = Field(default="", max_length=20)


class LoginIn(BaseModel):
    username: str
    password: str


class RefreshIn(BaseModel):
    refresh: str = Field(min_length=1)


class ProfileIn(BaseModel):
    nickname: str = Field(default="", max_length=20)
    motto: str = Field(default="", max_length=60)
    bio: str = Field(default="", max_length=300)
    gender: str = Field(default="secret", max_length=16)
    birthday: str = Field(default="", max_length=10)
    city: str = Field(default="", max_length=64)


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=200_000)
    category: str = "other"
    privacy: str = "public"
    status: str = "draft"
    cover: str = ""
    tags: list[str] = []


class NotePatch(BaseModel):
    """归档/恢复等局部更新。"""
    status: str | None = None
    privacy: str | None = None


class CommentIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class ChatIn(BaseModel):
    provider: str
    messages: list[dict]
    noteId: int | None = None        # 可选：让 AI 读取这篇笔记作为上下文（作者本人笔记或公开笔记）
    temperature: float | None = None  # 0~2，缺省用服务商默认
    maxTokens: int | None = None      # 可选：输出上限


class MigrateIn(BaseModel):
    notes: list[dict]


# ---------- 序列化 ----------
def user_brief(u) -> dict:
    return {
        "id": u.id,
        "nickname": u.nickname,
        "avatarUrl": u.avatar,
    }


def note_tags(n) -> list:
    try:
        v = json.loads(n.tags or "[]")
        return v if isinstance(v, list) else []
    except Exception:
        return []


def note_card(n, *, liked=False, favorited=False, with_content=False) -> dict:
    """列表卡片（不含正文，除非 with_content=True）。"""
    d = {
        "id": n.id,
        "userId": n.user_id,
        "author": user_brief(n.author),
        "title": n.title,
        "category": n.category,
        "privacy": n.privacy,
        "status": n.status,
        "cover": n.cover or "",
        "tags": note_tags(n),
        "excerpt": n.excerpt,
        "views": n.views,
        "likes": n.likes_count,
        "commentsCount": n.comments_count,
        "liked": liked,
        "favorited": favorited,
        "createdAt": n.created_at,
        "updatedAt": n.updated_at,
        "deletedAt": n.deleted_at or "",
    }
    if with_content:
        d["content"] = n.content
    return d


def note_detail(n, *, liked=False, favorited=False, prev=None, nxt=None) -> dict:
    d = note_card(n, liked=liked, favorited=favorited, with_content=True)
    d["comments"] = [
        {
            "id": c.id,
            "userId": c.user_id,
            "nickname": c.author.nickname,
            "avatarUrl": c.author.avatar,
            "text": c.content,
            "time": c.created_at,
        }
        for c in reversed(n.comments)  # 新评论在前
    ]
    d["prev"] = {"id": prev.id, "title": prev.title} if prev else None
    d["next"] = {"id": nxt.id, "title": nxt.title} if nxt else None
    return d
