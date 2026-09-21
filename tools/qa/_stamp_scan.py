# -*- coding: utf-8 -*-
"""R88-STAMP 第一步审计（只读）：扫描全树 *.html 对 assets/* 资源的真实引用与戳值。
区分引用方式：
  script_src : <script src="...">
  link_href  : <link href="...">
  at_import  : @import "..."
  inline_str : 其它（字符串拼接/动态等，仅在真的出现 assets/<file>?v= 时记）
同时单独列出「假命中」：注释里提到资源名但没有 ?v= 的真实标签。
"""
import os, re, json, io
from collections import defaultdict, Counter

ROOT = r"D:\下载的文件\学习工作台"

# 需要统计的资源（basename -> 关心）
WATCH = [
    "common.css", "app.js", "api.js", "config.js", "icon-map.js", "polish.css",
    "states.css", "xt-toast.js", "page-head.css", "xt-update.js", "xt-profile.js",
    "xt-profile.css", "xt-moments.js", "ai-service.js", "ai-settings.js", "ai-page.js",
    "xt-aiusage.js", "xt-region.js", "chat-local.js", "ai-config.js",
]

def iter_html(root):
    for dirpath, dirnames, filenames in os.walk(root):
        # 排除不该碰的目录
        rel = os.path.relpath(dirpath, root)
        top = rel.split(os.sep)[0]
        if top in ("备份", "android", "server", "web", "docs", "deliverables", "tools", "node_modules", ".git"):
            # tools 下没有页面；但仍跳过其子目录避免历史脚本干扰
            dirnames[:] = []
            continue
        for fn in filenames:
            if fn.lower().endswith(".html"):
                yield os.path.join(dirpath, fn)

# 抓 <tag ... src|href="...."> 与 @import
RE_TAG = re.compile(r"<(script|link)\b[^>]*?(?:src|href)\s*=\s*\"([^\"]+)\"", re.I)
RE_IMPORT = re.compile(r"@import\s+(?:url\()?[\"']([^\"']+)[\"']", re.I)
# 任何形如 assets/<file>?v=<stamp> 的字符串
RE_STAMP = re.compile(r"(assets/[A-Za-z0-9_\-./]+)\?v=([^\"'\s)>]+)")
# 任意提到 assets/<file> 的裸引用（可能无戳）
RE_ASSET = re.compile(r"assets/([A-Za-z0-9_\-]+\.(?:js|css))")

# 用于区分「真实标签引用」与「注释/字符串」
RE_HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)

def main():
    # resource basename -> {"script_src": {stamp: [pages]}, "link_href": {...}, "at_import":{...}, "nostamp":[pages], "inline":[pages]}
    refs = defaultdict(lambda: {
        "script_src": defaultdict(list),
        "link_href": defaultdict(list),
        "at_import": defaultdict(list),
        "nostamp": [],      # 标签引用但无 ?v=
        "raw_mention": [],  # 文中提到但非标签（潜在假命中/动态）
    })
    page_files = sorted(iter_html(ROOT))
    page_rel_list = [os.path.relpath(p, ROOT).replace(os.sep, "/") for p in page_files]

    for p in page_files:
        rel = os.path.relpath(p, ROOT).replace(os.sep, "/")
        raw = open(p, "rb").read().decode("utf-8", errors="replace")
        # 去掉 html 注释，用于「真实标签」判断
        stripped = RE_HTML_COMMENT.sub(lambda m: " " * (m.end() - m.start()), raw)

        # 真实标签引用
        tag_hits = []
        for m in RE_TAG.finditer(stripped):
            tag, url = m.group(1).lower(), m.group(2)
            tag_hits.append((tag, url))
        for m in RE_IMPORT.finditer(stripped):
            tag_hits.append(("import", m.group(1)))

        for tag, url in tag_hits:
            sm = RE_STAMP.search(url)
            am = RE_ASSET.search(url)
            if sm:
                fname = os.path.basename(sm.group(1))
                stamp = sm.group(2)
                key = "script_src" if tag == "script" else ("link_href" if tag == "link" else "at_import")
                refs[fname][key][stamp].append(rel)
            elif am:
                fname = am.group(1)
                if fname in WATCH:
                    refs[fname]["nostamp"].append({"page": rel, "tag": tag, "url": url})

        # 裸提到（含注释）—— 仅对 WATCH 且未被上一步统计的，记 raw_mention
        for m in RE_ASSET.finditer(raw):
            fname = m.group(1)
            if fname in WATCH:
                refs[fname]["raw_mention"].append(rel)

    # 组装输出
    out = {
        "total_html": len(page_files),
        "pages": page_rel_list,
        "resources": {},
    }
    for fname in WATCH:
        d = refs[fname]
        entry = {
            "script_src": {k: sorted(set(v)) for k, v in d["script_src"].items()},
            "link_href": {k: sorted(set(v)) for k, v in d["link_href"].items()},
            "at_import": {k: sorted(set(v)) for k, v in d["at_import"].items()},
            "nostamp": d["nostamp"],
        }
        # 计数
        cnt_script = sum(len(v) for v in d["script_src"].values())
        cnt_link = sum(len(v) for v in d["link_href"].values())
        cnt_import = sum(len(v) for v in d["at_import"].values())
        entry["count_script_src"] = cnt_script
        entry["count_link_href"] = cnt_link
        entry["count_at_import"] = cnt_import
        entry["count_tag_total"] = cnt_script + cnt_link + cnt_import
        entry["stamps_summary"] = {
            "script_src": {k: len(sorted(set(v))) for k, v in d["script_src"].items()},
            "link_href": {k: len(sorted(set(v))) for k, v in d["link_href"].items()},
            "at_import": {k: len(sorted(set(v))) for k, v in d["at_import"].items()},
        }
        out["resources"][fname] = entry

    with io.open(os.path.join(ROOT, "tools", "qa", "_stamp_refs.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    # 文本摘要
    lines = []
    lines.append("total_html=%d" % len(page_files))
    for fname in WATCH:
        e = out["resources"][fname]
        lines.append("")
        lines.append("=== %s  (tag_refs=%d: script=%d link=%d import=%d) ===" % (
            fname, e["count_tag_total"], e["count_script_src"], e["count_link_href"], e["count_at_import"]))
        allstamps = {}
        for src in ("script_src", "link_href", "at_import"):
            for stamp, pages in e[src].items():
                allstamps.setdefault(stamp, set()).update(pages)
        if not allstamps:
            lines.append("   (无真实引用)")
        for stamp in sorted(allstamps):
            lines.append("   %s -> %d pages" % (stamp, len(allstamps[stamp])))
        if e["nostamp"]:
            lines.append("   [无戳标签引用] %d" % len(e["nostamp"]))
            for x in e["nostamp"]:
                lines.append("      %s (%s) %s" % (x["page"], x["tag"], x["url"]))
    with io.open(os.path.join(ROOT, "tools", "qa", "_stamp_refs.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("OK html=%d" % len(page_files))

main()
