"""AI 中转：密钥只存后端 .env，前端仅选择模型，不接触任何密钥。

- POST /api/ai/chat → SSE 流式返回纯文本增量；每次调用按天计数（限额防滥用）；
  用户提问与完整回复入库（ai_logs），换设备可从 GET /api/ai/history 恢复上下文。
- 可选 noteId：服务端读取该笔记（作者本人或公开笔记）作为 system 上下文注入。
- 可选 temperature / maxTokens：透传给模型（限制在安全范围）。
"""
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from config import AI_DAILY_LIMIT, configured_providers
from database import (AiLog, AiUsage, Note, SessionLocal, User, get_db,
                      now_iso)
from rate_limit import rate_limit
from schemas import ChatIn
from security import get_current_user, get_current_user_optional

router = APIRouter(prefix="/api/ai", tags=["ai"])

_MAX_NOTE_CTX = 4000
_MAX_MSGS = 20

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
    """前端下拉框数据源：只返回已配置密钥的服务商（名称 + 模型名），绝不含密钥。"""
    return {
        "models": [
            {"id": pid, "name": f"{cfg['name']}（{cfg['model']}）", "model": cfg["model"]}
            for pid, cfg in configured_providers().items()
        ]
    }


@router.get("/usage")
def ai_usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """今日用量：used / limit / date。"""
    row = db.query(AiUsage).filter(AiUsage.user_id == user.id, AiUsage.day == _today()).first()
    return {"used": row.count if row else 0, "limit": AI_DAILY_LIMIT, "date": _today()}


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


@router.post("/chat")
async def chat(body: ChatIn, user: User = Depends(get_current_user_optional),
               db: Session = Depends(get_db), _rl: None = Depends(rate_limit("ai"))):
    # 游客（未登录）也可使用：登录用户走每日调用限额，游客仅受每 IP 限流保护，
    # 这样手机浏览器 / 电脑浏览器 / APK 三种环境都不依赖第三方平台的跨域与直连能力。
    providers = configured_providers()
    cfg = providers.get(body.provider)
    if not cfg:
        raise HTTPException(400, "该模型未在服务端配置密钥，请在 server/.env 中填写对应 API Key")
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

    payload: dict = {"model": cfg["model"], "messages": messages, "stream": True}
    if body.temperature is not None:
        payload["temperature"] = min(max(body.temperature, 0.0), 2.0)
    if body.maxTokens is not None:
        payload["max_tokens"] = min(max(body.maxTokens, 1), 8192)

    async def gen():
        acc: list[str] = []
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
                        acc.append(msg)
                        yield msg.encode("utf-8")
                        return
                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            j = json.loads(data)
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

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")
