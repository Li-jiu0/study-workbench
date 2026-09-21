# -*- coding: utf-8 -*-
"""R90 QA 块2：四档视口跑 CDP 探针，汇总 .im-composer 溢出 + .xtlp 截断"""
import json, os, subprocess, sys

ROOT = r"D:\下载的文件\学习工作台"
NODE = r"C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe"
URL = "file:///D:/%E4%B8%8B%E8%BD%BD%E7%9A%84%E6%96%87%E4%BB%B6/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0/%E7%A7%81%E8%81%8A.html"
PROBE = "tools/qa/r90_qa_probe_b2b.js"
PRELOAD = "tools/qa/r90_qa_preload.js"

VIEWPORTS = [(375, 667), (375, 480), (320, 480), (320, 400)]

out = []
env = dict(os.environ)
env["NODE_PATH"] = "C:/Users/ATM/node_modules"

for (w, h) in VIEWPORTS:
    jf = os.path.join(ROOT, "tools", "qa", "r90_qa_b2_%dx%d.json" % (w, h))
    r = subprocess.run([NODE, "tools/qa/r90_qa_cdp.js", URL, str(w), str(h), PROBE, PRELOAD],
                       cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", env=env, timeout=180)
    txt = (r.stdout or "").strip()
    try:
        d = json.loads(txt.split("\n")[-1])
    except Exception as e:
        d = {"ok": False, "parse_error": str(e), "raw": txt[:1500], "stderr": (r.stderr or "")[:800]}
    open(jf, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=1))

    out.append("=" * 78)
    out.append("VIEWPORT %dx%d   ok=%s" % (w, h, d.get("ok")))
    if not d.get("ok"):
        out.append("  ERR: " + json.dumps(d, ensure_ascii=False)[:1200])
        continue
    v = d.get("value") or {}

    # --- 输入栏 ---
    c = v.get("composer")
    if c:
        out.append("  [输入栏 .im-composer] rect=%s" % json.dumps(c["rect"]))
        out.append("    scrollWidth=%s clientWidth=%s overflowX=%s display=%s flexWrap=%s gap=%s"
                   % (c["scrollWidth"], c["clientWidth"], c["overflowX"], c["display"], c["flexWrap"], c["gap"]))
        out.append("    childCount=%s  越界子元素=%s  重叠=%s"
                   % (c["childCount"], json.dumps(c["childrenBeyondRight"], ensure_ascii=False),
                      json.dumps(c["overlap"], ensure_ascii=False)))
        for k in c["children"]:
            out.append("      [%d] %s#%s .%s rect=%s" % (k["i"], k["tag"], k["id"], k["cls"], json.dumps(k["rect"])))
    else:
        out.append("  [输入栏] .im-composer 未找到")
    out.append("  [imLocBtn] " + json.dumps(v.get("locBtn"), ensure_ascii=False))
    out.append("  [图标顺序] " + json.dumps(v.get("composerIconOrder"), ensure_ascii=False))
    out.append("  [XT_LOC_PICK] " + json.dumps(v.get("regionFn"), ensure_ascii=False))
    out.append("  [openAttempt] " + json.dumps(v.get("openAttempt"), ensure_ascii=False))

    # --- .xtlp ---
    if not v.get("xtlpExists"):
        out.append("  [.xtlp] 未出现（openPicker 未成功打开）")
        continue
    out.append("  [.xtlp] " + json.dumps(v.get("xtlp"), ensure_ascii=False))
    out.append("  [.xtlp-body] " + json.dumps(v.get("xtlpBody"), ensure_ascii=False))
    for key in ["head", "search", "map", "list", "foot"]:
        p = v["parts"].get(key)
        if p and p.get("found"):
            out.append("    %-7s rect=%s height=%s minH=%s maxH=%s oy=%s scrollH=%s clientH=%s"
                       % (key, json.dumps(p["rect"]), p["height"], p["minHeight"], p["maxHeight"],
                          p["overflowY"], p["scrollHeight"], p["clientHeight"]))
        else:
            out.append("    %-7s NOT FOUND" % key)
    out.append("  [overheadAbove] " + json.dumps(v.get("overheadAbove"), ensure_ascii=False))
    core = v.get("core") or {}
    out.append("  ★CORE innerHeight=%s footBottom=%s footOverflowPx=%s footVisible=%s"
               % (core.get("innerHeight"), core.get("footBottom"), core.get("footOverflowPx"), core.get("footVisible")))
    out.append("  ★CORE listClientHeight=%s listMinOK(>=180)=%s listScrollable=%s scrollTop %s->%s works=%s"
               % (core.get("listClientHeight"), core.get("listMinOK"), core.get("listScrollable"),
                  core.get("listScrollTopBefore"), core.get("listScrollTopAfter"), core.get("listScrollReallyWorks")))
    cz = v.get("causal") or {}
    out.append("  [因果-修复态] " + json.dumps(cz.get("beforeDisable"), ensure_ascii=False))
    out.append("  [因果-已禁用断点] " + json.dumps(cz.get("disabledConds"), ensure_ascii=False))
    out.append("  [因果-禁用后] " + json.dumps(cz.get("afterDisable"), ensure_ascii=False))
    if cz.get("err"):
        out.append("  [因果-err] " + str(cz["err"]))
    out.append("  [含 .xtlp 的 media 断点] " + json.dumps(cz.get("mediaBreakpointsWithXtlp"), ensure_ascii=False)[:1200])

txt = "\n".join(out)
open(os.path.join(ROOT, "tools", "qa", "r90_qa_block2.out.txt"), "w", encoding="utf-8").write(txt)
print(txt)
