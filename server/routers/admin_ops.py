"""R170（2026-09-23）管理员全能治理台 —— 服务端全部写操作接口。

设计说明（仿 routers/admin.py 风格）：
  - 本模块是既有只读观察台（routers/admin.py，/api/admin/overview|users|online|feedback）
    的**写操作增量**，不改动其任何行为；两者共用同一 /api/admin 前缀，路径互不冲突。
  - 鉴权依赖复用 routers.admin._require_admin（已登录 + is_admin，否则 403），不重写。
  - 单向可见原则不变：管理员的隐身开关（admin_hidden）**只影响普通用户视角过滤**，
    不影响本模块任何读写能力；反向（管理员看全站）完全放开。
  - 审计：所有写操作落一条 admin_op_logs（_op_log，随业务事务一并提交）。
  - 时间统一 now_iso()（'YYYY-MM-DD HH:MM:SS'）；笔记软删 deleted_at 沿用 now_str()（'YYYY-MM-DD HH:MM'）。
  - 边界红线：
      * 治理目标一律过 _guard_target 闸（不能对自己 / 不能对其他管理员）；
      * 彻底删除用户为**单事务 + 可回滚**（任何异常 db.rollback() 并 500）；
      * 私聊仅提供「只读 + 单删」，**不提供**以管理员身份发私聊的接口（避免冒充用户）。

路由清单：
  用户治理   GET/POST/PATCH/DELETE /api/admin/users/{uid}/(data-summary|ban|unban|mute|kick|reset-password|profile)
  内容治理   /api/admin/content/(summary|moments|moment-comments|notes|board|board-replies)
  全站公告   /api/admin/announcements*（管理）  /api/announcements*（普通用户，router_public）
  群组管理   /api/admin/groups*
  私聊查看   /api/admin/chat/(threads|thread/{a}/{b}/messages|search|messages/{mid})
  审计/隐身  /api/admin/logs  /api/admin/me/visibility
"""
import datetime as _dt
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from database import (AdminOpLog, AiLog, AiUsage, Announcement, BoardLike,
                      BoardMessage, BoardReply, ChatGroup, ChatGroupMember,
                      Comment, EmailCode, Favorite, Feedback, Friend,
                      FriendRemark, FriendRequest, Like, LiveLocation, Message,
                      Moment, MomentComment, MomentLike, Note, Notification,
                      StudyLog, User, UserAppList, UserAppSig, UserBlock,
                      UserDevice,
                      get_db, is_admin_user, now_iso, now_str)
from routers.admin import _is_online, _require_admin, _user_row
from routers.moments import MomentCommentMeta, MomentMeta
from schemas import (check_account_format, check_email_format,
                     check_password_strength)
from security import get_current_user, hash_password

router = APIRouter(prefix="/api/admin", tags=["admin-ops"])
# 普通用户侧（全站公告）走独立 router，不带 /admin 前缀（路径写全 /api/announcements）。
router_public = APIRouter(tags=["announce-public"])

_TS = "%Y-%m-%d %H:%M:%S"

_MAX_MUTE_MINUTES = 43200  # 30 天


# ==========================================================================
# 通用 helper
# ==========================================================================
def _op_log(db: Session, admin: User, action: str, target_type: str = "",
            target_id: int | None = None, detail: str = "") -> None:
    """往 AdminOpLog 落一条审计（同一事务内 db.add，由调用方 commit）。"""
    db.add(AdminOpLog(admin_id=admin.id, action=action, target_type=target_type,
                      target_id=target_id, detail=(detail or "")[:2000], created_at=now_iso()))


def _get_user_or_404(db: Session, uid: int) -> User:
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "用户不存在")
    return u


def _guard_target(admin: User, target: User) -> User:
    """治理目标闸：不存在 / 是自己 / 是其他管理员 → 拒绝。返回 target 便于链式使用。"""
    if target is None:
        raise HTTPException(404, "用户不存在")
    if target.id == admin.id:
        raise HTTPException(400, "不能对自己执行该操作")
    if is_admin_user(target):
        raise HTTPException(400, "不能对其他管理员执行该操作")
    return target


def _bump_token(db: Session, u: User) -> None:
    """踢下线 = 令牌版本 +1（security.py 校验 tv 后该用户全部已签发令牌立即失效）。"""
    u.token_version = int(getattr(u, "token_version", 0) or 0) + 1


def _images(raw) -> list:
    try:
        v = json.loads(raw or "[]")
        return v if isinstance(v, list) else []
    except Exception:
        return []


def _name_of(names: dict, uid: int) -> str:
    return names.get(uid) or "已注销用户"


# ==========================================================================
# 3.1 用户治理
# ==========================================================================
@router.get("/users/{uid}/data-summary")
def user_data_summary(uid: int, admin: User = Depends(_require_admin),
                      db: Session = Depends(get_db)):
    """删除前预览：该用户名下各表行数（只读）。"""
    u = _get_user_or_404(db, uid)
    counts = {
        "moments": db.query(Moment).filter(Moment.user_id == uid).count(),
        "notes": db.query(Note).filter(Note.user_id == uid).count(),
        "noteComments": db.query(Comment).filter(Comment.user_id == uid).count(),
        "momentComments": db.query(MomentComment).filter(MomentComment.user_id == uid).count(),
        "board": db.query(BoardMessage).filter(BoardMessage.user_id == uid).count(),
        "messages": db.query(Message).filter(
            or_(Message.sender_id == uid, Message.receiver_id == uid)).count(),
        "friends": db.query(Friend).filter(
            or_(Friend.user_a == uid, Friend.user_b == uid)).count(),
        "devices": db.query(UserDevice).filter(UserDevice.user_id == uid).count(),
        "aiLogs": db.query(AiLog).filter(AiLog.user_id == uid).count(),
        "studyLogs": db.query(StudyLog).filter(StudyLog.user_id == uid).count(),
    }
    return {
        "user": {"id": u.id, "username": u.username,
                 "account": u.account or "", "nickname": u.nickname},
        "counts": counts,
    }


class BanIn(BaseModel):
    reason: str = ""


@router.post("/users/{uid}/ban")
def ban_user(uid: int, body: BanIn, admin: User = Depends(_require_admin),
             db: Session = Depends(get_db)):
    """封禁：is_banned=1 + 记录时间 / 原因，并踢下线（令牌版本 +1）。"""
    t = _guard_target(admin, _get_user_or_404(db, uid))
    reason = (body.reason or "").strip()[:200]
    t.is_banned = True
    t.banned_at = now_iso()
    t.banned_reason = reason
    _bump_token(db, t)
    _op_log(db, admin, "user_ban", "user", uid,
            f"username={t.username},reason={reason}")
    db.commit()
    return {"ok": True, "isBanned": True, "bannedAt": t.banned_at,
            "bannedReason": reason}


@router.post("/users/{uid}/unban")
def unban_user(uid: int, admin: User = Depends(_require_admin),
               db: Session = Depends(get_db)):
    """解封：清 is_banned / banned_at / banned_reason（**不动 token_version**，可直接重新登录）。"""
    t = _guard_target(admin, _get_user_or_404(db, uid))
    t.is_banned = False
    t.banned_at = ""
    t.banned_reason = ""
    _op_log(db, admin, "user_unban", "user", uid, f"username={t.username}")
    db.commit()
    return {"ok": True, "isBanned": False}


class MuteIn(BaseModel):
    minutes: int


@router.post("/users/{uid}/mute")
def mute_user(uid: int, body: MuteIn, admin: User = Depends(_require_admin),
              db: Session = Depends(get_db)):
    """禁言：minutes<=0 → 解除；否则现在 + minutes 分钟为到期时间（上限 30 天）。"""
    t = _guard_target(admin, _get_user_or_404(db, uid))
    m = int(body.minutes)
    if m > _MAX_MUTE_MINUTES:
        raise HTTPException(400, "禁言时长最长 30 天")
    if m <= 0:
        t.mute_until = ""
    else:
        t.mute_until = (_dt.datetime.now() + _dt.timedelta(minutes=m)).strftime(_TS)
    _op_log(db, admin, "user_mute", "user", uid,
            f"username={t.username},minutes={m}")
    db.commit()
    return {"ok": True, "muteUntil": t.mute_until or ""}


@router.post("/users/{uid}/kick")
def kick_user(uid: int, admin: User = Depends(_require_admin),
              db: Session = Depends(get_db)):
    """踢下线：令牌版本 +1 → 该用户全部已签发令牌立即失效，需重新登录。"""
    t = _guard_target(admin, _get_user_or_404(db, uid))
    _bump_token(db, t)
    _op_log(db, admin, "user_kick", "user", uid, f"username={t.username}")
    db.commit()
    return {"ok": True}


class ResetPwIn(BaseModel):
    newPassword: str = ""


@router.post("/users/{uid}/reset-password")
def reset_password(uid: int, body: ResetPwIn, admin: User = Depends(_require_admin),
                   db: Session = Depends(get_db)):
    """管理员重置密码：走 check_password_strength 校验，通过后落库 + 踢下线。"""
    t = _guard_target(admin, _get_user_or_404(db, uid))
    try:
        check_password_strength(body.newPassword or "")
    except ValueError as e:
        raise HTTPException(400, str(e))
    t.password_hash = hash_password(body.newPassword)
    _bump_token(db, t)
    _op_log(db, admin, "user_reset_password", "user", uid, f"username={t.username}")
    db.commit()
    return {"ok": True}


class ProfilePatchIn(BaseModel):
    nickname: str | None = None
    motto: str | None = None
    bio: str | None = None
    city: str | None = None
    goal: str | None = None
    tags: str | None = None
    gender: str | None = None
    account: str | None = None
    email: str | None = None


@router.patch("/users/{uid}/profile")
def patch_profile(uid: int, body: ProfilePatchIn, admin: User = Depends(_require_admin),
                  db: Session = Depends(get_db)):
    """改资料：仅更新非 None 字段；不能改**其他**管理员资料（可改自己 / 普通用户）。

    - nickname 非空且 ≤64；account 走 check_account_format + 忽略大小写查重；
      email 走 check_email_format + 查重（email 传空串 = 解绑）。
    - 改 account / email 一律顺带清 email_verified_at（改邮箱后原验证失效）。
    """
    t = _get_user_or_404(db, uid)
    if is_admin_user(t) and t.id != admin.id:
        raise HTTPException(400, "不能修改其他管理员的资料")
    changed: list[str] = []
    if body.nickname is not None:
        nick = body.nickname.strip()
        if not nick:
            raise HTTPException(400, "昵称不能为空")
        if len(nick) > 64:
            raise HTTPException(400, "昵称最长 64 字")
        t.nickname = nick
        changed.append("nickname")
    if body.motto is not None:
        t.motto = body.motto[:256]
        changed.append("motto")
    if body.bio is not None:
        t.bio = body.bio[:300]
        changed.append("bio")
    if body.city is not None:
        t.city = body.city[:64]
        changed.append("city")
    if body.goal is not None:
        t.goal = body.goal[:120]
        changed.append("goal")
    if body.tags is not None:
        t.tags = body.tags[:300]
        changed.append("tags")
    if body.gender is not None:
        g = body.gender.strip()
        if g not in ("secret", "male", "female"):
            raise HTTPException(400, "性别取值不合法")
        t.gender = g
        changed.append("gender")
    if body.account is not None:
        try:
            acct = check_account_format(body.account)
        except ValueError as e:
            raise HTTPException(400, str(e))
        dup = db.query(User).filter(func.lower(User.account) == acct.lower(),
                                    User.id != t.id).first()
        if dup:
            raise HTTPException(400, "账号已被占用")
        t.account = acct
        t.email_verified_at = None
        changed.append("account")
    if body.email is not None:
        raw = body.email.strip()
        if raw == "":
            t.email = None
            t.email_verified_at = None
            changed.append("email")
        else:
            try:
                em = check_email_format(raw)
            except ValueError as e:
                raise HTTPException(400, str(e))
            dup = db.query(User).filter(func.lower(User.email) == em.lower(),
                                        User.id != t.id).first()
            if dup:
                raise HTTPException(400, "邮箱已被占用")
            t.email = em
            t.email_verified_at = None
            changed.append("email")
    if changed:
        _op_log(db, admin, "user_profile", "user", uid,
                f"username={t.username},fields={','.join(changed)}")
        db.commit()
    return {"ok": True, "changed": changed}


@router.delete("/users/{uid}")
def delete_user(uid: int, confirm: str = Query(default=""),
                admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """彻底删除用户（单事务 + 可回滚）。confirm 必须与 username 或 account 完全一致。

    硬删全部关联数据（messages/moments/notes/board/friends/groups…），feedbacks.user_id
    置 NULL（保留行，与表定义 ondelete=SET NULL 语义一致）；任何异常回滚并 500。
    """
    t = _guard_target(admin, _get_user_or_404(db, uid))
    want = (confirm or "").strip()
    if want not in ((t.username or "").strip(), (t.account or "").strip()):
        raise HTTPException(400, "确认信息不匹配")

    deleted: dict[str, int] = {}

    def _purge(model, *conds) -> int:
        q = db.query(model)
        if conds:
            q = q.filter(*conds)
        n = int(q.delete(synchronize_session=False) or 0)
        if n:
            key = model.__tablename__
            deleted[key] = deleted.get(key, 0) + n
        return n

    try:
        # 1) 私聊 / 群聊消息（sender 或 receiver 是该用户）
        _purge(Message, or_(Message.sender_id == uid, Message.receiver_id == uid))
        # 2) 动态：作者自删的评论/点赞 + 别人对该用户动态的评论/点赞 + 旁路表
        moment_ids = [r[0] for r in db.query(Moment.id).filter(Moment.user_id == uid).all()]
        own_cids = [r[0] for r in db.query(MomentComment.id).filter(MomentComment.user_id == uid).all()]
        on_moment_cids = []
        if moment_ids:
            on_moment_cids = [r[0] for r in db.query(MomentComment.id).filter(
                MomentComment.moment_id.in_(moment_ids)).all()]
        all_cids = list(set(own_cids) | set(on_moment_cids))
        if all_cids:
            _purge(MomentCommentMeta, MomentCommentMeta.comment_id.in_(all_cids))
        _purge(MomentComment, MomentComment.user_id == uid)
        if moment_ids:
            _purge(MomentComment, MomentComment.moment_id.in_(moment_ids))
        _purge(MomentLike, MomentLike.user_id == uid)
        if moment_ids:
            _purge(MomentLike, MomentLike.moment_id.in_(moment_ids))
            _purge(MomentMeta, MomentMeta.moment_id.in_(moment_ids))
        _purge(Moment, Moment.user_id == uid)
        # 3) 留言板：本人留言/点赞/回复 + 别人对本人留言的点赞/回复
        board_ids = [r[0] for r in db.query(BoardMessage.id).filter(BoardMessage.user_id == uid).all()]
        _purge(BoardLike, BoardLike.user_id == uid)
        _purge(BoardReply, BoardReply.user_id == uid)
        if board_ids:
            _purge(BoardLike, BoardLike.message_id.in_(board_ids))
            _purge(BoardReply, BoardReply.message_id.in_(board_ids))
        _purge(BoardMessage, BoardMessage.user_id == uid)
        # 4) 笔记：本人点赞/收藏/评论 + 别人对本人笔记的点赞/收藏/评论 + 笔记（含已软删行）
        note_ids = [r[0] for r in db.query(Note.id).filter(Note.user_id == uid).all()]
        _purge(Like, Like.user_id == uid)
        _purge(Favorite, Favorite.user_id == uid)
        _purge(Comment, Comment.user_id == uid)
        if note_ids:
            _purge(Like, Like.note_id.in_(note_ids))
            _purge(Favorite, Favorite.note_id.in_(note_ids))
            _purge(Comment, Comment.note_id.in_(note_ids))
            _purge(Notification, Notification.note_id.in_(note_ids))
        _purge(Note, Note.user_id == uid)
        # 5) 好友申请 / 好友关系 / 备注 / 拉黑
        _purge(FriendRequest, or_(FriendRequest.from_user_id == uid,
                                  FriendRequest.to_user_id == uid))
        _purge(Friend, or_(Friend.user_a == uid, Friend.user_b == uid))
        _purge(FriendRemark, or_(FriendRemark.owner_id == uid, FriendRemark.peer_id == uid))
        _purge(UserBlock, or_(UserBlock.blocker_id == uid, UserBlock.blocked_id == uid))
        # 6) 通知 / 学习日志 / AI 用量与日志 / 邮箱验证码 / 设备 / 应用指纹
        _purge(Notification, Notification.user_id == uid)
        _purge(StudyLog, StudyLog.user_id == uid)
        _purge(AiUsage, AiUsage.user_id == uid)
        _purge(AiLog, AiLog.user_id == uid)
        _purge(EmailCode, EmailCode.user_id == uid)
        _purge(UserDevice, UserDevice.user_id == uid)
        _purge(UserAppSig, UserAppSig.user_id == uid)
        # R171：应用列表同样属个人数据，必须随用户删除一起清（否则残留行 + id 复用会串数据）
        _purge(UserAppList, UserAppList.user_id == uid)
        # 7) 实时位置会话
        _purge(LiveLocation, LiveLocation.owner_id == uid)
        # 8) 反馈：置 user_id=NULL（保留行；与 ondelete=SET NULL 语义一致）
        n_fb = int(db.query(Feedback).filter(Feedback.user_id == uid)
                   .update({"user_id": None}, synchronize_session=False) or 0)
        if n_fb:
            deleted["feedbacks"] = n_fb
        # 9) 群相关：本人为群主的群 → 解散；其余群退群
        owned_gids = [r[0] for r in db.query(ChatGroup.id).filter(ChatGroup.owner_id == uid).all()]
        for gid in owned_gids:
            _purge(Message, Message.group_id == gid)
            _purge(ChatGroupMember, ChatGroupMember.group_id == gid)
            _purge(ChatGroup, ChatGroup.id == gid)
        _purge(ChatGroupMember, ChatGroupMember.user_id == uid)
        # 10) 审计日志（在删 user 行之前 add，随同事务提交）
        _op_log(db, admin, "user_delete", "user", uid, f"username={t.username}")
        # 11) 最后删 users 行
        db.delete(t)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "删除失败，已回滚")

    return {"ok": True, "deleted": deleted, "total": sum(deleted.values())}


# ==========================================================================
# 3.3 内容治理
# ==========================================================================
@router.get("/content/summary")
def content_summary(admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """内容总量（含已隐藏 / 已软删）。"""
    return {
        "moments": db.query(Moment).count(),
        "momentComments": db.query(MomentComment).count(),
        "notes": db.query(Note).count(),
        "board": db.query(BoardMessage).count(),
        "boardReplies": db.query(BoardReply).count(),
    }


@router.get("/content/moments")
def content_moments(offset: int = 0, limit: int = 50, q: str = "",
                    admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """全量动态（含已隐藏）；q 按内容 LIKE 过滤；倒序。"""
    query = db.query(Moment, User).outerjoin(User, Moment.user_id == User.id)
    if (q or "").strip():
        query = query.filter(Moment.content.like(f"%{q.strip()}%"))
    rows = (query.order_by(Moment.id.desc())
            .offset(max(offset, 0)).limit(min(max(limit, 1), 200)).all())
    return {"items": [{
        "id": m.id, "userId": m.user_id,
        "nickname": (u.nickname if u else "已注销用户"),
        "content": m.content, "images": _images(m.images),
        "createdAt": m.created_at, "hiddenAt": getattr(m, "hidden_at", "") or "",
    } for m, u in rows]}


@router.post("/content/moments/{mid}/hide")
def hide_moment(mid: int, admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    m = db.get(Moment, mid)
    if not m:
        raise HTTPException(404, "动态不存在")
    m.hidden_at = now_iso()
    _op_log(db, admin, "moment_hide", "moment", mid)
    db.commit()
    return {"ok": True, "hiddenAt": m.hidden_at}


@router.post("/content/moments/{mid}/unhide")
def unhide_moment(mid: int, admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    m = db.get(Moment, mid)
    if not m:
        raise HTTPException(404, "动态不存在")
    m.hidden_at = ""
    _op_log(db, admin, "moment_unhide", "moment", mid)
    db.commit()
    return {"ok": True, "hiddenAt": ""}


@router.delete("/content/moments/{mid}")
def delete_moment_admin(mid: int, admin: User = Depends(_require_admin),
                        db: Session = Depends(get_db)):
    """硬删动态 + 级联点赞/评论（含旁路表）。"""
    m = db.get(Moment, mid)
    if not m:
        raise HTTPException(404, "动态不存在")
    cids = [r[0] for r in db.query(MomentComment.id).filter(MomentComment.moment_id == mid).all()]
    if cids:
        db.query(MomentCommentMeta).filter(MomentCommentMeta.comment_id.in_(cids)).delete(
            synchronize_session=False)
    db.query(MomentLike).filter(MomentLike.moment_id == mid).delete(synchronize_session=False)
    db.query(MomentComment).filter(MomentComment.moment_id == mid).delete(synchronize_session=False)
    db.query(MomentMeta).filter(MomentMeta.moment_id == mid).delete(synchronize_session=False)
    db.delete(m)
    _op_log(db, admin, "moment_delete", "moment", mid)
    db.commit()
    return {"ok": True}


@router.get("/content/moment-comments")
def content_moment_comments(offset: int = 0, limit: int = 50, momentId: int = 0,
                            admin: User = Depends(_require_admin),
                            db: Session = Depends(get_db)):
    """全量动态评论（含已隐藏）；可按 momentId 过滤；倒序。"""
    query = db.query(MomentComment, User).outerjoin(User, MomentComment.user_id == User.id)
    if momentId:
        query = query.filter(MomentComment.moment_id == momentId)
    rows = (query.order_by(MomentComment.id.desc())
            .offset(max(offset, 0)).limit(min(max(limit, 1), 200)).all())
    return {"items": [{
        "id": c.id, "momentId": c.moment_id, "userId": c.user_id,
        "nickname": (u.nickname if u else "已注销用户"),
        "content": c.content, "createdAt": c.created_at,
        "hiddenAt": getattr(c, "hidden_at", "") or "",
    } for c, u in rows]}


@router.post("/content/moment-comments/{cid}/hide")
def hide_moment_comment(cid: int, admin: User = Depends(_require_admin),
                        db: Session = Depends(get_db)):
    c = db.get(MomentComment, cid)
    if not c:
        raise HTTPException(404, "评论不存在")
    c.hidden_at = now_iso()
    _op_log(db, admin, "moment_comment_hide", "moment_comment", cid)
    db.commit()
    return {"ok": True, "hiddenAt": c.hidden_at}


@router.post("/content/moment-comments/{cid}/unhide")
def unhide_moment_comment(cid: int, admin: User = Depends(_require_admin),
                          db: Session = Depends(get_db)):
    c = db.get(MomentComment, cid)
    if not c:
        raise HTTPException(404, "评论不存在")
    c.hidden_at = ""
    _op_log(db, admin, "moment_comment_unhide", "moment_comment", cid)
    db.commit()
    return {"ok": True, "hiddenAt": ""}


@router.delete("/content/moment-comments/{cid}")
def delete_moment_comment_admin(cid: int, admin: User = Depends(_require_admin),
                                db: Session = Depends(get_db)):
    """硬删评论 + 其旁路元信息行。"""
    c = db.get(MomentComment, cid)
    if not c:
        raise HTTPException(404, "评论不存在")
    db.query(MomentCommentMeta).filter(MomentCommentMeta.comment_id == cid).delete(
        synchronize_session=False)
    db.delete(c)
    _op_log(db, admin, "moment_comment_delete", "moment_comment", cid)
    db.commit()
    return {"ok": True}


@router.get("/content/notes")
def content_notes(offset: int = 0, limit: int = 50, q: str = "",
                  admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """全量笔记（含已软删）；q 按标题/正文 LIKE 过滤；倒序。"""
    query = db.query(Note, User).outerjoin(User, Note.user_id == User.id)
    if (q or "").strip():
        kw = f"%{q.strip()}%"
        query = query.filter(or_(Note.title.like(kw), Note.content.like(kw)))
    rows = (query.order_by(Note.id.desc())
            .offset(max(offset, 0)).limit(min(max(limit, 1), 200)).all())
    return {"items": [{
        "id": n.id, "userId": n.user_id,
        "nickname": (u.nickname if u else "已注销用户"),
        "title": n.title, "status": n.status, "privacy": n.privacy,
        "createdAt": n.created_at, "updatedAt": n.updated_at,
        "deletedAt": n.deleted_at or "", "hidden": bool(n.deleted_at),
    } for n, u in rows]}


@router.post("/content/notes/{nid}/hide")
def hide_note(nid: int, admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """隐藏笔记 = 置 deleted_at（复用既有软删字段，无需新列）。"""
    n = db.get(Note, nid)
    if not n:
        raise HTTPException(404, "笔记不存在")
    if not n.deleted_at:
        n.deleted_at = now_str()
    _op_log(db, admin, "note_hide", "note", nid)
    db.commit()
    return {"ok": True, "deletedAt": n.deleted_at or ""}


@router.post("/content/notes/{nid}/unhide")
def unhide_note(nid: int, admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    n = db.get(Note, nid)
    if not n:
        raise HTTPException(404, "笔记不存在")
    n.deleted_at = None
    _op_log(db, admin, "note_unhide", "note", nid)
    db.commit()
    return {"ok": True, "deletedAt": ""}


@router.delete("/content/notes/{nid}")
def delete_note_admin(nid: int, admin: User = Depends(_require_admin),
                      db: Session = Depends(get_db)):
    """硬删笔记 + 级联点赞/收藏/评论。"""
    n = db.get(Note, nid)
    if not n:
        raise HTTPException(404, "笔记不存在")
    db.query(Like).filter(Like.note_id == nid).delete(synchronize_session=False)
    db.query(Favorite).filter(Favorite.note_id == nid).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.note_id == nid).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.note_id == nid).delete(synchronize_session=False)
    db.delete(n)
    _op_log(db, admin, "note_delete", "note", nid)
    db.commit()
    return {"ok": True}


@router.get("/content/board")
def content_board(offset: int = 0, limit: int = 50,
                  admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """全量留言板（含已隐藏）；倒序。"""
    rows = (db.query(BoardMessage, User).outerjoin(User, BoardMessage.user_id == User.id)
            .order_by(BoardMessage.id.desc())
            .offset(max(offset, 0)).limit(min(max(limit, 1), 200)).all())
    return {"items": [{
        "id": m.id, "userId": m.user_id,
        "nickname": (u.nickname if u else "已注销用户"),
        "content": m.content, "createdAt": m.created_at,
        "hiddenAt": getattr(m, "hidden_at", "") or "",
    } for m, u in rows]}


@router.post("/content/board/{bid}/hide")
def hide_board(bid: int, admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    m = db.get(BoardMessage, bid)
    if not m:
        raise HTTPException(404, "留言不存在")
    m.hidden_at = now_iso()
    _op_log(db, admin, "board_hide", "board", bid)
    db.commit()
    return {"ok": True, "hiddenAt": m.hidden_at}


@router.post("/content/board/{bid}/unhide")
def unhide_board(bid: int, admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    m = db.get(BoardMessage, bid)
    if not m:
        raise HTTPException(404, "留言不存在")
    m.hidden_at = ""
    _op_log(db, admin, "board_unhide", "board", bid)
    db.commit()
    return {"ok": True, "hiddenAt": ""}


@router.delete("/content/board/{bid}")
def delete_board_admin(bid: int, admin: User = Depends(_require_admin),
                       db: Session = Depends(get_db)):
    """硬删留言 + 级联点赞/回复。"""
    m = db.get(BoardMessage, bid)
    if not m:
        raise HTTPException(404, "留言不存在")
    db.query(BoardLike).filter(BoardLike.message_id == bid).delete(synchronize_session=False)
    db.query(BoardReply).filter(BoardReply.message_id == bid).delete(synchronize_session=False)
    db.delete(m)
    _op_log(db, admin, "board_delete", "board", bid)
    db.commit()
    return {"ok": True}


@router.get("/content/board-replies")
def content_board_replies(offset: int = 0, limit: int = 50, msgId: int = 0,
                          admin: User = Depends(_require_admin),
                          db: Session = Depends(get_db)):
    """全量留言板回复（含已隐藏）；可按 msgId 过滤；倒序。"""
    query = db.query(BoardReply, User).outerjoin(User, BoardReply.user_id == User.id)
    if msgId:
        query = query.filter(BoardReply.message_id == msgId)
    rows = (query.order_by(BoardReply.id.desc())
            .offset(max(offset, 0)).limit(min(max(limit, 1), 200)).all())
    return {"items": [{
        "id": r.id, "messageId": r.message_id, "userId": r.user_id,
        "nickname": (u.nickname if u else "已注销用户"),
        "content": r.content, "createdAt": r.created_at,
        "hiddenAt": getattr(r, "hidden_at", "") or "",
    } for r, u in rows]}


@router.post("/content/board-replies/{rid}/hide")
def hide_board_reply(rid: int, admin: User = Depends(_require_admin),
                     db: Session = Depends(get_db)):
    r = db.get(BoardReply, rid)
    if not r:
        raise HTTPException(404, "回复不存在")
    r.hidden_at = now_iso()
    _op_log(db, admin, "board_reply_hide", "board_reply", rid)
    db.commit()
    return {"ok": True, "hiddenAt": r.hidden_at}


@router.post("/content/board-replies/{rid}/unhide")
def unhide_board_reply(rid: int, admin: User = Depends(_require_admin),
                       db: Session = Depends(get_db)):
    r = db.get(BoardReply, rid)
    if not r:
        raise HTTPException(404, "回复不存在")
    r.hidden_at = ""
    _op_log(db, admin, "board_reply_unhide", "board_reply", rid)
    db.commit()
    return {"ok": True, "hiddenAt": ""}


@router.delete("/content/board-replies/{rid}")
def delete_board_reply_admin(rid: int, admin: User = Depends(_require_admin),
                             db: Session = Depends(get_db)):
    r = db.get(BoardReply, rid)
    if not r:
        raise HTTPException(404, "回复不存在")
    db.delete(r)
    _op_log(db, admin, "board_reply_delete", "board_reply", rid)
    db.commit()
    return {"ok": True}


# ==========================================================================
# 3.4 全站公告
# ==========================================================================
class AnnIn(BaseModel):
    title: str = ""
    content: str = ""


class AnnPatchIn(BaseModel):
    title: str | None = None
    content: str | None = None
    active: bool | None = None


@router.get("/announcements")
def list_announcements_admin(admin: User = Depends(_require_admin),
                             db: Session = Depends(get_db)):
    """全站公告（管理侧，倒序全量，含已下线）。"""
    rows = db.query(Announcement).order_by(Announcement.id.desc()).all()
    return {"items": [{
        "id": a.id, "title": a.title, "content": a.content,
        "active": bool(a.active), "authorId": a.author_id,
        "createdAt": a.created_at, "updatedAt": a.updated_at,
    } for a in rows], "total": len(rows)}


@router.post("/announcements")
def create_announcement(body: AnnIn, admin: User = Depends(_require_admin),
                        db: Session = Depends(get_db)):
    title = (body.title or "").strip()
    content = (body.content or "").strip()
    if len(title) > 80:
        raise HTTPException(400, "标题最长 80 字")
    if not content:
        raise HTTPException(400, "公告内容不能为空")
    if len(content) > 2000:
        raise HTTPException(400, "公告内容最长 2000 字")
    now = now_iso()
    a = Announcement(title=title, content=content, active=True,
                     author_id=admin.id, created_at=now, updated_at=now)
    db.add(a)
    db.flush()
    _op_log(db, admin, "announce_create", "announcement", a.id, f"title={title}")
    db.commit()
    return {"ok": True, "id": a.id, "createdAt": a.created_at}


@router.patch("/announcements/{aid}")
def patch_announcement(aid: int, body: AnnPatchIn, admin: User = Depends(_require_admin),
                       db: Session = Depends(get_db)):
    a = db.get(Announcement, aid)
    if not a:
        raise HTTPException(404, "公告不存在")
    if body.title is not None:
        title = body.title.strip()
        if len(title) > 80:
            raise HTTPException(400, "标题最长 80 字")
        a.title = title
    if body.content is not None:
        content = body.content.strip()
        if not content:
            raise HTTPException(400, "公告内容不能为空")
        if len(content) > 2000:
            raise HTTPException(400, "公告内容最长 2000 字")
        a.content = content
    if body.active is not None:
        a.active = bool(body.active)
    a.updated_at = now_iso()
    _op_log(db, admin, "announce_update", "announcement", aid, f"title={a.title}")
    db.commit()
    return {"ok": True, "id": a.id, "active": bool(a.active)}


@router.delete("/announcements/{aid}")
def delete_announcement(aid: int, admin: User = Depends(_require_admin),
                        db: Session = Depends(get_db)):
    a = db.get(Announcement, aid)
    if not a:
        raise HTTPException(404, "公告不存在")
    _op_log(db, admin, "announce_delete", "announcement", aid, f"title={a.title}")
    db.delete(a)
    db.commit()
    return {"ok": True}


def _latest_active_announcement(db: Session):
    return (db.query(Announcement).filter(Announcement.active.is_(True))
            .order_by(Announcement.created_at.desc(), Announcement.id.desc()).first())


@router_public.get("/api/announcements")
def list_announcements_public(user: User = Depends(get_current_user),
                              db: Session = Depends(get_db)):
    """普通用户侧：返回 active 的最近 20 条 + 未读水位线判定。"""
    rows = (db.query(Announcement).filter(Announcement.active.is_(True))
            .order_by(Announcement.created_at.desc(), Announcement.id.desc()).limit(20).all())
    latest = rows[0].created_at if rows else ""
    ann_read = str(getattr(user, "ann_read_at", "") or "")
    unread = bool(latest) and (not ann_read or latest > ann_read)
    return {
        "items": [{"id": a.id, "title": a.title, "content": a.content,
                   "createdAt": a.created_at} for a in rows],
        "latestAt": latest,
        "unread": unread,
    }


@router_public.post("/api/announcements/read")
def mark_announcements_read(user: User = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    """把 ann_read_at 置为当前最新公告的 created_at（无公告则置 now_iso()）。"""
    latest = _latest_active_announcement(db)
    user.ann_read_at = latest.created_at if latest else now_iso()
    db.commit()
    return {"ok": True, "annReadAt": user.ann_read_at}


# ==========================================================================
# 3.5 群组管理
# ==========================================================================
@router.get("/groups")
def list_groups(offset: int = 0, limit: int = 50, q: str = "",
                admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    query = db.query(ChatGroup)
    if (q or "").strip():
        query = query.filter(ChatGroup.name.like(f"%{q.strip()}%"))
    total = query.count()
    rows = (query.order_by(ChatGroup.id.desc())
            .offset(max(offset, 0)).limit(min(max(limit, 1), 200)).all())
    gids = [g.id for g in rows]
    counts = dict(db.query(ChatGroupMember.group_id, func.count(ChatGroupMember.id))
                  .filter(ChatGroupMember.group_id.in_(gids))
                  .group_by(ChatGroupMember.group_id).all()) if gids else {}
    owner_ids = {g.owner_id for g in rows}
    owners = dict(db.query(User.id, User.nickname).filter(User.id.in_(owner_ids)).all()) if owner_ids else {}
    return {"items": [{
        "id": g.id, "name": g.name, "ownerId": g.owner_id,
        "ownerNickname": _name_of(owners, g.owner_id),
        "memberCount": int(counts.get(g.id, 0)),
        "announcement": g.announcement or "",
        "createdAt": g.created_at,
    } for g in rows], "total": total}


@router.get("/groups/{gid}/members")
def group_members(gid: int, admin: User = Depends(_require_admin),
                  db: Session = Depends(get_db)):
    g = db.get(ChatGroup, gid)
    if not g:
        raise HTTPException(404, "群不存在或已解散")
    rows = (db.query(ChatGroupMember, User)
            .outerjoin(User, ChatGroupMember.user_id == User.id)
            .filter(ChatGroupMember.group_id == gid)
            .order_by(ChatGroupMember.id).all())
    return {"items": [{
        "id": m.user_id, "nickname": (u.nickname if u else "已注销用户"),
        "role": m.role, "joinedAt": m.joined_at,
    } for m, u in rows]}


class AdminGroupPatchIn(BaseModel):
    name: str | None = None
    announcement: str | None = None


@router.patch("/groups/{gid}")
def patch_group(gid: int, body: AdminGroupPatchIn, admin: User = Depends(_require_admin),
                db: Session = Depends(get_db)):
    """改群名 / 群公告（与用户侧同口径：名称 ≤20 字、公告 ≤300 字，超限中文 400）。"""
    g = db.get(ChatGroup, gid)
    if not g:
        raise HTTPException(404, "群不存在或已解散")
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
    _op_log(db, admin, "group_update", "group", gid, f"name={g.name}")
    db.commit()
    return {"ok": True, "id": g.id, "name": g.name,
            "announcement": g.announcement or ""}


@router.delete("/groups/{gid}/members/{uid}")
def remove_group_member(gid: int, uid: int, admin: User = Depends(_require_admin),
                        db: Session = Depends(get_db)):
    g = db.get(ChatGroup, gid)
    if not g:
        raise HTTPException(404, "群不存在或已解散")
    if g.owner_id == uid:
        raise HTTPException(400, "群主不可移除，请先转让或解散")
    m = db.query(ChatGroupMember).filter(
        ChatGroupMember.group_id == gid, ChatGroupMember.user_id == uid).first()
    if not m:
        raise HTTPException(404, "该用户不是本群成员")
    db.delete(m)
    _op_log(db, admin, "group_member_remove", "group", gid, f"uid={uid}")
    db.commit()
    return {"ok": True}


@router.post("/groups/{gid}/dismiss")
def dismiss_group(gid: int, admin: User = Depends(_require_admin),
                  db: Session = Depends(get_db)):
    """解散群：删该群消息 + 成员 + 群行。"""
    g = db.get(ChatGroup, gid)
    if not g:
        raise HTTPException(404, "群不存在或已解散")
    name = g.name
    db.query(Message).filter(Message.group_id == gid).delete(synchronize_session=False)
    db.query(ChatGroupMember).filter(ChatGroupMember.group_id == gid).delete(synchronize_session=False)
    db.delete(g)
    _op_log(db, admin, "group_dismiss", "group", gid, f"name={name}")
    db.commit()
    return {"ok": True}


# ==========================================================================
# 3.6 私聊正文查看（只读 + 单删，绝不提供"以管理员身份发私聊"）
# ==========================================================================
@router.get("/chat/threads")
def chat_threads(offset: int = 0, limit: int = 50, q: str = "",
                 admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """私聊会话聚合：按 (min,max) 分组，返回双方昵称 / 最后时间 / 消息数，按最后时间倒序。"""
    a_expr = case((Message.sender_id < Message.receiver_id, Message.sender_id),
                  else_=Message.receiver_id)
    b_expr = case((Message.sender_id < Message.receiver_id, Message.receiver_id),
                  else_=Message.sender_id)
    pair_rows = (db.query(a_expr.label("a"), b_expr.label("b"),
                          func.max(Message.id).label("last_id"),
                          func.count(Message.id).label("cnt"))
                 .filter(Message.group_id.is_(None))
                 .group_by(a_expr, b_expr).all())
    last_ids = [r.last_id for r in pair_rows]
    last_msgs = ({m.id: m for m in db.query(Message).filter(Message.id.in_(last_ids)).all()}
                 if last_ids else {})
    uids: set[int] = set()
    for r in pair_rows:
        uids.add(r.a)
        uids.add(r.b)
    names = dict(db.query(User.id, User.nickname).filter(User.id.in_(uids)).all()) if uids else {}
    items = []
    for r in pair_rows:
        lm = last_msgs.get(r.last_id)
        items.append({
            "aId": r.a, "bId": r.b,
            "aNickname": _name_of(names, r.a), "bNickname": _name_of(names, r.b),
            "lastAt": lm.created_at if lm else "",
            "count": int(r.cnt),
        })
    if (q or "").strip():
        ql = q.strip().lower()
        items = [it for it in items
                 if ql in (it["aNickname"] or "").lower() or ql in (it["bNickname"] or "").lower()]
    items.sort(key=lambda x: x["lastAt"] or "", reverse=True)
    total = len(items)
    return {"items": items[max(offset, 0):max(offset, 0) + min(max(limit, 1), 200)], "total": total}


@router.get("/chat/thread/{uid_a}/{uid_b}/messages")
def chat_thread_messages(uid_a: int, uid_b: int, beforeId: int = 0, limit: int = 50,
                         admin: User = Depends(_require_admin), db: Session = Depends(get_db)):
    """单会话正文（管理员可读全部私聊）：按 id 倒序取、返回按 id 正序。"""
    lim = min(max(limit, 1), 200)
    cond = and_(Message.group_id.is_(None),
                or_(and_(Message.sender_id == uid_a, Message.receiver_id == uid_b),
                    and_(Message.sender_id == uid_b, Message.receiver_id == uid_a)))
    if beforeId:
        cond = and_(cond, Message.id < beforeId)
    rows = db.query(Message).filter(cond).order_by(Message.id.desc()).limit(lim).all()
    rows.reverse()
    sender_ids = {m.sender_id for m in rows}
    names = dict(db.query(User.id, User.nickname).filter(User.id.in_(sender_ids)).all()) if sender_ids else {}
    return {"items": [{
        "id": m.id, "senderId": m.sender_id,
        "senderNickname": _name_of(names, m.sender_id),
        "kind": m.kind, "content": m.content,
        "sub": getattr(m, "sub", "") or "",
        "lat": getattr(m, "lat", None), "lng": getattr(m, "lng", None),
        "duration": getattr(m, "duration", None),
        "createdAt": m.created_at, "readAt": m.read_at,
    } for m in rows], "count": len(rows)}


@router.get("/chat/search")
def chat_search(q: str = "", limit: int = 50, admin: User = Depends(_require_admin),
                db: Session = Depends(get_db)):
    """私聊正文关键词检索（group_id IS NULL），命中行补双方昵称。"""
    kw = (q or "").strip()
    if not kw:
        return {"items": [], "total": 0}
    lim = min(max(limit, 1), 200)
    rows = (db.query(Message)
            .filter(Message.group_id.is_(None), Message.content.like(f"%{kw}%"))
            .order_by(Message.id.desc()).limit(lim).all())
    ids: set[int] = set()
    for m in rows:
        ids.add(m.sender_id)
        ids.add(m.receiver_id)
    names = dict(db.query(User.id, User.nickname).filter(User.id.in_(ids)).all()) if ids else {}
    return {"items": [{
        "id": m.id,
        "senderId": m.sender_id, "senderNickname": _name_of(names, m.sender_id),
        "receiverId": m.receiver_id, "receiverNickname": _name_of(names, m.receiver_id),
        "kind": m.kind, "content": m.content, "createdAt": m.created_at,
    } for m in rows], "total": len(rows)}


@router.delete("/chat/messages/{mid}")
def delete_chat_message(mid: int, admin: User = Depends(_require_admin),
                        db: Session = Depends(get_db)):
    """管理员删单条消息（私聊或群聊均可）。"""
    m = db.get(Message, mid)
    if not m:
        raise HTTPException(404, "消息不存在")
    _op_log(db, admin, "message_delete", "message", mid,
            f"sender={m.sender_id},group={m.group_id or 0}")
    db.delete(m)
    db.commit()
    return {"ok": True}


# ==========================================================================
# 3.7 审计 + 自身隐身
# ==========================================================================
@router.get("/logs")
def list_op_logs(offset: int = 0, limit: int = 50, admin: User = Depends(_require_admin),
                 db: Session = Depends(get_db)):
    """管理员操作审计（倒序）+ adminNickname。"""
    rows = (db.query(AdminOpLog).order_by(AdminOpLog.id.desc())
            .offset(max(offset, 0)).limit(min(max(limit, 1), 200)).all())
    admin_ids = {r.admin_id for r in rows}
    names = dict(db.query(User.id, User.nickname).filter(User.id.in_(admin_ids)).all()) if admin_ids else {}
    return {"items": [{
        "id": r.id, "adminId": r.admin_id,
        "adminNickname": _name_of(names, r.admin_id),
        "action": r.action, "targetType": r.target_type, "targetId": r.target_id,
        "detail": r.detail, "createdAt": r.created_at,
    } for r in rows], "total": db.query(AdminOpLog).count()}


class VisibilityIn(BaseModel):
    hidden: bool = True


@router.get("/me/visibility")
def get_visibility(admin: User = Depends(_require_admin)):
    """当前管理员对普通用户是否隐形（admin_hidden 缺省 True=隐形）。"""
    return {"hidden": bool(getattr(admin, "admin_hidden", True) is not False)}


@router.post("/me/visibility")
def set_visibility(body: VisibilityIn, admin: User = Depends(_require_admin),
                   db: Session = Depends(get_db)):
    """设置自身隐身开关（只影响普通用户视角过滤，不影响 /api/admin/* 任何可见性）。"""
    admin.admin_hidden = bool(body.hidden)
    _op_log(db, admin, "admin_visibility", "user", admin.id, f"hidden={bool(body.hidden)}")
    db.commit()
    return {"ok": True, "hidden": bool(admin.admin_hidden)}
