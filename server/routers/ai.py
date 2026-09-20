"""AI 中转：密钥只存后端 .env，前端仅选择模型，不接触任何密钥。

- POST /api/ai/chat → SSE 流式返回纯文本增量；每次调用按天计数（限额防滥用）；
  用户提问与完整回复入库（ai_logs），换设备可从 GET /api/ai/history 恢复上下文。
- 可选 noteId：服务端读取该笔记（作者本人或公开笔记）作为 system 上下文注入。
- 可选 temperature / maxTokens：透传给模型（限制在安全范围）。
"""
import json
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from config import AI_DAILY_LIMIT, AI_PROVIDERS, configured_providers
from database import (AiLog, AiUsage, Note, SessionLocal, User, get_db,
                      now_iso)
from quota_ledger import (check_quota, force_exhaust, known_model_ids,
                          ledger_snapshot, record_usage, reset_usage,
                          resolve_model_name, resolve_model_name_lenient,
                          tokens_from_usage)
from rate_limit import rate_limit
from schemas import ChatIn
from security import get_current_user, get_current_user_optional

router = APIRouter(prefix="/api/ai", tags=["ai"])


class _ChatIn(ChatIn):
    """R103：/chat 专用请求体（在共享 ChatIn 之上加一个可选的真实模型名）。

    背景：前端 assets/ai-config.js 的 builtinModels.id（如 ark-v4-pro）与后端
    server/data/model_registry.json 的键（如 ark-ds-v4-pro-ga）命名并不统一
    （实测 45 个前端 id 仅 5 个与 registry 键相同）。R88-M1 起前端会带上 modelId，
    但服务端按该 id 解析真实模型名会大面积落空，于是恒回退 .env 默认模型（ARK_MODEL），
    表现为「选哪个模型都跑同一个」，用量明细因此只显示默认模型名。

    modelName 由前端随请求带来（其 ai-config 中该模型对应的真实模型串，前端本就持有）。
    服务端**只在按 modelId 解析失败时**用它做二次解析，且仍走 model_registry 白名单校验：
    解析不到即保持原有「回退 .env 默认模型」的行为，绝不放行任意/未登记的模型名。
    """

    modelName: str | None = None

    # R107：「深度思考」开关。缺省 False——不带该字段或传 false 时，响应与旧版
    # **逐字节一致**（纯文本增量，无 data: 分帧），这是兼容硬门禁；只有显式
    # reasoning=true 时才切换为 SSE 行分帧输出（t:r/t:c/t:u + [DONE] 收尾）。
    reasoning: bool = False

    # R130：向量/重排专用透传字段。仅当该模型在 model_registry.json 中声明
    # type=embedding / type=rerank 时才会被读取，chat 模型完全不受影响。
    #   input     -> 上游 /v1/embeddings 的 input（字符串或字符串数组）；
    #   query     -> 上游 /v1/rerank 的 query；
    #   documents -> 上游 /v1/rerank 的 documents；
    #   topN      -> 上游 /v1/rerank 的 top_n。
    input: str | list[str] | None = None
    documents: list[str] | None = None
    query: str | None = None
    topN: int | None = None


_MAX_NOTE_CTX = 4000
_MAX_MSGS = 20

# 单次上报的用量上限（防恶意刷大数字把模型一次打停），与 quota_ledger 保持一致
_MAX_CONSUME_AMOUNT = 100000

# R107：「深度思考」上游开关白名单——仅当请求 reasoning=true 且 base_url 命中下表子串时，
# 才向 chat/completions 请求体追加上游思考开关字段。表外平台（千帆/OpenAI/DeepSeek/Kimi
# 等）一律不加：未知字段可能被平台直接 400 拒绝；reasoner 类模型默认输出思维链，无需开关。
# 后续按平台实测再扩（注意：键为 base_url 的「包含子串」判定，非全等）。
REASONING_UPSTREAM_FIELDS: list[tuple[str, dict]] = [
    ("volces.com", {"thinking": {"type": "enabled"}}),        # 火山方舟（豆包）
    ("dashscope.aliyuncs.com", {"enable_thinking": True}),    # 阿里 Qwen
    ("api.siliconflow.cn", {"enable_thinking": True}),        # 硅基流动
    ("open.bigmodel.cn", {"thinking": {"type": "enabled"}}),  # 智谱 GLM
]


def _sse_frame(t: str, d) -> bytes:
    """R107 分帧 SSE 行（契约 §1.2）：data: {"t":"r"|"c","d":"<增量>"}\\n\\n。

    Content-Type 仍为 text/plain; charset=utf-8（不改响应头）；ensure_ascii=False
    保持中文原文，客户端按 UTF-8 解码。
    """
    return b"data: " + json.dumps({"t": t, "d": d}, ensure_ascii=False).encode("utf-8") + b"\n\n"

# R73j：上游非 200 的友好提示（key=HTTP 状态码）。未命中的状态码仍回退为原始报文。
_STATUS_HINTS = {
    400: "请求参数不被该模型平台接受",
    401: "该平台 API Key 无效或已过期，请在 server/.env 更新后重启服务",
    402: "该模型平台账户余额不足，请充值后重试，或切换其他模型/平台",
    403: "该平台拒绝了本次请求（Key 权限不足或地域限制）",
    404: "模型 ID 不存在或接口地址有误，请检查服务端模型配置",
    413: "对话内容过长，请精简后重试",
    429: "该平台限流或额度已用完，请稍后再试或切换模型",
    500: "模型平台服务内部错误，请稍后再试或切换模型",
    502: "模型平台网关异常，请稍后再试",
    503: "该模型平台暂时不可用，请稍后再试",
}


def _today() -> str:
    from datetime import date
    return date.today().strftime("%Y-%m-%d")


def _record_usage(db: Session, user_id: int) -> int:
    """按天递增调用数；超过每日限额抛 429。返回递增后的计数。"""
    row = db.query(AiUsage).filter(AiUsage.user_id == user_id, AiUsage.day == _today()).first()
    if not row:
        row = AiUsage(user_id=user_id, day=_today(), count=0)
        db.add(row)
    if row.count >= AI_DAILY_LIMIT:
        db.commit()
        raise HTTPException(429, f"今日 AI 调用次数已达上限（{AI_DAILY_LIMIT} 次），明天再来吧")
    row.count += 1
    db.commit()
    return row.count


def _note_system(note: Note) -> str:
    body = (note.content or "")[:_MAX_NOTE_CTX]
    more = "…" if len(note.content or "") > _MAX_NOTE_CTX else ""
    return (f"你正在帮助用户学习。以下是用户的一篇笔记《{note.title}》"
            f"（分类：{note.category}），请优先结合这篇笔记内容回答用户问题：\n\n{body}{more}")


# ---------------------------------------------------------------------------
# R130：向量/重排模型按类型路由
# ---------------------------------------------------------------------------
# 背景：/api/ai/chat 此前只有 chat/completions 一条转发路径，向量模型
# （BAAI/bge-m3 等）与重排模型（BAAI/bge-reranker-v2-m3）被送进 chat 端点，
# 硅基流动一律 400 {"code":20012,"message":"Model does not exist"}。
# 修复：model_registry.json 条目新增 type 字段（embedding / rerank），
# 命中时改走从 provider base_url 派生的专用上游端点；其余模型（含所有 chat
# 模型）的请求与响应保持与旧版**逐字节一致**。

_MODEL_TYPE_INDEX: dict[str, dict] | None = None


def _model_type_index() -> dict[str, dict]:
    """读取 model_registry.json，构建 (条目键 + 真实模型名) -> 类型信息映射。

    仅收录带非空 type 字段的条目（当前为 embedding / rerank），进程内缓存一次；
    读取失败（文件缺失/JSON 损坏）返回空映射，所有请求照旧走 chat 路径，绝不因此拒服。
    """
    global _MODEL_TYPE_INDEX
    if _MODEL_TYPE_INDEX is not None:
        return _MODEL_TYPE_INDEX
    idx: dict[str, dict] = {}
    path = Path(__file__).resolve().parent.parent / "data" / "model_registry.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    if isinstance(data, dict):
        for key, entry in data.items():
            k = str(key).strip()
            if not k or k.startswith("_") or not isinstance(entry, dict):
                continue
            t = str(entry.get("type") or "").strip()
            if not t:
                continue
            name = str(entry.get("model") or "").strip()
            info = {"type": t, "provider": str(entry.get("provider") or "").strip()}
            idx[k] = info
            if name and name not in idx:
                idx[name] = info
    _MODEL_TYPE_INDEX = idx
    return idx


def _model_type_info(provider: str, quota_key: str, client_model: str) -> dict:
    """解析本次请求对应的模型类型信息；无 type 或 provider 不匹配返回空 dict。

    查找顺序与 quota_ledger._lookup_registry 一致：先按前端 modelId（registry 键），
    再按前端声明的真实模型名（modelName）；provider 为空视为不限制。
    """
    idx = _model_type_index()
    for mid in (str(quota_key or "").strip(), str(client_model or "").strip()):
        if not mid:
            continue
        info = idx.get(mid)
        if info and (not info["provider"] or info["provider"] == provider):
            return info
    return {}


def _upstream_special_url(base_url: str, kind: str) -> str:
    """从 chat/completions base_url 派生 embeddings / rerank 上游端点。

    例：https://api.siliconflow.cn/v1/chat/completions
        -> kind=embeddings: https://api.siliconflow.cn/v1/embeddings
        -> kind=rerank:     https://api.siliconflow.cn/v1/rerank
    base_url 不含 chat/completions（异常配置）时返回空串，调用方按 500 拒绝，
    绝不猜测改写其它形态的 URL。
    """
    b = str(base_url or "")
    pos = b.find("chat/completions")
    if pos < 0:
        return ""
    return b[:pos] + kind


async def _serve_special(body: "_ChatIn", cfg: dict, quota_key: str,
                         model_name: str, messages: list, kind: str):
    """R130：向量/重排专用转发（上游 /v1/embeddings、/v1/rerank）。

    - embeddings：input 取请求体 input（字符串或字符串数组），缺省取最后一条
      用户消息正文；上游响应 JSON 原样透传（含 data[].embedding 与 usage）。
    - rerank：query 取请求体 query，缺省取最后一条用户消息正文；documents 取
      请求体 documents，缺省 [query]；top_n 取请求体 topN，缺省文档数（夹在
      [1, len(documents)]）。
    - 上游非 200 时按原状态码透传错误体；不写 ai_logs（非对话调用）；
      每日调用计数已在 chat() 入口按登录用户递增；账本按上游 usage 记账
      （拿不到按 1 次计），与 chat 路径的记账口径一致。
    """
    url = _upstream_special_url(cfg["base_url"], kind)
    if not url:
        raise HTTPException(500, f"无法从平台端点 {cfg['base_url']} 派生 {kind} 上游地址，请检查 server/.env 配置")

    last_user_text = next((m["content"] for m in reversed(messages)
                           if m.get("role") == "user"), "")
    if kind == "embeddings":
        raw = body.input if body.input is not None else last_user_text
        if isinstance(raw, str):
            texts = [raw] if raw.strip() else []
        elif isinstance(raw, list):
            texts = [str(x) for x in raw if str(x).strip()]
        else:
            texts = []
        if not texts:
            raise HTTPException(400, "缺少向量输入内容（input 字段或最后一条用户消息）")
        payload: dict = {"model": model_name, "input": texts,
                         "encoding_format": "float"}
    else:  # rerank
        query = (str(body.query or "").strip() or str(last_user_text or "").strip())
        docs = [str(d) for d in (body.documents or []) if str(d).strip()]
        if not docs:
            docs = [query] if query else []
        if not query or not docs:
            raise HTTPException(400, "缺少重排输入（query/documents 字段或最后一条用户消息）")
        top_n = len(docs)
        if body.topN:
            top_n = min(max(int(body.topN), 1), len(docs))
        payload = {"model": model_name, "query": query, "documents": docs,
                   "top_n": top_n}

    headers = {"Content-Type": "application/json",
               "Authorization": f"Bearer {cfg['api_key']}"}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"连接模型服务失败：{e.__class__.__name__}")

    # 账本记账：embeddings 的 usage.prompt_tokens / rerank 的 usage.input_tokens
    used_tokens = 0
    try:
        j = resp.json()
    except Exception:
        j = None
    if isinstance(j, dict) and isinstance(j.get("usage"), dict):
        u = j["usage"]
        try:
            used_tokens = int(u.get("prompt_tokens") or u.get("input_tokens") or 0) or 0
        except (TypeError, ValueError):
            used_tokens = 0
    record_usage(quota_key, used_tokens if used_tokens > 0 else 1,
                 ok=(resp.status_code == 200))

    # 响应头带「实际执行的模型名」，前端记账口径与 chat 路径一致（ASCII 安全）
    safe_model = "".join(ch for ch in str(model_name) if ord(ch) < 128) or "unknown"
    if j is not None:
        return JSONResponse(j, status_code=resp.status_code,
                            headers={"X-Ai-Model-Used": safe_model})
    return JSONResponse({"raw": resp.text[:2000]}, status_code=resp.status_code,
                        headers={"X-Ai-Model-Used": safe_model})


# ---------------------------------------------------------------------------
# R131：媒体能力服务端中转（图片 / ASR / 视频 / 3D）共享基建
# ---------------------------------------------------------------------------
# 背景：此前生图 / ASR / 视频 / 3D 由前端拿 provider key 直连上游（违反 G1 前端零密钥）。
# 本节把这些调用下沉到服务端：前端只发 modelId + 业务参数，密钥只出现在上游请求里。
#
# 与 _serve_special（chat 风格分流）并列但**不复用**它：图片是 images/generations、
# ASR 是 multipart、视频/3D 是 contents/generations/tasks（异步 create + poll），
# URL 形态与请求/响应契约都与 chat 不兼容（详见设计文档 §2.4）。共享的是内部基建：
# configured_providers / rate_limit("consume") / record_usage / 注册表白名单 /
# _STATUS_HINTS / _upstream_special_url。

# 版本闸门（P0-9）：前端在 /api/ai/* 请求头带 X-Client-Version；缺失或低于该值
# → 统一 version_outdated 错误体（禁静默失败）。
#
# **默认关闭（空串即不校验）**：当前线上前端尚未发送 X-Client-Version，默认开启
# 会让后端一部署就把 Web 与旧 APK 的全部 AI 能力打成「请更新」，等于主动打瘫线上。
# 由主理人在 server/.env 里设值开启，时机是「前端改造上线并开始发送该请求头之后」。
MIN_RELAY_CLIENT_VERSION = os.getenv("MIN_RELAY_CLIENT_VERSION", "").strip()
_VERSION_OUTDATED_MSG = "当前版本已停用，请更新到最新版以继续使用 AI 功能"

# R132：海外平台（gemini / openrouter）改为**动态判定**——不再无条件软下线，
# 而是「key 已配置 且 proxy 已配置」才视为就绪（国内服务器直连不通，fail-closed）。
# 未就绪时：/api/ai/models 不下发该平台（前端"不出现即置灰"兜底），/chat 直接拒绝。
_OVERSEA_PROVIDERS = ("gemini", "openrouter")


def _oversea_ready(cfg: dict, pid: str = "") -> bool:
    """海外 provider 就绪判定：api_key 必备；proxy 有则走代理，无代理时可用
    <PROVIDER>_ALLOW_DIRECT=1 显式声明「服务器实测可直连」（fail-open 仅对显式 opt-in 生效）。

    configured_providers() 已过滤掉无 key 的 provider，这里补验 proxy；
    对非海外 provider 恒返回 True（国内平台无需代理）。
    """
    if not str(cfg.get("api_key") or "").strip():
        return False
    if str(cfg.get("proxy") or "").strip():
        return True
    if pid:
        return os.getenv(f"{pid.upper()}_ALLOW_DIRECT", "").strip() == "1"
    return False


def _provider_available(provider_id: str, cfg: dict) -> bool:
    """/api/ai/models 与媒体端点共用的平台可用性判定。"""
    if provider_id in _OVERSEA_PROVIDERS:
        return _oversea_ready(cfg, provider_id)
    return True

# 媒体端点上游超时（秒）。视频/3D 创建是异步的，只等一个 create 响应，无需长超时。
_MEDIA_TIMEOUT = 60.0
# ASR 单文件上限（字节）：25MB，防超大上传打爆内存。
_ASR_FILE_MAX = 25 * 1024 * 1024
# ASR 上游兜底地址（provider base_url 派生不出来时使用；国内平台）。
_ASR_UPSTREAM_URL = "https://api.siliconflow.cn/v1/audio/transcriptions"

# 媒体端点统一走 consume 桶（与 /usage/consume 同口径，默认 60 次/分钟/IP）。
# 这里取到函数后在各端点内显式调用（而非挂 Depends），目的是超限也返回统一
# 错误体，不让 FastAPI 抛默认的 {"detail": ...}。
_RATE_LIMIT_CONSUME = rate_limit("consume")


def _err(kind: str, error: str, code: int = 400, hint: str = "", **extra) -> JSONResponse:
    """统一错误体（设计 §2.5）。

    恒返回 HTTP 200 + 结构化 JSON——媒体端点一律不抛 FastAPI 默认 {"detail":...}，
    前端只需判断 ok / kind 两个字段，不必再写一套 HTTP 错误分支。

    :param kind: quota_exhausted | network_limited | version_outdated |
                 provider_error | bad_request | unavailable
    :param code: 语义状态码（放进 body，HTTP 状态恒 200）
    :param hint: 可选建议（替代模型 id 或操作指引）
    """
    body = {"ok": False, "kind": kind, "error": error, "code": int(code), "hint": hint}
    body.update(extra)
    return JSONResponse(body, status_code=200)


def _version_tuple(v: str) -> tuple:
    """版本串 → 可比较元组：'20260919q' → (20260919, 'q')。

    无数字前缀时数字部分记 0（必然低于任何数字版本号，绝不放行）。
    """
    s = (v or "").strip().lower()
    i = 0
    while i < len(s) and s[i].isdigit():
        i += 1
    try:
        num = int(s[:i]) if i else 0
    except ValueError:
        num = 0
    return (num, s[i:])


def _version_gate(x_client_version: str | None) -> JSONResponse | None:
    """X-Client-Version 闸门：缺失 / 低于 MIN → version_outdated；通过返回 None。"""
    if not MIN_RELAY_CLIENT_VERSION:
        return None
    v = (x_client_version or "").strip()
    if not v:
        return _err("version_outdated", _VERSION_OUTDATED_MSG, code=426,
                    hint="请求头缺少 X-Client-Version，请更新到最新版")
    if _version_tuple(v) < _version_tuple(MIN_RELAY_CLIENT_VERSION):
        return _err("version_outdated", _VERSION_OUTDATED_MSG, code=426,
                    hint=f"当前版本 {v}，最低要求 {MIN_RELAY_CLIENT_VERSION}")
    return None


def _rate_gate(request: Request) -> JSONResponse | None:
    """按 rate_limit("consume") 桶限流；超限返回统一错误体（不抛 {"detail":...}）。"""
    try:
        _RATE_LIMIT_CONSUME(request)
    except HTTPException:
        return _err("provider_error", "请求过于频繁，请稍后再试", code=429,
                    hint="同一网络下同一分钟内的调用次数已到上限")
    return None


def _gate(x_client_version: str | None, request: Request) -> JSONResponse | None:
    """中转端点统一前置：版本闸门 → 限流闸门。非 None 即为要直接返回的响应。"""
    bad = _version_gate(x_client_version)
    if bad is not None:
        return bad
    return _rate_gate(request)


# ---------------------------------------------------------------------------
# 注册表解析（媒体端点白名单校验）
# ---------------------------------------------------------------------------
_REGISTRY_INDEX: dict[str, dict] | None = None


def _registry_index() -> dict[str, dict]:
    """全量注册表索引：(条目键 | 真实模型名) -> {"provider", "model", "type"}。

    与 _model_type_index 的区别：后者只收录**带 type** 的条目（供 /chat 的
    embedding/rerank 分流），这里收录所有条目——媒体端点靠它做白名单校验，
    不要求条目必须声明 type（多数媒体条目的 type 是本次才补的）。
    读取失败（文件缺失 / JSON 损坏）返回空映射，调用方按 bad_request 拒绝，
    绝不放行未登记的模型名。
    """
    global _REGISTRY_INDEX
    if _REGISTRY_INDEX is not None:
        return _REGISTRY_INDEX
    idx: dict[str, dict] = {}
    path = Path(__file__).resolve().parent.parent / "data" / "model_registry.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    if isinstance(data, dict):
        for key, entry in data.items():
            k = str(key).strip()
            if not k or k.startswith("_") or not isinstance(entry, dict):
                continue
            info = {
                "provider": str(entry.get("provider") or "").strip(),
                "model": str(entry.get("model") or "").strip(),
                "type": str(entry.get("type") or "").strip(),
            }
            idx[k] = info
            name = info["model"]
            if name and name not in idx:
                idx[name] = info
    _REGISTRY_INDEX = idx
    return idx


def _registry_resolve(model_id: str) -> tuple[str, str, str]:
    """modelId -> (provider, 真实模型名, type)；未命中返回 ("", "", "")。

    查找顺序与 quota_ledger._lookup_registry 一致：先按注册表键，再按真实模型名反查
    （前端 id 与 registry 键命名并不统一，仅按键查会大面积落空）。
    命中即视为白名单通过；未命中一律拒绝，绝不放行任意模型名。
    """
    mid = str(model_id or "").strip()
    if not mid:
        return "", "", ""
    info = _registry_index().get(mid)
    if not info:
        return "", "", ""
    return info["provider"], info["model"], info["type"]


# ---------------------------------------------------------------------------
# 上游转发与错误映射
# ---------------------------------------------------------------------------
def _upstream_msg(body) -> str:
    """从上游错误体里取一段人类可读信息（取不到返回空串，截断到 300 字）。"""
    if isinstance(body, dict):
        for key in ("message", "error", "msg", "detail"):
            val = body.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()[:300]
            if isinstance(val, dict):
                sub = val.get("message") or val.get("msg")
                if isinstance(sub, str) and sub.strip():
                    return sub.strip()[:300]
    elif isinstance(body, str):
        return body.strip()[:300]
    return ""


async def _relay_media(cfg: dict, url: str, payload=None, *, method: str = "POST",
                       files=None, timeout: float = _MEDIA_TIMEOUT) -> tuple[int, object]:
    """统一上游转发：注入服务端密钥 + 调 httpx。

    :param payload: JSON 体（files 为空时）或 multipart 表单字段（files 非空时）
    :param files:   httpx 的 files 参数，形如 [("file", (文件名, bytes, MIME))]
    :return: (status_code, body)。body 为解析后的 JSON（dict/list）或截断的原始文本；
             网络异常时 status_code=502、body 为带 message 的 dict。
    """
    headers = {"Authorization": f"Bearer {cfg['api_key']}"}
    kwargs: dict = {}
    if files is not None:
        kwargs["files"] = files
        if payload:
            kwargs["data"] = payload
    elif payload is not None:
        kwargs["json"] = payload
        headers["Content-Type"] = "application/json"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request(method, url, headers=headers, **kwargs)
    except httpx.HTTPError as e:
        return 502, {"message": f"连接模型服务失败：{e.__class__.__name__}"}
    try:
        body = resp.json()
    except Exception:
        body = resp.text[:2000]
    return resp.status_code, body


def _upstream_failed(model_id: str, status: int, body,
                     record: bool = True) -> JSONResponse:
    """上游非 200 → 统一错误体。

    kind 映射：402（平台账户欠费）→ quota_exhausted 并顺带把模型标记耗尽；
    502/503/504/0（不可达）→ network_limited；其余 4xx/5xx → provider_error，
    文案取 _STATUS_HINTS，取不到给通用文案。
    """
    detail = _upstream_msg(body)
    if record and model_id:
        record_usage(model_id, 0, ok=False)   # 只累加 failCalls，不累加 used
    if status == 402:
        if model_id:
            force_exhaust(model_id)
        return _err("quota_exhausted", "该模型额度已用完（平台账户欠费），请切换其他模型",
                    code=402, hint="可在「关于 → 用量」查看各模型剩余额度", detail=detail)
    if status in (502, 503, 504) or status <= 0:
        return _err("network_limited", "服务端网络受限，暂时无法连接到该模型服务，请稍后再试",
                    code=502, hint=_STATUS_HINTS.get(status, ""), detail=detail)
    if 400 <= status < 500:
        return _err("provider_error",
                    _STATUS_HINTS.get(status) or "模型服务拒绝了本次请求，请稍后再试",
                    code=status, detail=detail)
    return _err("provider_error",
                _STATUS_HINTS.get(status) or "模型服务返回异常，请稍后再试",
                code=status, detail=detail)


def _media_resolve(model_id: str, allowed: tuple, types: tuple,
                   label: str) -> tuple[dict | None, JSONResponse | None]:
    """媒体端点共用的解析链（失败即返回可直接下发的错误响应）。

    顺序：注册表白名单 → provider 能力匹配 → type 匹配 → 未软下线 →
          服务端已配置密钥 → 账本额度检查。
    :return: (info, None) 成功，info = {"modelId","provider","model","cfg"}；
             (None, JSONResponse) 失败。
    """
    mid = str(model_id or "").strip()
    if not mid:
        return None, _err("bad_request", "缺少 modelId", code=400,
                          hint=f"请先选择一个{label}模型")
    provider, model_name, mtype = _registry_resolve(mid)
    if not provider or not model_name:
        return None, _err("bad_request", "未知的模型 ID（不在服务端模型注册表中）",
                          code=400, hint=mid)
    if provider not in allowed:
        return None, _err("bad_request", f"该模型不支持{label}", code=400, hint=mid)
    if mtype and types and mtype not in types:
        return None, _err("bad_request", f"该模型不支持{label}", code=400, hint=mid)
    cfg = configured_providers().get(provider)
    if not cfg or not str(cfg.get("api_key") or "").strip():
        return None, _err("unavailable", "服务端尚未配置该模型的调用通道，请切换其他模型",
                          code=503, hint=mid)
    # R132：海外平台动态判定——key + proxy 双齐才放行，否则统一 unavailable
    if not _provider_available(provider, cfg):
        return None, _err("unavailable", "该模型所属平台当前不可用（服务端网络受限）",
                          code=503, hint="请改用国内平台的同类模型")
    ok, reason = check_quota(mid)
    if not ok:
        return None, _err("quota_exhausted",
                          reason or "该模型免费额度已用完，请切换其他模型",
                          code=429, modelId=mid,
                          hint="可在「关于 → 用量」查看各模型剩余额度")
    return {"modelId": mid, "provider": provider, "model": model_name, "cfg": cfg}, None


@router.get("/models")
def list_models(request: Request, user: User = Depends(get_current_user_optional),
                x_client_version: str | None = Header(default=None)):
    """前端下拉框数据源：只返回已配置密钥的服务商（名称 + 默认模型），绝不含密钥。

    R88-M1：name 改为**中性平台名**（如「火山方舟（豆包/DeepSeek）」），不再拼上
    「（.env 默认模型串）」——此前它被前端当作「已用模型名」记进账本，导致不管选哪个
    模型都显示成同一个默认模型（用户投诉的 bug）。真实模型名改由 /chat 响应头
    X-Ai-Model-Used 回传（见下），这里只负责「平台级」信息。
    model 字段保留，供前端在拿不到真实模型名时做兜底展示。

    R132：海外平台（gemini / openrouter）**恒返回**——即便服务端未配 key/proxy，
    其模型也始终出现在列表里（用户可在设置页填自己的 Key 走本地直连）。
    仅对这两家每项附 `relayAvailable` 标记（仅当「key 已配置 且 proxy 已配置」
    为真），供前端置灰提示与服务端中转是否可用来区分；其余国内平台仍按
    「已配置密钥」过滤（configured_providers 的既有行为）。
    """
    bad = _version_gate(x_client_version)
    if bad is not None:
        return bad
    models = []
    for pid, cfg in AI_PROVIDERS.items():
        if pid in _OVERSEA_PROVIDERS:
            models.append({
                "id": pid, "name": cfg["name"], "model": cfg["model"],
                "relayAvailable": _oversea_ready(cfg, pid),
            })
        elif str(cfg.get("api_key") or "").strip():
            models.append({"id": pid, "name": cfg["name"], "model": cfg["model"]})
    return {"models": models}


@router.get("/usage")
def ai_usage(user: User = Depends(get_current_user_optional),
             db: Session = Depends(get_db)):
    """模型用量总账 + 当前登录用户的今日调用数（兼容旧字段）。

    R88-F 安全修复：接口仍允许游客访问（前端「关于 → 用量」面板设计为免登录），
    但**游客不再能看到全站账本明细**——只返回中性的空 models 与本人今日计数（=0），
    避免免登录泄露各平台配额、剩余额度、真实模型名与全局调用量。
    登录用户返回全量快照（原行为不变）。

    - models：服务端全局累计（仅登录用户）。火山方舟免费额度是账号级共享的，
      多用户必须累计到同一个账本，否则前端 localStorage 各算各的会超量欠费。
    - used / limit / date：本用户今日调用数（游客为 0），旧客户端与冒烟脚本仍在用。
    """
    used = 0
    if user:
        row = db.query(AiUsage).filter(AiUsage.user_id == user.id, AiUsage.day == _today()).first()
        used = row.count if row else 0
        snap = ledger_snapshot()
    else:
        # 游客：不回账本明细（脱敏），只给最小骨架，前端据此渲染「游客模式」空态
        snap = {"ok": True, "serverTime": now_iso(), "models": {}}
    snap["used"] = used
    snap["limit"] = AI_DAILY_LIMIT
    snap["date"] = _today()
    return snap


@router.post("/usage/consume")
def ai_usage_consume(body: dict, _rl: None = Depends(rate_limit("consume"))):
    """前端直连模型平台（生图 / 视频 / 3D 等）后上报消耗。

    入参：{"modelId": "ark-xxx", "amount": 1234, "ok": true, "unit": "tokens"}
      - modelId 必填，且必须命中 server/data/model_registry.json 白名单
        （R88-F：防止刷不存在的模型名污染账本 / 无意义增长）
      - amount 缺省按 1 计（生图按张、视频按个）
      - ok=false 只累加 failCalls，不累加 used
    出参：{"ok": true, "used": 新累计用量, "status": "ok|low|exhausted"}
    防护（R88-F）：按 IP 限流（默认 60 次/分钟）+ modelId 白名单 + amount 上限。
    注：本接口服务端无法强制登录（前端视频/3D 上报不带令牌），仅做服务端加固。
    """
    if not isinstance(body, dict):
        raise HTTPException(400, "请求体必须是 JSON 对象")
    model_id = str(body.get("modelId") or "").strip()
    if not model_id:
        raise HTTPException(400, "缺少 modelId")
    # 白名单校验：仅在白名单非空时生效（未初始化/表全空时放行，避免误拦正常上报）
    known = known_model_ids()
    if known and model_id not in known:
        raise HTTPException(400, "未知的 modelId（不在服务端模型注册表中）")
    amount = body.get("amount", 1)
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        amount = 1
    amount = min(max(amount, 0), _MAX_CONSUME_AMOUNT)
    ok = body.get("ok", True)
    ok = True if ok is None else bool(ok)
    status = record_usage(model_id, amount, ok=ok)
    return {"ok": True, "used": status["used"], "status": status["status"]}


@router.post("/usage/reset")
def ai_usage_reset(body: dict, x_admin_token: str | None = Header(default=None)):
    """充值后重置用量并重新启用模型（管理用）。

    入参：{"modelId": "ark-xxx"} 或 {"all": true}
    保护（R88-F 改为 fail-closed）：请求头 X-Admin-Token 必须等于环境变量
    ADMIN_TOKEN；**未配置 ADMIN_TOKEN 时直接拒绝（503），不再放行**——重置接口
    能清零全站配额，是比用量上报更直接的破坏力，必须拒绝而非默认开放。
    """
    required = os.getenv("ADMIN_TOKEN", "").strip()
    if not required:
        raise HTTPException(503, "服务端未配置 ADMIN_TOKEN，用量重置接口已禁用（fail-closed）")
    if x_admin_token != required:
        raise HTTPException(403, "X-Admin-Token 无效，禁止重置用量")
    if not isinstance(body, dict):
        raise HTTPException(400, "请求体必须是 JSON 对象")
    model_id = str(body.get("modelId") or "").strip()
    reset_all = bool(body.get("all"))
    if not model_id and not reset_all:
        raise HTTPException(400, "需要 modelId 或 all=true")
    result = reset_usage(model_id=model_id, reset_all=reset_all)
    # R88-F：fail-closed 后 required 必非空，authBypass 恒为 False（保留字段兼容旧客户端）
    return {"ok": True, "reset": result["reset"], "authBypass": False}


@router.get("/history")
def ai_history(limit: int = 200, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """我的 AI 对话记录（时间正序，最近 limit 条），用于换设备恢复上下文。"""
    limit = min(max(limit, 1), 500)
    rows = (
        db.query(AiLog)
        .filter(AiLog.user_id == user.id)
        .order_by(AiLog.id.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()
    return {"items": [
        {"role": r.role, "content": r.content, "provider": r.provider, "createdAt": r.created_at}
        for r in rows
    ]}

@router.delete("/history")
def ai_history_delete(ids: str = "", user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    """R91-A：删除我的 AI 对话记录（与 GET /history 同库同鉴权，按 user_id 隔离）。

    - 不带 ids：清空本人全部记录（前端「AI对话记录管理 → 清空全部」调用）；
    - ids=1,2,3（可选）：仅删除指定主键 id 的本人记录，他人 id 静默忽略（不报错）。
    说明：ai_logs 为扁平消息表（无会话维度），故不支持按 session_id 删除；
    AiUsage（每日调用计数）与模型用量账本不受影响。
    """
    id_list: list[int] = []
    for part in ids.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            id_list.append(int(part))
        except ValueError:
            raise HTTPException(400, f"非法的记录 id：{part}")
    q = db.query(AiLog).filter(AiLog.user_id == user.id)
    if id_list:
        q = q.filter(AiLog.id.in_(id_list))
    deleted = q.delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted": deleted}

async def _gemini_stream(cfg: dict, model_name: str, fallback: bool, messages: list,
                         body: "_ChatIn", quota_key: str, user, db) -> "typing.AsyncIterator[bytes]":
    """Gemini 非流式中转：OpenAI messages → Gemini contents，响应聚合后按 SSE 帧下发。

    - 格式转换：system → systemInstruction；user/assistant → contents（role 映射
      user/model）；key 放 URL 参数 ?key=；响应 candidates[0].content.parts[].text 拼回。
    - 本次**不做 SSE 分帧**：上游 generateContent 整段聚合，作为一个增量帧返回
      （仍尊重 use_frames：推理开启走 {"t":"c"} 帧 + [DONE]，否则纯文本增量）。
    - 仅当「key 已配 且 proxy 已配」时才会进入此分支（/chat 入口已拦截未就绪情形，
      返回 network_limited 引导前端走自备 Key 直连），故这里 proxy 必非空。
    """
    import typing
    use_frames = bool(body.reasoning)
    acc: list[str] = []
    upstream_ok = False
    used_tokens = 0
    proxy = str(cfg.get("proxy") or "").strip()
    client_kwargs: dict = {"timeout": 120}
    if proxy:
        client_kwargs["proxy"] = proxy
    # 1) 格式转换：system 抽离为 systemInstruction，其余按角色映射
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    contents = [
        {"role": "model" if m["role"] == "assistant" else "user",
         "parts": [{"text": m["content"]}]}
        for m in messages if m["role"] in ("user", "assistant")
    ]
    payload: dict = {"contents": contents}
    if system_parts:
        payload["systemInstruction"] = {"parts": [{"text": "\n\n".join(system_parts)}]}
    gen_cfg: dict = {}
    if body.temperature is not None:
        gen_cfg["temperature"] = min(max(body.temperature, 0.0), 2.0)
    if body.maxTokens is not None:
        gen_cfg["maxOutputTokens"] = min(max(body.maxTokens, 1), 8192)
    if gen_cfg:
        payload["generationConfig"] = gen_cfg
    url = f"{cfg['base_url'].rstrip('/')}/{model_name}:generateContent"
    try:
        async with httpx.AsyncClient(**client_kwargs) as client:
            resp = await client.post(url, params={"key": cfg["api_key"]}, json=payload)
            if resp.status_code != 200:
                text = resp.text[:300]
                hint = _STATUS_HINTS.get(resp.status_code)
                msg = (("⚠️ " + hint + f"（模型服务返回 {resp.status_code}：{text}）")
                       if hint else f"⚠️ 模型服务返回 {resp.status_code}：{text}")
                acc.append(msg)
                yield msg.encode("utf-8")
                return
            try:
                data = resp.json()
            except Exception:
                msg = "⚠️ 模型响应解析失败"
                acc.append(msg)
                yield msg.encode("utf-8")
                return
            upstream_ok = True
            parts = (data.get("candidates", [{}])[0].get("content", {}).get("parts", []) or [])
            text = "".join(p.get("text", "") for p in parts)
            acc.append(text)
            meta = data.get("usageMetadata") or {}
            used_tokens = (int(meta.get("promptTokenCount") or 0)
                           + int(meta.get("candidatesTokenCount") or 0))
            if use_frames:
                if text:
                    yield _sse_frame("c", text)
                if used_tokens > 0:
                    yield (b"data: "
                           + json.dumps({"t": "u", "tokens": used_tokens},
                                        ensure_ascii=False).encode("utf-8")
                           + b"\n\n")
                yield b"data: [DONE]\n\n"
            else:
                yield text.encode("utf-8")
    except httpx.HTTPError:
        msg = "⚠️ 当前网络无法访问海外AI服务，请检查代理设置"
        acc.append(msg)
        yield msg.encode("utf-8")
    finally:
        record_usage(quota_key, used_tokens if used_tokens > 0 else 1, ok=upstream_ok)
        if user:
            reply = "".join(acc)
            db2 = SessionLocal()
            try:
                db2.add(AiLog(user_id=user.id, role="assistant", content=reply or "（空回复）",
                              provider=body.provider, created_at=now_iso()))
                db2.commit()
            except Exception:
                pass
            finally:
                db2.close()


@router.post("/chat")
async def chat(body: _ChatIn, request: Request, user: User = Depends(get_current_user_optional),
               db: Session = Depends(get_db), _rl: None = Depends(rate_limit("ai")),
               x_client_version: str | None = Header(default=None)):
    # R131-P0-9：版本闸门。旧 APK / 未升级的 Web 调不到任何中转能力，统一拿到
    # 可读的「请更新」错误体（禁静默失败）；MIN 置空即可临时关闭该闸门。
    bad = _version_gate(x_client_version)
    if bad is not None:
        return bad
    # 游客（未登录）也可使用：登录用户走每日调用限额，游客仅受每 IP 限流保护，
    # 这样手机浏览器 / 电脑浏览器 / APK 三种环境都不依赖第三方平台的跨域与直连能力。
    providers = configured_providers()
    cfg = providers.get(body.provider)
    if not cfg:
        # R132（调整）：海外平台即便服务端未配 key，也不拒绝——
        # 返回 network_limited 引导前端切用户自备 Key 本地直连。
        if body.provider in _OVERSEA_PROVIDERS:
            return _err("network_limited", "当前网络无法访问海外AI服务，请检查代理设置",
                        code=503, hint="可在设置页填写该平台自己的 Key 后直连使用")
        raise HTTPException(400, "该模型未在服务端配置密钥，请在 server/.env 中填写对应 API Key")
    # R132（调整）：海外平台已配 key 但 proxy 未配 = 服务端中转不可达，
    # 同样返回 network_limited，引导前端走用户自备 Key 直连。
    if body.provider in _OVERSEA_PROVIDERS and not _oversea_ready(cfg, body.provider):
        return _err("network_limited", "当前网络无法访问海外AI服务，请检查代理设置",
                    code=503, hint="可在设置页填写该平台自己的 Key 后直连使用")

    # 服务端统一额度：优先按 modelId（前端 ai-config.js 的 id）计，没带则按 provider 兜底。
    # 额度用完直接返回 200 + exhausted，**绝不转发**，以免产生真实费用。
    quota_key = (getattr(body, "modelId", "") or "").strip() or body.provider
    allowed, reason = check_quota(quota_key)
    if not allowed:
        return JSONResponse({"ok": False, "error": reason, "exhausted": True,
                             "modelId": quota_key})

    if user:
        _record_usage(db, user.id)  # 先计数、超限直接 429，避免空耗

    messages = [m for m in body.messages if isinstance(m, dict)
                and m.get("role") in ("user", "assistant", "system")
                and isinstance(m.get("content"), str) and m["content"].strip()][-_MAX_MSGS:]
    if not messages:
        raise HTTPException(400, "缺少对话内容")

    # R130：按注册表 type 字段识别向量/重排模型，改走专用上游端点
    # （/v1/embeddings、/v1/rerank）。此前这两类模型被送进 chat/completions，
    # 硅基流动一律 400 {"code":20012,"message":"Model does not exist"}。
    # 仅当 modelId / modelName 命中带 type 的注册表条目且 provider 匹配时才改道；
    # 其余所有请求（普通 chat）不进入本分支，与旧版逐字节一致。
    _mt_info = _model_type_info(body.provider, quota_key, getattr(body, "modelName", None))
    if _mt_info:
        _cm_type = (getattr(body, "modelName", None) or "").strip()
        _mt_name = (resolve_model_name(body.provider, quota_key)
                    or (resolve_model_name(body.provider, _cm_type) if _cm_type else "")
                    or cfg["model"])
        if _mt_info["type"] == "embedding":
            return await _serve_special(body, cfg, quota_key, _mt_name, messages,
                                        kind="embeddings")
        if _mt_info["type"] == "rerank":
            return await _serve_special(body, cfg, quota_key, _mt_name, messages,
                                        kind="rerank")


    # 可选：把用户笔记作为 system 上下文（仅作者本人笔记或公开笔记）
    if body.noteId:
        note = db.get(Note, body.noteId)
        if note and not note.deleted_at and (note.user_id == user.id
                                             or (note.status == "published" and note.privacy == "public")):
            messages = [{"role": "system", "content": _note_system(note)}] + messages

    # 入库：用户的最后一次提问（避免把整段历史重复入库）
    last_user = next((m for m in reversed(messages) if m["role"] == "user"), None)
    if user and last_user:
        db.add(AiLog(user_id=user.id, role="user", content=last_user["content"],
                     provider=body.provider, created_at=now_iso()))
        db.commit()

    # 模型名：优先用 modelId 解析出的【真实模型名】转发；解析不到才退回 .env 默认模型。
    # R88-M1：quota_key 来自 body.modelId（前端 relayChat 现已带上），经 registry 解析后
    # 才能真正「选哪个跑哪个」——此前前端不带 modelId，这里恒回退 .env 默认，用户看着像
    # 「选什么都跑同一个模型」。展示名用宽松版（忽略 provider 校验），拿不到就如实回落。
    resolved_name = resolve_model_name(body.provider, quota_key)
    # R103：按前端 id 解析落空时，用前端带来的真实模型名做二次解析（仍受 registry 白名单
    # 约束；查不到即空串 -> 保持原有「回退 .env 默认模型」的行为，绝不放行未登记模型名）。
    # 这样「选哪个跑哪个」与「用量明细显示的模型名」才同时成立（此前二者都退化成默认模型）。
    if not resolved_name:
        _client_model = (getattr(body, "modelName", None) or "").strip()
        if _client_model:
            resolved_name = resolve_model_name(body.provider, _client_model)
    # R104-项4：显式记录「是否发生回退」——按前端 id 与前端声明的真实模型名都解析不到时，
    # resolved_name 为空，下面就会退回 .env 默认模型（cfg["model"]）。此前该回退完全静默，
    # 用户看到用量明细/回答底部的模型名与实际所选不符却无从知晓；这里把该事实固化为布尔，
    # 随后经响应头 X-Ai-Model-Fallback 如实回传前端，由前端显式提示。
    fallback = (resolved_name == "")
    model_name = resolved_name or cfg["model"]
    # 展示用真实模型名：严格解析不到时用宽松解析；仍拿不到则用实际转发用的 model_name
    # （即 .env 默认），如实反映「实际执行的模型」，绝不编造一个看起来正常的假名字。
    display_model_name = (resolved_name
                          or resolve_model_name_lenient(quota_key)
                          or model_name)
    # R132：Gemini 走专属格式转换 + 非流式聚合（本次不做 SSE 分帧，见 _gemini_stream）
    if body.provider == "gemini":
        _safe_model = "".join(ch for ch in str(display_model_name) if ord(ch) < 128) or "unknown"
        return StreamingResponse(
            _gemini_stream(cfg, model_name, fallback, messages, body, quota_key, user, db),
            media_type="text/plain; charset=utf-8",
            headers={"X-Ai-Model-Used": _safe_model,
                     "X-Ai-Model-Fallback": "1" if fallback else "0"},
        )
    payload: dict = {"model": model_name, "messages": messages, "stream": True}
    # 火山方舟支持 stream_options.include_usage：最后一个 chunk 回传本次 token 消耗，
    # 够服务端账本精确累加。其余平台保守不加，避免个别平台对未知字段报 400。
    if "volces.com" in cfg["base_url"]:
        payload["stream_options"] = {"include_usage": True}
    if body.temperature is not None:
        payload["temperature"] = min(max(body.temperature, 0.0), 2.0)
    if body.maxTokens is not None:
        payload["max_tokens"] = min(max(body.maxTokens, 1), 8192)
    # R107：「深度思考」显式开启时，按 base_url 白名单追加上游思考开关
    # （REASONING_UPSTREAM_FIELDS 表外平台一律不加，防未知字段被平台 400）。
    if body.reasoning:
        for _host, _extra in REASONING_UPSTREAM_FIELDS:
            if _host in cfg["base_url"]:
                payload.update(_extra)
                break

    # R107：分帧开关。use_frames=False 时 gen() 的输出与改动前逐字节一致（纯文本增量）；
    # use_frames=True 时 reasoning/content 增量分别以 data: {"t":"r"/"c","d":...} 分帧输出。
    use_frames = bool(body.reasoning)

    async def gen():
        acc: list[str] = []
        upstream_ok = False
        used_tokens = 0
        # R132：海外平台（openrouter/gemini）经本地代理出网；proxy 非空才挂 transport。
        # httpx>=0.27 支持 AsyncClient(proxy=...)。OpenRouter 额外带排行榜归属头。
        proxy = str(cfg.get("proxy") or "").strip()
        client_kwargs: dict = {"timeout": 120}
        if proxy:
            client_kwargs["proxy"] = proxy
        headers = {"Content-Type": "application/json",
                   "Authorization": f"Bearer {cfg['api_key']}"}
        if body.provider == "openrouter":
            headers.update(cfg.get("extra_headers") or {})
        try:
            async with httpx.AsyncClient(**client_kwargs) as client:
                async with client.stream(
                    "POST", cfg["base_url"],
                    headers=headers,
                    json=payload,
                ) as resp:
                    if resp.status_code != 200:
                        text = (await resp.aread()).decode("utf-8", "ignore")[:300]
                        # R73j：常见状态友好化——402 欠费 / 401 Key 无效 / 429 限流等，
                        # 不再向用户裸吐平台原始报文（原始报文保留在括号内便于排查）。
                        hint = _STATUS_HINTS.get(resp.status_code)
                        if hint:
                            msg = "⚠️ " + hint + f"（模型服务返回 {resp.status_code}：{text}）"
                        else:
                            msg = f"⚠️ 模型服务返回 {resp.status_code}：{text}"
                        if resp.status_code == 402:
                            # 上游明确欠费：直接把该模型标记为耗尽，后续请求本地就拦下
                            force_exhaust(quota_key)
                        acc.append(msg)
                        yield msg.encode("utf-8")
                        return
                    upstream_ok = True
                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            j = json.loads(data)
                            # 带 stream_options 时最后一个 chunk 带 usage（choices 为空）
                            chunk_tokens = tokens_from_usage(j.get("usage"))
                            if chunk_tokens:
                                used_tokens = max(used_tokens, chunk_tokens)
                            delta = j.get("choices", [{}])[0].get("delta", {})
                            piece = delta.get("content") or ""
                            # R107：思维链增量（reasoning_content 为主，reasoning 兼容个别平台）
                            rpiece = delta.get("reasoning_content") or delta.get("reasoning") or ""
                            if use_frames:
                                # 分帧模式：思维链 t:"r" 先行、正文 t:"c" 随后；
                                # 思维链不进 acc（AiLog 只存正文，与「思维链不入历史」口径一致）
                                if rpiece:
                                    yield _sse_frame("r", rpiece)
                                if piece:
                                    acc.append(piece)
                                    yield _sse_frame("c", piece)
                            elif piece:
                                acc.append(piece)
                                yield piece.encode("utf-8")
                        except Exception:
                            continue  # 心跳/注释行等跳过
        except httpx.HTTPError as e:
            # R132：海外平台上游不可达（proxy 未配 / 代理失效）→ 统一友好文案，
            # 与 /chat 入口的 network_limited 引导文案保持一致。
            if body.provider in _OVERSEA_PROVIDERS:
                msg = "⚠️ 当前网络无法访问海外AI服务，请检查代理设置"
            else:
                msg = f"⚠️ 连接模型服务失败：{e.__class__.__name__}"
            acc.append(msg)
            yield msg.encode("utf-8")
        else:
            # R107：分帧模式收尾——有真实 token 消耗才发 t:"u"（供前端账本展示），
            # 恒以 data: [DONE] 结束。错误路径（上方 return / except）不收尾，维持裸文本。
            if use_frames:
                if used_tokens > 0:
                    yield (b"data: "
                           + json.dumps({"t": "u", "tokens": used_tokens},
                                        ensure_ascii=False).encode("utf-8")
                           + b"\n\n")
                yield b"data: [DONE]\n\n"
        finally:
            # 服务端账本：成功累加真实 token（拿不到就按 1 次计），失败只记 failCalls
            record_usage(quota_key, used_tokens if used_tokens > 0 else 1,
                         ok=upstream_ok)
            # 保存完整回答到数据库（登录用户才落库，游客不入库；失败不影响已输出的内容）
            if user:
                reply = "".join(acc)
                db2 = SessionLocal()
                try:
                    db2.add(AiLog(user_id=user.id, role="assistant", content=reply or "（空回复）",
                                  provider=body.provider, created_at=now_iso()))
                    db2.commit()
                except Exception:
                    pass
                finally:
                    db2.close()

    # R88-M1：把「实际执行的模型名」通过响应头回传前端，供前端如实记账（用量明细显示
    # 真实调用的模型名，而非平台默认模型）。header 值须为 latin-1 可编码，模型名均为 ASCII。
    _safe_model = "".join(ch for ch in str(display_model_name) if ord(ch) < 128) or "unknown"
    # R104-项4：与 X-Ai-Model-Used 并列回传「是否发生回退」。注意该响应头挂在 StreamingResponse
    # 对象上，因此即便流式体内上游返回 4xx/5xx、或连接失败等错误路径，响应头同样会被下发
    # （前端据此提示「您选的模型当前不可用，已切换为 X 回答」）。头值仅 "1"/"0"，恒为 ASCII。
    return StreamingResponse(
        gen(), media_type="text/plain; charset=utf-8",
        headers={"X-Ai-Model-Used": _safe_model,
                 "X-Ai-Model-Fallback": "1" if fallback else "0"},
    )


# ==================== R131：媒体能力服务端中转端点 ====================
# 契约（前端按此对接，改动须同步）：
#   1) 请求头带 X-Client-Version；缺失 / 过低 → {ok:false, kind:"version_outdated"}
#   2) 限流桶 rate_limit("consume")（与 /usage/consume 同口径，60 次/分钟/IP）
#   3) 成功后服务端直接 record_usage(modelId, amount, ok=True)：
#      图片=张、ASR=次、视频=次、3D=次（权威记账，不依赖前端上报）
#   4) 允许游客（与 /usage/consume 一致，前端视频/3D 上报本就不带令牌）
#   5) 一律返回结构化 JSON：成功 {ok:true, ...}，失败 {ok:false, kind, error, code, hint}
#   6) 视频 / 3D 是异步：POST 创建拿 taskId → GET /task/{id} 轮询到 succeeded / failed


def _extract_media_items(body) -> list[dict]:
    """从上游生图响应里提取 [{url, index}]（兼容 data[] / images[] 两种形态）。

    只认 url / image_url / image 三种字段名；base64 结果附在 b64Json 字段里，
    绝不把上游原文整块透传（避免前端拿到不稳定结构）。
    """
    raw: list = []
    if isinstance(body, dict):
        for key in ("data", "images", "image_urls"):
            val = body.get(key)
            if isinstance(val, list) and val:
                raw = val
                break
    elif isinstance(body, list):
        raw = body
    items: list[dict] = []
    for i, it in enumerate(raw):
        if isinstance(it, str) and it.strip():
            items.append({"url": it.strip(), "index": i})
            continue
        if not isinstance(it, dict):
            continue
        url = str(it.get("url") or it.get("image_url") or it.get("image") or "").strip()
        if not url:
            continue
        item = {"url": url, "index": i}
        b64 = str(it.get("b64_json") or "").strip()
        if b64:
            item["b64Json"] = b64
        items.append(item)
    return items


def _task_view(body) -> dict:
    """解析火山 contents/generations/tasks 的轮询响应（视频与 3D 共用）。

    :return: {"status": "processing"|"succeeded"|"failed", "raw": 上游原始状态,
              "content": dict, "error": str}
    """
    j = body if isinstance(body, dict) else {}
    raw = str(j.get("status") or "").strip().lower()
    # 部分上游可能返回数组形态，取首个对象元素；其余形态一律按空对象兜底
    _c = j.get("content")
    if isinstance(_c, dict):
        content = _c
    elif isinstance(_c, list):
        content = next((it for it in _c if isinstance(it, dict)), {})
    else:
        content = {}
    err = ""
    e = j.get("error")
    if isinstance(e, dict):
        err = str(e.get("message") or e.get("msg") or e.get("code") or "").strip()
    elif isinstance(e, str):
        err = e.strip()
    if raw in ("succeeded", "success", "completed", "done"):
        status = "succeeded"
    elif raw in ("failed", "failure", "cancelled", "canceled", "expired", "error"):
        status = "failed"
    else:
        status = "processing"
    if status == "failed" and not err:
        err = f"生成失败（{raw or '未知状态'}）"
    return {"status": status, "raw": raw, "content": content, "error": err}


def _image_ref_ok(url: str) -> bool:
    """图片引用合法性：仅放行 http(s) 链接与 data:image 内联图。

    服务端本身不去下载这张图（是上游去取），这里只挡住 file:// / 相对路径等
    明显非法的形态，避免把异常字符串喂给上游造成难以排查的 400。
    """
    u = str(url or "").strip()
    low = u.lower()
    return low.startswith("http://") or low.startswith("https://") or low.startswith("data:image")


# ---------------------------------------------------------------------------
# R133：Gemini 生图中转（与 arkimage 生图同一入口 /api/ai/image/generate、
# 同一响应契约 {ok, data:[{url,index}], modelUsed}；差异仅在格式转换层）。
# Gemini 生图走 generateContent + responseModalities，key 走 URL 参数 ?key=、
# 出网走 provider proxy（与 _gemini_stream 对话链路同口径，但**不复用**它——
# 生图是独立函数，对话链路零改动、零回归）。
# 响应里的 inlineData{mimeType,data} 是 base64 图片：转成 data:image URI 放进
# data[].url 下发（前端 ai-cap-image 按 url 渲染，与 arkimage 返回的图片 URL
# 同一字段；_image_ref_ok 本就放行 data:image，链路自洽）。
# ---------------------------------------------------------------------------

def _gemini_image_payload(prompt: str) -> dict:
    """Gemini 生图请求体。responseModalities 用 ["TEXT","IMAGE"]：允许模型伴随
    文字说明；对 2.5-flash-image / 3-pro-image 是官方推荐取值，3.1-flash-lite-image
    未实测（本机无代理），如上游只支持 IMAGE 报 400，错误体会如实透传状态码。"""
    return {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }


def _gemini_parse_images(data) -> tuple[list[dict], list[str]]:
    """解析 generateContent 响应：inlineData → [{url: data:image URI}]，
    text parts → 文字说明列表（生图成功时作为 detail 附带，不改变契约结构）。"""
    items: list[dict] = []
    texts: list[str] = []
    parts = []
    try:
        parts = (data.get("candidates", [{}])[0].get("content", {}).get("parts", []) or [])
    except Exception:
        parts = []
    for i, p in enumerate(parts):
        if not isinstance(p, dict):
            continue
        inline = p.get("inlineData") or p.get("inline_data")
        if isinstance(inline, dict) and str(inline.get("data") or "").strip():
            mime = str(inline.get("mimeType") or inline.get("mime_type")
                       or "image/png").strip() or "image/png"
            items.append({"url": f"data:{mime};base64,{str(inline['data']).strip()}",
                          "index": len(items)})
        elif isinstance(p.get("text"), str) and p["text"].strip():
            texts.append(p["text"].strip())
    return items, texts


async def _gemini_image_generate(info: dict, prompt: str, n: int) -> JSONResponse:
    """Gemini 生图执行与统一错误映射（未就绪在入口已拦，这里 proxy 必非空）。

    - 上游格式：POST {base_url}/{model}:generateContent?key=...，代理经
      httpx.AsyncClient(proxy=...)（与 _gemini_stream 一致）。
    - Gemini 单次调用至多回 1 张图，n>1 时串行多次调用（上限 4，与 arkimage 同）。
    - 成功：record_usage(按张计) + {ok:true, data, modelUsed}，与 arkimage 一致。
    - 失败：httpx 异常 → network_limited（与对话链路同文案）；上游非 200 →
      _upstream_failed 统一映射；200 但无图 → provider_error。
    """
    cfg = info["cfg"]
    model_name = info["model"]
    proxy = str(cfg.get("proxy") or "").strip()
    client_kwargs: dict = {"timeout": 120.0}
    if proxy:
        client_kwargs["proxy"] = proxy
    url = f"{cfg['base_url'].rstrip('/')}/{model_name}:generateContent"
    payload = _gemini_image_payload(prompt)
    items: list[dict] = []
    texts: list[str] = []
    for _ in range(max(1, min(n, 4))):
        try:
            async with httpx.AsyncClient(**client_kwargs) as client:
                resp = await client.post(url, params={"key": cfg["api_key"]},
                                         json=payload)
        except httpx.HTTPError:
            record_usage(info["modelId"], 0, ok=False)
            return _err("network_limited",
                        "⚠️ 当前网络无法访问海外AI服务，请检查代理设置",
                        code=502, hint=info["modelId"])
        if resp.status_code != 200:
            return _upstream_failed(info["modelId"], resp.status_code, resp.text[:2000])
        try:
            data = resp.json()
        except Exception:
            return _err("provider_error", "生图服务响应解析失败，请稍后再试",
                        code=502, detail=resp.text[:300])
        got, part_texts = _gemini_parse_images(data)
        texts.extend(part_texts)
        if got:
            items.extend({"url": it["url"], "index": len(items)}
                         for it in got)
    if not items:
        return _err("provider_error", "生图服务未返回图片地址，请稍后再试",
                    code=502, detail=_upstream_msg("；".join(texts)))
    record_usage(info["modelId"], len(items), ok=True)   # 按张计
    return {"ok": True, "data": items, "modelUsed": info["model"]}


@router.post("/image/generate")
async def image_generate(body: dict, request: Request,
                         x_client_version: str | None = Header(default=None)):
    """R131：文生图服务端中转（前端零密钥，密钥只出现在上游请求里）。

    入参：{"modelId": "ark-seedream-4-0828", "prompt": "...", "size": "1024x1024", "n": 1}
    出参：{"ok": true, "data": [{"url": "...", "index": 0}], "modelUsed": "真实模型名"}
    失败：统一错误体（HTTP 恒 200）。
    """
    bad = _gate(x_client_version, request)
    if bad is not None:
        return bad
    if not isinstance(body, dict):
        return _err("bad_request", "请求体必须是 JSON 对象", code=400)
    model_id = str(body.get("modelId") or "").strip()
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        return _err("bad_request", "缺少 prompt（画面描述）", code=400,
                    hint="请先输入想生成的画面描述")
    # R133：Gemini 生图未就绪（无 key / 无 proxy）时提前返回与对话链路同文案的
    # network_limited，避免落进 _media_resolve 的通用 unavailable 文案。
    if "gemini" == _registry_resolve(model_id)[0]:
        _gcfg = configured_providers().get("gemini") or {}
        if not (str(_gcfg.get("api_key") or "").strip()
                and str(_gcfg.get("proxy") or "").strip()):
            return _err("network_limited", "当前网络无法访问海外AI服务，请检查代理设置",
                        code=503, hint="可在设置页填写该平台自己的 Key 后直连使用")
    info, err = _media_resolve(model_id, ("arkimage", "siliconflow", "gemini"),
                               ("imagegen", "image"), "图片生成")
    if err is not None:
        return err
    cfg = info["cfg"]
    provider = info["provider"]
    # arkimage 的 base_url 已是完整的 images/generations；其余平台（硅基流动）
    # 从 chat/completions 派生同目录的 images/generations。
    url = (cfg["base_url"] if provider == "arkimage"
           else _upstream_special_url(cfg["base_url"], "images/generations"))
    if not url:
        return _err("unavailable", "服务端无法派生生图上游地址，请检查 server/.env 配置",
                    code=500)
    size = str(body.get("size") or "").strip() or "1024x1024"
    try:
        n = int(body.get("n") or 1)
    except (TypeError, ValueError):
        n = 1
    n = min(max(n, 1), 4)
    # R133：Gemini 生图独立分支（generateContent 格式，与 arkimage 的
    # images/generations 完全不同），响应契约与 arkimage 一致；n>1 靠多次串行调用。
    if provider == "gemini":
        return await _gemini_image_generate(info, prompt, n)
    payload: dict = {"model": info["model"], "prompt": prompt, "image_size": size}
    if provider == "arkimage":
        payload["n"] = n
        payload["response_format"] = "url"
    else:
        payload["batch_size"] = n     # 硅基流动同义字段叫 batch_size
    status, resp = await _relay_media(cfg, url, payload, timeout=120.0)
    if status != 200:
        return _upstream_failed(info["modelId"], status, resp)
    items = _extract_media_items(resp)
    if not items:
        return _err("provider_error", "生图服务未返回图片地址，请稍后再试", code=502,
                    detail=_upstream_msg(resp))
    record_usage(info["modelId"], len(items), ok=True)   # 按张计
    return {"ok": True, "data": items, "modelUsed": info["model"]}


@router.post("/audio/transcribe")
async def audio_transcribe(request: Request,
                           x_client_version: str | None = Header(default=None)):
    """R131：语音转写（ASR）服务端中转，multipart/form-data 上传音频。

    入参（multipart）：modelId（必填）+ file（音频文件）+ language（可选）
    出参：{"ok": true, "text": "转写文本", "modelUsed": "真实模型名"}
    说明：上游端点 audio/transcriptions 由本契约写死（从 provider base_url 派生），
    不依赖前端传 audioUrl——前端无从得知、也不应得知上游地址。
    """
    bad = _gate(x_client_version, request)
    if bad is not None:
        return bad
    ctype = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" not in ctype:
        return _err("bad_request", "请求必须是 multipart/form-data（含 modelId 与 file）",
                    code=400)
    try:
        form = await request.form()
    except Exception:
        return _err("bad_request", "音频上传解析失败，请重新录制后重试", code=400)
    model_id = str(form.get("modelId") or "").strip()
    upload = form.get("file")
    if upload is None:
        return _err("bad_request", "缺少音频文件（file 字段）", code=400)
    info, err = _media_resolve(model_id, ("siliconflow",), ("asr", "audio"), "语音转写")
    if err is not None:
        return err
    filename = getattr(upload, "filename", "") or "audio.wav"
    content_type = getattr(upload, "content_type", "") or "audio/wav"
    try:
        raw = await upload.read()
    except Exception:
        raw = b""
    if not raw:
        return _err("bad_request", "音频文件为空", code=400, hint="请重新录制后重试")
    if len(raw) > _ASR_FILE_MAX:
        return _err("bad_request", "音频文件过大（上限 25MB）", code=400,
                    hint="请裁剪或压缩后再上传")
    cfg = info["cfg"]
    url = _upstream_special_url(cfg["base_url"], "audio/transcriptions") or _ASR_UPSTREAM_URL
    data = {"model": info["model"]}
    language = str(form.get("language") or "").strip()
    if language:
        data["language"] = language
    status, resp = await _relay_media(
        cfg, url, data, files=[("file", (filename, raw, content_type))], timeout=120.0)
    if status != 200:
        return _upstream_failed(info["modelId"], status, resp)
    text = ""
    if isinstance(resp, dict):
        text = str(resp.get("text") or resp.get("transcription")
                   or resp.get("result") or "").strip()
    elif isinstance(resp, str):
        text = resp.strip()
    if not text:
        return _err("provider_error", "语音转写未返回文本，请稍后再试", code=502,
                    detail=_upstream_msg(resp))
    record_usage(info["modelId"], 1, ok=True)   # 按次计
    return {"ok": True, "text": text, "modelUsed": info["model"]}


@router.post("/video/generate")
async def video_generate(body: dict, request: Request,
                         x_client_version: str | None = Header(default=None)):
    """R131：视频生成（异步）第一步——创建任务。

    入参：{"modelId": "ark-seedance-1-0-pro", "prompt": "...",
           "image": "<首帧图 URL，可选>", "audio": false,
           "ratio": "16:9", "duration": 5, "resolution": "720p",
           "seed": -1, "cameraFixed": true}
    出参：{"ok": true, "taskId": "cgt-...", "modelUsed": "真实模型名"}
    之后轮询 GET /api/ai/video/task/{taskId} 直到 succeeded / failed。
    """
    bad = _gate(x_client_version, request)
    if bad is not None:
        return bad
    if not isinstance(body, dict):
        return _err("bad_request", "请求体必须是 JSON 对象", code=400)
    model_id = str(body.get("modelId") or "").strip()
    prompt = str(body.get("prompt") or "").strip()
    image = str(body.get("image") or body.get("imageUrl") or "").strip()
    if not prompt and not image:
        return _err("bad_request", "缺少 prompt 或首帧图片（image）", code=400)
    if image and not _image_ref_ok(image):
        return _err("bad_request", "首帧图片地址不合法（仅支持 http(s) 链接或 data:image）",
                    code=400)
    info, err = _media_resolve(model_id, ("arkvideo",), ("video",), "视频生成")
    if err is not None:
        return err
    content: list[dict] = []
    if prompt:
        content.append({"type": "text", "text": prompt})
    if image:
        content.append({"type": "image_url", "image_url": {"url": image}})
    try:
        duration = int(body.get("duration") or 5)
    except (TypeError, ValueError):
        duration = 5
    duration = min(max(duration, 1), 12)
    try:
        seed = int(body.get("seed")) if body.get("seed") is not None else -1
    except (TypeError, ValueError):
        seed = -1
    payload = {
        "model": info["model"],
        "content": content,
        "ratio": str(body.get("ratio") or "16:9").strip() or "16:9",
        "duration": duration,
        "resolution": str(body.get("resolution") or "720p").strip() or "720p",
        "watermark": bool(body.get("watermark", False)),
        "generate_audio": bool(body.get("audio", False)),
        "camera_fixed": body.get("cameraFixed", True) is not False,
        "seed": seed,
    }
    cfg = info["cfg"]
    status, resp = await _relay_media(cfg, cfg["base_url"], payload)
    if status != 200:
        return _upstream_failed(info["modelId"], status, resp)
    task_id = ""
    if isinstance(resp, dict):
        task_id = str(resp.get("id") or resp.get("task_id") or resp.get("taskId") or "").strip()
    if not task_id:
        return _err("provider_error", "视频服务未返回任务 ID，请稍后再试", code=502,
                    detail=_upstream_msg(resp))
    record_usage(info["modelId"], 1, ok=True)   # 按次计
    return {"ok": True, "taskId": task_id, "modelUsed": info["model"]}


@router.get("/video/task/{task_id}")
async def video_task(task_id: str, request: Request,
                     x_client_version: str | None = Header(default=None)):
    """R131：视频生成（异步）第二步——轮询任务结果。

    服务端用 ARK_API_KEY 代理 GET 上游 tasks/{id}，前端全程不接触密钥。
    出参：{"ok": true, "status": "processing"|"succeeded"|"failed",
           "videoUrl": "https://...mp4", "coverUrl": "...", "error": "..."}
    """
    bad = _gate(x_client_version, request)
    if bad is not None:
        return bad
    tid = str(task_id or "").strip()
    if not tid or len(tid) > 128 or "/" in tid or "\\" in tid:
        return _err("bad_request", "非法的任务 ID", code=400)
    cfg = configured_providers().get("arkvideo")
    if not cfg or not str(cfg.get("api_key") or "").strip():
        return _err("unavailable", "服务端尚未配置视频生成通道，请稍后再试", code=503)
    url = str(cfg["base_url"] or "").rstrip("/") + "/" + tid
    status, resp = await _relay_media(cfg, url, None, method="GET")
    if status != 200:
        return _upstream_failed("", status, resp, record=False)
    view = _task_view(resp)
    content = view["content"]
    video_url = str(content.get("video_url") or "").strip()
    cover_url = str(content.get("cover_image_url") or "").strip()
    if view["status"] == "succeeded" and not video_url:
        return _err("provider_error", "视频生成完成但未返回下载地址，请稍后再试", code=502,
                    detail=_upstream_msg(resp))
    return {"ok": True, "status": view["status"], "videoUrl": video_url,
            "coverUrl": cover_url, "error": view["error"]}


@router.post("/3d/generate")
async def model3d_generate(body: dict, request: Request,
                           x_client_version: str | None = Header(default=None)):
    """R131：3D 生成（异步）第一步——创建任务（图生 3D）。

    入参：{"modelId": "ark-seed3d-2-0", "image": "<图片 URL 或 data:image，必填>",
           "prompt": "<可选文字描述>", "format": "glb", "subdivision": "medium"}
    出参：{"ok": true, "taskId": "cgt-...", "modelUsed": "真实模型名"}
    之后轮询 GET /api/ai/3d/task/{taskId}；拿到的 zip 结果可再交给
    POST /api/ai/model3d/preview 解包成可内联预览的静态媒体。

    与视频同构：同一火山 tasks 端点，仅 content 里塞 image_url。
    """
    bad = _gate(x_client_version, request)
    if bad is not None:
        return bad
    if not isinstance(body, dict):
        return _err("bad_request", "请求体必须是 JSON 对象", code=400)
    model_id = str(body.get("modelId") or "").strip()
    image = str(body.get("image") or body.get("imageUrl") or "").strip()
    prompt = str(body.get("prompt") or "").strip()
    if not image:
        return _err("bad_request", "缺少 image（图生 3D 需要提供一张图片）", code=400)
    if not _image_ref_ok(image):
        return _err("bad_request", "图片地址不合法（仅支持 http(s) 链接或 data:image）",
                    code=400)
    info, err = _media_resolve(model_id, ("ark3d",), ("3d",), "3D 生成")
    if err is not None:
        return err
    content: list[dict] = [{"type": "image_url", "image_url": {"url": image}}]
    if prompt:
        content.append({"type": "text", "text": prompt})
    payload = {
        "model": info["model"],
        "content": content,
        "subdivisionlevel": str(body.get("subdivision") or "medium").strip() or "medium",
        "fileformat": str(body.get("format") or "glb").strip() or "glb",
    }
    cfg = info["cfg"]
    status, resp = await _relay_media(cfg, cfg["base_url"], payload)
    if status != 200:
        return _upstream_failed(info["modelId"], status, resp)
    task_id = ""
    if isinstance(resp, dict):
        task_id = str(resp.get("id") or resp.get("task_id") or resp.get("taskId") or "").strip()
    if not task_id:
        return _err("provider_error", "3D 服务未返回任务 ID，请稍后再试", code=502,
                    detail=_upstream_msg(resp))
    record_usage(info["modelId"], 1, ok=True)   # 按次计
    return {"ok": True, "taskId": task_id, "modelUsed": info["model"]}


@router.get("/3d/task/{task_id}")
async def model3d_task(task_id: str, request: Request,
                       x_client_version: str | None = Header(default=None)):
    """R131：3D 生成（异步）第二步——轮询任务结果（与视频任务同构）。

    出参：{"ok": true, "status": "processing"|"succeeded"|"failed",
           "modelUrl": "<.zip 结果包地址>", "videoUrl": "...",
           "previewUrl": "...", "error": "..."}
    """
    bad = _gate(x_client_version, request)
    if bad is not None:
        return bad
    tid = str(task_id or "").strip()
    if not tid or len(tid) > 128 or "/" in tid or "\\" in tid:
        return _err("bad_request", "非法的任务 ID", code=400)
    cfg = configured_providers().get("ark3d")
    if not cfg or not str(cfg.get("api_key") or "").strip():
        return _err("unavailable", "服务端尚未配置 3D 生成通道，请稍后再试", code=503)
    url = str(cfg["base_url"] or "").rstrip("/") + "/" + tid
    status, resp = await _relay_media(cfg, url, None, method="GET")
    if status != 200:
        return _upstream_failed("", status, resp, record=False)
    view = _task_view(resp)
    content = view["content"]
    model_url = str(content.get("file_url") or content.get("model_url") or "").strip()
    video_url = str(content.get("video_url") or "").strip()
    preview_url = str(content.get("image_url") or "").strip()
    if view["status"] == "succeeded" and not model_url:
        return _err("provider_error", "3D 生成完成但未返回文件地址，请稍后再试", code=502,
                    detail=_upstream_msg(resp))
    return {"ok": True, "status": view["status"], "modelUrl": model_url,
            "videoUrl": video_url, "previewUrl": preview_url,
            "isZip": bool(model_url) and model_url.lower().split("?")[0].endswith(".zip"),
            "error": view["error"]}


# ==================== R130-项4：3D 结果内联预览（zip 解包） ====================
# 背景：前端 assets/ai-cap-3d.js 直连火山方舟「图生 3D」，结果 content.file_url 是一个
# .zip 压缩包（TOS 对象存储，链接 24 小时有效）。此前会话气泡里只有一个 zip 下载链接，
# 用户必须下载解压后才能看到模型。本节新增「解包预览」端点：服务端把 zip 里的预览媒体
# （图片 / 视频）与网格文件（glb / gltf）解到 /uploads 静态目录（main.py 已挂载），
# 前端气泡内直接 <img>/<video> 内联展示，zip 下载降级为次按钮。
# 安全与健壮性边界：
#   · 目标 URL 仅允许火山 TOS 域名后缀（_MODEL3D_HOST_ALLOW），且 DNS 解析结果
#     不得为内网 / 环回 / 链路本地地址（SSRF 防护；单测可通过模块变量显式放行）。
#   · zip 包体积与单文件解压体积均有硬上限，防恶意超大包打爆磁盘。
#   · 解包成员一律取 basename 并清洗后写盘，绝不使用 zip 内原始路径（防 Zip Slip）。
#   · 同一 URL 用 sha1 前 16 位做目录 token，天然防命名冲突；结果写入 meta.json
#     缓存，重复请求（含 zip 链接失效后）直接读缓存，不重复下载。
import hashlib
import ipaddress
import re
import shutil
import socket
import time
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import BaseModel

from config import UPLOAD_DIR

_MODEL3D_DIR = Path(UPLOAD_DIR) / "model3d"
_MODEL3D_HOST_ALLOW = ("volces.com",)   # 火山引擎 TOS（ark 3D 结果包所在域）
_MODEL3D_ALLOW_PRIVATE = False          # 测试钩子：True 时允许内网 / 环回目标
_MODEL3D_ZIP_MAX = 300 * 1024 * 1024    # zip 包整体下载上限 300MB
_MODEL3D_FILE_MAX = 200 * 1024 * 1024   # 单个成员解压上限 200MB
_MODEL3D_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
_MODEL3D_VIDEO_EXT = {".mp4", ".webm"}
_MODEL3D_MESH_EXT = {".glb", ".gltf"}   # 浏览器可懒加载渲染的网格格式（obj/fbx 不解）
# 预览图命名提示：命中者更可能是渲染预览而非贴图
_MODEL3D_PREVIEW_HINTS = ("preview", "render", "cover", "thumbnail", "turntable")


class _Model3dPreviewIn(BaseModel):
    """POST /api/ai/model3d/preview 请求体：3D 结果 zip 的下载地址。"""

    url: str


def _model3d_host_ok(host: str) -> bool:
    """存储域白名单：host 等于后缀本身或以其结尾（防子域伪造用点号边界判定）。"""
    host = (host or "").lower().strip(".")
    for suffix in _MODEL3D_HOST_ALLOW:
        if host == suffix or host.endswith("." + suffix):
            return True
    return False


def _model3d_assert_safe_url(zip_url: str) -> None:
    """SSRF 防护：https + 存储域白名单 + DNS 解析非内网。不合格直接 ValueError。

    例外：测试模式（_MODEL3D_ALLOW_PRIVATE=True）放行 http，供本地 http.server
    自检脚本使用；生产恒为 False，不受影响。
    """
    parsed = urlsplit(zip_url)
    if parsed.scheme != "https":
        if not (parsed.scheme == "http" and _MODEL3D_ALLOW_PRIVATE):
            raise ValueError("仅支持 https 的结果包地址")
    host = parsed.hostname or ""
    if not _model3d_host_ok(host):
        raise ValueError("结果包地址不在允许的存储域内")
    if not _MODEL3D_ALLOW_PRIVATE:
        infos = socket.getaddrinfo(host, parsed.port or 443, proto=socket.IPPROTO_TCP)
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise ValueError("结果包地址解析到内网地址，已拒绝")


def _model3d_download(zip_url: str, dest: Path) -> None:
    """流式下载结果包到 dest，边下边限体积（超限即中止，不留超大临时文件）。"""
    with httpx.Client(follow_redirects=True,
                      timeout=httpx.Timeout(30.0, read=120.0)) as client:
        with client.stream("GET", zip_url) as resp:
            if resp.status_code >= 400:
                raise ValueError(f"下载结果包失败（HTTP {resp.status_code}），链接可能已过期")
            got = 0
            with open(dest, "wb") as f:
                for chunk in resp.iter_bytes(256 * 1024):
                    got += len(chunk)
                    if got > _MODEL3D_ZIP_MAX:
                        raise ValueError("结果包体积超出上限，已中止下载")
                    f.write(chunk)


def _model3d_safe_name(info: zipfile.ZipInfo) -> str:
    """zip 成员 → 干净的落盘文件名（仅 basename，去路径分隔符与非法字符，防 Zip Slip）。"""
    raw = (info.filename or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[^\w.\-]+", "_", raw, flags=re.ASCII).strip("._")
    return name or "file"


def _prune_model3d_dirs(max_age_days: float = 3.0) -> None:
    """尽力清理过期解包目录 / 残留临时包（zip 源链接本身 24h 失效，缓存意义有限）。"""
    try:
        now = time.time()
        if not _MODEL3D_DIR.is_dir():
            return
        deadline = max_age_days * 86400
        for child in _MODEL3D_DIR.iterdir():
            try:
                if now - child.stat().st_mtime <= deadline:
                    continue
                if child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)
                else:
                    child.unlink(missing_ok=True)   # 残留的 *.part.zip 等
            except OSError:
                continue
    except OSError:
        pass


def _model3d_pick(entries: list[zipfile.ZipInfo], exts: set[str]) -> zipfile.ZipInfo | None:
    """按扩展名挑一个成员；图片场景下优先命中预览命名提示，其次取体积更大者。"""
    cands = [i for i in entries if Path(i.filename).suffix.lower() in exts]
    if not cands:
        return None
    if exts is _MODEL3D_IMAGE_EXT:
        def _score(i: zipfile.ZipInfo) -> tuple:
            low = i.filename.lower()
            hint = 1 if any(h in low for h in _MODEL3D_PREVIEW_HINTS) else 0
            return (hint, i.file_size)
        return max(cands, key=_score)
    if exts is _MODEL3D_MESH_EXT:
        # glb 自包含贴图，优先于 gltf（gltf 常伴生外部 bin/贴图，解一个没意义）
        glbs = [i for i in cands if i.filename.lower().endswith(".glb")]
        if glbs:
            return max(glbs, key=lambda i: i.file_size)
    return cands[0]


def unpack_model3d_zip(zip_url: str) -> dict:
    """下载并解包 3D 结果 zip，返回可直接内联展示的静态媒体信息。

    返回结构（ok 恒为 True；未找到对应媒体时对应字段为空）::
        {"ok": true, "token": "...", "image": "/uploads/model3d/<t>/x.png",
         "video": "/uploads/model3d/<t>/y.mp4" | "",
         "mesh": {"url": "...", "format": "glb"} | None,
         "files": ["zip 内原始成员名", ...]}
    """
    zip_url = str(zip_url or "").strip()
    if not zip_url:
        raise ValueError("缺少结果包地址")
    _model3d_assert_safe_url(zip_url)

    token = hashlib.sha1(zip_url.encode("utf-8")).hexdigest()[:16]
    out_dir = _MODEL3D_DIR / token
    meta_path = out_dir / "meta.json"
    _MODEL3D_DIR.mkdir(parents=True, exist_ok=True)
    if meta_path.exists():
        try:
            cached = json.loads(meta_path.read_text(encoding="utf-8"))
            if cached.get("ok"):
                cached["cached"] = True
                return cached
        except Exception:
            pass   # 缓存损坏则按无缓存走全流程

    _prune_model3d_dirs()
    tmp_zip = _MODEL3D_DIR / (token + ".part.zip")
    _model3d_download(zip_url, tmp_zip)

    image_url = video_url = ""
    mesh: dict | None = None
    used_names: set[str] = set()
    try:
        with zipfile.ZipFile(tmp_zip) as zf:
            entries: list[zipfile.ZipInfo] = []
            for info in zf.infolist():
                low = (info.filename or "").lower()
                if info.is_dir() or info.file_size <= 0:
                    continue
                if low.startswith("__macosx") or "/." in low or "/__macosx" in low:
                    continue   # macOS 元数据，不是模型资产
                if info.file_size > _MODEL3D_FILE_MAX:
                    continue   # 超限成员直接跳过，不中止整体
                entries.append(info)

            def _extract(info: zipfile.ZipInfo, prefix: str) -> str:
                name = _model3d_safe_name(info)
                while name in used_names:
                    name = prefix + "_" + name
                used_names.add(name)
                out_dir.mkdir(parents=True, exist_ok=True)
                (out_dir / name).write_bytes(zf.read(info))
                return f"/uploads/model3d/{token}/{name}"

            img = _model3d_pick(entries, _MODEL3D_IMAGE_EXT)
            if img is not None:
                image_url = _extract(img, "img")
            vid = _model3d_pick(entries, _MODEL3D_VIDEO_EXT)
            if vid is not None:
                video_url = _extract(vid, "vid")
            mesh_info = _model3d_pick(entries, _MODEL3D_MESH_EXT)
            if mesh_info is not None:
                mesh_url = _extract(mesh_info, "mesh")
                mesh = {"url": mesh_url,
                        "format": Path(mesh_info.filename).suffix.lower().lstrip(".")}
    finally:
        try:
            tmp_zip.unlink(missing_ok=True)
        except OSError:
            pass

    result = {
        "ok": True,
        "token": token,
        "image": image_url,
        "video": video_url,
        "mesh": mesh,
        "files": [i.filename for i in entries][:50],
        "cached": False,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


@router.post("/model3d/preview")
def model3d_preview(body: _Model3dPreviewIn, request: Request,
                    x_client_version: str | None = Header(default=None)):
    """R130-项4：把 3D 生成结果 zip 解包成可内联预览的静态媒体。

    恒返回 200 + {"ok": bool, "err"?: str}——前端统一按 ok 分支渲染，
    避免 FastAPI 错误体（{"detail": ...}）与正常体结构分叉增加前端判断成本。

    R131：补上版本闸门 + consume 限流桶（与其它 /api/ai/* 同口径）。限流超限
    走统一错误体而非 FastAPI 默认 {"detail":...}；同时保留旧契约的 err 字段，
    老前端「按 ok / err 渲染」的判断路径不受影响。
    """
    bad = _gate(x_client_version, request)
    if bad is not None:
        payload = json.loads(bad.body.decode("utf-8"))
        payload["err"] = payload.get("error", "")
        return JSONResponse(payload, status_code=200)
    try:
        return unpack_model3d_zip(body.url)
    except ValueError as exc:
        return {"ok": False, "err": str(exc)}
    except Exception:
        return {"ok": False, "err": "结果包解包失败，请直接下载 zip 查看"}
