# -*- coding: utf-8 -*-
"""TTS 标点清洗回归自测（纯 stdlib，无需第三方依赖，可重复执行）。

背景：有道 dictvoice 对带标点文本会返回上游 5xx（实测 'Hi, what can I get for you today?'
与 '`hello`'），旧实现直接透传 → 生产 /api/tts 500；本脚本自证「清洗后的文本」送上游
不再触发该类失败。

组成：
  A. 离线纯函数用例（始终执行）：验证 server/routers/social.py::sanitize_tts_text 的清洗规则。
     本机 server/.venv 为残缺安装（FastAPI/httpx 不可用），故当正常导入失败时，
     用 AST 抽取该纯函数源码，在最小环境（仅 re）中 exec 求值，从而无需第三方依赖。
  B. 在线端到端用例（可选）：设置环境变量 SW_TTS_BASE（如 http://110.42.134.62:8000）后，
     对 /api/tts 三用例断言：hello → 200 audio/mpeg；带标点整句 → 200 audio/mpeg；
     `hello` → 非 500。未设置则跳过（本机无凭据/无后端时不会误判为失败）。

用法：
  python server/scripts/smoke_tts_punctuation.py
  SW_TTS_BASE=http://110.42.134.62:8000 python server/scripts/smoke_tts_punctuation.py
"""
import ast
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

SERVER_DIR = pathlib.Path(__file__).resolve().parents[1]
SOCIAL_PY = SERVER_DIR / "routers" / "social.py"

fails = 0


def ck(label, cond, detail=""):
    global fails
    print(("  OK  " if cond else "  FAIL") + " " + label + (("  -> " + str(detail)) if detail else ""))
    if not cond:
        fails += 1


def _extract_sanitizer_source(text):
    """AST 抽取 sanitize_tts_text 函数及其依赖的 _TTS_* 常量源码。"""
    tree = ast.parse(text)
    chunks = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "sanitize_tts_text":
            chunks.append(ast.get_source_segment(text, node))
        elif isinstance(node, ast.Assign):
            tgt = node.targets[0] if node.targets else None
            if isinstance(tgt, ast.Name) and tgt.id.startswith("_TTS_"):
                chunks.append(ast.get_source_segment(text, node))
    return "\n".join(chunks)


def load_sanitizer():
    """优先正常导入；依赖缺失时回退 AST 抽取（返回 (fn, 加载方式)）。"""
    try:
        if str(SERVER_DIR) not in sys.path:
            sys.path.insert(0, str(SERVER_DIR))
        from routers import social  # type: ignore
        return social.sanitize_tts_text, "import"
    except Exception:
        pass
    source = SOCIAL_PY.read_text(encoding="utf-8")
    func_src = _extract_sanitizer_source(source)
    if not func_src.strip():
        raise RuntimeError("未能在 social.py 中定位 sanitize_tts_text")
    ns = {}
    exec("import re as _re\n" + func_src, ns)
    return ns["sanitize_tts_text"], "ast"


# ---------- A. 离线纯函数用例 ----------
print("== A. 离线纯函数：sanitize_tts_text ==")
sanitize, how = load_sanitizer()
print("  (加载方式: %s)" % how)

ck("hello → hello", sanitize("hello") == "hello", repr(sanitize("hello")))
ck("带标点整句 → 无标点、单词以单空格分隔",
   sanitize("Hi, what can I get for you today?") == "Hi what can I get for you today",
   repr(sanitize("Hi, what can I get for you today?")))
ck("反引号包裹 → 去除反引号",
   sanitize("`hello`") == "hello", repr(sanitize("`hello`")))
ck("中文标点清洗、中文保留",
   sanitize("你好，世界！") == "你好 世界", repr(sanitize("你好，世界！")))
ck("连字符/撇号保留",
   sanitize("well-known it's fine") == "well-known it's fine",
   repr(sanitize("well-known it's fine")))
ck("纯标点 → 空串（应触发 400）", sanitize("?!,.;:") == "", repr(sanitize("?!,.;:")))
ck("多空格/首尾空白折叠", sanitize("  a   b  ") == "a b", repr(sanitize("  a   b  ")))
ck("空输入/None → 空串", sanitize("") == "" and sanitize(None) == "", repr(sanitize("")))


# ---------- B. 在线端到端用例（可选） ----------
print("\n== B. 在线 /api/tts 端到端 ==")
base = os.environ.get("SW_TTS_BASE", "").rstrip("/")
if not base:
    print("  SKIP 未设置 SW_TTS_BASE（例：SW_TTS_BASE=http://110.42.134.62:8000 python server/scripts/smoke_tts_punctuation.py）")
else:
    cases = [
        ("hello", "mpeg"),
        ("Hi, what can I get for you today?", "mpeg"),
        ("`hello`", "not500"),
    ]
    for text, expect in cases:
        url = base + "/api/tts?text=" + urllib.parse.quote(text) + "&lang=en"
        try:
            with urllib.request.urlopen(urllib.request.Request(url), timeout=15) as resp:
                code, ctype = resp.status, resp.headers.get("Content-Type", "")
            if expect == "mpeg":
                ck("%r → 200 audio/mpeg" % text, code == 200 and "audio" in ctype, "%s %s" % (code, ctype))
            else:
                ck("%r → 非 500" % text, code != 500, "%s %s" % (code, ctype))
        except urllib.error.HTTPError as e:
            if expect == "mpeg":
                ck("%r → 200 audio/mpeg" % text, False, "HTTP %s" % e.code)
            else:
                ck("%r → 非 500" % text, e.code != 500, "HTTP %s" % e.code)
        except Exception as e:
            ck("%r 请求异常" % text, False, str(e))


print("\nTTS 标点清洗自测：失败 %d 项" % fails)
sys.exit(1 if fails else 0)
