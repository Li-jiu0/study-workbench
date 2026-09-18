# -*- coding: utf-8 -*-
import os, re, io

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools/qa/_backbtn_survey.txt")
L = []
def w(s=""): L.append(s)

files = [f for f in sorted(os.listdir(ROOT))
         if f.lower().endswith(".html") and os.path.isfile(os.path.join(ROOT, f))]

# 排除明显的非功能页
SKIP = {"学习工作台-单文件版-20260908.html"}

# 返回按钮的判据
BACK_PATS = [
    ("morepage-back", r"morepage-back"),
    ("history.back", r"history\.back\(\)"),
    ("返回箭头实体", r"←"),
    ("page-back 类", r"class=\"[^\"]*(page-back|nav-back|back-btn|hdr-back)[^\"]*\""),
    ("onclick location 回退", r"onclick=\"[^\"]*location\.href='(学习工作台|更多|个人中心)\.html"),
]

rows = []
for f in files:
    if f in SKIP:
        continue
    t = io.open(os.path.join(ROOT, f), "r", encoding="utf-8", errors="replace").read()
    hits = {name: len(re.findall(p, t)) for name, p in BACK_PATS}
    has = sum(hits.values())
    rows.append((has, f, hits))

rows.sort()
w("=== 返回按钮覆盖率调查（live 根目录 %d 个 html）===" % len(rows))
w("判据：morepage-back / history.back() / ← / page-back类 / location 回退到工作台·更多·个人中心")
w("")
w("--- 【无返回按钮】%d 个 ---" % len([r for r in rows if r[0] == 0]))
for has, f, h in rows:
    if has == 0:
        w("  %s" % f)
w("")
w("--- 【已有返回按钮】%d 个 ---" % len([r for r in rows if r[0] > 0]))
for has, f, h in rows:
    if has > 0:
        det = ", ".join("%s x%d" % (k, v) for k, v in h.items() if v)
        w("  %-26s (%d) %s" % (f, has, det))

# 首页进度卡调查
w("")
w("=== 首页候选文件 ===")
for cand in ["index.html", "学习工作台.html", "home.html"]:
    p = os.path.join(ROOT, cand)
    w("  %-18s exists=%s" % (cand, os.path.exists(p)))

io.open(OUT, "w", encoding="utf-8").write("\n".join(L))
print("ok")
