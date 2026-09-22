# -*- coding: utf-8 -*-
"""R165 发版部署（web-only 6 件，安全顺序，沿用 _r150 验证过的 SOP）。

口径：
  本轮只发「听说训练 R162~R165」批次 + 两页引用闭包：
    英语.html / 学途.html / assets/voiceplayer.js / assets/data/listening-ext.json
    / assets/icon-map.js / assets/xt-log.js
  🔴 不发 APK、绝不动 version.json（线上保持 1.42/43，APK 版本另行处理）。
  顺序：0) 线上备份 → 1) 上传 tar → 2) 远端 md5 校验 → 3) 解压 → 4) 逐文件 md5
        → 5) 清孤儿 uvicorn → 6) systemctl restart → 7) 线上验收。
"""
import os, re, io, time, tarfile, hashlib, subprocess, urllib.request, urllib.parse, urllib.error, json

ROOT = r'D:\下载的文件\学习工作台'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录 → 可能是 worktree，终止'
for _m in ('学习工作台.html', 'assets', 'server', 'tools', 'web'):
    assert os.path.exists(os.path.join(ROOT, _m)), 'ROOT 疑似非主项目根，缺 ' + _m

PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
TS = time.strftime('%Y%m%d-%H%M%S')
TAR_LOCAL = os.path.join(ROOT, 'tools', '_r165_deploy.tar.gz')
TAR_REMOTE = '/tmp/_r165_deploy.tar.gz'
OUT = os.path.join(ROOT, 'tools', '_r165_deploy_out.txt')
BK = RR + '/_bak-r165-' + TS

PAGES = ['英语.html', '学途.html']
ASSETS = [
    'assets/voiceplayer.js',          # R162~R165 主改动，戳 20260929h
    'assets/data/listening-ext.json', # R162 听力内容扩充
    'assets/icon-map.js',             # 闭包：两页引用 v=20260929a，线上仍是 20260923a 内容
    'assets/xt-log.js',               # 闭包：两页新引用 v=20260928d，线上内容不同
]
PAIRS = [(p, 'web/' + p) for p in PAGES] + [(a, 'web/' + a) for a in ASSETS]
FILES = [arc for _, arc in PAIRS]

BAD = ('.apk', 'android/', '.db', '.env', 'model_usage.json', 'model_quota.json')
for f in FILES:
    assert not any(b in f for b in BAD), '禁列文件混入: ' + f
assert 'version.json' not in ' '.join(FILES), '本轮绝不上传 version.json'

LOG = []
def log(s=''):
    LOG.append(str(s)); print(s)

# ---- manifest + tar ----
MD5 = {}
for loc, arc in PAIRS:
    p = os.path.join(ROOT, loc.replace('/', os.sep))
    assert os.path.exists(p), '本地缺文件: ' + loc
    MD5[arc] = hashlib.md5(open(p, 'rb').read()).hexdigest()
if os.path.exists(TAR_LOCAL):
    os.remove(TAR_LOCAL)
with tarfile.open(TAR_LOCAL, 'w:gz') as tf:
    for loc, arc in PAIRS:
        tf.add(os.path.join(ROOT, loc.replace('/', os.sep)), arcname=arc)
tar_md5 = hashlib.md5(open(TAR_LOCAL, 'rb').read()).hexdigest()
log('R165 web-only 发版 | %d 件 | tar md5=%s (%d bytes)' % (len(FILES), tar_md5, os.path.getsize(TAR_LOCAL)))
for loc, arc in PAIRS:
    log('   %-34s md5=%s' % (arc, MD5[arc]))
log('备份目录 ' + BK)

s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)

def plink(cmd, timeout=420):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    out = (r.stdout or '')
    if (r.stderr or '').strip():
        out += '\n[STDERR] ' + r.stderr.strip()
    return out, r.returncode

def http(path, timeout=30):
    try:
        rq = urllib.request.Request('http://' + host + path,
                                    headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache',
                                             'User-Agent': 'r165-deploy'})
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read() if hasattr(e, 'read') else b''
    except Exception as e:
        return None, str(e).encode()

# ---- 基线 ----
st0, b0 = http('/api/app/version')
try:
    j0 = json.loads(b0.decode('utf-8'))
except Exception:
    j0 = {}
log('\n[基线] /api/app/version = HTTP %s version=%s code=%s' % (st0, j0.get('version'), j0.get('versionCode')))
assert st0 == 200 and j0.get('version') == '1.42', '基线异常：线上版本非 1.42，先人工核查再发'

# ---- 0) 备份 ----
o, rc = plink("mkdir -p '" + BK + "' && cd " + RR + " && ok=0; skip=0; "
              "for f in " + ' '.join("'" + f + "'" for f in FILES) + "; do "
              "  if [ -f \"$f\" ]; then cp --parents \"$f\" '" + BK + "' && ok=$((ok+1)); "
              "  else skip=$((skip+1)); echo \"SKIP(new) $f\"; fi; done; "
              "echo \"backed_up=$ok skipped=$skip\"")
log('\n===== 0) 线上备份 =====')
log(o.strip())

# ---- 1) 上传 tar ----
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR_LOCAL, 'root@' + host + ':' + TAR_REMOTE],
                   capture_output=True, text=True, timeout=600, errors='replace')
log('\n===== 1) 上传站点 tar =====')
log('pscp rc=%d' % r.returncode)
o, rc = plink('md5sum ' + TAR_REMOTE)
log(o.strip())
assert tar_md5 in o, '远端 tar md5 与本地不一致 → 中止'

# ---- 2) 解压 ----
o, rc = plink('cd ' + RR + ' && tar -xzf ' + TAR_REMOTE + ' && echo EXTRACT_OK')
log('\n===== 2) 解压 =====')
log(o.strip())
assert 'EXTRACT_OK' in o, '解压失败 → 中止（未杀进程、未重启）'

# ---- 3) 逐文件 md5 ----
o, rc = plink('cd ' + RR + ' && md5sum ' + ' '.join("'" + f + "'" for f in FILES))
log('\n===== 3) 逐文件 md5 校验 =====')
seen, bad = {}, []
for line in o.splitlines():
    mm = re.match(r'^([0-9a-f]{32})\s+(.+)$', line.strip())
    if mm:
        p = mm.group(2).strip().lstrip('*')
        seen[p[len(RR) + 1:] if p.startswith(RR + '/') else p] = mm.group(1)
for f in FILES:
    if seen.get(f) != MD5[f]:
        bad.append((f, MD5[f], seen.get(f)))
log('命中 %d/%d，不一致 %d' % (len(seen), len(FILES), len(bad)))
for b in bad:
    log('  MISMATCH %s 期望=%s 实际=%s' % b)
if bad:
    log('\n[中止] md5 不一致 → 不杀进程、不重启。回滚：cd ' + RR + ' && cp -r ' + BK + '/web/* web/')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    raise SystemExit(2)
log('全部一致 OK')

# ---- 4) 清孤儿 uvicorn ----
log('\n===== 4) 检查 8000 占用（孤儿判定，仅当非 systemd MainPID）=====')
o, rc = plink("MP=$(systemctl show study-workbench -p MainPID --value); "
              "LP=$(ss -ltnp 2>/dev/null | grep ':8000' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2); "
              "echo \"MainPID=$MP  listen=$LP\"; "
              "if [ -n \"$LP\" ] && [ \"$LP\" != \"$MP\" ]; then echo 'ORPHAN -> kill'; kill -TERM $LP 2>/dev/null; sleep 2; kill -KILL $LP 2>/dev/null; echo killed; else echo 'no orphan'; fi")
log(o.strip())

# ---- 5) 重启 ----
log('\n===== 5) systemctl restart =====')
plink('systemctl reset-failed study-workbench 2>/dev/null; systemctl restart study-workbench')
time.sleep(9)
o, rc = plink("systemctl is-active study-workbench; systemctl show study-workbench -p MainPID -p NRestarts -p ExecMainStatus; "
              "echo '-- 8000 --'; ss -ltnp | grep ':8000' || echo '(free)'; "
              "echo '-- journal tail --'; journalctl -u study-workbench --no-pager -n 12")
log(o.strip())
assert 'active' in o.splitlines()[0], '服务未 active → 立即排查/回滚'

# ---- 6) 线上验收 ----
log('\n===== 6) 线上验收 =====')
fails = []

st0, b0 = http('/api/app/version')
try:
    j0 = json.loads(b0.decode('utf-8'))
except Exception:
    j0 = {}
log('  /api/app/version → HTTP %s version=%s（本轮应保持 1.42 不变）' % (st0, j0.get('version')))
if st0 != 200 or j0.get('version') != '1.42':
    fails.append('/api/app/version 异常：HTTP %s version=%s' % (st0, j0.get('version')))

PAGE_CASES = [
    ('英语.html', ['voiceplayer.js?v=20260929h', 'xt-log.js?v=20260928d', 'icon-map.js?v=20260929a'], []),
    ('学途.html', ['voiceplayer.js?v=20260929h', 'icon-map.js?v=20260929a'], []),
]
for pg, musts, mustnots in PAGE_CASES:
    st, body, _ = None, b'', None
    st, body = http('/' + urllib.parse.quote(pg) + '?cb=%d' % time.time())
    b = body if isinstance(body, bytes) else b''
    musts_e = [x.encode() if isinstance(x, str) else x for x in musts]
    mustnots_e = [x.encode() if isinstance(x, str) else x for x in mustnots]
    miss = [x for x in musts if x.encode() not in b]
    bad_ = [x for x in mustnots if x.encode() in b]
    log('  %-12s status=%s 缺=%s 残留=%s' % (pg, st, miss or '无', bad_ or '无'))
    if st != 200:
        fails.append(pg + ' HTTP ' + str(st))
    if miss:
        fails.append(pg + ' 缺 ' + str(miss))
    if bad_:
        fails.append(pg + ' 残留 ' + str(bad_))

for loc, arc in PAIRS:
    rel = arc[len('web/'):]
    st, body = http('/' + urllib.parse.quote(rel) + '?cb=%d' % time.time())
    h = hashlib.md5(body).hexdigest() if isinstance(body, bytes) and st == 200 else '-'
    ok = (h == MD5[arc])
    log('  %-34s status=%s md5一致=%s' % (rel, st, ok))
    if not ok:
        fails.append(rel + ' md5 不一致')

st, b = http('/')
log('  GET / → HTTP %s' % st)
if st != 200:
    fails.append('首页非 200')

log('\n[回滚] cd ' + RR + ' && cp -r ' + BK + '/web/* web/')
log('验收失败项：' + (str(fails) if fails else '无'))
log('R165_LIVE_' + ('ALL_PASS' if not fails else 'HAS_FAIL'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
raise SystemExit(0 if not fails else 3)
