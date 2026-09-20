# -*- coding: utf-8 -*-
"""生成 R2B 远端落位脚本（不用 % 格式化，避免模板里的 % 冲突）"""
import hashlib, io, json, os

ROOT = r'D:\下载的文件\学习工作台'
V = '1.33'
ITEMS = {
    'version.json': (os.path.join(ROOT, 'server', 'routers', 'version.json'), 'server/routers/version.json'),
    'xt-update.js': (os.path.join(ROOT, 'assets', 'xt-update.js'), 'web/assets/xt-update.js'),
    'apk': (os.path.join(ROOT, '星途-安卓App.apk'), 'web/static/apk/星途-' + V + '.apk'),
}
for p in ['关于.html', '数据管理.html', '更多.html', '更新.html']:
    ITEMS['page:' + p] = (os.path.join(ROOT, p), 'web/' + p)

REL = {k: v[1] for k, v in ITEMS.items()}
EXP = {k: hashlib.md5(open(v[0], 'rb').read()).hexdigest() for k, v in ITEMS.items()}

lines = [
    "import hashlib, io, os, shutil, json, time, subprocess, urllib.request",
    "BASE = '/opt/study-workbench'",
    "REL = " + json.dumps(REL, ensure_ascii=False, indent=1),
    "EXP = " + json.dumps(EXP, ensure_ascii=False, indent=1),
    "TMP2FINAL = {'version.json': 'server/routers/version.json',",
    "             'xt-update.js': 'web/assets/xt-update.js',",
    "             'apk': 'web/static/apk/" + REL['apk'].split('/')[-1] + "'}",
    "TMPNAME = {'version.json': '/tmp/_v133_version.json',",
    "           'xt-update.js': '/tmp/_v133_xt_update.js',",
    "           'apk': '/tmp/_v133.apk'}",
    "def m5(p):",
    "    return hashlib.md5(io.open(p, 'rb').read()).hexdigest()",
    "ok = True",
    "bk = os.path.join(BASE, 'backups', 'r2b-' + time.strftime('%Y%m%d-%H%M%S'))",
    "os.makedirs(bk, exist_ok=True)",
    "for rel in list(TMP2FINAL.values()) + [REL[k] for k in REL if k.startswith('page:')]:",
    "    src = os.path.join(BASE, rel)",
    "    if os.path.exists(src):",
    "        d = os.path.join(bk, os.path.dirname(rel)); os.makedirs(d, exist_ok=True)",
    "        shutil.copy2(src, os.path.join(bk, rel))",
    "print('BACKUP ->', bk)",
    "r = subprocess.run(['tar','-xzf','/tmp/_r2b_web.tar.gz','-C',BASE], capture_output=True, text=True)",
    "print('TAR_EXIT', r.returncode, r.stderr[-200:])",
    "if r.returncode: ok = False",
    "for k, rel in TMP2FINAL.items():",
    "    tp = TMPNAME[k]",
    "    if not os.path.exists(tp):",
    "        print('TMP_MISSING', k); ok = False; continue",
    "    h = m5(tp)",
    "    if h != EXP[k]:",
    "        print('TMP_MD5_BAD', k, EXP[k][:10], h[:10]); ok = False; continue",
    "    dst = os.path.join(BASE, rel)",
    "    d = os.path.dirname(dst)",
    "    if not os.path.isdir(d): os.makedirs(d, exist_ok=True)",
    "    shutil.move(tp, dst)",
    "    print('PLACED', k, m5(dst)[:12], os.path.getsize(dst))",
    "print('--- 终态 md5 核对 ---')",
    "for k in EXP:",
    "    p = os.path.join(BASE, REL[k])",
    "    if not os.path.exists(p):",
    "        print('  MISSING', k); ok = False; continue",
    "    h = m5(p)",
    "    good = (h == EXP[k])",
    "    if not good: ok = False",
    "    print('  ', k.ljust(18), h[:12], 'OK' if good else 'MISMATCH exp=' + EXP[k][:12])",
    "print('PLACE_VERDICT', 'PASS' if ok else 'FAIL')",
    "print('--- 等 version.json 60s TTL 过期 ---')",
    "time.sleep(66)",
    "try:",
    "    b = urllib.request.urlopen('http://127.0.0.1/api/app/version', timeout=20).read().decode('utf-8','replace')",
    "    j = json.loads(b)",
    "    print('API_VER', j.get('version'), 'versionCode=', j.get('versionCode'), 'apkReady=', j.get('apkReady'), 'apkUrl=', j.get('apkUrl'))",
    "    print('API_NOTES_HEAD', (j.get('notes') or [''])[0][:80])",
    "    u = j.get('apkUrl') or ''",
    "    if u.startswith('/'): u = 'http://127.0.0.1' + u",
    "    if u:",
    "        rq = urllib.request.Request(u, method='HEAD')",
    "        rs = urllib.request.urlopen(rq, timeout=30)",
    "        print('APK_HTTP', rs.status, 'len=', rs.headers.get('Content-Length'))",
    "except Exception as e:",
    "    print('API_ERR', repr(e))",
]
p = os.path.join(ROOT, '_r2b_remote.py')
io.open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
print('written', p, os.path.getsize(p))
print('EXP:', json.dumps(EXP, ensure_ascii=False))
