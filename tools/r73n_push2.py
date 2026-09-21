# -*- coding: utf-8 -*-
# R73n push 重试：多代理轮询 + 直连兜底，日志落盘
import socket, subprocess, io, os

REPO = r"D:\下载的文件\学习工作台"
OUT = r'C:\Users\ATM\_r73n_push2_out.txt'
LOG = []
def log(s): LOG.append(str(s))

def port_open(host, port):
    try:
        s = socket.create_connection((host, port), timeout=2); s.close(); return True
    except OSError:
        return False

env_p = (os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or
         os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy') or '')
cands = []
if env_p:
    cands.append(env_p.replace('http://', '').replace('https://', '').rstrip('/'))
cands += ['127.0.0.1:7897', '127.0.0.1:7890']
alive = []
for c in cands:
    h, _, p = c.partition(':')
    if port_open(h or '127.0.0.1', int(p)):
        alive.append(c)
log('env=%r alive=%r' % (env_p, alive))

def run(args, timeout=300):
    p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false"] + args,
                       capture_output=True, timeout=timeout)
    return p.returncode, p.stdout.decode('utf-8', 'replace'), p.stderr.decode('utf-8', 'replace')

ok = False
for c in alive:
    h, _, pt = c.partition(':')
    url = 'http://%s:%s' % (h, pt)
    log('--- try push via %s ---' % url)
    rc, out, err = run(["-c", "http.proxy=" + url, "-c", "https.proxy=" + url,
                        "-c", "http.version=HTTP/1.1",
                        "push", "--progress", "origin", "main"])
    log('push rc=%d\nOUT:%s\nERR:%s' % (rc, out[-800:], err[-1500:]))
    if rc == 0:
        ok = True
        break

if not ok:
    log('--- try direct (no proxy) ---')
    rc, out, err = run(["-c", "http.version=HTTP/1.1", "push", "--progress", "origin", "main"])
    log('direct rc=%d\nOUT:%s\nERR:%s' % (rc, out[-800:], err[-1500:]))
    ok = rc == 0

if ok:
    rc, so, _ = run(["ls-remote", "origin", "refs/heads/main"])
    rc2, so2, _ = run(["rev-parse", "HEAD"])
    log('remote=%s local=%s match=%s' % (so.split()[0] if so.strip() else None,
                                         so2.strip(), so.split()[0] == so2.strip()))
log('FINAL: ' + ('PUSH-OK' if ok else 'PUSH-FAIL'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
