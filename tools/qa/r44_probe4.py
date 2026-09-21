# -*- coding: utf-8 -*-
"""R44 第四轮：Bug C（会话列表）数据侧取证，只读 SELECT。

用法：python tools/qa/r44_probe4.py
输出：tools/qa/r44_probe4_out.txt
"""
import base64
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_probe4_out.txt")


def load_credentials():
    host = os.environ.get("SW_HOST", "")
    pwd = os.environ.get("SW_PASS", "")
    if not host or not pwd:
        s = open(CRED, encoding="utf-8", errors="replace").read()
        m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
        if not m:
            raise SystemExit("凭据不可得")
        pwd, host = m.group(1), m.group(2)
    return host, pwd


REMOTE_PY = r'''# -*- coding: utf-8 -*-
import sqlite3
DB = "/opt/study-workbench/server/data.db"
con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True)

print("=== users 表是否含 is_admin 列 ===")
cols = [r[1] for r in con.execute("PRAGMA table_info(users)")]
print("HAS_IS_ADMIN:", "YES" if "is_admin" in cols else "NO")
print("HAS_TOKEN_VERSION:", "YES" if "token_version" in cols else "NO")

print("")
print("=== messages 概况 ===")
print("MSG_TOTAL:", con.execute("select count(*) from messages").fetchone()[0])
rows = con.execute(
    "select id,sender_id,receiver_id,kind,group_id,read_at,created_at "
    "from messages order by id desc limit 15").fetchall()
print("LAST_15 (id,sender,receiver,kind,group,read?,created):")
for r in rows:
    print("  ", r[0], r[1], r[2], r[3], r[4], "READ" if r[5] else "unread", r[6])

print("")
print("=== 近 24h 消息数 ===")
try:
    n = con.execute(
        "select count(*) from messages where created_at >= datetime('now','-1 day')"
    ).fetchone()[0]
    print("MSG_24H:", n)
except Exception as e:
    print("MSG_24H_ERR: %r" % (e,))

print("")
print("=== friends 关系对 ===")
for r in con.execute("select id,user_a,user_b,created_at from friends order by id"):
    print("  FRIEND", r[0], r[1], "<->", r[2], r[3])

print("")
print("=== friend_requests ===")
for r in con.execute(
        "select id,from_user_id,to_user_id,status,created_at from friend_requests order by id"):
    print("  REQ", r[0], r[1], "->", r[2], r[3], r[4])
con.close()
'''

REMOTE = ("echo " + base64.b64encode(REMOTE_PY.encode("utf-8")).decode("ascii")
          + " | base64 -d | python3 -")


def main():
    host, pwd = load_credentials()
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, REMOTE],
                       capture_output=True, timeout=300)
    text = r.stdout.decode("utf-8", "replace")
    if r.stderr.strip():
        text += "\nSTDERR:\n" + r.stderr.decode("utf-8", "replace")[-500:]
    text = text.replace(pwd, "<已省略>")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    print("WROTE " + OUT)


if __name__ == "__main__":
    main()
