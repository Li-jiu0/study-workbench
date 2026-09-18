# -*- coding: utf-8 -*-
"""定位 xt-profile.js 的子视图 id / openView / xtpChatBody 渲染入口"""
import os, re
ROOT = r"D:\下载的文件\学习工作台"
s = open(os.path.join(ROOT, "assets", "xt-profile.js"), "r", encoding="utf-8", errors="replace").read()
lines = s.split("\n")

print("=== openView / renderView / backView 定义 ===")
for i, l in enumerate(lines):
    if re.search(r"function\s+(openView|renderView|backView|paintChat|renderPage)\b", l) or re.search(r"xtpView_|xtpChatBody", l):
        print("%5d| %s" % (i + 1, l.rstrip("\r")[:190]))
print("")
print("=== VIEWS 表 / 视图 id 常量 ===")
for i, l in enumerate(lines):
    if re.search(r"VIEW|viewId|'chat'|\"chat\"|chatBody", l):
        print("%5d| %s" % (i + 1, l.rstrip("\r")[:190]))
