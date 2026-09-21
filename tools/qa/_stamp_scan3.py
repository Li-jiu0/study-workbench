# -*- coding: utf-8 -*-
"""补充审计3（只读）：
1) 列出所有被引用的 assets/*.js|css 的 mtime/size/行尾（判定哪些属本批）
2) 精确输出待刷资源的 per-stamp 页面清单（JSON）
"""
import os, json, io, datetime
from collections import defaultdict

ROOT = r"D:\下载的文件\学习工作台"

def le(path):
    b = open(path,"rb").read()
    crlf=b.count(b"\r\n"); lf=b.count(b"\n"); cr=b.count(b"\r")
    kind = "CRLF" if (crlf>0 and lf==crlf) else ("LF" if (crlf==0 and lf>0) else "MIXED")
    return {"bytes":len(b),"lines":lf,"crlf":crlf,"lone_lf":lf-crlf,"lone_cr":cr-crlf,"kind":kind}

def main():
    d = json.load(io.open(os.path.join(ROOT,"tools","qa","_stamp_refs2.json"),encoding="utf-8"))
    names = d["all_asset_names"]
    rows=[]
    for n in names:
        p = os.path.join(ROOT,"assets",n)
        if not os.path.exists(p):
            rows.append({"name":n,"exists":False}); continue
        st=os.stat(p); e=le(p)
        rows.append({"name":n,"exists":True,
            "mtime":datetime.datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "size":st.st_size,"bytes":e["bytes"],"lines":e["lines"],
            "crlf":e["crlf"],"lone_lf":e["lone_lf"],"lone_cr":e["lone_cr"],"kind":e["kind"]})
    rows.sort(key=lambda x: (x.get("mtime","") or ""))
    lines=["name\tmtime\tsize\tlines\tcrlf\tloneLF\tloneCR\tkind"]
    for r in rows:
        if not r["exists"]:
            lines.append(r["name"]+"\tMISSING"); continue
        lines.append("\t".join(str(r[k]) for k in ["name","mtime","size","lines","crlf","lone_lf","lone_cr","kind"]))
    io.open(os.path.join(ROOT,"tools","qa","_stamp_assets_meta.txt"),"w",encoding="utf-8").write("\n".join(lines)+"\n")

    # per-stamp precise
    io.open(os.path.join(ROOT,"tools","qa","_stamp_perstamp_pretty.txt"),"w",encoding="utf-8").write(
        json.dumps(d["per_stamp"], ensure_ascii=False, indent=2))
    print("OK rows", len(rows))

main()
