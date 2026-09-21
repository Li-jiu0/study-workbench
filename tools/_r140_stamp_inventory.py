# -*- coding: utf-8 -*-
"""R11.40 发版前：全站 ?v= 戳盘点。

输出：asset -> {stamp: [pages]}，便于判断哪些资产戳不统一、哪些页需要随
xt-update.js 内容变更（CURRENT_VERSION）一并 bump。
只读，不写盘。
"""
import os
import re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RE_REF = re.compile(r'([A-Za-z0-9_\-./]+\.(?:js|css))\?v=([0-9A-Za-z]+)')

by_asset = defaultdict(lambda: defaultdict(list))
pages = []

for name in sorted(os.listdir(ROOT)):
    if not name.endswith('.html'):
        continue
    p = os.path.join(ROOT, name)
    with open(p, 'r', encoding='utf-8', errors='replace') as fh:
        txt = fh.read()
    hits = RE_REF.findall(txt)
    if hits:
        pages.append(name)
    for asset, stamp in hits:
        by_asset[asset][stamp].append(name)

print("== 引用带戳静态资源的页面数：%d ==" % len(pages))
print("")
print("== 各资产戳分布 ==")
for asset in sorted(by_asset):
    stamps = by_asset[asset]
    tag = "  单一" if len(stamps) == 1 else "★多戳"
    parts = []
    for st in sorted(stamps):
        parts.append("%s(%d页)" % (st, len(stamps[st])))
    print("%s %-28s %s" % (tag, asset, " ".join(parts)))

print("")
print("== 多戳资产明细 ==")
for asset in sorted(by_asset):
    stamps = by_asset[asset]
    if len(stamps) > 1:
        for st in sorted(stamps):
            print("  %s  ?v=%s  ->  %s" % (asset, st, ", ".join(sorted(stamps[st]))))
