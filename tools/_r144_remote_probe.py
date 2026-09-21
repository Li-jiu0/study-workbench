# -*- coding: utf-8 -*-
"""R144 线上状态取证（只读）：远端 APK md5 / 服务状态 / 孤儿 uvicorn / 页戳。"""
import os, io, re, subprocess, time

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'

s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)


def plink(cmd, timeout=180):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    return (r.stdout or '') + (('\n[STDERR] ' + r.stderr.strip()) if (r.stderr or '').strip() else '')


CMD = (
    'echo "=== APK ==="; '
    'ls -l --time-style=full-iso ' + RR + '/web/static/apk/ | tail -5; '
    'md5sum ' + RR + '/web/static/apk/*.apk; '
    'echo "=== SERVICE ==="; '
    'systemctl is-active study-workbench; systemctl is-enabled study-workbench; '
    'systemctl show study-workbench -p MainPID -p ActiveState -p SubState -p NRestarts; '
    'echo "=== :8000 ==="; ss -ltnp 2>/dev/null | grep :8000; '
    'echo "=== LIVE PAGE STAMP ==="; '
    'grep -o "xt-update.js?v=[0-9a-z]*" ' + RR + '/web/关于.html | head -2; '
    'grep -o "CURRENT_VERSION *= *.[0-9.]*." ' + RR + '/web/assets/xt-update.js; '
    'md5sum ' + RR + '/web/live-location.html; '
    'echo "=== VERSION.JSON ==="; '
    'grep -o "\\"version\\"[^,]*" ' + RR + '/server/routers/version.json; '
    'grep -o "\\"versionCode\\"[^,]*" ' + RR + '/server/routers/version.json; '
    'echo "=== BACKUP DIRS ==="; ls -d ' + RR + '/_bak-r144-* 2>/dev/null | tail -4; '
    'echo "=== DONE ==="'
)

out = plink(CMD)
io.open(os.path.join(ROOT, 'tools', '_r144_remote_probe.txt'), 'w', encoding='utf-8').write(out)
print(out)
