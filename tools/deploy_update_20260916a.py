# -*- coding: utf-8 -*-
"""20260916a 部署：AI 问答页全套（新页首次上线 + 底座倍率/MAX/自动路由）
- AI.html（新页面，首次上线）
- assets/ai-page.js（模型列表面板/悬停详情/面板限高/输入框容器聚焦）
- assets/ai-config.js（11 模型倍率 rate + maxMode）
- assets/ai-service.js（opts.model 生效、opts.max 生效、resolveFuncType 自动路由、onModelUsed 回传）
- assets/ai-presets.js（底座三件套之一）
纯前端改动，无需重启 FastAPI。
注意：app.js / 更多.html / 各布局页本批不部署（有 worker 正在改），下一批再上。
"""
import os, re, io, sys, tarfile, subprocess

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260916a'
TAR = os.path.join(ROOT, 'tools', 'frontend_%s.tar.gz' % STAMP)
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
REMOTE_WEB = REMOTE_ROOT + '/web'
LOG = []

FILES = [
 'AI.html',
 'assets/ai-page.js',
 'assets/ai-config.js',
 'assets/ai-service.js',
 'assets/ai-presets.js',
]

with tarfile.open(TAR, 'w:gz') as tar:
    for fn in FILES:
        p = os.path.join(ROOT, fn)
        if not os.path.exists(p):
            LOG.append('MISS %s' % fn)
            continue
        tar.add(p, arcname='web/' + fn.replace('\\', '/'))
names = tarfile.open(TAR).getnames()
LOG.append('打包 %d 个, %d bytes' % (len(names), os.path.getsize(TAR)))
for must in ['web/AI.html', 'web/assets/ai-page.js', 'web/assets/ai-config.js',
             'web/assets/ai-service.js', 'web/assets/ai-presets.js']:
    assert must in names, '断言失败 ' + must
LOG.append('关键文件断言 OK')

if os.environ.get('SW_DRY_RUN') == '1':
    io.open(r'C:\Users\ATM\_dep_20260916a_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
    sys.exit(0)

host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        LOG.append('拿不到凭据')
        io.open(r'C:\Users\ATM\_dep_20260916a_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
        sys.exit(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标 root@%s' % host)

r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/' % (host, REMOTE_ROOT)],
                   capture_output=True, text=True, timeout=300)
LOG.append('上传 exit=%d' % r.returncode)
if r.returncode != 0:
    LOG.append((r.stderr or '')[-400:])
    io.open(r'C:\Users\ATM\_dep_20260916a_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
    sys.exit(r.returncode)

filelist = ' '.join('"%s/%s"' % (REMOTE_WEB, f.replace('\\', '/')) for f in FILES)
cmd = (
    'cd {root} && '
    # 注意：新文件在远端不存在，备份 tar 会失败，必须容错，否则 && 链断掉导致不解压
    'tar -czf web_bak_{st}.tar.gz {flist} >/dev/null 2>&1 || echo BACKUP_SKIP_NEW; '
    'tar -xzf frontend_{st}.tar.gz -C {root} && echo EXTRACT_OK && '
    "echo '-- 线上校验 --' && "
    "grep -c 'aiModelPanel' {web}/AI.html; "
    "grep -c 'showModelDetail' {web}/assets/ai-page.js; "
    "grep -c 'maxMode' {web}/assets/ai-config.js; "
    "grep -c 'rate:' {web}/assets/ai-config.js; "
    "grep -c 'resolveFuncType' {web}/assets/ai-service.js; "
    "grep -c 'onModelUsed' {web}/assets/ai-service.js; "
    "grep -c 'ai-presets' {web}/assets/ai-presets.js || echo 'ai-presets: 0'"
).format(root=REMOTE_ROOT, web=REMOTE_WEB, st=STAMP, flist=filelist)
r = subprocess.run([PLINK, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@%s' % host, cmd],
                   capture_output=True, text=True, timeout=300)
LOG.append('远端 exit=%d' % r.returncode)
LOG.append('OUT: %s' % (r.stdout or '')[-1500:])
LOG.append('ERR: %s' % (r.stderr or '')[-400:])

io.open(r'C:\Users\ATM\_dep_20260916a_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
print('DONE', STAMP)
