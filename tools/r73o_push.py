# -*- coding: utf-8 -*-
"""R73o push：e34fb3c 经 7897（清环境代理）"""
import subprocess, io, os
REPO = r"D:\下载的文件\学习工作台"
env = os.environ.copy()
for k in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']:
    env.pop(k, None)
p = subprocess.run(["git", "-C", REPO, "-c", "http.proxy=http://127.0.0.1:7897",
                    "-c", "https.proxy=http://127.0.0.1:7897",
                    "-c", "http.version=HTTP/1.1",
                    "push", "origin", "main"],
                   capture_output=True, timeout=420, env=env)
p2 = subprocess.run(["git", "-C", REPO, "-c", "http.proxy=http://127.0.0.1:7897",
                     "-c", "https.proxy=http://127.0.0.1:7897",
                     "ls-remote", "origin", "refs/heads/main"],
                    capture_output=True, timeout=120, env=env)
p3 = subprocess.run(["git", "-C", REPO, "rev-parse", "HEAD"], capture_output=True, timeout=60)
io.open(r'C:\Users\ATM\_r73o_push.txt', 'w', encoding='utf-8').write(
    'push rc=%d\n%s\n%s\nls-remote=%s\nlocal=%s\nmatch=%s' % (
        p.returncode, p.stdout.decode('utf-8', 'ignore').strip()[-300:],
        p.stderr.decode('utf-8', 'ignore').strip()[-500:],
        p2.stdout.decode('utf-8', 'ignore').strip().split('\t')[0] if p2.returncode == 0 else 'FAIL',
        p3.stdout.decode('utf-8', 'ignore').strip(),
        p2.stdout.decode().split()[0] == p3.stdout.decode().strip() if p2.returncode == 0 else 'n/a'))
