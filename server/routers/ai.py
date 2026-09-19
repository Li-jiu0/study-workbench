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
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from config import AI_DAILY_LIMIT, configured_providers
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


@router.get("/models")
def list_models(user: User = Depends(get_current_user_optional)):
    """前端下拉框数据源：只返回已配置密钥的服务商（名称 + 默认模型），绝不含密钥。

    R88-M1：name 改为**中性平台名**（如「火山方舟（豆包/DeepSeek）」），不再拼上
    「（.env 默认模型串）」——此前它被前端当作「已用模型名」记进账本，导致不管选哪个
    模型都显示成同一个默认模型（用户投诉的 bug）。真实模型名改由 /chat 响应头
    X-Ai-Model-Used 回传（见下），这里只负责「平台级」信息。
    model 字段保留，供前端在拿不到真实模型名时做兜底展示。
    """
    return {
        "models": [
            {"id": pid, "name": cfg["name"], "model": cfg["model"]}
            for pid, cfg in configured_providers().items()
        ]
    }


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

@router.post("/chat")
async def chat(body: _ChatIn, user: User = Depends(get_current_user_optional),
               db: Session = Depends(get_db), _rl: None = Depends(rate_limit("ai"))):
    # 游客（未登录）也可使用：登录用户走每日调用限额，游客仅受每 IP 限流保护，
    # 这样手机浏览器 / 电脑浏览器 / APK 三种环境都不依赖第三方平台的跨域与直连能力。
    providers = configured_providers()
    cfg = providers.get(body.provider)
    if not cfg:
        raise HTTPException(400, "该模型未在服务端配置密钥，请在 server/.env 中填写对应 API Key")

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
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST", cfg["base_url"],
                    headers={"Content-Type": "application/json",
                             "Authorization": f"Bearer {cfg['api_key']}"},
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


@router.post("/model3d/preview", dependencies=[Depends(rate_limit("consume"))])
def model3d_preview(body: _Model3dPreviewIn) -> dict:
    """R130-项4：把 3D 生成结果 zip 解包成可内联预览的静态媒体。

    恒返回 200 + {"ok": bool, "err"?: str}——前端统一按 ok 分支渲染，
    避免 FastAPI 错误体（{"detail": ...}）与正常体结构分叉增加前端判断成本。
    """
    try:
        return unpack_model3d_zip(body.url)
    except ValueError as exc:
        return {"ok": False, "err": str(exc)}
    except Exception:
        return {"ok": False, "err": "结果包解包失败，请直接下载 zip 查看"}
