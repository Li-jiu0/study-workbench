# -*- coding: utf-8 -*-
"""R90 QA 块3/块4 静态扫描"""
import os, re
ROOT = r"D:\下载的文件\学习工作台"
def P(r): return os.path.join(ROOT, r.replace("/", os.sep))
def read(r): return open(P(r), "r", encoding="utf-8", errors="replace").read()

out = []

# ===================== 块 3 =====================
out.append("#" * 76)
out.append("# 块3：朋友圈定位改「跳转整页」 —— assets/xt-moments.js + 朋友圈发布.html")
out.append("#" * 76)
mjs = read("assets/xt-moments.js")
mlines = mjs.split("\n")
fb = read("朋友圈发布.html")

out.append("")
out.append("=== xtmLocBtn / xtmAtBtn / openPicker / 地区选择.html 出现位置 ===")
for i, l in enumerate(mlines):
    if re.search(r"xtmLocBtn|xtmAtBtn|地区选择|openPicker|back=|cur=|pickRegion|xt_region_pick", l):
        out.append("%5d| %s" % (i + 1, l.rstrip("\r")[:220]))

out.append("")
out.append("=== 地区选择.html goBack() 实现 ===")
reg = read("地区选择.html")
rlines = reg.split("\n")
for i, l in enumerate(rlines):
    if re.search(r"goBack|back|个人中心|location\.href|searchParams|URLSearchParams|xt_region_pick", l):
        out.append("%5d| %s" % (i + 1, l.rstrip("\r")[:220]))

out.append("")
out.append("=== 朋友圈发布.html 特征计数 ===")
out.append("bytes=%d" % len(fb.encode("utf-8")))
out.append("xtmFileImg=%d  xtmFileVid=%d" % (fb.count("xtmFileImg"), fb.count("xtmFileVid")))
for i, l in enumerate(fb.split("\n")):
    if re.search(r"xtmLocBtn|xtmAtBtn|xtmFileImg|xtmFileVid|<button", l):
        out.append("%5d| %s" % (i + 1, l.rstrip("\r")[:200]))

# ===================== 块 4 =====================
out.append("")
out.append("#" * 76)
out.append("# 块4：用量页文案精简 + 清空按钮改展开收缩 —— assets/xt-aiusage.js")
out.append("#" * 76)
au = read("assets/xt-aiusage.js")
aul = au.split("\n")

OLD_STRINGS = [
    ("本机记录 × 服务端累计 · 按今日次数 / 最近时间 / 名称排序", "应已删除 (原 L861)"),
    ("账号级共享额度，非本机", "应已删除 (原 L856)"),
    ("逐模型一行，不聚合；排序 / 高亮 / 筛选一律以「剩余可用量」为准（A 口径）", "应已删除 (原 L891)"),
    ("排序方式（剩余可用量口径）", "应改为「排序方式」(原 L892)"),
    ("筛选（按剩余可用量）", "应改为「筛选」(原 L900)"),
]
out.append("")
out.append("=== 旧文案精确命中（0 = 已删）===")
for s, note in OLD_STRINGS:
    n = au.count(s)
    lines = [i + 1 for i, l in enumerate(aul) if s in l]
    out.append("  命中=%d  行=%s   %s" % (n, lines, note))
    out.append("      %r" % s)

out.append("")
out.append('=== 新文案「排序方式」全部出现位置（防误判 L873）===')
for i, l in enumerate(aul):
    if "排序方式" in l:
        out.append("%5d| %s" % (i + 1, l.rstrip("\r")[:220]))
out.append('')
out.append('=== 新文案「筛选」全部出现位置 ===')
for i, l in enumerate(aul):
    if "筛选" in l:
        out.append("%5d| %s" % (i + 1, l.rstrip("\r")[:220]))

out.append("")
out.append("=== 关键 id 保全 ===")
IDS = ["UsageClearBtn", "UsageClearTxt", "UsageEmpty", "UsageModelList", "UsageQuotaSortBar",
       "UsageQuotaFilterBar", "UsageDetailList", "UsageExportBtn", "UsageRangeBar", "UsageSortBar"]
for i in IDS:
    n = au.count(i)
    lines = [j + 1 for j, l in enumerate(aul) if i in l]
    out.append("  %-22s 出现 %-3d 行=%s" % (i, n, lines[:14]))

out.append("")
out.append("=== bindClear / disarmClear / skeleton 实现 ===")
for name in ["function bindClear", "function disarmClear", "function skeleton", "UsageClearBtn", "UsageClearTxt", "xt-us-hint"]:
    hits = [i + 1 for i, l in enumerate(aul) if name in l]
    out.append("  %-22s 行=%s" % (name, hits[:20]))

out.append("")
out.append("=== 折叠区相关（展开/收缩）===")
for i, l in enumerate(aul):
    if re.search(r"折叠|展开|收起|collapse|expand|isOpen|clearOpen|aria-expanded|details|summary", l):
        out.append("%5d| %s" % (i + 1, l.rstrip("\r")[:220]))

out.append("")
out.append("=== .xt-us-hint 剩余命中（应仅注释或 0）===")
for i, l in enumerate(aul):
    if "xt-us-hint" in l:
        out.append("%5d| %s" % (i + 1, l.rstrip("\r")[:220]))

txt = "\n".join(out)
open(P("tools/qa/r90_qa_b34_static.out.txt"), "w", encoding="utf-8").write(txt)
print(txt)
