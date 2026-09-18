# -*- coding: utf-8 -*-
import re

p = r"D:\下载的文件\学习工作台\assets\ai-config.js"
t = open(p, "rb").read().decode("utf-8")
out = []
# find builtinModels array region
i = t.find("builtinModels")
out.append("builtinModels index=%d" % i)
seg = t[i:i + 2500]
out.append(seg[:2500])
# collect id/provider pairs
pairs = re.findall(r'\{[^{}]*?id\s*:\s*"([^"]+)"[^{}]*?provider\s*:\s*"([^"]+)"[^{}]*?\}', t)
seen = {}
for _id, prov in pairs:
    seen.setdefault(prov, []).append(_id)
out.append("--- providers used ---")
for prov in sorted(seen):
    out.append("%s : %d ids  e.g. %s" % (prov, len(seen[prov]), seen[prov][:5]))

with open(r"C:\Users\ATM\_r88m1_cfg.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
