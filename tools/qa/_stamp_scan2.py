# -*- coding: utf-8 -*-
"""补充审计（只读）：
1) 是否有 .html 被 ?v= 引用（子页面路由）
2) 列出 .qa/live_chat.html 是否属于扫描范围
3) 精确列出 WATCH 每个资源、每个戳值对应的页面列表（供刷戳核对）
4) 找出 assets/ 下所有被引用的资源（不限 WATCH），确认没有遗漏
"""
import os, re, json, io
from collections import defaultdict

ROOT = r"D:\下载的文件\学习工作台"
RE_TAG = re.compile(r"<(script|link)\b[^>]*?(?:src|href)\s*=\s*\"([^\"]+)\"", re.I)
RE_IMPORT = re.compile(r"@import\s+(?:url\()?[\"']([^\"']+)[\"']", re.I)
RE_STAMP = re.compile(r"(assets/[A-Za-z0-9_\-./]+)\?v=([^\"'\s)>]+)")
RE_HTMLV = re.compile(r"([A-Za-z0-9_\-\u4e00-\u9fff]+\.html)\?v=([^\"'\s)>]+)")
RE_HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)

EXCLUDE_TOP = ("备份","android","server","web","docs","deliverables","tools","node_modules",".git")

def iter_all_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        rel = os.path.relpath(dirpath, root)
        top = rel.split(os.sep)[0] if rel != "." else ""
        if top in EXCLUDE_TOP:
            dirnames[:] = []
            continue
        for fn in filenames:
            yield os.path.join(dirpath, fn)

def main():
    per_stamp = defaultdict(lambda: defaultdict(list))  # fname -> stamp -> [pages]
    all_assets = defaultdict(set)                       # fname -> set(pages)  (any asset referenced)
    html_v_refs = []                                    # html referenced with ?v=
    hidden_qa = []

    for p in iter_all_files(ROOT):
        rel = os.path.relpath(p, ROOT).replace(os.sep, "/")
        low = p.lower()
        if low.endswith((".html", ".htm")) or low.endswith((".js", ".css")):
            raw = open(p, "rb").read().decode("utf-8", errors="replace")
        else:
            continue
        # 只对 html 记「页面」引用；对 js/css 也扫但标注来源
        is_html = low.endswith((".html", ".htm"))
        stripped = RE_HTML_COMMENT.sub(lambda m: " "*(m.end()-m.start()), raw)
        for m in RE_TAG.finditer(stripped):
            url = m.group(2)
            sm = RE_STAMP.search(url)
            if sm:
                fname = os.path.basename(sm.group(1))
                if is_html:
                    per_stamp[fname][sm.group(2)].append(rel)
                all_assets[fname].add(rel if is_html else "[js/css]"+rel)
        for m in RE_IMPORT.finditer(stripped):
            sm = RE_STAMP.search(m.group(1))
            if sm:
                fname = os.path.basename(sm.group(1))
                if is_html:
                    per_stamp[fname][sm.group(2)].append(rel)
                all_assets[fname].add(rel if is_html else "[js/css]"+rel)
        # html 被 ?v= 引用
        if is_html:
            for m in RE_HTMLV.finditer(raw):
                html_v_refs.append({"in_page": rel, "html": m.group(1), "stamp": m.group(2)})

    # hidden qa files
    qa_dir = os.path.join(ROOT, ".qa")
    if os.path.isdir(qa_dir):
        for fn in os.listdir(qa_dir):
            hidden_qa.append(".qa/" + fn)

    out = {
        "html_v_refs": html_v_refs,
        "hidden_qa": hidden_qa,
        "per_stamp": {k: {s: sorted(set(v)) for s, v in d.items()} for k, d in per_stamp.items()},
        "all_asset_names": sorted(all_assets.keys()),
    }
    with io.open(os.path.join(ROOT,"tools","qa","_stamp_refs2.json"),"w",encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    lines = []
    lines.append("=== HTML referenced with ?v= (routing) ===")
    if html_v_refs:
        for x in html_v_refs:
            lines.append("  %s -> %s?v=%s" % (x["in_page"], x["html"], x["stamp"]))
    else:
        lines.append("  (none)")
    lines.append("")
    lines.append("=== .qa hidden files ===")
    for x in hidden_qa:
        lines.append("  " + x)
    lines.append("")
    lines.append("=== ALL asset basenames referenced anywhere ===")
    for a in sorted(all_assets):
        lines.append("  %s  (refs=%d)" % (a, len(all_assets[a])))
    with io.open(os.path.join(ROOT,"tools","qa","_stamp_refs2.txt"),"w",encoding="utf-8") as f:
        f.write("\n".join(lines)+"\n")
    print("OK")

main()
