# -*- coding: utf-8 -*-
import os, io, sys, time

ROOT = r"D:\下载的文件\学习工作台"

TARGETS = [
    r"assets\xt-profile.js",
    r"assets\xt-profile.css",
    r"assets\chat-local.js",
    r"assets\xt-region.js",
    r"assets\xt-moments.js",
    r"assets\xt-update.js",
    r"assets\icon-map.js",
    r"assets\common.css",
    r"个人资料.html",
    r"私聊.html",
    r"地区选择.html",
    r"朋友圈发布.html",
    r"更多.html",
    r"更新.html",
    r"设置.html",
]

def eol(b):
    crlf = b.count(b"\r\n")
    lone_lf = b.count(b"\n") - crlf
    lone_cr = b.count(b"\r") - crlf
    return crlf, lone_lf, lone_cr

out = []
out.append("=== A. TARGET FILES ===")
for rel in TARGETS:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        out.append("%-28s  <MISSING>" % rel)
        continue
    b = open(p, "rb").read()
    crlf, llf, lcr = eol(b)
    kind = "CRLF" if crlf > 0 and llf == 0 else ("LF" if crlf == 0 and llf > 0 else "MIXED/OTHER")
    mt = time.strftime("%m-%d %H:%M", time.localtime(os.path.getmtime(p)))
    out.append("%-28s %8d  %-11s crlf=%-7d loneLF=%-6d loneCR=%-4d  %s" % (rel, len(b), kind, crlf, llf, lcr, mt))

out.append("")
out.append("=== B. HTML files containing '对话记录' ===")
htmls = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    if ".git" in dirpath:
        continue
    for fn in filenames:
        if fn.lower().endswith(".html"):
            htmls.append(os.path.join(dirpath, fn))

for p in sorted(htmls):
    rel = os.path.relpath(p, ROOT)
    b = open(p, "rb").read()
    if "对话记录".encode("utf-8") in b:
        out.append("  [dialog-record] %s" % rel)

out.append("")
out.append("=== C. HTML files referencing xt-profile.js ===")
for p in sorted(htmls):
    rel = os.path.relpath(p, ROOT)
    b = open(p, "rb").read()
    if b"xt-profile.js" in b:
        out.append("  %s" % rel)

open(os.path.join(ROOT, "_r89_probe_out.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
