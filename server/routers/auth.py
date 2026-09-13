"""认证：注册 / 登录 / 刷新令牌（JWT）。"""
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import User, get_db, is_admin_user, now_str
from rate_limit import rate_limit
from schemas import ChangePasswordIn, LoginIn, RefreshIn, RegisterIn, privacy_of
from security import (TYPE_ACCESS, TYPE_REFRESH, create_token,
                      get_current_user, hash_password, verify_password,
                      verify_refresh_token)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_USERNAME_RE = re.compile(r"^[一-龥A-Za-z0-9_]{3,20}$")


def _auth_payload(user: User) -> dict:
    """登录 / 注册 / 刷新共用的返回结构：access + refresh 双令牌。"""
    admin = is_admin_user(user)
    return {
        "token": create_token(user.id, TYPE_ACCESS),
        "refreshToken": create_token(user.id, TYPE_REFRESH),
        # 需求01：管理员标记（camelCase 与 snake_case 双写，前端与验收脚本各自取用）
        "isAdmin": admin,
        "is_admin": admin,
        "user": {
            "id": user.id,
            "username": user.username,
            "nickname": user.nickname,
            "isAdmin": admin,
            "is_admin": admin,
        },
    }


@router.post("/register")
def register(body: RegisterIn, db: Session = Depends(get_db), _rl: None = Depends(rate_limit("auth"))):
    username = body.username.strip()  # 与 login 的 strip 行为保持一致，避免“注册带空格、登录匹配不上”
    if not _USERNAME_RE.match(username):
        raise HTTPException(400, "账号需为 3-20 位字母 / 数字 / 中文 / 下划线")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "该账号已被注册")
    user = User(
        username=username,
        password_hash=hash_password(body.password),
        nickname=body.nickname.strip() or username,
        motto="",
        avatar=None,
        created_at=now_str(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _auth_payload(user)


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db), _rl: None = Depends(rate_limit("auth"))):
    user = db.query(User).filter(User.username == body.username.strip()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(400, "账号或密码错误")
    return _auth_payload(user)


@router.post("/refresh")
def refresh(body: RefreshIn, db: Session = Depends(get_db), _rl: None = Depends(rate_limit("auth"))):
    """用 refresh 令牌换取新的令牌对（轮换：本次发的新 refresh 会顶替旧的）。"""
    user_id = verify_refresh_token(body.refresh)
    if not user_id:
        raise HTTPException(401, "刷新令牌无效或已过期，请重新登录")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(401, "账号不存在，请重新登录")
    return _auth_payload(user)


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """当前登录用户：基础资料 + 笔记统计（不含回收站）+ 未读通知数。"""
    notes = [n for n in user.notes if not n.deleted_at]
    pub = [n for n in notes if n.status == "published"]
    draft = [n for n in notes if n.status == "draft"]
    arch = [n for n in notes if n.status == "archived"]
    cat_count: dict[str, int] = {}
    for n in notes:
        cat_count[n.category] = cat_count.get(n.category, 0) + 1
    unread = _unread_count(db, user.id)
    return {
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        # 需求01：管理员标记（camelCase 与 snake_case 双写）
        "isAdmin": is_admin_user(user),
        "is_admin": is_admin_user(user),
        "motto": user.motto,
        "bio": user.bio or "",
        "gender": user.gender or "secret",
        "birthday": user.birthday or "",
        "city": user.city or "",
        "phone": user.phone or "",
        "goal": user.goal or "",
        "tags": user.tags or "",
        # T03：隐私三项仅本人接口返回（公开主页 GET /api/users/{id} 绝不返回）
        "privacy": privacy_of(user),
        "avatarUrl": user.avatar,
        "createdAt": user.created_at,
        "stats": {
            "total": len(notes),
            "published": len(pub),
            "draft": len(draft),
            "archived": len(arch),
            "likes": sum(n.likes_count for n in pub),
            "comments": sum(n.comments_count for n in pub),
            "views": sum(n.views for n in pub),
            "catCount": cat_count,
        },
        "unread": unread,
    }


def _unread_count(db: Session, user_id: int) -> int:
    from database import Notification

    return db.query(Notification).filter(
        Notification.user_id == user_id, Notification.is_read.is_(False)
    ).count()


@router.post("/change-password")
def change_password(body: ChangePasswordIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db), _rl: None = Depends(rate_limit("auth"))):
    """修改密码（A6）：登录态校验旧密码 → 强度校验 → PBKDF2 更新落库。

    - 旧密码错 → 400「当前密码不正确」
    - 新密码与旧密码相同 → 400
    - token_version 本批只加列不启用（B3「退出所有设备」再落地），此处不递增。
    """
    if not verify_password(body.oldPassword, user.password_hash):
        raise HTTPException(400, "当前密码不正确")
    if body.newPassword == body.oldPassword:
        raise HTTPException(400, "新密码不能与当前密码相同")
    user.password_hash = hash_password(body.newPassword)
    db.commit()
    return {"ok": True}
