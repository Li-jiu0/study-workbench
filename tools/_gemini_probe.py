# -*- coding: utf-8 -*-
# 主理人验证：Gemini key 到底是 401 还是可用（走代理 vs 直连）
import json, urllib.request, urllib.error, time

KEY = "***REMOVED-BY-R2C***"
BASE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

def call(model, proxy_url=None, timeout=20):
    url = BASE.format(model=model) + "?key=" + KEY
    body = json.dumps({"contents": [{"parts": [{"text": "hi"}]}]}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    opener = urllib.request.build_opener()
    if proxy_url:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url}))
    t0 = time.time()
    try:
        r = opener.open(req, timeout=timeout)
        txt = r.read().decode("utf-8", errors="replace")
        return "HTTP %d | %.1fs | %s" % (r.status, time.time() - t0, txt[:300].replace("\n", " "))
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", errors="replace")
        return "HTTP %d | %.1fs | %s" % (e.code, time.time() - t0, txt[:300].replace("\n", " "))
    except Exception as e:
        return "ERR %s | %.1fs | %s" % (type(e).__name__, time.time() - t0, str(e)[:200])

out = []
for model in ["gemini-3.5-flash-lite", "gemini-3.5-flash"]:
    out.append("=== %s ===" % model)
    out.append("  [直连]      " + call(model))
    out.append("  [代理7897]  " + call(model, "http://127.0.0.1:7897"))

import io
io.open(r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8677e3fc\_gemini_probe.txt", "w", encoding="utf-8").write("\n".join(out))
print("done")
