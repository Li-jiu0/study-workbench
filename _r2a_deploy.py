# -*- coding: utf-8 -*-
"""R2A 全量差量部署（web + server）：打包 → 上传 → 解压 → 逐文件 md5 → 备份 → 重启 → 健康检查

- 依赖闭包：直接复用 _r2a_fulldiff.py 产出的 diff / only_local 清单，不手工列举
- 中文文件名走 tar（UTF-8 名随包传输），避免 pscp 的 GBK 假成功
- 只做「新增 + 覆盖」，从不删除线上文件（ONLY_REMOTE 一律保留）
- 排除：运行时数据（.env / data.db / feedback.json / model_usage.json）与仓库开发垃圾
"""
import os, re, io, json, tarfile, hashlib, subprocess, sys, time

ROOT = r'D:\下载的文件\学习工作台'
WT = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2ab398e3'
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
TARBALL = os.path.join(WT, '_r2a_deploy.tar.gz')
OUT = os.path.join(WT, '_r2a_deploy_out.txt')
LOG = []


def log(s=''):
    LOG.append(str(s))
    print(s)


src = io.open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8', errors='replace').read()
m = re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
pwd, host = m.group(1), m.group(2)

sel = json.loads(io.open(os.path.join(WT, '_r2a_deploy_list.json'), encoding='utf-8').read())
cand = sel['diff'] + sel['only_local']

# 运行时数据：永不覆盖
HARD_EXEMPT = {
    'server/.env', 'server/data.db', 'server/data/feedback.json',
    'server/data/model_usage.json', 'server/data/db_backup.json',
    'server/_r73_blacklist_test.db', 'server/建表SQL.sql', 'server/.env.example',
}
# 仓库开发垃圾 / 非站点内容：不推送（线上本来也没有）
JUNK_PREFIX = ('web/.qa/', 'web/.codebuddy/', 'web/tools/', 'web/docs/', 'web/deliverables/',
               'web/备份/', 'web/.tmp', 'web/_tmp', 'web/_r', 'web/_javac', 'web/_pyc',
               'web/_verify', 'server/scripts/', 'server/backups/', 'server/_tmp')
JUNK_EXACT = {'web/.gitignore', 'web/.page', 'web/_qa_harness.html'}


def keep(rel):
    if rel in HARD_EXEMPT:
        return False
    if rel.startswith(JUNK_PREFIX):
        return False
    if rel in JUNK_EXACT:
        return False
    if rel.startswith('web/'):
        body = rel[4:]
        if body.startswith('assets/'):
            return True
        if body.startswith('static/'):
            return True
        if '/' not in body and body.endswith('.html'):
            return True
        return False
    if rel.startswith('server/'):
        return rel.endswith(('.py', '.json'))
    return False


files = [r for r in cand if keep(r)]
files = sorted(set(files))
log('推送清单 %d 个文件（候选 %d，过滤掉 %d）' % (len(files), len(cand), len(cand) - len(files)))

def local_path(rel):
    # 仓库根即生产 web/ 的映射：web/x -> <ROOT>/x ；server/x -> <ROOT>/server/x
    if rel.startswith('web/'):
        return os.path.join(ROOT, rel[4:])
    return os.path.join(ROOT, rel)


manifest = {}
for rel in files:
    p = local_path(rel)
    if not os.path.isfile(p):
        log('  ★本地缺失，跳过: ' + rel); continue
    manifest[rel] = hashlib.md5(open(p, 'rb').read()).hexdigest()
log('实际入包 %d 个文件' % len(manifest))

with tarfile.open(TARBALL, 'w:gz') as tf:
    for rel in sorted(manifest):
        tf.add(local_path(rel), arcname=rel)
log('tar 大小 = %d bytes' % os.path.getsize(TARBALL))
mj = os.path.join(ROOT, '_r2a_manifest.json')
io.open(mj, 'w', encoding='utf-8', newline='\n').write(json.dumps(manifest, ensure_ascii=False))

for a, b in [(TARBALL, '/tmp/_r2a_deploy.tar.gz'), (mj, '/tmp/_r2a_manifest.json')]:
    r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, a, 'root@%s:%s' % (host, b)],
                       capture_output=True, text=True, timeout=1800, errors='replace')
    log('pscp %-28s exit=%d' % (os.path.basename(a), r.returncode))
    if r.returncode != 0:
        log('★上传失败 ' + (r.stderr or '')[-200:]); io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); sys.exit(7)

STAMP = time.strftime('%Y%m%d-%H%M%S')
REMOTE = r'''set -u
STAMP="''' + STAMP + r'''"
BASE=/opt/study-workbench
BK=$BASE/backups/r2a-$STAMP
python3 - <<'PYEOF'
import io, os, json, hashlib, shutil, subprocess, sys, time
BASE='/opt/study-workbench'
STAMP=os.environ.get('STAMP','r2a')
MAN=json.loads(io.open('/tmp/_r2a_manifest.json',encoding='utf-8').read())
BK=os.path.join(BASE,'backups','r2a-'+time.strftime('%Y%m%d-%H%M%S'))
os.makedirs(BK,exist_ok=True)
# 1) 备份将被覆盖的文件
nb=0
for rel in MAN:
    dst=os.path.join(BASE,rel)
    if os.path.exists(dst):
        b=os.path.join(BK,os.path.dirname(rel))
        os.makedirs(b,exist_ok=True)
        shutil.copy2(dst,os.path.join(BK,rel))
        nb+=1
# 备份库
if os.path.exists(os.path.join(BASE,'server','data.db')):
    shutil.copy2(os.path.join(BASE,'server','data.db'),os.path.join(BK,'data.db'))
print('BACKUP_FILES',nb,'->',BK)
# 2) 解压
r=subprocess.run(['tar','-xzf','/tmp/_r2a_deploy.tar.gz','-C',BASE],capture_output=True,text=True)
print('TAR_EXIT',r.returncode,r.stderr[-300:])
if r.returncode!=0:
    print('ABORT_EXTRACT'); sys.exit(1)
# 3) 逐文件 md5 核对
bad=[];ok=0
for rel,exp in MAN.items():
    p=os.path.join(BASE,rel)
    try:
        h=hashlib.md5(io.open(p,'rb').read()).hexdigest()
    except Exception as e:
        bad.append((rel,'READ_FAIL')); continue
    if h==exp: ok+=1
    else: bad.append((rel,exp[:10]+'!='+h[:10]))
print('MD5_OK',ok,'/',len(MAN))
for x in bad: print('  MISMATCH',x)
print('VERDICT','PASS' if not bad else 'FAIL')
PYEOF
echo "--- 服务重启 ---"
systemctl restart study-workbench
sleep 8
systemctl is-active study-workbench
echo "NRestarts=$(systemctl show -p NRestarts --value study-workbench)"
'''

sh = os.path.join(ROOT, '_r2a_deploy.sh')
io.open(sh, 'w', encoding='utf-8', newline='\n').write(REMOTE)
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, sh, 'root@%s:/tmp/_r2a_deploy.sh' % host],
                   capture_output=True, text=True, timeout=300, errors='replace')
log('pscp deploy.sh exit=%d' % r.returncode)

r2 = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@%s' % host,
                     'STAMP=%s bash /tmp/_r2a_deploy.sh' % STAMP],
                    capture_output=True, text=True, timeout=1800, errors='replace')
log('--- 远端输出 ---')
log((r2.stdout or '') + '\n[ERR]\n' + (r2.stderr or ''))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG) + '\n')
