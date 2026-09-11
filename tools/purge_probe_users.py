# -*- coding: utf-8 -*-
"""查证 comments.author 为 null 的根因 + 清理探针临时账号。"""
import sqlite3

c = sqlite3.connect('/opt/study-workbench/server/data.db')
print('COMMENTS_RAW:', c.execute("select id, note_id, user_id from comments order by note_id, id").fetchall())
print('USERS:', c.execute("select id, username, nickname from users order by id").fetchall())

uids = [r[0] for r in c.execute("select distinct user_id from comments").fetchall()]
orphan = []
for u in uids:
    hit = c.execute("select count(*) from users where id=?", (u,)).fetchone()[0]
    if hit == 0:
        orphan.append(u)
print('COMMENT_USER_IDS:', uids)
print('ORPHAN_USER_IDS(用户已不存在):', orphan)

probe = [r[0] for r in c.execute("select username from users where username like 'probe_%'").fetchall()]
print('PROBE_USERS:', probe)
if probe:
    c.execute("delete from users where username like 'probe_%'")
    c.commit()
print('USERS_AFTER_DELETE:', c.execute("select count(*) from users").fetchone()[0])
