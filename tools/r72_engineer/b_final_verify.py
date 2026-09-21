# -*- coding: utf-8 -*-
"""R72 收尾只读核对驱动：上传 b_final_check.py 到服务器并执行（不写生产）。"""
import os, re, subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CHECK = os.path.join(ROOT, 'tools', 'r72_engineer', 'b_final_check.py')
OUT = os.path.join(ROOT, 'tools', 'r72_engineer', 'b_final_check_out.txt')

src = open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
PASS, HOST = m.group(1), m.group(2)

L = []
def w(s=''):
    L.append(str(s)); print(str(s))

r = subprocess.run([PSCP, '-batch', '-pw', PASS, '-hostkey', HK, CHECK,
                    'root@%s:/tmp/up_r72/b_final_check.py' % HOST],
                   capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
w('[up] rc=%d %s' % (r.returncode, (r.stderr or '').replace('\r', '').strip()[:160]))

r = subprocess.run([PLINK, '-ssh', '-batch', '-pw', PASS, '-hostkey', HK, 'root@%s' % HOST,
                    'cd /opt/study-workbench/server && python3 /tmp/up_r72/b_final_check.py'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
w('[check] rc=%d' % r.returncode)
w((r.stdout or '').replace('\r', ''))
if r.stderr.strip():
    w('stderr: ' + r.stderr.replace('\r', '').strip()[:400])

open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('WROTE', OUT)
