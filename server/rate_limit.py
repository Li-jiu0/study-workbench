"""轻量进程内请求限流：滑动窗口，按「分组 + 客户端 IP」计数。

分组上限（次/分钟，见 config.py）：
- auth：注册 / 登录（默认 10）
- ai：AI 流式对话（默认 30）
- 其余默认全局（默认 600）

用法（在路由签名里挂依赖）：
    async def chat(..., _rl: None = Depends(rate_limit("ai"))): ...

单进程够用；将来多进程 / 多机部署请换成 Redis 等共享限流。
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from config import RATE_AI_PER_MIN, RATE_AUTH_PER_MIN, RATE_GLOBAL_PER_MIN

_LIMITS = {
    "auth": RATE_AUTH_PER_MIN,
    "ai": RATE_AI_PER_MIN,
    "default": RATE_GLOBAL_PER_MIN,
}
_buckets: dict[str, deque[float]] = defaultdict(deque)
_WINDOW = 60.0


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(group: str = "default"):
    limit = _LIMITS.get(group, RATE_GLOBAL_PER_MIN)

    def dependency(request: Request) -> None:
        now = time.monotonic()
        key = f"{group}:{_client_ip(request)}"
        q = _buckets[key]
        # 清理已过期的时间戳（超出 60s 窗口）
        while q and now - q[0] > _WINDOW:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, "请求过于频繁，请稍后再试")
        q.append(now)

    return dependency
