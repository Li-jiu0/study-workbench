# -*- coding: utf-8 -*-
"""R73 深度静态扫描 v2：
 1) fetch( 附近 N 行内无 .catch 的调用
 2) JSON.parse(localStorage...) 是否在 try 内（粗判：同函数体/前 30 行内无 try）
 3) 跨文件 var/let/const 同名（含 var 与 let 混合 → 潜在 SyntaxError）
 4) innerHTML 行内含可疑未转义变量
"""
import os, re, io

ROOT = r"D:/下载的文件/学习工作台"
ASSETS = os.path.join(ROOT, "assets")

def live_js():
    return [fn for fn in sorted(os.listdir(ASSETS))
            if fn.endswith(".js") and ".bak" not in fn and ".backup" not in fn]

def main():
    files = live_js()
    out = []

    # ---------- 1) fetch 无 catch ----------
    out.append("===== 1) fetch( 调用点，其后 12 行内是否有 .catch =====")
    fetch_no_catch = []
    for base in files:
        p = os.path.join(ASSETS, base)
        lines = io.open(p, "r", encoding="utf-8", errors="replace").read().splitlines()
        for i, line in enumerate(lines):
            if re.search(r'\bfetch\s*\(', line):
                window = "\n".join(lines[i:i+12])
                if ".catch(" not in window and "try" not in "\n".join(lines[max(0,i-3):i+1]):
                    fetch_no_catch.append((base, i+1, line.strip()[:110]))
    for b, ln, s in fetch_no_catch:
        out.append("   %s:%d | %s" % (b, ln, s))
    out.append("   小计: %d" % len(fetch_no_catch))
    out.append("")

    # ---------- 2) JSON.parse(localStorage...) 无 try ----------
    out.append("===== 2) JSON.parse(localStorage...) 且前 40 行无 try =====")
    jp = []
    for base in files:
        p = os.path.join(ASSETS, base)
        lines = io.open(p, "r", encoding="utf-8", errors="replace").read().splitlines()
        for i, line in enumerate(lines):
            if "JSON.parse(" in line and ("localStorage" in line or "getItem" in line):
                ctx = "\n".join(lines[max(0, i-40):i+1])
                jp.append((base, i+1, ("try" in ctx), line.strip()[:110]))
    for b, ln, hastry, s in jp:
        out.append("   %s:%d try=%s | %s" % (b, ln, hastry, s))
    out.append("   小计: %d（其中无 try 的: %d）" % (len(jp), sum(1 for x in jp if not x[2])))
    out.append("")

    # ---------- 3) 跨文件 var/let/const 同名 ----------
    out.append("===== 3) 跨文件顶层 var/let/const 同名（潜在 SyntaxError）=====")
    RE_VAR = re.compile(r'^(var|let|const)\s+([A-Za-z0-9_$]+)\s*[;,=]')
    tbl = {}
    for base in files:
        p = os.path.join(ASSETS, base)
        for i, line in enumerate(io.open(p, "r", encoding="utf-8", errors="replace"), 1):
            m = RE_VAR.match(line)
            if m:
                tbl.setdefault(m.group(2), []).append((base, m.group(1), i))
    n = 0
    for name, occ in sorted(tbl.items()):
        fs = set(o[0] for o in occ)
        if len(fs) >= 2:
            n += 1
            out.append("   %s: %s" % (name, ", ".join("%s:%d[%s]" % (o[0], o[2], o[1]) for o in occ)))
    if n == 0:
        out.append("   (无)")
    out.append("")

    # ---------- 4) innerHTML 可疑未转义 ----------
    out.append("===== 4) innerHTML 行内含 变量 且无 esc/escHtml 转义（候选 XSS）=====")
    susp = re.compile(r'(\.content|\.title|\.nickname|\.name\b|\.text\b|\.motto|\.bio|\.preview|\.desc|\.message|\.remark|searchVal|keyword|location\.search|params\.get)')
    cnt = 0
    for base in files:
        p = os.path.join(ASSETS, base)
        for i, line in enumerate(io.open(p, "r", encoding="utf-8", errors="replace"), 1):
            if ".innerHTML" not in line:
                continue
            if "esc(" in line or "escHtml(" in line or "escapeHtml" in line or "encodeURIComponent" in line:
                continue
            if susp.search(line) and ("+" in line):
                cnt += 1
                if cnt <= 80:
                    out.append("   %s:%d | %s" % (base, i, line.strip()[:160]))
    out.append("   小计候选: %d" % cnt)

    io.open(os.path.join(ROOT, "tools/qa/r73/out_deep.txt"), "w", encoding="utf-8").write("\n".join(out))
    print("done fetch_no_catch=%d, jsonparse=%d, varcollide=%d, xss_cand=%d" % (len(fetch_no_catch), len(jp), n, cnt))

if __name__ == "__main__":
    main()
