# -*- coding: utf-8 -*-
# 主理人终验 R75（只读）
import os, io, datetime, re

P = r"D:\下载的文件\学习工作台\assets\ai-config.js"
out = []
with open(P, "rb") as f:
    b = f.read()
t = b.decode("utf-8", errors="replace")
mt = datetime.datetime.fromtimestamp(os.path.getmtime(P)).strftime("%m-%d %H:%M:%S")
out.append("size=%d mtime=%s" % (len(b), mt))

# 新 key
new_keys = ["***REMOVED-BY-R2C***",
            "AQ.***REDACTED-已泄露作废-需换新KEY***",
            "<REDACTED-ZHIPU-API-KEY>"]
old_keys = ["<REDACTED-OPENROUTER-旧KEY前缀>", "AQ.***REDACTED-已泄露作废-需换新KEY***", "<REDACTED-32HEX-旧KEY>"]
for k in new_keys:
    out.append("new key %s... count=%d (expect 1)" % (k[:12], t.count(k)))
for k in old_keys:
    out.append("old key %s... count=%d (expect 0)" % (k[:12], t.count(k)))

# 被删模型
deleted = ["gemma-4-31b", "llama-3.1-8b", "llama-3.2-3b", "zephyr-7b", "mistral-7b", "mythomist", "toppy",
           "glm-4.5", "glm-4-5", "glm-5.1", "glm-5.2", "glm-5.3-flash", "glm-5-turbo",
           "gemini-2.5", "gemini-2.0", "gemini-1.5", "deepseek", "kimi", "glm-4-flash", "glm-4-9b"]
for d in deleted:
    n = t.count(d)
    if n:
        # 千帆被删的 glm-5.3 也算；火山方舟若含 glm-5-3-flash-260828 需豁免判断
        out.append("deleted-model %s count=%d (expect 0) -- CHECK" % (d, n))
out.append("deleted scan done")

# 保留模型
kept = ["or-auto", "or-nemotron-super", "or-nemotron-ultra", "glm-4.7", "glm-4v-flash", "glm-4.6v-flash",
        "ernie-4.5-turbo-32k", "ernie-4.5-turbo-128k", "gemini-3.5-flash", "gemini-3.5-flash-lite"]
for k in kept:
    out.append("kept %s count=%d" % (k, t.count(k)))

# 硅基 provider 保留
out.append("siliconflow apiUrl preserved=%s apiKey preserved=%s" % ("apiUrl" in t, t.count("apiKey") > 0))

# 行尾
crlf = b.count(b"\r\n")
lf = b.count(b"\n")
cr = b.count(b"\r")
out.append("CRLF=%d LF=%d CR=%d bareLF=%d (expect CRLF==LF==CR, bareLF=0)" % (crlf, lf, cr, lf - crlf))

# ES2017（活代码）
hits = 0
for i, line in enumerate(t.splitlines(), 1):
    s = line.strip()
    if s.startswith("//") or s.startswith("*") or s.startswith("/*"):
        continue
    for pat in [r"\?\.", r"\?\?", r"\.replaceAll\(", r"Object\.fromEntries", r"\.at\("]:
        if re.search(pat, line):
            hits += 1
            out.append("  ES2017 L%d: %s" % (i, s[:60]))
out.append("ES2017 hits=%d (expect 0)" % hits)

# 备份
bak = P + ".bak-pre-r75-20260917"
out.append("backup exists=%s size=%d" % (os.path.exists(bak), os.path.getsize(bak) if os.path.exists(bak) else -1))

io.open(r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8677e3fc\_r75_lead_verify.txt", "w", encoding="utf-8").write("\n".join(out))
print("done")
