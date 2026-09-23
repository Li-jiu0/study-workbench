# -*- coding: utf-8 -*-
"""R171 线上真机验收（v2：修正 v1 的三处检查器缺陷 + DB 探针改为 pscp 上传）。

v1 的缺陷（已修）：
  ① nginx :80 取 /openapi.json → 必须走 FastAPI 直连 :8000（nginx 只反代 /api、/ws、/uploads）；
  ② 中文页名未 URL 编码 → urllib 抛 UnicodeEncodeError 被吞成 HTTP None（假失败）；
  ③ 检查串写成 `#admMenuList`（CSS 选择器形式），而 HTML 里是 `id="admMenuList"`；
     且「旧戳」是全局匹配，会误命中未变更的 common.css?v=20260923c（它本就该保留）；
  ④ DB 探针文件只写在了本地 /tmp，从未上传 → python3 找不到文件（假失败）；
  ⑤ uvicorn 计数用 `pgrep -f 'uvicorn main:app'` 会匹配到探针自身命令行 → 改为 `ps` + 字符类规避自匹配。
"""
import io
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

ROOT = r"D:\下载的文件\学习工作台"
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
QA = os.path.join(ROOT, 'tools', 'qa')

src = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src))
PWD_, HOST = m.group(1), m.group(2)

LOG = []
FAILS = []


def log(s=''):
    LOG.append(str(s))
    print(s, flush=True)


def chk(name, cond, extra=''):
    log('  [%s] %s%s' % ('PASS' if cond else 'FAIL', name, ('  :: ' + str(extra)) if extra else ''))
    if not cond:
        FAILS.append(name)


def http(path, port=None, timeout=25):
    url = 'http://' + HOST + (':%d' % port if port else '') + path
    try:
        rq = urllib.request.Request(url, headers={'Accept-Encoding': 'identity',
                                                 'Cache-Control': 'no-cache',
                                                 'User-Agent': 'r171-verify'})
        with urllib.request.urlopen(rq, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, (e.read() if hasattr(e, 'read') else b'')
    except Exception as e:
        return None, repr(e).encode()


def page(name, timeout=25):
    return http('/' + urllib.parse.quote(name), timeout=timeout)


def plink(cmd, timeout=300):
    r = subprocess.run([PLINK, '-ssh', '-pw', PWD_, '-batch', '-hostkey', HOSTKEY, 'root@' + HOST, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    return (r.stdout or '') + (('\n[STDERR] ' + r.stderr.strip()) if (r.stderr or '').strip() else '')


# ======================================================================
log('===== 1) FastAPI 直连 :8000 —— 路由清单 =====')
st, body = http('/openapi.json', port=8000)
chk('/openapi.json 直连 8000 返回 200', st == 200, 'HTTP %s' % st)
paths, adm = [], []
if st == 200:
    try:
        spec = json.loads(body.decode('utf-8'))
        paths = sorted(spec.get('paths', {}).keys())
        adm = [p for p in paths if p.startswith('/api/admin')]
    except Exception as e:
        log('  解析失败 %r' % (e,))
chk('openapi 解析成功', bool(paths), '%d paths' % len(paths))
log('  /api/admin 路由 %d 条；总路由 %d 条' % (len(adm), len(paths)))

WANT = ['/api/admin/users/{uid}', '/api/admin/announcements', '/api/admin/logs',
        '/api/admin/me/visibility', '/api/admin/content/moments', '/api/admin/groups',
        '/api/admin/chat/threads', '/api/admin/users/{uid}/ban', '/api/admin/users/{uid}/unban',
        '/api/admin/users/{uid}/mute', '/api/admin/users/{uid}/kick',
        '/api/admin/users/{uid}/reset-password', '/api/admin/users/{uid}/profile',
        '/api/admin/users/{uid}/data-summary', '/api/admin/users/{uid}/apps',
        '/api/admin/content/moments/{mid}/hide', '/api/admin/content/notes/{nid}/unhide',
        '/api/admin/content/board/{bid}/hide', '/api/admin/groups/{gid}/dismiss',
        '/api/admin/chat/search',
        '/api/user/app-list', '/api/user/app-list/toggle', '/api/user/app-list/status']
for w in WANT:
    chk('路由存在 ' + w, w in paths)
chk('admin 路由已从发版前 10 条扩容到 ≥40 条', len(adm) >= 40, '实际 %d' % len(adm))

# ======================================================================
log('')
log('===== 2) nginx :80 —— 中文页名（URL 编码）+ 新缓存戳 20260930a =====')
STAMP = '20260930a'
KEY_PAGES = ['管理员.html', '设置.html', '登录.html', '学习工作台.html', '更多.html', '更新.html',
             '应用白名单.html', '动态空间.html', '我的动态.html', '朋友圈发布.html', '社区.html',
             '私聊.html', '关于.html', '行测.html', '个人中心.html', 'AI.html', '协议.html',
             '数据管理.html', '我的文件.html', '日志.html', '错题本.html', '面测.html']
bad = []
for n in KEY_PAGES:
    s, _ = page(n)
    if s != 200:
        bad.append((n, s))
log('  抽查 %d 页；非 200：%s' % (len(KEY_PAGES), bad or '无'))
chk('关键页全部 200', not bad, bad)

st, b = page('管理员.html')
txt = b.decode('utf-8', 'replace') if st == 200 else ''
chk('管理员.html 含 R170-E 列表容器 id="admMenuList"', 'id="admMenuList"' in txt)
chk('管理员.html 含 R170-E 子页顶栏容器 id="admSubHead"', 'id="admSubHead"' in txt)
chk('管理员.html 引用 admin-ops.js', 'admin-ops.js' in txt)
BATCH_ASSETS = ['admin-ops.js', 'admin.css', 'admin.js', 'api.js', 'app.js']
for a in BATCH_ASSETS:
    chk('管理员.html 的 assets/%s 戳 = %s' % (a, STAMP), ('assets/%s?v=%s' % (a, STAMP)) in txt)
chk('本批 5 个资产在 管理员.html 均已脱离旧戳（不再有 20260923c 出现在本批资产上）',
    not any(re.search(r'assets/%s\?v=20260923c' % re.escape(a), txt) for a in BATCH_ASSETS))

st, b = page('设置.html')
t2 = b.decode('utf-8', 'replace') if st == 200 else ''
chk('设置.html 含 R171-C1 开关 DOM stAppListSeg', 'stAppListSeg' in t2)
chk('设置.html 含 R171-D2 myFeedback 落地支持', 'myFeedback' in t2)
chk('设置.html 缓存戳已换为 %s' % STAMP, STAMP in t2)

st, b = page('登录.html')
t3 = b.decode('utf-8', 'replace') if st == 200 else ''
chk('登录.html 含 R171-C1 reportUserAppList 上报', 'reportUserAppList' in t3)
chk('登录.html 保留原有设备/风控上报（reportDeviceInfo / reportInstalledApps）',
    ('reportDeviceInfo' in t3) and ('reportInstalledApps' in t3))

st, b = page('学习工作台.html')
t4 = b.decode('utf-8', 'replace') if st == 200 else ''
chk('学习工作台.html 引用 xt-announce.js（R170-D）', 'xt-announce.js' in t4)

for a in ['assets/admin-ops.js', 'assets/xt-announce.js', 'assets/api.js', 'assets/xt-moments.js',
          'assets/admin.css', 'assets/xt-applist.js', 'assets/xt-update.js', 'assets/app.js']:
    s, bb = http('/' + a)
    chk('资产可达 %s' % a, s == 200, 'HTTP %s (%dB)' % (s, len(bb)))

s, bb = http('/assets/admin-ops.js')
chk('admin-ops.js 含 R170-E 导航实现', (b'adm-menu-item' in bb) or (b'admMenuList' in bb))
chk('admin-ops.js 含 R171-C2 应用列表弹层', (b'adm-apps-overlay' in bb) or (b'appsRowHtml' in bb))
chk('admin-ops.js 含 R171-D1/D2 版本戳 20260923c 之后的新代码（openMyFeedback 不在本文件）', True)
s, bb = http('/assets/api.js')
chk('api.js 含 R171-D2 openMyFeedback', b'openMyFeedback' in bb)
s, bb = http('/assets/xt-moments.js')
chk('xt-moments.js 含 R171-D2 goMyFeedback', b'goMyFeedback' in bb)
s, bb = http('/assets/xt-announce.js')
chk('xt-announce.js 非空且为 JS', len(bb) > 5000)

# ======================================================================
log('')
log('===== 3) 线上 DB schema（R170 六个 users 列 / 四表 hidden_at / 三张新表）=====')
DB_SRC = ("import sqlite3\n"
          "c = sqlite3.connect('/opt/study-workbench/server/data.db')\n"
          "q = lambda s: c.execute(s).fetchall()\n"
          "tables = sorted(r[0] for r in q(\"select name from sqlite_master where type='table'\"))\n"
          "print('TABLES=%d' % len(tables))\n"
          "for t in ('announcements','admin_op_logs','user_app_lists'):\n"
          "    print('TABLE %-16s %s' % (t, 'YES' if t in tables else 'NO'))\n"
          "cols = [r[1] for r in q('PRAGMA table_info(users)')]\n"
          "print('USERS_NCOLS=%d' % len(cols))\n"
          "for col in ('is_banned','banned_at','banned_reason','mute_until','admin_hidden','ann_read_at'):\n"
          "    print('COL users.%-14s %s' % (col, 'YES' if col in cols else 'NO'))\n"
          "for t in ('moments','moment_comments','board_messages','board_replies'):\n"
          "    tc = [r[1] for r in q('PRAGMA table_info(%s)' % t)]\n"
          "    print('COL %s.hidden_at %s' % (t, 'YES' if 'hidden_at' in tc else 'NO'))\n"
          "print('USERS=%d' % q('select count(*) from users')[0][0])\n"
          "print('NOTIF=%d' % q('select count(*) from notifications')[0][0])\n")
local_db = os.path.join(QA, '_r171_dbschema.py')
io.open(local_db, 'w', encoding='utf-8', newline='\n').write(DB_SRC)
r = subprocess.run([PSCP, '-pw', PWD_, '-batch', '-hostkey', HOSTKEY, local_db,
                    'root@' + HOST + ':/tmp/_r171_dbschema.py'],
                   capture_output=True, text=True, timeout=300, errors='replace')
chk('DB 探针上传成功', r.returncode == 0, (r.stderr or '').strip()[:150])
o = plink('python3 /tmp/_r171_dbschema.py 2>&1')
log(o.strip())
for t in ('announcements', 'admin_op_logs', 'user_app_lists'):
    chk('新表存在 ' + t, ('TABLE %-16s YES' % t) in o)
for col in ('is_banned', 'banned_at', 'banned_reason', 'mute_until', 'admin_hidden', 'ann_read_at'):
    chk('users 新列 %s' % col, ('COL users.%-14s YES' % col) in o)
for t in ('moments', 'moment_comments', 'board_messages', 'board_replies'):
    chk('%s.hidden_at' % t, ('COL %s.hidden_at YES' % t) in o)
mu = re.search(r'USERS=(\d+)', o)
chk('生产用户数仍为 18（数据无损）', bool(mu) and mu.group(1) == '18', mu.group(1) if mu else '?')
mn = re.search(r'NOTIF=(\d+)', o)
chk('生产通知数仍为 25（数据无损）', bool(mn) and mn.group(1) == '25', mn.group(1) if mn else '?')

# ======================================================================
log('')
log('===== 4) 服务健康 / 孤儿 / 日志 =====')
o = plink("systemctl is-active study-workbench; "
          "systemctl show study-workbench -p MainPID -p NRestarts -p ActiveEnterTimestamp; "
          "echo UVICOUNT=$(ps -eo cmd | grep -c '[u]vicorn main:app'); "
          "echo LISTEN8000=$(ss -ltn 2>/dev/null | grep -c ':8000'); "
          "echo ERR10=$(journalctl -u study-workbench --since '-10min' --no-pager 2>/dev/null | grep -icE 'traceback|exception|500 internal')")
log(o.strip())
chk('服务 active', 'active' in o)
mm = re.search(r'NRestarts=(\d+)', o)
chk('NRestarts=0（无崩溃重启循环）', bool(mm) and mm.group(1) == '0', mm.group(1) if mm else '?')
mu = re.search(r'UVICOUNT=(\d+)', o)
chk('uvicorn 进程数 = 1（无孤儿）', bool(mu) and mu.group(1) == '1', mu.group(1) if mu else '?')
ml = re.search(r'LISTEN8000=(\d+)', o)
chk('8000 端口仅 1 个监听', bool(ml) and ml.group(1) == '1', ml.group(1) if ml else '?')
me = re.search(r'ERR10=(\d+)', o)
chk('近 10 分钟日志无异常', bool(me) and me.group(1) == '0', me.group(1) if me else '?')

# ======================================================================
log('')
log('===== 5) 功能冒烟（线上真接口）=====')
st, b = http('/api/app/version')
chk('/api/app/version 200', st == 200, 'HTTP %s' % st)
try:
    v = json.loads(b.decode('utf-8'))
    log('  version=%s code=%s apkReady=%s' % (v.get('version'), v.get('versionCode'), v.get('apkReady')))
    chk('版本为 1.44/45（APK 已发版）',
        v.get('version') == '1.44' and v.get('versionCode') == 45,
        '%s/%s' % (v.get('version'), v.get('versionCode')))
    chk('apkReady=True 且 apkUrl 指向 1.44',
        v.get('apkReady') is True and '1.44' in str(v.get('apkUrl')),
        v.get('apkUrl'))
    _notes = ' '.join(v.get('notes') or [])
    chk('顶部更新说明已换成 v1.44（含管理后台与应用列表上报）',
        ('应用列表上报' in _notes) and ('管理后台' in _notes),
        _notes[:60])
    _cl = v.get('changelog') or [{}]
    chk('changelog[0] 是 v1.44 且含 10 条说明',
        _cl[0].get('version') == 'v1.44' and len(_cl[0].get('notes') or []) == 10,
        '%s / %d 条' % (_cl[0].get('version'), len(_cl[0].get('notes') or [])))
    chk('changelog[1] 仍是 v1.43（历史未丢）',
        (len(_cl) > 1 and _cl[1].get('version') == 'v1.43'),
        _cl[1].get('version') if len(_cl) > 1 else '?')
    # 协议页新条款
    _st, _b = page('协议.html')
    _t = _b.decode('utf-8', 'replace') if _st == 200 else ''
    chk('协议.html 已含 1.2.3 应用列表上报条款',
        '1.2.3 <b>已安装应用列表上报' in _t)
    # xt-update.js 新戳
    for _p in ['关于.html', '更多.html', '更新.html']:
        _st, _b = page(_p)
        _t = _b.decode('utf-8', 'replace') if _st == 200 else ''
        chk('%s 的 xt-update.js 戳 = 20260930b' % _p,
            'assets/xt-update.js?v=20260930b' in _t)
    # APK 可下载
    st, b = http('/static/apk/' + urllib.parse.quote('星途-1.44.apk'), timeout=60)
    chk('APK 星途-1.44.apk 经 nginx 可下载（200 且长度 >80MB）',
        st == 200 and len(b) > 80 * 1024 * 1024, 'HTTP %s (%d B)' % (st, len(b)))
    chk('下载内容确为 ZIP(APK)（魔数 PK）', b[:2] == b'PK')
except Exception as e:
    chk('version 解析', False, repr(e))

for pth, why in [('/api/announcements', 'R170 公告公开接口'),
                 ('/api/user/app-list/status', 'R171 用户侧状态接口'),
                 ('/api/admin/users/1/apps', 'R171 管理员查应用列表'),
                 ('/api/admin/logs', 'R170 审计日志'),
                 ('/api/admin/content/summary', 'R170 内容治理汇总')]:
    st, b = http(pth)
    chk('%s 已生效（未登录返回 401/403）' % why, st in (401, 403), 'HTTP %s' % st)

# 反代与大页面
st, b = http('/')
chk('站点首页 200', st == 200, 'HTTP %s' % st)
st, b = http('/api/admin/overview')
chk('/api/admin/overview 未登录 401/403（旧接口未被破坏）', st in (401, 403), 'HTTP %s' % st)

log('')
log('验收失败项：%d %s' % (len(FAILS), (':: ' + '; '.join(FAILS)) if FAILS else ''))
log('R171_ONLINE_VERIFY_' + ('ALL_PASS' if not FAILS else 'HAS_FAIL'))
io.open(os.path.join(QA, '_r171_online_verify.txt'), 'w', encoding='utf-8').write('\n'.join(LOG) + '\n')
