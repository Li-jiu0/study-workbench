# -*- coding: utf-8 -*-
"""R44-C 部署后独立复核（只读）：服务稳定 + 管理员链路 + .env 完整性 + 日志干净。

与部署脚本解耦，单独复跑一遍关键断言，避免"自己验自己"。
"""
import base64
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
SERVICE_NAME = "study-workbench"
OUT = os.path.join(ROOT, "tools", "qa", "_r44c_verify_out.txt")

ADMIN_PWD = os.environ.get("SW_ADMIN_PASSWORD", "xingtu2026")

PROBE = r'''
import json, sqlite3, urllib.error, urllib.request
BASE = "http://127.0.0.1:8000"
ADMIN_USER = "\u7ba1\u7406\u5458"
ADMIN_PWD = "__PWD__"

def req(method, path, body=None, token=None, timeout=20):
    data = None; headers = {}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token: headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, "EXC:%s" % e

c, _ = req("GET", "/api/health"); print("HEALTH:" + str(c))
c, _ = req("GET", "/api/admin/contact"); print("NOAUTH_CONTACT:" + str(c))
c, raw = req("POST", "/api/auth/login", {"username": ADMIN_USER, "password": ADMIN_PWD})
print("LOGIN:" + str(c))
tok = ""
if c == 200:
    tok = json.loads(raw).get("token", "")
print("TOKEN_LEN:" + str(len(tok)))
if tok:
    for name, p in (("CONTACT", "/api/admin/contact"),
                    ("OVERVIEW", "/api/admin/overview"),
                    ("USERS", "/api/admin/users"),
                    ("ONLINE", "/api/admin/online"),
                    ("FEEDBACK", "/api/admin/feedback")):
        c2, b2 = req("GET", p, token=tok)
        print("%s_AUTHED:%s" % (name, c2))
        if name == "CONTACT":
            print("CONTACT_BODY:" + b2.replace("\n", " ")[:200])
con = sqlite3.connect("/opt/study-workbench/server/data.db", timeout=10)
cols = [r[1] for r in con.execute("PRAGMA table_info(users)")]
print("HAS_IS_ADMIN:" + ("1" if "is_admin" in cols else "0"))
r = con.execute("select id, username, is_admin from users where username=?", (ADMIN_USER,)).fetchone()
print("ADMIN_ROW:" + (("id=%s,username=%s,is_admin=%s" % r) if r else "NONE"))
print("USERS:" + str(con.execute("select count(*) from users").fetchone()[0]))
print("ADMIN_COUNT:" + str(con.execute("select count(*) from users where is_admin=1").fetchone()[0]))
con.close()
print("VERIFY_DONE:1")
'''.replace("__PWD__", ADMIN_PWD)

REMOTE = r"""
echo SERVICE:$(systemctl is-active study-workbench)
echo NRESTARTS:$(systemctl show -p NRestarts --value study-workbench)
echo ACTIVE_ENTER:$(systemctl show -p ActiveEnterTimestamp --value study-workbench)
echo SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)
echo HEALTH_NGINX:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/health)
echo ADMIN_VIA_NGINX:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/admin/contact)
echo ENV_BACKUP_EXISTS:$(test -f /opt/study-workbench/server/.env.bak-20260914c && echo YES || echo NO)
echo ENV_KEY_COUNT:$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=' /opt/study-workbench/server/.env)
echo ENV_KEYS:$(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' /opt/study-workbench/server/.env | tr -d '=' | sort | tr '\n' ',')
echo ADMIN_PWD_LINES:$(grep -c '^ADMIN_PASSWORD=' /opt/study-workbench/server/.env)
echo ADMIN_PY_MD5:$(md5sum /opt/study-workbench/server/routers/admin.py | cut -c1-32)
echo MAIN_HAS_ADMIN:$(grep -c 'admin.router' /opt/study-workbench/server/main.py)
echo DB_BACKUP:$(ls -l /opt/study-workbench/backups/data.db.before-20260914c 2>/dev/null | awk '{print $5}')
echo ---PROBE---
echo __B64__ | base64 -d | python3 -
echo JOURNAL_ERR:$(journalctl -u study-workbench --since '15 min ago' 2>/dev/null | grep -ci 'traceback\|exception' || true)
echo JOURNAL_TAIL:$(journalctl -u study-workbench -n 5 --no-pager 2>/dev/null | tr '\n' ' | ')
""".replace("__B64__", base64.b64encode(PROBE.encode("utf-8")).decode("ascii"))


def load_credentials():
    s = open(CRED, encoding="utf-8", errors="replace").read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    return m.group(2), m.group(1)


def main():
    host, pwd = load_credentials()
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, REMOTE],
                       capture_output=True, timeout=300)
    out = r.stdout.decode("utf-8", "replace")
    err = r.stderr.decode("utf-8", "replace")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("rc=%s\n" % r.returncode)
        f.write(out)
        f.write("\n---STDERR---\n" + err)
    print("rc=%s -> %s" % (r.returncode, OUT))
    print(out)


if __name__ == "__main__":
    main()
