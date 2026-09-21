# -*- coding: utf-8 -*-
# R73n push 第三次：清除 env 代理后分别试 7897 / 真直连，全日志落盘
import socket, subprocess, io, os

REPO = r"D:\下载的文件\学习工作台"
OUT = r'C:\Users\ATM\_r73n_push3_out.txt'
LOG = []

def run(args, timeout=420, clean_env=False, extra_env=None):
    env = os.environ.copy()
    if clean_env:
        for k in ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']:
            env.pop(k, None)
    if extra_env:
        env.update(extra_env)
    p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false"] + args,
                       capture_output=True, timeout=timeout, env=env)
    return p.returncode, p.stdout.decode('utf-8', 'replace'), p.stderr.decode('utf-8', 'replace')

def port_open(host, port):
    try:
        s = socket.create_connection((host, port), timeout=2); s.close(); return True
    except OSError:
        return False

ok = False
# 先探 7897 是否真的活着（用 socket 直连 google 经 7897 测 HTTP 可用性）
alive7897 = port_open('127.0.0.1', 7897)
LOG.append('7897 port open: %s' % alive7897)
if alive7897:
    LOG.append('--- push via 7897 (env proxy cleared) ---')
    rc, out, err = run(["-c", "http.proxy=http://127.0.0.1:7897",
                        "-c", "https.proxy=http://127.0.0.1:7897",
                        "-c", "http.version=HTTP/1.1",
                        "push", "origin", "main"],
                       clean_env=True,
                       extra_env={'GIT_CURL_VERBOSE': '1', 'GIT_TRACE_PACKET': '1'})
    LOG.append('rc=%d\nOUT:%s\nERR:%s' % (rc, out[-1000:], err[-2500:]))
    ok = rc == 0

if not ok:
    LOG.append('--- true direct push (env proxy cleared) ---')
    rc, out, err = run(["-c", "http.version=HTTP/1.1", "push", "origin", "main"], clean_env=True)
    LOG.append('rc=%d\nOUT:%s\nERR:%s' % (rc, out[-1000:], err[-2500:]))
    ok = rc == 0

if ok:
    rc, so, _ = run(["ls-remote", "origin", "refs/heads/main"], clean_env=True)
    rc2, so2, _ = run(["rev-parse", "HEAD"])
    remote = so.split()[0] if so.strip() else None
    LOG.append('remote=%s local=%s match=%s' % (remote, so2.strip(), remote == so2.strip()))

LOG.append('FINAL: ' + ('PUSH-OK' if ok else 'PUSH-FAIL'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
