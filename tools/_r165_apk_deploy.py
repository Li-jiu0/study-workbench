# -*- coding: utf-8 -*-
"""R165 round-2 发版：全量待发网页 + APK 1.43 + version.json（安全顺序）。
沿用 _r150/_r165 验证过的口径：
  0) 线上备份 → 1) 上传 tar → 2) 远端 md5 校验 → 3) 解压 → 4) 逐文件 md5
  → 5) 上传 APK（ASCII 中转 + 中文名 mv）并校验 → 6) 上传 version.json
  → 7) 清孤儿 uvicorn → 8) systemctl restart → 9) 线上验收。
"""
import os, re, io, json, time, tarfile, hashlib, subprocess, urllib.request, urllib.parse, urllib.error

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
TAR_LOCAL = os.path.join(ROOT, 'tools', '_r165_apk_deploy.tar.gz')
TAR_REMOTE = '/tmp/_r165_apk_deploy.tar.gz'
OUT = os.path.join(ROOT, 'tools', '_r165_apk_deploy_out.txt')
PROBE = os.path.join(ROOT, 'tools', '_r165_probe_all_out.txt')
BK = RR + '/_bak-r165b-' + TS

APK_NAME = '星途-1.43.apk'
APK_LOCAL = os.path.join(ROOT, 'web', 'static', 'apk', APK_NAME)
APK_REMOTE_DIR = RR + '/web/static/apk'
APK_TMP_REMOTE = '/tmp/_r165_apk.bin'
VJ_LOCAL = os.path.join(ROOT, 'server', 'routers', 'version.json')

# ---- 待发页面：从全站探针结果解析（DIFF + .html + 非下划线前缀）----
PAGES = []
for line in io.open(PROBE, encoding='utf-8').read().splitlines():
    m = re.match(r'^\s*DIFF\s+(\S+\.html)$', line)
    if m and not m.group(1).startswith('_'):
        PAGES.append(m.group(1))
assert len(PAGES) >= 40, '解析到的待发页面过少（%d），终止' % len(PAGES)
ASSETS = ['assets/chat-local.js', 'assets/xt-aiusage.js', 'assets/xt-update.js']
PAIRS = [(p, 'web/' + p) for p in PAGES] + [(a, 'web/' + a) for a in ASSETS]
FILES = [arc for _, arc in PAIRS]

BAD = ('.apk', 'android/', '.db', '.env', 'model_usage.json', 'model_quota.json')
for f in FILES:
    assert not any(b in f for b in BAD), '禁列文件混入: ' + f
assert 'version.json' not in ' '.join(FILES), 'version.json 必须单独通道上传'

LOG = []
def log(s=''):
    LOG.append(str(s)); print(s)

# ---- 0) publishedAt 打时间戳 ----
vj = json.load(io.open(VJ_LOCAL, encoding='utf-8'))
assert vj.get('version') == '1.43' and vj.get('versionCode') == 44, 'version.json 版本号异常'
assert vj.get('apkFileName') == APK_NAME, 'apkFileName 与产物名不一致'
vj['publishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S+08:00')
vj['forced'] = False
io.open(VJ_LOCAL, 'w', encoding='utf-8', newline='\n').write(
    json.dumps(vj, ensure_ascii=False, indent=2) + '\n')
log('version.json publishedAt = %s（notes %d 条 / changelog[0] %d 条）'
    % (vj['publishedAt'], len(vj.get('notes') or []), len((vj.get('changelog') or [{}])[0].get('notes') or [])))

MD5 = {}
for loc, arc in PAIRS:
    p = os.path.join(ROOT, loc.replace('/', os.sep))
    assert os.path.exists(p), '本地缺文件: ' + loc
    MD5[arc] = hashlib.md5(open(p, 'rb').read()).hexdigest()
VJ_MD5 = hashlib.md5(open(VJ_LOCAL, 'rb').read()).hexdigest()
assert os.path.isfile(APK_LOCAL), 'APK 产物不存在: ' + APK_LOCAL
APK_MD5 = hashlib.md5(open(APK_LOCAL, 'rb').read()).hexdigest()
APK_SIZE = os.path.getsize(APK_LOCAL)

if os.path.exists(TAR_LOCAL):
    os.remove(TAR_LOCAL)
with tarfile.open(TAR_LOCAL, 'w:gz') as tf:
    for loc, arc in PAIRS:
        tf.add(os.path.join(ROOT, loc.replace('/', os.sep)), arcname=arc)
tar_md5 = hashlib.md5(open(TAR_LOCAL, 'rb').read()).hexdigest()
log('R165 round-2 | 站点 %d 件 | tar md5=%s (%d bytes)' % (len(FILES), tar_md5, os.path.getsize(TAR_LOCAL)))
log('APK  %s  %d bytes  md5=%s' % (APK_NAME, APK_SIZE, APK_MD5))
log('version.json md5=%s' % VJ_MD5)
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


def http(path, timeout=30, method=None):
    try:
        rq = urllib.request.Request('http://' + host + path, method=method,
                                    headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache',
                                             'User-Agent': 'r165b-deploy'})
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.read() if hasattr(e, 'read') else b'')
    except Exception as e:
        return None, str(e).encode()


def apk_version():
    st, b = http('/api/app/version')
    try:
        return st, json.loads(b.decode('utf-8'))
    except Exception:
        return st, None


# ---- 基线 ----
st0, j0 = apk_version()
log('\n[基线] /api/app/version = HTTP %s version=%s code=%s apkReady=%s'
    % (st0, (j0 or {}).get('version'), (j0 or {}).get('versionCode'), (j0 or {}).get('apkReady')))

# ---- 0) 备份 ----
o, rc = plink("mkdir -p '" + BK + "' && cd " + RR + " && ok=0; skip=0; "
              "for f in " + ' '.join("'" + f + "'" for f in FILES) + "; do "
              "  if [ -f \"$f\" ]; then cp --parents \"$f\" '" + BK + "' && ok=$((ok+1)); "
              "  else skip=$((skip+1)); echo \"SKIP(new) $f\"; fi; done; "
              "cp --parents server/routers/version.json '" + BK + "' 2>/dev/null; "
              "echo \"backed_up=$ok skipped=$skip\"")
log('\n===== 0) 线上备份 =====')
log(o.strip())

# ---- 1) 上传 tar ----
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR_LOCAL, 'root@' + host + ':' + TAR_REMOTE],
                   capture_output=True, text=True, timeout=900, errors='replace')
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
for b in bad[:20]:
    log('  MISMATCH %s 期望=%s 实际=%s' % b)
if bad:
    log('\n[中止] md5 不一致 → 不杀进程、不重启。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    raise SystemExit(2)
log('全部一致 OK')

# ---- 4) 上传 APK ----
o, rc = plink("mkdir -p '" + APK_REMOTE_DIR + "' && ls -l '" + APK_REMOTE_DIR + "' | tail -8")
log('\n===== 4) 上传 APK 前：远端 apk 目录 =====')
log(o.strip())
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, APK_LOCAL,
                    'root@' + host + ':' + APK_TMP_REMOTE],
                   capture_output=True, text=True, timeout=2400, errors='replace')
log('pscp rc=%d %s %s' % (r.returncode, (r.stdout or '').strip()[:200], (r.stderr or '').strip()[:300]))
if r.returncode != 0:
    log('[中止] pscp 上传失败 → 未重启、未宣告版本。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    raise SystemExit(4)
o, rc = plink('mv -f ' + APK_TMP_REMOTE + ' "' + APK_REMOTE_DIR + '/' + APK_NAME + '" && '
              'stat -c "%%s bytes" "' + APK_REMOTE_DIR + '/' + APK_NAME + '" && '
              'md5sum "' + APK_REMOTE_DIR + '/' + APK_NAME + '" && '
              "find '" + APK_REMOTE_DIR + "' -maxdepth 1 -name '*-1.43.apk' ! -name '" + APK_NAME +
              "' -print -delete; echo '(残留 1.43 乱码名已清理)'", timeout=300)
log(o.strip())
if APK_MD5 not in o:
    log('[中止] 远端 APK md5 与本地不一致 → 不重启、不宣告版本。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    raise SystemExit(4)
log('APK md5 一致 OK')

# ---- 5) 上传 version.json ----
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, VJ_LOCAL,
                    'root@' + host + ':' + RR + '/server/routers/version.json'],
                   capture_output=True, text=True, timeout=300, errors='replace')
log('\n===== 5) 上传 version.json =====')
log('pscp rc=%d' % r.returncode)
o, rc = plink('md5sum ' + RR + '/server/routers/version.json')
log(o.strip())
assert VJ_MD5 in o, '远端 version.json md5 不一致 → 中止'

# ---- 6) 清孤儿 ----
log('\n===== 6) 检查 8000 占用（孤儿判定）=====')
o, rc = plink("MP=$(systemctl show study-workbench -p MainPID --value); "
              "LP=$(ss -ltnp 2>/dev/null | grep ':8000' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2); "
              "echo \"MainPID=$MP  listen=$LP\"; "
              "if [ -n \"$LP\" ] && [ \"$LP\" != \"$MP\" ]; then echo 'ORPHAN -> kill'; kill -TERM $LP 2>/dev/null; sleep 2; kill -KILL $LP 2>/dev/null; echo killed; else echo 'no orphan'; fi")
log(o.strip())

# ---- 7) 重启 ----
log('\n===== 7) systemctl restart =====')
plink('systemctl reset-failed study-workbench 2>/dev/null; systemctl restart study-workbench')
time.sleep(9)
o, rc = plink("systemctl is-active study-workbench; systemctl show study-workbench -p MainPID -p NRestarts -p ExecMainStatus; "
              "echo '-- 8000 --'; ss -ltnp | grep ':8000' || echo '(free)'; "
              "echo '-- journal tail --'; journalctl -u study-workbench --no-pager -n 12")
log(o.strip())
assert 'active' in o.splitlines()[0], '服务未 active → 立即排查/回滚'

# ---- 8) 线上验收 ----
log('\n===== 8) 线上验收 =====')
fails = []

st_v, j = None, None
for _ in range(9):
    st_v, j = apk_version()
    if j and j.get('version') == '1.43':
        break
    time.sleep(10)
log('  /api/app/version HTTP %s version=%s code=%s apkReady=%s forced=%s'
    % (st_v, (j or {}).get('version'), (j or {}).get('versionCode'),
       (j or {}).get('apkReady'), (j or {}).get('forced')))
if not j or j.get('version') != '1.43':
    fails.append('/api/app/version 未变为 1.43')
if not (j or {}).get('apkReady'):
    fails.append('apkReady=false')
if (j or {}).get('forced') is not False:
    fails.append('forced 应为 false')

url = (j or {}).get('apkUrl') or ''
log('  apkUrl = %s' % url)
if url:
    st_a, body = http(url, timeout=900)
    got = len(body) if isinstance(body, bytes) else 0
    log('  GET apkUrl HTTP %s bytes=%d/%d' % (st_a, got, APK_SIZE))
    if st_a != 200 or got != APK_SIZE:
        fails.append('APK 下载异常（HTTP %s / %d bytes）' % (st_a, got))
    elif hashlib.md5(body).hexdigest() != APK_MD5:
        fails.append('APK md5 不一致')
    else:
        log('  远端 APK md5 一致 OK')
else:
    fails.append('apkUrl 为空')

# 逐文件线上 md5
diffn = 0
for loc, arc in PAIRS:
    rel = arc[len('web/'):]
    st, body = http('/' + urllib.parse.quote(rel) + '?cb=%d' % time.time())
    h = hashlib.md5(body).hexdigest() if isinstance(body, bytes) and st == 200 else '-'
    if h != MD5[arc]:
        diffn += 1
        log('  MISMATCH %-26s HTTP=%s' % (rel, st))
        fails.append(rel + ' 线上 md5 不一致')
log('  站点文件线上 md5 校准：%d/%d 一致' % (len(PAIRS) - diffn, len(PAIRS)))

# 关键内容点检
CASES = [
    ('协议.html', ['版本：V1.43'], ['版本：V1.42']),
    ('更多.html', ['xt-update.js?v=20260928e'], []),
    ('英语.html', ['voiceplayer.js?v=20260929h'], []),
    ('学习工作台.html', ['xt-log.js?v=20260928d'], []),
    ('私聊.html', [], ['class="im-title"']),
    ('数据管理.html', ['R155'], []),
]
for pg, musts, mustnots in CASES:
    st, body = http('/' + urllib.parse.quote(pg) + '?cb=%d' % time.time())
    b = body if isinstance(body, bytes) else b''
    miss = [x for x in musts if x.encode() not in b]
    bad_ = [x for x in mustnots if x.encode() in b]
    log('  %-16s status=%s 缺=%s 残留=%s' % (pg, st, miss or '无', bad_ or '无'))
    if st != 200:
        fails.append(pg + ' HTTP ' + str(st))
    if miss:
        fails.append(pg + ' 缺 ' + str(miss))
    if bad_:
        fails.append(pg + ' 残留 ' + str(bad_))

st, b = http('/')
log('  GET / → HTTP %s' % st)
if st != 200:
    fails.append('首页非 200')

log('\n[回滚] cd ' + RR + ' && cp -r ' + BK + '/web/* web/ && cp -r ' + BK + '/server/* server/ && systemctl restart study-workbench')
log('验收失败项：' + (str(fails) if fails else '无'))
log('R165B_LIVE_' + ('ALL_PASS' if not fails else 'HAS_FAIL'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
raise SystemExit(0 if not fails else 3)
