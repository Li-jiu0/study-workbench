# -*- coding: utf-8 -*-
"""R90 QA 块1 源码级侦察：M5 时间筛选 / 空态 / 重置按钮 / 闭包陷阱"""
import os, re
ROOT = r"D:\下载的文件\学习工作台"
p = os.path.join(ROOT, "assets", "xt-profile.js")
s = open(p, "r", encoding="utf-8", errors="replace").read()
lines = s.split("\n")

out = []
def show(a, b, label):
    out.append("===== %s  L%d-%d =====" % (label, a, b))
    for i in range(max(0, a - 1), min(len(lines), b)):
        out.append("%5d| %s" % (i + 1, lines[i].rstrip("\r")))
    out.append("")

# 1. m5ActiveFilterLabel
for name in ["m5ActiveFilterLabel", "m5PanelHtml", "function m5Bind", "m5Matches", "m5Filtered", "m5State", "xtpM5Range", "xtpM5ResetFilter", "xtpM5Kw", "xtpM5Tag", "xtpM5Fav", "m5ClearAll", "xtpM5ClearAll"]:
    hits = [i + 1 for i, l in enumerate(lines) if name in l]
    out.append("%-24s hits(lines): %s" % (name, hits[:30]))

out.append("")
out.append("=== 关键区域抽取 ===")
# 找 m5ActiveFilterLabel 定义
m = re.search(r"function\s+m5ActiveFilterLabel[\s\S]{0,1400}?\n\}", s)
if m:
    a = s[:m.start()].count("\n") + 1
    b = s[:m.end()].count("\n") + 1
    show(a, b, "m5ActiveFilterLabel")
m = re.search(r"function\s+m5PanelHtml[\s\S]{0,4000}?\n\}", s)
if m:
    a = s[:m.start()].count("\n") + 1
    b = s[:m.end()].count("\n") + 1
    show(a, b, "m5PanelHtml")

# 2. 过滤逻辑：搜索 d7 / 'd7' / range
out.append("=== range / d7 / d30 出现位置 ===")
for i, l in enumerate(lines):
    if re.search(r"['\"]d7['\"]|['\"]d30['\"]|['\"]all['\"]|range", l) and ("d7" in l or "d30" in l or "range" in l):
        out.append("%5d| %s" % (i + 1, l.rstrip("\r")[:180]))
out.append("")

# 3. 白名单选项
out.append("=== 白名单（#xtpM5Range 的 option）===")
for i, l in enumerate(lines):
    if "M5Range" in l or ("近 7 天" in l) or ("近7天" in l) or ("全部" in l and "option" in l):
        out.append("%5d| %s" % (i + 1, l.rstrip("\r")[:200]))
out.append("")

# 4. bind 区（含血泪注释 L2127 附近）
m = re.search(r"var\s+M5\s*=|window\.M5", s)
show(2110, 2230, "m5Bind 区域（含 L2127 注释）")

# 5. 清空全部 / toast
out.append("=== m5ClearAll / confirm / toast 文案 ===")
for i, l in enumerate(lines):
    if re.search(r"m5ClearAll|ai_chat_history|服务端|不受影响|仍保留|xtpM5ClearAll", l):
        out.append("%5d| %s" % (i + 1, l.rstrip("\r")[:200]))

txt = "\n".join(out)
open(os.path.join(ROOT, "tools", "qa", "r90_qa_m5src.out.txt"), "w", encoding="utf-8").write(txt)
print(txt)
