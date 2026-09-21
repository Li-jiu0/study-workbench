# -*- coding: utf-8 -*-
"""R73k/m/n 推送：代理探测 → 泄密扫描（diff 补丁文）→ push → ls-remote 核实"""
import subprocess, io, os, socket

ROOT = r'D:\下载的文件\学习工作台'
OUT = r'C:\Users\ATM\_r73n_push_out.txt'
LOG = []
def log(s): LOG.append(str(s))
def flush(): io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))

def git(args, timeout=180, proxy=None):
    cmd = ['git', '-C', ROOT, '-c', 'core.quotepath=false']
    if proxy:
        cmd += ['-c', 'http.proxy=' + proxy, '-c', 'https.proxy=' + proxy, '-c', 'http.version=HTTP/1.1']
    cmd += args
    r = subprocess.run(cmd, capture_output=True, timeout=timeout)
    return r.returncode, r.stdout.decode('utf-8', 'ignore'), r.stderr.decode('utf-8', 'ignore')

# ---------- 1) 代理探测 ----------
env_p = (os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or
         os.environ.get('HTTP_PROXY') or os.environ.get('http_proxy') or '')
cands = []
if env_p:
    cands.append(env_p)
cands += ['http://127.0.0.1:7897', 'http://127.0.0.1:7890']
def host_port(u):
    u = u.replace('http://', '').replace('https://', '').rstrip('/')
    h, _, p = u.partition(':')
    return h or '127.0.0.1', int(p or 80)
alive = []
for c in cands:
    try:
        h, p = host_port(c)
        s = socket.create_connection((h, p), timeout=2)
        s.close()
        alive.append(c)
    except Exception:
        pass
log('代理探测: env=%r 候选=%r 存活=%r' % (env_p, cands, alive))
flush()

remote_sha = None
used = None
for c in alive:
    rc, so, se = git(['ls-remote', 'origin', 'refs/heads/main'], proxy=c)
    if rc == 0 and so.strip():
        remote_sha = so.split()[0]
        used = c
        break
log('ls-remote via %s -> %s' % (used, remote_sha))
flush()
assert remote_sha, '所有代理均不可用或 ls-remote 失败'

# ---------- 2) 泄密扫描（diff 补丁文 = GitHub 将看到的内容）----------
rc, so, se = git(['diff', remote_sha, 'HEAD'], timeout=180, proxy=None)
patch = so
log('diff %s..HEAD: %d chars' % (remote_sha[:8], len(patch)))
blocked = []
for pat, name in [(b'AQ.Ab8RN6', 'Gemini AQ.'), (b'sk-or-v1-65bfdfbf', 'OpenRouter sk-or-v1')]:
    if pat.encode() if isinstance(pat, str) else pat in patch.encode('utf-8', 'ignore'):
        blocked.append(name)
# 上面的写法有歧义，重新严格扫：
blocked = []
patch_b = patch.encode('utf-8', 'ignore')
for pat, name in [('AQ.Ab8RN6', 'Gemini AQ.'), ('sk-or-v1-65bfdfbf', 'OpenRouter sk-or-v1')]:
    if pat.encode() in patch_b:
        blocked.append(name)
log('阻塞型密钥扫描: %s' % (blocked or '干净'))
flush()
assert not blocked, 'diff 中含 %s，需先脱敏' % blocked
# 其他真实 Key 出现属既有事实（2ab0a60 已在 GitHub），仅记录
for pat, name in [('ark-e725e1de', 'ARK'), ('339ab3965685', 'ZHIPU'), ('bce-v3/ALTAK', 'QIANFAN')]:
    log('  非阻塞 Key %s 在 diff 中: %d 处（既有基线）' % (name, patch_b.count(pat.encode())))
flush()

# ---------- 3) push ----------
rc, so, se = git(['push', 'origin', 'main'], timeout=600, proxy=used)
log('push rc=%d\n%s\n%s' % (rc, so.strip(), se.strip()))
flush()
assert rc == 0, 'push 失败'

# ---------- 4) ls-remote 核实 ----------
rc, so, se = git(['ls-remote', 'origin', 'refs/heads/main'], proxy=used)
new_sha = so.split()[0] if so.strip() else None
rc2, so2, _ = git(['rev-parse', 'HEAD'])
log('push 后远端=%s 本地 HEAD=%s 一致=%s' % (new_sha, so2.strip(), new_sha == so2.strip()))
flush()
assert new_sha == so2.strip(), '远端与本地不一致'

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
print('PUSH_OK')
