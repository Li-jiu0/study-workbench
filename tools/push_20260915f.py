# -*- coding: utf-8 -*-
"""逐个代理端口尝试推送 GitHub，取第一个真正能 ls-remote 通的"""
import os, re, io, socket, subprocess

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', '_push_f_out.txt')
L = []

def dec(b):
    try: return b.decode('utf-8')
    except Exception: return b.decode('gbk', errors='replace')

def run(port, extra):
    env = dict(os.environ)
    env['HTTP_PROXY'] = env['http_proxy'] = env['HTTPS_PROXY'] = env['https_proxy'] = 'http://127.0.0.1:%d' % port
    env['GIT_HTTP_VERSION'] = 'HTTP/1.1'
    r = subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=false',
                        '-c', 'http.proxy=http://127.0.0.1:%d' % port,
                        '-c', 'https.proxy=http://127.0.0.1:%d' % port] + extra,
                       capture_output=True, env=env, timeout=600)
    return r.returncode, dec(r.stdout), dec(r.stderr)

ports = []
for k in ('HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy'):
    m = re.search(r'127\.0\.0\.1:(\d+)', os.environ.get(k, '') or '')
    if m: ports.append(int(m.group(1)))
ports += [7897, 7890, 10809, 1080]
seen, cand = set(), []
for p in ports:
    if p not in seen: seen.add(p); cand.append(p)

for p in cand:
    s = socket.socket(); s.settimeout(2)
    try:
        s.connect(('127.0.0.1', p))
    except Exception:
        L.append('port %d: closed' % p); s.close(); continue
    s.close()
    rc, o, e = run(p, ['ls-remote', '--heads', 'origin', 'main'])
    L.append('port %d: ls-remote rc=%d %s' % (p, rc, o.strip()[:100] or e.strip()[:120]))
    if rc == 0:
        rc2, o2, e2 = run(p, ['-c', 'http.version=HTTP/1.1', 'push', 'origin', 'main'])
        L.append('  push rc=%d' % rc2)
        L.append('  OUT: %s' % (o2 or '')[-800:])
        L.append('  ERR: %s' % (e2 or '')[-800:])
        rc3, o3, e3 = run(p, ['ls-remote', '--heads', 'origin', 'main'])
        L.append('  远端 HEAD 复核 rc=%d: %s' % (rc3, o3.strip()[:120]))
        break

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('PUSH_DONE')
