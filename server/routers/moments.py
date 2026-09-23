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
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, Text, and_, or_
from sqlalchemy.orm import Session

from database import (Base, Moment, MomentComment, MomentLike, Notification,
                      User, UserBlock, admin_hidden_clause, engine, friend_ids_of,
                      get_db, is_friend, is_hidden_from_public, now_str)
# R170：发内容前的封禁 / 禁言闸门（moderation 模块由 R170-A 落地）
from moderation import assert_can_post
from schemas import MomentCommentIn, MomentIn, user_brief
from security import get_current_user

router = APIRouter(prefix="/api/moments", tags=["moments"])

_IMAGE_PREFIX = "/uploads/images/"

# ==========================================================================
# 需求11（R73「动态空间」）：per-moment 扩展（可见范围 / 位置 / 视频 / 链接 /
# 提醒谁看 / 评论回复嵌套）。为「零侵入」既有 moments / moment_comments 表结构，
# 扩展字段一律落在两张旁路表（moment_meta / moment_comment_meta）中，由本模块
# 自行 ensure 建表（幂等），不修改 database.py 的既有模型定义。
# 这样 old rows（无 meta 行）读取时回退默认值，行为与改造前完全一致。
# ==========================================================================


class MomentMeta(Base):
    """动态扩展元信息（1:1 moments.id）。vis_scope 语义：

    - ""             ：沿用账户级 moment_visibility（存量行为，默认）
    - "public"       ：公开（对本动态放宽到所有可见作者集的登录用户）
    - "private"      ：仅自己可见
    - "partial_allow"：部分可见（仅 vis_ids 白名单）
    - "partial_deny" ：部分不可见（vis_ids 黑名单之外可见）

    仅做「收窄」：永远不突破作者级 _can_view 的可见集承诺。
    """
    __tablename__ = "moment_meta"
    moment_id = Column(Integer, primary_key=True)
    vis_scope = Column(String(20), nullable=False, default="")
    vis_ids = Column(Text, nullable=False, default="[]")
    mention_ids = Column(Text, nullable=False, default="[]")
    location = Column(Text, nullable=False, default="")
    video = Column(Text, nullable=False, default="")
    link_url = Column(Text, nullable=False, default="")
    link_title = Column(Text, nullable=False, default="")


class MomentCommentMeta(Base):
    """动态评论扩展元信息（1:1 moment_comments.id）：parent_id>0 表示回复某评论。"""
    __tablename__ = "moment_comment_meta"
    comment_id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, nullable=False, default=0)


def _ensure_meta_tables() -> None:
    """幂等建旁路表（启动导入时执行一次，绝不触碰既有表）。"""
    MomentMeta.__table__.create(bind=engine, checkfirst=True)
    MomentCommentMeta.__table__.create(bind=engine, checkfirst=True)


_ensure_meta_tables()


def _parse_images(raw: str) -> list[str]:
    try:
        v = json.loads(raw or "[]")
        return v if isinstance(v, list) else []
    except Exception:
        return []


def _parse_ids(raw: str) -> list[int]:
    """解析 JSON 数组为 int 列表（脏数据/非整数值静默丢弃）。"""
    try:
        v = json.loads(raw or "[]")
    except Exception:
        return []
    if not isinstance(v, list):
        return []
    out: list[int] = []
    for x in v:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            continue
    return out


def _meta_of(db: Session, mid: int):
    """读取动态扩展元信息（无则 None）。"""
    return db.get(MomentMeta, mid)


def _cmeta_parent(db: Session, cid: int) -> int:
    """读取评论的 parent_id（无则 0）。"""
    cm = db.get(MomentCommentMeta, cid)
    return int(cm.parent_id) if cm else 0


def _moment_visible(db: Session, m: Moment, viewer_id: int) -> bool:
    """per-moment 可见性收窄判定（仅收窄，不放大）。

    - 本人恒可见；
    - 无 meta / vis_scope 空 / public → 恒可见（沿用账户级承诺，存量行为不变）；
    - private → 仅本人（此处非本人一律 False）；
    - partial_allow → 仅 vis_ids 白名单；
    - partial_deny → vis_ids 黑名单之外可见。
    """
    if m.user_id == viewer_id:
        return True
    meta = _meta_of(db, m.id)
    scope = (meta.vis_scope if meta else "") or ""
    if scope in ("", "public"):
        return True
    if scope == "private":
        return False
    ids = _parse_ids(meta.vis_ids if meta else "[]")
    if scope == "partial_allow":
        return viewer_id in ids
    if scope == "partial_deny":
        return viewer_id not in ids
    return True


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
    """moment_visibility='public' 且未隐身的作者 id 集合（feed 可见集扩展用）。

    R170：追加 admin_hidden_clause() —— 隐身管理员即使把动态设为 public，其动态也不进入
    普通用户 feed（现身后可见）。feed 的作者可见集不经过 _can_view，故此处需独立过滤。
    """
    return {r[0] for r in db.query(User.id).filter(
        User.moment_visibility == "public", admin_hidden_clause()).all()}


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
    # 需求01 / R170：管理员的动态对普通用户不可见 —— 仅当该管理员处于「隐身」时（统一走 helper）；
    # 现身的管理员（admin_hidden=False）其动态对普通用户可见。
    if is_hidden_from_public(author):
        return False
    vis = (author.moment_visibility if author else None) or "friends"
    if vis == "public":
        return True
    if vis == "private":
        return False
    return is_friend(db, viewer_id, author_id)


def moment_dict(m: Moment, author: User, me_id: int, db: Session) -> dict:
    """动态序列化：带点赞昵称串 / 评论列表 / likedByMe / canDelete（全部公开字段）。

    需求11 增量：追加 visScope/visIds/mentionIds/location/video/linkUrl/linkTitle
    以及每条评论的 parentId/replyTo（回复嵌套）。均为**新增**字段，既有消费者不受影响。
    """
    likes = (
        db.query(MomentLike, User.nickname)
        .join(User, MomentLike.user_id == User.id)
        .filter(MomentLike.moment_id == m.id)
        .order_by(MomentLike.id)
        .all()
    )
    # R170：被管理员隐藏的评论对普通用户不可见（feed / user_moments 详情共用此序列化）
    comments = (
        db.query(MomentComment, User.nickname, User.avatar)
        .join(User, MomentComment.user_id == User.id)
        .filter(MomentComment.moment_id == m.id, MomentComment.hidden_at == "")
        .order_by(MomentComment.id)
        .all()
    )
    name_by_id = {c.id: nickname for c, nickname, _ in comments}
    meta = _meta_of(db, m.id)
    return {
        "id": m.id,
        "author": user_brief(author),
        "content": m.content,
        "images": _parse_images(m.images),
        "createdAt": m.created_at,
        "likedByMe": any(l.user_id == me_id for l, _ in likes),
        "likes": [nickname for _, nickname in likes],
        # ---- 需求11 扩展字段（无 meta 行时回退默认，存量行为不变）----
        "visScope": (meta.vis_scope if meta else "") or "",
        "visIds": _parse_ids(meta.vis_ids if meta else "[]"),
        "mentionIds": _parse_ids(meta.mention_ids if meta else "[]"),
        "location": (meta.location if meta else "") or "",
        "video": (meta.video if meta else "") or "",
        "linkUrl": (meta.link_url if meta else "") or "",
        "linkTitle": (meta.link_title if meta else "") or "",
        "comments": [
            {
                "id": c.id,
                "userId": c.user_id,
                "nickname": nickname,
                "avatarUrl": avatar,
                "text": c.content,
                "time": c.created_at,
                "parentId": _cmeta_parent(db, c.id),
                "replyTo": name_by_id.get(_cmeta_parent(db, c.id), ""),
                "canDelete": c.user_id == me_id or m.user_id == me_id,
            }
            for c, nickname, avatar in comments
        ],
        "canDelete": m.user_id == me_id,
    }


def _visible_moment(db: Session, mid: int, me_id: int) -> Moment:
    """按作者可见性三档 + 双向拉黑判定，不可见则 404/403。

    R170：被管理员隐藏（hidden_at 非空）的动态，普通用户一律按「不存在」处理 ——
    本函数是点赞 / 评论 / 回复 / 评论列表的统一入口，挡此处即挡住全部详情路径。
    """
    m = db.get(Moment, mid)
    if not m:
        raise HTTPException(404, "动态不存在或已删除")
    if (getattr(m, "hidden_at", "") or "") != "":
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
    assert_can_post(user)  # R170：封禁 / 禁言拦截（发内容前）
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
    # R170：管理员隐藏（hidden_at 非空）的动态对普通用户不可见（治理接口在同事文件里，不走此路径）
    cond = and_(Moment.user_id.in_(ids), Moment.hidden_at == "")
    if before_id:
        cond = cond & (Moment.id < before_id)
    rows = db.query(Moment, User).join(User, Moment.user_id == User.id).filter(
        cond).order_by(Moment.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    # 需求11：per-moment 可见范围收窄（存量无 meta 行 → 恒通过，行为与改造前一致）
    rows = [(m, u) for (m, u) in rows if _moment_visible(db, m, user.id)]
    return {
        "items": [moment_dict(m, u, user.id, db) for m, u in rows],
        "hasMore": has_more and len(rows) > 0,
        "nextBefore": rows[-1][0].id if (has_more and rows) else 0,
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
    # R170：管理员隐藏（hidden_at 非空）的动态不出现在他人动态列表
    cond = and_(Moment.user_id == uid, Moment.hidden_at == "")
    if before_id:
        cond = cond & (Moment.id < before_id)
    rows = db.query(Moment).filter(cond).order_by(Moment.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    # 需求11：per-moment 可见范围收窄（本人恒可见；存量无 meta 行 → 恒通过）
    rows = [m for m in rows if _moment_visible(db, m, user.id)]
    return {
        "items": [moment_dict(m, target, user.id, db) for m in rows],
        "hasMore": has_more and len(rows) > 0,
        "nextBefore": rows[-1].id if (has_more and rows) else 0,
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
        # R170：被管理员隐藏的评论对普通用户不可见
        .filter(MomentComment.moment_id == m.id, MomentComment.hidden_at == "")
        .order_by(MomentComment.id)
        .all()
    )
    name_by_id = {c.id: nickname for c, nickname, _ in rows}
    return {"items": [
        {"id": c.id, "userId": c.user_id, "nickname": nickname, "avatarUrl": avatar,
         "text": c.content, "time": c.created_at,
         "parentId": _cmeta_parent(db, c.id),
         "replyTo": name_by_id.get(_cmeta_parent(db, c.id), ""),
         "canDelete": c.user_id == user.id or m.user_id == user.id}
        for c, nickname, avatar in rows
    ]}


@router.post("/{mid}/comments")
def add_comment(mid: int, body: MomentCommentIn,
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """发表评论（≤500 字）；通知作者 type='moment_comment'。"""
    assert_can_post(user)  # R170：封禁 / 禁言拦截
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
    db.query(MomentMeta).filter(MomentMeta.moment_id == m.id).delete()
    db.delete(m)
    db.commit()
    return {"ok": True}


# ==========================================================================
# 需求11（R73「动态空间」）增量接口：富发布（可见范围/位置/视频/链接/提醒）
# + 评论回复（嵌套）。新增路由与既有路由路径互不冲突，且不改动既有字段。
# ==========================================================================

_VIS_SCOPES = ("", "public", "private", "partial_allow", "partial_deny")


class MomentPublishIn(BaseModel):
    """富发布请求体（新增路由 /publish 使用；既有 POST /api/moments 保持不变）。"""
    content: str = Field(default="", max_length=2000)
    images: list[str] = Field(default=[], max_length=9)
    video: str = Field(default="", max_length=512)
    linkUrl: str = Field(default="", max_length=512)
    linkTitle: str = Field(default="", max_length=200)
    location: str = Field(default="", max_length=64)
    visScope: str = Field(default="")
    visIds: list[int] = Field(default=[])
    mentionIds: list[int] = Field(default=[])


class MomentReplyIn(BaseModel):
    """评论回复请求体（新增路由 /reply 使用）。"""
    content: str = Field(min_length=1, max_length=500)
    parentId: int = Field(gt=0)


def _clean_video(raw: str) -> str:
    """视频 URL 白名单：空 / /uploads/ 前缀 / http(s)。"""
    u = (raw or "").strip()
    if not u:
        return ""
    if u.startswith("/uploads/") or u.startswith("http://") or u.startswith("https://"):
        return u[:512]
    return ""


def _clean_link(raw: str) -> str:
    """链接 URL 白名单：空 / http(s) / 站内相对路径。"""
    u = (raw or "").strip()
    if not u:
        return ""
    if u.startswith(("http://", "https://", "/")):
        return u[:512]
    return ""


@router.post("/publish")
def publish_rich(body: MomentPublishIn, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """富发布（需求11）：文字 + 图片(≤9) + 视频/链接 + 位置 + 可见范围 + 提醒谁看。

    - 与既有 POST /api/moments 并存，互不影响；均写入 moments 表，天然进入同一条信息流。
    - 扩展字段写入旁路表 moment_meta（1:1）；旧数据无 meta 行 → 读取回退默认。
    """
    assert_can_post(user)  # R170：封禁 / 禁言拦截
    content = (body.content or "").strip()
    images = [u for u in (body.images or [])
              if isinstance(u, str) and u.startswith(_IMAGE_PREFIX)][:9]
    if body.images and not images:
        raise HTTPException(400, "图片地址不合法")
    video = _clean_video(body.video)
    link_url = _clean_link(body.linkUrl)
    link_title = (body.linkTitle or "").strip()[:200]
    location = (body.location or "").strip()[:64]
    vis_scope = (body.visScope or "").strip()
    if vis_scope not in _VIS_SCOPES:
        raise HTTPException(400, "可见范围取值不合法")
    if not content and not images and not video and not link_url:
        raise HTTPException(400, "内容不能为空")

    def _clean_uid_list(raw: list[int]) -> list[int]:
        """收敛到「本人 或 真实存在」的用户 id，去重且上限 200（防脏数据）。"""
        out: list[int] = []
        for x in raw or []:
            try:
                uid = int(x)
            except (TypeError, ValueError):
                continue
            if uid == user.id or db.get(User, uid) is not None:
                if uid not in out:
                    out.append(uid)
        return out[:200]

    m = Moment(user_id=user.id, content=content,
               images=json.dumps(images, ensure_ascii=False), created_at=now_str())
    db.add(m)
    db.flush()
    db.add(MomentMeta(moment_id=m.id, vis_scope=vis_scope,
                      vis_ids=json.dumps(_clean_uid_list(body.visIds)),
                      mention_ids=json.dumps(_clean_uid_list(body.mentionIds)),
                      location=location, video=video,
                      link_url=link_url, link_title=link_title))
    db.commit()
    return {"id": m.id}


@router.post("/{mid}/reply")
def reply_comment(mid: int, body: MomentReplyIn,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """回复某条评论（需求11，嵌套评论）：parent_id 落旁路表，通知动态作者与父评论作者。"""
    assert_can_post(user)  # R170：封禁 / 禁言拦截
    m = _visible_moment(db, mid, user.id)
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(400, "评论不能为空")
    parent = db.get(MomentComment, body.parentId)
    if not parent or parent.moment_id != m.id:
        raise HTTPException(400, "被回复的评论不存在")
    c = MomentComment(moment_id=m.id, user_id=user.id, content=content, created_at=now_str())
    db.add(c)
    db.flush()
    db.add(MomentCommentMeta(comment_id=c.id, parent_id=parent.id))
    _notify_moment(db, m.user_id, user, "moment_comment")
    if parent.user_id != m.user_id:
        _notify_moment(db, parent.user_id, user, "moment_comment")
    db.commit()
    pu = db.get(User, parent.user_id)
    return {"id": c.id, "userId": user.id, "nickname": user.nickname,
            "avatarUrl": user.avatar, "text": c.content, "time": c.created_at,
            "parentId": parent.id, "replyTo": (pu.nickname if pu else ""),
            "canDelete": True}
