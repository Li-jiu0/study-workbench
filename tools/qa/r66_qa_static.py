# -*- coding: utf-8 -*-
# R66 QA 静态检查（项目铁律：bash 无 coreutils，脚本落盘执行）
import os, re, io

BASE = r"D:/下载的文件/学习工作台"
OUT = os.path.join(BASE, "tools/qa/r66_qa_static_result.txt")
TEST_FILES = [
    "ai-settings.html",
    "assets/ai-settings.js",
    "assets/ai-page.js",
    "AI.html",
]
REF_FILES = [
    "assets/ai-config.js",
    "assets/ai-service.js",
]
ALL = TEST_FILES + REF_FILES

def strip_comments(text):
    # 去掉 // 行注释 与 /* */ 块注释，避免注释里的 **中文** 之类误报
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    return text

# 6 个平台密钥（运行时从 assets/ai-config.js 提取，不在仓库硬编码）
def _load_platform_keys():
    _src = open(os.path.join(BASE, "assets", "ai-config.js"), "rb").read().decode("utf-8", "replace")
    return re.findall(r'apiKey:\s*"([^"]+)"', _src)

PLATFORM_KEYS = _load_platform_keys()

# ES2017 禁忌语法（老 WebView 上限 ES2017）
ES2017 = {
    "optional_chaining (?. )": re.compile(r"\?\.[A-Za-z_$]"),
    "nullish_coalesce (??)": re.compile(r"\?\?"),
    "replaceAll(": re.compile(r"\.replaceAll\("),
    "Array.at("  : re.compile(r"\.at\("),
    "Object.fromEntries(": re.compile(r"\.fromEntries\("),
    "exponent (**)": re.compile(r"\*\*"),
    "lookbehind (?<=/ ?<!)": re.compile(r"\(\?<[!=]"),
    "catch without binding (catch {)": re.compile(r"\bcatch\s*\{"),
    "spread/rest (...)": re.compile(r"\.\.\.[A-Za-z_$]"),
}

# 项目级：全站 LF/CRLF 行尾要求
LF_FILES = [
    "ai-settings.html",
    "assets/ai-settings.js",
    "assets/ai-page.js",
    "assets/ai-service.js",
]
CRLF_FILES = ["AI.html", "assets/ai-config.js"]

def read_bytes(p):
    with open(p, "rb") as f:
        return f.read()

def line_ending_report(p):
    raw = read_bytes(p)
    has_crlf = raw.count(b"\r\n")
    # lone LF: a \n not preceded by \r
    lone_lf = 0
    i = 0
    n = len(raw)
    while i < n:
        if raw[i:i+1] == b"\n":
            if i == 0 or raw[i-1:i] != b"\r":
                lone_lf += 1
        i += 1
    return has_crlf, lone_lf

lines_out = []
def log(s):
    lines_out.append(s)

# ---------- 1. ES2017 检查 ----------
log("===== [A] ES2017 禁忌语法扫描（期望全部 = 0） =====")
for rel in ALL:
    p = os.path.join(BASE, rel)
    if not os.path.exists(p):
        log("[MISSING] %s" % rel); continue
    text = read_bytes(p).decode("utf-8", "replace")
    code = strip_comments(text)
    hits = []
    for name, rx in ES2017.items():
        c = len(rx.findall(code))
        if c:
            # 给前 2 个命中上下文
            ctx = []
            for m in rx.finditer(code):
                start = max(0, m.start()-20); end = min(len(code), m.start()+15)
                ctx.append(code[start:end].replace("\n"," "))
                if len(ctx) >= 2: break
            hits.append("%s=%d e.g.%s" % (name, c, " | ".join(ctx)))
    if hits:
        log("[FAIL] %s -> %s" % (rel, " ; ".join(hits)))
    else:
        log("[PASS] %s : 0 命中" % rel)

# ---------- 2. 行尾检查 ----------
log("")
log("===== [B] 行尾检查 =====")
for rel in LF_FILES:
    p = os.path.join(BASE, rel)
    crlf, lone = line_ending_report(p)
    if crlf == 0:
        log("[PASS] LF  %s : CRLF=%d (期望0)" % (rel, crlf))
    else:
        log("[FAIL] LF  %s : CRLF=%d (应=0)" % (rel, crlf))
for rel in CRLF_FILES:
    p = os.path.join(BASE, rel)
    crlf, lone = line_ending_report(p)
    if lone == 0:
        log("[PASS] CRLF %s : loneLF=%d (期望0)" % (rel, lone))
    else:
        log("[FAIL] CRLF %s : loneLF=%d (应=0)" % (rel, lone))

# ---------- 3. 平台密钥明文（仅 4 个被测文件，期望 0） ----------
log("")
log("===== [C] 4 个被测文件内 6 平台密钥明文扫描（期望 0） =====")
for rel in TEST_FILES:
    p = os.path.join(BASE, rel)
    text = read_bytes(p).decode("utf-8", "replace")
    found = []
    for k in PLATFORM_KEYS:
        if k in text:
            found.append(k[:12] + "...")
    if found:
        log("[FAIL] %s : 命中 %d 个平台密钥明文 -> %s" % (rel, len(found), found))
    else:
        log("[PASS] %s : 0 命中" % rel)

# 参考：ai-config.js 应含（预期存在，仅作信息）
p = os.path.join(BASE, "assets/ai-config.js")
text = read_bytes(p).decode("utf-8", "replace")
inc = sum(1 for k in PLATFORM_KEYS if k in text)
log("[INFO] ai-config.js (参考, 应含密钥) : 命中 %d / 6 平台密钥 (硬编码属预期)" % inc)

# ---------- 4. 全局名守卫：window.X= 跨文件去重 + 是否带守卫 ----------
log("")
log("===== [D] 顶层全局名（window.X=）跨文件去重 + 守卫检查 =====")
win_keys = {}
for rel in ALL:
    p = os.path.join(BASE, rel)
    text = read_bytes(p).decode("utf-8", "replace")
    for m in re.finditer(r"window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=", text):
        start = max(0, m.start()-60)
        ctx = text[start:m.start()]
        guarded = ("typeof" in ctx) or ("=== 'undefined'" in ctx) or ('!== "function"' in ctx) or ("!==" in ctx)
        win_keys.setdefault(m.group(1), []).append((rel, guarded))
dups = {k:v for k,v in win_keys.items() if len(set(x[0] for x in v)) > 1}
unguarded = {k:v for k,v in win_keys.items() if any(not g for _,g in v)}
if dups:
    for k,v in dups.items():
        guarded_all = all(g for _,g in v)
        tag = "GUARDED(安全)" if guarded_all else "UNGUARDED(风险)"
        log("[%s] 重复 window.%s= 出现于: %s" % (tag, k, "; ".join("%s%s"%(r,"(守卫)" if g else "(无守卫)") for r,g in v)))
else:
    log("[PASS] 无跨文件重复 window.X= 声明（共 %d 个不同全局名）" % len(win_keys))
if unguarded:
    log("[INFO] 含无守卫赋值的全局名(可能单文件内多赋值或需注意): " + ", ".join(unguarded.keys()))
# 文件级顶层声明（非 IIFE 内）只应出现在 ai-config.js
log("")
log("===== [E] 文件级顶层声明（非 IIFE 包裹）检查（仅 ai-config.js 应出现） =====")
for rel in ALL:
    p = os.path.join(BASE, rel)
    text = read_bytes(p).decode("utf-8", "replace")
    toplv = []
    for line in text.splitlines():
        s = line.strip()
        if re.match(r"^(var|function|const|let)\s+[A-Za-z_$]", s) and not s.startswith("//"):
            toplv.append(s[:50])
    if toplv:
        # ai-config.js 顶层声明 AI_CONFIG 属预期；其余文件顶层声明=风险
        if rel == "assets/ai-config.js":
            log("[INFO] %s (参考, 顶层 AI_CONFIG 属预期)" % rel)
        else:
            log("[WARN] %s 含文件级顶层声明(可能逃逸 IIFE): %s" % (rel, "; ".join(toplv[:6])))

# 顶层 var（IIFE 外）声明检查：仅检测文件级 var/const/let/function（非缩进、非 IIFE 内）
log("")
log("===== [E] 文件级顶层 var/function（非 IIFE 内）声明检查 =====")
for rel in ALL:
    p = os.path.join(BASE, rel)
    text = read_bytes(p).decode("utf-8", "replace")
    # 取第一层：去掉注释，找行首非空白的 var/function/const/let
    toplv = []
    for line in text.splitlines():
        s = line.strip()
        if re.match(r"^(var|function|const|let)\s+[A-Za-z_$]", s) and not s.startswith("//"):
            toplv.append(s[:60])
    if toplv:
        log("[INFO] %s 顶层声明: %s" % (rel, " ; ".join(toplv)))

# ---------- 5. R64 特性存活：签名计数对照备份 ----------
log("")
log("===== [F] R64/R65 特性签名计数（新文件 vs .bak-pre-r66 备份） =====")
backup = os.path.join(BASE, "assets/ai-settings.js.bak-pre-r66-20260916")
newf = os.path.join(BASE, "assets/ai-settings.js")
FEATURE_FNS = [
    "function selectModel", "function toggleModel", "function reorder",
    "function moveModel", "function restoreDefaults", "function setStar",
    "function saveForm", "function startEdit", "function clearKeyOverride",
    "function buildNamePresets", "function renderKeyState", "function testFormConnection",
    "function batchHealthCheck", "function addCustomType", "function saveChain",
    "function healthReason", "function renderMemory", "function recordHealth",
]
def count_fns(text):
    d = {}
    for fn in FEATURE_FNS:
        d[fn] = text.count(fn)
    return d
if os.path.exists(backup) and os.path.exists(newf):
    nt = read_bytes(newf).decode("utf-8","replace")
    bt = read_bytes(backup).decode("utf-8","replace")
    nd = count_fns(nt); bd = count_fns(bt)
    for fn in FEATURE_FNS:
        n = nd[fn]; b = bd[fn]
        mark = "[PASS]" if n >= b else "[WARN]"
        if n != b:
            log("%s %s 新=%d 备份=%d" % (mark, fn, n, b))
    log("[INFO] 备份行数=%d 新文件行数=%d" % (bt.count("\n")+1, nt.count("\n")+1))
else:
    log("[SKIP] 备份或新文件缺失")

# ---------- 6. 关键常量（R66 时序） ----------
log("")
log("===== [G] R66 健康队列时序常量（期望 HEALTH_STEP>=6500, BOOT>=1500） =====")
text = read_bytes(newf).decode("utf-8","replace")
m1 = re.search(r"HEALTH_STEP\s*=\s*(\d+)", text)
m2 = re.search(r"HEALTH_BOOT_DELAY\s*=\s*(\d+)", text)
if m1 and m2:
    step=int(m1.group(1)); boot=int(m2.group(1))
    log("[%s] HEALTH_STEP=%d HEALTH_BOOT_DELAY=%d" % ("PASS" if step>=6500 and boot>=1500 else "FAIL", step, boot))
else:
    log("[FAIL] 未找到时序常量")

result = "\n".join(lines_out)
with io.open(OUT, "w", encoding="utf-8") as f:
    f.write(result)
print(result)
