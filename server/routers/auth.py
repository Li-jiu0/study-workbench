"""认证：注册 / 登录 / 刷新令牌（JWT）+ 邮箱绑定 / 验证码 / 找回账号（R73）。"""
import re
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import smtp_configured
from database import EmailCode, User, get_db, is_admin_user, now_str
from mailer import EmailNotConfigured, EmailSendError, send_code_email
from rate_limit import rate_limit
from schemas import (ChangePasswordIn, EmailBindIn, EmailSendCodeIn,
                     EmailVerifyIn, FindAccountIn, LoginIn, RefreshIn,
                     RegisterIn, privacy_of)
from security import (TYPE_ACCESS, TYPE_REFRESH, create_token,
                      get_current_user, hash_password, verify_password,
                      verify_refresh_token)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_USERNAME_RE = re.compile(r"^[一-龥A-Za-z0-9_]{3,20}$")


def _ensure_account_of(user: User, db: Session) -> str:
    """R141/R142（2026-09-21）：取「账号」（account），缺失则惰性补齐并落库。

    实现放在 routers/users.py（与资料变更锁定/唯一性校验同处，单一事实源）；
    此处惰性导入，避免路由模块之间的顶层循环依赖。
    失败时返回 ''（绝不因账号补不齐让登录 / me 整体 500）。
    """
    from routers.users import _ensure_account  # 惰性导入

    return _ensure_account(db, user)


def _auth_payload(user: User, db: Session) -> dict:
    """登录 / 注册 / 刷新共用的返回结构：access + refresh 双令牌。

    R141/R142（2026-09-21）：响应新增 user.account（账号=注册/登录账号，30 天可改一次）。
    存量用户首次登录时由 _ensure_account_of 惰性补齐，保证前端始终拿得到。
    """
    admin = is_admin_user(user)
    account = _ensure_account_of(user, db)
    return {
        "token": create_token(user.id, TYPE_ACCESS),
        "refreshToken": create_token(user.id, TYPE_REFRESH),
        # 需求01：管理员标记（camelCase 与 snake_case 双写，前端与验收脚本各自取用）
        "isAdmin": admin,
        "is_admin": admin,
        "user": {
            "id": user.id,
            "username": user.username,
            "account": account,
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
    # R141/R142：注册即分配「账号」（account，取注册账号本身）——补写失败也不阻断注册
    from routers.users import _ensure_account

    _ensure_account(db, user)
    return _auth_payload(user, db)


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db), _rl: None = Depends(rate_limit("auth"))):
    """登录：登录标识兼容「账号」「注册用户名」「绑定邮箱」。

    - account 优先、username 兜底（老前端只发 username，向后兼容）；
    - 匹配顺序：注册用户名精确匹配 → 含 @ 时按邮箱（小写）匹配 → 账号（account，忽略大小写）匹配；
    - 「账号」即用户注册/登录所用的账号（R142 口径），默认等于注册用户名，
      用户可在个人资料里 30 天改一次；改后新旧两种写法都能登进来，避免自锁；
    - 命中后再校验密码，账号不存在与密码错误返回同一文案，避免账号枚举。
    """
    ident = (body.account or body.username or "").strip()
    if not ident:
        raise HTTPException(400, "请输入账号或绑定邮箱")
    user = db.query(User).filter(User.username == ident).first()
    if not user and "@" in ident:
        user = db.query(User).filter(User.email == ident.lower()).first()
    if not user:
        # R141/R142：账号（account）登录。账号原样保留注册时的大小写，
        # 故比较统一忽略大小写（func.lower 两端口径一致）。
        user = db.query(User).filter(func.lower(User.account) == ident.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(400, "账号或密码错误")
    return _auth_payload(user, db)


@router.post("/refresh")
def refresh(body: RefreshIn, db: Session = Depends(get_db), _rl: None = Depends(rate_limit("auth"))):
    """用 refresh 令牌换取新的令牌对（轮换：本次发的新 refresh 会顶替旧的）。"""
    user_id = verify_refresh_token(body.refresh)
    if not user_id:
        raise HTTPException(401, "刷新令牌无效或已过期，请重新登录")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(401, "账号不存在，请重新登录")
    return _auth_payload(user, db)


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
        # R141/R142：账号（account）—— 可复制、可用于登录；存量用户首次访问时惰性补齐。
        # 仅本人接口返回，公开主页 / 搜索 / 好友列表一律不含（见 users.public_profile 注释）。
        "account": _ensure_account_of(user, db),
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
        # R73（邮箱绑定）：本人可见的绑定邮箱与验证状态（供「设置页 → 账号与安全」展示绑定状态）
        "email": user.email or "",
        "emailVerified": bool(user.email_verified_at),
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


# =====================================================================
# R73 邮箱绑定：验证码发送 / 校验 / 绑定 / 解绑 / 找回账号
# =====================================================================
_CODE_TTL_SECONDS = 600        # 验证码有效期：10 分钟
_CODE_RESEND_INTERVAL = 60     # 同邮箱发送间隔：60 秒 1 次
_CODE_HOURLY_LIMIT = 5         # 同邮箱每小时的发送上限
_CODE_MAX_ATTEMPTS = 5         # 单码最多尝试次数
_VALID_PURPOSES = ("bind", "reset")


def _gen_code() -> str:
    """生成 6 位数字验证码（首位可为 0，不足补零）。"""
    return "%06d" % secrets.randbelow(1000000)


def _consume_email_code(db: Session, email: str, purpose: str, code: str) -> None:
    """校验并一次性消费最新一枚验证码；成功即置 used。

    异常语义（见任务异常矩阵）：
      - 无可用记录            → 400「请先获取验证码」
      - 已用过 / 已过期 / 超限 → 410「验证码已过期，请重新获取」
      - 验证码错误            → 400，detail 带剩余可试次数
      - 错误且用满 5 次        → 429「尝试次数过多，请重新获取」并作废
    """
    row = (db.query(EmailCode)
             .filter(EmailCode.email == email, EmailCode.purpose == purpose)
             .order_by(EmailCode.id.desc())
             .first())
    if not row:
        raise HTTPException(400, "请先获取验证码")
    if row.used or row.expires_at < datetime.now():
        row.used = True
        db.commit()
        raise HTTPException(410, "验证码已过期，请重新获取")
    if row.attempts >= _CODE_MAX_ATTEMPTS:
        row.used = True
        db.commit()
        raise HTTPException(429, "尝试次数过多，请重新获取")
    if not verify_password(code, row.code_hash):
        row.attempts += 1
        remain = _CODE_MAX_ATTEMPTS - row.attempts
        if remain <= 0:
            row.used = True
            db.commit()
            raise HTTPException(429, "尝试次数过多，请重新获取")
        db.commit()
        raise HTTPException(400, "验证码错误，还可尝试 %d 次" % remain)
    row.used = True  # 一次性消费
    db.commit()


@router.post("/email/send-code")
def send_email_code(body: EmailSendCodeIn, db: Session = Depends(get_db)):
    """发送邮箱验证码。

    状态码语义：503 邮件服务未配置 / 502 发送失败 / 429 限频 / 404 找回时邮箱未绑定 /
    400 用途非法 / 200 成功。绝不静默假成功。
    """
    email = body.email  # 已由 schema 规范化为小写去空格
    purpose = (body.purpose or "bind").strip().lower()
    if purpose not in _VALID_PURPOSES:
        raise HTTPException(400, "验证码用途不合法")
    # 找回账号：邮箱必须已绑定，避免向未绑定邮箱发码
    if purpose == "reset":
        if not db.query(User).filter(User.email == email).first():
            raise HTTPException(404, "该邮箱未绑定任何账号")
    # SMTP 未配置：明确 503（在写库之前拦截，不产生脏记录）
    if not smtp_configured():
        raise HTTPException(503, "邮件服务未配置，请联系管理员")
    now = datetime.now()
    # 限频 1：同邮箱 60 秒 1 次
    recent = db.query(EmailCode).filter(
        EmailCode.email == email,
        EmailCode.created_at >= now - timedelta(seconds=_CODE_RESEND_INTERVAL),
    ).count()
    if recent >= 1:
        raise HTTPException(429, "验证码发送过于频繁，请 60 秒后再试")
    # 限频 2：同邮箱每小时 5 次
    hourly = db.query(EmailCode).filter(
        EmailCode.email == email,
        EmailCode.created_at >= now - timedelta(hours=1),
    ).count()
    if hourly >= _CODE_HOURLY_LIMIT:
        raise HTTPException(429, "该邮箱 1 小时内请求过于频繁，请稍后再试")

    code = _gen_code()
    row = EmailCode(
        email=email,
        code_hash=hash_password(code),
        purpose=purpose,
        user_id=None,
        expires_at=now + timedelta(seconds=_CODE_TTL_SECONDS),
        used=False,
        attempts=0,
        created_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    # 发送：失败则作废刚写入的记录，避免脏数据
    try:
        send_code_email(email, code, purpose)
    except EmailNotConfigured:
        row.used = True
        db.commit()
        raise HTTPException(503, "邮件服务未配置，请联系管理员")
    except EmailSendError:
        row.used = True
        db.commit()
        raise HTTPException(502, "验证码发送失败，请稍后重试")
    return {"ok": True, "email": email, "purpose": purpose, "expiresIn": _CODE_TTL_SECONDS}


@router.post("/email/verify")
def verify_email_code(body: EmailVerifyIn, db: Session = Depends(get_db)):
    """校验邮箱验证码（不改变用户邮箱，仅验证）。"""
    purpose = (body.purpose or "bind").strip().lower()
    if purpose not in _VALID_PURPOSES:
        raise HTTPException(400, "验证码用途不合法")
    _consume_email_code(db, body.email, purpose, body.code)
    return {"ok": True, "verified": True}


@router.post("/email/bind")
def bind_email(body: EmailBindIn, user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    """绑定邮箱（需登录）。邮箱被他人占用 → 409；成功后写 email + email_verified_at。"""
    email = body.email  # 已规范化
    occupied = db.query(User).filter(User.email == email, User.id != user.id).first()
    if occupied:
        raise HTTPException(409, "该邮箱已被其他账号绑定")
    _consume_email_code(db, email, "bind", body.code)
    user.email = email
    user.email_verified_at = datetime.now()
    db.commit()
    return {"ok": True, "email": email}


@router.post("/email/unbind")
def unbind_email(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """解绑邮箱（需登录）：清空 email 与 email_verified_at。"""
    user.email = None
    user.email_verified_at = None
    db.commit()
    return {"ok": True}


@router.post("/find-account")
def find_account(body: FindAccountIn, db: Session = Depends(get_db)):
    """通过已验证邮箱找回账号（可选重置密码）。

    - 邮箱未绑定 → 404「该邮箱未绑定任何账号」；
    - 验证码走 reset 用途（过期 410 / 错误 400 / 超限 429）；
    - 传入 newPassword 时复用 security.hash_password 重置密码。
    """
    email = body.email
    target = db.query(User).filter(User.email == email).first()
    if not target:
        raise HTTPException(404, "该邮箱未绑定任何账号")
    _consume_email_code(db, email, "reset", body.code)
    password_reset = False
    if body.newPassword:
        target.password_hash = hash_password(body.newPassword)
        db.commit()
        password_reset = True
    return {
        "ok": True,
        "username": target.username,
        # R141/R142：一并回传账号（凭邮箱验证码才可见；可用来登录）
        "account": _ensure_account_of(target, db),
        "nickname": target.nickname,
        "passwordReset": password_reset,
    }
