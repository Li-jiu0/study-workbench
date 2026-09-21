# -*- coding: utf-8 -*-
"""跑 flex-shrink 判定探针，多档视口"""
import json, os, subprocess

ROOT = r"D:\下载的文件\学习工作台"
NODE = r"C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"
URL = "file:///D:/%E4%B8%8B%E8%BD%BD%E7%9A%84%E6%96%87%E4%BB%B6/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0/%E7%A7%81%E8%81%8A.html"
env = dict(os.environ); env["NODE_PATH"] = "C:/Users/ATM/node_modules"
out = []
for (w, h) in [(375, 667), (375, 560), (375, 480), (320, 480), (320, 400), (375, 360)]:
    r = subprocess.run([NODE, "tools/qa/r90_qa_cdp.js", URL, str(w), str(h),
                        "tools/qa/r90_qa_probe_flexshrink.js", "tools/qa/r90_qa_preload.js"],
                       cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", env=env, timeout=180)
    try:
        d = json.loads((r.stdout or "").strip().split("\n")[-1])
    except Exception as e:
        out.append("%dx%d PARSE-ERR %s" % (w, h, (r.stdout or "")[:400])); continue
    v = d.get("value") or {}
    out.append("=" * 70)
    out.append("%dx%d  ok=%s  mq=%s" % (w, h, d.get("ok"), json.dumps(v.get("mq"), ensure_ascii=False)))
    for p in v.get("parts") or []:
        out.append("  %-7s rectH=%-7s cssHeight=%-8s flexShrink=%s flex=%s minH=%s maxH=%s inlineH=%r"
                   % (p["label"], p["rectH"], p["cssHeight"], p.get("flexShrink"),
                      p.get("flex"), p.get("minHeight"), p.get("maxHeight"), p.get("inlineH")))
    out.append("  body=%s" % json.dumps(v.get("body"), ensure_ascii=False))
    out.append("  sumOfBlocks=%s  detail=%s" % (v.get("sumOfBlocks"), json.dumps(v.get("blockDetail"), ensure_ascii=False)))
    out.append("  mapVerdict=%s" % json.dumps(v.get("mapVerdict"), ensure_ascii=False))
    out.append("  listConflict=%s" % json.dumps(v.get("listConflict"), ensure_ascii=False))
txt = "\n".join(out)
open(os.path.join(ROOT, "tools", "qa", "r90_qa_flexshrink.out.txt"), "w", encoding="utf-8").write(txt)
print(txt)
