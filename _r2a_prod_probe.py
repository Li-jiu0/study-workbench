import os, re, io, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
OUT = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2ab398e3\_r2a_prod_out.txt'

src = io.open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8', errors='replace').read()
m = re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
if not m:
    print('NO_CRED'); sys.exit(2)
pwd, host = m.group(1), m.group(2)
print('HOST=%s  PWLEN=%d (不打印明文)' % (host, len(pwd)))

SH = r'''set -u
echo "### 生产只读探针 ###"
python3 - <<'PYEOF'
import io, os, re, json
WEB = '/opt/study-workbench/web'
SRV = '/opt/study-workbench/server'
def rd(p):
    try:
        return io.open(p, 'rb').read()
    except Exception as e:
        return None
print('--- 1) 根 HTML 行尾分布（生产）---')
import collections
cnt = collections.Counter()
n = 0
for fn in os.listdir(WEB):
    if not fn.endswith('.html'):
        continue
    b = rd(os.path.join(WEB, fn))
    if b is None:
        continue
    n += 1
    c = b.count(b'\r\n'); l = b.count(b'\n') - c
    cnt['CRLF' if (c and not l) else ('LF' if (l and not c) else 'MIXED')] += 1
print('   html总数=%d  %s' % (n, dict(cnt)))
print('--- 2) 关键文件 md5 / size ---')
import hashlib
for rel in ['assets/app.js', 'assets/api.js', 'assets/xt-settings.js', 'assets/xt-update.js',
            'assets/chat-local.js', 'assets/xt-moments.js', 'assets/img-viewer.js',
            'assets/ai-cap-3d.js', '关于.html', '设置.html', '更多.html', '协议.html', '数据管理.html']:
    b = rd(os.path.join(WEB, rel))
    if b is None:
        print('   %-26s MISSING' % rel)
    else:
        print('   %-26s %s %d' % (rel, hashlib.md5(b).hexdigest()[:12], len(b)))
print('--- 3) 全站资产戳分布 ---')
st = collections.defaultdict(collections.Counter)
for fn in os.listdir(WEB):
    if not fn.endswith('.html'):
        continue
    b = rd(os.path.join(WEB, fn))
    if b is None:
        continue
    try:
        t = b.decode('utf-8', 'ignore')
    except Exception:
        continue
    for mm in re.finditer(r'(?:src|href)\s*=\s*["\']assets/([A-Za-z0-9_.\-]+\.js)(\?v=[0-9A-Za-z]+)?["\']', t):
        st[mm.group(1)][mm.group(2) or '裸'] += 1
for k in ['app.js', 'api.js', 'xt-settings.js', 'xt-update.js', 'chat-local.js', 'xt-moments.js', 'img-viewer.js', 'ai-cap-3d.js']:
    print('   %-18s %s' % (k, dict(st.get(k, {}))))
print('--- 4) 后端版本与关键符号 ---')
try:
    print('   version.json =', json.loads(rd(os.path.join(SRV, 'routers', 'version.json')).decode('utf-8')).get('version'))
except Exception as e:
    print('   version.json 读取失败', e)
for rel, kws in [
    ('routers/liveloc.py', ['sessions', 'sharerId', 'hasFix']),
    ('routers/ai.py', ['modelUrl', 'isinstance(_c, dict)', 'isinstance(_c, list)']),
    ('data/model_registry.json', ['hyper3d-gen2', 'Seed3D', 'Hitem3D']),
]:
    b = rd(os.path.join(SRV, rel))
    if b is None:
        print('   %-28s MISSING' % rel); continue
    t = b.decode('utf-8', 'ignore')
    print('   %-28s %s' % (rel, {k: t.count(k) for k in kws}))
print('--- 5) 服务与站点 ---')
PYEOF
curl -s -o /dev/null -w '   site=%{http_code}\n' http://127.0.0.1/
curl -s -o /dev/null -w '   health=%{http_code}\n' http://127.0.0.1:8000/api/health
curl -s -o /dev/null -w '   version_api=%{http_code}\n' http://127.0.0.1/api/app/version
systemctl is-active study-workbench
echo "### 探针结束 ###"
'''

sh_local = os.path.join(ROOT, '_r2a_prod.sh')
io.open(sh_local, 'w', encoding='utf-8', newline='\n').write(SH)

r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, sh_local, 'root@%s:/tmp/_r2a_prod.sh' % host],
                   capture_output=True, text=True, timeout=300, errors='replace')
print('pscp exit=', r.returncode, (r.stderr or '')[-200:])

r2 = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@%s' % host,
                     'bash /tmp/_r2a_prod.sh'], capture_output=True, text=True, timeout=600, errors='replace')
txt = (r2.stdout or '') + '\n[STDERR]\n' + (r2.stderr or '')
io.open(OUT, 'w', encoding='utf-8').write(txt)
print('plink exit=', r2.returncode)
print(txt)
