# -*- coding: utf-8 -*-
"""时政新闻聚合：GET /api/news/daily（免登录，纯公开资讯）。

需求 10：时政新闻弹窗渲染层已支持链接（hotnews.js data-url），但唯一数据源
「60秒读懂世界」逐条无 URL。本路由聚合一个带原文链接的公开源：

- 主源：中国新闻网滚动新闻 RSS（逐条含真实原文 URL，国内官媒，分钟级更新）。
  该端点无 CORS 头，浏览器不能直连，必须由后端代理。
- 降级源：60秒读懂世界 v2（逐条无链接 → url 置 null；顶层 data.link 为当日
  「微信早报全文」整期链接 → 作为 dailyLink 返回）。

行为约定：
- 服务端内存缓存 30 分钟（多用户共享，避免重复打上游）；
- 任一上游成功即返回；全部失败 → 502 {"error": "news_unavailable"}，
  绝不把上游异常/非 200 透传给前端；
- 响应头 Cache-Control: public, max-age=1800（与内存缓存 TTL 对齐）。

写法参照同项目 routers/social.py 的 tts_proxy（httpx 外呼 + 异常捕获 + 502 兜底）。
注意：JSONResponse 必须从 fastapi.responses 导入（新版 FastAPI 顶层不再
re-export，`from fastapi import JSONResponse` 会 ImportError 导致整个应用起不来）。
"""
from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["news"])

# ---- 上游地址抽为模块级常量：冒烟脚本可 monkeypatch 模拟上游全挂 ----
RSS_URL = "https://www.chinanews.com/rss/scroll-news.xml"
SIXTY_URL = "https://60s-api.viki.moe/v2/60s"

_CACHE_TTL = 30 * 60      # 秒；与响应头 max-age=1800 对齐
_MAX_ITEMS = 60
_TIMEOUT = 8              # 秒

# 服务端内存缓存：模块级 (fetched_at, payload)；payload 为 None 表示尚无有效数据
_CACHE: Tuple[float, Optional[Dict[str, Any]]] = (0.0, None)

# XML 声明（含 encoding），str 形式喂给 ElementTree 会报
# "Unicode strings with encoding declaration are not supported"，需剥掉
_XML_DECL_RE = re.compile(r"^\s*<\?xml[^>]*\?>")


def _reset_cache() -> None:
    """清空服务端内存缓存（仅供冒烟测试使用）。"""
    global _CACHE
    _CACHE = (0.0, None)


async def _fetch_chinanews() -> Dict[str, Any]:
    """抓取并解析中新网滚动新闻 RSS。失败抛异常，由调用方统一降级。

    title 可能包在 CDATA 里 —— ElementTree 会自动解包，findtext 直接可取；
    解码容错：先试 utf-8，失败退 gbk（官方页头可能声明 gb2312）。
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT, trust_env=False) as client:
        resp = await client.get(RSS_URL)
        resp.raise_for_status()
        raw = resp.content
    if not raw:
        raise ValueError("RSS 返回空内容")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("gbk", errors="replace")
    root = ET.fromstring(_XML_DECL_RE.sub("", text, count=1))
    items: List[Dict[str, Any]] = []
    for node in root.iter("item"):
        title = (node.findtext("title") or "").strip()
        url = (node.findtext("link") or "").strip()
        if not title or not url:
            continue  # 缺链接的条目对弹窗无意义，直接跳过
        items.append({"title": title, "hot": "", "url": url})
        if len(items) >= _MAX_ITEMS:
            break
    if not items:
        raise ValueError("RSS 未解析出任何带链接的条目")
    updated = ""
    try:
        # 中新网滚动 RSS 的 channel/item 均无 pubDate（实测），用服务端取数时间兜底，
        # 格式保持 RSS 风格 "Fri, 11 Sep 2026 12:03:53 +0800"
        updated = datetime.now(timezone(timedelta(hours=8))).strftime(
            "%a, %d %b %Y %H:%M:%S +0800")
    except Exception:  # noqa: BLE001 —— updated 只是展示信息，缺失不致命
        updated = ""
    return {"source": "中国新闻网", "updated": updated, "items": items, "dailyLink": None}


async def _fetch_sixty() -> Dict[str, Any]:
    """降级源：60秒读懂世界 v2。

    data.news 是纯字符串数组、逐条没有 URL（结构性缺陷）→ 每条 url 置 null；
    顶层 data.link 是当天「微信早报全文」整期链接 → 作为 dailyLink 返回。
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT, trust_env=False) as client:
        resp = await client.get(SIXTY_URL)
        resp.raise_for_status()
        data = resp.json()
    if not isinstance(data, dict):
        raise ValueError("60s 返回结构异常")
    inner = data.get("data") if isinstance(data.get("data"), dict) else {}
    news = inner.get("news") or data.get("news") or []
    if not isinstance(news, list):
        news = []
    items: List[Dict[str, Any]] = []
    for n in news:
        title = n.strip() if isinstance(n, str) else ""
        if title:
            items.append({"title": title, "hot": "", "url": None})
    if not items:
        raise ValueError("60s 未解析出任何条目")
    return {
        "source": "60秒读懂世界",
        "updated": "",
        "items": items[:_MAX_ITEMS],
        "dailyLink": inner.get("link") or None,
    }


# 主源 → 降级源，顺序即优先级；函数签名统一 () -> Awaitable[dict]
_FETCHERS: List[Tuple[str, Callable[[], Awaitable[Dict[str, Any]]]]] = [
    ("chinanews_rss", _fetch_chinanews),
    ("60s_v2", _fetch_sixty),
]


@router.get("/api/news/daily")
async def news_daily() -> JSONResponse:
    """时政新闻聚合（免登录公开接口）。

    返回结构（前端 hotnews.js 按此消费）：
        {"ok": true, "source": "...", "updated": "...",
         "items": [{"title": "...", "hot": "", "url": "..."}],
         "dailyLink": null}
    降级到 60s 时 source 为「60秒读懂世界」、每条 url 为 null、
    dailyLink 为微信早报整期链接。全部上游失败 → 502 news_unavailable。
    """
    global _CACHE
    fetched_at, cached_payload = _CACHE
    now = time.time()
    if cached_payload is not None and now - fetched_at < _CACHE_TTL:
        return JSONResponse(
            content=cached_payload,
            headers={"Cache-Control": "public, max-age=1800"},
        )

    errors: List[str] = []
    payload: Optional[Dict[str, Any]] = None
    for name, fetcher in _FETCHERS:
        try:
            payload = await fetcher()
            break
        except Exception as exc:  # noqa: BLE001 —— 上游任何失败都降级，绝不透传
            errors.append(name + ": " + repr(exc))
            payload = None

    if payload is None:
        # 两个上游都失败：502 兜底，绝不把上游 500/异常透传给前端
        return JSONResponse(status_code=502, content={"error": "news_unavailable"})

    payload = {"ok": True, **payload}
    _CACHE = (now, payload)
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=1800"},
    )
