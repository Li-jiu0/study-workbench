# -*- coding: utf-8 -*-
"""批次五收尾执行：删测试号(id=8/9)+探针(id=10) 与关联数据；nginx C 方案(no-cache)。"""
import os
import re
import subprocess

ROOT = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8d0a1649"
CRED = r"D:\下载的文件\学习工作台\upload_v23.ps1"
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"


def creds():
    host = os.environ.get("SW_HOST", "")
    pwd = os.environ.get("SW_PASS", "")
    if not host or not pwd:
        s = open(CRED, encoding="utf-8", errors="replace").read()
        m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
        pwd, host = m.group(1), m.group(2)
    return host, pwd


host, pwd = creds()

CMD = r'''
echo "=== 1. DB 备份 ==="
cd /opt/study-workbench && mkdir -p backups && cp -a server/data.db backups/data.db.before-purge-20260913e && echo DB-BACKUP-OK

echo "=== 2. 删除 id=8/9/10 及关联数据 ==="
cd /opt/study-workbench/server && python3 - <<'PYEOF'
import sqlite3
targets = (8, 9, 10)
c = sqlite3.connect('data.db')
c.execute('PRAGMA foreign_keys=OFF')
pairs = [
 ('ai_logs','user_id'),('ai_usage','user_id'),('board_likes','user_id'),
 ('board_messages','user_id'),('board_replies','user_id'),('chat_group_members','user_id'),
 ('chat_groups','owner_id'),('comments','user_id'),('favorites','user_id'),
 ('feedbacks','user_id'),('friend_requests','from_user_id'),('friend_requests','to_user_id'),
 ('friends','user_a'),('friends','user_b'),('likes','user_id'),
 ('messages','sender_id'),('messages','receiver_id'),('moment_comments','user_id'),
 ('moment_likes','user_id'),('moments','user_id'),('notes','user_id'),
 ('notifications','user_id'),('notifications','actor_id'),('study_logs','user_id'),
 ('user_blocks','blocker_id'),('user_blocks','blocked_id'),
]
total = 0
for t, col in pairs:
    try:
        cur = c.execute("delete from %s where %s in (?,?,?)" % (t, col), targets)
        if cur.rowcount:
            print('  del %s.%s = %d' % (t, col, cur.rowcount)); total += cur.rowcount
    except Exception as e:
        print('  SKIP %s.%s (%s)' % (t, col, str(e)[:40]))
cur = c.execute("delete from users where id in (?,?,?)", targets)
print('  del users = %d' % cur.rowcount); total += cur.rowcount
c.commit()
print('  关联+用户 删除合计: %d' % total)
print('--- 剩余用户 ---')
for r in c.execute('select id,username,nickname from users order by id'):
    print('  ', r)
print('COUNT:', c.execute('select count(*) from users').fetchone()[0])
PYEOF

echo "=== 3. nginx C 方案(no-cache on /assets/data/) ==="
cp -a /etc/nginx/sites-available/study-workbench /etc/nginx/sites-available/study-workbench.bak-20260913e
python3 - <<'PYEOF'
p = '/etc/nginx/sites-available/study-workbench'
s = open(p).read()
block = '    location /assets/data/ {\n        add_header Cache-Control "no-cache";\n        try_files $uri =404;\n    }\n\n'
if '/assets/data/' in s:
    print('NGINX-ALREADY')
else:
    marker = '    location / {\n'
    if marker not in s:
        print('NGINX-MARKER-NOT-FOUND')
        raise SystemExit(1)
    s = s.replace(marker, block + marker, 1)
    open(p, 'w').write(s)
    print('NGINX-PATCHED')
PYEOF
nginx -t 2>&1 | tail -1
if nginx -t 2>/dev/null; then systemctl reload nginx && echo NGINX-RELOAD-OK; else echo NGINX-TEST-FAIL-ROLLBACK; cp -a /etc/nginx/sites-available/study-workbench.bak-20260913e /etc/nginx/sites-available/study-workbench; fi

echo "=== 4. 最终校验 ==="
echo "SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)"
echo "HEALTH:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health)"
echo "SERVICE:$(systemctl is-active study-workbench)"
echo "--- /assets/data/ 响应头 ---"
curl -sI "http://127.0.0.1/assets/data/vocab-cet4-ext-index.json" | grep -iE "cache-control|content-encoding" || true
echo "--- 首页响应头 ---"
curl -sI "http://127.0.0.1/" | grep -iE "cache-control|content-encoding" || true
echo "USERS:$(cd /opt/study-workbench/server && python3 -c "import sqlite3;print(sqlite3.connect('data.db').execute('select count(*) from users').fetchone()[0])")"
echo "--- journalctl 异常计数 ---"
journalctl -u study-workbench --since -10min | grep -ciE 'traceback|exception|500 internal' || true
'''

r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, f"root@{host}", CMD],
                   capture_output=True, timeout=300)
out = r.stdout.decode("utf-8", "replace")
err = r.stderr.decode("utf-8", "replace")
print("rc=%d" % r.returncode)
print(out)
if err.strip():
    print("STDERR:", err[-600:])
with open(os.path.join(ROOT, "tools", "qa", "_b5_purge_nginx.txt"), "w", encoding="utf-8") as f:
    f.write(out)
