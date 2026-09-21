# -*- coding: utf-8 -*-
# 只读：探生产 /opt/study-workbench/web 现状（HTML 数 / ai-settings 行尾 / 戳分布）
import os, io, re, subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
OUT = os.path.join(ROOT, 'tools', 'r72_prod_recon_out.txt')

host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    pwd, host = m.group(1), m.group(2)

remote = (
    "cd /opt/study-workbench/web && python3 - <<'PYEOF'\n"
    "import os, io, re\n"
    "hs = sorted([n for n in os.listdir('.') if n.lower().endswith('.html') and os.path.isfile(n)])\n"
    "print('PROD_HTML_COUNT=%d' % len(hs))\n"
    "print('PROD_HTML_NAMES=' + '|'.join(hs))\n"
    "for n in ['ai-settings.html','ai-settings.js']:\n"
    "    if os.path.exists(n):\n"
    "        b = io.open(n,'rb').read()\n"
    "        print('%s CRLF=%d loneLF=%d bytes=%d' % (n, b.count(b'\\r\\n'), b.count(b'\\n')-b.count(b'\\r\\n'), len(b)))\n"
    "    else:\n"
    "        print(n + ' MISSING')\n"
    "dist = {}\n"
    "for n in hs:\n"
    "    t = io.open(n,'rb').read().decode('utf-8','ignore')\n"
    "    for m in re.finditer(r'\\?v=([0-9A-Za-z_]+)', t):\n"
    "        dist[m.group(1)] = dist.get(m.group(1),0)+1\n"
    "print('PROD_STAMP_DIST=' + repr(sorted(dist.items())))\n"
    "PYEOF"
)

r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, remote],
                   capture_output=True, text=True, timeout=120, errors='replace')
res = ['RC=%d' % r.returncode, '--- STDOUT ---', r.stdout or '', '--- STDERR ---', r.stderr or '']
with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(res))
print('PROD RECON DONE rc=%d' % r.returncode)
