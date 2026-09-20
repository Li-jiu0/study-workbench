# -*- coding: utf-8 -*-
"""R73c/R73d 第五批部署：20260917b 前端 + 后端邮箱绑定/修复 + SMTP 探针
闸门：1) 行尾闸  2) 新增符号闸  3) 已删符号闸  4) MD5 全量核对
"""
import os, io, re, sys, hashlib, tarfile, subprocess

ROOT = r'D:\下载的文件\学习工作台'
STAMP = '20260917b'
TAR = os.path.join(ROOT, 'tools', 'deploy_r73c_20260918.tar.gz')
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
REMOTE_ROOT = '/opt/study-workbench'
OUT = r'C:\Users\ATM\_dep_r73c_out.txt'
LOG = []
def log(s):
    LOG.append(s); print(s)

# ---------- 1) 收集文件 ----------
htmls = []
for p in sorted(os.listdir(ROOT)):
    if p.endswith('.html') and 'bak' not in p.lower():
        htmls.append(p)
assets = [f for f in os.listdir(os.path.join(ROOT, 'assets'))
          if f.endswith(('.js', '.css', '.jpg')) and 'bak' not in f.lower()]
backend = ['server/config.py', 'server/database.py', 'server/rate_limit.py',
           'server/routers/admin.py', 'server/routers/auth.py', 'server/routers/moments.py',
           'server/schemas.py', 'server/mailer.py']
log('前端 %d HTML + %d assets；后端 %d 文件' % (len(htmls), len(assets), len(backend)))

# ---------- 2) 行尾闸（ai-settings.html 为交接文档明文 LF 豁免，白名单跳过） ----------
EOL_LF_OK = {'ai-settings.html'}
eol_bad = []
for h in htmls:
    if h in EOL_LF_OK:
        continue
    raw = open(os.path.join(ROOT, h), 'rb').read()
    if raw.count(b'\n') - raw.count(b'\r\n') != 0:
        eol_bad.append(h)
log('行尾闸：loneLF!=0 的 HTML %s' % (eol_bad if eol_bad else '无'))
if eol_bad:
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); sys.exit(3)

# ---------- 3) 打包 ----------
with tarfile.open(TAR, 'w:gz') as tar:
    for fn in assets:
        tar.add(os.path.join(ROOT, 'assets', fn), arcname='web/assets/' + fn)
    for h in htmls:
        tar.add(os.path.join(ROOT, h), arcname='web/' + h)
    for f in backend:
        tar.add(os.path.join(ROOT, f), arcname=f)
log('tar: %d 成员, %d bytes' % (len(tarfile.open(TAR).getnames()), os.path.getsize(TAR)))

# 关键成员断言
MUST = ['web/assets/xt-moments.js', 'web/assets/xt-profile.js', 'web/assets/ai-config.js',
        'web/assets/mailer_placeholder' ]  # 占位防呆
MUST = ['web/assets/xt-moments.js', 'web/assets/xt-profile.js', 'web/assets/xt-settings.js',
        'web/assets/net-compat.js', 'web/assets/ai-service.js', 'web/assets/ai-config.js',
        'web/动态空间.html', 'web/我的动态.html', 'web/朋友圈发布.html', 'web/设置.html',
        'web/学习工作台.html', 'server/mailer.py', 'server/config.py', 'server/routers/auth.py']
names = tarfile.open(TAR).getnames()
miss = [m for m in MUST if m not in names]
if miss:
    log('!!! 关键成员缺失: %s' % miss); io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); sys.exit(4)
log('关键成员断言 OK (%d 项)' % len(MUST))

# ---------- 4) 符号闸 ----------
def tar_bytes(path):
    with tarfile.open(TAR) as t:
        try: return t.extractfile(path).read()
        except Exception: return b''
NEW_SYM = [
    ('web/assets/ai-service.js', b'proxyWrapUrl'),
    ('web/assets/ai-config.js', b'ark-turbo-260628'),
    ('web/assets/xt-moments.js', b'BG_KEY'),
    ('web/assets/xt-profile.js', b'otherDelFriend'),
    ('web/动态空间.html', '我的动态'.encode()),
    ('server/routers/auth.py', b'send_email_code'),
    ('server/mailer.py', b'send_code_email'),
    ('server/config.py', b'smtp_configured'),
]
DEL_SYM = [
    ('web/设置.html', "stOpenBindPanel('phone')".encode()),
    ('web/设置.html', "stOpenBindPanel('wechat')".encode()),
    ('web/设置.html', "stOpenBindPanel('\\' + ch".encode()),  # 确认动态入口仍在(ch变量)——反向断言见下
]
bad = [(p, tok.decode('utf-8', 'replace')[:30]) for p, tok in NEW_SYM if tok not in tar_bytes(p)]
if bad:
    log('!!! 新增符号缺失: %s' % bad); io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); sys.exit(5)
log('新增符号闸 OK (%d 项)' % len(NEW_SYM))
# 已删符号：设置.html 不应再有 phone/wechat 入口
shtml = tar_bytes('web/设置.html')
residue = [tok.decode() for tok in [b"stOpenBindPanel('phone')", b"stOpenBindPanel('wechat')",
                                     b"stUnbind('phone')", b"stUnbind('wechat')"] if tok in shtml]
if residue:
    log('!!! 已删符号残留: %s' % residue); io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); sys.exit(6)
log('已删符号闸 OK（设置.html 无手机号/微信号绑定入口）')
# 动态入口仍在（邮箱绑定功能未被误删）
if b"stOpenBindPanel" not in shtml or "ST_BIND_CHANNELS = ['email']".encode() not in shtml:
    log('!!! 邮箱绑定入口被误删'); io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); sys.exit(7)
log('邮箱绑定入口闸 OK')

# ---------- 5) 本地 MD5 清单 ----------
md5 = {}
for n in names:
    rel = n[len('web/'):] if n.startswith('web/') else n
    lp = os.path.join(ROOT, 'assets' if n.startswith('web/assets/') else '', rel) if not n.startswith('server/') \
         else os.path.join(ROOT, n)
    if n.startswith('web/assets/'):
        lp = os.path.join(ROOT, 'assets', n.split('web/assets/')[1])
    elif n.startswith('web/'):
        lp = os.path.join(ROOT, n[len('web/'):])
    else:
        lp = os.path.join(ROOT, n)
    md5[n] = hashlib.md5(open(lp, 'rb').read()).hexdigest()
io.open(os.path.join(ROOT, 'tools', '_r73c_md5_local.txt'), 'w').write(
    '\n'.join('%s %s' % (v, k) for k, v in sorted(md5.items())))
log('本地 MD5 清单 %d 项' % len(md5))

# ---------- 6) 凭据 ----------
s = io.open(CRED, encoding='utf-8', errors='replace').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
pwd, host = m.group(1), m.group(2)
log('目标 root@%s' % host)

# ---------- 7) 上传 ----------
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY, TAR,
                    'root@%s:%s/deploy_r73c.tar.gz' % (host, REMOTE_ROOT)],
                   capture_output=True, timeout=900)
log('上传 exit=%d %s' % (r.returncode, (r.stderr or '')[-200:]))
if r.returncode != 0:
    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG)); sys.exit(8)

# ---------- 8) 远端：备份 -> 解包 -> MD5 -> 重启 -> 探活 -> SMTP 探针 ----------
remote = r'''
set -u
cd /opt/study-workbench
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/r73c-$STAMP
cp -a server/config.py server/database.py server/rate_limit.py server/routers/admin.py server/routers/auth.py server/routers/moments.py server/schemas.py backups/r73c-$STAMP/ 2>/dev/null
echo BACKUP_OK
tar -xzf deploy_r73c.tar.gz && echo EXTRACT_OK
cd /opt/study-workbench && python3 - <<'PYEOF'
import hashlib, io
bad = []; ok = 0
for line in io.open('tools_md5_r73c.txt'):
    h, name = line.strip().split(' ', 1)
    fp = name  # tar 内路径即远端相对路径（web/... / server/...）
    try:
        real = hashlib.md5(io.open(fp, 'rb').read()).hexdigest()
    except Exception:
        bad.append((fp, 'READ_FAIL')); continue
    if real == h: ok += 1
    else: bad.append((fp, real))
print('MD5_OK=%d BAD=%d' % (ok, len(bad)))
for b in bad[:10]: print('MISMATCH', b)
PYEOF
systemctl restart study-workbench && sleep 8
systemctl is-active study-workbench
curl -s -o /dev/null -w 'home=%{http_code}\n' 'http://127.0.0.1/%E5%AD%A6%E4%B9%A0%E5%B7%A5%E4%BD%9C%E5%8F%B0.html'
curl -s -o /dev/null -w 'moments=%{http_code}\n' 'http://127.0.0.1/%E5%8A%A8%E6%80%81%E7%A9%BA%E9%97%B4.html'
curl -s -o /dev/null -w 'api=%{http_code}\n' 'http://127.0.0.1:8000/openapi.json'
python3 - <<'PYEOF'
import sys
sys.path.insert(0, '/opt/study-workbench/server')
import config
print('smtp_configured=', config.smtp_configured())
from mailer import send_code_email
send_code_email('2903163626@qq.com', '752913', 'probe')
print('SMTP_PROBE_SEND_OK')
PYEOF
journalctl -u study-workbench --since '-2 min' --no-pager | grep -icE 'traceback|exception' || true
'''
# MD5 清单：tar 内相对路径即远端相对路径
io.open(os.path.join(ROOT, 'tools', 'tools_md5_r73c.txt'), 'w').write(
    '\n'.join('%s %s' % (v, k) for k, v in sorted(md5.items())))
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    os.path.join(ROOT, 'tools', 'tools_md5_r73c.txt'),
                    'root@%s:/opt/study-workbench/tools_md5_r73c.txt' % host],
                   capture_output=True, timeout=120)
log('MD5清单上传 exit=%d' % r.returncode)

r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    'root@' + host, remote], capture_output=True, timeout=600)
log('--- 远端解包/MD5/重启/探活/SMTP探针 ---')
log(r.stdout or '(空)')
if r.stderr.strip(): log('[ERR] ' + r.stderr[-600:])

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
