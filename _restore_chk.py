# -*- coding: utf-8 -*-
import os, re, io, json

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools/qa/_restore_check.txt")
P = "个人中心.html"
t = io.open(os.path.join(ROOT, P), "r", encoding="utf-8", errors="replace").read()
L = []
def w(s=""): L.append(s)

# 1. 卡片清单
cards = re.findall(
    r'subpage-group-card"[^>]*onclick="SubpageRouter\.navigate\(\'([^\']+)\'\)"[\s\S]{0,300}?sgc-title">([^<]+)<', t)
w("=== 1. 卡片清单（应为 4 张：个人资料/发贴统计/我的动态/学习偏好）===")
w("  count = %d" % len(cards))
for k, ti in cards:
    w("     %-12s | %s" % (k, ti))

# 2. 关键 id 存活
w("")
w("=== 2. 底层 DOM 存活检查 ===")
for kw in ['id="profileBoxPostsHost"', 'id="localStats"',
           'data-subpage="posts"', 'data-subpage="local-data"',
           "SubpageRouter.navigate('posts')", "SubpageRouter.navigate('local-data')"]:
    w("  %-40s x%d" % (kw, len(re.findall(re.escape(kw), t))))

# 3. 配对
w("")
w("=== 3. 配对校验 ===")
pairs = [("注释", r"<!--", r"-->"), ("div", r"<div\b", r"</div"),
         ("script", r"<script\b", r"</script"), ("section", r"<section\b", r"</section")]
# style 单独处理：排除 JS 注释里的字面量
real_open = len([m for m in re.finditer(r"<style\b", t)])
real_close = t.count("</style")
for name, o, c in pairs:
    a, b = len(re.findall(o, t)), len(re.findall(c, t))
    w("  %-8s %d / %d  %s" % (name, a, b, "OK" if a == b else "FAIL"))
w("  %-8s %d / %d  (含注释字面量，真实标签应差 2 个注释)" % ("style", real_open, real_close))

# 4. 禁用语法
w("")
w("=== 4. 禁用语法 Grep ===")
ban = [r"\?\.", r"\?\?", r"replaceAll\s*\(", r"Object\.fromEntries", r"\.at\s*\(", r"\(\?<=", r"\(\?<!"]
tot = 0
for b in ban:
    n = len(re.findall(b, t))
    tot += n
    w("  %-24s x%d" % (b, n))
w("  TOTAL = %d %s" % (tot, "OK" if tot == 0 else "!! NEED REVIEW"))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, "w", encoding="utf-8").write("\n".join(L))
print("ok")
