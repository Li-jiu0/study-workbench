# -*- coding: utf-8 -*-
"""打戳 20260916R：仅 4 个本批改动的 AI 资产（ai-config/ai-service/ai-page/ai-settings）Q→R。
铁律：属性锚定 / 捕获组不带后缀 / 二进制读写保行尾 / 独立终态复验 / .js.js 显式扫 0。"""
import os, re, sys

ROOT = r"D:\下载的文件\学习工作台"
STAMP_OLD = b"20260916Q"
STAMP_NEW = b"20260916R"
ASSETS = ["ai-config", "ai-service", "ai-page", "ai-settings"]

# 属性锚定 pattern：捕获组不含后缀（防 .js.js 双后缀陷阱）
pat = re.compile(
    rb'((?:src|href)\s*=\s*["\']assets/(' + b"|".join(a.encode() for a in ASSETS) +
    rb')\.js)\?v=' + STAMP_OLD + rb'(["\'])'
)

pages = sorted(n for n in os.listdir(ROOT)
               if n.endswith(".html") and ".bak" not in n and not n.startswith("_"))

total = 0
touched = []
for n in pages:
    p = os.path.join(ROOT, n)
    raw = open(p, "rb").read()
    pre_crlf = raw.count(b"\r\n"); pre_lf = raw.count(b"\n") - pre_crlf; pre_cr = raw.count(b"\r") - pre_crlf
    raw2, k = pat.subn(rb"\1?v=" + STAMP_NEW + rb"\3", raw)
    if k:
        open(p, "wb").write(raw2)
        post_crlf = raw2.count(b"\r\n"); post_lf = raw2.count(b"\n") - post_crlf; post_cr = raw2.count(b"\r") - post_crlf
        if (pre_crlf, pre_lf, pre_cr) != (post_crlf, post_lf, post_cr):
            print("EOL-DRIFT:", n, (pre_crlf, pre_lf, pre_cr), "->", (post_crlf, post_lf, post_cr)); sys.exit(3)
        total += k; touched.append((n, k))

print("REPLACED:", total, "PAGES:", len(touched))

# ── 独立终态复验（用与替换不同的 pattern）──
stat = {a: {"Q": 0, "R": 0} for a in ASSETS}
for n in pages:
    t = open(os.path.join(ROOT, n), "rb").read().decode("utf-8", "ignore")
    for m in re.finditer(r'(?:src|href)\s*=\s*["\']assets/(ai-[a-z]+)\.js\?v=([0-9A-Za-z]+)["\']', t):
        if m.group(1) in stat:
            stat[m.group(1)][m.group(2)[-1]] += 1
print("FINAL-STAT:", {a: f"Q={v['Q']},R={v['R']}" for a, v in sorted(stat.items())})

# 全站显式扫 .js.js?v= 与残留 Q
jsjs = 0; q_left = 0
for n in pages:
    t = open(os.path.join(ROOT, n), "rb").read()
    jsjs += len(re.findall(rb"\.js\.js\?v=", t))
    q_left += len(re.findall(rb'assets/(?:ai-config|ai-service|ai-page|ai-settings)\.js\?v=20260916Q', t))
print("JSJS-HITS:", jsjs, "| Q-LEFT:", q_left)
print("OK" if (total == 65 and jsjs == 0 and q_left == 0
              and all(v["Q"] == 0 for v in stat.values())
              and stat["ai-config"]["R"] == 32 and stat["ai-service"]["R"] == 31
              and stat["ai-page"]["R"] == 1 and stat["ai-settings"]["R"] == 1) else "MISMATCH")
