# -*- coding: utf-8 -*-
import os, re, io

ROOT = r"D:\下载的文件\学习工作台"
ASSETS = os.path.join(ROOT, "assets")
TOOLS = os.path.join(ROOT, "tools")
BAKDIR = os.path.join(ROOT, "备份")

def is_live_root_html(name):
    if not name.endswith(".html"): return False
    if name.startswith("_"): return False
    if ".bak" in name.lower(): return False
    return True

def is_live_assets_js(name):
    if not name.endswith(".js"): return False
    if ".bak" in name.lower(): return False
    return True

def read_bytes(p):
    with open(p, "rb") as f: return f.read()

def read_text(p):
    with open(p, "rb") as f: b = f.read()
    for enc in ("utf-8-sig", "utf-8"):
        try: return b.decode(enc)
        except Exception: pass
    return b.decode("utf-8", "replace")

out = []
def log(s): out.append(s)

# ---------------- A. 死链扫描 ----------------
log("===== A. 死链扫描（动态.html / 朋友圈.html 引用应为 0）=====")
a_files = []
for n in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, n)
    if os.path.isfile(p) and is_live_root_html(n):
        a_files.append(p)
for n in sorted(os.listdir(ASSETS)):
    p = os.path.join(ASSETS, n)
    if os.path.isfile(p) and is_live_assets_js(n):
        a_files.append(p)
log("扫描活文件数: %d" % len(a_files))

hits_dongtai = []   # 动态.html 命中（排除 我的动态.html）
hits_pyq = []       # 朋友圈.html 命中（排除 朋友圈发布.html）
for p in a_files:
    try: t = read_text(p)
    except Exception as e:
        log("  [read err] %s %s" % (p, e)); continue
    # 动态.html
    for m in re.finditer(r"动态\.html", t):
        i = m.start()
        prev2 = t[i-2:i] if i >= 2 else ""
        if prev2 == "我的":
            continue
        ctx = t[max(0,i-12):i+10].replace("\n"," ")
        hits_dongtai.append((os.path.relpath(p, ROOT), ctx))
    # 朋友圈.html
    for m in re.finditer(r"朋友圈\.html", t):
        i = m.start()
        nxt3 = t[i+4:i+7] if i+7 <= len(t) else ""
        if nxt3 == "发布":   # 朋友圈发布.html 合法
            continue
        ctx = t[max(0,i-12):i+10].replace("\n"," ")
        hits_pyq.append((os.path.relpath(p, ROOT), ctx))

log("动态.html 非法引用命中(排除我的动态.html): %d" % len(hits_dongtai))
for f, c in hits_dongtai: log("  FAIL %s ...%s" % (f, c))
log("朋友圈.html 非法引用命中(排除朋友圈发布.html): %d" % len(hits_pyq))
for f, c in hits_pyq: log("  FAIL %s ...%s" % (f, c))
A_pass = (len(hits_dongtai) == 0 and len(hits_pyq) == 0)
log("A => %s" % ("PASS" if A_pass else "FAIL"))

# ---------------- B. 文件存在性 ----------------
log("\n===== B. 文件存在性 =====")
B_targets = {
    "动态空间.html": True,
    "朋友圈.html": False,
    "动态.html": False,
    "我的动态.html": True,
    "朋友圈发布.html": True,
}
B_pass = True
for name, should_exist in B_targets.items():
    p = os.path.join(ROOT, name)
    exists = os.path.isfile(p)
    ok = (exists == should_exist)
    B_pass = B_pass and ok
    log("  %s : exists=%s (期望%s) => %s" % (name, exists, "存在" if should_exist else "不存在", "OK" if ok else "FAIL"))
log("B => %s" % ("PASS" if B_pass else "FAIL"))

# ---------------- C. app.js 路由 + PAGE_FILES + 665 行长行 ----------------
log("\n===== C. app.js 路由/键/超长行 =====")
appjs = os.path.join(ASSETS, "app.js")
C_pass = True
if not os.path.isfile(appjs):
    log("  app.js 不存在 FAIL"); C_pass = False
else:
    t = read_text(appjs)
    m1 = t.count("moments: '动态空间.html'")
    log("  moments: '动态空间.html' 出现次数 = %d (期望 1) %s" % (m1, "OK" if m1 == 1 else "FAIL"))
    if m1 != 1: C_pass = False
    # 旧引用应消失
    for bad in ["moments: '朋友圈.html'", "moments: '动态.html'"]:
        if bad in t:
            log("  FAIL 残留旧路由: %s" % bad); C_pass = False
        else:
            log("  旧路由已无残留: %s OK" % bad)

    # PAGE_FILES 键集合对比（当前 vs app.js.bak-pre-r74-20260917）
    def extract_keys(txt):
        m = re.search(r"PAGE_FILES\s*=\s*\{(.*?)\n\s*\}", txt, re.S)
        if not m: return None
        body = m.group(1)
        keys = re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s*:", body)
        return keys
    cur_keys = extract_keys(t)
    if cur_keys is None:
        log("  FAIL 未定位 PAGE_FILES 对象"); C_pass = False
        cur_keys = []
    else:
        log("  当前 PAGE_FILES 键数 = %d" % len(cur_keys))
        log("  当前键: %s" % ", ".join(cur_keys))
        bak = os.path.join(ASSETS, "app.js.bak-pre-r74-20260917")
        if os.path.isfile(bak):
            bk = read_text(bak)
            bk_keys = extract_keys(bk)
            if bk_keys:
                curset, bkset = set(cur_keys), set(bk_keys)
                lost = bkset - curset
                added = curset - bkset
                log("  pre-r74 键数 = %d" % len(bk_keys))
                log("  丢失键(应=0): %s" % (", ".join(sorted(lost)) or "无"))
                log("  新增键: %s" % (", ".join(sorted(added)) or "无"))
                if lost:
                    log("  FAIL E1 护栏被突破: 丢失键 %s" % lost); C_pass = False
                if "moments" not in curset:
                    log("  FAIL moments 键缺失"); C_pass = False
            else:
                log("  (pre-r74 未定位 PAGE_FILES，跳过 E1 对比)")
        else:
            log("  (pre-r74 备份不存在，跳过 E1 对比)")

    # 第 665 行超长行字节长度对比
    b = read_bytes(appjs)
    lines = b.split(b"\n")
    log("  app.js 总行数 = %d" % len(lines))
    if len(lines) >= 665:
        line665 = lines[664]
        cur_len = len(line665)
        log("  当前第665行字节长 = %d" % cur_len)
        for bakname in ["app.js.bak-pre-r74-20260917", "app.js.bak-pre-r73-20260917", "app.js.backup_20260914"]:
            bp = os.path.join(ASSETS, bakname)
            if os.path.isfile(bp):
                bl = read_bytes(bp).split(b"\n")
                if len(bl) >= 665:
                    log("  %s 第665行字节长 = %d %s" % (bakname, len(bl[664]), "OK一致" if len(bl[664])==cur_len else "DIFF不一致"))
                    if len(bl[664]) != cur_len: C_pass = False
                else:
                    log("  %s 行数不足665(%d)" % (bakname, len(bl)))
    else:
        log("  FAIL 当前 app.js 行数不足665"); C_pass = False
log("C => %s" % ("PASS" if C_pass else "FAIL"))

# ---------------- D. 侧栏计数 ----------------
log("\n===== D. 侧栏 data-page=\"moments\" 计数 =====")
D_pass = True
total_pages = 0
total_hits = 0
bad = []
for n in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, n)
    if os.path.isfile(p) and is_live_root_html(n):
        t = read_text(p)
        c = t.count('data-page="moments"')
        if c > 0:
            total_pages += 1
            total_hits += c
            if c != 1:
                bad.append((n, c)); D_pass = False
log("含 data-page=moments 的页面数 = %d, 总命中数 = %d" % (total_pages, total_hits))
if bad:
    for n, c in bad: log("  FAIL %s 命中 %d 次(应=1)" % (n, c))
log("每页均恰1处? %s ; 页数==命中数? %s" % (not bad, total_pages==total_hits))
if total_pages != total_hits: D_pass = False
log("D => %s (基线35/35，实际%d/%d)" % ("PASS" if D_pass else "FAIL", total_pages, total_hits))

# ---------------- F. 行尾 ----------------
log("\n===== F. 行尾检查 =====")
F_pass = True
# CRLF 必须文件：所有活 root html + 指定 assets
crlf_required = []
for n in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, n)
    if os.path.isfile(p) and is_live_root_html(n):
        crlf_required.append(p)
for n in ["xt-moments.js","xt-moments.css","xt-profile.js","xt-profile.css","api.js","chat-local.js","app.js"]:
    p = os.path.join(ASSETS, n)
    if os.path.isfile(p): crlf_required.append(p)
lf_required = [os.path.join(ASSETS, "ai-page.js")]
def bare_lf(b):
    return b"\n" in b.replace(b"\r\n", b"")
for p in crlf_required:
    b = read_bytes(p)
    if bare_lf(b):
        log("  FAIL(CRLF) 含裸LF: %s" % os.path.relpath(p, ROOT)); F_pass = False
    else:
        log("  OK(CRLF) %s" % os.path.relpath(p, ROOT))
for p in lf_required:
    if os.path.isfile(p):
        b = read_bytes(p)
        if b"\r" in b:
            log("  FAIL(LF) 含CR: %s" % os.path.relpath(p, ROOT)); F_pass = False
        else:
            log("  OK(LF) %s" % os.path.relpath(p, ROOT))
    else:
        log("  FAIL ai-page.js 不存在"); F_pass = False
log("F => %s" % ("PASS" if F_pass else "FAIL"))

# ---------------- G. ES2017 禁令 ----------------
log("\n===== G. ES2017 语法禁令(活代码) =====")
# 简易注释剥离状态机
def strip_comments(src):
    out = []
    i, n = 0, len(src)
    st = 0  # 0 normal, 1 line, 2 block, 3 sq, 4 dq, 5 bq
    while i < n:
        c = src[i]; nxt = src[i+1] if i+1 < n else ""
        if st == 0:
            if c == "/" and nxt == "/":
                st = 1; i += 2; continue
            if c == "/" and nxt == "*":
                st = 2; i += 2; continue
            if c == "'": st = 3
            elif c == '"': st = 4
            elif c == "`": st = 5
        elif st == 1:
            if c == "\n": st = 0
        elif st == 2:
            if c == "*" and nxt == "/":
                st = 0; i += 2; continue
        elif st == 3:
            if c == "\\": i += 2; continue
            if c == "'": st = 0
        elif st == 4:
            if c == "\\": i += 2; continue
            if c == '"': st = 0
        elif st == 5:
            if c == "\\": i += 2; continue
            if c == "`": st = 0
        # 注释态(1=行注释 2=块注释)不保留内容；代码/字符串态保留
        if st in (0, 3, 4, 5):
            out.append(c)
        i += 1
    return "".join(out)

patterns = ["?.", "??", ".replaceAll(", "Object.fromEntries", ".at("]
G_pass = True
for n in ["xt-moments.js","xt-profile.js","api.js","chat-local.js","ai-page.js"]:
    p = os.path.join(ASSETS, n)
    if not os.path.isfile(p):
        log("  FAIL 缺失 %s" % n); G_pass = False; continue
    code = strip_comments(read_text(p))
    found = {}
    for pat in patterns:
        cnt = code.count(pat)
        if cnt: found[pat] = cnt
    if found:
        G_pass = False
        log("  FAIL %s 命中: %s" % (n, ", ".join("%s x%d" % (k,v) for k,v in found.items())))
    else:
        log("  OK %s 5项0命中" % n)
log("G => %s" % ("PASS" if G_pass else "FAIL"))

# ---------------- H. 动态空间页结构 ----------------
log("\n===== H. 动态空间.html 结构断言 =====")
H_pass = True
dt = os.path.join(ROOT, "动态空间.html")
if not os.path.isfile(dt):
    log("  FAIL 动态空间.html 不存在"); H_pass = False
else:
    t = read_text(dt)
    dead = ["xtmBgBtn","xtmBgReset","xtmBgFile","xtmHeroMask","xtm-hero-mask","xtm-hero-btn"]
    for tok in dead:
        c = t.count(tok)
        if c:
            log("  FAIL 残留 %s x%d" % (tok, c)); H_pass = False
        else:
            log("  OK 已删除 %s" % tok)
    # 保留项
    if "xtm-listrow" in t:
        log("  OK 保留 xtm-listrow"); 
    else:
        log("  FAIL 丢失 xtm-listrow"); H_pass = False
    if "我的动态.html" in t:
        log("  OK 保留 href=我的动态.html")
    else:
        log("  FAIL 丢失 href=我的动态.html"); H_pass = False
    if "type=\"file\"" in t or 'type="file"' in t or "type='file'" in t:
        log("  FAIL 仍存在 file input"); H_pass = False
    else:
        log("  OK 无 file input")
log("H => %s" % ("PASS" if H_pass else "FAIL"))

# 汇总
log("\n========== 汇总 ==========")
log("A:%s B:%s C:%s D:%s F:%s G:%s H:%s" % (
    "PASS" if A_pass else "FAIL", "PASS" if B_pass else "FAIL",
    "PASS" if C_pass else "FAIL", "PASS" if D_pass else "FAIL",
    "PASS" if F_pass else "FAIL", "PASS" if G_pass else "FAIL",
    "PASS" if H_pass else "FAIL"))

report = "\n".join(out)
with io.open(os.path.join(TOOLS, "_qa_report.txt"), "w", encoding="utf-8") as f:
    f.write(report)
print(report)
