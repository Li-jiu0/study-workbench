# -*- coding: utf-8 -*-
"""20260916f 大批量前端部署：全站 HTML（导航/AI接入/返回按钮/工具删改/首页删卡）+ AI 底座 js"""
import os, io, sys, glob, tarfile, subprocess, re

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260916h'
TAR = os.path.join(ROOT, 'tools', 'frontend_%s.tar.gz' % STAMP)
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
LOG = []

# 全部根目录 HTML + 改动过的 assets js
htmls = [os.path.basename(p) for p in glob.glob(os.path.join(ROOT, '*.html'))]
files = ['assets/ai-service.js']

with tarfile.open(TAR, 'w:gz') as tar:
    for fn in files:
        p = os.path.join(ROOT, fn)
        if not os.path.exists(p):
            LOG.append('MISS %s' % fn)
            continue
        tar.add(p, arcname='web/' + fn.replace('\\', '/'))
names = tarfile.open(TAR).getnames()
LOG.append('打包 %d 个, %d bytes' % (len(names), os.path.getsize(TAR)))
for must in ['web/assets/ai-service.js']:
    assert must in names, '断言失败 ' + must
LOG.append('关键文件断言 OK')

host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        LOG.append('NO CRED')
        io.open(r'C:\Users\ATM\_dep_h_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
        sys.exit(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标 root@%s' % host)

if os.environ.get('SW_DRY_RUN') == '1':
    io.open(r'C:\Users\ATM\_dep_h_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
    print('\n'.join(LOG))
    sys.exit(0)

r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/' % (host, REMOTE_ROOT)], capture_output=True, text=True,
                   timeout=300, errors='replace')
LOG.append('上传 exit=%d %s' % (r.returncode, (r.stderr or '')[-200:]))

flist = ' '.join("web/'%s'" % h for h in htmls)
remote = (
    "cd {root} && "
    "tar -xzf frontend_{st}.tar.gz && echo EXTRACT_OK && "
    "curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1/AI.html; echo; "
    "grep -c '__XT_PROD__' web/AI.html; "
    "grep -c 'relayChat\\|SILICONFLOW\\|api/ai/chat' web/assets/ai-service.js; "
    "grep -c 'wrench' web/学习工作台.html || echo 'wrench0'; "
    "grep -c '效率工具' web/工具.html || echo '效率工具gone'"
).format(root=REMOTE_ROOT, st=STAMP)

r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    'root@' + host, remote], capture_output=True, text=True,
                   timeout=300, errors='replace')
LOG.append((r.stdout or '') + (('\n[STDERR] ' + r.stderr[-500:]) if r.stderr else ''))

io.open(r'C:\Users\ATM\_dep_h_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
print('\n'.join(LOG))
