# -*- coding: utf-8 -*-
"""R171 线上待查两项：① DB schema（R170/R171 新列新表）；② 3 个 uvicorn 进程的真相。"""
import io
import os
import re
import subprocess

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

DB = r'''# -*- coding: utf-8 -*-
import sqlite3
c = sqlite3.connect('/opt/study-workbench/server/data.db')
q = lambda s: c.execute(s).fetchall()
tables = sorted(r[0] for r in q("select name from sqlite_master where type='table'"))
print('TABLES=%d' % len(tables))
for t in ('announcements', 'admin_op_logs', 'user_app_lists', 'notifications', 'user_devices'):
    print('TABLE %-16s %s' % (t, 'YES' if t in tables else 'NO'))
cols = [r[1] for r in q('PRAGMA table_info(users)')]
print('USERS_COLS(%d)=%s' % (len(cols), ','.join(cols)))
for col in ('is_banned', 'banned_at', 'banned_reason', 'mute_until', 'admin_hidden',
            'ann_read_at', 'token_version'):
    print('COL users.%-14s %s' % (col, 'YES' if col in cols else 'NO'))
for t in ('moments', 'moment_comments', 'board_messages', 'board_replies'):
    tc = [r[1] for r in q('PRAGMA table_info(%s)' % t)]
    print('COL %s.hidden_at %s' % (t, 'YES' if 'hidden_at' in tc else 'NO'))
print('USERS=%d' % q('select count(*) from users')[0][0])
print('NOTIF=%d' % q('select count(*) from notifications')[0][0])
for t in ('announcements', 'admin_op_logs', 'user_app_lists'):
    try:
        print('CNT %-14s %d' % (t, q('select count(*) from %s' % t)[0][0]))
    except Exception as e:
        print('CNT %-14s ERR %s' % (t, e))
print('ADMINS=%s' % q("select id, username, is_admin, admin_hidden from users where is_admin=1"))
'''

local_db = os.path.join(QA, '_r171_dbschema.py')
io.open(local_db, 'w', encoding='utf-8', newline='\n').write(DB)

r = subprocess.run([PSCP, '-pw', PWD_, '-batch', '-hostkey', HOSTKEY, local_db, 'root@' + HOST + ':/tmp/_r171_dbschema.py'],
                   capture_output=True, text=True, timeout=300, errors='replace')
print('pscp rc=%d %s' % (r.returncode, (r.stderr or '').strip()[:200]))

SH = r'''
echo "===== A) DB SCHEMA ====="
python3 /tmp/_r171_dbschema.py 2>&1
echo "===== B) port 8000 owner ====="
ss -ltnp 2>/dev/null | grep ':8000' || echo "no_listener"
echo "===== C) all uvicorn-ish procs ====="
ps -eo pid,ppid,etimes,rss,stat,cmd | grep -iE 'uvicorn|gunicorn' | grep -v grep || echo "none"
echo "===== D) systemd unit ExecStart ====="
systemctl cat study-workbench 2>/dev/null | grep -E 'ExecStart|Workers|Restart' || true
echo "===== E) children of MainPID ====="
MP=$(systemctl show study-workbench -p MainPID --value); echo "MainPID=$MP"
ps --ppid "$MP" -o pid,ppid,stat,cmd 2>/dev/null || echo "no_children"
'''

r2 = subprocess.run([PLINK, '-ssh', '-pw', PWD_, '-batch', '-hostkey', HOSTKEY, 'root@' + HOST, SH],
                    capture_output=True, text=True, timeout=300, errors='replace')
out = (r2.stdout or '') + (('\n[STDERR] ' + r2.stderr.strip()) if (r2.stderr or '').strip() else '')
io.open(os.path.join(QA, '_r171_db_proc.txt'), 'w', encoding='utf-8').write(out)
print(out)
