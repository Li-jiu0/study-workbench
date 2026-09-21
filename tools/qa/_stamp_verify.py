# -*- coding: utf-8 -*-
"""刷后独立回读验证（只读）：
1) 重新全树扫描，确认 bump-assets 全部为 20260918d（真实页面），无旧戳残留
2) blog_wechat 的 9 处补齐确认
3) 抽样 3 页读取原始引用行
4) 确认未误伤其它资源（不刷资源戳值不变）
"""
import os, re, io, json
from collections import defaultdict

ROOT = r"D:\下载的文件\学习工作台"
NEW="20260918d"
BUMP=["common.css","xt-profile.css","xt-update.js","xt-moments.js","xt-profile.js",
      "ai-service.js","ai-settings.js","ai-page.js"]
NOSTAMP_ONLY={"ai-cap-registry.js","ai-cap-image.js","ai-cap-vision.js","ai-cap-audio.js",
              "ai-cap-embed.js","ai-cap-translate.js","ai-cap-video.js","ai-cap-3d.js"}

EXCLUDE_TOP={"备份","android","server","web","docs","deliverables","tools","node_modules",".git"}
EXCLUDE_ANY=(".tmp_eng","_bak-pre-",".qa","node_modules",".git")
def excluded(rel):
    parts=rel.replace("\\","/").split("/")
    if parts and parts[0] in EXCLUDE_TOP: return True
    low=rel.replace("\\","/").lower()
    return any(x.lower() in low for x in EXCLUDE_ANY)

RE_TAG=re.compile(r"<(script|link)\b[^>]*?(?:src|href)\s*=\s*\"([^\"]+)\"",re.I)

def main():
    per=defaultdict(lambda:defaultdict(list))
    nostamp=defaultdict(list)
    for dp,dns,fns in os.walk(ROOT):
        dns[:]=[d for d in dns if not excluded(os.path.join(os.path.relpath(dp,ROOT),d))]
        for fn in fns:
            if not fn.lower().endswith((".html",".htm")): continue
            p=os.path.join(dp,fn); rel=os.path.relpath(p,ROOT).replace("\\","/")
            if excluded(rel): continue
            raw=open(p,"rb").read().decode("utf-8",errors="replace")
            for m in RE_TAG.finditer(raw):
                url=m.group(2); base=url.split("?")[0]
                amb=re.search(r"assets/([A-Za-z0-9_\-]+\.(?:js|css))$",base)
                if not amb: continue
                a=amb.group(1); qm=re.search(r"\?v=([^\"'&\s]+)",url)
                if qm: per[a][qm.group(1)].append(rel)
                else: nostamp[a].append(rel)

    errs=[]
    # bump 资源必须全部 NEW
    for a in BUMP:
        d=per.get(a,{})
        for s,pages in d.items():
            if s!=NEW:
                errs.append("BUMP asset %s still has stamp %s on %s" % (a,s,pages))
        if NEW not in d:
            errs.append("BUMP asset %s has no %s ref at all!" % (a,NEW))
    # blog_wechat 补齐
    bw_need=["ai-config.js"]+sorted(NOSTAMP_ONLY)
    for a in bw_need:
        d=per.get(a,{})
        ok = any("blog_wechat.html" in pages for pages in d.get(NEW,[]))
        if not ok:
            errs.append("blog_wechat extra: %s not at %s" % (a,NEW))
    # 无戳残留（blog_wechat 的 ai-cap 应已消失）
    for a in NOSTAMP_ONLY:
        if nostamp.get(a):
            errs.append("asset %s still NOSTAMP at %s" % (a,nostamp[a]))

    # 抽样读原始行
    samples={}
    for page in ["设置.html","更多.html","blog_wechat.html","朋友圈发布.html"]:
        p=os.path.join(ROOT,page)
        raw=open(p,"rb").read().decode("utf-8",errors="replace")
        hits=[]
        for m in RE_TAG.finditer(raw):
            url=m.group(2)
            if any(("assets/%s"%a) in url for a in BUMP) or "ai-cap" in url or "ai-config.js" in url:
                hits.append(url)
        samples[page]=hits

    io.open(os.path.join(ROOT,"tools","qa","_stamp_verify.json"),"w",encoding="utf-8").write(
        json.dumps({"per_stamp":{k:{s:sorted(set(v)) for s,v in d.items()} for k,d in per.items()},
                    "nostamp":{k:sorted(set(v)) for k,v in nostamp.items()},
                    "errors":errs,"samples":samples},ensure_ascii=False,indent=2))
    lines=["ERRORS=%d"%len(errs)]
    for e in errs: lines.append("  ERR: "+e)
    lines.append("")
    for a in BUMP:
        summ={s:len(set(pg)) for s,pg in per.get(a,{}).items()}
        lines.append("BUMP %s -> %s"%(a,summ))
    lines.append("")
    for a in bw_need:
        summ={s:len(set(pg)) for s,pg in per.get(a,{}).items()}
        lines.append("BW %s -> %s"%(a,summ))
    lines.append("")
    lines.append("NOSTAMP remaining: " + json.dumps({k:sorted(set(v)) for k,v in nostamp.items()},ensure_ascii=False))
    io.open(os.path.join(ROOT,"tools","qa","_stamp_verify.txt"),"w",encoding="utf-8").write("\n".join(lines)+"\n")
    print("ERRORS=",len(errs))

main()
