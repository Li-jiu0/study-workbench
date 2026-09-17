# -*- coding: utf-8 -*-
"""R72 收尾只读核对（在服务器 cwd=server/ 运行）：users 清场确认 + friend_remarks 真实表结构。"""
import sqlite3
c = sqlite3.connect('data.db'); cur = c.cursor()
print('USERS_TOTAL', cur.execute('select count(*) from users').fetchone()[0])
print('USERS_MAXID', cur.execute('select max(id) from users').fetchone()[0])
print('RESID_13_16', [r[0] for r in cur.execute('select id from users where id in (13,14,15,16) order by id').fetchall()])
print('LEFT_TMP', cur.execute('select count(*) from users where username like "r72%"').fetchone()[0])
cols = cur.execute('pragma table_info(friend_remarks)').fetchall()
print('FR_COLS', [(r[1], r[2], r[3], r[5]) for r in cols])   # name, type, notnull(flag), pk
idx = cur.execute('pragma index_list(friend_remarks)').fetchall()
print('FR_IDX', [(r[1], r[2]) for r in idx])                   # name, unique(flag)
for r in idx:
    print('FR_IDXCOLS', r[1], [x[2] for x in cur.execute('pragma index_info(%s)' % r[1]).fetchall()])
row = cur.execute("select sql from sqlite_master where name='friend_remarks'").fetchone()
print('FR_DDL', (row[0] if row else None))
print('FR_ROWS', cur.execute('select count(*) from friend_remarks').fetchone()[0])
c.close()
