# -*- coding: utf-8 -*-
import ast
import sys

ROOT = r"D:\下载的文件\学习工作台"
files = [
    r"server\quota_ledger.py",
    r"server\routers\ai.py",
    r"server\main.py",
    r"assets\ai-service.js",
    r"assets\ai-settings.js",
]
out = []
for rel in files:
    p = ROOT + "\\" + rel
    t = open(p, "rb").read()
    cr = t.count(b"\r")
    crlf = t.count(b"\r\n")
    lf = t.count(b"\n")
    eol = "CRLF" if cr == crlf and cr > 0 else ("LF" if cr == 0 else "MIXED")
    line = "%-26s bytes=%-8d LF=%-6d CRLF=%-6d CR=%-6d EOL=%s" % (rel, len(t), lf, crlf, cr, eol)
    if rel.endswith(".py"):
        try:
            ast.parse(t.decode("utf-8"))
            line += "  AST=OK"
        except SyntaxError as e:
            line += "  AST=FAIL %s" % e
    out.append(line)

with open(r"C:\Users\ATM\_r88m1_check.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
