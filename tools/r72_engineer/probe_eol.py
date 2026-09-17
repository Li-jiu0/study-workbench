# -*- coding: utf-8 -*-
"""R72 工程师任务一：行尾探针（改前）。仅统计，不修改。"""
import io
import os

ROOT = r"D:\下载的文件\学习工作台"
TARGETS = [
    r"assets\chat-local.js",
    r"assets\api.js",
    r"server\database.py",
    r"server\schemas.py",
    r"server\routers\chat.py",
    r"server\routers\friends.py",
    r"server\routers\groups.py",
    r"server\建表SQL.sql",
]

out = []
for rel in TARGETS:
    p = os.path.join(ROOT, rel)
    raw = open(p, "rb").read()
    crlf = raw.count(b"\r\n")
    lf = raw.count(b"\n")
    lone_lf = lf - crlf
    out.append("%-34s size=%-8d CRLF=%-6d LF_total=%-6d loneLF=%d" % (rel, len(raw), crlf, lf, lone_lf))

open(os.path.join(ROOT, "tools", "r72_engineer", "eol_before.txt"), "w", encoding="utf-8").write("\n".join(out) + "\n")
print("\n".join(out))
