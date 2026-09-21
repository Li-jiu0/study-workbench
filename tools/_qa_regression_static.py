# -*- coding: utf-8 -*-
import os, re, io, json

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools", "_qa_report_static.txt")
lines = []
def w(s=""):
    lines.append(str(s))

# collect root html active files
root_html = []
for f in os.listdir(ROOT):
    p = os.path.join(ROOT, f)
    if not os.path.isfile(p): continue
    if not f.lower().endswith(".html"): continue
    if f.startswith("_"): continue
    if ".bak" in f: continue
    root_html.append(f)

asset_js = []
for f in os.listdir(os.path.join(ROOT, "assets")):
    p = os.path.join(ROOT, "assets", f)
    if not os.path.isfile(p): continue
    if not f.endswith(".js"): continue
    if ".bak" in f: continue
    asset_js.append(f)

w("=== A. 死链扫描 ===")
bad_a = []
pat_dongtai = re.compile(r"动态\.html")
pat_pyq = re.compile(r"朋友圈\.html")
def scan_file(path, relname):
    try:
        txt = io.open(path, "r", encoding="utf-8", errors="replace").read()
    except Exception as e:
        w("  [读失败] %s %s" % (relname, e)); return
    for m in pat_dongtai.finditer(txt):
        s = m.start()
        pre = txt[max(0,s-4):s]
        if pre.endswith("我的") or pre.endswith("空间"):
            continue
        line = txt.count("\n", 0, s) + 1
        ctx = txt[max(0,s-30):m.end()+10].replace("\n", " ")
        bad_a.append((relname, line, ctx))
    for m in pat_pyq.finditer(txt):
        s = m.start()
        line = txt.count("\n", 0, s) + 1
        ctx = txt[max(0,s-30):m.end()+10].replace("\n", " ")
        bad_a.append((relname, line, ctx))

for f in root_html:
    scan_file(os.path.join(ROOT, f), f)
for f in asset_js:
    scan_file(os.path.join(ROOT, "assets", f), "assets/" + f)

if bad_a:
    w("FAIL: %d 处命中" % len(bad_a))
    for rel, ln, ctx in bad_a:
        w("  %s:%d  ...%s..." % (rel, ln, ctx))
else:
    w("PASS: 0 命中 (扫描 %d 个根HTML + %d 个 assets js)" % (len(root_html), len(asset_js)))

w()
w("=== B. 文件存在性 ===")
checks = [("动态空间.html", True), ("朋友圈.html", False), ("动态.html", False),
          ("我的动态.html", True), ("朋友圈发布.html", True)]
allb = True
for name, want in checks:
    ex = os.path.isfile(os.path.join(ROOT, name))
    ok = (ex == want)
    allb = allb and ok
    w("%s %s 存在=%s" % ("PASS" if ok else "FAIL", name, ex))
w("=> B " + ("PASS" if allb else "FAIL"))

w()
w("=== C. app.js 路由与护栏 ===")
appjs_path = os.path.join(ROOT, "assets", "app.js")
appjs = io.open(appjs_path, "r", encoding="utf-8", errors="replace").read()
c_route = appjs.count("moments: '动态空间.html',")
w("路由字面量 `moments: '动态空间.html',` 出现次数 = %d (期望 1) %s" % (c_route, "PASS" if c_route == 1 else "FAIL"))

# PAGE_FILES extraction
mp = re.search(r"PAGE_FILES\s*=\s*\{(.*?)\}", appjs, re.S)
if mp:
    body = mp.group(1)
    keys = re.findall(r"(\w+)\s*:", body)
    w("PAGE_FILES 键数 = %d, 键 = %s" % (len(keys), ",".join(keys)))
    # check all values exist
    pairs = re.findall(r"(\w+)\s*:\s*'([^']+)'", body)
    missing_files = [k for k, v in pairs if not os.path.isfile(os.path.join(ROOT, v))]
    w("PAGE_FILES 指向文件缺失: %s" % (missing_files if missing_files else "无"))
else:
    w("FAIL: 未找到 PAGE_FILES 定义")

# line 665 long line vs bak
bak_candidates = [f for f in os.listdir(os.path.join(ROOT, "assets")) if f.startswith("app.js") and ".bak" in f]
w("assets 下 app.js bak 候选: %s" % bak_candidates)
app_lines = appjs.split("\n")
if len(app_lines) >= 665:
    l665 = app_lines[664]
    w("app.js 第665行长度 = %d 字符" % len(l665))
else:
    w("app.js 总行数 = %d, 不足665行" % len(app_lines))
for bak in bak_candidates:
    btxt = io.open(os.path.join(ROOT, "assets", bak), "r", encoding="utf-8", errors="replace").read()
    blines = btxt.split("\n")
    if len(blines) >= 665 and len(app_lines) >= 665:
        same = blines[664] == app_lines[664]
        w("与 %s 第665行一致: %s (bak 行长 %d)" % (bak, same, len(blines[664])))

w()
w("=== D. 侧栏计数 data-page=moments ===")
pat_dpm = re.compile(r'data-page="moments"')
total = 0
pages = 0
faild = []
for f in sorted(root_html):
    txt = io.open(os.path.join(ROOT, f), "r", encoding="utf-8", errors="replace").read()
    n = len(pat_dpm.findall(txt))
    if n > 0:
        pages += 1
        total += n
        if n != 1:
            faild.append((f, n))
w("含 data-page=moments 的页面数 = %d, 总命中 = %d" % (pages, total))
w("命中数 != 1 的页面: %s" % (faild if faild else "无"))
w("=> D " + ("PASS" if not faild else "FAIL"))

w()
w("=== F. 行尾检查 ===")
def line_ending(path):
    raw = open(path, "rb").read()
    crlf = raw.count(b"\r\n")
    lf_total = raw.count(b"\n")
    bare_lf = lf_total - crlf
    cr_total = raw.count(b"\r")
    bare_cr = cr_total - crlf
    return bare_lf, bare_cr

f_crlf = [f for f in root_html] + ["assets/xt-moments.js", "assets/xt-moments.css",
    "assets/xt-profile.js", "assets/xt-profile.css", "assets/api.js", "assets/chat-local.js",
    "assets/app.js", "assets/ai-config.js"]
f_lf = ["assets/ai-page.js", "assets/ai-service.js", "assets/ai-settings.js"]
allf = True
for rel in f_crlf:
    p = os.path.join(ROOT, rel)
    if not os.path.isfile(p):
        w("FAIL 缺文件 %s" % rel); allf = False; continue
    blf, bcr = line_ending(p)
    ok = (blf == 0 and bcr == 0)
    allf = allf and ok
    if not ok:
        w("FAIL %s bareLF=%d bareCR=%d" % (rel, blf, bcr))
w("CRLF 组全部通过" if allf else "CRLF 组存在失败(见上)")
allf2 = True
for rel in f_lf:
    p = os.path.join(ROOT, rel)
    blf, bcr = line_ending(p)
    ok = (bcr == 0)
    allf2 = allf2 and ok
    w("%s %s CR=%d(bare) LF总=%d" % ("PASS" if ok else "FAIL", rel, bcr, blf))
w("=> F " + ("PASS" if (allf and allf2) else "FAIL"))

w()
w("=== G. ES2017 禁令扫描 ===")
def strip_comments(src):
    # remove block comments then line comments (crude but per spec)
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    out = []
    for ln in src.split("\n"):
        # remove // not inside string (crude: cut at first // )
        idx = ln.find("//")
        if idx >= 0:
            ln = ln[:idx]
        out.append(ln)
    return "\n".join(out)

g_files = ["assets/xt-moments.js", "assets/xt-profile.js", "assets/api.js",
           "assets/chat-local.js", "assets/ai-page.js", "assets/ai-service.js",
           "assets/ai-settings.js"]
pats = [("?.", re.compile(r"\?\.")), ("??", re.compile(r"\?\?")),
        (".replaceAll(", re.compile(r"\.replaceAll\(")),
        ("Object.fromEntries", re.compile(r"Object\.fromEntries")),
        (".at(", re.compile(r"\.at\("))]
g_all = True
for rel in g_files:
    p = os.path.join(ROOT, rel)
    src = io.open(p, "r", encoding="utf-8", errors="replace").read()
    code = strip_comments(src)
    hits = []
    for name, pat in pats:
        cnt = len(pat.findall(code))
        if cnt:
            hits.append("%s x%d" % (name, cnt))
            # first line numbers
            for m in list(pat.finditer(code))[:3]:
                ln = code.count("\n", 0, m.start()) + 1
                frag = code[max(0,m.start()-40):m.end()+20].replace("\n", " ")
                hits.append("    %s L%d: ...%s..." % (rel, ln, frag))
    if hits:
        g_all = False
        w("FAIL %s: %s" % (rel, "; ".join(hits)))
    else:
        w("PASS %s" % rel)
w("=> G " + ("PASS" if g_all else "FAIL"))

w()
w("=== H. 动态空间.html 结构 ===")
dpath = os.path.join(ROOT, "动态空间.html")
dtxt = io.open(dpath, "r", encoding="utf-8", errors="replace").read()
zero_tokens = ["xtmBgBtn", "xtmBgReset", "xtmBgFile", "xtmHeroMask", "xtm-hero-mask", "xtm-hero-btn", "我 → 头像 → 动态"]
h_all = True
for t in zero_tokens:
    n = dtxt.count(t)
    ok = (n == 0)
    h_all = h_all and ok
    w("%s 「%s」命中=%d" % ("PASS" if ok else "FAIL", t, n))
keep_tokens = [("xtm-listrow", 1), ("href=\"我的动态.html\"", None), ("我的动态", None)]
for t, exp in keep_tokens:
    n = dtxt.count(t)
    ok = n > 0 and (exp is None or n == exp)
    h_all = h_all and ok
    w("%s 保留项「%s」命中=%d" % ("PASS" if ok else "FAIL", t, n))
n_file_input = len(re.findall(r'type\s*=\s*["\']file["\']', dtxt))
ok = (n_file_input == 0)
h_all = h_all and ok
w("%s file input 命中=%d" % ("PASS" if ok else "FAIL", n_file_input))
w("=> H " + ("PASS" if h_all else "FAIL"))

w()
w("=== J. ai-config.js / ai-service.js 完整性 ===")
acfg = io.open(os.path.join(ROOT, "assets", "ai-config.js"), "r", encoding="utf-8", errors="replace").read()
j_all = True
for label, prefix in [("openrouter", "<REDACTED-OPENROUTER-旧KEY前缀>"), ("gemini", "<REDACTED-GEMINI-旧KEY前缀>Jv"), ("zhipu", "<REDACTED-ZHIPU-旧KEY前缀>")]:
    idx = acfg.find(prefix)
    cnt = acfg.count(prefix)
    ok = (idx >= 0 and cnt == 1)
    j_all = j_all and ok
    w("%s %s key(%s...) 命中=%d" % ("PASS" if ok else "FAIL", label, prefix, cnt))
for t in ["keyInQuery", "needVPN"]:
    n = acfg.count(t)
    ok = n > 0
    j_all = j_all and ok
    w("%s ai-config.js 「%s」命中=%d" % ("PASS" if ok else "FAIL", t, n))
# needVPN near gemini context
gi = acfg.find("<REDACTED-GEMINI-旧KEY前缀>Jv")
if gi >= 0:
    seg = acfg[max(0, gi-800):gi+800]
    w("gemini 附近含 keyInQuery=%s needVPN=%s" % ("keyInQuery" in seg, "needVPN" in seg))
asvc = io.open(os.path.join(ROOT, "assets", "ai-service.js"), "r", encoding="utf-8", errors="replace").read()
timeouts = [("TIMEOUT_FIRST_TOKEN", "15000"), ("TIMEOUT_RESPONSE", "30000"),
            ("TIMEOUT_TOTAL", "90000"), ("HEALTH_TIMEOUT", "5000"),
            ("PROXY_PROBE_TIMEOUT", "5000"), ("IMAGE_TIMEOUT", None)]
for name, val in timeouts:
    m = re.search(name + r"\s*=\s*(\d+)", asvc)
    if name == "IMAGE_TIMEOUT":
        ms = re.findall(r"IMAGE_TIMEOUT\w*\s*=\s*(\d+)", asvc)
        ok = ms == ["60000", "90000", "60000"]
        j_all = j_all and ok
        w("%s IMAGE_TIMEOUT 值=%s (期望 60000/90000/60000)" % ("PASS" if ok else "FAIL", ms))
    else:
        ok = (m is not None and m.group(1) == val)
        j_all = j_all and ok
        w("%s %s = %s (期望 %s)" % ("PASS" if ok else "FAIL", name, m.group(1) if m else "未找到", val))
w("=> J " + ("PASS" if j_all else "FAIL"))

io.open(OUT, "w", encoding="utf-8").write("\n".join(lines))
print("done")
