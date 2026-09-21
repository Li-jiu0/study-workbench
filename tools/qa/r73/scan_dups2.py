# -*- coding: utf-8 -*-
"""R73 前端代码审查 v2：同名顶层符号覆盖扫描（含 async function / function*）。
live only = assets/*.js（排除 *.bak-* 等）。"""
import os, re, io

ROOT = r"D:/下载的文件/学习工作台"
ASSETS = os.path.join(ROOT, "assets")

RE_FUNC = re.compile(r'^(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)\s*\(')
RE_WIN  = re.compile(r'^window(?:\[["\']([A-Za-z0-9_$]+)["\']\]|\.([A-Za-z0-9_$]+))\s*=')
RE_VAR  = re.compile(r'^(var|let|const)\s+([A-Za-z0-9_$]+)\s*=')
RE_VARDECL = re.compile(r'^(var|let|const)\s+([A-Za-z0-9_$]+)\s*[;,=]')

def live_js():
    out = []
    for fn in sorted(os.listdir(ASSETS)):
        if not fn.endswith(".js"): continue
        if ".bak" in fn or ".backup" in fn or fn.endswith(".min.js"): continue
        out.append(fn)
    return out

def scan(path):
    hits = []
    with io.open(path, "r", encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f, 1):
            m = RE_FUNC.match(line)
            if m:
                hits.append(("function", m.group(1), i)); continue
            m = RE_WIN.match(line)
            if m:
                hits.append(("window", m.group(1) or m.group(2), i)); continue
            m = RE_VAR.match(line)
            if m:
                hits.append((m.group(1), m.group(2), i)); continue
            m = RE_VARDECL.match(line)
            if m:
                hits.append((m.group(1), m.group(2), i)); continue
    return hits

def main():
    files = live_js()
    table = {}
    for base in files:
        for kind, name, ln in scan(os.path.join(ASSETS, base)):
            table.setdefault(name, []).append((base, kind, ln))

    lines = []
    lines.append("live files = %d" % len(files))
    # 分类
    benign_alias = []   # 同文件 function X + window.X = X（纯别名导出）
    real = []           # 其余重复
    for name, occ in table.items():
        if len(occ) < 2: continue
        fileset = set(o[0] for o in occ)
        kinds = set(o[1] for o in occ)
        # 别名导出：同文件内 function + window，且 window 那行的值等于名字 —— 需二次判定，先粗分
        if len(fileset) == 1 and kinds == {"function", "window"} and len(occ) == 2:
            benign_alias.append((name, occ)); continue
        real.append((name, occ))

    def dump(title, items, key):
        lines.append("")
        lines.append("===== %s (%d) =====" % (title, len(items)))
        for name, occ in sorted(items, key=key):
            fs = sorted(set(o[0] for o in occ))
            lines.append("### %s   files=%d occ=%d" % (name, len(fs), len(occ)))
            for base, kind, ln in occ:
                lines.append("     [%s] %s:%d" % (kind, base, ln))

    dump("REAL 冲突（跨文件 或 同文件多实现）", real,
         lambda kv: (-len(set(o[0] for o in kv[1])), -len(kv[1]), kv[0]))
    dump("别名导出（同文件 function + window 同号）", benign_alias, lambda kv: kv[0])

    # 特别关注：顶层 let/const 跨文件重复 → SyntaxError
    lines.append("")
    lines.append("===== 顶层 let/const 跨文件重复（潜在 SyntaxError）=====")
    cnt = 0
    for name, occ in sorted(table.items()):
        decls = [o for o in occ if o[1] in ("let", "const")]
        if len(decls) >= 2 and len(set(o[0] for o in decls)) >= 2:
            cnt += 1
            lines.append("### %s" % name)
            for base, kind, ln in decls:
                lines.append("     [%s] %s:%d" % (kind, base, ln))
    if cnt == 0:
        lines.append("(无)")

    with io.open(os.path.join(ROOT, "tools/qa/r73/out_dups2.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("real:", len(real), "alias:", len(benign_alias))

if __name__ == "__main__":
    main()
