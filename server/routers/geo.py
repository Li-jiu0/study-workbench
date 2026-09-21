# -*- coding: utf-8 -*-
"""定位后端代理（R100）：/api/geo/* 三个免登录 GET 接口。

背景：线上站点为纯 HTTP（http://110.42.134.62），浏览器 geolocation 被安全
策略恒拒；且前端旧版把腾讯地图 Key 硬编码进 assets/xt-region.js 的 JSONP。
本路由把腾讯位置服务 WebService 统一搬到后端代理：

- Key 只从 server/.env 注入（config.TENCENT_MAP_KEY），响应绝不回传 Key；
- 三接口统一返回 HTTP 200 + {"ok": bool}，错误不抛 5xx，方便前端降级；
- 逆地理编码 / 行政区划子级带进程内缓存（腾讯配额按 Key 计，能省则省）。

接口清单（均免登录，挂 rate_limit("geo") 限流）：
- GET /api/geo/ip                 IP 定位降级（本机/内网调用直接 ip_local）
- GET /api/geo/reverse?lat=&lng=  逆地理编码（街道级 + 周边 POI）
- GET /api/geo/children?adcode=   行政区划子级（第 4 级「街道/乡镇」数据源）
- GET /api/geo/staticmap?lat=&lng=&zoom=  静态地图图片代理（返回图片二进制，前端 <img> 直引）
- GET /api/geo/place?keyword=&city=&adcode=&lat=&lng=  地点搜索 POI 列表（腾讯 place/v1/search 代理）

错误码约定（均 HTTP 200 + {"ok": false, "error": ...}）：
- key_missing       .env 未配置 TENCENT_MAP_KEY
- ip_local          客户端 IP 为私网/环回，IP 定位无意义（不外呼腾讯）
- bad_params        参数缺失 / 非数字 / 超出中国范围粗校 / adcode 非法
- tencent_<status>  腾讯侧业务错误（status 非 0）
- upstream_error    网络 / 超时 / 响应解析失败
- place_daily_cap   地点搜索当日额度耗尽（仅 /api/geo/place；响应另带 "degraded": true）

写法参照 routers/ai.py（httpx 外呼）与 routers/news.py（免登录公开接口 + 降级）。
"""
from __future__ import annotations

import ipaddress
import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, Request, Response

from config import (BASE_DIR, GEO_PLACE_DAILY_CAP, GEO_STATICMAP_DAILY_CAP,
                    TENCENT_MAP_KEY)
from rate_limit import _client_ip, rate_limit

router = APIRouter(prefix="/api/geo", tags=["geo"])

# httpx 外呼统一超时（秒）；trust_env=False 避开系统代理变量（同 news.py）
_TIMEOUT = 5

# 腾讯位置服务 WebService 端点
_IP_URL = "https://apis.map.qq.com/ws/location/v1/ip"
_GEOCODER_URL = "https://apis.map.qq.com/ws/geocoder/v1/"
_CHILDREN_URL = "https://apis.map.qq.com/ws/district/v1/getchildren"
_STATICMAP_URL = "https://apis.map.qq.com/ws/staticmap/v2/"

# 中国范围粗校（含余量）：纬度 [3, 54]，经度 [73, 136]
_LAT_MIN, _LAT_MAX = 3.0, 54.0
_LNG_MIN, _LNG_MAX = 73.0, 136.0

# 逆地理编码缓存：键 (round(lat,3), round(lng,3))（约百米网格），TTL 10 分钟
_REVERSE_TTL = 10 * 60
_REVERSE_CACHE_MAX = 500  # 容量上限：超限淘汰最早插入的键（dict 保持插入序）
_REVERSE_CACHE: Dict[Tuple[float, float], Tuple[float, Dict[str, Any]]] = {}

# 行政区划子级缓存：键 adcode，永久缓存（街道/乡镇列表极少变；进程重启即清）
_CHILDREN_CACHE: Dict[str, List[Dict[str, Any]]] = {}

# 静态地图缓存：键 (round(lat,4), round(lng,4), zoom)（约十米网格），TTL 600s（10 分钟）
# 值为 (抓取时刻 monotonic, 图片二进制, media_type)；只缓存成功的图片，不缓存错误
_STATICMAP_TTL = 600
_STATICMAP_CACHE_MAX = 200  # 容量上限：超限淘汰最早插入的键（dict 保持插入序）
_STATICMAP_CACHE: Dict[Tuple[float, float, int], Tuple[float, bytes, str]] = {}

# 地点搜索缓存：键 (归一化 keyword, boundary)（不含页码），TTL 24 小时（86400s），容量 500
# 值 (抓取时刻 monotonic, 成功 payload)；只缓存成功结果，不缓存错误
_PLACE_URL = "https://apis.map.qq.com/ws/place/v1/search"
_PLACE_TTL = 24 * 60 * 60
_PLACE_CACHE_MAX = 500
_PLACE_CACHE: Dict[Tuple[str, str], Tuple[float, Dict[str, Any]]] = {}
_PLACE_NEARBY_RADIUS = 5000  # nearby boundary 半径（米）

# 地点搜索每日硬上限（按 Key 计的全局额度，非 rate_limit 的每 IP 每分钟窗）：
# 取自 config.GEO_PLACE_DAILY_CAP（缺省 150，留腾讯约 200/日余量）。
_PLACE_DAILY_MAX = GEO_PLACE_DAILY_CAP
_PLACE_DAY = ""    # 模块级可变状态：当前计数所属日期（time.strftime("%Y-%m-%d")）
_PLACE_COUNT = 0   # 模块级可变状态：当日已消耗次数
_PLACE_LOADED = False  # 懒加载标志：首次用到时才从计数文件读取

# 每日计数的持久化文件（**运行时数据：绝不入库 / 绝不进部署清单 / 已被 .gitignore 覆盖**）
# 内容 {"day": "YYYY-MM-DD", "count": N}；目的：让「当日 150 次熔断」扛得住进程重启
# （纯内存计数重启即清零 = 假保护）。缺失/损坏/解析失败一律当 {"day":"","count":0}，绝不抛异常。
_PLACE_COUNT_FILE = BASE_DIR / "data" / "geo_place_count.json"

# 批5：静态地图每日硬上限（按 Key 计的全局额度，非 rate_limit 的每 IP 每分窗）。
# 腾讯官方个人开发者口径：静态图 /ws/staticmap/v2 日额度 ≈6000（与 geocoder/v1 同档），
# cap 缺省取一半（config.GEO_STATICMAP_DAILY_CAP=3000），给位置卡片留余量。
_STATICMAP_DAILY_MAX = GEO_STATICMAP_DAILY_CAP
_STATICMAP_DAY = ""    # 当前计数所属日期（time.strftime("%Y-%m-%d")）
_STATICMAP_COUNT = 0   # 当日已消耗次数
_STATICMAP_LOADED = False  # 懒加载标志

# 计数持久化文件（运行时数据：绝不入库 / 绝不进部署清单 / 已被 .gitignore 覆盖）。
# 结构照 geo_place_count.json：{"day": "YYYY-MM-DD", "count": N}；目的：扛进程重启。
_STATICMAP_COUNT_FILE = BASE_DIR / "data" / "geo_staticmap_count.json"

# adcode 为 2~6 位纯数字（省 2 位 / 市 4 位 / 区县 6 位）
_ADCODE_RE = re.compile(r"^\d{2,6}$")


def _is_local_ip(ip: str) -> bool:
    """判断是否私网 / 环回等非公网地址（127.x / 10.x / 192.168.x / 172.16-31.x / ::1 等）。

    Args:
        ip: 待判定的 IP 字符串。

    Returns:
        True 表示本地或内网地址（IP 定位无意义，直接降级 ip_local）；
        解析不了的串返回 False，交给腾讯侧报 tencent_<status>，不在这里拦截。
    """
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return (addr.is_private or addr.is_loopback
            or addr.is_link_local or addr.is_unspecified)


async def _tencent_json(url: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """GET 腾讯 WebService 并解析 JSON。

    Args:
        url: 腾讯接口地址。
        params: 查询参数（含 key）。

    Returns:
        解析后的 dict；网络异常 / 超时 / 非 JSON / 非 dict 一律返回 None，
        由上层统一降级为 upstream_error，绝不把异常透传给前端。
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, trust_env=False) as client:
            resp = await client.get(url, params=params)
            data = resp.json()
    except Exception:  # noqa: BLE001 —— 任何外呼失败都降级，不透传
        return None
    return data if isinstance(data, dict) else None


def _tencent_error(data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """腾讯响应统一校验：可用（status==0）返回 None，否则返回对应错误响应。

    Args:
        data: _tencent_json 的返回值（None 表示外呼失败）。

    Returns:
        None 表示响应可用；否则为 {"ok": false, "error": ...} 错误载荷
        （upstream_error 或 tencent_<status>）。
    """
    if data is None:
        return {"ok": False, "error": "upstream_error"}
    status = data.get("status")
    if not isinstance(status, int):
        # 正常腾讯响应必有整数 status；缺失说明响应结构异常，按上游错误处理
        return {"ok": False, "error": "upstream_error"}
    if status != 0:
        return {"ok": False, "error": f"tencent_{status}"}
    return None


async def _tencent_bytes(url: str, params: Dict[str, Any]) -> Optional[Tuple[bytes, str]]:
    """GET 腾讯 WebService 并读取二进制响应（静态地图回图片，非 JSON）。

    Args:
        url: 腾讯接口地址。
        params: 查询参数（含 key）。

    Returns:
        (content_bytes, content_type) 元组；网络异常 / 超时 / 空响应一律返回 None，
        由上层统一降级为 {ok:false,...}，绝不把异常透传给前端。
    """
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, trust_env=False) as client:
            resp = await client.get(url, params=params)
            content = resp.content
            ctype = resp.headers.get("content-type") or ""
    except Exception:  # noqa: BLE001 —— 任何外呼失败都降级，不透传
        return None
    if not content:
        return None
    return content, ctype


def _reverse_cache_get(key: Tuple[float, float]) -> Optional[Dict[str, Any]]:
    """读逆地理缓存；过期则顺手删除并返回 None（下次请求重新打上游）。"""
    hit = _REVERSE_CACHE.get(key)
    if hit is None:
        return None
    fetched_at, payload = hit
    if time.monotonic() - fetched_at >= _REVERSE_TTL:
        _REVERSE_CACHE.pop(key, None)
        return None
    return payload


def _reverse_cache_put(key: Tuple[float, float], payload: Dict[str, Any]) -> None:
    """写逆地理缓存；超容量时淘汰最早插入的键，防止无界增长。"""
    if len(_REVERSE_CACHE) >= _REVERSE_CACHE_MAX:
        oldest = next(iter(_REVERSE_CACHE))
        _REVERSE_CACHE.pop(oldest, None)
    _REVERSE_CACHE[key] = (time.monotonic(), payload)


def _staticmap_cache_get(key: Tuple[float, float, int]) -> Optional[Tuple[bytes, str]]:
    """读静态地图缓存；过期则顺手删除并返回 None（下次请求重新打上游）。"""
    hit = _STATICMAP_CACHE.get(key)
    if hit is None:
        return None
    fetched_at, content, media_type = hit
    if time.monotonic() - fetched_at >= _STATICMAP_TTL:
        _STATICMAP_CACHE.pop(key, None)
        return None
    return content, media_type


def _staticmap_cache_put(key: Tuple[float, float, int], content: bytes,
                        media_type: str) -> None:
    """写静态地图缓存；超容量时淘汰最早插入的键，防止无界增长。"""
    if len(_STATICMAP_CACHE) >= _STATICMAP_CACHE_MAX:
        oldest = next(iter(_STATICMAP_CACHE))
        _STATICMAP_CACHE.pop(oldest, None)
    _STATICMAP_CACHE[key] = (time.monotonic(), content, media_type)


def _place_cache_get(key: Tuple[str, str]) -> Optional[Dict[str, Any]]:
    """读地点搜索缓存；过期则顺手删除并返回 None（下次请求重新打上游）。"""
    hit = _PLACE_CACHE.get(key)
    if hit is None:
        return None
    fetched_at, payload = hit
    if time.monotonic() - fetched_at >= _PLACE_TTL:
        _PLACE_CACHE.pop(key, None)
        return None
    return payload


def _place_cache_put(key: Tuple[str, str], payload: Dict[str, Any]) -> None:
    """写地点搜索缓存；超容量时淘汰最早插入的键，防止无界增长。"""
    if len(_PLACE_CACHE) >= _PLACE_CACHE_MAX:
        oldest = next(iter(_PLACE_CACHE))
        _PLACE_CACHE.pop(oldest, None)
    _PLACE_CACHE[key] = (time.monotonic(), payload)


def _place_count_load() -> None:
    """懒加载持久化计数（进程首次用到时读一次）。

    文件缺失 / 损坏 / JSON 解析失败 / 结构非法 → 一律当 {"day": "", "count": 0}。
    本函数**绝不抛异常**（读盘失败也不能阻断请求）。
    """
    global _PLACE_DAY, _PLACE_COUNT, _PLACE_LOADED
    if _PLACE_LOADED:
        return
    _PLACE_LOADED = True
    try:
        with open(_PLACE_COUNT_FILE, "r", encoding="utf-8") as f:
            obj = json.load(f)
        if isinstance(obj, dict):
            day = obj.get("day")
            cnt = obj.get("count")
            if (isinstance(day, str) and isinstance(cnt, int)
                    and not isinstance(cnt, bool) and cnt >= 0):
                _PLACE_DAY = day
                _PLACE_COUNT = cnt
    except Exception:  # noqa: BLE001 —— 任何读/解析异常都退回空计数
        _PLACE_DAY = ""
        _PLACE_COUNT = 0


def _place_count_save() -> None:
    """尽力把当日计数落盘（先写 .tmp 再原子替换）。

    任何异常一律吞掉：写失败就退回纯内存计数，**绝不阻断请求**。
    一天最多写 ≤ _PLACE_DAILY_MAX 次，开销可忽略。
    """
    try:
        _PLACE_COUNT_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = str(_PLACE_COUNT_FILE) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"day": _PLACE_DAY, "count": _PLACE_COUNT}, f)
        os.replace(tmp, str(_PLACE_COUNT_FILE))
    except Exception:  # noqa: BLE001 —— 落盘失败不影响计数与请求
        pass


def _place_quota_take() -> bool:
    """取一次「地点搜索每日配额」；取不到返回 False（调用方直接降级、绝不出网）。

    计数为按 Key 计的全局额度（**非** rate_limit 的每 IP 每分钟窗），持久化到
    _PLACE_COUNT_FILE：跨进程重启续上、跨自然日（time.strftime 变化）自动重置为 0。
    """
    global _PLACE_DAY, _PLACE_COUNT
    _place_count_load()
    today = time.strftime("%Y-%m-%d")
    if today != _PLACE_DAY:
        _PLACE_DAY = today
        _PLACE_COUNT = 0
        _place_count_save()
    if _PLACE_COUNT >= _PLACE_DAILY_MAX:
        return False
    _PLACE_COUNT += 1
    _place_count_save()
    return True


def _staticmap_count_load() -> None:
    """懒加载静态图计数（首次用到时读一次）；缺失/损坏/解析失败 → day="" count=0。

    本函数绝不抛异常（读盘失败也不能阻断请求）。
    """
    global _STATICMAP_DAY, _STATICMAP_COUNT, _STATICMAP_LOADED
    if _STATICMAP_LOADED:
        return
    _STATICMAP_LOADED = True
    try:
        with open(_STATICMAP_COUNT_FILE, "r", encoding="utf-8") as f:
            obj = json.load(f)
        if isinstance(obj, dict):
            day, cnt = obj.get("day"), obj.get("count")
            if (isinstance(day, str) and isinstance(cnt, int)
                    and not isinstance(cnt, bool) and cnt >= 0):
                _STATICMAP_DAY, _STATICMAP_COUNT = day, cnt
    except Exception:  # noqa: BLE001 —— 任何读/解析异常都退回空计数
        _STATICMAP_DAY, _STATICMAP_COUNT = "", 0


def _staticmap_count_save() -> None:
    """尽力把当日计数落盘（.tmp + os.replace 原子替换）；异常一律吞掉，绝不阻断请求。"""
    try:
        _STATICMAP_COUNT_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = str(_STATICMAP_COUNT_FILE) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"day": _STATICMAP_DAY, "count": _STATICMAP_COUNT}, f)
        os.replace(tmp, str(_STATICMAP_COUNT_FILE))
    except Exception:  # noqa: BLE001 —— 落盘失败不影响计数与请求
        pass


def _staticmap_quota_take() -> bool:
    """取一次「静态图每日配额」；取不到返回 False（调用方直接降级、绝不出网）。

    计数为按 Key 计的全局额度，持久化到 _STATICMAP_COUNT_FILE：跨重启续上、
    跨自然日（time.strftime 变化）自动重置为 0，与 _place_quota_take 同构。
    """
    global _STATICMAP_DAY, _STATICMAP_COUNT
    _staticmap_count_load()
    today = time.strftime("%Y-%m-%d")
    if today != _STATICMAP_DAY:
        _STATICMAP_DAY, _STATICMAP_COUNT = today, 0
        _staticmap_count_save()
    if _STATICMAP_COUNT >= _STATICMAP_DAILY_MAX:
        return False
    _STATICMAP_COUNT += 1
    _staticmap_count_save()
    return True


@router.get("/ip")
async def geo_ip(request: Request, _rl: None = Depends(rate_limit("geo"))) -> Dict[str, Any]:
    """IP 定位降级：客户端公网 IP → 省市区（浏览器 geolocation 被拒时的兜底）。

    Returns:
        成功：{"ok": true, "province", "city", "district", "adcode",
               "lat", "lng", "source": "ip"}
        失败：{"ok": false, "error": "key_missing" | "ip_local"
               | "tencent_<status>" | "upstream_error"}
    """
    if not TENCENT_MAP_KEY:
        return {"ok": False, "error": "key_missing"}
    # 复用限流模块的真实客户端 IP 解析：仅受信反代（本机 Nginx）才采信
    # X-Forwarded-For 最后一跳，防伪造 XFF。
    ip = _client_ip(request)
    if _is_local_ip(ip):
        # 本机 / 内网调用：IP 定位无意义，不消耗腾讯配额，直接降级
        return {"ok": False, "error": "ip_local"}
    data = await _tencent_json(_IP_URL, {"ip": ip, "key": TENCENT_MAP_KEY})
    err = _tencent_error(data)
    if err is not None:
        return err
    result = (data or {}).get("result") or {}
    ad_info = result.get("ad_info") or {}
    location = result.get("location") or {}
    return {
        "ok": True,
        "province": ad_info.get("province") or "",
        "city": ad_info.get("city") or "",
        "district": ad_info.get("district") or "",
        # 腾讯 IP 接口 adcode 为 int、geocoder 为 str，统一转 str 便于前端拼接
        "adcode": str(ad_info.get("adcode") or ""),
        "lat": location.get("lat"),
        "lng": location.get("lng"),
        "source": "ip",
    }


@router.get("/reverse")
async def geo_reverse(lat: str = "", lng: str = "",
                      _rl: None = Depends(rate_limit("geo"))) -> Dict[str, Any]:
    """逆地理编码：坐标 → 街道级地址 + 周边 POI（前端「附近 / 打卡」等场景）。

    Args:
        lat: 纬度（字符串手动解析，避免 FastAPI 422，统一降级 bad_params）。
        lng: 经度。

    Returns:
        成功：{"ok": true, "address", "province", "city", "district", "street",
               "street_number", "adcode", "pois": [{title, address, _distance}]}
        （pois 最多 10 条）
        失败：{"ok": false, "error": "bad_params" | "key_missing"
               | "tencent_<status>" | "upstream_error"}
    """
    # 参数校验：可转 float + 中国范围粗校（nan / inf 会被范围比较自然拦下）
    try:
        la, ln = float(lat), float(lng)
    except (TypeError, ValueError):
        return {"ok": False, "error": "bad_params"}
    if not (_LAT_MIN <= la <= _LAT_MAX and _LNG_MIN <= ln <= _LNG_MAX):
        return {"ok": False, "error": "bad_params"}

    # 进程内缓存命中直接返回（键取 3 位小数网格 ≈ 百米级；TTL 10 分钟，省配额）
    cache_key = (round(la, 3), round(ln, 3))
    cached = _reverse_cache_get(cache_key)
    if cached is not None:
        return cached

    if not TENCENT_MAP_KEY:
        return {"ok": False, "error": "key_missing"}

    # 后端直接收 JSON，不用前端旧版 JSONP 的 output=jsonp 参数
    data = await _tencent_json(_GEOCODER_URL, {
        "location": f"{la},{ln}",
        "key": TENCENT_MAP_KEY,
        "get_poi": 1,
        "poi_options": "page_size=20",
    })
    err = _tencent_error(data)
    if err is not None:
        return err

    result = (data or {}).get("result") or {}
    comp = result.get("address_component") or {}
    ad_info = result.get("ad_info") or {}
    pois_raw = result.get("pois") or []
    pois = [
        {
            "title": p.get("title") or "",
            "address": p.get("address") or "",
            "_distance": p.get("_distance"),
            # R104b：随 POI 原样透传腾讯自带坐标（数值），供前端选中后生成位置卡；
            # 缺 location / 非 dict 时自然为 None，前端 Number()+isFinite 判空后降级纯文字。
            "lat": (p.get("location") or {}).get("lat"),
            "lng": (p.get("location") or {}).get("lng"),
        }
        for p in pois_raw
        if isinstance(p, dict)
    ][:10]
    payload = {
        "ok": True,
        "address": result.get("address") or "",
        "province": comp.get("province") or "",
        "city": comp.get("city") or "",
        "district": comp.get("district") or "",
        "street": comp.get("street") or "",
        "street_number": comp.get("street_number") or "",
        "adcode": str(comp.get("adcode") or ad_info.get("adcode") or ""),
        "pois": pois,
    }
    _reverse_cache_put(cache_key, payload)
    return payload


@router.get("/children")
async def geo_children(adcode: str = "",
                       _rl: None = Depends(rate_limit("geo"))) -> Dict[str, Any]:
    """行政区划子级：adcode → 直辖子级列表（第 4 级「街道/乡镇」选择数据源）。

    Args:
        adcode: 行政区划码（2~6 位纯数字，如 110108 = 北京市海淀区）。

    Returns:
        成功：{"ok": true, "children": [{"id", "name"}]}；
              部分区县无街道数据时 children 为空数组（前端降级为手动输入）。
        失败：{"ok": false, "error": "bad_params" | "key_missing"
               | "tencent_<status>" | "upstream_error"}
    """
    code = (adcode or "").strip()
    if not _ADCODE_RE.match(code):
        return {"ok": False, "error": "bad_params"}

    # 永久缓存命中直接返回（街道列表极少变；district 接口配额有限）
    cached = _CHILDREN_CACHE.get(code)
    if cached is not None:
        return {"ok": True, "children": cached}

    if not TENCENT_MAP_KEY:
        return {"ok": False, "error": "key_missing"}

    data = await _tencent_json(_CHILDREN_URL, {"id": code, "key": TENCENT_MAP_KEY})
    err = _tencent_error(data)
    if err is not None:
        return err

    # 腾讯 result[0] 是子级行政区数组；缺失 / 结构异常一律按空子级处理
    result = (data or {}).get("result")
    raw = result[0] if isinstance(result, list) and result and isinstance(result[0], list) else []
    children = [
        {"id": str(c.get("id") or ""), "name": c.get("name") or ""}
        for c in raw
        if isinstance(c, dict) and c.get("id") and c.get("name")
    ]
    _CHILDREN_CACHE[code] = children
    return {"ok": True, "children": children}


@router.get("/staticmap")
async def geo_staticmap(lat: str = "", lng: str = "", zoom: str = "",
                        _rl: None = Depends(rate_limit("geo"))) -> Any:
    """静态地图图片代理：坐标 → 腾讯静态地图图片二进制（前端 <img> 直接引用）。

    Args:
        lat: 纬度（字符串手动解析，避免 FastAPI 422，统一降级 bad_params）。
        lng: 经度。
        zoom: 缩放级别（4~18，缺省 16；非法 / 越界一律夹取到合法区间）。

    Returns:
        成功：HTTP 200 + image/* 图片二进制（Content-Type 原样透传）。
        失败：HTTP 200 + {"ok": false, "error": "bad_params" | "key_missing"
              | "tencent_<status>" | "upstream_error"}（前端 <img> onerror 兜底隐藏，不破版）。
    """
    # 参数校验：lat/lng 必填且数值合法（纬度 -90..90、经度 -180..180）
    if lat == "" or lng == "":
        return {"ok": False, "error": "bad_params"}
    try:
        la, ln = float(lat), float(lng)
    except (TypeError, ValueError):
        return {"ok": False, "error": "bad_params"}
    if not (-90.0 <= la <= 90.0 and -180.0 <= ln <= 180.0):
        return {"ok": False, "error": "bad_params"}
    # zoom：缺省 16；非法 / 越界夹取到 [4, 18]
    try:
        z = int(zoom) if zoom != "" else 16
    except (TypeError, ValueError):
        z = 16
    z = min(max(z, 4), 18)

    # 进程内缓存命中直接返回（键取 4 位小数网格 ≈ 十米级；TTL 600s，省配额）
    cache_key = (round(la, 4), round(ln, 4), z)
    cached = _staticmap_cache_get(cache_key)
    if cached is not None:
        content, media_type = cached
        return Response(content=content, media_type=media_type or "image/png")

    if not TENCENT_MAP_KEY:
        return {"ok": False, "error": "key_missing"}

    # 批5：静态图每日熔断（顺序与 place 一致：缓存命中已在上方返回；未命中才 take；
    # take 失败直接降级，绝不出网）。rate_limit("geo") 保持原样不动。
    if not _staticmap_quota_take():
        return {"ok": False, "degraded": True, "error": "staticmap_daily_cap"}

    # center 为「纬度,经度」顺序；markers 中的 | 由 httpx 自动 URL 编码为 %7C
    got = await _tencent_bytes(_STATICMAP_URL, {
        "center": f"{la},{ln}",
        "zoom": z,
        "size": "600*300",
        "maptype": "roadmap",
        "markers": f"size:large|color:red|{la},{ln}",
        "key": TENCENT_MAP_KEY,
    })
    if got is None:
        return {"ok": False, "error": "upstream_error"}
    content, media_type = got
    # 成功 = 上游回图片；失败 = 上游回 JSON 错误体（如 status 121 超配额）
    if media_type.startswith("image/"):
        _staticmap_cache_put(cache_key, content, media_type)
        return Response(content=content, media_type=media_type)
    # 非图片：尝试解析腾讯 JSON 错误码（绝不抛 500）
    status = None
    try:
        err_data = json.loads(content.decode("utf-8", "replace"))
        if isinstance(err_data, dict):
            status = err_data.get("status")
    except Exception:  # noqa: BLE001
        status = None
    if isinstance(status, int):
        return {"ok": False, "error": f"tencent_{status}"}
    return {"ok": False, "error": "upstream_error"}


@router.get("/place")
async def geo_place(keyword: str = "", city: str = "", adcode: str = "",
                    lat: str = "", lng: str = "",
                    _rl: None = Depends(rate_limit("geo"))) -> Dict[str, Any]:
    """地点搜索：keyword + 地区/坐标 → 腾讯 place/v1/search 的 POI 列表。

    仅代理 `place/v1/search`（`place/v1/explore` 等其它 place 端点一律不碰，配额红线）。
    与前三个接口不同：本接口外呼受**按 Key 计的全局每日硬上限**约束
    （config.GEO_PLACE_DAILY_CAP，缺省 150，留腾讯约 200/日余量）；`rate_limit("geo")`
    仍作「每 IP 每分钟」突发闸保留，两者职责不同、不可互相替代。

    调用顺序（错序 = 白烧配额）：
      查缓存 → 命中直接返回（不计数、不出网）→ 未命中才取日配额
      → 取不到直接降级 degraded（不出网）→ 取到才外呼。

    Args:
        keyword: 搜索关键词（strip 后 2..30 字符，必填）。
        adcode: 行政区划码（2~6 位数字，优先级最高）→ region(adcode,0)。
        city: 城市名（次优先）→ region(city,0)。
        lat / lng: 坐标（末位降级）→ nearby(lat,lng,5000)（中国范围粗校）。
        三者（adcode / city / lat+lng）至少给一个，否则 bad_params。

    Returns:
        成功：{"ok": true, "pois": [{title, address, category, lat, lng}],
               "cached": bool, "quota_left": int}（pois 最多 20 条）。
        失败：HTTP 200 + {"ok": false, "error": ...}；
              日额度耗尽：{"ok": false, "degraded": true, "error": "place_daily_cap"}。
    """
    # 1) 关键词校验：strip 后 2..30 字符
    kw = (keyword or "").strip()
    if not (2 <= len(kw) <= 30):
        return {"ok": False, "error": "bad_params"}

    # 2) boundary 三选一（优先级：adcode > city > 坐标 nearby）
    code = (adcode or "").strip()
    cty = (city or "").strip()
    if _ADCODE_RE.match(code):
        boundary = f"region({code},0)"
    elif cty:
        boundary = f"region({cty},0)"
    else:
        # 坐标降级：可转 float 且落在中国范围粗校区间（nan/inf 被范围比较自然拦下）
        try:
            la, ln = float(lat), float(lng)
        except (TypeError, ValueError):
            return {"ok": False, "error": "bad_params"}
        if not (_LAT_MIN <= la <= _LAT_MAX and _LNG_MIN <= ln <= _LNG_MAX):
            return {"ok": False, "error": "bad_params"}
        boundary = f"nearby({la},{ln},{_PLACE_NEARBY_RADIUS})"

    # 3) 缓存命中 → 直接返回（不取日配额、不出网，省额度）
    cache_key = (kw, boundary)
    cached = _place_cache_get(cache_key)
    if cached is not None:
        return {"ok": True, "pois": cached.get("pois") or [], "cached": True,
                "quota_left": _PLACE_DAILY_MAX - _PLACE_COUNT}

    if not TENCENT_MAP_KEY:
        return {"ok": False, "error": "key_missing"}

    # 4) 未命中才取「按 Key 计的全局每日配额」；取不到直接降级（绝不出网）
    if not _place_quota_take():
        return {"ok": False, "degraded": True, "error": "place_daily_cap"}

    # 5) 取到配额才外呼（只打 place/v1/search；page_size / page_index 固定）
    data = await _tencent_json(_PLACE_URL, {
        "keyword": kw,
        "boundary": boundary,
        "page_size": 20,
        "page_index": 1,
        "key": TENCENT_MAP_KEY,
    })
    err = _tencent_error(data)
    if err is not None:
        return err

    # 列表落点在顶层 data（**不是** result.pois —— 那是 geocoder 的结构）
    raw = (data or {}).get("data") or []
    pois = [
        {
            "title": p.get("title") or "",
            "address": p.get("address") or "",
            "category": p.get("category") or "",
            "lat": (p.get("location") or {}).get("lat"),
            "lng": (p.get("location") or {}).get("lng"),
        }
        for p in raw
        if isinstance(p, dict)
    ][:20]
    payload = {"ok": True, "pois": pois}
    _place_cache_put(cache_key, payload)
    return {"ok": True, "pois": pois, "cached": False,
            "quota_left": _PLACE_DAILY_MAX - _PLACE_COUNT}
