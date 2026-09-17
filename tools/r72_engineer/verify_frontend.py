# -*- coding: utf-8 -*-
"""R72：前端自测 ② —— node --check / 行尾 / ES2017 禁令（只扫『可执行代码』）。

说明：直接把注释 / 字符串 / 正则字面量里的 ... 或 ** 也算命中是不准确的
（它们不是语法特性）。本脚本先剥离注释、字符串、正则字面量，再逐项统计真正的语法命中。
"""
import os
import re
import subprocess
import sys

ROOT = r"D:\下载的文件\学习工作台"
NODE = r"C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"
JS = [r"assets\chat-local.js", r"assets\api.js"]


def strip_js(s):
    """剥离 // 行注释、/* */ 块注释、'"/` 字符串、正则字面量，只留可执行代码骨架。"""
    out = []
    i, n = 0, len(s)
    prev_sig = ""
    while i < n:
        c = s[i]
        if c == "/" and i + 1 < n and s[i + 1] == "/":
            j = s.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and i + 1 < n and s[i + 1] == "*":
            j = s.find("*/", i + 2)
            i = n if j < 0 else j + 2
            out.append(" ")
            continue
        if c in ('"', "'", "`"):
            q = c
            i += 1
            while i < n:
                if s[i] == "\\":
                    i += 2
                    continue
                if s[i] == q:
                    i += 1
                    break
                i += 1
            out.append(" ")
            prev_sig = ")"
            continue
        if c == "/" and (prev_sig == "" or prev_sig in "(,=:[!&|?{};+-*%<>~^"):
            i += 1
            in_class = False
            while i < n:
                ch = s[i]
                if ch == "\\":
                    i += 2
                    continue
                if ch == "[":
                    in_class = True
                elif ch == "]":
                    in_class = False
                elif ch == "/" and not in_class:
                    i += 1
                    break
                elif ch == "\n":
                    break
                i += 1
            out.append(" ")
            prev_sig = ")"
            continue
        out.append(c)
        if not c.isspace():
            prev_sig = c
        i += 1
    return "".join(out)


BANS = [
    ("1 可选链 ?.", r"\?\."),
    ("2 空值合并 ??", r"\?\?"),
    ("3 对象展开 {...obj}", r"\{\s*\.\.\."),
    ("4 对象剩余解构 {a,...r}", r"\{\s*[^{}]*,\s*\.\.\.\s*[A-Za-z_$]"),
    ("5 .replaceAll(", r"\.replaceAll\("),
    ("6 Object.fromEntries", r"Object\.fromEntries"),
    ("7 .at(", r"\.at\("),
    ("8 正则后行断言 (?<=/(?<!", r"\(\?<[=!]"),
    ("9 指数运算符 **", r"\*\*"),
    ("10 可选 catch 绑定 catch {", r"catch\s*\{"),
]

out = []
rc = 0
out.append("== node --check ==")
for rel in JS:
    r = subprocess.run([NODE, "--check", os.path.join(ROOT, rel)], capture_output=True, text=True)
    if r.returncode == 0:
        out.append("node --check OK   %s" % rel)
    else:
        out.append("node --check FAIL %s :: %s %s" % (rel, r.stdout, r.stderr))
        rc = 1

out.append("")
out.append("== 行尾（改后，loneLF 必须 0） ==")
for rel in JS:
    raw = open(os.path.join(ROOT, rel), "rb").read()
    crlf = raw.count(b"\r\n")
    lf = raw.count(b"\n")
    out.append("%-24s CRLF=%-6d loneLF=%d" % (rel, crlf, lf - crlf))

out.append("")
out.append("== ES2017 禁令 10 项 —— 仅统计『可执行代码』（已剥离注释/字符串/正则） ==")
total = 0
for rel in JS:
    text = open(os.path.join(ROOT, rel), "rb").read().decode("utf-8")
    code = strip_js(text)
    clines = code.split("\n")
    out.append("-- %s" % rel)
    for name, pat in BANS:
        hits = list(re.finditer(pat, code))
        out.append("   %-30s %d" % (name, len(hits)))
        total += len(hits)
        for m in hits[:5]:
            ln = code[:m.start()].count("\n") + 1
            out.append("       line %d :: %s" % (ln, clines[ln - 1].strip()[:100]))
out.append("EXECUTABLE_BAN_HITS_TOTAL = %d" % total)

out.append("")
out.append("== 参考：raw（含注释/字符串/正则）逐项命中数，仅信息用途 ==")
for rel in JS:
    text = open(os.path.join(ROOT, rel), "rb").read().decode("utf-8")
    raw_counts = ", ".join("%s=%d" % (n.split(" ", 1)[1], len(re.findall(p, text))) for n, p in BANS)
    out.append("%s :: %s" % (rel, raw_counts))

open(os.path.join(ROOT, "tools", "r72_engineer", "verify_frontend.txt"), "w", encoding="utf-8").write("\n".join(out) + "\n")
print("\n".join(out))
sys.exit(rc)
