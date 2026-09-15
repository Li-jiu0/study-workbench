# -*- coding: utf-8 -*-
"""20260915d 前端部署：申论入口迁移（24 页侧边栏移除 + 央国企笔试加卡）+ 行测刷题下拉化。
流程照抄 tools/deploy_update_20260915b.py（凭据/pscp/plink/远端校验），只打包本次改动的 26 个 HTML，
远端对同名单文件做小备份再解压覆盖。纯前端，无需重启 FastAPI。"""
import os, re, io, tarfile, subprocess, sys, time

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260915d'
TAR = os.path.join(ROOT, 'tools', 'frontend_%s.tar.gz' % STAMP)
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
REMOTE_WEB = REMOTE_ROOT + '/web'
LOG = []

FILES = [
    # 24 页侧边栏移除申论入口
    'PPT案例拆解.html', 'PPT版式库.html', 'PPT训练.html', '万能金句库.html',
    '个人中心.html', '商务礼仪.html', '动态.html', '四级备考.html',
    '学习工作台.html', '商务礼仪面试.html', '学习博客.html', '四级词汇.html',
    '高情商表达.html', '私聊.html', '更多.html', '面试题库.html',
    '时政热点.html', '错题本.html', '申论刷题.html', '工具.html',
    '设置.html', '管理员.html', '行测刷题.html', '场景话术库.html',
    # 央国企笔试.html 加申论卡 + 行测刷题.html 下拉化（行测刷题已在上面，去重即可）
    '央国企笔试.html',
]

# ---------- 1. 打包 ----------
with tarfile.open(TAR, 'w:gz') as tar:
    for fn in FILES:
        p = os.path.join(ROOT, fn)
        if not os.path.exists(p):
            LOG.append('MISS %s' % fn)
            continue
        tar.add(p, arcname='web/' + fn)
names = tarfile.open(TAR).getnames()
LOG.append('打包 %d 个文件, %d bytes' % (len(names), os.path.getsize(TAR)))

# 断言：关键文件必须在包里
for must in ['web/行测刷题.html', 'web/央国企笔试.html', 'web/申论刷题.html', 'web/更多.html']:
    assert must in names, '断言失败: ' + must
LOG.append('关键文件断言: 全部在位 OK')

if os.environ.get('SW_DRY_RUN') == '1':
    io.open(r'C:\Users\ATM\_dep_d_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
    print('dry-run done')
    sys.exit(0)

# ---------- 2. 凭据 ----------
host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        LOG.append('拿不到凭据')
        io.open(r'C:\Users\ATM\_dep_d_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
        sys.exit(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标主机 root@%s' % host)

# ---------- 3. 上传 ----------
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/' % (host, REMOTE_ROOT)],
                   capture_output=True, text=True, timeout=300)
LOG.append('上传 exit=%d %s %s' % (r.returncode, (r.stdout or '')[-200:], (r.stderr or '')[-200:]))
if r.returncode != 0:
    io.open(r'C:\Users\ATM\_dep_d_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
    sys.exit(r.returncode)

# ---------- 4. 远端小备份（仅本次名单）+ 解压 + 校验 ----------
filelist = ' '.join('"%s/%s"' % (REMOTE_WEB, f) for f in FILES)
cmd = (
    'cd {root} && '
    'tar -czf web_bak_sl_{st}.tar.gz {flist} >/dev/null 2>&1 && echo BACKUP_OK && '
    'tar -xzf frontend_{st}.tar.gz -C {root} && echo EXTRACT_OK && '
    'grep -c "location.href=.申论刷题" {web}/更多.html || true; '
    'grep -c "ecTypeSelect" {web}/行测刷题.html; '
    'grep -c "encodeURI(.申论刷题.html.)" {web}/央国企笔试.html'
).format(root=REMOTE_ROOT, web=REMOTE_WEB, st=STAMP, flist=filelist)
r = subprocess.run([PLINK, '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    'root@%s' % host, cmd],
                   capture_output=True, text=True, timeout=300)
LOG.append('远端 exit=%d' % r.returncode)
LOG.append('OUT: %s' % (r.stdout or '')[-1200:])
LOG.append('ERR: %s' % (r.stderr or '')[-400:])

io.open(r'C:\Users\ATM\_dep_d_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
print('DONE', STAMP)
