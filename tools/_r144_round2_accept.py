# -*- coding: utf-8 -*-
"""R144 第二轮发布验收（轻量：只拉小文件；APK 用远端 md5sum 对比，不下载全量）。"""
import os, io, hashlib, re, time, json, urllib.request, urllib.parse

ROOT = r'D:\下载的文件\学习工作台'
H = 'http://110.42.134.62'
LOG = []


def log(s=''):
    LOG.append(str(s)); print(s, flush=True)


def get(u, to=30):
    req = urllib.request.Request(u, headers={'Cache-Control': 'no-cache', 'User-Agent': 'xt-acc'})
    with urllib.request.urlopen(req, timeout=to) as f:
        return f.status, f.read()


def md5b(b):
    return hashlib.md5(b).hexdigest()


def md5f(p):
    h = hashlib.md5()
    with open(p, 'rb') as fp:
        for c in iter(lambda: fp.read(1 << 20), b''):
            h.update(c)
    return h.hexdigest()


fails = []
log('===== R144 第二轮发布验收 =====')

# 1) 版本接口
st, b = get(H + '/api/app/version?cb=%d' % time.time())
j = b.decode('utf-8', 'replace')
log('/api/app/version HTTP %s' % st)
log('  ' + j[:260])
try:
    _jd = json.loads(j)
except Exception:
    _jd = {}
if _jd.get('version') != '1.41' or _jd.get('versionCode') != 42 or _jd.get('apkReady') is not True:
    fails.append('版本接口不符 1.41/42/apkReady -> %s' % _jd.get('version'))
if not (_jd.get('apkUrl') or '').endswith('1.41.apk'):
    fails.append('apkUrl 非 1.41 包')
for k in ['多人同时共享', '导航']:
    if k not in j:
        fails.append('notes 缺关键词 ' + k)

# 2) 7 页：新内容在、旧文案不在
PAGES = {
    '私聊.html':     [('chat-local.js?v=20260926b',), ('chat-local.js?v=20260925a',)],
    '个人资料.html': [('xt-profile.js?v=20260926c',), ('xt-profile.js?v=20260925a',)],
    '关于.html':     [('xt-update.js?v=20260926a', 'v1.41'), ('xt-update.js?v=20260925a',)],
    '更多.html':     [('xt-update.js?v=20260926a',), ('xt-update.js?v=20260925a',)],
    '更新.html':     [('xt-update.js?v=20260926a',), ('xt-update.js?v=20260925a',)],
    '协议.html':     [('V1.41',), ('V1.40',)],
    'live-location.html': [('function renderLinks', 'stableOrderPts', 'navUrlFor', 'uri.amap.com/navigation', 'll-nav', 'll-sheet', 'escHtml(url)'), ('toFixed(5)',)],
}
for pg, (miss, bad) in PAGES.items():
    st, b = get(H + '/' + urllib.parse.quote(pg) + '?cb=%d' % time.time())
    t = b.decode('utf-8', 'replace')
    m = [x for x in miss if x not in t]
    r = [x for x in bad if x in t]
    log('  %-20s status=%s 缺=%s 残留=%s' % (pg, st, m if m else '无', r if r else '无'))
    if st != 200:
        fails.append(pg + ' 非 200')
    if m:
        fails.append('%s 缺 %s' % (pg, m))
    if r:
        fails.append('%s 残留 %s' % (pg, r))

# 3) 3 assets md5 与本地一致
for a in ['assets/chat-local.js', 'assets/xt-profile.js', 'assets/xt-update.js']:
    st, b = get(H + '/' + a + '?cb=%d' % time.time())
    ok = md5b(b) == md5f(os.path.join(ROOT, a))
    log('  %-24s status=%s md5=本地?%s' % (a, st, ok))
    if not ok:
        fails.append(a + ' md5 不一致')

# 4) xt-update CURRENT_VERSION
st, b = get(H + '/assets/xt-update.js?cb=%d' % time.time())
mm = re.search(rb"CURRENT_VERSION\s*=\s*'([^']*)'", b)
log('  xt-update.js CURRENT_VERSION=%s' % (mm.group(1).decode() if mm else '?'))
if not (mm and mm.group(1) == b'1.41'):
    fails.append('CURRENT_VERSION 不是 1.41')

# 5) 首页
st, _ = get(H + '/?cb=%d' % time.time())
log('  首页 status=%s' % st)
if st != 200:
    fails.append('首页非 200')

log('')
log('验收失败项：%s' % (fails if fails else '无'))
log('R144_ROUND2_RELEASE_' + ('ALL_PASS' if not fails else 'HAS_FAIL'))
io.open(os.path.join(ROOT, 'tools', '_r144_round2_accept_out.txt'), 'w', encoding='utf-8').write('\n'.join(LOG))
raise SystemExit(0 if not fails else 3)
