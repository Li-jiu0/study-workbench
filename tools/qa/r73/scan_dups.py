# -*- coding: utf-8 -*-
"""R73 前端代码审查：同名顶层符号覆盖扫描（live only）。
扫描 assets/*.js（排除 *.bak-* / 备份 等），提取顶层 function 声明 / window.x 赋值 /
var|let|const x = 声明，找出跨文件或同文件重复定义（后加载覆盖前者）。"""
import os, re, json, io, sys

ROOT = r"D:/下载的文件/学习工作台"
ASSETS = os.path.join(ROOT, "assets")

RE_FUNC = re.compile(r'^function\s+([A-Za-z0-9_$]+)\s*\(')
RE_WIN  = re.compile(r'^window\.([A-Za-z0-9_$]+)\s*=')
RE_VAR  = re.compile(r'^(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=')
RE_WINFUNC = re.compile(r'^\s*window\.([A-Za-z0-9_$]+)\s*=\s*function')

def live_js():
    out = []
    for fn in sorted(os.listdir(ASSETS)):
        if not fn.endswith(".js"):
            continue
        # exclude backups
        if ".bak" in fn or ".backup" in fn or fn.endswith(".min.js"):
            continue
        out.append(os.path.join(ASSETS, fn))
    return out

def scan(path):
    hits = []  # (kind, name, lineno, raw)
    try:
        with io.open(path, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f, 1):
                m = RE_FUNC.match(line)
                if m:
                    hits.append(("function", m.group(1), i, line.rstrip()[:120]))
                    continue
                m = RE_WIN.match(line)
                if m:
                    hits.append(("window", m.group(1), i, line.rstrip()[:120]))
                    continue
                m = RE_VAR.match(line)
                if m:
                    hits.append(("decl", m.group(1), i, line.rstrip()[:120]))
                    continue
    except Exception as e:
        print("ERR", path, e)
    return hits

def main():
    files = live_js()
    # name -> list of (file, kind, lineno)
    table = {}
    for p in files:
        base = os.path.basename(p)
        for kind, name, ln, raw in scan(p):
            table.setdefault(name, []).append((base, kind, ln))

    dups = {}
    for name, occ in table.items():
        fileset = set(o[0] for o in occ)
        # 跨文件重复 或 同文件重复（>=2 次）
        if len(occ) >= 2 and (len(fileset) >= 2 or len(occ) >= 2):
            dups[name] = occ

    lines = []
    lines.append("== 重复顶层符号总数: %d ==" % len(dups))
    lines.append("== live 文件数: %d ==" % len(files))
    lines.append("")
    # 排序：先按涉及文件数降序，再按出现次数降序
    ordered = sorted(dups.items(), key=lambda kv: (-len(set(o[0] for o in kv[1])), -len(kv[1]), kv[0]))
    for name, occ in ordered:
        fileset = sorted(set(o[0] for o in occ))
        kinds = sorted(set(o[1] for o in occ))
        lines.append("### %s   (files=%d, occ=%d, kinds=%s)" % (name, len(fileset), len(occ), ",".join(kinds)))
        for base, kind, ln in occ:
            lines.append("    [%s] %s:%d" % (kind, base, ln))
        lines.append("")

    with io.open(os.path.join(ROOT, "tools/qa/r73/out_dups.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("done, dup names:", len(dups))

if __name__ == "__main__":
    main()
