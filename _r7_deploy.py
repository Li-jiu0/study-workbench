# -*- coding: utf-8 -*-
"""R7 上线：APK 1.36 上传 + web/assets/xt-update.js + server/routers/version.json 同步。

复用 R6 已验证的 pscp/plink 模式与三层校验：
  1) 上传 APK 到 /tmp -> mv 到 web/static/apk/星途-1.36.apk -> 远端 md5 校验
  2) 上传两个文本文件（tar 打包，UTF-8 中文名安全）-> 落位 -> 远端 md5 校验
  3) /api/app/version 接口验证 version=1.36 versionCode=37 apkReady=True
  4) 站点抽验 /assets/xt-update.js?v=... 含 CURRENT_VERSION 1.36
"""
import os
import re
import json
import time
import hashlib
import tarfile
import subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
APK = os.path.join(ROOT, '星途-安卓App.apk')
APK_REMOTE = '星途-1.36.apk'

pw_src = open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', pw_src)
PASS, HOST = m.group(1), m.group(2)

log = []


def md5f(p):
    return hashlib.md5(open(p, 'rb').read()).hexdigest()


def run(cmd, timeout):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8',
                       errors='replace', timeout=timeout)
    log.append('CMD rc=%d :: %s' % (r.returncode, os.path.basename(cmd[0])))
    if r.stdout.strip():
        log.append(r.stdout.strip()[-1200:])
    if r.returncode != 0 and r.stderr.strip():
        log.append('STDERR: ' + r.stderr.strip()[-400:])
    return r


# ---- 0) 本地基线 ----
local_apk_md5 = md5f(APK)
local_js = os.path.join(ROOT, 'assets', 'xt-update.js')
local_vj = os.path.join(ROOT, 'server', 'routers', 'version.json')
local_js_md5 = md5f(local_js)
local_vj_md5 = md5f(local_vj)
log.append('LOCAL APK   md5=%s size=%d' % (local_apk_md5, os.path.getsize(APK)))
log.append('LOCAL xt-update.js   md5=%s' % local_js_md5)
log.append('LOCAL version.json   md5=%s' % local_vj_md5)

# ---- 1) 文本文件打 tar（web/ 与 server/ 前缀，解压到 /opt/study-workbench） ----
# 本地真源 = 项目根；web/ 前缀是生产映射名
TAR_TEXT = os.path.join(ROOT, '_r7_text.tar.gz')
entries = [
    ('web/assets/xt-update.js', os.path.join(ROOT, 'assets', 'xt-update.js')),
    ('server/routers/version.json', os.path.join(ROOT, 'server', 'routers', 'version.json')),
]
with tarfile.open(TAR_TEXT, 'w:gz') as tf:
    for arc, lp in entries:
        assert os.path.isfile(lp), 'missing local: ' + lp
        tf.add(lp, arcname=arc)
with tarfile.open(TAR_TEXT, 'r:gz') as tf:
    names = tf.getnames()
assert set(names) == set(e[0] for e in entries), 'tar readback mismatch: %s' % names
log.append('TEXT_TAR built: %s (%d bytes) entries=%s' % (
    os.path.basename(TAR_TEXT), os.path.getsize(TAR_TEXT), names))

# ---- 2) 上传 APK ----
r = run([PSCP, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, APK, 'root@%s:/tmp/_r7_apk.bin' % HOST], 1800)
assert r.returncode == 0, 'APK upload failed'

# ---- 3) 上传文本 tar ----
r = run([PSCP, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, TAR_TEXT, 'root@%s:/tmp/_r7_text.tar.gz' % HOST], 300)
assert r.returncode == 0, 'text tar upload failed'

# ---- 4) 远端落位 + 备份 + md5 ----
remote_cmd = (
    'set -e; '
    'cd /opt/study-workbench; '
    'BK=/opt/study-workbench/backups/r7-$(date +%%Y%%m%%d-%%H%%M%%S); mkdir -p $BK; '
    'cp web/assets/xt-update.js $BK/xt-update.js 2>/dev/null || true; '
    'cp server/routers/version.json $BK/version.json 2>/dev/null || true; '
    'echo "BK=$BK"; '
    'tar xzf /tmp/_r7_text.tar.gz -C /opt/study-workbench; '
    'mv /tmp/_r7_apk.bin /opt/study-workbench/web/static/apk/%s; '
    'echo "--- MD5 ---"; '
    'md5sum web/assets/xt-update.js server/routers/version.json web/static/apk/%s; '
    'echo "--- SIZE ---"; '
    'stat -c "%%s %%n" web/static/apk/%s; '
    'echo "--- APKDIR ---"; '
    'ls -la web/static/apk/' % (APK_REMOTE, APK_REMOTE, APK_REMOTE)
)
r = run([PLINK, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, 'root@%s' % HOST, remote_cmd], 600)
out = r.stdout
log.append('REMOTE_OUT:' + out[-1500:])

ok_apk = local_apk_md5 in out
ok_js = local_js_md5 in out
ok_vj = local_vj_md5 in out
log.append('REMOTE_MD5: APK=%s JS=%s VJ=%s' % (ok_apk, ok_js, ok_vj))
assert ok_apk, 'remote APK md5 mismatch'
assert ok_js, 'remote xt-update.js md5 mismatch'
assert ok_vj, 'remote version.json md5 mismatch'

# ---- 5) 重启后端（version.json 有 66s 进程缓存） ----
r = run([PLINK, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, 'root@%s' % HOST,
         'systemctl restart study-workbench && sleep 3 && systemctl is-active study-workbench'], 180)
log.append('RESTART: ' + r.stdout.strip()[-200:])
assert 'active' in r.stdout, 'service not active after restart'

# ---- 6) 接口验证（含 66s 缓存重试） ----
apk_ready = None
for attempt in (1, 2):
    r = run([PLINK, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, 'root@%s' % HOST,
             'curl -s -m 10 http://127.0.0.1/api/app/version'], 60)
    try:
        data = json.loads(r.stdout.strip().splitlines()[-1])
    except Exception:
        data = {}
    apk_ready = data.get('apkReady')
    log.append('ATTEMPT%d version=%s code=%s apkReady=%s apkUrl=%s' % (
        attempt, data.get('version'), data.get('versionCode'), apk_ready, data.get('apkUrl')))
    if apk_ready and data.get('version') == '1.36':
        break
    time.sleep(66)

# ---- 7) 站点抽验 xt-update.js ----
r = run([PLINK, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, 'root@%s' % HOST,
         'curl -s -m 10 "http://127.0.0.1/assets/xt-update.js" | grep -o "CURRENT_VERSION[^;]*" | head -3'], 60)
log.append('SITE xt-update.js: ' + r.stdout.strip()[:200])

verdict = 'R7_LIVE' if (apk_ready and '1.36' in r.stdout) else 'R7_CHECK'
log.append('VERDICT=' + verdict)
open(os.path.join(ROOT, '_r7_deploy.txt'), 'w', encoding='utf-8').write('\n'.join(log) + '\n')
print('\n'.join(log))
