# -*- coding: utf-8 -*-
"""批次五收尾勘察：nginx 站点配置 + users 关联表（只读）。"""
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
echo "=== nginx sites-available ==="
ls -1 /etc/nginx/sites-available/
echo "=== site config: study-workbench ==="
cat /etc/nginx/sites-available/study-workbench
echo "=== nginx.conf gzip 段 ==="
grep -nE "gzip" /etc/nginx/nginx.conf
echo "=== DB 表清单 ==="
cd /opt/study-workbench/server && python3 - <<'PYEOF'
import sqlite3
c = sqlite3.connect('data.db')
names = [r[0] for r in c.execute("select name from sqlite_master where type='table' order by name")]
print(len(names), names)
print("--- 引用 users 的外键 ---")
for n in names:
    try:
        for fk in c.execute("PRAGMA foreign_key_list(%s)" % n):
            if fk[2] == 'users':
                print("FK:", n, fk[3], "->", fk[2], fk[4])
    except Exception:
        pass
print("--- 各表含 user 字样的列 ---")
for n in names:
    cols = [r[1] for r in c.execute("PRAGMA table_info(%s)" % n)]
    hit = [x for x in cols if 'user' in x.lower() or x.lower() in ('id','author_id','owner_id','sender_id','receiver_id')]
    if hit:
        print(n, hit)
PYEOF
echo "=== 目标用户行数（各关联表） ==="
cd /opt/study-workbench/server && python3 - <<'PYEOF'
import sqlite3
c = sqlite3.connect('data.db')
for t, col in [('friends','user_id'),('friend_requests','from_user_id'),('messages','sender_id'),
               ('group_members','user_id'),('moments','user_id'),('notes','user_id'),
               ('study_records','user_id'),('uploads','user_id'),('feedbacks','user_id')]:
    try:
        n = c.execute("select count(*) from %s where %s in (8,9,10)" % (t, col)).fetchone()[0]
        print(t, col, n)
    except Exception as e:
        print(t, col, 'N/A', str(e)[:60])
PYEOF
'''

r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, f"root@{host}", CMD],
                   capture_output=True, timeout=240)
out = r.stdout.decode("utf-8", "replace")
err = r.stderr.decode("utf-8", "replace")
print("rc=%d" % r.returncode)
print(out)
if err.strip():
    print("STDERR:", err[-500:])
with open(os.path.join(ROOT, "tools", "qa", "_b5_recon.txt"), "w", encoding="utf-8") as f:
    f.write(out)
