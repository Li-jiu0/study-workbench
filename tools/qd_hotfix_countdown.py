# -*- coding: utf-8 -*-
"""热修：工具页删除「考试倒计时」区块（用户 2026-09-15 截图反馈）
只发 1 个 HTML，纯静态，无需重启服务。不 bump 任何版本戳（HTML 无缓存后缀）。"""
import os, re, io, sys, tarfile, subprocess

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260915f-hotfix1'
TAR = os.path.join(ROOT, 'tools', 'frontend_%s.tar.gz' % STAMP)
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
REMOTE_WEB = REMOTE_ROOT + '/web'
FILES = ['工具.html']
L = []

src = os.path.join(ROOT, FILES[0])
s = io.open(src, encoding='utf-8').read()
L.append('本地预检: 可见的「考试倒计时」区块存在 = %s' % ('nav-section">考试倒计时' in s))
L.append('本地预检: countdownRow 宿主存在 = %s' % ('id="countdownRow"' in s))
L.append('本地预检: #countdownModal 仍保留 = %s' % ('id="countdownModal"' in s))
L.append('本地预检: 文件字符数 = %d' % len(s))

with tarfile.open(TAR, 'w:gz') as tar:
    for fn in FILES:
        tar.add(os.path.join(ROOT, fn), arcname='web/' + fn)
L.append('打包 %s, %d bytes' % (FILES[0], os.path.getsize(TAR)))

if os.environ.get('SW_DRY_RUN') == '1':
    io.open(r'C:\Users\ATM\_hotfix1_out.txt', 'w', encoding='utf-8').write('\n'.join(L))
    sys.exit(0)

host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s2 = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s2) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s2)
    pwd, host = m.group(1), m.group(2)
L.append('目标 root@%s' % host)

r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/' % (host, REMOTE_ROOT)],
                   capture_output=True, text=True, timeout=300)
L.append('上传 exit=%d' % r.returncode)
if r.returncode != 0:
    L.append((r.stderr or '')[-400:])
    io.open(r'C:\Users\ATM\_hotfix1_out.txt', 'w', encoding='utf-8').write('\n'.join(L))
    sys.exit(r.returncode)

filelist = ' '.join('"%s/%s"' % (REMOTE_WEB, f) for f in FILES)
cmd = (
    'cd {root} && '
    'tar -czf web_bak_{st}.tar.gz {flist} >/dev/null 2>&1 && echo BACKUP_OK && '
    'tar -xzf frontend_{st}.tar.gz -C {root} && echo EXTRACT_OK && '
    "echo '-- 线上校验 --' && "
    "grep -c 'nav-section\">考试倒计时' {web}/工具.html || echo 'countdown-block: 0 (已删除)'; "
    "grep -c 'countdownRow' {web}/工具.html || echo 'countdownRow host: 0 (已删除)'; "
    "grep -c 'id=\"countdownModal\"' {web}/工具.html; "
    "ls -l {web}/工具.html | awk '{{print $5}}'"
).format(root=REMOTE_ROOT, web=REMOTE_WEB, st=STAMP, flist=filelist)
r = subprocess.run([PLINK, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@%s' % host, cmd],
                   capture_output=True, text=True, timeout=300)
L.append('远端 exit=%d' % r.returncode)
L.append('OUT: %s' % (r.stdout or '')[-1200:])
L.append('ERR: %s' % (r.stderr or '')[-300:])

io.open(r'C:\Users\ATM\_hotfix1_out.txt', 'w', encoding='utf-8').write('\n'.join(L))
print('HOTFIX_DONE')
