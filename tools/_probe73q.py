# -*- coding: utf-8 -*-
import subprocess, os, time, json, sys

OUTDIR = r"D:/下载的文件/学习工作台/tools"
PY = sys.executable
PROXY = "http://127.0.0.1:7897"
GEN_KEY = "AQ.***REDACTED-已泄露作废-需换新KEY***"
ARK_KEY = "<REDACTED-ARK-API-KEY>"
GEM_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations"

results = []

def run_curl(label, args, timeout=60, proxy_mode=None):
    """
    proxy_mode: 'proxy' -> use -x PROXY; 'direct' -> --noproxy '*'; None -> default (no -x, but no noproxy)
    """
    bodyf = os.path.join(OUTDIR, "_probe73q_body.tmp")
    hdrf = os.path.join(OUTDIR, "_probe73q_hdr.tmp")
    for f in (bodyf, hdrf):
        if os.path.exists(f):
            os.remove(f)
    cmd = ["curl", "-sS", "-m", str(timeout), "-o", bodyf, "-D", hdrf,
           "-w", "HTTP:%{http_code}|TIME:%{time_total}", "--connect-timeout", "15"]
    if proxy_mode == "proxy":
        cmd += ["-x", PROXY]
    elif proxy_mode == "direct":
        cmd += ["--noproxy", "*"]
    cmd += args
    t0 = time.perf_counter()
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout+30)
        rc = p.returncode
        meta = p.stdout.strip()
    except subprocess.TimeoutExpired:
        meta = "TIMEOUT"
        rc = -1
    dt = time.perf_counter() - t0
    body = ""
    hdr = ""
    if os.path.exists(bodyf):
        with open(bodyf, "r", encoding="utf-8", errors="replace") as f:
            body = f.read()
    if os.path.exists(hdrf):
        with open(hdrf, "r", encoding="utf-8", errors="replace") as f:
            hdr = f.read()
    results.append({
        "label": label, "cmd": " ".join(cmd), "rc": rc, "meta": meta,
        "elapsed_py": round(dt*1000, 1), "body": body, "header": hdr
    })
    return results[-1]

def trunc(s, n):
    s = s or ""
    return s[:n] + ("...[truncated]" if len(s) > n else "")

print("==== START PROBE 73q ====")

# ============ 问题一：Gemini ============
# 1. POST ?key= via proxy
run_curl("G1 POST ?key= via proxy", [
    "-X", "POST",
    f"{GEM_BASE}/gemini-3.5-flash:generateContent?key={GEN_KEY}",
    "-H", "Content-Type: application/json",
    "-d", '{"contents":[{"role":"user","parts":[{"text":"hi"}]}]}'
], timeout=60, proxy_mode="proxy")

# 1b. POST ?key= DIRECT (no proxy) to compare — one shot
run_curl("G1b POST ?key= DIRECT (no proxy)", [
    "-X", "POST",
    f"{GEM_BASE}/gemini-3.5-flash:generateContent?key={GEN_KEY}",
    "-H", "Content-Type: application/json",
    "-d", '{"contents":[{"role":"user","parts":[{"text":"hi"}]}]}'
], timeout=60, proxy_mode="direct")

# 2. key in header x-goog-api-key via proxy
run_curl("G2 POST x-goog-api-key header via proxy", [
    "-X", "POST",
    f"{GEM_BASE}/gemini-3.5-flash:generateContent",
    "-H", "Content-Type: application/json",
    "-H", f"x-goog-api-key: {GEN_KEY}",
    "-d", '{"contents":[{"role":"user","parts":[{"text":"hi"}]}]}'
], timeout=60, proxy_mode="proxy")

# 3. key in Authorization: Bearer via proxy
run_curl("G3 POST Authorization Bearer via proxy", [
    "-X", "POST",
    f"{GEM_BASE}/gemini-3.5-flash:generateContent",
    "-H", "Content-Type: application/json",
    "-H", f"Authorization: Bearer {GEN_KEY}",
    "-d", '{"contents":[{"role":"user","parts":[{"text":"hi"}]}]}'
], timeout=60, proxy_mode="proxy")

# 4a. GET model existence via proxy
run_curl("G4 GET model gemini-3.5-flash via proxy", [
    "-X", "GET",
    f"{GEM_BASE}/gemini-3.5-flash?key={GEN_KEY}"
], timeout=60, proxy_mode="proxy")

# 4b. GET models list via proxy (to discover real names)
run_curl("G5 GET models list via proxy", [
    "-X", "GET",
    f"{GEM_BASE}?key={GEN_KEY}"
], timeout=60, proxy_mode="proxy")

# 5a. CORS check: GET with Origin header, look at response headers
run_curl("G6 CORS GET with Origin via proxy", [
    "-X", "GET",
    f"{GEM_BASE}/gemini-3.5-flash?key={GEN_KEY}",
    "-H", "Origin: http://110.42.134.62"
], timeout=60, proxy_mode="proxy")

# 5b. OPTIONS preflight
run_curl("G7 OPTIONS preflight via proxy", [
    "-X", "OPTIONS",
    f"{GEM_BASE}/gemini-3.5-flash:generateContent?key={GEN_KEY}",
    "-H", "Access-Control-Request-Method: POST",
    "-H", "Access-Control-Request-Headers: content-type",
    "-H", "Origin: http://110.42.134.62"
], timeout=60, proxy_mode="proxy")

# ============ 问题二：Seedream (direct, no proxy) ============
seed_models = [
    "doubao-seedream-4-0-250828",
    "doubao-seedream-4-0-20260415",
    "doubao-seedream-5-0-pro-260628",
]
for m in seed_models:
    run_curl(f"S1 seedream {m} (size 1024x1024, url)", [
        "-X", "POST", ARK_URL,
        "-H", "Content-Type: application/json",
        "-H", f"Authorization: Bearer {ARK_KEY}",
        "-d", json.dumps({"model": m, "prompt": "a red apple", "size": "1024x1024", "response_format": "url"})
    ], timeout=120, proxy_mode="direct")

# Retry corrections for each failing model: variant A (drop response_format), variant B (size "1:1")
for m in seed_models:
    run_curl(f"S2 seedream {m} retry (no response_format, size 1024x1024)", [
        "-X", "POST", ARK_URL,
        "-H", "Content-Type: application/json",
        "-H", f"Authorization: Bearer {ARK_KEY}",
        "-d", json.dumps({"model": m, "prompt": "a red apple", "size": "1024x1024"})
    ], timeout=120, proxy_mode="direct")
    run_curl(f"S3 seedream {m} retry (size 1:1, no response_format)", [
        "-X", "POST", ARK_URL,
        "-H", "Content-Type: application/json",
        "-H", f"Authorization: Bearer {ARK_KEY}",
        "-d", json.dumps({"model": m, "prompt": "a red apple", "size": "1:1"})
    ], timeout=120, proxy_mode="direct")

# ============ assemble report ============
rep = []
rep.append("=" * 70)
rep.append("取证报告 _probe73q  (Gemini / 火山方舟 Seedream 实测)")
rep.append("生成时间: " + time.strftime("%Y-%m-%d %H:%M:%S"))
rep.append("网络: Clash 代理 " + PROXY + " (Google 系) / 国内直连 (火山)")
rep.append("=" * 70)

def cors_header(hdr):
    for line in (hdr or "").splitlines():
        if "access-control-allow-origin" in line.lower() or "access-control" in line.lower():
            return line.strip()
    return "(无 access-control-* 头)"

for r in results:
    rep.append("\n" + "-" * 60)
    rep.append("【" + r["label"] + "】")
    rep.append("CMD: " + r["cmd"])
    rep.append(f"returncode={r['rc']}  curl_meta={r['meta']}  py_elapsed_ms={r['elapsed_py']}")
    rep.append("--- 响应头(部分) ---")
    rep.append(trunc(r["header"], 600))
    ac = cors_header(r["header"])
    if "CORS" in r["label"] or "preflight" in r["label"] or "OPTIONS" in r["label"]:
        rep.append(">> CORS 相关头: " + ac)
    rep.append("--- 响应体(前400字符) ---")
    rep.append(trunc(r["body"], 400))

# Special analysis: discover real gemini model names from G5
rep.append("\n" + "=" * 70)
rep.append("【模型名可用性分析 G5 GET models list】")
g5 = results[5]["body"] if len(results) > 5 else ""
names = []
import re
for mm in re.findall(r'"(gemini[^"]*)"', g5):
    names.append(mm)
seen = sorted(set(names))
rep.append("列表中出现的所有 gemini* 模型名 (" + str(len(seen)) + " 个):")
rep.append(", ".join(seen))
rep.append("是否含 gemini-3.5-flash: " + str("gemini-3.5-flash" in seen))
rep.append("是否含 gemini-3.5-flash-lite: " + str("gemini-3.5-flash-lite" in seen))

report_txt = "\n".join(rep)
outpath = r"C:/Users/ATM/_probe73q_report.txt"
with open(outpath, "w", encoding="utf-8") as f:
    f.write(report_txt)
with open(os.path.join(OUTDIR, "_probe73q_raw.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print("REPORT WRITTEN -> " + outpath)
print("RAW JSON -> " + os.path.join(OUTDIR, "_probe73q_raw.json"))
print("==== DONE ====")
