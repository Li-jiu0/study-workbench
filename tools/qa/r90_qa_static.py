# -*- coding: utf-8 -*-
"""R90 QA 通用检具：HTML 结构配对 / 禁用语法 / 禁用 API / 经纬度明文"""
import os, re, json

ROOT = r"D:\下载的文件\学习工作台"
out = []

def P(rel):
    return os.path.join(ROOT, rel.replace("/", os.sep))

def read(rel):
    return open(P(rel), "r", encoding="utf-8", errors="replace").read()

# ---------- 1. HTML 结构配对 ----------
HTMLS = ["私聊.html", "朋友圈发布.html", "AI.html", "个人资料.html", "地区选择.html", "个人中心.html"]
out.append("=== HTML 结构配对 ===")
out.append("%-22s %-9s %-9s %-8s %-10s %-8s %-10s %-8s %-10s" %
           ("file", "<!--", "-->", "<div", "</div", "<style", "</style", "<script", "</script"))
for h in HTMLS:
    if not os.path.exists(P(h)):
        out.append("%-22s MISSING" % h)
        continue
    s = read(h)
    row = [h,
           s.count("<!--"), s.count("-->"),
           len(re.findall(r"<div[\s>]", s)), s.count("</div"),
           len(re.findall(r"<style[\s>]", s)), s.count("</style"),
           len(re.findall(r"<script[\s>]", s)), s.count("</script")]
    ok = (row[1] == row[2]) and (row[3] == row[4]) and (row[5] == row[6]) and (row[7] == row[8])
    cells = "%s|%s|%s|%s|%s|%s|%s|%s" % tuple(str(x) for x in row[1:])
    out.append("%-22s %s  %s" % (row[0], cells, "OK" if ok else "MISMATCH<<<"))
    # head 用写全
    out.append("%-22s   <head[\\s>]=%d  </head>=%d  <header=%d  </header>=%d" %
               ("", len(re.findall(r"<head[\s>]", s)), s.count("</head>"),
                len(re.findall(r"<header[\s>]", s)), s.count("</header>")))

# ---------- 2. 禁用语法（真实违规 vs 注释内）----------
JSFILES = ["assets/xt-profile.js", "assets/xt-region.js", "assets/xt-moments.js",
           "assets/xt-aiusage.js", "assets/common.css"]
PATTERNS = [
    ("optional-chain ?.", r"\?\."),
    ("nullish ??", r"\?\?"),
    ("Object.fromEntries", r"Object\.fromEntries"),
    (".replaceAll(", r"\.replaceAll\("),
    (".at(", r"\.at\("),
    ("lookbehind (?<=", r"\(\?<="),
    ("lookbehind (?<!", r"\(\?<!"),
    ("catch {", r"catch\s*\{"),
]

def strip_comments_js(s):
    # 粗略：去掉 // 行注释 与 /* */ 块注释（保留换行以维持行号）
    def repl_block(m):
        return "\n" * m.group(0).count("\n")
    s = re.sub(r"/\*[\s\S]*?\*/", repl_block, s)
    s = re.sub(r"^\s*//.*$", "", s, flags=re.M)
    s = re.sub(r"(?<![:\w])//[^\n]*$", "", s, flags=re.M)
    return s

out.append("")
out.append("=== 禁用语法扫描（真实违规 vs 注释内命中两个数）===")
for f in JSFILES:
    if not os.path.exists(P(f)):
        out.append("%s MISSING" % f); continue
    raw = read(f)
    stripped = strip_comments_js(raw)
    rows = []
    for name, pat in PATTERNS:
        a = len(re.findall(pat, raw))
        b = len(re.findall(pat, stripped))
        if a or b:
            rows.append("%s raw=%d real=%d" % (name, a, b))
    out.append("%-26s %s" % (f, " | ".join(rows) if rows else "CLEAN"))

# ---------- 3. 禁用 API ----------
out.append("")
out.append("=== 禁用 prompt/alert/confirm（裸调用）===")
for f in ["assets/xt-profile.js", "assets/xt-region.js", "assets/xt-moments.js", "assets/xt-aiusage.js"] + HTMLS:
    if not os.path.exists(P(f)):
        continue
    s = read(f)
    hits = []
    for api in ["prompt", "alert", "confirm"]:
        # 裸调用：前面不是 word/./ 字母
        n = len(re.findall(r"(?<![\w.$])" + api + r"\s*\(", s))
        if n:
            hits.append("%s=%d" % (api, n))
    out.append("%-26s %s" % (f, " | ".join(hits) if hits else "0"))

# ---------- 4. 经纬度明文 ----------
out.append("")
out.append("=== 经纬度明文进 UI 扫描 ===")
GPAT = [
    ("lng/lat 明文", r"(?<![\w.])(lng|lat|longitude|latitude)\s*[:=]\s*-?\d{1,3}\.\d{3,}"),
    ("\\d+\\.\\d{4,},\\s*\\d+\\.\\d{4,}", r"[-+]?\d{2,3}\.\d{4,}\s*,\s*[-+]?\d{1,3}\.\d{4,}"),
    ("度分秒", r"°\s*\d+\s*['′]"),
]
for f in JSFILES + HTMLS + ["assets/xt-profile.js"]:
    if not os.path.exists(P(f)):
        continue
    s = read(f)
    hits = []
    for name, pat in GPAT:
        n = len(re.findall(pat, s))
        if n:
            hits.append("%s=%d" % (name, n))
    if hits:
        out.append("%-26s %s" % (f, " | ".join(hits)))
out.append("(未列出的文件 = 0 命中)")

txt = "\n".join(out)
open(P("tools/qa/r90_qa_static.out.txt"), "w", encoding="utf-8").write(txt)
print(txt)
