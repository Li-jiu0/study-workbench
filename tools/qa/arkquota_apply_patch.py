"""一次性改动脚本：给 AI 路由接上服务端统一额度账本。

以二进制读 -> 换行归一为 \\n 做替换 -> 二进制写回 CRLF，
保证 server/ 下 .py 的行尾不被篡改（项目硬约束）。
改动幂等：任一处已存在目标片段则跳过该处。
"""
from pathlib import Path

SERVER = Path(r"D:\下载的文件\学习工作台\server")
AI_PY = SERVER / "routers" / "ai.py"
SCHEMAS_PY = SERVER / "schemas.py"
LEDGER_PY = SERVER / "quota_ledger.py"

REPLACEMENTS = {
    AI_PY: [
        # 1) import
        (
            "import json\n"
            "\n"
            "import httpx\n"
            "from fastapi import APIRouter, Depends, HTTPException\n"
            "from fastapi.responses import StreamingResponse\n",
            "import json\n"
            "import os\n"
            "\n"
            "import httpx\n"
            "from fastapi import APIRouter, Depends, Header, HTTPException\n"
            "from fastapi.responses import JSONResponse, StreamingResponse\n",
        ),
        (
            "from database import (AiLog, AiUsage, Note, SessionLocal, User, get_db,\n"
            "                      now_iso)\n"
            "from rate_limit import rate_limit\n",
            "from database import (AiLog, AiUsage, Note, SessionLocal, User, get_db,\n"
            "                      now_iso)\n"
            "from quota_ledger import (check_quota, force_exhaust, ledger_snapshot,\n"
            "                          record_usage, reset_usage, resolve_model_name,\n"
            "                          tokens_from_usage)\n"
            "from rate_limit import rate_limit\n",
        ),
        # 2) 常量
        (
            "_MAX_MSGS = 20\n",
            "_MAX_MSGS = 20\n"
            "\n"
            "# 单次上报的用量上限（防恶意刷大数字把模型一次打停），与 quota_ledger 保持一致\n"
            "_MAX_CONSUME_AMOUNT = 100000\n",
        ),
        # 3) 旧的 /usage -> 新的总账 + consume + reset
        (
            '@router.get("/usage")\n'
            "def ai_usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):\n"
            '    """今日用量：used / limit / date。"""\n'
            "    row = db.query(AiUsage).filter(AiUsage.user_id == user.id, AiUsage.day == _today()).first()\n"
            '    return {"used": row.count if row else 0, "limit": AI_DAILY_LIMIT, "date": _today()}\n',
            '@router.get("/usage")\n'
            "def ai_usage(user: User = Depends(get_current_user_optional),\n"
            "             db: Session = Depends(get_db)):\n"
            '    """模型用量总账（免登录）+ 当前登录用户的今日调用数（兼容旧字段）。\n'
            "\n"
            "    - models：服务端全局累计。火山方舟免费额度是账号级共享的，多用户必须累计到\n"
            "      同一个账本，否则前端 localStorage 各算各的会超量欠费。\n"
            "    - used / limit / date：本用户今日调用数（游客为 0），旧客户端与冒烟脚本仍在用。\n"
            "    \"\"\"\n"
            "    snap = ledger_snapshot()\n"
            "    used = 0\n"
            "    if user:\n"
            "        row = db.query(AiUsage).filter(AiUsage.user_id == user.id, AiUsage.day == _today()).first()\n"
            "        used = row.count if row else 0\n"
            '    snap["used"] = used\n'
            '    snap["limit"] = AI_DAILY_LIMIT\n'
            '    snap["date"] = _today()\n'
            "    return snap\n"
            "\n"
            "\n"
            '@router.post("/usage/consume")\n'
            "def ai_usage_consume(body: dict):\n"
            '    """前端直连模型平台（生图 / 视频 / 3D 等）后上报消耗。\n'
            "\n"
            "    入参：{\"modelId\": \"ark-xxx\", \"amount\": 1234, \"ok\": true, \"unit\": \"tokens\"}\n"
            "      - modelId 必填；amount 缺省按 1 计（生图按张、视频按个）\n"
            "      - ok=false 只累加 failCalls，不累加 used\n"
            "    出参：{\"ok\": true, \"used\": 新累计用量, \"status\": \"ok|low|exhausted\"}\n"
            "    \"\"\"\n"
            "    if not isinstance(body, dict):\n"
            '        raise HTTPException(400, "请求体必须是 JSON 对象")\n'
            '    model_id = str(body.get("modelId") or "").strip()\n'
            "    if not model_id:\n"
            '        raise HTTPException(400, "缺少 modelId")\n'
            '    amount = body.get("amount", 1)\n'
            "    try:\n"
            "        amount = int(amount)\n"
            "    except (TypeError, ValueError):\n"
            "        amount = 1\n"
            "    amount = min(max(amount, 0), _MAX_CONSUME_AMOUNT)\n"
            '    ok = body.get("ok", True)\n'
            "    ok = True if ok is None else bool(ok)\n"
            "    status = record_usage(model_id, amount, ok=ok)\n"
            '    return {"ok": True, "used": status["used"], "status": status["status"]}\n'
            "\n"
            "\n"
            '@router.post("/usage/reset")\n'
            "def ai_usage_reset(body: dict, x_admin_token: str | None = Header(default=None)):\n"
            '    """充值后重置用量并重新启用模型（管理用）。\n'
            "\n"
            "    入参：{\"modelId\": \"ark-xxx\"} 或 {\"all\": true}\n"
            "    保护：请求头 X-Admin-Token 必须等于环境变量 ADMIN_TOKEN；\n"
            "    未配置 ADMIN_TOKEN 时放行（方便本地调试），返回里用 authBypass=true 注明。\n"
            "    \"\"\"\n"
            '    required = os.getenv("ADMIN_TOKEN", "").strip()\n'
            "    if required and x_admin_token != required:\n"
            '        raise HTTPException(403, "X-Admin-Token 无效，禁止重置用量")\n'
            "    if not isinstance(body, dict):\n"
            '        raise HTTPException(400, "请求体必须是 JSON 对象")\n'
            '    model_id = str(body.get("modelId") or "").strip()\n'
            '    reset_all = bool(body.get("all"))\n'
            "    if not model_id and not reset_all:\n"
            '        raise HTTPException(400, "需要 modelId 或 all=true")\n'
            '    result = reset_usage(model_id=model_id, reset_all=reset_all)\n'
            '    return {"ok": True, "reset": result["reset"], "authBypass": not required}\n',
        ),
        # 4) chat：转发前额度检查
        (
            '        raise HTTPException(400, "该模型未在服务端配置密钥，请在 server/.env 中填写对应 API Key")\n'
            "    if user:\n"
            "        _record_usage(db, user.id)  # 先计数、超限直接 429，避免空耗\n",
            '        raise HTTPException(400, "该模型未在服务端配置密钥，请在 server/.env 中填写对应 API Key")\n'
            "\n"
            "    # 服务端统一额度：优先按 modelId（前端 ai-config.js 的 id）计，没带则按 provider 兜底。\n"
            "    # 额度用完直接返回 200 + exhausted，**绝不转发**，以免产生真实费用。\n"
            '    quota_key = (getattr(body, "modelId", "") or "").strip() or body.provider\n'
            "    allowed, reason = check_quota(quota_key)\n"
            "    if not allowed:\n"
            "        return JSONResponse({\"ok\": False, \"error\": reason, \"exhausted\": True,\n"
            '                             "modelId": quota_key})\n'
            "\n"
            "    if user:\n"
            "        _record_usage(db, user.id)  # 先计数、超限直接 429，避免空耗\n",
        ),
        # 5) chat：模型名解析 + 请求 usage 统计
        (
            '    payload: dict = {"model": cfg["model"], "messages": messages, "stream": True}\n',
            "    # 模型名：modelId 在 model_registry.json 里能查到就用它，否则退回 .env 的默认模型\n"
            '    model_name = resolve_model_name(body.provider, quota_key) or cfg["model"]\n'
            '    payload: dict = {"model": model_name, "messages": messages, "stream": True}\n'
            "    # 火山方舟支持 stream_options.include_usage：最后一个 chunk 回传本次 token 消耗，\n"
            "    # 够服务端账本精确累加。其余平台保守不加，避免个别平台对未知字段报 400。\n"
            '    if "volces.com" in cfg["base_url"]:\n'
            '        payload["stream_options"] = {"include_usage": True}\n',
        ),
        # 6) chat：gen() 里记账
        (
            "    async def gen():\n"
            "        acc: list[str] = []\n"
            "        try:\n",
            "    async def gen():\n"
            "        acc: list[str] = []\n"
            "        upstream_ok = False\n"
            "        used_tokens = 0\n"
            "        try:\n",
        ),
        (
            "                        acc.append(msg)\n"
            "                        yield msg.encode(\"utf-8\")\n"
            "                        return\n",
            "                        if resp.status_code == 402:\n"
            "                            # 上游明确欠费：直接把该模型标记为耗尽，后续请求本地就拦下\n"
            "                            force_exhaust(quota_key)\n"
            "                        acc.append(msg)\n"
            "                        yield msg.encode(\"utf-8\")\n"
            "                        return\n",
        ),
        (
            "                    async for line in resp.aiter_lines():\n",
            "                    upstream_ok = True\n"
            "                    async for line in resp.aiter_lines():\n",
        ),
        (
            "                            j = json.loads(data)\n"
            "                            delta = j.get(\"choices\", [{}])[0].get(\"delta\", {})\n",
            "                            j = json.loads(data)\n"
            "                            # 带 stream_options 时最后一个 chunk 带 usage（choices 为空）\n"
            "                            chunk_tokens = tokens_from_usage(j.get(\"usage\"))\n"
            "                            if chunk_tokens:\n"
            "                                used_tokens = max(used_tokens, chunk_tokens)\n"
            "                            delta = j.get(\"choices\", [{}])[0].get(\"delta\", {})\n",
        ),
        (
            "        finally:\n"
            "            # 保存完整回答到数据库（登录用户才落库，游客不入库；失败不影响已输出的内容）\n",
            "        finally:\n"
            "            # 服务端账本：成功累加真实 token（拿不到就按 1 次计），失败只记 failCalls\n"
            "            record_usage(quota_key, used_tokens if used_tokens > 0 else 1,\n"
            "                         ok=upstream_ok)\n"
            "            # 保存完整回答到数据库（登录用户才落库，游客不入库；失败不影响已输出的内容）\n",
        ),
    ],
    SCHEMAS_PY: [
        (
            "class ChatIn(BaseModel):\n"
            "    provider: str\n"
            "    messages: list[dict]\n",
            "class ChatIn(BaseModel):\n"
            "    provider: str\n"
            "    modelId: str | None = None   # 可选：前端 ai-config.js 的模型 id（额度账本 / 模型路由）\n"
            "    messages: list[dict]\n",
        ),
    ],
}


def crlf_files(paths) -> None:
    """把新增的 .py 统一成 CRLF，与 server/ 现有风格一致。"""
    for p in paths:
        text = p.read_bytes().decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
        p.write_bytes(text.replace("\n", "\r\n").encode("utf-8"))
        print(f"[OK] CRLF 已统一：{p.name}")


def main() -> None:
    for path, pairs in REPLACEMENTS.items():
        raw = path.read_bytes().decode("utf-8")
        text = raw.replace("\r\n", "\n").replace("\r", "\n")
        changed = 0
        for old, new in pairs:
            if new in text:
                print(f"[SKIP] 已存在，跳过：{path.name} -> {old.splitlines()[0][:50]}")
                continue
            if old not in text:
                print(f"[FAIL] 未匹配：{path.name} -> {old.splitlines()[0][:50]}")
                continue
            text = text.replace(old, new, 1)
            changed += 1
        if changed:
            path.write_bytes(text.replace("\n", "\r\n").encode("utf-8"))
        print(f"[OK] {path.name} 替换 {changed} 处（CRLF 写回）")
    crlf_files([LEDGER_PY])


if __name__ == "__main__":
    main()
