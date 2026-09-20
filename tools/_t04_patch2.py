# -*- coding: utf-8 -*-
import os
ROOT = r"D:\下载的文件\学习工作台"
XU = os.path.join(ROOT, r"assets\xt-aiusage.js")
with open(XU, "rb") as f:
    raw = f.read()
txt = raw.decode("utf-8")
old = '''  function renderCompare(localRows, serverRows) {
    var cmp = el.compareList;
    if (!cmp) return;
    var map = {};'''
new = '''  function renderCompare(localRows, serverRows) {
    var cmp = el.compareList;
    if (!cmp) return;
    localRows = sortRows(localRows);   /* 本地分支也走统一排序（与其它分支同口径） */
    var map = {};'''
assert txt.count(old) == 1, txt.count(old)
txt = txt.replace(old, new, 1)
out = txt.encode("utf-8")
assert out.count(b"\r\n") == raw.count(b"\r\n")
with open(XU, "wb") as f:
    f.write(out)
print("ok %d -> %d" % (len(raw), len(out)))
