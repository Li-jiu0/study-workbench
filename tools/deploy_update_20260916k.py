# -*- coding: utf-8 -*-
"""20260916i 热修：①app.js 对象展开(ES2018)改 Object.assign（老 WebView 解析失败导致全站按钮失效）
   ②app.js 内 const AI_CONFIG 改名 APP_AI_DEMO_CONFIG（与 ai-config.js 全局重复声明导致 ai-config.js 整体报废、AI 只能本地兜底）
   ③全站 HTML 版本戳统一 bump，强制客户端拉新"""
import os, io, sys, glob, tarfile, subprocess, re

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260916k'
TAR = os.path.join(ROOT, 'tools', 'frontend_%s.tar.gz' % STAMP)
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
LOG = []

# 1) 全站 HTML 版本戳 bump
htmls = []
bumped = 0
for p in glob.glob(os.path.join(ROOT, '*.html')):
    b = os.path.basename(p)
    if 'bak' in b.lower():
        continue
    htmls.append(b)
    s = io.open(p, encoding='utf-8', errors='ignore').read()
    s2, n = re.subn(r'\?v=[0-9A-Za-z_\-\.]+', '?v=' + STAMP, s)
    if n:
        io.open(p, 'w', encoding='utf-8').write(s2)
        bumped += n
LOG.append('HTML %d 个, bump 版本戳 %d 处' % (len(htmls), bumped))

files = ['assets/app.js']

# 2) 打包
with tarfile.open(TAR, 'w:gz') as tar:
    for fn in files:
        p = os.path.join(ROOT, fn)
        if not os.path.exists(p):
            LOG.append('MISS %s' % fn)
            continue
        tar.add(p, arcname='web/' + fn.replace('\\', '/'))
    for h in htmls:
        tar.add(os.path.join(ROOT, h), arcname='web/' + h)
names = tarfile.open(TAR).getnames()
LOG.append('打包 %d 个, %d bytes' % (len(names), os.path.getsize(TAR)))
for must in ['web/assets/app.js', 'web/AI.html']:
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
        io.open(r'C:\Users\ATM\_dep_k_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
        sys.exit(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标 root@%s' % host)

if os.environ.get('SW_DRY_RUN') == '1':
    io.open(r'C:\Users\ATM\_dep_k_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
    print('\n'.join(LOG))
    sys.exit(0)

r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/' % (host, REMOTE_ROOT)], capture_output=True, text=True,
                   timeout=300, errors='replace')
LOG.append('上传 exit=%d %s' % (r.returncode, (r.stderr or '')[-200:]))

remote = (
    "cd {root} && "
    "tar -xzf frontend_{st}.tar.gz && echo EXTRACT_OK && "
    "curl -s -o /dev/null -w 'AI.html=%{{http_code}} ' http://127.0.0.1/AI.html; "
    "curl -s -o /dev/null -w 'home=%{{http_code}}' http://127.0.0.1/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0.html; echo; "
    "echo '--- app.js 机器人球/健壮性校验 ---'; "
    "grep -c 'initAiFabModule' web/assets/app.js; "
    "grep -c 'touchmove' web/assets/app.js; "
    "grep -c 'const AI_CONFIG' web/assets/app.js || echo 'const_AI_CONFIG=0(OK)'; "
    "grep -c 'Object.assign({{}}, appData' web/assets/app.js"
).format(root=REMOTE_ROOT, st=STAMP)

r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    'root@' + host, remote], capture_output=True, text=True,
                   timeout=300, errors='replace')
LOG.append((r.stdout or '') + (('\n[STDERR] ' + r.stderr[-500:]) if r.stderr else ''))

io.open(r'C:\Users\ATM\_dep_k_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
print('\n'.join(LOG))
