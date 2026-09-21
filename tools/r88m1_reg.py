# -*- coding: utf-8 -*-
import json

p = r"D:\下载的文件\学习工作台\server\data\model_registry.json"
d = json.load(open(p, "r", encoding="utf-8"))
out = []
out.append("type=%s keys=%d" % (type(d).__name__, len(d)))
for k in list(d.keys())[:10]:
    out.append("KEY %s -> %s" % (k, json.dumps(d[k], ensure_ascii=False)[:200]))
out.append("--- provider/model pairs ---")
for k in list(d.keys()):
    v = d[k]
    if isinstance(v, dict) and v.get("provider"):
        out.append("%-40s | provider=%-14s | model=%s" % (k, v.get("provider"), v.get("model")))

with open(r"C:\Users\ATM\_r88m1_reg.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
