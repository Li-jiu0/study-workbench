"""安全：密码哈希（PBKDF2-SHA256）+ JWT 签发/校验 + 当前用户依赖。

令牌分两类（payload 中 typ 字段）：
- access ：短时效（默认 60 分钟），用于普通接口鉴权（Authorization: Bearer）。
- refresh：长时效（默认 30 天），只能用于 POST /api/auth/refresh 换取新的令牌对。
旧版无 typ 字段的令牌按 access 兼容处理，升级不会强制所有人重新登录。
"""
import hashlib
import os
import time

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from config import ACCESS_TOKEN_MINUTES, JWT_SECRET, REFRESH_TOKEN_DAYS
from database import get_db
from database import User  # noqa: F401

_ITERATIONS = 120_000
ALGORITHM = "HS256"
TYPE_ACCESS = "access"
TYPE_REFRESH = "refresh"


# ---------- 密码 ----------
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"pbkdf2${_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters)
        )
        return dk.hex() == dk_hex
    except Exception:
        return False


# ---------- JWT ----------
def _expires(token_type: str) -> int:
    if token_type == TYPE_REFRESH:
        return int(time.time()) + 86400 * REFRESH_TOKEN_DAYS
    return int(time.time()) + 60 * ACCESS_TOKEN_MINUTES


def create_token(user_id: int, token_type: str = TYPE_ACCESS) -> str:
    payload = {
        "sub": str(user_id),
        "typ": token_type,
        "iat": int(time.time()),
        "exp": _expires(token_type),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    """返回 payload 字典；无效 / 过期返回 None。"""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except Exception:
        return None


def _bearer_from(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def get_current_user(request: Request, db: Session = Depends(get_db)):
    """需要登录的接口使用：Depends(get_current_user)。只接受 access 令牌。"""
    token = _bearer_from(request)
    if not token:
        raise HTTPException(status_code=401, detail="未登录或令牌缺失")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    # 旧令牌无 typ 视为 access；refresh 令牌不能作为访问令牌使用
    if payload.get("typ", TYPE_ACCESS) != TYPE_ACCESS:
        raise HTTPException(status_code=401, detail="令牌类型错误，请重新登录")
    try:
        user_id = int(payload.get("sub", 0))
    except (TypeError, ValueError):
        user_id = 0
    if not user_id:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="账号不存在")
    return user


def verify_refresh_token(token: str) -> int | None:
    """校验 refresh 令牌并返回 user_id；非法返回 None。"""
    payload = decode_token(token)
    if not payload or payload.get("typ") != TYPE_REFRESH:
        return None
    try:
        return int(payload.get("sub", 0)) or None
    except (TypeError, ValueError):
        return None
