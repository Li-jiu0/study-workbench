# -*- coding: utf-8 -*-
"""QA 独立检查：全站 .html 版本令牌盘点 + 被改 HTML 标签配平 + 活跃页引用检查。"""
import os, re, json, sys

ROOT = os.path.dirname(os.path.abspath(__file__))  # tools/qa/
ROOT = os.path.dirname(os.path.dirname(ROOT))      # repo root
os.chdir(ROOT)

# 1) 所有 .html 的版本令牌
ver_re = re.compile(r'\?(v=[0-9A-Za-z._]+)')
results = {}
for fn in os.listdir('.'):
    if not fn.endswith('.html'):
        continue
    with open(fn, encoding='utf-8', errors='replace') as f:
        txt = f.read()
    vers = sorted(set(ver_re.findall(txt)))
    results[fn] = vers

non_h = {k: v for k, v in results.items() if any(x != 'v=20260911h' for x in v)}
print("== 有非 20260911h 版本令牌的 HTML ==")
for k in sorted(non_h):
    print(f"  {k}: {non_h[k]}")
print(f"== 合计 .html={len(results)}，含非 h 令牌={len(non_h)} ==")

# 2) 被改 HTML 的标签配平
CHANGED = ["私聊.html", "好友申请.html", "学习博客.html", "学途.html"]
tag_re = re.compile(r'<(/?)(div|style|script)\b', re.I)
for fn in CHANGED:
    if not os.path.exists(fn):
        print(f"!! 文件不存在: {fn}")
        continue
    with open(fn, encoding='utf-8', errors='replace') as f:
        txt = f.read()
    counts = {}
    for m in tag_re.finditer(txt):
        close, name = m.group(1) == '/', m.group(2).lower()
        counts.setdefault(name, [0, 0])
        counts[name][1 if close else 0] += 1
    bad = {k: v for k, v in counts.items() if v[0] != v[1]}
    status = "OK" if not bad else f"MISMATCH {bad}"
    print(f"配平 {fn}: {status}  {counts}")

# 3) blog_wechat.html / 学途.html 是否被其它 live 页引用
for target in ["blog_wechat.html", "学途.html"]:
    refs = []
    for fn in os.listdir('.'):
        if not fn.endswith('.html') or fn == target:
            continue
        with open(fn, encoding='utf-8', errors='replace') as f:
            if target in f.read():
                refs.append(fn)
    print(f"引用 {target} 的页面: {refs}")

sys.exit(0)
