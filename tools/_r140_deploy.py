# -*- coding: utf-8 -*-
"""R140 发版部署（1.40 / versionCode 41 / 星途-1.40.apk）。

安全顺序（沿用 R11/R11j 已验证流程）：
  1) 上传 tar → 远端 md5 校验 tar
  2) 备份本次会覆盖的线上原件 + 现有 APK 目录清单
  3) 解压 → 逐文件 md5 校验（不一致即中止：不杀进程、不重启）
  4) 上传 APK（87MB）→ /tmp → mv 到 web/static/apk/星途-1.40.apk → 远端 md5 校验
  5) 不重启服务（version.json 有进程内 60s 缓存）；等待 >65s 后做线上验收
  6) 线上验收：/api/app/version = 1.40 / 41 / apkReady，APK 可下载且 md5 一致，
     更新.html / 关于.html / 更多.html 含新戳 20260925a，xt-update.js CURRENT_VERSION=1.40
"""
import os, re, io, json, time, shutil, hashlib, subprocess, urllib.request, urllib.parse, sys

ROOT = r'D:\下载的文件\学习工作台'
assert os.path.isdir(os.path.join(ROOT, '.git')), 'ROOT/.git 不是目录 → 可能是 worktree，终止'
assert ROOT == r'D:\下载的文件\学习工作台', 'ROOT 字面量不匹配，终止'

PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
TAR_LOCAL = os.path.join(ROOT, 'tools', '_r140_deploy.tar.gz')
TAR_REMOTE = '/tmp/_r140_deploy.tar.gz'
APK_LOCAL = os.path.join(ROOT, 'web', 'static', 'apk', '星途-1.40.apk')
APK_REMOTE_DIR = RR + '/web/static/apk'
APK_NAME = '星途-1.40.apk'
OUT = os.path.join(ROOT, 'tools', '_r140_deploy_out.txt')

M = json.load(io.open(os.path.join(ROOT, 'tools', '_r140_manifest.json'), encoding='utf-8'))
MD5 = M['md5']
ARCS = sorted(MD5)
tar_local_md5 = hashlib.md5(open(TAR_LOCAL, 'rb').read()).hexdigest()
apk_local_md5 = hashlib.md5(open(APK_LOCAL, 'rb').read()).hexdigest()
apk_local_size = os.path.getsize(APK_LOCAL)

LOG = []


def log(s=''):
    LOG.append(str(s))
    print(s)


s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)


def plink(cmd, timeout=300):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    out = (r.stdout or '')
    if (r.stderr or '').strip():
        out += '\n[STDERR] ' + r.stderr.strip()
    return out, r.returncode


def http(url, headers=None, timeout=30):
    try:
        rq = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(rq, timeout=timeout) as resp:
            return resp.status, resp.read()
    except Exception as e:
        return None, str(e).encode()


log('目标 root@%s   包内 %d 条   tar md5=%s' % (host, len(ARCS), tar_local_md5))
log('APK %s  %d bytes   md5=%s' % (APK_NAME, apk_local_size, apk_local_md5))
assert not any(a.endswith('.apk') for a in ARCS), '清单混入 APK'

o, rc = plink('systemctl is-active study-workbench')
log('\n部署前服务状态: %s' % o.strip())
assert o.strip() == 'active', '服务非 active → 先排查，终止'

# ---------- 1) 上传 tar 并校验 ----------
log('\n===== 1) 上传 tar =====')
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR_LOCAL, 'root@%s:%s' % (host, TAR_REMOTE)],
                   capture_output=True, text=True, timeout=300, errors='replace')
log('pscp rc=%d %s %s' % (r.returncode, (r.stdout or '').strip()[:200], (r.stderr or '').strip()[:200]))
o, rc = plink('md5sum %s' % TAR_REMOTE)
log(o.rstrip())
assert tar_local_md5 in o, '远端 tar md5 不一致 → 终止'
log('tar md5 一致 ✅')

# ---------- 2) 备份 ----------
log('\n===== 2) 备份线上原件 =====')
bksh = (
    'TS=$(date +%%Y%%m%%d-%%H%%M%%S); BK=%s/backups/r140-$TS; mkdir -p "$BK" && '
    'cd %s && '
    'cp -a web/关于.html "$BK/关于.html.bak" 2>/dev/null; '
    'cp -a web/更新.html "$BK/更新.html.bak" 2>/dev/null; '
    'cp -a web/更多.html "$BK/更多.html.bak" 2>/dev/null; '
    'cp -a web/assets/xt-update.js "$BK/xt-update.js.bak" 2>/dev/null; '
    'cp -a server/routers/version.json "$BK/version.json.bak" 2>/dev/null; '
    'echo "BACKUP_DIR=$BK"; ls -la "$BK"; du -sh "$BK"'
) % (RR, RR)
o, rc = plink(bksh)
log(o.rstrip())
mbk = re.search(r'BACKUP_DIR=(\S+)', o)
BK = mbk.group(1) if mbk else None
log('备份目录: %s' % BK)

# ---------- 3) 解压 + 逐文件 md5 ----------
log('\n===== 3) 解压 + 逐文件 md5 校验 =====')
o, rc = plink('cd %s && tar -xzf %s && echo EXTRACT_OK' % (RR, TAR_REMOTE))
log(o.rstrip())
assert 'EXTRACT_OK' in o, '解压失败 → 终止（未动服务）'

paths = [RR + '/' + a for a in ARCS]
o, rc = plink('cd %s && md5sum %s' % (RR, ' '.join("'%s'" % p for p in paths)), timeout=180)
bad, seen = [], {}
for line in o.splitlines():
    mm = re.match(r'^([0-9a-f]{32})\s+(.+)$', line.strip())
    if not mm:
        continue
    h, p = mm.group(1), mm.group(2).strip().lstrip('*')
    rel = p[len(RR) + 1:] if p.startswith(RR + '/') else p
    seen[rel] = h
for a in ARCS:
    if seen.get(a) != MD5[a]:
        bad.append((a, MD5[a], seen.get(a)))
log('校验: 命中 %d/%d, 不一致 %d' % (len(seen), len(ARCS), len(bad)))
for b in bad:
    log('  MISMATCH %s 期望=%s 实际=%s' % b)
if bad:
    log('\n[中止] md5 不一致 → 未杀进程、未重启；线上仍由原文件服务。')
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
    raise SystemExit(2)
log('全部一致 ✅')

# ---------- 4) 上传 APK ----------
log('\n===== 4) 上传 APK（87MB，耐心） =====')
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, APK_LOCAL, 'root@%s:/tmp/_r140_apk.bin' % host],
                   capture_output=True, text=True, timeout=900, errors='replace')
log('pscp rc=%d %s %s' % (r.returncode, (r.stdout or '').strip()[:200], (r.stderr or '').strip()[:300]))
o, rc = plink('mkdir -p "%s" && mv -f /tmp/_r140_apk.bin "%s/%s" && stat -c "%%s bytes" "%s/%s" && md5sum "%s/%s" && ls -la "%s"'
              % (APK_REMOTE_DIR, APK_REMOTE_DIR, APK_NAME, APK_REMOTE_DIR, APK_NAME, APK_REMOTE_DIR, APK_NAME, APK_REMOTE_DIR))
log(o.rstrip())
assert apk_local_md5 in o, '远端 APK md5 与本地不一致 → 需重传'
log('APK md5 一致 ✅')

# ---------- 5) 等服务缓存过期（version.json 进程内 60s） ----------
log('\n===== 5) 等待 version.json 进程内缓存过期（65s）=====')
time.sleep(65)

# ---------- 6) 线上验收 ----------
log('\n===== 6) 线上验收 =====')
st, body = http('http://110.42.134.62/api/app/version')
log('/api/app/version: status=%s' % st)
try:
    j = json.loads(body.decode('utf-8'))
    log('  ' + json.dumps(j, ensure_ascii=False))
    assert j.get('version') == '1.40', 'version 不是 1.40'
    assert int(j.get('versionCode') or 0) == 41, 'versionCode 不是 41'
    log('  version/versionCode ✅')
except AssertionError:
    raise
except Exception as e:
    log('  解析/校验异常: %s' % e)
    raise SystemExit(3)

apk_url = j.get('apkUrl') or ''
log('apkUrl = %s' % apk_url)
if apk_url:
    st2, b2 = http(apk_url)
    ok = (st2 == 200 and hashlib.md5(b2).hexdigest() == apk_local_md5)
    log('APK 下载: status=%s size=%s md5=%s  一致=%s'
        % (st2, len(b2) if isinstance(b2, bytes) else '-',
           hashlib.md5(b2).hexdigest() if isinstance(b2, bytes) else '-', ok))
    assert ok, '公网 APK 与本地不一致'

for pg in ['更新.html', '关于.html', '更多.html']:
    st3, b3 = http('http://110.42.134.62/' + urllib.parse.quote(pg), {'Cache-Control': 'no-cache'})
    hit = b'?v=20260925a' in b3
    log('  %-12s status=%s 含20260925a=%s' % (pg, st3, hit))

st4, b4 = http('http://110.42.134.62/assets/xt-update.js', {'Cache-Control': 'no-cache'})
mm = re.search(rb"CURRENT_VERSION\s*=\s*'([^']*)'", b4)
log('  xt-update.js status=%s CURRENT_VERSION=%s' % (st4, mm.group(1).decode() if mm else '?'))

st5, b5 = http('http://110.42.134.62/')
log('  首页 status=%s' % st5)

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
log('\n[written] ' + OUT)
log('VERDICT=R140_OK')
