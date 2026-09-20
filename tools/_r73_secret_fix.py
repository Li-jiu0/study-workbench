# -*- coding: utf-8 -*-
# R73b git 步骤5：脱敏 -> amend -> push -> 还原本地真实Key
import io, re, shutil, subprocess, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
REPO = r"D:\下载的文件\学习工作台"
TOKEN_RE = re.compile(rb'AQ\.[A-Za-z0-9_\-]{40,}')
MASK = 'AQ.****REDACTED-KEY(完整Key仅存本地未入库****'.encode('utf-8')
files = [
    r"D:\下载的文件\学习工作台\assets\ai-config.js",
    r"D:\下载的文件\学习工作台\Gemini连接问题排查与处理方案.md",
    r"D:\下载的文件\学习工作台\需求文档-各平台模型状态更新.md",
]

def run(args, timeout=280):
    p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false"] + args,
                       capture_output=True, timeout=timeout)
    return p.returncode, p.stdout.decode('utf-8','replace'), p.stderr.decode('utf-8','replace')

# 1) 备份 + 脱敏
for fp in files:
    shutil.copyfile(fp, fp + ".bak-secretfix")
    with io.open(fp, 'rb') as f:
        data = f.read()
    n = len(TOKEN_RE.findall(data))
    data2 = TOKEN_RE.sub(MASK, data)
    with io.open(fp, 'wb') as f:
        f.write(data2)
    print("sanitized %d token(s) in %s" % (n, fp))

# 2) amend（保持原提交信息）
rc, out, err = run(["add", "--",
                    "assets/ai-config.js",
                    "Gemini连接问题排查与处理方案.md",
                    "需求文档-各平台模型状态更新.md"])
print("add rc=%d" % rc)
rc, out, err = run(["commit", "--amend", "--no-edit"])
print("amend rc=%d %s" % (rc, err.strip()[:300]))

# 3) push 走 7897
rc, out, err = run(["-c", "http.proxy=http://127.0.0.1:7897",
                    "-c", "https.proxy=http://127.0.0.1:7897",
                    "-c", "http.version=HTTP/1.1",
                    "push", "origin", "main"], timeout=500)
print("push rc=%d" % rc)
if out.strip(): print(out[-600:])
if err.strip(): print("ERR:", err[-800:])

# 4) 还原本地真实 Key
for fp in files:
    shutil.copyfile(fp + ".bak-secretfix", fp)
    with io.open(fp, 'rb') as f:
        data = f.read()
    real = len(TOKEN_RE.findall(data))
    print("restored real key in %s -> tokens=%d" % (fp, real))

# 5) 验证 HEAD 已脱敏、工作区有真实Key
rc, out, err = run(["show", "HEAD:assets/ai-config.js"])
print("HEAD contains REDACTED:", b'REDACTED' in out.encode('utf-8', 'replace') or 'REDACTED' in out)
rc, out, err = run(["log", "--oneline", "-2"])
print(out)
print("DONE")
