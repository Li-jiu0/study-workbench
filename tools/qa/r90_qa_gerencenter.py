# -*- coding: utf-8 -*-
"""核查 个人中心.html 的 style/head 配对是否真缺失（排除正则误判）"""
import os, re
ROOT = r"D:\下载的文件\学习工作台"
p = os.path.join(ROOT, "个人中心.html")
s = open(p, "r", encoding="utf-8", errors="replace").read()

out = []
out.append("=== 个人中心.html 逐一列出 style/head 标签位置 ===")
for m in re.finditer(r"<style[\s>][^>]*>", s):
    ln = s[:m.start()].count("\n") + 1
    out.append("  <style...> L%-6d %s" % (ln, m.group(0)[:80]))
for m in re.finditer(r"</style\s*>", s):
    ln = s[:m.start()].count("\n") + 1
    out.append("  </style>    L%-6d" % ln)
out.append("  <head> 出现: %r" % re.findall(r"<head[\s>][^>]*>", s))
out.append("  </head> 出现: %r" % re.findall(r"</head\s*>", s))
out.append("  head 相关(大小写不敏感): %r" % [x for x in re.findall(r"</?head[^>]*>", s, re.I)])

# 每对 style 的闭合情况：按出现顺序交错检查
toks = []
for m in re.finditer(r"<style[\s>][^>]*>|</style\s*>", s):
    toks.append((m.start(), "open" if m.group(0).lower().startswith("<style") else "close", m.group(0)[:60]))
out.append("")
out.append("=== style 标签交错序列 ===")
depth = 0
for pos, kind, txt in toks:
    ln = s[:pos].count("\n") + 1
    if kind == "open":
        depth += 1
        out.append("  L%-6d OPEN  depth=%d  %s" % (ln, depth, txt))
    else:
        depth -= 1
        out.append("  L%-6d CLOSE depth=%d" % (ln, depth))
out.append("  final depth = %d  (0 = 配对)" % depth)

# 全文搜索可能的 </style 变体
out.append("")
out.append("=== 宽松搜索 </style 任何形式 ===")
for m in re.finditer(r"</style[^\n]{0,20}", s, re.I):
    ln = s[:m.start()].count("\n") + 1
    out.append("  L%-6d %r" % (ln, m.group(0)))

txt = "\n".join(out)
open(os.path.join(ROOT, "tools", "qa", "r90_qa_gerencenter.out.txt"), "w", encoding="utf-8").write(txt)
print(txt)
