# -*- coding: utf-8 -*-
"""通用远端执行（只把结果写文件，便于本机读取）。用法：python ssh_run.py <outfile> "<remote cmd>" """
import os, re, sys, subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
outfile = sys.argv[1]
cmd = sys.argv[2]

src = open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
PASS, HOST = m.group(1), m.group(2)

r = subprocess.run([PLINK, '-ssh', '-batch', '-pw', PASS, '-hostkey', HK, 'root@%s' % HOST, cmd],
                   capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=240)
with open(outfile, 'w', encoding='utf-8') as f:
    f.write('RC=%d\n' % r.returncode)
    f.write('--- STDOUT ---\n' + (r.stdout or '') + '\n')
    f.write('--- STDERR ---\n' + (r.stderr or '') + '\n')
print('WROTE', outfile, 'RC', r.returncode)
