# -*- coding: utf-8 -*-
"""R72 后端 · 阶段B 部署脚本（备份→上传→md5三验→可选重启）。默认 dry-run，不改生产。
用法：
  python stage_b_deploy.py            # dry-run：只打印步骤 + 本地 md5，不连生产写
  python stage_b_deploy.py --go       # 执行 备份+上传+md5三验（不重启）
  python stage_b_deploy.py --go --restart   # 再执行重启+is-active
"""
import os, re, sys, hashlib, subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
SRV = '/opt/study-workbench/server'
STAGE = '/tmp/up_r72'
STAMP = 'r72-20260917'
OUT = os.path.join(ROOT, 'tools', 'r72_engineer', 'stage_b_deploy_out.txt')

GO = '--go' in sys.argv
RESTART = '--restart' in sys.argv

# 待覆盖文件：本地相对 server/ 的路径 -> (远端暂存 ASCII 名, 远端目标绝对路径)
FILES = [
    ('database.py',          'database.py', SRV + '/database.py'),
    ('schemas.py',           'schemas.py',  SRV + '/schemas.py'),
    ('routers/chat.py',      'chat.py',     SRV + '/routers/chat.py'),
    ('routers/friends.py',   'friends.py',  SRV + '/routers/friends.py'),
    ('routers/groups.py',    'groups.py',   SRV + '/routers/groups.py'),
    (u'\u5efa\u8868SQL.sql', 'ddl.sql',     SRV + u'/\u5efa\u8868SQL.sql'),   # 建表SQL.sql（中文名→ASCII 中转）
]

L = []
def w(s=''):
    L.append(str(s))
    print(str(s))

def md5_local(p):
    return hashlib.md5(open(p, 'rb').read()).hexdigest()

def creds():
    src = open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
    return m.group(1), m.group(2)

def plink(cmd, pw, host, timeout=180):
    return subprocess.run([PLINK, '-ssh', '-batch', '-pw', pw, '-hostkey', HK, 'root@%s' % host, cmd],
                          capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout)

def pscp_up(local, remote, pw, host):
    return subprocess.run([PSCP, '-batch', '-pw', pw, '-hostkey', HK, local, 'root@%s:%s' % (host, remote)],
                          capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)

w('mode: %s%s' % ('GO' if GO else 'DRY-RUN', ' +RESTART' if RESTART else ''))

# 本地 md5
local_md5 = {}
for rel, ascii_name, remote in FILES:
    lp = os.path.join(ROOT, 'server', rel.replace('/', os.sep))
    local_md5[ascii_name] = md5_local(lp)
    raw = open(lp, 'rb').read()
    lone = raw.count(b'\n') - raw.count(b'\r\n')
    w('  local %-14s md5=%s loneLF=%d' % (ascii_name, local_md5[ascii_name], lone))

w('\n[计划步骤]')
w(' 1) 远端备份: mkdir -p %s/backups/hotfix-%s && cp -a 5*py + 建表SQL.sql + data.db 备份目录' % ('/opt/study-workbench', STAMP))
w(' 2) pscp 上传 6 件到 %s/ （ddl 用 ASCII 名 ddl.sql）' % STAGE)
w(' 3) 远端 md5(暂存) 与本地比对')
w(' 4) 远端点对点安装：暂存→目标；ddl.sql→建表SQL.sql(shutil.move)')
w(' 5) 远端 md5(安装后) 三方一致')
if RESTART:
    w(' 6) systemctl restart study-workbench && sleep 8 && is-active + NRestarts')

if not GO:
    w('\nDRY-RUN：未连接生产、未写任何东西。')
    open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    sys.exit(0)

# ---------------- 执行 ----------------
PASS, HOST = creds()
bk = '/opt/study-workbench/backups/hotfix-%s' % STAMP
cp_list = ' '.join([SRV + '/database.py', SRV + '/schemas.py', SRV + '/routers/chat.py',
                    SRV + '/routers/friends.py', SRV + '/routers/groups.py',
                    SRV + u'/\u5efa\u8868SQL.sql', SRV + '/data.db'])
r = plink('mkdir -p %s && cp -a %s %s/ && ls -1 %s' % (bk, cp_list, bk, bk), PASS, HOST)
w('\n[1] 备份 rc=%d\n%s' % (r.returncode, (r.stdout or '').replace('\r','').strip()))

r = plink('mkdir -p %s && rm -f %s/*' % (STAGE, STAGE), PASS, HOST)
w('\n[2] 暂存目录 rc=%d' % r.returncode)
staged_ok = True
for rel, ascii_name, remote in FILES:
    lp = os.path.join(ROOT, 'server', rel.replace('/', os.sep))
    r = pscp_up(lp, '%s/%s' % (STAGE, ascii_name), PASS, HOST)
    w('    up %-14s rc=%d' % (ascii_name, r.returncode))
    if r.returncode != 0:
        staged_ok = False

r = plink('cd %s && python3 -c "import hashlib,os;[print(hashlib.md5(open(f,\'rb\').read()).hexdigest(),f) for f in sorted(os.listdir(\'.\'))]"' % STAGE, PASS, HOST)
staged_md5 = dict((n, h) for h, n in re.findall(r'([0-9a-f]{32})\s+(\S+)', (r.stdout or '')))
w('\n[3] 暂存 md5：%s' % staged_md5)
for k, h in local_md5.items():
    if staged_md5.get(k) != h:
        staged_ok = False
w('    staging == local : %s' % staged_ok)

if not staged_ok:
    w('ABORT：暂存与本地不一致，未安装。')
    open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n'); sys.exit(2)

# 安装
mv = []
for rel, ascii_name, remote in FILES:
    mv.append('cp -f %s/%s %s' % (STAGE, ascii_name, remote))
r = plink(' && '.join(mv) + ' && python3 -c "import shutil;shutil.move(\'%s/ddl.sql\',\'%s\')"' % (STAGE, SRV + u'/\u5efa\u8868SQL.sql'), PASS, HOST)
w('\n[4] 安装 rc=%d %s' % (r.returncode, (r.stderr or '').replace('\r','').strip()[:200]))

# 安装后 md5
md5cmd = 'python3 -c "import hashlib,os;'
md5cmd += 'print(hashlib.md5(open(\'%s/database.py\',\'rb\').read()).hexdigest(),\'database.py\');' % SRV
md5cmd += 'print(hashlib.md5(open(\'%s/schemas.py\',\'rb\').read()).hexdigest(),\'schemas.py\');' % SRV
md5cmd += 'print(hashlib.md5(open(\'%s/routers/chat.py\',\'rb\').read()).hexdigest(),\'chat.py\');' % SRV
md5cmd += 'print(hashlib.md5(open(\'%s/routers/friends.py\',\'rb\').read()).hexdigest(),\'friends.py\');' % SRV
md5cmd += 'print(hashlib.md5(open(\'%s/routers/groups.py\',\'rb\').read()).hexdigest(),\'groups.py\');' % SRV
md5cmd += 'print(hashlib.md5(open(\'%s/%s\',\'rb\').read()).hexdigest(),\'ddl.sql\')"' % (SRV, u'\u5efa\u8868SQL.sql')
r = plink(md5cmd, PASS, HOST)
installed = dict((n, h) for h, n in re.findall(r'([0-9a-f]{32})\s+(\S+)', (r.stdout or '')))
w('\n[5] 安装后 md5：%s' % installed)
ok3 = all(installed.get(k) == h and staged_md5.get(k) == h for k, h in local_md5.items())
w('    local == staged == installed : %s' % ok3)

if RESTART:
    r = plink('systemctl restart study-workbench; sleep 8; systemctl is-active study-workbench; systemctl show -p NRestarts --value study-workbench', PASS, HOST)
    w('\n[6] restart rc=%d out=%s' % (r.returncode, (r.stdout or '').replace('\r','').strip()))

open(OUT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('WROTE', OUT)
