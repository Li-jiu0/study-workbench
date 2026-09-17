# -*- coding: utf-8 -*-
"""R72 后端真实探针（在服务器上、cwd=server/ 运行）。自建临时账号→打真实接口→清场。
退出码 0=全过 / 1=有 FAIL。不打印任何凭据。"""
import json, os, sqlite3, sys, time, urllib.request, urllib.error

BASE = 'http://127.0.0.1:8000'
DB = 'data.db'

PASS = 0; FAIL = 0; FAILS = []; RESULTS = []
def ck(name, cond, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1; RESULTS.append('  OK   ' + name + ('  ' + str(detail) if detail != '' else ''))
    else:
        FAIL += 1; FAILS.append(name); RESULTS.append('  FAIL ' + name + '  ' + str(detail))

def load_env():
    e = {}
    try:
        for ln in open('.env', encoding='utf-8'):
            ln = ln.strip()
            if not ln or ln.startswith('#') or '=' not in ln:
                continue
            k, v = ln.split('=', 1)
            e[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return e

def req(method, path, token=None, body=None, timeout=20):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if token:
        r.add_header('Authorization', 'Bearer ' + token)
    if data is not None:
        r.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8', 'replace')
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:200]
    except Exception as e:
        return 0, repr(e)

suf = str(int(time.time()))[-6:]
env = load_env()
ADM_U = env.get('ADMIN_USERNAME', u'\u7ba1\u7406\u5458'); ADM_P = env.get('ADMIN_PASSWORD', '')

conn = sqlite3.connect(DB); cur = conn.cursor()
anchor = cur.execute('select count(*) from users').fetchone()[0]
has_tbl = cur.execute("select count(*) from sqlite_master where type='table' and name='friend_remarks'").fetchone()[0]
conn.close()
ck(u'anchor users(before) 记录', True, anchor)
ck(u'friend_remarks 表存在(=1)', has_tbl == 1, has_tbl)

ua = 'r72a' + suf; ub = 'r72b' + suf; uc = 'r72c' + suf
stA, rA = req('POST', '/api/auth/register', body={'username': ua, 'password': 'pass123456', 'nickname': u'\u63a2\u9488\u7532' + suf})
stB, rB = req('POST', '/api/auth/register', body={'username': ub, 'password': 'pass123456', 'nickname': u'\u63a2\u9488\u4e59' + suf})
stC, rC = req('POST', '/api/auth/register', body={'username': uc, 'password': 'pass123456', 'nickname': u'\u63a2\u9488\u4e19' + suf})
ck('register A 200', stA == 200, stA); ck('register B 200', stB == 200, stB); ck('register C 200', stC == 200, stC)
ta = (rA.get('token') if isinstance(rA, dict) else '') or ''
tb = (rB.get('token') if isinstance(rB, dict) else '') or ''
tc = (rC.get('token') if isinstance(rC, dict) else '') or ''
ida = ((rA.get('user') or {}).get('id', 0) if isinstance(rA, dict) else 0)
idb = ((rB.get('user') or {}).get('id', 0) if isinstance(rB, dict) else 0)
idc = ((rC.get('user') or {}).get('id', 0) if isinstance(rC, dict) else 0)
ck('A/B/C 取到 id', bool(ida) and bool(idb) and bool(idc), '%s/%s/%s' % (ida, idb, idc))

stAd, rAd = req('POST', '/api/auth/login', body={'username': ADM_U, 'password': ADM_P})
ck('admin login 200', stAd == 200, stAd)
tadm = (rAd.get('token') if isinstance(rAd, dict) else '') or ''
stMe, me = req('GET', '/api/auth/me', token=tadm)
admin_id = (me.get('id', 0) if isinstance(me, dict) else 0)
ck('admin id>0', bool(admin_id), admin_id)

req('POST', '/api/friends/requests', token=ta, body={'toUserId': idb})
stR, rq = req('GET', '/api/friends/requests', token=tb)
pend = [x for x in (rq.get('incoming') or []) if x.get('status') == 'pending'] if isinstance(rq, dict) else []
ok_fr = False
if pend:
    stX, _ = req('POST', '/api/friends/requests/%d/accept' % pend[0]['id'], token=tb)
    ok_fr = stX == 200
ck('A-B become friends', ok_fr)

# A-C 结为好友（供建群 ≥2 名成员使用）
req('POST', '/api/friends/requests', token=ta, body={'toUserId': idc})
stR2, rq2 = req('GET', '/api/friends/requests', token=tc)
pend2 = [x for x in (rq2.get('incoming') or []) if x.get('status') == 'pending'] if isinstance(rq2, dict) else []
ok_fr2 = False
if pend2:
    stX2, _ = req('POST', '/api/friends/requests/%d/accept' % pend2[0]['id'], token=tc)
    ok_fr2 = stX2 == 200
ck('A-C become friends', ok_fr2)

# ---- Bug1（核心）：管理员回复并已读 → 会话仍在 ----
stM1, _ = req('POST', '/api/chat/%d/messages' % admin_id, token=ta, body={'content': u'\u63a2\u9488\uff1a\u4f60\u597d\u7ba1\u7406\u5458' + suf, 'kind': 'text'})
ck(u'A→admin 发信 200', stM1 == 200, stM1)
stC1, c1 = req('GET', '/api/chat/conversations', token=tadm)
has1 = isinstance(c1, dict) and any(x.get('peerId') == ida for x in (c1.get('items') or []))
ck(u'管理员会话含 A（回复前）', has1)
stM2, _ = req('POST', '/api/chat/%d/messages' % ida, token=tadm, body={'content': u'\u63a2\u9488\uff1a\u6536\u5230\u6211\u6765\u5904\u7406', 'kind': 'text'})
ck(u'admin→A 回复 200', stM2 == 200, stM2)
stMR, _ = req('GET', '/api/chat/%d/messages?limit=50&markRead=1' % ida, token=tadm)
ck(u'admin 拉会话并置已读 200', stMR == 200, stMR)
stC2, c2 = req('GET', '/api/chat/conversations', token=tadm)
itemA = None
if isinstance(c2, dict):
    for x in (c2.get('items') or []):
        if x.get('peerId') == ida:
            itemA = x
ck(u'★ Bug1: 已读后 A 仍在会话列表', itemA is not None)
ck(u'★ Bug1: 该会话 unreadCount=0', bool(itemA) and itemA.get('unreadCount') == 0, (itemA or {}).get('unreadCount'))
ck(u'★ Bug1: lastMessage=管理员回复', bool(itemA) and (itemA.get('lastMessage') or {}).get('content') == u'\u63a2\u9488\uff1a\u6536\u5230\u6211\u6765\u5904\u7406')

# ---- Bug3 备注 ----
rmk = u'\u63a2\u9488\u5907\u6ce8' + suf
stW, rw = req('PUT', '/api/friends/%d/remark' % idb, token=ta, body={'remark': rmk})
ck(u'写备注 200 且回显', stW == 200 and isinstance(rw, dict) and rw.get('peerRemark') == rmk, rw)
stF, fl = req('GET', '/api/friends', token=ta)
rowb = None
if isinstance(fl, dict):
    for x in (fl.get('items') or []):
        if x.get('id') == idb:
            rowb = x
ck(u'好友列表带 peerRemark', bool(rowb) and rowb.get('peerRemark') == rmk, rowb)
req('PUT', '/api/friends/%d/remark' % idb, token=ta, body={'remark': ''})
stF2, fl2 = req('GET', '/api/friends', token=ta)
rowb2 = None
if isinstance(fl2, dict):
    for x in (fl2.get('items') or []):
        if x.get('id') == idb:
            rowb2 = x
ck(u'清备注后为空', bool(rowb2) and (rowb2.get('peerRemark') or '') == '', rowb2)

# ---- Bug2 群 + 管理员分支 ----
stG, rg = req('POST', '/api/groups', token=ta, body={'name': u'\u63a2\u9488\u7fa4' + suf, 'memberIds': [idb, idc]})
ck(u'A 建群 200', stG == 200, stG)
gid = (rg.get('id', 0) if isinstance(rg, dict) else 0)
stGA, ga = req('GET', '/api/groups', token=tadm)
rowg = None
if isinstance(ga, dict):
    for x in (ga.get('items') or []):
        if x.get('id') == gid:
            rowg = x
ck(u'★ Bug2: 管理员看到该群', rowg is not None)
ck(u'★ Bug2: role=admin-view & unreadCount=0', bool(rowg) and rowg.get('role') == 'admin-view' and rowg.get('unreadCount') == 0, rowg)

# ---- 既有功能不回归 ----
for path in ['/api/friends', '/api/groups', '/api/chat/unread']:
    st, _ = req('GET', path, token=ta)
    ck(u'regression %s ==200' % path, st == 200, st)

# ---- 清场（§6.4 关联表 + friend_remarks + 临时群）----
ids = [ida, idb, idc]
pairs = [
    ('ai_logs', 'user_id'), ('ai_usage', 'user_id'), ('board_likes', 'user_id'),
    ('board_messages', 'user_id'), ('board_replies', 'user_id'), ('chat_group_members', 'user_id'),
    ('chat_groups', 'owner_id'), ('comments', 'user_id'), ('favorites', 'user_id'),
    ('feedbacks', 'user_id'), ('friend_requests', 'from_user_id'), ('friend_requests', 'to_user_id'),
    ('friends', 'user_a'), ('friends', 'user_b'), ('likes', 'user_id'),
    ('messages', 'sender_id'), ('messages', 'receiver_id'), ('moment_comments', 'user_id'),
    ('moment_likes', 'user_id'), ('moments', 'user_id'), ('notes', 'user_id'),
    ('notifications', 'user_id'), ('notifications', 'actor_id'), ('study_logs', 'user_id'),
    ('user_blocks', 'blocker_id'), ('user_blocks', 'blocked_id'),
    ('friend_remarks', 'owner_id'), ('friend_remarks', 'peer_id'),
]
conn = sqlite3.connect(DB); cur = conn.cursor()
ph = ','.join('?' * len(ids))
for tbl, col in pairs:
    try:
        cur.execute('DELETE FROM %s WHERE %s IN (%s)' % (tbl, col, ph), ids)
    except Exception:
        pass
if gid:
    for sql, arg in [('DELETE FROM chat_group_members WHERE group_id=?', (gid,)),
                     ('DELETE FROM messages WHERE group_id=?', (gid,)),
                     ('DELETE FROM chat_groups WHERE id=?', (gid,))]:
        try:
            cur.execute(sql, arg)
        except Exception:
            pass
cur.execute('DELETE FROM users WHERE id IN (%s)' % ph, ids)
conn.commit()
after = cur.execute('select count(*) from users').fetchone()[0]
left = cur.execute('select count(*) from users WHERE id IN (%s)' % ph, ids).fetchone()[0]
conn.close()
ck(u'★ 清场: 临时账号已删', left == 0, left)
ck(u'★ 清场: users 回到锚点', after == anchor, 'before=%s after=%s' % (anchor, after))

print('RESULTS')
for x in RESULTS:
    print(x)
print('SUMMARY pass=%d fail=%d' % (PASS, FAIL))
if FAILS:
    print('FAILED: ' + ' | '.join(FAILS))
sys.exit(1 if FAIL else 0)
