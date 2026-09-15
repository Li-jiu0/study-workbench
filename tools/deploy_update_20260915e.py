# -*- coding: utf-8 -*-
"""20260915e 部署：
- assets/app.js：清除 14 处可选链（老 Android WebView SyntaxError）+ 5 处未判空 DOM 取值
- 31 个 HTML：app.js 版本戳 bump 到 20260915e
- 5 个 HTML：ADR-3 弹窗改页面内布局（学习工作台/个人中心/PPT训练/设置/私聊）
流程照抄 deploy_update_20260915d.py。纯前端 + app.js 变更，无需重启 FastAPI。"""
import os, re, io, tarfile, subprocess, sys

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260915e'
TAR = os.path.join(ROOT, 'tools', 'frontend_%s.tar.gz' % STAMP)
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
REMOTE_WEB = REMOTE_ROOT + '/web'
LOG = []

HTML = [
    'blog_wechat.html', 'mock_exam.html', 'mock_exam_result.html', 'mock_exam_run.html',
    'PPT案例拆解.html', 'PPT版式库.html', 'PPT训练.html', '万能金句库.html',
    '个人中心.html', '企业定向库.html', '动态.html', '商务礼仪.html',
    '商务礼仪面试.html', '四级备考.html', '四级词汇.html', '场景话术库.html',
    '央国企笔试.html', '学习博客.html', '学习工作台.html', '学途.html',
    '工具.html', '时政热点.html', '更多.html', '申论刷题.html', '私聊.html',
    '管理员.html', '行测刷题.html', '设置.html', '错题本.html', '面试题库.html',
    '高情商表达.html',
]
FILES = HTML + ['assets/app.js']

with tarfile.open(TAR, 'w:gz') as tar:
    for fn in FILES:
        p = os.path.join(ROOT, fn)
        if not os.path.exists(p):
            LOG.append('MISS %s' % fn)
            continue
        tar.add(p, arcname='web/' + fn.replace('\\', '/'))
names = tarfile.open(TAR).getnames()
LOG.append('打包 %d 个, %d bytes' % (len(names), os.path.getsize(TAR)))
for must in ['web/assets/app.js', 'web/学习工作台.html', 'web/个人中心.html',
             'web/PPT训练.html', 'web/设置.html', 'web/私聊.html', 'web/行测刷题.html']:
    assert must in names, '断言失败 ' + must
LOG.append('关键文件断言 OK')

if os.environ.get('SW_DRY_RUN') == '1':
    io.open(r'C:\Users\ATM\_dep_e_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
    sys.exit(0)

host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        LOG.append('拿不到凭据')
        io.open(r'C:\Users\ATM\_dep_e_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
        sys.exit(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标 root@%s' % host)

r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/' % (host, REMOTE_ROOT)],
                   capture_output=True, text=True, timeout=300)
LOG.append('上传 exit=%d' % r.returncode)
if r.returncode != 0:
    LOG.append((r.stderr or '')[-300:])
    io.open(r'C:\Users\ATM\_dep_e_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
    sys.exit(r.returncode)

filelist = ' '.join('"%s/%s"' % (REMOTE_WEB, f.replace('\\', '/')) for f in FILES)
cmd = (
    'cd {root} && '
    'tar -czf web_bak_{st}.tar.gz {flist} >/dev/null 2>&1 && echo BACKUP_OK && '
    'tar -xzf frontend_{st}.tar.gz -C {root} && echo EXTRACT_OK && '
    "echo '-- 线上校验 --' && "
    "grep -c 'app.js?v=20260915e' {web}/学习工作台.html; "
    "grep -c '\\?\\.' {web}/assets/app.js || echo 'optional-chaining: 0'; "
    "grep -c 'st-pwd-panel' {web}/设置.html; "
    "grep -c 'pe-inline' {web}/个人中心.html; "
    "grep -c 'pw-back' {web}/PPT训练.html; "
    "grep -c 'acMsgs' {web}/私聊.html"
).format(root=REMOTE_ROOT, web=REMOTE_WEB, st=STAMP, flist=filelist)
r = subprocess.run([PLINK, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@%s' % host, cmd],
                   capture_output=True, text=True, timeout=300)
LOG.append('远端 exit=%d' % r.returncode)
LOG.append('OUT: %s' % (r.stdout or '')[-1500:])
LOG.append('ERR: %s' % (r.stderr or '')[-400:])

io.open(r'C:\Users\ATM\_dep_e_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
print('DONE', STAMP)
