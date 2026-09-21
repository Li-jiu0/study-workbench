# -*- coding: utf-8 -*-
"""客户端版本检测：GET /api/app/version（免登录、纯公开只读）。

前端消费方：assets/xt-update.js（设置页「检测更新」入口 + 更新.html）。

--------------------------------------------------------------------------
【状态码约定】
    一律返回 HTTP 200。冷启动期间不要用 502 打扰前端（否则用户看到的是
    「服务器开小差了」这种误报），而是用响应体的 status 字段区分：
        status = "ok"        版本清单已就绪，正常返回全部字段
        status = "starting"  进程在跑，但版本清单还没加载出来（首次启动约 30 秒）
    前端据此显示「更新服务启动中…请稍候重试」，而不是故障文案。

【apkUrl 组装】
    apkUrl = str(request.base_url).rstrip('/') + '/static/apk/' + quote(APK 文件名)
    从请求本身取 host/port，所以：
        直连 8000  -> http://110.42.134.62:8000/static/apk/...
        经 nginx 80 -> http://110.42.134.62/static/apk/...
    绝不会漏出 127.0.0.1 之类内网地址。文件名含中文，必须 quote。

【apkReady / 404 场景】
    按 Root_Path 推算 APK 物理位置：<Root>/web/static/apk/<文件名>
    （Root=/opt/study-workbench，web 静态根是 <Root>/web，本文件在 <Root>/server；
      故相对 server/config.BASE_DIR 即 ../web/static/apk/）
    文件不存在时 apkReady=False 且 apkUrl=""，前端显示「安装包暂时不可用」
    而不是给一个点了 404 的下载按钮。

【响应字段】（前端强依赖，不可随意改名/缺字段）
    status       str   "ok" / "starting"
    version      str   展示版本号，如 "1.23"
    versionCode  int   自增长整型版本号
    apkUrl       str   APK 下载地址（按上述规则动态拼，非写死常量）
    apkReady     bool  APK 是否已就位（False 时前端不显示下载按钮）
    notes        list  本次更新内容，每项一行文案
    changelog    list  历史更新日志 [{version,date,text}, ...]
    publishedAt  str   发布时间，ISO8601
    forced       bool  是否强制更新

【行为约定】
    只读 GET，无鉴权；manifest 读取走 60 秒内存缓存；
    响应头 Cache-Control: public, max-age=60（apkUrl 按请求实时拼，不进缓存）。
    任何异常降级为 "starting"，绝不用非 200 打扰前端（参照 routers/news.py）。

注意：JSONResponse 必须从 fastapi.responses 导入（新版 FastAPI 顶层不再
re-export，`from fastapi import JSONResponse` 会 ImportError 导致整个应用起不来）。
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from config import BASE_DIR

router = APIRouter(tags=["app"])

# ==========================================================================
# ★★★ 每次发版要改的就是这两个地方 ★★★
#   1) server/routers/version.json —— 版本号 /notes /changelog /APK 文件名
#   2) android/AndroidManifest.xml 的 versionName / versionCode（与上面对齐）
#      以及前端 assets/xt-update.js 的 CURRENT_VERSION
# ==========================================================================

# 版本清单（manifest）：同目录 version.json。它是唯一权威来源 ——
# 文件缺失即视为「清单还没加载出来」，返回 status="starting"（冷启动），
# 不再用常量兜底，避免「进程起来了却谎报一个版本号」。
_MANIFEST_FILE = BASE_DIR / "routers" / "version.json"
_STATIC_APK_PREFIX = "/static/apk/"

# Root_Path = /opt/study-workbench；web 静态根 = <Root>/web；本模块在 <Root>/server。
# 故 server/config.BASE_DIR 再上一级就是 Root，APK 物理位置 = ../web/static/apk/
_WEB_STATIC_DIR = BASE_DIR.parent / "web" / "static"
_APK_DIR = _WEB_STATIC_DIR / "apk"

_CACHE_TTL = 60  # 秒；manifest 的读盘缓存时长
# 服务端内存缓存：模块级 (fetched_at, payload)；payload 为 None 表示尚未加载成功
_CACHE: Tuple[float, Optional[Dict[str, Any]]] = (0.0, None)


def _reset_cache() -> None:
    """清空服务端内存缓存（仅供冒烟测试使用）。"""
    global _CACHE
    _CACHE = (0.0, None)


def _changelog_notes(raw: Any) -> List[str]:
    """整理单个 changelog 条目的 notes（数组；无则空列表）。"""
    out: List[str] = []
    if isinstance(raw, (list, tuple)):
        for item in raw:
            out.append(str(item))
    elif raw not in (None, ""):
        out.append(str(raw))
    return out


def _normalize_changelog(raw: Any) -> List[Dict[str, Any]]:
    """整理历史更新日志：{version, date, notes[]}。

    date 允许为空字符串 —— 前端只在非空时才渲染日期；缺失历史日期时不要编，
    留空即可（见 version.json 中 v2.3 及更早的条目）。
    """
    out: List[Dict[str, Any]] = []
    if not isinstance(raw, (list, tuple)):
        return out
    for item in raw:
        if isinstance(item, dict):
            out.append({
                "version": str(item.get("version") or ""),
                "date": str(item.get("date") or ""),
                "notes": _changelog_notes(item.get("notes")),
            })
        else:
            out.append({"version": "", "date": "", "notes": [str(item)]})
    return out


def _coerce(raw: Any) -> Dict[str, Any]:
    """把任意来源的字典整理成对外承诺的形状（缺字段兜底、类型降级）。"""
    source = raw if isinstance(raw, dict) else {}

    notes_raw = source.get("notes")
    notes: List[str] = []
    if isinstance(notes_raw, (list, tuple)):
        for item in notes_raw:
            notes.append(str(item))

    code_raw = source.get("versionCode")
    try:
        code = int(code_raw or 0)
    except (TypeError, ValueError):
        code = 0

    return {
        "version": str(source.get("version") or ""),
        "versionCode": code,
        "apkFileName": str(source.get("apkFileName") or ""),
        "notes": notes,
        "changelog": _normalize_changelog(source.get("changelog")),
        "publishedAt": str(source.get("publishedAt") or ""),
        "forced": bool(source.get("forced")),
    }


def _read_manifest() -> Optional[Dict[str, Any]]:
    """读取版本清单；不存在或格式错误返回 None（调用方据此判定 starting）。"""
    try:
        with open(str(_MANIFEST_FILE), "r", encoding="utf-8") as fh:
            loaded = json.load(fh)
    except (OSError, ValueError):
        return None
    if not isinstance(loaded, dict):
        return None
    return _coerce(loaded)


def _load_manifest() -> Optional[Dict[str, Any]]:
    """带 60 秒缓存地取版本清单；取不到返回 None。"""
    global _CACHE
    now = time.time()
    if _CACHE[1] is not None and (now - _CACHE[0]) < _CACHE_TTL:
        return dict(_CACHE[1])

    data = _read_manifest()
    _CACHE = (now, data)
    return dict(data) if data is not None else None


def _apk_exists(file_name: str) -> Tuple[bool, str]:
    """判断 APK 是否已在静态目录就位，返回 (是否存在, 绝对文件路径)。"""
    if not file_name:
        return False, ""
    path = _APK_DIR / file_name
    try:
        return path.is_file(), str(path)
    except OSError:
        return False, str(path)


def _build_apk_url(base_url: str, file_name: str) -> str:
    """按请求 host 组装 APK 下载地址（中文文件名必须 quote）。"""
    if not file_name:
        return ""
    return base_url.rstrip("/") + _STATIC_APK_PREFIX + quote(file_name)


@router.get("/api/app/version")
def get_app_version(request: Request) -> JSONResponse:
    """返回最新版本信息。免登录、只读；冷启动返回 status="starting"，仍为 HTTP 200。"""
    manifest = _load_manifest()

    # 冷启动：进程在，但版本清单还没加载出来 —— 不是故障，别让前端显示「开小差了」
    if manifest is None:
        return JSONResponse(
            {"status": "starting"},
            headers={"Cache-Control": "no-store"},
        )

    base_url = str(request.base_url)
    apk_ready, _apk_path = _apk_exists(manifest["apkFileName"])
    apk_url = _build_apk_url(base_url, manifest["apkFileName"]) if apk_ready else ""

    payload: Dict[str, Any] = {
        "status": "ok",
        "version": manifest["version"],
        "versionCode": manifest["versionCode"],
        "apkUrl": apk_url,
        "apkReady": apk_ready,
        "notes": manifest["notes"],
        "changelog": manifest["changelog"],
        "publishedAt": manifest["publishedAt"],
        "forced": manifest["forced"],
    }
    return JSONResponse(payload, headers={"Cache-Control": "public, max-age=60"})
