# -*- coding: utf-8 -*-
"""刷戳计划（只读，不改）：基于实测 mtime 判定本批，输出建议刷/不刷。"""
import os, json, io, datetime

ROOT = r"D:\下载的文件\学习工作台"
d = json.load(io.open(os.path.join(ROOT,"tools","qa","_stamp_final.json"), encoding="utf-8"))
per = d["per_stamp"]

# 本批落盘阈值：2026-09-18 18:47 之后
THRESHOLD = datetime.datetime(2026,9,18,18,46,0).timestamp()

def mtime(rel):
    p = os.path.join(ROOT, rel)
    return os.stat(p).st_mtime if os.path.exists(p) else None

# 候选资产 -> 物理文件路径
ASSET_FILES = {}
for fn in per:
    ASSET_FILES[fn] = os.path.join("assets", fn)

rows = []
for fn, page_map in per.items():
    path = ASSET_FILES[fn]
    mt = mtime(path)
    mt_s = datetime.datetime.fromtimestamp(mt).strftime("%Y-%m-%d %H:%M:%S") if mt else "?"
    this_batch = (mt is not None and mt >= THRESHOLD)
    stamps = sorted(page_map.keys())
    rows.append({
        "asset": fn,
        "path": path.replace("\\","/"),
        "mtime": mt_s,
        "this_batch": this_batch,
        "stamps": stamps,
        "page_total": len(set(x for v in page_map.values() for x in v)),
        "page_map": {s: len(v) for s,v in page_map.items()},
    })

rows.sort(key=lambda r: (not r["this_batch"], r["mtime"]))

lines = []
lines.append("阈值: 2026-09-18 18:47 之后为「本批」")
lines.append("")
lines.append("### 本批改动（建议刷戳 20260918d）")
for r in rows:
    if r["this_batch"]:
        lines.append("  [%s] %s  网页=%d  戳=%s" % (r["mtime"], r["path"], r["page_total"], r["page_map"]))
lines.append("")
lines.append("### 非本批（保持原戳不动）")
for r in rows:
    if not r["this_batch"]:
        lines.append("  [%s] %s  网页=%d  戳=%s" % (r["mtime"], r["path"], r["page_total"], r["page_map"]))
io.open(os.path.join(ROOT,"tools","qa","_stamp_plan.txt"),"w",encoding="utf-8").write("\n".join(lines)+"\n")
io.open(os.path.join(ROOT,"tools","qa","_stamp_plan.json"),"w",encoding="utf-8").write(json.dumps(rows,ensure_ascii=False,indent=2))
print("OK")
