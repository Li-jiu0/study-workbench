# -*- coding: utf-8 -*-
"""20260915f：线上直连复检 -> 代理探测 -> 推送 GitHub"""
import os, re, io, socket, json, subprocess, urllib.request, urllib.parse

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', '_release_f_out.txt')
BASE = 'http://110.42.134.62/'
L = []

# ---------- 1. 线上直连复检（显式禁代理）----------
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
op.addheaders = [('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')]

CHECKS = [
    ('学习工作台.html', ['app.js?v=20260915f', 'module-meta-item']),
    ('更多.html',       ['app.js?v=20260915f', 'mpGroupContent']),
    ('私聊.html',       ['app.js?v=20260915f', 'syncAcEntry']),
    ('商务礼仪面试.html', ['interview_daily_answers', 'ivQuizSubmit']),
    ('四级备考.html',   ['cet-read.js?v=20260915f']),
    ('工具.html',       ['app.js?v=20260915f']),
    ('assets/app.js',   ['module-meta-item']),
    ('assets/api.js',   ['blogLocalStats']),
    ('assets/cet-read.js', ['cr-col-quiz']),
]
L.append('=== 1. 线上直连复检 ===')
for fn, pats in CHECKS:
    url = BASE + urllib.parse.quote(fn)
    try:
        resp = op.open(url, timeout=25)
        body = resp.read().decode('utf-8', 'replace')
        size = len(body)
        res = ['%s=%s' % (p, ('YES' if p in body else 'NO')) for p in pats]
        L.append('  %-22s HTTP %s  %d chars  %s' % (fn, resp.getcode(), size, ' '.join(res)))
    except Exception as e:
        L.append('  %-22s ERR %s' % (fn, e))

# ADR-3 / 老 WebView 兜底：线上 app.js 抽查
try:
    b = op.open(BASE + 'assets/app.js', timeout=40).read().decode('utf-8', 'replace')
    L.append('  线上 app.js: 可选链=%d  replaceAll=%d  (?<=)=%d  原生alert=%d' % (
        len(re.findall(r'\?\.[A-Za-z0-9_(\["]', b)),
        len(re.findall(r'\breplaceAll\s*\(', b)),
        len(re.findall(r'\(\?<[=!]', b)),
        len(re.findall(r'(?<![A-Za-z0-9_.])(alert|confirm|prompt)\s*\(', b)),
    ))
except Exception as e:
    L.append('  app.js 抽查失败: %s' % e)

# ---------- 2. 代理探测 ----------
L.append('')
L.append('=== 2. 代理探测 ===')
cands = []
for k in ('HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy'):
    v = os.environ.get(k, '')
    m = re.search(r'127\.0\.0\.1:(\d+)', v or '')
    if m:
        cands.append(int(m.group(1)))
cands += [7897, 7890, 10809, 1080]
seen, ports = set(), []
for p in cands:
    if p not in seen:
        seen.add(p); ports.append(p)
L.append('  候选端口: %s' % ports)

def sock_ok(p):
    s = socket.socket(); s.settimeout(2)
    try:
        s.connect(('127.0.0.1', p)); return True
    except Exception:
        return False
    finally:
        s.close()

proxy = None
for p in ports:
    ok = sock_ok(p)
    L.append('  127.0.0.1:%-6d %s' % (p, 'OPEN' if ok else 'closed'))
    if ok and proxy is None:
        proxy = 'http://127.0.0.1:%d' % p
L.append('  选用代理: %s' % proxy)

# ---------- 3. 推送 GitHub ----------
L.append('')
L.append('=== 3. 推送 GitHub ===')
if not proxy:
    L.append('  无可用代理，跳过推送')
else:
    env = dict(os.environ)
    env['HTTP_PROXY'] = env['http_proxy'] = env['HTTPS_PROXY'] = env['https_proxy'] = proxy
    env['GIT_HTTP_VERSION'] = 'HTTP/1.1'
    # 3.1 ls-remote 验证
    r = subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=false',
                        '-c', 'http.proxy=' + proxy, '-c', 'https.proxy=' + proxy,
                        'ls-remote', '--heads', 'origin', 'main'],
                       capture_output=True, env=env, timeout=120)
    def dec(b):
        try: return b.decode('utf-8')
        except Exception: return b.decode('gbk', errors='replace')
    L.append('  ls-remote rc=%d  %s' % (r.returncode, dec(r.stdout).strip()[:120]))
    if r.returncode != 0:
        L.append('  ls-remote 失败: %s' % dec(r.stderr)[-300:])
    else:
        r2 = subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=false',
                             '-c', 'http.proxy=' + proxy, '-c', 'https.proxy=' + proxy,
                             '-c', 'http.version=HTTP/1.1', 'push', 'origin', 'main'],
                            capture_output=True, env=env, timeout=600)
        L.append('  push rc=%d' % r2.returncode)
        L.append('  OUT: %s' % dec(r2.stdout)[-600:])
        L.append('  ERR: %s' % dec(r2.stderr)[-600:])
        if r2.returncode == 0:
            r3 = subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=false',
                                 '-c', 'http.proxy=' + proxy, '-c', 'https.proxy=' + proxy,
                                 'ls-remote', '--heads', 'origin', 'main'],
                                capture_output=True, env=env, timeout=120)
            L.append('  远端 HEAD 复核: %s' % dec(r3.stdout).strip()[:120])

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('RELEASE_DONE')
