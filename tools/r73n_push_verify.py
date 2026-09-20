# -*- coding: utf-8 -*-
# R73n push 终验：ls-remote via 7897
import subprocess, io, os
REPO = r"D:\下载的文件\学习工作台"
env = os.environ.copy()
for k in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']:
    env.pop(k, None)
p = subprocess.run(["git", "-C", REPO, "-c", "http.proxy=http://127.0.0.1:7897",
                    "-c", "https.proxy=http://127.0.0.1:7897",
                    "ls-remote", "origin", "refs/heads/main"],
                   capture_output=True, timeout=120, env=env)
p2 = subprocess.run(["git", "-C", REPO, "rev-parse", "HEAD"], capture_output=True, timeout=60)
io.open(r'C:\Users\ATM\_r73n_push_verify.txt', 'w', encoding='utf-8').write(
    'ls-remote rc=%d out=%r\nlocal HEAD=%r\nmatch=%s' % (
        p.returncode, p.stdout.decode('utf-8', 'replace').strip(),
        p2.stdout.decode('utf-8', 'replace').strip(),
        p.stdout.decode().split()[0] == p2.stdout.decode().strip() if p.returncode == 0 else 'n/a'))
