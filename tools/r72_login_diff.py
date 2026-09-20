# -*- coding: utf-8 -*-
# 安全核对：把生产 登录.html 拉回（base64 走 plink，避开中文名 pscp），与本地逐行 diff
import os, io, re, subprocess, base64, difflib

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
OUT = os.path.join(ROOT, 'tools', 'r72_login_diff_out.txt')

host = os.environ.get('SW_HOST', ''); pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    pwd, host = m.group(1), m.group(2)

remote_py = ("import base64,io\n"
             "print(base64.b64encode(io.open('/opt/study-workbench/web/登录.html','rb').read()).decode('ascii'))\n")
cmd = "python3 - <<'PYEOF'\n" + remote_py + "PYEOF"
r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                   capture_output=True, text=True, timeout=120, errors='replace')
b64 = (r.stdout or '').strip()
prod = base64.b64decode(b64).decode('utf-8', 'replace') if b64 else ''
local = io.open(os.path.join(ROOT, '登录.html'), 'r', encoding='utf-8-sig', newline='').read()

def lines(t):
    return [x.rstrip('\r') for x in t.split('\n')]

a = lines(prod); b = lines(local)
d = list(difflib.unified_diff(a, b, fromfile='PROD/登录.html', tofile='LOCAL/登录.html', lineterm='', n=0))
added = sum(1 for x in d if x.startswith('+') and not x.startswith('+++'))
removed = sum(1 for x in d if x.startswith('-') and not x.startswith('---'))
res = []
res.append('PROD bytes=%d  LOCAL bytes=%d' % (len(b64), len(local.encode('utf-8'))))
res.append('diff: added(LOCAL only)=%d  removed(PROD only)=%d' % (added, removed))
res.append('--- unified diff (n=0) ---')
res.extend(d[:400])
with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(res))
print('LOGIN DIFF DONE added=%d removed=%d' % (added, removed))
