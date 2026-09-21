# -*- coding: utf-8 -*-
"""R11j 热修部署（4 文件）：
① 日志.html 明细收放按钮（用户需求）
② group-discussion.js 开场发言恒带 user 消息 + 面测.html 戳 bump 20260925b
③ server/routers/ai.py _gemini_stream 空 contents 兜底（400 根修）
安全顺序同 R11：上传→md5→解压→逐文件 md5（不过即中止）→备份→重启→验收。
部署前先确认服务 active（吸取 465 次崩溃重启教训）。
"""
import os, re, io, time, json, hashlib, tarfile, subprocess, urllib.request, urllib.parse

ROOT = r'D:\下载的文件\学习工作台'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录 → 可能是 worktree，终止'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
OUT = os.path.join(ROOT, 'tools', '_r11j_deploy_out.txt')

FILES = ['日志.html', '面测.html', os.path.join('assets', 'group-discussion.js')]
ARCS = ['web/' + f.replace(os.sep, '/') for f in FILES] + ['server/routers/ai.py']

LOG = []
def log(s=''):
    LOG.append(str(s)); print(s)

s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)

def plink(cmd, timeout=180):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HK, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    out = (r.stdout or '')
    if (r.stderr or '').strip():
        out += '\n[STDERR] ' + r.stderr.strip()
    return out, r.returncode

# ---------- 0) 服务必须 active（非 activating），否则先处置 ----------
o, rc = plink('systemctl is-active study-workbench; systemctl show study-workbench -p NRestarts -p MainPID')
log('===== 0) 服务状态 =====\n' + o.rstrip())
assert o.strip().splitlines()[0].strip() == 'active', '服务非 active，先处置端口/服务问题再部署'

# ---------- 1) 备份远端 4 件 ----------
TS = time.strftime('%Y%m%d-%H%M%S')
BAK = RR + '/_bak-r11j-' + TS
cmds = ['set -e', 'cd ' + RR]
for a in ARCS:
    cmds.append('mkdir -p "%s/%s"' % (BAK, os.path.dirname(a)))
    cmds.append('cp -a "%s" "%s/%s"' % (a, BAK, a))
cmds.append('echo BAK_OK')
o, rc = plink(' && '.join(cmds))
log('\n===== 1) 备份 %s =====\n%s' % (BAK, o.rstrip()))
assert 'BAK_OK' in o

# ---------- 2) 打包（web/... + server/...） ----------
TAR = os.path.join(ROOT, 'tools', '_r11j_deploy.tar.gz')
md5s = {}
with tarfile.open(TAR, 'w:gz') as tf:
    for arc, rel in [('web/' + f.replace(os.sep, '/'), f) for f in FILES] + [('server/routers/ai.py', os.path.join('server', 'routers', 'ai.py'))]:
        lp = os.path.join(ROOT, rel)
        assert os.path.isfile(lp), '缺文件 ' + lp
        assert not arc.endswith(('version.json', '.apk', '.db', '.env'))
        tf.add(lp, arcname=arc)
        md5s[arc] = hashlib.md5(open(lp, 'rb').read()).hexdigest()
tar_md5 = hashlib.md5(open(TAR, 'rb').read()).hexdigest()
log('\n===== 2) 打包 =====\n条目 %d  tar md5=%s' % (len(md5s), tar_md5))

# ---------- 3) 上传 + 远端 md5 ----------
TR = '/tmp/_r11j_deploy.tar.gz'
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HK, TAR, 'root@%s:%s' % (host, TR)],
                   capture_output=True, text=True, timeout=240, errors='replace')
log('\n===== 3) 上传 =====\npscp rc=%d' % r.returncode)
o, rc = plink('md5sum ' + TR)
log(o.rstrip())
assert tar_md5 in o, '远端 tar md5 不一致 → 终止'

# ---------- 4) 解压 + 逐文件 md5 ----------
o, rc = plink('cd %s && tar -xzf %s && echo EXTRACT_OK' % (RR, TR))
log('\n===== 4) 解压 =====\n' + o.rstrip())
assert 'EXTRACT_OK' in o, '解压失败 → 中止（不重启）'
o, rc = plink('cd %s && md5sum %s' % (RR, ' '.join("'%s/%s'" % (RR, a) for a in ARCS)))
seen = {}
for line in o.splitlines():
    mm = re.match(r'^([0-9a-f]{32})\s+(.+)$', line.strip())
    if mm:
        p = mm.group(2).strip().lstrip('*')
        rel = p[len(RR) + 1:] if p.startswith(RR + '/') else p
        seen[rel] = mm.group(1)
bad = [a for a in ARCS if seen.get(a) != md5s[a]]
log('\n===== 5) 逐文件 md5 =====\n命中 %d/%d  不一致 %d' % (len(seen), len(ARCS), len(bad)))
if bad:
    log('MISMATCH: %r → 中止，不重启，线上仍由原进程服务' % bad)
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    raise SystemExit(2)
for a in ARCS:
    log('  OK  %s  %s' % (md5s[a], a))

# ---------- 6) 重启 ----------
log('\n===== 6) systemctl restart =====')
plink('systemctl reset-failed study-workbench 2>/dev/null; systemctl restart study-workbench')
time.sleep(6)
o, rc = plink('systemctl is-active study-workbench; systemctl show study-workbench -p MainPID -p NRestarts -p ExecMainStatus; '
              "ss -ltnp | grep ':8000' || echo '(8000 free!)'; journalctl -u study-workbench --no-pager -n 6")
log(o.rstrip())

# ---------- 7) 线上验收 ----------
log('\n===== 7) 线上验收 =====')
def http(path, method='GET', data=None, timeout=90):
    rq = urllib.request.Request('http://110.42.134.62' + path, method=method,
                                headers={'User-Agent': 'r11j', 'Cache-Control': 'no-cache', 'Content-Type': 'application/json',
                                         'X-Client-Version': 'web-20260925b'})
    if data is not None:
        rq.data = json.dumps(data).encode('utf-8')
    try:
        with urllib.request.urlopen(rq, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return None, str(e).encode()

st, b = http('/' + urllib.parse.quote('日志.html'))
log('日志.html status=%s 含 lgToggleList=%s 含 lg-list-head=%s' %
    (st, b'lgToggleList' in b, b'lg-list-head' in b))
st, b = http('/' + urllib.parse.quote('面测.html'))
log('面测.html status=%s 含新戳 20260925b=%s 含旧戳引用 gd=%s' %
    (st, b'group-discussion.js?v=20260925b' in b, b'group-discussion.js?v=20260925a' in b))
st, b = http('/assets/group-discussion.js')
log('group-discussion.js status=%s md5=%s 与本地一致=%s 含开场兜底=%s' %
    (st, hashlib.md5(b).hexdigest() if st == 200 else '-',
     (st == 200 and hashlib.md5(b).hexdigest() == md5s['web/assets/group-discussion.js']),
     ('讨论开始）请围绕题目做你的开场发言' in b.decode('utf-8', 'replace')) if st == 200 else '-'))

# ★ 根修验证：只传 system 一条（复现原 400 场景）
sysonly = {'provider': 'gemini', 'model': 'gemini-2.5-flash',
           'messages': [{'role': 'system', 'content': '你是一个测试助手，收到任何消息都只回复两个字：成功'}]}
st, b = http('/api/ai/chat', 'POST', sysonly)
log('★ system-only 消息（修复前 400）→ status=%s body=%s' % (st, b.decode('utf-8', 'replace')[:160]))
# 正常路径回归：system + user
normal = {'provider': 'gemini', 'model': 'gemini-2.5-flash',
          'messages': [{'role': 'system', 'content': '你是测试助手，只回复两个字：成功'},
                       {'role': 'user', 'content': '开始'}]}
st, b = http('/api/ai/chat', 'POST', normal)
log('★ system+user 正常路径 → status=%s body=%s' % (st, b.decode('utf-8', 'replace')[:120]))
st, b = http('/api/app/version')
log('/api/app/version → %s' % b.decode('utf-8', 'replace')[:120])

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
