# -*- coding: utf-8 -*-
# 定位生产里 data-page="ppt" 命中的页面（只读）
import os, io, re, subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
OUT = os.path.join(ROOT, 'tools', 'r72_probe_ppt_out.txt')

host = os.environ.get('SW_HOST', ''); pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    pwd, host = m.group(1), m.group(2)

py = "\n".join([
    "import os, io",
    "W='/opt/study-workbench/web'",
    "hs=sorted([n for n in os.listdir(W) if n.lower().endswith('.html') and os.path.isfile(os.path.join(W,n))])",
    "tot=0",
    "for n in hs:",
    "    c=io.open(os.path.join(W,n),'rb').read().count(b'data-page=\"ppt\"')",
    "    if c:",
    "        print('PPT_HIT %-40s %d' % (n, c)); tot+=c",
    "print('PPT_TOTAL=%d' % tot)",
])
cmd = "python3 - <<'PYEOF'\n" + py + "\nPYEOF"
r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                   capture_output=True, text=True, timeout=120, errors='replace')
with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write('RC=%d\n%s\n[STDERR] %s' % (r.returncode, r.stdout or '', r.stderr or ''))
print('PROBE DONE rc=%d' % r.returncode)
