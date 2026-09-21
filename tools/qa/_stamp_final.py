# -*- coding: utf-8 -*-
"""最终权威扫描（只读）：仅统计项目真实页面，排除所有备份/临时目录。
排除目录（顶层名）：备份 android server web docs deliverables tools node_modules .git
排除目录（任意层级）：.tmp_eng  _bak-pre-*  .qa  node_modules
输出：
  A) WATCH 资源 -> 戳值 -> 真实页面清单（去重）
  B) 每个资源的真实引用页面总数（去重）
  C) 假命中/其它引用方式
"""
import os, re, json, io
from collections import defaultdict

ROOT = r"D:\下载的文件\学习工作台"

EXCLUDE_TOP = {"备份","android","server","web","docs","deliverables","tools","node_modules",".git"}
EXCLUDE_ANY = (".tmp_eng", "_bak-pre-", ".qa", "node_modules", ".git")

WATCH = [
  "common.css","app.js","api.js","config.js","icon-map.js","polish.css","states.css",
  "xt-toast.js","page-head.css","xt-update.js","xt-profile.js","xt-profile.css",
  "xt-moments.js","xt-moments.css","ai-service.js","ai-settings.js","ai-page.js",
  "xt-aiusage.js","xt-region.js","chat-local.js","ai-config.js","error-boundary.js",
  "xt-polyfill.js","ai-cap-registry.js","ai-cap-image.js","ai-cap-vision.js",
  "ai-cap-audio.js","ai-cap-embed.js","ai-cap-translate.js","ai-cap-video.js","ai-cap-3d.js",
]

RE_TAG = re.compile(r"<(script|link)\b[^>]*?(?:src|href)\s*=\s*\"([^\"]+)\"", re.I)
RE_IMPORT = re.compile(r"@import\s+(?:url\()?[\"']([^\"']+)[\"']", re.I)
RE_STAMP = re.compile(r"(assets/[A-Za-z0-9_\-./]+)\?v=([^\"'\s)>]+)")
RE_HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)

def is_excluded(relpath):
    parts = relpath.replace("\\","/").split("/")
    if parts and parts[0] in EXCLUDE_TOP:
        return True
    low = relpath.replace("\\","/").lower()
    for x in EXCLUDE_ANY:
        if x.lower() in low:
            return True
    return False

def main():
    per_stamp = defaultdict(lambda: defaultdict(list))   # fname -> stamp -> [pages]
    nostamp = defaultdict(list)                          # fname -> [{page,tag,url}]
    page_count = 0
    pages = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        # prune
        dirnames[:] = [d for d in dirnames if not is_excluded(os.path.join(os.path.relpath(dirpath,ROOT), d))]
        for fn in filenames:
            if not fn.lower().endswith((".html",".htm")):
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, ROOT).replace("\\","/")
            if is_excluded(rel):
                continue
            page_count += 1
            pages.append(rel)
            raw = open(p,"rb").read().decode("utf-8", errors="replace")
            stripped = RE_HTML_COMMENT.sub(lambda m:" "*(m.end()-m.start()), raw)
            hits = [(m.group(1).lower(), m.group(2)) for m in RE_TAG.finditer(stripped)]
            hits += [("import", m.group(1)) for m in RE_IMPORT.finditer(stripped)]
            for tag,url in hits:
                sm = RE_STAMP.search(url)
                if sm:
                    fname = os.path.basename(sm.group(1))
                    if fname in WATCH:
                        per_stamp[fname][sm.group(2)].append(rel)
                else:
                    am = re.search(r"assets/([A-Za-z0-9_\-]+\.(?:js|css))$", url.split("?")[0])
                    if am and am.group(1) in WATCH:
                        nostamp[am.group(1)].append({"page":rel,"tag":tag,"url":url})

    out = {"page_count": page_count, "pages": sorted(pages),
           "per_stamp": {k:{s:sorted(set(v)) for s,v in d.items()} for k,d in per_stamp.items()},
           "nostamp": {k:v for k,v in nostamp.items()}}
    io.open(os.path.join(ROOT,"tools","qa","_stamp_final.json"),"w",encoding="utf-8").write(
        json.dumps(out, ensure_ascii=False, indent=2))

    lines = ["page_count=%d" % page_count, ""]
    for fn in WATCH:
        d = per_stamp.get(fn)
        if not d:
            lines.append("=== %s : (无引用)" % fn); continue
        total = len(set(x for v in d.values() for x in v))
        lines.append("=== %s : 真实引用页面 %d 个 ===" % (fn, total))
        for s in sorted(d):
            pgs = sorted(set(d[s]))
            lines.append("    %s  x%d : %s" % (s, len(pgs), ", ".join(pgs)))
        if nostamp.get(fn):
            lines.append("    [无戳] " + "; ".join("%s(%s)"%(x["page"],x["tag"]) for x in nostamp[fn]))
        lines.append("")
    io.open(os.path.join(ROOT,"tools","qa","_stamp_final.txt"),"w",encoding="utf-8").write("\n".join(lines)+"\n")
    print("OK page_count=", page_count)

main()
