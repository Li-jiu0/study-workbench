# -*- coding: utf-8 -*-
"""R171 发版前「生产 ground truth + 依赖闭包 + 服务端三层比对」综合预检（只读，不改生产）。

做四件事：
  1) 远端枚举 /opt/study-workbench/{web,server} 全部文件的 md5+size，落 /tmp 后拉回本地；
  2) 本地 vs 生产 双向三表（DIFFER / ONLY_LOCAL / ONLY_REMOTE）；
  3) 前端依赖闭包：本地 HTML 引用的 assets 是否都在生产存在（差集 = 部署后必 404 清单）；
  4) 服务端三层比对：把生产 server/**.py 拉回本地临时目录，逐文件列
     ① class/def/@router 清单差异 ② 忽略空白的实质代码行差异 ③ 生产有本地无 / 本地有生产无。
"""
import glob
import hashlib
import io
import os
import re
import shutil
import subprocess
import sys

ROOT = r"D:\下载的文件\学习工作台"
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
RR = '/opt/study-workbench'
QA = os.path.join(ROOT, 'tools', 'qa')
LIVE = os.path.join(ROOT, 'tools', '_r171_srv_live')

src = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src))
PWD_, HOST = m.group(1), m.group(2)

LOG = []


def log(s=''):
    LOG.append(str(s))
    print(s)


def plink(cmd, timeout=900):
    r = subprocess.run([PLINK, '-ssh', '-pw', PWD_, '-batch', '-hostkey', HOSTKEY, 'root@' + HOST, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    out = r.stdout or ''
    if (r.stderr or '').strip():
        out += '\n[STDERR] ' + r.stderr.strip()
    return out, r.returncode


# ======================================================================
# 1) 远端枚举：md5|size|relpath → /tmp/_r171_manifest.txt
# ======================================================================
REMOTE = '''
import hashlib, io, os
RR = '/opt/study-workbench'
SKIP_DIRS = {'.venv', '__pycache__', 'node_modules', 'backups', 'uploads', '_bak_r171'}
SKIP_FILES = {'data.db'}
rows = []
for base in ('web', 'server'):
    root = os.path.join(RR, base)
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            if fn in SKIP_FILES or fn.startswith('data.db'):
                continue
            fp = os.path.join(dp, fn)
            try:
                b = io.open(fp, 'rb').read()
            except Exception:
                continue
            rel = os.path.relpath(fp, RR).replace('\\\\', '/')
            rows.append('%s|%d|%s' % (hashlib.md5(b).hexdigest(), len(b), rel))
rows.sort()
io.open('/tmp/_r171_manifest.txt', 'w', encoding='utf-8').write('\\n'.join(rows))
print('MANIFEST_ROWS=%d' % len(rows))

# 服务端 py 打包（供本地三层比对）
os.system("cd " + RR + "/server && tar -czf /tmp/_r171_srvpy.tar.gz $(find . -name '*.py' "
          "-not -path './.venv/*' -not -path '*/__pycache__/*') 2>/dev/null; echo TAR_DONE")
print('SVRTAR=%s' % (os.path.getsize('/tmp/_r171_srvpy.tar.gz') if os.path.exists('/tmp/_r171_srvpy.tar.gz') else 0))
'''


def heredoc(body, dst):
    plink("cat > " + dst + " <<'PYEOF'\n" + body + "\nPYEOF\necho HEREDOC_OK")


heredoc(REMOTE, '/tmp/_r171_pre.py')
out, _ = plink('python3 /tmp/_r171_pre.py')
log('===== 1) 远端枚举 =====')
log(out.strip())

for remote, local in (('/tmp/_r171_manifest.txt', os.path.join(QA, '_r171_prod_manifest.txt')),
                      ('/tmp/_r171_srvpy.tar.gz', os.path.join(QA, '_r171_srvpy.tar.gz'))):
    r = subprocess.run([PSCP, '-pw', PWD_, '-batch', '-hostkey', HOSTKEY,
                        'root@' + HOST + ':' + remote, local],
                       capture_output=True, text=True, timeout=600, errors='replace')
    log('  pscp %s rc=%d %s' % (remote, r.returncode, (r.stderr or '').strip()[:200]))

prod = {}
for ln in io.open(os.path.join(QA, '_r171_prod_manifest.txt'), encoding='utf-8').read().splitlines():
    parts = ln.split('|')
    if len(parts) == 3:
        prod[parts[2]] = (parts[0], int(parts[1]))
log('  生产清单 %d 条' % len(prod))

# ======================================================================
# 2) 本地 vs 生产 双向三表
# ======================================================================
local_rel = {}


def add_local(rel, abspath):
    if os.path.isfile(abspath):
        local_rel[rel] = abspath


for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    n = os.path.basename(p)
    if n.startswith('_') or '.bak' in n.lower() or '.backup' in n.lower():
        continue
    add_local('web/' + n, p)
for p in sorted(glob.glob(os.path.join(ROOT, 'assets', '**', '*'), recursive=True)):
    if not os.path.isfile(p):
        continue
    n = os.path.basename(p)
    if not n.endswith(('.js', '.css', '.json')) or n.startswith('_') or '.bak' in n.lower():
        continue
    rel_in = os.path.relpath(p, os.path.join(ROOT, 'assets')).replace('\\', '/')
    if rel_in.split('/')[0] in ('verifier',):
        continue
    add_local('web/assets/' + rel_in, p)
for dp, dns, fns in os.walk(os.path.join(ROOT, 'server')):
    dns[:] = [d for d in dns if d not in ('.venv', '__pycache__', 'backups', 'uploads')]
    for fn in fns:
        if not fn.endswith('.py'):
            continue
        fp = os.path.join(dp, fn)
        rel = 'server/' + os.path.relpath(fp, os.path.join(ROOT, 'server')).replace('\\', '/')
        add_local(rel, fp)

local_md5 = {rel: hashlib.md5(io.open(p, 'rb').read()).hexdigest() for rel, p in local_rel.items()}

differ, only_local, same = [], [], []
for rel, md5 in sorted(local_md5.items()):
    if rel not in prod:
        only_local.append(rel)
    elif prod[rel][0] != md5:
        differ.append((rel, md5, prod[rel][0], prod[rel][1]))
    else:
        same.append(rel)

# 生产有本地无：只看 web/ 与 server/*.py 的同名域
only_remote = []
for rel in sorted(prod):
    if rel.startswith('server/') and not rel.endswith('.py'):
        continue
    if rel in local_md5:
        continue
    only_remote.append(rel)

log('')
log('===== 2) 本地 vs 生产 =====')
log('  本地文件 %d / 生产文件 %d' % (len(local_md5), len(prod)))
log('  SAME        %d' % len(same))
log('  DIFFER      %d' % len(differ))
for rel, lm, rm, rsz in differ[:80]:
    log('    DIFFER %-46s local=%s prod=%s(%dB)' % (rel, lm[:10], rm[:10], rsz))
log('  ONLY_LOCAL  %d' % len(only_local))
for rel in only_local[:80]:
    log('    ONLY_LOCAL %s' % rel)
log('  ONLY_REMOTE %d（含历史遗留旧页，属正常）' % len(only_remote))
for rel in only_remote[:80]:
    log('    ONLY_REMOTE %s' % rel)

# ======================================================================
# 3) 前端依赖闭包：本地 HTML 引用的 assets 在生产是否存在
# ======================================================================
missing_assets = {}
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    n = os.path.basename(p)
    if n.startswith('_') or '.bak' in n.lower():
        continue
    t = io.open(p, encoding='utf-8', errors='replace').read()
    for mm in re.finditer(r'(?:src|href)\s*=\s*["\'](assets/[A-Za-z0-9_.\-/]+\.(?:js|css|json))', t):
        a = mm.group(1)
        if 'web/' + a not in prod:
            missing_assets.setdefault(a, set()).add(n)

log('')
log('===== 3) 前端依赖闭包（生产缺失 → 部署后必 404）=====')
if not missing_assets:
    log('  无缺失（全部引用在生产已存在）')
else:
    for a in sorted(missing_assets):
        log('  MISSING %-34s 被 %d 页引用: %s' % (a, len(missing_assets[a]), ','.join(sorted(missing_assets[a]))))

# ======================================================================
# 4) 服务端三层比对
# ======================================================================
srv_tar = os.path.join(QA, '_r171_srvpy.tar.gz')
if os.path.exists(srv_tar):
    if os.path.isdir(LIVE):
        shutil.rmtree(LIVE, ignore_errors=True)
    os.makedirs(LIVE)
    import tarfile
    with tarfile.open(srv_tar, 'r:gz') as tf:
        tf.extractall(LIVE)

log('')
log('===== 4) 服务端三层比对（LIVE = 生产拉回）=====')
RE_CLASS = re.compile(r'^(class\s+\w+)', re.M)
RE_DEF = re.compile(r'^(\s*def\s+\w+)', re.M)
RE_ROUTE = re.compile(r'^@router\w*\.(get|post|put|patch|delete)\("([^"]+)"', re.M)
LIVE_SRV = LIVE          # tar 成员形如 ./config.py、./routers/admin.py


def inventory(text):
    return (sorted(RE_CLASS.findall(text)),
            sorted(RE_DEF.findall(text)),
            sorted('%s %s' % (a.upper(), b) for a, b in RE_ROUTE.findall(text)))


def norm_lines(text):
    return {re.sub(r'\s+', ' ', l).strip() for l in text.splitlines() if l.strip() and not l.strip().startswith('#')}


py_files = []
for rel in sorted(local_md5):
    if rel.startswith('server/') and rel.endswith('.py'):
        py_files.append(rel)

for rel in py_files:
    lp = local_rel[rel]
    rp = os.path.join(LIVE_SRV, rel[len('server/'):].replace('/', os.sep))
    flag = 'DIFFER' if rel in [x[0] for x in differ] else ('ONLY_LOCAL' if rel in only_local else 'SAME')
    if not os.path.exists(rp):
        log('  %-40s [%s] 生产缺失该文件' % (rel, flag))
        continue
    lt = io.open(lp, encoding='utf-8', errors='replace').read()
    rt = io.open(rp, encoding='utf-8', errors='replace').read()
    lc, ld, lr = inventory(lt)
    rc, rd, rr = inventory(rt)
    ln, rn = norm_lines(lt), norm_lines(rt)
    prod_only = sorted(rn - ln)
    local_only = sorted(ln - rn)
    verdict = 'OK'
    if prod_only:
        verdict = '**生产有本地无（危险：上传会删功能）%d 行**' % len(prod_only)
    log('  %-40s [%s] 类%d/%d def%d/%d 路由%d/%d 实质行差异 生产独有=%d 本地独有=%d  %s'
        % (rel, flag, len(lc), len(rc), len(ld), len(rd), len(lr), len(rr),
           len(prod_only), len(local_only), verdict))
    if prod_only:
        for x in prod_only[:12]:
            log('        PROD_ONLY: ' + x[:170])
    for x in sorted(local_only)[:6]:
        log('        local_only: ' + x[:170])

io.open(os.path.join(QA, '_r171_precheck.txt'), 'w', encoding='utf-8').write('\n'.join(LOG) + '\nR171_PRECHECK_DONE\n')
print('\nR171_PRECHECK_DONE')
