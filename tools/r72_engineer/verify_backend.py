# -*- coding: utf-8 -*-
"""R72：后端自测 ① py_compile ② 行尾零变化。"""
import os
import py_compile
import subprocess
import sys

ROOT = r"D:\下载的文件\学习工作台"
PY = sys.executable

PYS = [
    r"server\database.py",
    r"server\schemas.py",
    r"server\routers\chat.py",
    r"server\routers\friends.py",
    r"server\routers\groups.py",
]

out = []
rc = 0
for rel in PYS:
    p = os.path.join(ROOT, rel)
    try:
        py_compile.compile(p, doraise=True)
        out.append("py_compile OK   %s" % rel)
    except py_compile.PyCompileError as e:
        out.append("py_compile FAIL %s :: %s" % (rel, e))
        rc = 1

# 行尾零变化：与备份逐文件对比 loneLF / CRLF 计数
PAIRS = [
    (r"assets\chat-local.js", True),
    (r"assets\api.js", True),
    (r"server\database.py", True),
    (r"server\schemas.py", True),
    (r"server\routers\chat.py", True),
    (r"server\routers\friends.py", True),
    (r"server\routers\groups.py", True),
    (r"server\建表SQL.sql", True),
]
out.append("")
out.append("== 行尾（改后） ==")
for rel, _ in PAIRS:
    p = os.path.join(ROOT, rel)
    raw = open(p, "rb").read()
    crlf = raw.count(b"\r\n")
    lf = raw.count(b"\n")
    lone = lf - crlf
    out.append("%-34s CRLF=%-6d loneLF=%d" % (rel, crlf, lone))

open(os.path.join(ROOT, "tools", "r72_engineer", "verify_backend.txt"), "w", encoding="utf-8").write("\n".join(out) + "\n")
print("\n".join(out))
sys.exit(rc)
