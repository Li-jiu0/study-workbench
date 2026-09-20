# -*- coding: utf-8 -*-
"""R138 v1.32 发版 · 第1步：版本号三处同步 + 改动资产的全站引用戳 bump（二进制、属性锚定、含自检）。

规则来源：study-workbench-deploy skill §2.0 / §2.1 / §5.0 / §5.0.2 / §8.1.1
- 只 bump「本批内容真改过」的资产：app.js / ai-service.js / ai-page.js / common.css
- 新戳字母不得复用已上过生产的：上一版为 20260920d -> 本次 20260920e
- 豁免名单（跨批次约定，不碰）：AI模拟面试.html / PPT素材库.html / 四级经验分享.html / 好友申请.html / 登录.html
- 全程二进制读写，行尾逐字节不变
"""
import io, json, os, re, glob, sys

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "_r138_bump_out.txt")
NEW_STAMP = "20260920e"
NEW_VER = "1.32"
NEW_CODE = 33
OLD_VER = "1.31"
OLD_CODE = 32
TARGETS = ["app.js", "ai-service.js", "ai-page.js", "common.css"]
KEEP_OLD = {"AI模拟面试.html", "PPT素材库.html", "四级经验分享.html", "好友申请.html", "登录.html"}

LOG = []
def log(s=""):
    LOG.append(str(s))

# ---------------- 1) 版本号三处同步 ----------------
# 1a) server/routers/version.json
vp = os.path.join(ROOT, "server", "routers", "version.json")
raw = io.open(vp, encoding="utf-8").read()
data = json.loads(raw)
log("version.json 原: version=%s code=%s apk=%s" % (data.get("version"), data.get("versionCode"), data.get("apkFileName")))
NEW_NOTES = [
    "修复：首页卡片长标题溢出、挤压错位的问题",
    "修复：AI / 个人中心 / 更多 页面的「通讯录」入口点击无反应",
    "修复：App 顶部状态栏黑边，改为沉浸式 —— 顶栏背景延伸到状态栏、内容自动避让",
    "修复：行测题库「常识判断」「判断推理」等题型筛选漏题、部分题型筛不到的问题（现覆盖全部题量）",
    "修复：AI 图片识别的报错问题，模型切换提示更准确、响应慢时自动切换",
    "优化：AI 请求超时与限流处理，回答更稳定",
]
data["version"] = NEW_VER
data["versionCode"] = NEW_CODE
data["apkFileName"] = "星途-%s.apk" % NEW_VER
data["notes"] = NEW_NOTES
ch = data.get("changelog") or []
ch = [c for c in ch if c.get("version") != "v" + NEW_VER]
ch.insert(0, {"version": "v" + NEW_VER, "date": "2026-09-20", "notes": NEW_NOTES})
data["changelog"] = ch
data["publishedAt"] = "2026-09-20T12:10:00+08:00"
io.open(vp, "w", encoding="utf-8", newline="\n").write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
log("version.json 新: version=%s code=%s apk=%s notes=%d changelog=%d" % (
    data["version"], data["versionCode"], data["apkFileName"], len(NEW_NOTES), len(ch)))

# 1b) assets/xt-update.js
up = os.path.join(ROOT, "assets", "xt-update.js")
with open(up, "rb") as f:
    b = f.read()
b2, n1 = re.subn(rb"CURRENT_VERSION = '" + OLD_VER.encode() + rb"'", b"CURRENT_VERSION = '" + NEW_VER.encode() + b"'", b)
with open(up, "wb") as f:
    f.write(b2)
log("xt-update.js CURRENT_VERSION 替换 %d 处" % n1)

# 1c) android/AndroidManifest.xml
mf = os.path.join(ROOT, "android", "AndroidManifest.xml")
with open(mf, "rb") as f:
    b = f.read()
b3, n2 = re.subn(rb'android:versionCode="%d"' % OLD_CODE, b'android:versionCode="%d"' % NEW_CODE, b)
b3, n3 = re.subn(rb'android:versionName="' + OLD_VER.encode() + rb'"', b'android:versionName="' + NEW_VER.encode() + b'"', b3)
with open(mf, "wb") as f:
    f.write(b3)
log("AndroidManifest versionCode 替换 %d 处 / versionName 替换 %d 处" % (n2, n3))

# ---------------- 2) 全站引用戳 bump（属性锚定 + 二进制） ----------------
def attr_pat(name):
    return re.compile(rb'((?:src|href)\s*=\s*["\'])assets/' + re.escape(name.encode()) +
                      rb'(\?v=[0-9A-Za-z_\-\.]+)?(["\'])', re.IGNORECASE)

pats = {t: attr_pat(t) for t in TARGETS}
hit = {t: 0 for t in TARGETS}
files_touched = []
pages = sorted(glob.glob(os.path.join(ROOT, "*.html")))
for p in pages:
    name = os.path.basename(p)
    if ".bak" in name.lower() or name.startswith("_"):
        continue
    if name in KEEP_OLD:
        log("跳过豁免页: %s" % name)
        continue
    with open(p, "rb") as f:
        raw = f.read()
    orig = raw
    for t in TARGETS:
        def repl(m):
            hit[t] += 1
            return m.group(1) + b"assets/" + t.encode() + b"?v=" + NEW_STAMP.encode() + m.group(3)
        raw = pats[t].sub(repl, raw)
    if raw != orig:
        with open(p, "wb") as f:
            f.write(raw)
        files_touched.append(name)
log("引用戳 bump 命中: %s" % hit)
log("被改页面数: %d" % len(files_touched))

# ---------------- 3) 自检 ----------------
log("")
log("=== 自检 ===")
bad = []
# 3a) 行尾守恒（HTML 应全为 CRLF，除既有 LF 页）
for p in pages:
    name = os.path.basename(p)
    if ".bak" in name.lower() or name.startswith("_"):
        continue
    with open(p, "rb") as f:
        b = f.read()
    lone = b.count(b"\n") - b.count(b"\r\n")
    if lone:
        bad.append("%s loneLF=%d" % (name, lone))
log("行尾异常页（含既有 LF 页，属正常）: %d -> %s" % (len(bad), bad[:6]))

# 3b) 双后缀 / 损坏签名
for p in pages:
    name = os.path.basename(p)
    if ".bak" in name.lower() or name.startswith("_"):
        continue
    with open(p, "rb") as f:
        t = f.read().decode("utf-8", "ignore")
    if ".js.js?v=" in t or ".css.css?v=" in t:
        log("!!! 双后缀污染: %s" % name)
    for m in re.finditer(r'assets/[A-Za-z0-9_.\-]+\.(?:js|css)\?v=[0-9A-Za-z]+', t):
        s = max(0, m.start() - 40)
        seg = t[s:m.start()]
        if not re.search(r'(?:src|href)\s*=\s*["\']$', seg):
            log("!!! 非属性位置命中: %s -> %s" % (name, t[s:m.end()]))

# 3c) 终态戳分布（独立 pattern 复验，每资产只应有 1 个键）
log("")
for t in TARGETS:
    p2 = re.compile(re.escape(t) + r'\?v=([0-9A-Za-z]+)')
    dist = {}
    for p in pages:
        name = os.path.basename(p)
        if ".bak" in name.lower() or name.startswith("_"):
            continue
        txt = io.open(p, encoding="utf-8", errors="ignore").read()
        for v in p2.findall(txt):
            dist[v] = dist.get(v, 0) + 1
    log("%-16s 戳分布 %s" % (t, dist))

io.open(OUT, "w", encoding="utf-8").write("\n".join(LOG) + "\n")
print("DONE")
