# -*- coding: utf-8 -*-
"""R2B v1.33 发版：4 个页面 + version.json + xt-update.js + 新版 APK 上传并在线验证
显式映射（本地路径 / 生产路径），不用字符串替换猜路径。
"""
import hashlib, io, json, os, re, subprocess, sys, time

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
OUT = os.path.join(ROOT, '_r2b_deploy_out.txt')
WEBTAR = os.path.join(ROOT, '_r2b_web.tar.gz')
V = '1.33'
LOG = []


def log(s=''):
    LOG.append(str(s))
    print(s)


def flush(code=None):
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG) + '\n')
    if code is not None:
        sys.exit(code)


def m5(p):
    return hashlib.md5(open(p, 'rb').read()).hexdigest()


# ---- 显式映射：key -> (本地绝对路径, 生产相对 BASE 路径) ----
ITEMS = {
    'version.json': (os.path.join(ROOT, 'server', 'routers', 'version.json'), 'server/routers/version.json'),
    'xt-update.js': (os.path.join(ROOT, 'assets', 'xt-update.js'), 'web/assets/xt-update.js'),
    'apk':          (os.path.join(ROOT, '星途-安卓App.apk'), 'web/static/apk/星途-%s.apk' % V),
}
for p in ['关于.html', '数据管理.html', '更多.html', '更新.html']:
    ITEMS['page:' + p] = (os.path.join(ROOT, p), 'web/' + p)

EXP = {}
for k, (lp, _rel) in ITEMS.items():
    if not os.path.isfile(lp):
        log('!!! 本地缺失: %s (%s)' % (k, lp)); flush(1)
    EXP[k] = m5(lp)

s = io.open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8', errors='replace').read()
m = re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
pwd, host = m.group(1), m.group(2)
log('目标 root@%s（凭据长度 %d，不打印明文）' % (host, len(pwd)))
log('待发版文件 %d 个；APK %d bytes md5=%s' % (len(ITEMS), os.path.getsize(ITEMS['apk'][0]), EXP['apk'][:12]))

# ---- 上传 1：4 个页面 tar ----
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, WEBTAR, 'root@%s:/tmp/_r2b_web.tar.gz' % host],
                   capture_output=True, text=True, timeout=1800, errors='replace')
log('[1/4] 页面 tar %d bytes exit=%d' % (os.path.getsize(WEBTAR), r.returncode))
if r.returncode:
    log((r.stderr or '')[-200:]); flush(7)

# ---- 上传 2/3/4 ----
UP = [
    (ITEMS['version.json'][0], '/tmp/_v133_version.json', 'version.json'),
    (ITEMS['xt-update.js'][0], '/tmp/_v133_xt_update.js', 'xt-update.js'),
    (ITEMS['apk'][0], '/tmp/_v133.apk', 'apk'),
]
for i, (local, tmp, key) in enumerate(UP, start=2):
    t0 = time.time()
    r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, local, 'root@%s:%s' % (host, tmp)],
                       capture_output=True, text=True, timeout=3600, errors='replace')
    log('[%d/4] %-14s %10d bytes exit=%d %.1fs' % (i, key, os.path.getsize(local), r.returncode, time.time() - t0))
    if r.returncode:
        log((r.stderr or '')[-200:]); flush(7)

remote = '''
import hashlib, io, os, shutil, json, time, urllib.request
BASE = '/opt/study-workbench'
REL = %(rel)s
EXP = %(exp)s
TMP2FINAL = {"version.json": "server/routers/version.json",
             "xt-update.js": "web/assets/xt-update.js",
             "apk": "web/static/apk/%(apk)s"}
TMPNAME = {"version.json": "/tmp/_v133_version.json",
           "xt-update.js": "/tmp/_v133_xt_update.js",
           "apk": "/tmp/_v133.apk"}
def m5(p):
    return hashlib.md5(io.open(p, 'rb').read()).hexdigest()
ok = True
bk = os.path.join(BASE, 'backups', 'r2b-' + time.strftime('%%Y%%m%%d-%%H%%M%%S'))
os.makedirs(bk, exist_ok=True)
for rel in list(TMP2FINAL.values()) + [REL[k] for k in REL if k.startswith('page:')]:
    src = os.path.join(BASE, rel)
    if os.path.exists(src):
        d = os.path.join(bk, os.path.dirname(rel)); os.makedirs(d, exist_ok=True)
        shutil.copy2(src, os.path.join(bk, rel))
print('BACKUP ->', bk)
r = subprocess.run(['tar', '-xzf', '/tmp/_r2b_web.tar.gz', '-C', BASE], capture_output=True, text=True)
print('TAR_EXIT', r.returncode, r.stderr[-200:])
if r.returncode: ok = False
for k, rel in TMP2FINAL.items():
    tp = TMPNAME[k]
    if not os.path.exists(tp):
        print('TMP_MISSING', k); ok = False; continue
    h = m5(tp)
    if h != EXP[k]:
        print('TMP_MD5_BAD', k, EXP[k][:10], h[:10]); ok = False; continue
    dst = os.path.join(BASE, rel)
    d = os.path.dirname(dst)
    if not os.path.isdir(d): os.makedirs(d, exist_ok=True)
    shutil.move(tp, dst)
    print('PLACED %-14s %s %d' %% (k, m5(dst)[:12], os.path.getsize(dst)))
print('--- 终态 md5 核对 ---')
for k in EXP:
    p = os.path.join(BASE, REL[k])
    if not os.path.exists(p):
        print('  %-18s MISSING' %% k); ok = False; continue
    h = m5(p)
    good = (h == EXP[k])
    if not good: ok = False
    print('  %-18s %s %s' %% (k, h[:12], 'OK' if good else 'MISMATCH exp=' + EXP[k][:12]))
print('PLACE_VERDICT', 'PASS' if ok else 'FAIL')
print('--- 等 version.json 60s TTL 过期 ---')
time.sleep(66)
try:
    b = urllib.request.urlopen('http://127.0.0.1/api/app/version', timeout=20).read().decode('utf-8', 'replace')
    j = json.loads(b)
    print('API_VER', j.get('version'), 'versionCode=', j.get('versionCode'), 'apkReady=', j.get('apkReady'), 'apkUrl=', j.get('apkUrl'))
    print('API_NOTES_HEAD', (j.get('notes') or [''])[0][:80])
    u = j.get('apkUrl') or ''
    if u.startswith('/'):
        u = 'http://127.0.0.1' + u
    if u:
        rq = urllib.request.Request(u, method='HEAD')
        rs = urllib.request.urlopen(rq, timeout=30)
        print('APK_HTTP', rs.status, 'len=', rs.headers.get('Content-Length'))
except Exception as e:
    print('API_ERR', repr(e))
import subprocess
''' % {'rel': json.dumps({k: v[1] for k, v in ITEMS.items()}, ensure_ascii=False, indent=1),
       'exp': json.dumps(EXP, ensure_ascii=False, indent=1),
       'apk': '星途-%s.apk' % V}
remote = 'import subprocess\n' + remote
rp = os.path.join(ROOT, '_r2b_remote.py')
io.open(rp, 'w', encoding='utf-8', newline='\n').write(remote)
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, rp, 'root@%s:/tmp/_r2b_remote.py' % host],
                   capture_output=True, text=True, timeout=300, errors='replace')
log('pscp remote.py exit=%d %s' % (r.returncode, (r.stderr or '')[-120:].strip()))

r2 = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@%s' % host,
                     'python3 /tmp/_r2b_remote.py'], capture_output=True, text=True, timeout=1800, errors='replace')
log('--- 远端输出 ---')
log((r2.stdout or '') + '\n[ERR]\n' + (r2.stderr or ''))
flush()
