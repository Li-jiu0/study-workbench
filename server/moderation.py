"""R170：封禁 / 禁言统一判定。被 security.py、各内容路由引用。

设计要点：
  - 纯函数、无副作用，只读用户对象上的三个治理字段（is_banned / mute_until /
    banned_reason），全部用 getattr 兜底，兼容 None / 老会话对象 / 尚未 ALTER 的旧行
    （缺失字段一律按「未封禁 / 未禁言」处理，绝不因字段缺失把请求打挂）。
  - 时间格式统一为 'YYYY-MM-DD HH:MM:SS'（19 字符），与 database.now_iso() 一致；
    解析失败按「未禁言」失败放行（fail-open），避免脏数据把用户永久锁死。
  - assert_can_post(user) 供各「发内容」入口在写库前调用：封禁 / 禁言一律 403，
    普通用户与管理员一样受此约束（管理员自身治理交由 _guard_target 拦在管理接口层）。
"""
import datetime as _dt

from fastapi import HTTPException

_TS = "%Y-%m-%d %H:%M:%S"


def is_banned(user) -> bool:
    """是否处于封禁状态（getattr 兜底，兼容 None / 老会话对象）。"""
    return bool(getattr(user, "is_banned", False))


def is_muted(user) -> bool:
    """mute_until 非空且 > 当前时间 → 处于禁言期。

    解析失败（脏数据 / 非 19 字符格式）按未禁言处理（fail-open，不锁死用户）。
    """
    raw = str(getattr(user, "mute_until", "") or "").strip()
    if not raw:
        return False
    try:
        until = _dt.datetime.strptime(raw, _TS)
    except (ValueError, TypeError):
        return False
    return until > _dt.datetime.now()


def assert_can_post(user) -> None:
    """发内容前调用：封禁 → 403「账号已被封禁：<reason>」；禁言 → 403「你已被禁言，解禁时间 <mute_until>」。"""
    if is_banned(user):
        reason = str(getattr(user, "banned_reason", "") or "").strip()
        raise HTTPException(403, f"账号已被封禁：{reason}" if reason else "账号已被封禁")
    if is_muted(user):
        until = str(getattr(user, "mute_until", "") or "").strip()
        raise HTTPException(403, f"你已被禁言，解禁时间 {until}")
