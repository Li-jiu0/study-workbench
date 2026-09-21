# -*- coding: utf-8 -*-
"""构建精确替换计划（只读）：遍历真实页面，找 bump-assets 的引用，记录 (page, asset, old_stamp)。
对 blog_wechat.html 特殊处理：8 个 ai-cap-*.js 无戳 -> 加戳；ai-config.js 20260918b -> d。
"""
import os, re, io, json
from collections import defaultdict

ROOT = r"D:\下载的文件\学习工作台"
NEW = "20260918d"

# 本批要刷到 d 的资源
BUMP = ["common.css","xt-profile.css","xt-update.js","xt-moments.js","xt-profile.js",
        "ai-service.js","ai-settings.js","ai-page.js"]

# blog_wechat 额外补齐（选 b）
BW_EXTRA_STAMPED = {"ai-config.js": "20260918b"}      # 有旧戳 -> 升 d
BW_EXTRA_NOSTAMP = ["ai-cap-registry.js","ai-cap-image.js","ai-cap-vision.js",
                    "ai-cap-audio.js","ai-cap-embed.js","ai-cap-translate.js",
                    "ai-cap-video.js","ai-cap-3d.js"]  # 无戳 -> 加 d

EXCLUDE_TOP = {"备份","android","server","web","docs","deliverables","tools","node_modules",".git"}
EXCLUDE_ANY = (".tmp_eng","_bak-pre-",".qa","node_modules",".git")

def excluded(rel):
    parts = rel.replace("\\","/").split("/")
    if parts and parts[0] in EXCLUDE_TOP: return True
    low = rel.replace("\\","/").lower()
    return any(x.lower() in low for x in EXCLUDE_ANY)

# 抓标签内 url
RE_TAG = re.compile(r"<(script|link)\b[^>]*?(?:src|href)\s*=\s*\"([^\"]+)\"", re.I)
RE_COMMENT = re.compile(r"<!--.*?-->", re.S)

def main():
    plan = []   # each: {page, asset, old, new, kind}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if not excluded(os.path.join(os.path.relpath(dirpath,ROOT),d))]
        for fn in filenames:
            if not fn.lower().endswith((".html",".htm")): continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, ROOT).replace("\\","/")
            if excluded(rel): continue
            raw = open(p,"rb").read().decode("utf-8", errors="replace")
            # 记录注释区间，用于排除假命中
            comment_spans = [(m.start(), m.end()) for m in RE_COMMENT.finditer(raw)]
            def in_comment(idx):
                return any(a <= idx < b for a,b in comment_spans)
            for m in RE_TAG.finditer(raw):
                if in_comment(m.start()):   # 标签在注释里 -> 跳过
                    continue
                url = m.group(2)
                # strip query
                base = url.split("?")[0]
                amb = re.search(r"(?:^|/)assets/([A-Za-z0-9_\-]+\.(?:js|css))$", base)
                if not amb: continue
                asset = amb.group(1)
                qm = re.search(r"\?v=([^\"'&\s]+)", url)
                old = qm.group(1) if qm else None
                if asset in BUMP:
                    if old is None:
                        plan.append({"page":rel,"asset":asset,"old":None,"new":NEW,"kind":"nostamp-bump"})
                    elif old != NEW:
                        plan.append({"page":rel,"asset":asset,"old":old,"new":NEW,"kind":"bump"})
                elif rel == "blog_wechat.html":
                    if asset in BW_EXTRA_STAMPED and old and old != NEW:
                        plan.append({"page":rel,"asset":asset,"old":old,"new":NEW,"kind":"bw-extra-stamped"})
                    elif asset in BW_EXTRA_NOSTAMP and old is None:
                        plan.append({"page":rel,"asset":asset,"old":None,"new":NEW,"kind":"bw-extra-nostamp"})
    io.open(os.path.join(ROOT,"tools","qa","_stamp_edit_plan.json"),"w",encoding="utf-8").write(
        json.dumps(plan, ensure_ascii=False, indent=2))
    # 摘要
    by_asset = defaultdict(int); by_kind=defaultdict(int); pages=set()
    for x in plan:
        by_asset[x["asset"]]+=1; by_kind[x["kind"]]+=1; pages.add(x["page"])
    lines=["total_ops=%d  pages=%d" % (len(plan), len(pages)), ""]
    lines.append("by kind: " + ", ".join("%s=%d"%(k,v) for k,v in sorted(by_kind.items())))
    lines.append("")
    lines.append("by asset:")
    for a in sorted(by_asset): lines.append("  %s x%d"%(a,by_asset[a]))
    io.open(os.path.join(ROOT,"tools","qa","_stamp_edit_plan.txt"),"w",encoding="utf-8").write("\n".join(lines)+"\n")
    print("OK ops=", len(plan))

main()
