# -*- coding: utf-8 -*-
"""R171-APK 上线：APK 先落服务器并验证可下载，之后才允许更新 version.json（防 R87 型事故）。

中文文件名规避：APK 先用 ASCII 名上传到 /tmp，再由**纯 ASCII 的远端 python 脚本**
（文件名用 \\uXXXX 转义写入）移动到中文目标名，全程不把中文放进 scp 目标路径。

幂等：若远端 /tmp 中转文件已存在且 md5 与本地一致，则跳过重复上传（87MB 大文件不重传）。
"""
import hashlib
import io
import os
import re
import shutil
import subprocess
import urllib.error
import urllib.request

ROOT = r"D:\下载的文件\学习工作台"
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
APK_DIR_REMOTE = RR + '/web/static/apk'
TMP_REMOTE = '/tmp/_r171_apk144.bin'

src = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src))
PWD_, HOST = m.group(1), m.group(2)

LOG = []


def log(s=''):
    LOG.append(str(s))
    print(s, flush=True)


def plink(cmd, timeout=900):
    r = subprocess.run([PLINK, '-ssh', '-pw', PWD_, '-batch', '-hostkey', HOSTKEY, 'root@' + HOST, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    return (r.stdout or '') + (('\n[STDERR] ' + r.stderr.strip()) if (r.stderr or '').strip() else '')


# ---- 0) 本地产物 ----
local_apk = os.path.join(ROOT, '星途-安卓App.apk')
dst_local = os.path.join(ROOT, 'web', 'static', 'apk', '星途-1.44.apk')
os.makedirs(os.path.dirname(dst_local), exist_ok=True)
shutil.copy2(local_apk, dst_local)
local_md5 = hashlib.md5(io.open(local_apk, 'rb').read()).hexdigest()
dst_md5 = hashlib.md5(io.open(dst_local, 'rb').read()).hexdigest()
log('===== 0) 本地 APK 产物 =====')
log('  %s  %d B  md5=%s' % (os.path.basename(local_apk), os.path.getsize(local_apk), local_md5))
log('  %s  %d B  md5=%s' % (os.path.basename(dst_local), os.path.getsize(dst_local), dst_md5))
if local_md5 != dst_md5:
    log('[中止] 复制后 md5 不一致')
    raise SystemExit(3)

# ---- 1) 远端中转文件现状（幂等判断）----
o = plink('if [ -f ' + TMP_REMOTE + ' ]; then md5sum ' + TMP_REMOTE + '; else echo NO_TMP; fi')
need_upload = (local_md5 not in o)
log('')
log('===== 1) 远端中转文件检查 =====')
log('  ' + o.strip())
log('  需要上传 = %s' % need_upload)

if need_upload:
    r = subprocess.run([PSCP, '-pw', PWD_, '-batch', '-hostkey', HOSTKEY, local_apk,
                        'root@' + HOST + ':' + TMP_REMOTE],
                       capture_output=True, text=True, timeout=1800, errors='replace')
    log('  pscp rc=%d %s' % (r.returncode, (r.stderr or '').strip()[:300]))
    if r.returncode != 0:
        log('[中止] pscp 失败')
        raise SystemExit(3)
else:
    log('  远端已是同一文件（md5 一致），跳过 87MB 重传')

# ---- 2) 远端 md5 复核 ----
o = plink('md5sum ' + TMP_REMOTE + '; stat -c %s ' + TMP_REMOTE)
log('')
log('===== 2) 远端 md5 / 大小（中转文件）=====')
log(o.strip())
if local_md5 not in o:
    log('[中止] 远端 md5 不一致')
    raise SystemExit(3)
log('  md5 一致 OK')

# ---- 3) 纯 ASCII 远端脚本：移动到中文目标名 + 复核 ----
REMOTE_PY = (
    "# -*- coding: utf-8 -*-\n"
    "import hashlib, io, os, shutil\n"
    "SRC = '" + TMP_REMOTE + "'\n"
    "D = '" + APK_DIR_REMOTE + "'\n"
    "NAME = '\\u661f\\u9014-1.44.apk'\n"
    "EXPECT = '" + local_md5 + "'\n"
    "os.makedirs(D, exist_ok=True)\n"
    "dst = os.path.join(D, NAME)\n"
    "assert os.path.exists(SRC), 'temp apk missing'\n"
    "shutil.move(SRC, dst)\n"
    "b = io.open(dst, 'rb').read()\n"
    "print('MOVED_TO=' + dst)\n"
    "print('SIZE=%d' % len(b))\n"
    "print('MD5=%s' % hashlib.md5(b).hexdigest())\n"
    "print('MATCH=%s' % (hashlib.md5(b).hexdigest() == EXPECT))\n"
    "print('DIR=' + ','.join(sorted(os.listdir(D))))\n"
)
local_py = os.path.join(ROOT, 'tools', 'qa', '_r171_apkmove.py')
io.open(local_py, 'w', encoding='ascii', newline='\n').write(REMOTE_PY)
r = subprocess.run([PSCP, '-pw', PWD_, '-batch', '-hostkey', HOSTKEY, local_py,
                    'root@' + HOST + ':/tmp/_r171_apkmove.py'],
                   capture_output=True, text=True, timeout=300, errors='replace')
if r.returncode != 0:
    log('[中止] 上传改名脚本失败 %s' % (r.stderr or '').strip()[:200])
    raise SystemExit(3)
o = plink('python3 /tmp/_r171_apkmove.py 2>&1')
log('')
log('===== 3) 远端改名并复核 =====')
log(o.strip())
if 'MATCH=True' not in o:
    log('[中止] 目标文件 md5 不匹配')
    raise SystemExit(3)

# ---- 4) HTTP 可下载性 ----
url = 'http://' + HOST + '/static/apk/' + urllib.request.quote('星途-1.44.apk')
log('')
log('===== 4) HTTP 可下载性 =====')
log('  url = %s' % url)
ok_head = False
try:
    rq = urllib.request.Request(url, method='HEAD',
                                headers={'User-Agent': 'r171-verify', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(rq, timeout=60) as rr:
        st, cl = rr.status, rr.headers.get('Content-Length')
    log('  HEAD -> %s  Content-Length=%s' % (st, cl))
    ok_head = (st == 200 and str(cl) == str(os.path.getsize(local_apk)))
except urllib.error.HTTPError as e:
    log('  HEAD -> HTTPError %s' % e.code)
except Exception as e:
    log('  HEAD -> %r' % (e,))

ok_range = False
try:
    rq = urllib.request.Request(url, headers={'Range': 'bytes=0-1048575',
                                             'User-Agent': 'r171-verify',
                                             'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(rq, timeout=120) as rr:
        head = rr.read()
    log('  Range GET 取回 %d B；魔数 = %r' % (len(head), head[:2]))
    ok_range = (head[:2] == b'PK')
except Exception as e:
    log('  Range GET 失败 %r' % (e,))

o = plink("ls -la " + APK_DIR_REMOTE + " | tail -16; echo '--- version.json (线上, 应仍为 1.43) ---'; "
          "python3 -c \"import json,io;d=json.load(io.open('" + RR + "/server/routers/version.json',encoding='utf-8'));"
          "print('version=%s code=%s apk=%s' % (d.get('version'), d.get('versionCode'), d.get('apkFileName')))\"")
log('')
log('===== 5) 远端 APK 目录 / 线上 version.json =====')
log(o.strip())

log('')
log('本地 APK md5     = %s' % local_md5)
log('HTTP HEAD 200+长度一致 = %s' % ok_head)
log('Range GET 取到 PK      = %s' % ok_range)
verdict = ok_head and ok_range
log('R171_APK_UPLOAD_' + ('PASS' if verdict else 'FAIL'))
io.open(os.path.join(ROOT, 'tools', 'qa', '_r171_apk_upload.txt'), 'w',
        encoding='utf-8').write('\n'.join(LOG) + '\n')
raise SystemExit(0 if verdict else 6)
