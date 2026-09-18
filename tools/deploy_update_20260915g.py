# -*- coding: utf-8 -*-
"""20260915g 部署（批次九 Wave2 四线 + 热修3/4）
- AI模拟面试.html / 私聊.html+chat-local.js / 四级备考+学途+voiceplayer.js / PPT训练+PPT四资产 / blog_wechat 戳修正 / 工具.html 注释 / 更多.html 热修3+4
纯前端改动，无需重启 FastAPI。"""
import os, re, io, sys, tarfile, subprocess

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260915g'
TAR = os.path.join(ROOT, 'tools', 'frontend_%s.tar.gz' % STAMP)
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
REMOTE_WEB = REMOTE_ROOT + '/web'
LOG = []

FILES = [
 'AI模拟面试.html','PPT训练.html','私聊.html','工具.html','blog_wechat.html',
 '四级备考.html','学途.html','更多.html',
 'assets/chat-local.js','assets/voiceplayer.js',
 'assets/data-ppt-class.js','assets/design-class.js',
 'assets/data-ppt-tips.js','assets/ppt-tips.js',
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
for must in ['web/assets/chat-local.js', 'web/assets/voiceplayer.js',
             'web/AI模拟面试.html', 'web/PPT训练.html', 'web/更多.html', 'web/blog_wechat.html']:
    assert must in names, '断言失败 ' + must
LOG.append('关键文件断言 OK')

if os.environ.get('SW_DRY_RUN') == '1':
    io.open(r'C:\Users\ATM\_dep_g_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
    sys.exit(0)

host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        LOG.append('拿不到凭据')
        io.open(r'C:\Users\ATM\_dep_g_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
        sys.exit(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标 root@%s' % host)

r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/' % (host, REMOTE_ROOT)],
                   capture_output=True, text=True, timeout=300)
LOG.append('上传 exit=%d' % r.returncode)
if r.returncode != 0:
    LOG.append((r.stderr or '')[-400:])
    io.open(r'C:\Users\ATM\_dep_g_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
    sys.exit(r.returncode)

filelist = ' '.join('"%s/%s"' % (REMOTE_WEB, f.replace('\\', '/')) for f in FILES)
cmd = (
    'cd {root} && '
    'tar -czf web_bak_{st}.tar.gz {flist} >/dev/null 2>&1 && echo BACKUP_OK && '
    'tar -xzf frontend_{st}.tar.gz -C {root} && echo EXTRACT_OK && '
    "echo '-- 线上校验 --' && "
    "grep -c 'nav-section\">常用' {web}/更多.html; "
    "grep -c 'toggleMoreGroup' {web}/更多.html || echo 'toggleMoreGroup: 0'; "
    "grep -c '时政热点' {web}/更多.html || echo '时政热点: 0'; "
    "grep -c '学习动态' {web}/更多.html; "
    "grep -c '20260915g' {web}/PPT训练.html; "
    "grep -c 'voiceplayer.js?v=20260915g' {web}/四级备考.html; "
    "grep -c 'chat-local.js?v=20260915g' {web}/私聊.html; "
    "grep -c 'SCENE_GROUPS' {web}/assets/voiceplayer.js; "
    "grep -c 'imShowMsgMenu' {web}/assets/chat-local.js; "
    "grep -c '查看示范回答' {web}/AI模拟面试.html; "
    "grep -c '20260913j' {web}/blog_wechat.html || echo '20260913j: 0'"
).format(root=REMOTE_ROOT, web=REMOTE_WEB, st=STAMP, flist=filelist)
r = subprocess.run([PLINK, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@%s' % host, cmd],
                   capture_output=True, text=True, timeout=300)
LOG.append('远端 exit=%d' % r.returncode)
LOG.append('OUT: %s' % (r.stdout or '')[-1500:])
LOG.append('ERR: %s' % (r.stderr or '')[-400:])

io.open(r'C:\Users\ATM\_dep_g_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
print('DONE', STAMP)
