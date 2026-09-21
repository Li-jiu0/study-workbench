# -*- coding: utf-8 -*-
"""R88-M1 补丁 A（服务端）：真实模型名链路修复。

问题：relayChat 不传 modelId + registry key 与 ai-config id 不一致 →
      服务端永远用 .env 默认模型，账本展示名退化成「平台名（默认模型串）」。

改动：
 1) quota_ledger.resolve_model_name —— 增加「按真实模型串反查」能力：
    modelId 可能是 ai-config 的 id（registry 的 key），也可能是真实模型名（registry 的 value）。
    两者都尝试；仍查不到返回空串（调用方回退，不伪造）。
 2) quota_ledger.resolve_model_name_lenient —— 宽松版：provider 不匹配时也给（用于展示名，避免「查不到」）。
 3) routers/ai.py /chat —— 用 resolve 出的真实模型名转发；并把真实模型名通过响应头
    X-Ai-Model-Used 回传前端（前端据此记账，覆盖「显示成同一个模型」的老 bug）。
 4) routers/ai.py /models —— 展示名去掉「（默认模型串）」误导：改为中性「平台名」，
    并额外给出未配置的具体模型（model 字段，供前端做真实名兜底）。
 5) main.py —— CORS 暴露 X-Ai-Model-Used（APK 跨域时前端才读得到）。

行尾：quota_ledger.py / ai.py / main.py 均为 **CRLF**（逐字节实测），
      全程二进制读写并断言 CRLF 不变。
"""
import sys

ROOT = r"D:\下载的文件\学习工作台"
P_LEDGER = ROOT + r"\server\quota_ledger.py"
P_AI = ROOT + r"\server\routers\ai.py"
P_MAIN = ROOT + r"\server\main.py"


def read_text(path, expect_crlf=True):
    b = open(path, "rb").read()
    cr = b.count(b"\r")
    crlf = b.count(b"\r\n")
    if expect_crlf and cr != crlf:
        print("FATAL: %s 非纯 CRLF（CR=%d CRLF=%d）" % (path, cr, crlf))
        sys.exit(2)
    if not expect_crlf and cr != 0:
        print("FATAL: %s 非纯 LF（CR=%d）" % (path, cr))
        sys.exit(2)
    return b.decode("utf-8"), b


def write_text(path, text, expect_crlf=True):
    data = text.encode("utf-8")
    open(path, "wb").write(data)
    b = open(path, "rb").read()
    cr = b.count(b"\r")
    crlf = b.count(b"\r\n")
    if expect_crlf and cr != crlf:
        print("FATAL: 写回后 %s 行尾被污染" % path)
        sys.exit(4)
    if not expect_crlf and cr != 0:
        print("FATAL: 写回后 %s 出现 CR" % path)
        sys.exit(4)
    return len(b)


def rep(text, old, new, label, expect=1):
    c = text.count(old)
    if c != expect:
        print("FATAL: [%s] 锚点出现 %d 次（期望 %d）" % (label, c, expect))
        sys.exit(3)
    print("OK  [%s]" % label)
    return text.replace(old, new, 1)


# ===========================================================================
# 1) quota_ledger.py：resolve_model_name 增强 + 新增 resolve_model_name_lenient
# ===========================================================================
ledger, _ = read_text(P_LEDGER)

OLD_RESOLVE = (
    'def resolve_model_name(provider: str, model_id: str) -> str:\r\n'
    '    """modelId -> 真实模型名（查 server/data/model_registry.json）。\r\n'
    '\r\n'
    '    查不到就返回空串，调用方回退到 .env 里配置的默认模型。\r\n'
    '    """\r\n'
    '    ensure_loaded()\r\n'
    '    if not model_id:\r\n'
    '        return ""\r\n'
    '    entry = _registry.get(model_id) or {}\r\n'
    '    name = entry.get("model")\r\n'
    '    if isinstance(name, str) and name.strip():\r\n'
    '        entry_provider = entry.get("provider")\r\n'
    '        if not entry_provider or entry_provider == provider:\r\n'
    '            return name.strip()\r\n'
    '    return ""\r\n'
)

NEW_RESOLVE = (
    'def _lookup_registry(model_id: str) -> tuple:\r\n'
    '    """按 modelId 查注册表，返回 (真实模型名, provider)。\r\n'
    '\r\n'
    '    支持两种 key 形态（R88-M1 修复「选什么都跑同一个模型」）：\r\n'
    '      1) modelId 命中 registry 的【键】（如 ark-ds-v4-flash-ga）；\r\n'
    '      2) modelId 本身就是【真实模型名】（如 deepseek-v4-flash-ga-260731），\r\n'
    '         反查 registry 的 value —— 因为前端 ai-config.js 的 id 与 registry 键\r\n'
    '         并不一致（实测 47 个 id 仅 8 个与 registry 键相同），仅按键查会大量落空。\r\n'
    '    查不到返回 ("", "")。\r\n'
    '    """\r\n'
    '    ensure_loaded()\r\n'
    '    if not model_id:\r\n'
    '        return "", ""\r\n'
    '    mid = str(model_id).strip()\r\n'
    '    # (1) 按注册表键命中\r\n'
    '    entry = _registry.get(mid) or {}\r\n'
    '    name = entry.get("model")\r\n'
    '    if isinstance(name, str) and name.strip():\r\n'
    '        return name.strip(), str(entry.get("provider") or "")\r\n'
    '    # (2) 按真实模型名反查（value 命中）\r\n'
    '    for _key, _val in _registry.items():\r\n'
    '        if not isinstance(_val, dict):\r\n'
    '            continue\r\n'
    '        if str(_val.get("model") or "").strip() == mid:\r\n'
    '            return mid, str(_val.get("provider") or "")\r\n'
    '    return "", ""\r\n'
    '\r\n'
    '\r\n'
    'def resolve_model_name(provider: str, model_id: str) -> str:\r\n'
    '    """modelId -> 真实模型名（查 server/data/model_registry.json）。\r\n'
    '\r\n'
    '    严格版：provider 必须匹配（或注册表未标 provider）才返回，用于「转发用哪个模型」。\r\n'
    '    查不到就返回空串，调用方回退到 .env 里配置的默认模型。\r\n'
    '    """\r\n'
    '    name, entry_provider = _lookup_registry(model_id)\r\n'
    '    if not name:\r\n'
    '        return ""\r\n'
    '    if not entry_provider or entry_provider == provider:\r\n'
    '        return name\r\n'
    '    return ""\r\n'
    '\r\n'
    '\r\n'
    'def resolve_model_name_lenient(model_id: str) -> str:\r\n'
    '    """modelId -> 真实模型名（宽松版，忽略 provider 校验）。\r\n'
    '\r\n'
    '    用于「展示名」等不影响转发的场景：只要注册表能查到就返回真实模型名，\r\n'
    '    避免因 provider 记录不全而把真实名丢掉（绝不返回编造值，查不到即空串）。\r\n'
    '    """\r\n'
    '    name, _provider = _lookup_registry(model_id)\r\n'
    '    return name\r\n'
)

ledger = rep(ledger, OLD_RESOLVE, NEW_RESOLVE, "ledger.resolve_model_name+lenient")
n = write_text(P_LEDGER, ledger, expect_crlf=True)
print("    quota_ledger.py bytes=%d" % n)

print("PATCH-A(ledger) done.")
