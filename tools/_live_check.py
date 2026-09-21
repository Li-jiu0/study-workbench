# -*- coding: utf-8 -*-
"""线上冒烟：确认 20260915c 批次真的生效（不只看部署脚本输出）。"""
import urllib.request
import urllib.parse

BASE = "http://110.42.134.62"
CHECKS = [
    ("/时政热点.html", ["时政热点", "hnListBody"]),
    ("/申论刷题.html", ["申论"]),
    ("/assets/roleplay.js", ["mountRolePlay"]),
    ("/assets/quest.js", ["openQuest"]),
    ("/mock_exam.html", ["overflow-y:auto"]),
    ("/AI模拟面试.html", ["overflow-y:auto"]),
    ("/assets/app.js", ["xtRenderQText", "AI_LOCAL_INTENTS", "uiConfirm"]),
    ("/assets/api.js", ["editorAiAssistViaApi"]),
]
L = []
for path, needles in CHECKS:
    url = BASE + "/" + urllib.parse.quote(path)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "xt-smoke/1.0"})
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read().decode("utf-8", "replace")
            code = r.status
        hit = [n for n in needles if n in body]
        L.append("[%d] %-28s %5d KB  命中 %d/%d %s" % (
            code, path, len(body) // 1024, len(hit), len(needles),
            "OK" if len(hit) == len(needles) else "缺:" + str([n for n in needles if n not in body])))
    except Exception as e:
        L.append("[ERR] %-28s %r" % (path, e))

# 抽查一张图形推理切图是否真能取到
try:
    import re
    req = urllib.request.Request(BASE + "/assets/app.js", headers={"User-Agent": "x"})
    src = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
    m = re.findall(r"\[IMG:([^\]]+\.png)\]", src)
    sample = m[:3]
    for s in sample:
        u = BASE + "/assets/images/" + urllib.parse.quote(s)
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "x"}), timeout=20) as r:
                L.append("[%d] 切图 %-46s %d KB" % (r.status, s[:46], len(r.read()) // 1024))
        except Exception as e:
            L.append("[ERR] 切图 %s %r" % (s, e))
    if not sample:
        L.append("（app.js 中未取到 [IMG:] 样本）")
except Exception as e:
    L.append("切图抽查失败: %r" % e)

with open(r"D:\下载的文件\学习工作台\tools\_live_out.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(L))
