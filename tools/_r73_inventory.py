# -*- coding: utf-8 -*-
import os, re, json

ROOT = r"D:\下载的文件\学习工作台"
out = []

# 1. root html
htmls = sorted([f for f in os.listdir(ROOT) if f.lower().endswith(".html")])
out.append("=== 根目录 HTML (%d) ===" % len(htmls))
out.append(" | ".join(htmls))

# 2. brand counts
brand = {"星途": 0, "星图": 0, "学习工作台": 0}
files_with = {"星途": [], "星图": [], "学习工作台": []}
targets = htmls + [os.path.join("assets", f) for f in os.listdir(os.path.join(ROOT, "assets")) if f.endswith(".js")]
for rel in targets:
    p = os.path.join(ROOT, rel)
    try:
        t = open(p, "rb").read().decode("utf-8", "replace")
    except Exception:
        continue
    for k in brand:
        n = t.count(k)
        if n:
            brand[k] += n
            files_with[k].append((rel, n))

out.append("\n=== 品牌词命中统计 ===")
for k, v in brand.items():
    out.append("%s: %d 次, 命中文件 %d 个" % (k, v, len(files_with[k])))
out.append("\n--- 星图 命中明细 ---")
out.append("\n".join("  %-32s %d" % (a, b) for a, b in sorted(files_with["星图"], key=lambda x: -x[1])))
out.append("\n--- 星途 命中文件数 top20 ---")
out.append("\n".join("  %-32s %d" % (a, b) for a, b in sorted(files_with["星途"], key=lambda x: -x[1])[:20]))
out.append("\n--- 学习工作台 命中明细 ---")
out.append("\n".join("  %-32s %d" % (a, b) for a, b in sorted(files_with["学习工作台"], key=lambda x: -x[1])))

# 3. key files existence
out.append("\n=== 关键文件存在性 ===")
keys = ["动态.html", "社区.html", "个人中心.html", "关于.html", "更多.html",
        "首页.html", "index.html", "设置.html", "导入题库.html", "互动.html",
        "私聊.html", "好友.html", "我的文件.html", "登录.html", "个人资料.html",
        "朋友圈.html", "动态空间.html", "赞助.html"]
for k in keys:
    out.append("  %-16s %s" % (k, "YES" if os.path.exists(os.path.join(ROOT, k)) else "-"))

# 4. assets js inventory
ajs = sorted([f for f in os.listdir(os.path.join(ROOT, "assets")) if f.endswith(".js")])
out.append("\n=== assets/*.js (%d) ===" % len(ajs))
out.append(" | ".join(ajs))

# 5. android
out.append("\n=== android/ ===")
ad = os.path.join(ROOT, "android")
if os.path.isdir(ad):
    for dirpath, dirnames, filenames in os.walk(ad):
        dirnames[:] = [d for d in dirnames if d not in (".gradle", "build", ".idea")]
        rel = os.path.relpath(dirpath, ROOT)
        for f in sorted(filenames):
            out.append("  " + os.path.join(rel, f))
else:
    out.append("  (missing)")

open(os.path.join(ROOT, "tools", "_r73_inventory.txt"), "w", encoding="utf-8").write("\n".join(out))
print("OK")
