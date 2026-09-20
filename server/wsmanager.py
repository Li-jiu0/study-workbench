"""WebSocket 在线连接管理：user_id -> WebSocket。

单进程内存实现（uvicorn 单 worker 足够）。断线由客户端自动重连来兜底；
同一用户重复连接时顶掉旧连接（手机切网络等场景）。
"""
import json

from fastapi import WebSocket

_conns: dict[int, WebSocket] = {}


async def register(user_id: int, ws: WebSocket) -> None:
    old = _conns.get(user_id)
    if old and old is not ws:
        try:
            await old.close(code=4001, reason="新的连接已建立")
        except Exception:
            pass
    _conns[user_id] = ws


async def unregister(user_id: int, ws: WebSocket) -> None:
    if _conns.get(user_id) is ws:
        _conns.pop(user_id, None)


async def send_to(user_id: int, payload: dict) -> bool:
    ws = _conns.get(user_id)
    if not ws:
        return False
    try:
        await ws.send_text(json.dumps(payload, ensure_ascii=False))
        return True
    except Exception:
        # 对端已失效：交给客户端自动重连清理，这里静默忽略
        return False
