"""轻量进程内请求限流：滑动窗口，按「分组 + 客户端 IP」计数。

分组上限（次/分钟，见 config.py）：
- auth：注册 / 登录（默认 10）
- ai：AI 流式对话（默认 30）
- geo：定位代理 /api/geo/*（默认 30）
- 其余默认全局（默认 600）

用法（在路由签名里挂依赖）：
    async def chat(..., _rl: None = Depends(rate_limit("ai"))): ...

单进程够用；将来多进程 / 多机部署请换成 Redis 等共享限流。

真实客户端 IP 解析（防伪造绕过，2026 安全修复）：
- 仅当「直连对端」落在受信反向代理集合（默认 127.0.0.1 / ::1，即本机 Nginx 反代）
  内时，才采信 X-Forwarded-For，且取**最后一跳**（最靠近本服务、由代理追加的真实
  客户端）；
- 直连对端不在受信集合内时，一律以直连对端 IP 为准、忽略请求头，防止攻击者伪造
  X-Forwarded-For 获得无限配额，绕过登录/注册与 AI 限流。
- 受信代理集合可用环境变量 TRUSTED_PROXIES（逗号分隔）覆盖。
"""
import ipaddress
import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from config import (RATE_AI_CONSUME_PER_MIN, RATE_AI_PER_MIN,
                    RATE_AUTH_PER_MIN, RATE_GEO_PER_MIN,
                    RATE_GLOBAL_PER_MIN)

_LIMITS = {
    "auth": RATE_AUTH_PER_MIN,
    "ai": RATE_AI_PER_MIN,
    # R88-F：用量上报（无人登录态的前端直连场景）单独限流，防刷账本
    "consume": RATE_AI_CONSUME_PER_MIN,
    # R100：定位代理（/api/geo/*，免登录公开，防刷腾讯配额）
    "geo": RATE_GEO_PER_MIN,
    "default": RATE_GLOBAL_PER_MIN,
}
_buckets: dict[str, deque[float]] = defaultdict(deque)
_WINDOW = 60.0

# 进程内字典容量上限；超阈值且在清理间隔外时做一次全量过期清理，避免无上限增长。
_MAX_BUCKETS = 10000
_SWEEP_INTERVAL = 30.0
_last_sweep = 0.0

# 受信反向代理的「直连对端 IP」集合：默认仅本机（本机 Nginx 反代）。
_DEFAULT_TRUSTED_PROXIES = "127.0.0.1,::1"


def _load_trusted_proxies() -> frozenset[str]:
    """解析受信代理集合：环境变量 TRUSTED_PROXIES（逗号分隔）优先，默认 127.0.0.1/::1。"""
    raw = os.environ.get("TRUSTED_PROXIES", _DEFAULT_TRUSTED_PROXIES)
    items = {p.strip() for p in raw.split(",") if p.strip()}
    return frozenset(items or {"127.0.0.1", "::1"})


_TRUSTED_PROXIES: frozenset[str] = _load_trusted_proxies()


def _last_valid_ip(xff: str) -> str | None:
    """取 X-Forwarded-For 中最后一个合法 IP（代理追加在末尾，即真实客户端）。"""
    for part in reversed([p.strip() for p in xff.split(",")]):
        if not part:
            continue
        try:
            ipaddress.ip_address(part)
        except ValueError:
            continue
        return part
    return None


def _client_ip(request: Request) -> str:
    """解析真实客户端 IP（防伪造 X-Forwarded-For 绕过限流）。

    - 直连对端不在受信代理集合内 → 直接用对端 IP，忽略 X-Forwarded-For；
    - 直连对端在受信代理集合内 → 取 XFF 最后一跳（真实客户端），无有效值则回退对端 IP。
    """
    direct = request.client.host if request.client else ""
    if direct and direct in _TRUSTED_PROXIES:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            real = _last_valid_ip(xff)
            if real:
                return real
    return direct or "unknown"


def _evict_expired(now: float) -> None:
    """全量清理：剔除窗口外时间戳并删除空桶（轻量、无新依赖）。"""
    for key in list(_buckets.keys()):
        q = _buckets.get(key)
        if not q:
            _buckets.pop(key, None)
            continue
        while q and now - q[0] > _WINDOW:
            q.popleft()
        if not q:
            _buckets.pop(key, None)


def rate_limit(group: str = "default"):
    limit = _LIMITS.get(group, RATE_GLOBAL_PER_MIN)

    def dependency(request: Request) -> None:
        global _last_sweep
        now = time.monotonic()
        # 容量超阈值时按间隔做一次全量过期清理，防止 _buckets 无上限增长。
        if len(_buckets) > _MAX_BUCKETS and now - _last_sweep > _SWEEP_INTERVAL:
            _last_sweep = now
            _evict_expired(now)
        key = f"{group}:{_client_ip(request)}"
        q = _buckets[key]
        # 清理已过期的时间戳（超出 60s 窗口）
        while q and now - q[0] > _WINDOW:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, "请求过于频繁，请稍后再试")
        q.append(now)

    return dependency
