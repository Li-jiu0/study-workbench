"""AI 中转：密钥只存后端 .env，前端仅选择模型，不接触任何密钥。

- POST /api/ai/chat → SSE 流式返回纯文本增量；每次调用按天计数（限额防滥用）；
  用户提问与完整回复入库（ai_logs），换设备可从 GET /api/ai/history 恢复上下文。
- 可选 noteId：服务端读取该笔记（作者本人或公开笔记）作为 system 上下文注入。
- 可选 temperature / maxTokens：透传给模型（限制在安全范围）。
"""
import json
import os

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


_MAX_NOTE_CTX = 4000
_MAX_MSGS = 20

# 单次上报的用量上限（防恶意刷大数字把模型一次打停），与 quota_ledger 保持一致
_MAX_CONSUME_AMOUNT = 100000

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
                            if piece:
                                acc.append(piece)
                                yield piece.encode("utf-8")
                        except Exception:
                            continue  # 心跳/注释行等跳过
        except httpx.HTTPError as e:
            msg = f"⚠️ 连接模型服务失败：{e.__class__.__name__}"
            acc.append(msg)
            yield msg.encode("utf-8")
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
    return StreamingResponse(
        gen(), media_type="text/plain; charset=utf-8",
        headers={"X-Ai-Model-Used": _safe_model},
    )
