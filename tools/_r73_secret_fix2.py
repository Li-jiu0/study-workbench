# -*- coding: utf-8 -*-
# R73b git 步骤6：第二轮脱敏(sk-or-v1) -> amend -> push -> 还原
import io, re, shutil, subprocess, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
REPO = r"D:\下载的文件\学习工作台"
PATTERNS = [
    re.compile(rb'AQ\.[A-Za-z0-9_\-]{40,}'),
    re.compile(rb'sk-or-v1-[A-Za-z0-9_\-]{20,}'),
]
MASK = b'****REDACTED-KEY(full-key-kept-local-only)****'
files = [
    r"D:\下载的文件\学习工作台\assets\ai-config.js",
    r"D:\下载的文件\学习工作台\需求文档-各平台模型状态更新.md",
]

def run(args, timeout=500):
    p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false"] + args,
                       capture_output=True, timeout=timeout)
    return p.returncode, p.stdout.decode('utf-8','replace'), p.stderr.decode('utf-8','replace')

for fp in files:
    shutil.copyfile(fp, fp + ".bak-secretfix2")
    with io.open(fp, 'rb') as f:
        data = f.read()
    n = sum(len(rx.findall(data)) for rx in PATTERNS)
    data2 = data
    for rx in PATTERNS:
        data2 = rx.sub(MASK, data2)
    with io.open(fp, 'wb') as f:
        f.write(data2)
    print("sanitized %d token(s) in %s" % (n, fp))

rc, out, err = run(["add", "--", "assets/ai-config.js", "需求文档-各平台模型状态更新.md"])
print("add rc=%d" % rc)
rc, out, err = run(["commit", "--amend", "--no-edit"])
print("amend rc=%d %s" % (rc, err.strip()[:200]))

rc, out, err = run(["-c", "http.proxy=http://127.0.0.1:7897",
                    "-c", "https.proxy=http://127.0.0.1:7897",
                    "-c", "http.version=HTTP/1.1",
                    "push", "origin", "main"])
print("push rc=%d" % rc)
if out.strip(): print(out[-400:])
if err.strip(): print("ERR:", err[-700:])

for fp in files:
    shutil.copyfile(fp + ".bak-secretfix2", fp)
    with io.open(fp, 'rb') as f:
        data = f.read()
    real = sum(len(rx.findall(data)) for rx in PATTERNS)
    print("restored %s -> real tokens=%d" % (fp, real))

rc, out, err = run(["show", "HEAD:assets/ai-config.js"])
has_redacted = b'REDACTED-KEY' in out.encode('utf-8','replace')
print("HEAD ai-config.js redacted:", has_redacted)
rc, out, err = run(["log", "--oneline", "-2"])
print(out)
print("DONE")
