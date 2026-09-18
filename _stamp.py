# -*- coding: utf-8 -*-
import os, re, io

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools/qa/_stamp_report.txt")

NEW = "20260915f"

# 按技能文档：这 5 个页面不加载 app.js，必须保持旧版本号，整文件跳过
KEEP_OLD = {"AI模拟面试.html", "PPT素材库.html", "四级经验分享.html", "好友申请.html", "登录.html"}
# blog_wechat.html 是废弃草稿且未引用，排除出部署/改戳范围
SKIP_ALL = {"blog_wechat.html"}

TARGETS = ["app.js", "api.js"]
pat_tpl = r"(assets/%s\?v=)([0-9A-Za-z]+)"

L = []
def w(s=""): L.append(s)

changed_files = []
before_buckets = {}
after_buckets = {}

for fn in sorted(os.listdir(ROOT)):
    if not fn.lower().endswith(".html"):
        continue
    fp = os.path.join(ROOT, fn)
    if not os.path.isfile(fp):
        continue
    if fn in KEEP_OLD:
        w("[SKIP-KEEPOLD] %s" % fn)
        continue
    if fn in SKIP_ALL:
        w("[SKIP-DRAFT ] %s" % fn)
        continue

    txt = io.open(fp, "r", encoding="utf-8", errors="replace").read()
    lines = txt.split("\n")
    new_lines = []
    n_changes = 0
    for ln in lines:
        # 只处理真正含 <script src= 或 <link href= 的行，避免注释被误改
        if "<script src=" not in ln and "<link href=" not in ln:
            new_lines.append(ln)
            continue
        orig = ln
        for t in TARGETS:
            pat = re.compile(pat_tpl % re.escape(t))
            def rep(m):
                before_buckets.setdefault(t + ":" + m.group(2), []).append(fn)
                return m.group(1) + NEW
            ln = pat.sub(rep, ln)
            m2 = pat.search(ln)
            if m2:
                after_buckets.setdefault(t + ":" + m2.group(2), []).append(fn)
        if ln != orig:
            n_changes += 1
        new_lines.append(ln)

    if n_changes:
        io.open(fp, "w", encoding="utf-8", newline="").write("\n".join(new_lines))
        changed_files.append((fn, n_changes))
        w("[BUMP] %-26s %d 行 -> %s" % (fn, n_changes, NEW))

w("")
w("=== 改动文件合计：%d 个 ===" % len(changed_files))
w("")
w("=== 改前分布 ===")
for k in sorted(before_buckets):
    w("  %-24s x%d" % (k, len(set(before_buckets[k]))))
w("")
w("=== 改后分布 ===")
for k in sorted(after_buckets):
    w("  %-24s x%d" % (k, len(set(after_buckets[k]))))

# ---- 自检：损坏签名 / 配对 ----
w("")
w("=== 自检 ===")
bad_sig = 0
bad_pair = []
for fn in sorted(os.listdir(ROOT)):
    if not fn.lower().endswith(".html"):
        continue
    fp = os.path.join(ROOT, fn)
    if not os.path.isfile(fp):
        continue
    txt = io.open(fp, "r", encoding="utf-8", errors="replace").read()
    # 损坏签名：?v=xxx" 后紧跟非 > 字符
    for m in re.finditer(r'\.js\?v=[0-9A-Za-z]+"[^>]', txt):
        bad_sig += 1
    # 注释配对
    if txt.count("<!--") != txt.count("-->"):
        bad_pair.append(fn + " 注释")
    if len(re.findall(r"<div\b", txt)) != len(re.findall(r"</div", txt)):
        bad_pair.append(fn + " div")
    if len(re.findall(r"<style\b", txt)) != txt.count("</style"):
        bad_pair.append(fn + " style")
    if len(re.findall(r"<script\b", txt)) != txt.count("</script"):
        bad_pair.append(fn + " script")

w("  损坏签名命中 = %d  (必须 0)" % bad_sig)
if bad_pair:
    w("  [FAIL] 配对失衡：")
    for b in bad_pair[:30]:
        w("     " + b)
else:
    w("  配对校验：全部平衡")
w("  （注：历史存量文件中 <style> 可能出现在 JS 注释文本里，会造成 style 计数虚高，此处已列出具体文件名）")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, "w", encoding="utf-8").write("\n".join(L))
print("bumped %d files" % len(changed_files))
