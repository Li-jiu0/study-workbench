# -*- coding: utf-8 -*-
"""R72 阶段B 探针驱动：上传 r72_probe.py 到服务器并执行（含清场）。默认 dry-run。"""
import os, re, sys, subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
PROBE = os.path.join(ROOT, 'tools', 'r72_engineer', 'r72_probe.py')
OUT = os.path.join(ROOT, 'tools', 'r72_engineer', 'stage_b_probe_out.txt')

GO = '--go' in sys.argv

L = []
def w(s=''):
    L.append(str(s)); print(str(s))

def creds():
    src = open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
    return m.group(1), m.group(2)

# 本地语法检查（dry-run 也做）
import py_compile
try:
    py_compile.compile(PROBE, doraise=True)
    w('probe 本地 py_compile OK')
except Exception as e:
    w('probe py_compile FAIL: %r' % e); open(OUT,'w',encoding='utf-8').write('\n'.join(L)); sys.exit(2)

w('探针覆盖：friend_remarks 表存在 / Bug1 已读后会话仍在(unread=0) / Bug3 备注 写·读·清 / Bug2 管理员 role=admin-view / 回归 friends·groups·unread==200 / 清场 users 回锚点')

if not GO:
    w('\nDRY-RUN：未上传、未执行。')
    open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n'); sys.exit(0)

PASS, HOST = creds()
r = subprocess.run([PSCP, '-batch', '-pw', PASS, '-hostkey', HK, PROBE, 'root@%s:/tmp/up_r72/r72_probe.py' % HOST],
                   capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
w('\n[up] probe rc=%d %s' % (r.returncode, (r.stderr or '').replace('\r','').strip()[:160]))

r = subprocess.run([PLINK, '-ssh', '-batch', '-pw', PASS, '-hostkey', HK, 'root@%s' % HOST,
                    'cd /opt/study-workbench/server && python3 /tmp/up_r72/r72_probe.py'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
w('\n[probe] rc=%d' % r.returncode)
w((r.stdout or '').replace('\r',''))
if r.stderr.strip():
    w('stderr: ' + r.stderr.replace('\r','').strip()[:400])

open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('WROTE', OUT)
sys.exit(0 if r.returncode == 0 else 1)
