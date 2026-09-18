# -*- coding: utf-8 -*-
"""R73n 部署：ai-service.js / ai-settings.js + 37 个 HTML（戳 20260918a）→ 生产
闸门：tar 成员断言 + MD5 全量核对 + 线上戳验证
"""
import os, io, tarfile, subprocess, hashlib

ROOT = r'D:\下载的文件\学习工作台'
TAR = ROOT + r'\tools\deploy_r73n_20260918.tar.gz'
PSCP = ROOT + r'\tools\pscp.exe'
PLINK = ROOT + r'\tools\plink.exe'
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
PW = 'Li050800!'
HOST = 'root@110.42.134.62'
OUT = r'C:\Users\ATM\_r73n_deploy_out.txt'
LOG = []
def log(s): LOG.append(str(s))
def flush(): io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))

HTMLS = ['AI.html', 'AI模拟面试.html', 'PPT案例拆解.html', 'PPT版式库.html', 'ai-settings.html',
         'blog_wechat.html', '万能金句库.html', '个人中心.html', '企业定向库.html', '关于.html',
         '动态空间.html', '商务礼仪.html', '四级词汇.html', '场景话术库.html', '学习工作台.html',
         '学习概括.html', '导入题库.html', '工具.html', '我的动态.html', '我的文件.html',
         '时政热点.html', '更多.html', '朋友圈发布.html', '演示.html', '申论刷题.html', '社区.html',
         '私聊.html', '管理员.html', '英语.html', '行测.html', '行测刷题.html', '表达.html',
         '设置.html', '赞助.html', '错题本.html', '面测.html', '面试题库.html']
ASSETS = ['ai-service.js', 'ai-settings.js']

# ---------- 1) 打包 ----------
members = []
for h in HTMLS:
    p = os.path.join(ROOT, h)
    assert os.path.exists(p), '缺 ' + h
    members.append((p, 'web/' + h))
for a in ASSETS:
    p = os.path.join(ROOT, 'assets', a)
    assert os.path.exists(p), '缺 assets/' + a
    members.append((p, 'web/assets/' + a))
with tarfile.open(TAR, 'w:gz') as tar:
    for p, arc in members:
        tar.add(p, arcname=arc)
names = tarfile.open(TAR).getnames()
assert len(names) == 39, 'tar 成员数 %d != 39' % len(names)
assert 'web/assets/ai-service.js' in names and 'web/设置.html' in names
log('tar OK: %d 成员, %d bytes' % (len(names), os.path.getsize(TAR)))
flush()

# ---------- 2) 上传并解压 ----------
r = subprocess.run([PSCP, '-pw', PW, '-batch', '-hostkey', HOSTKEY, TAR, HOST + ':/tmp/r73n.tar.gz'],
                   capture_output=True)
log('pscp rc=%d' % r.returncode); assert r.returncode == 0
flush()

md5_cmd = 'md5sum ' + ' '.join(['/opt/study-workbench/' + arc for _, arc in members])
cmd = ("cd / && tar -xzf /tmp/r73n.tar.gz -C /opt/study-workbench && " + md5_cmd)
r = subprocess.run([PLINK, '-pw', PW, '-batch', '-hostkey', HOSTKEY, HOST, cmd],
                   capture_output=True, timeout=120)
so = r.stdout.decode('utf-8', 'ignore')
log('extract+md5 rc=%d' % r.returncode); flush()
assert r.returncode == 0, r.stderr.decode('utf-8', 'ignore')

# ---------- 3) MD5 全量核对 ----------
bad = []
for p, arc in members:
    local = hashlib.md5(open(p, 'rb').read()).hexdigest()
    if local not in so:
        bad.append(arc)
log('MD5 核对: %d/%d 一致, 不一致=%s' % (len(members) - len(bad), len(members), bad or '无'))
assert not bad, 'MD5 不一致: %s' % bad
flush()

# ---------- 4) 线上验证：HTML 引用新戳、JS 可取 ----------
for url in ['http://127.0.0.1:8000/AI.html', 'http://127.0.0.1:8000/ai-settings.html',
            'http://127.0.0.1:8000/设置.html']:
    r = subprocess.run([PLINK, '-pw', PW, '-batch', '-hostkey', HOSTKEY, HOST,
                        "curl -s '%s' | grep -c '20260918a'" % url], capture_output=True, timeout=60)
    n = r.stdout.decode('utf-8', 'ignore').strip()
    log('%s 新戳引用=%s' % (url, n))
r = subprocess.run([PLINK, '-pw', PW, '-batch', '-hostkey', HOSTKEY, HOST,
                    "curl -s 'http://127.0.0.1:8000/assets/ai-service.js?v=20260918a' | head -c 100 | grep -c 'ai-service' ; curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8000/assets/ai-settings.js?v=20260918a'"],
                   capture_output=True, timeout=60)
log('assets 线上探测: %s %s' % (r.stdout.decode('utf-8', 'ignore').strip(), r.stderr.decode('utf-8', 'ignore').strip()))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(LOG))
print('DONE')
