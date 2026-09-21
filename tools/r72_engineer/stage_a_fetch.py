# -*- coding: utf-8 -*-
"""R72 后端部署 · 阶段A（只读）：下载服务器 5 文件 + 三层差异预检 + 只读探活。
绝不打印明文密码；全部结果写文件。"""
import os, re, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
TMP = r'C:\Users\ATM\AppData\Local\Temp\r72_precheck'
SRVDIR = '/opt/study-workbench/server'
OUT = os.path.join(ROOT, 'tools', 'r72_engineer', 'stage_a_out.txt')

os.makedirs(TMP, exist_ok=True)
L = []
def w(s=''):
    L.append(str(s))

# ---- 凭据（正则提取，绝不 print 明文/绝不入库）----
src = open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
if not m:
    w('FATAL: 未能从 upload_v23.ps1 提取凭据'); open(OUT,'w',encoding='utf-8').write('\n'.join(L)); sys.exit(2)
PASS, HOST = m.group(1), m.group(2)
w('creds: extracted PASS(len=%d) HOST=%s' % (len(PASS), HOST))
w('tools exist: pscp=%s plink=%s' % (os.path.exists(PSCP), os.path.exists(PLINK)))

def plink(cmd, timeout=60):
    return subprocess.run([PLINK, '-ssh', '-batch', '-pw', PASS, '-hostkey', HK, 'root@%s' % HOST, cmd],
                          capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)

# ---- 1) 下载 5 个待覆盖文件 ----
FILES = ['database.py', 'schemas.py', 'routers/chat.py', 'routers/friends.py', 'routers/groups.py']
LOCALNAME = {'database.py':'srv_database.py','schemas.py':'srv_schemas.py',
             'routers/chat.py':'srv_chat.py','routers/friends.py':'srv_friends.py','routers/groups.py':'srv_groups.py'}
w('\n== 1) 下载（pscp）==')
for f in FILES:
    dst = os.path.join(TMP, LOCALNAME[f])
    r = subprocess.run([PSCP, '-batch', '-pw', PASS, '-hostkey', HK,
                        'root@%s:%s/%s' % (HOST, SRVDIR, f), dst],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
    sz = os.path.getsize(dst) if os.path.exists(dst) else -1
    w('  %-20s rc=%d size=%d %s' % (f, r.returncode, sz, (r.stderr or '').replace('\r','').strip()[:160]))

# ---- 2) 远端只读探活 + 文件存在性 ----
w('\n== 2) 远端只读探活 ==')
r = plink('systemctl is-active study-workbench && systemctl show -p NRestarts --value study-workbench')
w('  is-active/NRestarts: %s' % (r.stdout or '').replace('\r','').strip())

probe = (
 "cd /opt/study-workbench/server && python3 - <<'PYEOF'\n"
 "import os, sqlite3, glob, re, collections\n"
 "print('CWD', os.getcwd())\n"
 "c = sqlite3.connect('data.db')\n"
 "print('USERS', c.execute('select count(*) from users').fetchone()[0])\n"
 "print('FRIEND_REMARKS_TABLE', c.execute(\"select count(*) from sqlite_master where type='table' and name='friend_remarks'\").fetchone()[0])\n"
 "print('HAS_DDL_建表SQL.sql', os.path.exists('建表SQL.sql'))\n"
 "print('SRVDIR_LIST', sorted(os.listdir('.')))\n"
 "web='/opt/study-workbench/web'\n"
 "st=collections.Counter()\n"
 "for f in glob.glob(web+'/*.html'):\n"
 "    b=open(f,'rb').read().decode('utf-8','ignore')\n"
 "    for mm in re.finditer(r'\\?v=([0-9A-Za-z_\\-\\.]+)', b): st[mm.group(1)]+=1\n"
 "print('STAMPS', st.most_common(15))\n"
 "print('HTML_COUNT', len(glob.glob(web+'/*.html')))\n"
 "PYEOF"
)
r = plink(probe, timeout=90)
w('  --- probe rc=%d ---' % r.returncode)
w((r.stdout or '').replace('\r',''))
if r.stderr and r.stderr.strip():
    w('  probe stderr: ' + r.stderr.replace('\r','').strip()[:300])

open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('WROTE', OUT)
