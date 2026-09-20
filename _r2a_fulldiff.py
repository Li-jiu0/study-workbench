# -*- coding: utf-8 -*-
"""R2A 本地 vs 生产 全量差异预检（web + server 双向三表）
输出：DIFF（内容不同）/ ONLY_LOCAL（部署后新增）/ ONLY_REMOTE（线上独有，绝不删）
"""
import os, re, io, json, hashlib, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
WT = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-2ab398e3'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
REMOTE_JSON = '/tmp/_r2a_prod_md5.json'

src = io.open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8', errors='replace').read()
m = re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
pwd, host = m.group(1), m.group(2)

SH = r'''python3 - <<'PYEOF'
import io, os, hashlib, json
WEB = '/opt/study-workbench/web'
SRV = '/opt/study-workbench/server'
SKIP_DIR = {'__pycache__', '.venv', 'backups', 'node_modules'}
SKIP_FILE = {'.env', 'data.db', 'feedback.json', 'model_usage.json'}
out = {}
def walk(base, prefix):
    for dp, dns, fns in os.walk(base):
        dns[:] = [d for d in dns if d not in SKIP_DIR]
        for fn in fns:
            if fn in SKIP_FILE or fn.endswith(('.pyc', '.log', '.db-journal', '.db-wal')):
                continue
            p = os.path.join(dp, fn)
            rel = prefix + os.path.relpath(p, base).replace(os.sep, '/')
            try:
                out[rel] = hashlib.md5(io.open(p, 'rb').read()).hexdigest()
            except Exception:
                out[rel] = None
walk(WEB, 'web/')
walk(SRV, 'server/')
io.open('/tmp/_r2a_prod_md5.json', 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False))
print('REMOTE_FILES', len(out))
PYEOF
'''
sh = os.path.join(ROOT, '_r2a_md5.sh')
io.open(sh, 'w', encoding='utf-8', newline='\n').write(SH)
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, sh, 'root@%s:/tmp/_r2a_md5.sh' % host],
                   capture_output=True, text=True, timeout=300, errors='replace')
r2 = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@%s' % host,
                     'bash /tmp/_r2a_md5.sh && cat /tmp/_r2a_prod_md5.json'],
                    capture_output=True, text=True, timeout=900, errors='replace')
txt = r2.stdout or ''
i = txt.find('{')
if i < 0:
    print('远端输出异常:', txt[:400], r2.stderr[:300]); sys.exit(2)
rem = json.loads(txt[i:])
print('生产文件数 =', len(rem))

loc = {}
for prefix, base in [('web/', ROOT), ('server/', os.path.join(ROOT, 'server'))]:
    for dp, dns, fns in os.walk(base):
        dns[:] = [d for d in dns if d not in {'__pycache__', '.venv', 'backups', 'node_modules', '.git', '.workbuddy', 'tools', '备份'}]
        for fn in fns:
            if fn in {'.env', 'data.db', 'feedback.json', 'model_usage.json'} or fn.endswith(('.pyc', '.log', '.tar.gz', '.apk')):
                continue
            p = os.path.join(dp, fn)
            rel = prefix + os.path.relpath(p, base).replace(os.sep, '/')
            if prefix == 'web/' and rel.startswith('web/tools/'):
                continue
            try:
                loc[rel] = hashlib.md5(open(p, 'rb').read()).hexdigest()
            except Exception:
                pass
# 本地 web/ 实为仓库根，需剔除服务器端不存在的目录
loc = {k: v for k, v in loc.items() if not k.startswith(('web/server/',))}
print('本地可比文件数 =', len(loc))

diff = sorted(k for k in set(loc) & set(rem) if loc[k] != rem[k])
only_local = sorted(set(loc) - set(rem))
only_remote = sorted(set(rem) - set(loc))
rep = []
rep.append('生产文件 %d / 本地可比 %d' % (len(rem), len(loc)))
rep.append('')
rep.append('=== DIFF 内容不同 (%d) ===' % len(diff))
for k in diff: rep.append('  ~ ' + k)
rep.append('')
rep.append('=== ONLY_LOCAL 本地有线上无 (%d) ===' % len(only_local))
for k in only_local: rep.append('  + ' + k)
rep.append('')
rep.append('=== ONLY_REMOTE 线上独有（绝不删）(%d) ===' % len(only_remote))
for k in only_remote: rep.append('  - ' + k)
out = '\n'.join(rep)
io.open(os.path.join(WT, '_r2a_fulldiff.txt'), 'w', encoding='utf-8').write(out + '\n')
io.open(os.path.join(WT, '_r2a_deploy_list.json'), 'w', encoding='utf-8').write(
    json.dumps({'diff': diff, 'only_local': only_local}, ensure_ascii=False, indent=1))
print(out)
