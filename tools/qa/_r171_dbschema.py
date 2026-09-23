import sqlite3
c = sqlite3.connect('/opt/study-workbench/server/data.db')
q = lambda s: c.execute(s).fetchall()
tables = sorted(r[0] for r in q("select name from sqlite_master where type='table'"))
print('TABLES=%d' % len(tables))
for t in ('announcements','admin_op_logs','user_app_lists'):
    print('TABLE %-16s %s' % (t, 'YES' if t in tables else 'NO'))
cols = [r[1] for r in q('PRAGMA table_info(users)')]
print('USERS_NCOLS=%d' % len(cols))
for col in ('is_banned','banned_at','banned_reason','mute_until','admin_hidden','ann_read_at'):
    print('COL users.%-14s %s' % (col, 'YES' if col in cols else 'NO'))
for t in ('moments','moment_comments','board_messages','board_replies'):
    tc = [r[1] for r in q('PRAGMA table_info(%s)' % t)]
    print('COL %s.hidden_at %s' % (t, 'YES' if 'hidden_at' in tc else 'NO'))
print('USERS=%d' % q('select count(*) from users')[0][0])
print('NOTIF=%d' % q('select count(*) from notifications')[0][0])
