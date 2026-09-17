# -*- coding: utf-8 -*-
# 主理人独立复跑任务一：后端 smoke + 前端 jsdom verifier + 标记/行尾核对
import os, subprocess, sys, datetime, glob

TREE = r'D:\下载的文件\学习工作台'
VENV_PY = os.path.join(TREE, 'server', '.venv', 'Scripts', 'python.exe')
NODE = r'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
out = []

def le(raw):
    return raw.count(b'\r\n'), raw.count(b'\n') - raw.count(b'\r\n')

def stat(rel):
    p = os.path.join(TREE, rel)
    if not os.path.exists(p):
        out.append('[MISS] %s' % rel); return
    raw = open(p, 'rb').read()
    crlf, lone = le(raw)
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(p)).strftime('%m-%d %H:%M:%S')
    out.append('%-30s size=%-7d CRLF=%-5d loneLF=%-4d mtime=%s' % (rel, len(raw), crlf, lone, mt))

def marks(rel, pats):
    p = os.path.join(TREE, rel)
    raw = open(p, 'rb').read()
    out.append('  %s :: %s' % (rel, ' | '.join('%s=%d' % (l, raw.count(pt.encode('utf-8'))) for l, pt in pats)))

out.append('=== 文件与行尾 ===')
for f in ['server/database.py', 'server/schemas.py', 'server/routers/chat.py', 'server/routers/friends.py',
          'server/routers/groups.py', 'assets/chat-local.js', 'assets/api.js', 'server/建表SQL.sql']:
    stat(f)

out.append('=== 关键标记 ===')
marks('server/database.py', [('FriendRemark 类', 'class FriendRemark'), ('friend_remarks 表', 'friend_remarks')])
marks('server/routers/chat.py', [('conversations 路由', '/conversations'), ('peerRemark', 'peerRemark')])
marks('server/routers/friends.py', [('remark 路由', '/remark'), ('can_message', 'can_message')])
marks('server/routers/groups.py', [('admin 分支', 'admin-view'), ('_admin_group_rows', '_admin_group_rows')])
marks('assets/chat-local.js', [('conversations 调用', '/api/chat/conversations'), ('窗口弹窗备注', 'imOpenRemarkEditor'),
                               ('离线兜底', '离线兜底'), ('lsK', 'function lsK'), ('原生 prompt 残留', 'window.prompt')])
marks('assets/api.js', [('apiGetChatConversations', 'apiGetChatConversations'), ('apiSetFriendRemark', 'apiSetFriendRemark')])

out.append('=== 独立复跑：后端 smoke（venv python） ===')
smoke = os.path.join(TREE, 'server', 'scripts', 'smoke_r72_chat.py')
if os.path.exists(VENV_PY) and os.path.exists(smoke):
    r = subprocess.run([VENV_PY, smoke], capture_output=True, text=True, cwd=os.path.join(TREE, 'server'), timeout=300)
    out.append('rc=%d' % r.returncode)
    out.append('--- stdout tail ---')
    out.append('\n'.join((r.stdout or '').strip().splitlines()[-25:]))
    out.append('--- stderr tail ---')
    out.append('\n'.join((r.stderr or '').strip().splitlines()[-12:]))
else:
    out.append('MISSING venv_python=%s smoke=%s' % (os.path.exists(VENV_PY), os.path.exists(smoke)))

out.append('=== 独立复跑：前端 jsdom verifier ===')
v = os.path.join(TREE, 'tools', 'verifier', 'verify_r72_task1_chat.js')
if os.path.exists(v):
    env = dict(os.environ); env['NODE_PATH'] = 'C:/Users/ATM/node_modules'
    r = subprocess.run([NODE, v], capture_output=True, text=True, cwd=TREE, env=env, timeout=300)
    out.append('rc=%d' % r.returncode)
    out.append('--- stdout tail ---')
    out.append('\n'.join((r.stdout or '').strip().splitlines()[-20:]))
    out.append('--- stderr tail ---')
    out.append('\n'.join((r.stderr or '').strip().splitlines()[-10:]))
else:
    out.append('MISSING verifier')

out.append('=== 备份计数 ===')
baks = glob.glob(os.path.join(TREE, 'server', '**', '*.bak-pre-r72-20260917'), recursive=True) + \
       glob.glob(os.path.join(TREE, 'assets', '*.bak-pre-r72-20260917'))
out.append('task1 备份: %s' % [os.path.relpath(b, TREE) for b in baks])

open(os.path.join(TREE, '_r72_lead_check_task1.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('DONE')
