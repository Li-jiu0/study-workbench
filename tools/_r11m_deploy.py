# -*- coding: utf-8 -*-
"""R11m 热修部署（纯静态 2 件，无服务端改动 → 不重启）：
   web/日志.html（xt-log.js 戳 bump 20260925d + lgReport 失败文案细化）
   web/assets/xt-log.js（report() 改 API_BASE + JSON + Bearer + content≤2000）
顺序：备份 → 打包 → 上传 → 远端 md5 → 解压 → 逐文件 md5（不过即中止）→ 公网验收。
"""
import os, re, io, time, hashlib, tarfile, subprocess, urllib.request, urllib.parse

ROOT = r'D:\下载的文件\学习工作台'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录 → 可能是 worktree，终止'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
OUT = os.path.join(ROOT, 'tools', '_r11m_deploy_out.txt')
STAMP = '20260925d'
REL = {'web/日志.html': '日志.html', 'web/assets/xt-log.js': os.path.join('assets', 'xt-log.js')}
ARCS = list(REL.keys())

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

# 本地终态断言
page = io.open(os.path.join(ROOT, '日志.html'), encoding='utf-8').read()
assert 'assets/xt-log.js?v=%s' % STAMP in page, '日志.html 未 bump 到 ' + STAMP
assert 'window.XTLog.report !== ' in page.replace("'", "'"), '日志.html lgReport 未更新'
js = io.open(os.path.join(ROOT, 'assets', 'xt-log.js'), encoding='utf-8').read()
assert "base + '/api/feedbacks'" in js and "'Authorization', 'Bearer ' + tk" in js and ".slice(0, 2000)" in js, 'xt-log.js report 修复点缺失'
# 旧实现形态必须消失（注意：新注释里会「提到」旧写法，故断言代码形态而非字面词）
assert "setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')" not in js, '旧表单请求头实现仍在'
assert "xhr.open('POST', '/api/feedbacks', true)" not in js, '旧的无 base 相对路径 open 仍在'
assert "encodeURIComponent('【自动错误上报】" not in js, '旧表单拼装仍在'
log('本地终态断言：通过')

o, _ = plink('systemctl is-active study-workbench; systemctl show study-workbench -p MainPID -p NRestarts')
log('\n===== 0) 服务状态（纯静态，不重启）=====\n' + o.rstrip())

TS = time.strftime('%Y%m%d-%H%M%S')
BAK = RR + '/_bak-r11m-' + TS
cmds = ['set -e', 'cd ' + RR]
for a in ARCS:
    cmds.append('mkdir -p "%s/%s"' % (BAK, os.path.dirname(a)))
    cmds.append('cp -a "%s" "%s/%s"' % (a, BAK, a))
cmds.append('echo BAK_OK')
o, _ = plink(' && '.join(cmds))
log('\n===== 1) 备份 %s =====\n%s' % (BAK, o.rstrip()))
assert 'BAK_OK' in o, '备份失败 → 中止'

TAR = os.path.join(ROOT, 'tools', '_r11m_deploy.tar.gz')
md5s = {}
with tarfile.open(TAR, 'w:gz') as tf:
    for arc, rel in REL.items():
        lp = os.path.join(ROOT, rel)
        assert os.path.isfile(lp)
        tf.add(lp, arcname=arc)
        md5s[arc] = hashlib.md5(open(lp, 'rb').read()).hexdigest()
tar_md5 = hashlib.md5(open(TAR, 'rb').read()).hexdigest()
log('\n===== 2) 打包 =====\n' + '\n'.join('  %s  %s' % (v, k) for k, v in md5s.items()) + '\ntar md5=' + tar_md5)

TR = '/tmp/_r11m_deploy.tar.gz'
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HK, TAR, 'root@%s:%s' % (host, TR)],
                   capture_output=True, text=True, timeout=240, errors='replace')
o, _ = plink('md5sum ' + TR)
log('\n===== 3) 上传 =====\npscp rc=%d  %s' % (r.returncode, o.strip()))
assert tar_md5 in o, '远端 tar md5 不一致 → 中止'
o, _ = plink('cd %s && tar -xzf %s && echo EXTRACT_OK' % (RR, TR))
log('\n===== 4) 解压 =====\n' + o.rstrip())
assert 'EXTRACT_OK' in o, '解压失败 → 中止'

o, _ = plink('cd %s && md5sum %s' % (RR, ' '.join("'%s/%s'" % (RR, a) for a in ARCS)))
seen = {}
for line in o.splitlines():
    mm = re.match(r'^([0-9a-f]{32})\s+(.+)$', line.strip())
    if mm:
        p = mm.group(2).strip().lstrip('*')
        seen[p[len(RR) + 1:] if p.startswith(RR + '/') else p] = mm.group(1)
bad = [a for a in ARCS if seen.get(a) != md5s[a]]
log('\n===== 5) 逐文件 md5 =====\n命中 %d/%d 不一致 %d %s' % (len(seen), len(ARCS), len(bad), bad if bad else ''))
if bad:
    log('[中止] 不一致 → 线上保持原样')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    raise SystemExit(2)

def http(p):
    rq = urllib.request.Request('http://110.42.134.62' + p, headers={'User-Agent': 'r11m', 'Cache-Control': 'no-cache'})
    try:
        with urllib.request.urlopen(rq, timeout=30) as resp:
            return resp.status, resp.read()
    except Exception as e:
        return None, str(e).encode()

log('\n===== 6) 公网验收 =====')
st, b = http('/' + urllib.parse.quote('日志.html'))
log('日志.html status=%s 含戳 %s=%s 含旧戳 c=%s' % (st, STAMP, (b'assets/xt-log.js?v=' + STAMP.encode()) in b, b'xt-log.js?v=20260925c' in b))
st, b = http('/assets/xt-log.js')
live = b.decode('utf-8', 'replace') if st == 200 else ''
log('xt-log.js status=%s md5=%s 与本地一致=%s' % (st, hashlib.md5(b).hexdigest() if st == 200 else '-',
                                            st == 200 and hashlib.md5(b).hexdigest() == md5s['web/assets/xt-log.js']))
for k in ["base + '/api/feedbacks'", "'Authorization', 'Bearer ' + tk'", 'application/x-www-form-urlencoded']:
    log('   含 %-42s -> %s' % (k, k in live))
st, b = http('/api/app/version')
log('/api/app/version → %s' % b.decode('utf-8', 'replace')[:100])

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
