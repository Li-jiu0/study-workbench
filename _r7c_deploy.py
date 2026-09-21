# -*- coding: utf-8 -*-
"""R7c 上线：APK 1.38 + 子页空白根因修复（CSS 门控）。
   上传清单（4 文本 + 1 APK）：
     web/个人中心.html      （R7c: body:not(.sp-ready) 门控 + router 戳 20260923d；含 R7b nav-trace）
     web/设置.html          （同上）
     web/assets/subpage-router.js（R7c: init() 打 sp-ready 类，戳 20260923d）
     server/routers/version.json （1.38/39 + notes + changelog v1.36/37/38 补写）
     web/static/apk/星途-1.38.apk
   复用 R7b 已验证 pscp/plink 模式：
  1) 远端预检：目标文件远端 md5 与本地比对（仅报告，不阻断）
  2) 上传 APK 到 /tmp -> mv 落位 -> 远端 md5 校验
  3) 文本 tar（web/ 与 server/ 前缀，UTF-8 中文名安全）-> 落位 -> 远端 md5 硬断言
  4) 重启后端（version.json 66s 进程缓存）
  5) /api/app/version 验证 version=1.38 versionCode=39 apkReady=True（66s 缓存重试）
  6) 站点抽验（全部 ASCII 模式串，规避 plink grep 中文不可信）：
     subpage-router.js 含 sp-ready 打标；设置/个人中心 含 body:not(.sp-ready) 门控与 20260923d 戳；
     AI.html 仍引 ai-page.js?v=20260923d（R7b 已上线，回归确认）
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
APK_REMOTE = '星途-1.38.apk'

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
        log.append(r.stdout.strip()[-1500:])
    if r.returncode != 0 and r.stderr.strip():
        log.append('STDERR: ' + r.stderr.strip()[-400:])
    return r


# ---- 0) 本地基线 + 内容守门断言 ----
TEXT_FILES = [
    ('web/个人中心.html', os.path.join(ROOT, '个人中心.html')),
    ('web/设置.html', os.path.join(ROOT, '设置.html')),
    ('web/assets/subpage-router.js', os.path.join(ROOT, 'assets', 'subpage-router.js')),
    ('server/routers/version.json', os.path.join(ROOT, 'server', 'routers', 'version.json')),
]

# 本地内容硬断言：上传件必须已带 R7c 修复，缺任一即中止
_prof = open(TEXT_FILES[0][1], encoding='utf-8').read()
_set = open(TEXT_FILES[1][1], encoding='utf-8').read()
_router = open(TEXT_FILES[2][1], encoding='utf-8').read()
_vjson = json.load(open(TEXT_FILES[3][1], encoding='utf-8'))
assert 'body:not(.sp-ready) [data-subpage]{display:none}' in _prof, '个人中心.html missing gate rule'
assert 'body:not(.sp-ready) [data-subpage]{display:none}' in _set, '设置.html missing gate rule'
assert '[data-subpage]{display:none}' not in _prof.replace('body:not(.sp-ready) [data-subpage]{display:none}', ''), '个人中心.html bare rule residual'
assert '[data-subpage]{display:none}' not in _set.replace('body:not(.sp-ready) [data-subpage]{display:none}', ''), '设置.html bare rule residual'
assert "classList.add('sp-ready')" in _router, 'subpage-router.js missing sp-ready mark'
assert _prof.count('subpage-router.js?v=20260923d') == 1, '个人中心 router stamp not 20260923d'
assert _set.count('subpage-router.js?v=20260923d') == 1, '设置 router stamp not 20260923d'
assert _vjson['version'] == '1.38' and _vjson['versionCode'] == 39, 'version.json not 1.38/39'
assert _vjson['apkFileName'] == '星途-1.38.apk', 'version.json apkFileName mismatch'
assert any(c['version'] == 'v1.38' for c in _vjson['changelog']), 'changelog missing v1.38'
assert any(c['version'] == 'v1.37' for c in _vjson['changelog']), 'changelog missing v1.37'
log.append('LOCAL CONTENT ASSERTS: ALL PASS')

local_apk_md5 = md5f(APK)
local_md5 = {arc: md5f(lp) for arc, lp in TEXT_FILES}
log.append('LOCAL APK md5=%s size=%d' % (local_apk_md5, os.path.getsize(APK)))
for arc, _ in TEXT_FILES:
    log.append('LOCAL %s md5=%s' % (arc, local_md5[arc]))

# ---- 1) 远端预检（差异仅报告） ----
remote_paths = [arc for arc, _ in TEXT_FILES]
r = run([PLINK, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, 'root@%s' % HOST,
         'cd /opt/study-workbench && md5sum ' + ' '.join(remote_paths) + ' 2>&1'], 120)
remote_out = r.stdout
for arc, _ in TEXT_FILES:
    lm = local_md5[arc]
    hit = any(line.startswith(lm) and arc in line for line in remote_out.splitlines())
    log.append('PRECHECK %s -> %s' % (arc, 'SAME' if hit else 'DIFF/MISSING(将覆盖,已有备份)'))

# ---- 2) 文本 tar ----
TAR_TEXT = os.path.join(ROOT, '_r7c_text.tar.gz')
with tarfile.open(TAR_TEXT, 'w:gz') as tf:
    for arc, lp in TEXT_FILES:
        assert os.path.isfile(lp), 'missing local: ' + lp
        tf.add(lp, arcname=arc)
with tarfile.open(TAR_TEXT, 'r:gz') as tf:
    names = tf.getnames()
assert set(names) == set(a for a, _ in TEXT_FILES), 'tar readback mismatch: %s' % names
log.append('TEXT_TAR built: %s (%d bytes) entries=%d' % (
    os.path.basename(TAR_TEXT), os.path.getsize(TAR_TEXT), len(names)))

# ---- 3) 上传 APK + tar ----
r = run([PSCP, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, APK, 'root@%s:/tmp/_r7c_apk.bin' % HOST], 1800)
assert r.returncode == 0, 'APK upload failed'
r = run([PSCP, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, TAR_TEXT, 'root@%s:/tmp/_r7c_text.tar.gz' % HOST], 300)
assert r.returncode == 0, 'text tar upload failed'

# ---- 4) 远端落位 + 备份 + md5 硬断言 ----
remote_cmd = (
    'set -e; '
    'cd /opt/study-workbench; '
    'BK=/opt/study-workbench/backups/r7c-$(date +%%Y%%m%%d-%%H%%M%%S); mkdir -p $BK; '
    'for f in web/个人中心.html web/设置.html web/assets/subpage-router.js server/routers/version.json; do '
    '  cp "$f" "$BK/$(echo $f | tr / _)" 2>/dev/null || true; done; '
    'echo "BK=$BK"; '
    'tar xzf /tmp/_r7c_text.tar.gz -C /opt/study-workbench; '
    'mv /tmp/_r7c_apk.bin /opt/study-workbench/web/static/apk/%s; '
    'echo "--- MD5 ---"; '
    'md5sum web/个人中心.html web/设置.html web/assets/subpage-router.js server/routers/version.json web/static/apk/%s; '
    'echo "--- GATE ---"; '
    'grep -c "sp-ready" web/assets/subpage-router.js; '
    'grep -c "body:not(.sp-ready)" web/设置.html web/个人中心.html; '
    'grep -o "subpage-router.js?v=[0-9a-z]*" web/设置.html web/个人中心.html; '
    'echo "--- APKDIR ---"; '
    'ls -la web/static/apk/' % (APK_REMOTE, APK_REMOTE)
)
r = run([PLINK, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, 'root@%s' % HOST, remote_cmd], 600)
out = r.stdout
log.append('REMOTE_OUT:' + out[-2000:])

ok_all = all(local_md5[arc] in out for arc, _ in TEXT_FILES) and local_apk_md5 in out
log.append('REMOTE_MD5_ALL_MATCH=%s' % ok_all)
assert ok_all, 'remote md5 mismatch (see REMOTE_OUT)'

# ---- 5) 重启后端（version.json 66s 进程缓存） ----
r = run([PLINK, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, 'root@%s' % HOST,
         'systemctl restart study-workbench && sleep 3 && systemctl is-active study-workbench'], 180)
log.append('RESTART: ' + r.stdout.strip()[-200:])
assert 'active' in r.stdout, 'service not active after restart'

# ---- 6) 接口验证（66s 缓存重试） ----
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
    if apk_ready and data.get('version') == '1.38':
        break
    time.sleep(66)

# ---- 7) 站点抽验（HTTP 层，ASCII 输出） ----
r = run([PLINK, '-batch', '-pw', PASS, '-hostkey', HOSTKEY, 'root@%s' % HOST,
         'curl -s -m 10 "http://127.0.0.1/assets/subpage-router.js" | grep -c "sp-ready"; '
         'curl -s -m 10 "http://127.0.0.1/assets/subpage-router.js" | grep -o "20260923d" | head -1; '
         'curl -s -m 10 "http://127.0.0.1/AI.html" | grep -o "ai-page.js?v=[0-9a-z]*" | head -2; '
         'curl -s -m 10 -o /dev/null -w "%{http_code}" "http://127.0.0.1/static/apk/星途-1.38.apk"; echo'], 60)
log.append('SITE CHECK: ' + r.stdout.strip()[:500])

verdict = 'R7C_LIVE' if (apk_ready and 'sp-ready' in r.stdout and '20260923d' in r.stdout) else 'R7C_CHECK'
log.append('VERDICT=' + verdict)
open(os.path.join(ROOT, '_r7c_deploy.txt'), 'w', encoding='utf-8').write('\n'.join(log) + '\n')
print('\n'.join(log))
