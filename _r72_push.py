# -*- coding: utf-8 -*-
# 推送 GitHub：探测可用代理 -> ls-remote 验证 -> push（大传输，后台跑）
import subprocess, os, socket, re, time

T = r'D:\下载的文件\学习工作台'
out = []
out.append('time=%s' % time.strftime('%Y-%m-%d %H:%M:%S'))

# 1) 候选代理端口：环境变量优先，其次历史实测可用端口
cands = []
for k in ('HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'):
    v = os.environ.get(k)
    if v:
        m = re.search(r'(\d+)\s*$', v.strip())
        if m:
            cands.append((int(m.group(1)), 'env:%s' % k))
for p in (7897, 7890, 10809, 1080, 8080):
    cands.append((p, 'candidate'))
seen, ordered = set(), []
for p, src in cands:
    if p not in seen:
        seen.add(p); ordered.append((p, src))

def probe_port(p):
    try:
        s = socket.create_connection(('127.0.0.1', p), timeout=1.5)
        s.close(); return True
    except Exception:
        return False

open_ports = [(p, src) for p, src in ordered if probe_port(p)]
out.append('开放端口: %s' % open_ports)

env_base = {k: v for k, v in os.environ.items() if k.lower() not in ('http_proxy', 'https_proxy')}
env_base['GIT_TERMINAL_PROMPT'] = '0'

def git_with_proxy(port, *args, timeout=120):
    e = dict(env_base)
    if port:
        e['HTTP_PROXY'] = 'http://127.0.0.1:%d' % port
        e['HTTPS_PROXY'] = 'http://127.0.0.1:%d' % port
    return subprocess.run(['git'] + list(args), cwd=T, env=e, capture_output=True,
                          text=True, encoding='utf-8', errors='replace', timeout=timeout)

# 2) 用 ls-remote 选出口（rc=0 才可用）
working = None
for p, src in open_ports:
    r = git_with_proxy(p, 'ls-remote', '--heads', 'origin', 'main')
    ok = (r.returncode == 0)
    out.append('ls-remote via %d(%s): rc=%d %s' % (p, src, r.returncode, (r.stdout or '').strip()[:80] or (r.stderr or '').strip()[:80]))
    if ok:
        working = p
        break
if working is None:
    out.append('NO_PROXY_WORKED')
else:
    out.append('选定代理端口 = %d' % working)
    # 3) 推送（后台由外层 Bash 处理；此处同步等待，超时 25 分钟）
    r = git_with_proxy(working, 'push', 'origin', 'main', timeout=1500)
    out.append('PUSH rc=%d' % r.returncode)
    out.append('stdout: %s' % (r.stdout or '').strip()[:500])
    out.append('stderr tail: %s' % (r.stderr or '').strip()[-800:])
    # 4) 复核远端
    r2 = git_with_proxy(working, 'ls-remote', 'origin', 'main')
    remote_head = (r2.stdout or '').strip().split('\t')[0] if r2.stdout else ''
    local_head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=T, capture_output=True, text=True).stdout.strip()
    out.append('local  HEAD = %s' % local_head)
    out.append('remote main  = %s' % remote_head)
    out.append('PUSH_VERIFIED = %s' % (local_head == remote_head))

open(os.path.join(T, '_r72_push_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('PUSH_SCRIPT_DONE')
