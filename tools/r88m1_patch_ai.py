# -*- coding: utf-8 -*-
"""R88-M1 补丁 B（服务端 routers/ai.py）：
 1) /chat 用真实模型名转发；响应头 X-Ai-Model-Used 回传真实模型名。
 2) /models 展示名去掉误导性的「（默认模型串）」，改为中性平台名。
行尾：CRLF（逐字节实测），二进制读写并断言。
"""
import sys

P_AI = r"D:\下载的文件\学习工作台\server\routers\ai.py"


def read_text(path):
    b = open(path, "rb").read()
    cr = b.count(b"\r")
    crlf = b.count(b"\r\n")
    if cr != crlf:
        print("FATAL: %s 非纯 CRLF（CR=%d CRLF=%d）" % (path, cr, crlf))
        sys.exit(2)
    return b.decode("utf-8")


def write_text(path, text):
    open(path, "wb").write(text.encode("utf-8"))
    b = open(path, "rb").read()
    cr = b.count(b"\r")
    crlf = b.count(b"\r\n")
    if cr != crlf:
        print("FATAL: 写回后行尾污染")
        sys.exit(4)
    return len(b)


def rep(text, old, new, label):
    c = text.count(old)
    if c != 1:
        print("FATAL: [%s] 锚点 %d 次" % (label, c))
        sys.exit(3)
    print("OK  [%s]" % label)
    return text.replace(old, new, 1)


t = read_text(P_AI)

# --- 1) import 增加 resolve_model_name_lenient ---
t = rep(
    t,
    "from quota_ledger import (check_quota, force_exhaust, known_model_ids,\r\n"
    "                          ledger_snapshot, record_usage, reset_usage,\r\n"
    "                          resolve_model_name, tokens_from_usage)",
    "from quota_ledger import (check_quota, force_exhaust, known_model_ids,\r\n"
    "                          ledger_snapshot, record_usage, reset_usage,\r\n"
    "                          resolve_model_name, resolve_model_name_lenient,\r\n"
    "                          tokens_from_usage)",
    "import-lenient",
)

# --- 2) /models 展示名：去掉「（默认模型串）」误导 ---
t = rep(
    t,
    'def list_models(user: User = Depends(get_current_user_optional)):\r\n'
    '    """前端下拉框数据源：只返回已配置密钥的服务商（名称 + 模型名），绝不含密钥。"""\r\n'
    '    return {\r\n'
    '        "models": [\r\n'
    '            {"id": pid, "name": f"{cfg[\'name\']}（{cfg[\'model\']}）", "model": cfg["model"]}\r\n'
    '            for pid, cfg in configured_providers().items()\r\n'
    '        ]\r\n'
    '    }\r\n',
    'def list_models(user: User = Depends(get_current_user_optional)):\r\n'
    '    """前端下拉框数据源：只返回已配置密钥的服务商（名称 + 默认模型），绝不含密钥。\r\n'
    '\r\n'
    '    R88-M1：name 改为**中性平台名**（如「火山方舟（豆包/DeepSeek）」），不再拼上\r\n'
    '    「（.env 默认模型串）」——此前它被前端当作「已用模型名」记进账本，导致不管选哪个\r\n'
    '    模型都显示成同一个默认模型（用户投诉的 bug）。真实模型名改由 /chat 响应头\r\n'
    '    X-Ai-Model-Used 回传（见下），这里只负责「平台级」信息。\r\n'
    '    model 字段保留，供前端在拿不到真实模型名时做兜底展示。\r\n'
    '    """\r\n'
    '    return {\r\n'
    '        "models": [\r\n'
    '            {"id": pid, "name": cfg["name"], "model": cfg["model"]}\r\n'
    '            for pid, cfg in configured_providers().items()\r\n'
    '        ]\r\n'
    '    }\r\n',
    "models-name-neutral",
)

# --- 3) /chat：真实模型名解析（严格 + 宽松展示名），响应头回传 ---
t = rep(
    t,
    '    # 模型名：modelId 在 model_registry.json 里能查到就用它，否则退回 .env 的默认模型\r\n'
    '    model_name = resolve_model_name(body.provider, quota_key) or cfg["model"]\r\n',
    '    # 模型名：优先用 modelId 解析出的【真实模型名】转发；解析不到才退回 .env 默认模型。\r\n'
    '    # R88-M1：quota_key 来自 body.modelId（前端 relayChat 现已带上），经 registry 解析后\r\n'
    '    # 才能真正「选哪个跑哪个」——此前前端不带 modelId，这里恒回退 .env 默认，用户看着像\r\n'
    '    # 「选什么都跑同一个模型」。展示名用宽松版（忽略 provider 校验），拿不到就如实回落。\r\n'
    '    resolved_name = resolve_model_name(body.provider, quota_key)\r\n'
    '    model_name = resolved_name or cfg["model"]\r\n'
    '    # 展示用真实模型名：严格解析不到时用宽松解析；仍拿不到则用实际转发用的 model_name\r\n'
    '    # （即 .env 默认），如实反映「实际执行的模型」，绝不编造一个看起来正常的假名字。\r\n'
    '    display_model_name = (resolved_name\r\n'
    '                          or resolve_model_name_lenient(quota_key)\r\n'
    '                          or model_name)\r\n',
    "chat-resolve",
)

# --- 4) 响应头回传真实模型名（CORS 已由 main.py 暴露） ---
t = rep(
    t,
    '    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")\r\n',
    '    # R88-M1：把「实际执行的模型名」通过响应头回传前端，供前端如实记账（用量明细显示\r\n'
    '    # 真实调用的模型名，而非平台默认模型）。header 值须为 latin-1 可编码，模型名均为 ASCII。\r\n'
    '    _safe_model = "".join(ch for ch in str(display_model_name) if ord(ch) < 128) or "unknown"\r\n'
    '    return StreamingResponse(\r\n'
    '        gen(), media_type="text/plain; charset=utf-8",\r\n'
    '        headers={"X-Ai-Model-Used": _safe_model},\r\n'
    '    )\r\n',
    "chat-header",
)

n = write_text(P_AI, t)
print("    ai.py bytes=%d" % n)
print("PATCH-B(ai.py) done.")
