# -*- coding: utf-8 -*-
"""R44 第十轮：生产已重新部署并重启（02:36:51），复验管理员链路真实状态（只读）。

口令从远端 .env 内读取并直接用于登录，全程不打印明文；token 全程留在远端并脱敏。

用法：python tools/qa/r44_probe10.py
输出：tools/qa/r44_probe10_out.txt
"""
import base64
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_probe10_out.txt")


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
import json
import re
import sqlite3
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
ENV = "/opt/study-workbench/server/.env"


def envval(k):
    try:
        for line in open(ENV, encoding="utf-8", errors="replace"):
            m = re.match(r"\s*%s\s*=\s*(.*)$" % k, line)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    except Exception:
        pass
    return ""


PWD = envval("ADMIN_PASSWORD")
UNAME = envval("ADMIN_USERNAME") or "\u7ba1\u7406\u5458"


def req(method, path, body=None, token=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=25) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, "EXC:%r" % (e,)


def mask(s):
    s = re.sub(r'"(token|refreshToken|access_token)":\s*"[^"]*"',
               lambda m: '"%s":"<省略>"' % m.group(1), s)
    s = re.sub(r'"(password|password_hash|passwordHash)":\s*"[^"]*"',
               lambda m: '"%s":"<省略>"' % m.group(1), s)
    return s


print("=== 0. 环境 ===")
print("ADMIN_USERNAME_USED:", UNAME)
print("ADMIN_PASSWORD_LEN:", len(PWD))

print("")
print("=== 1. 登录（用户名=%s，口令取自 .env）===" % UNAME)
st, body = req("POST", "/api/auth/login", {"username": UNAME, "password": PWD})
print("LOGIN_STATUS:", st)
print("LOGIN_BODY:", mask(body)[:600])
tok = ""
try:
    d = json.loads(body)
    tok = d.get("token", "") or ""
    print("LOGIN_IS_ADMIN:", d.get("isAdmin"), "/", d.get("is_admin"))
except Exception:
    pass
print("GOT_TOKEN:", "YES" if tok else "NO")

print("")
print("=== 2. /api/admin/contact 无 Authorization ===")
print("STATUS:", req("GET", "/api/admin/contact")[0])

print("")
print("=== 3. /api/admin/contact 带管理员 token ===")
if tok:
    st3, b3 = req("GET", "/api/admin/contact", token=tok)
    print("STATUS:", st3)
    print("BODY:", mask(b3)[:400])
    try:
        d = json.loads(b3)
        print("FIELDS:", ",".join(sorted(d.keys())) if isinstance(d, dict)
              else "NON-DICT:%s" % type(d).__name__)
    except Exception:
        print("FIELDS: 非 JSON")
else:
    print("SKIP（无 token）")

print("")
print("=== 4. /api/auth/me 带 token（确认 isAdmin 双写）===")
if tok:
    st4, b4 = req("GET", "/api/auth/me", token=tok)
    print("STATUS:", st4)
    print("BODY:", mask(b4)[:400])

print("")
print("=== 5. 生产用户库当前状态（只读）===")
try:
    con = sqlite3.connect("file:/opt/study-workbench/server/data.db?mode=ro", uri=True)
    cols = [r[1] for r in con.execute("PRAGMA table_info(users)")]
    print("HAS_IS_ADMIN_COL:", "YES" if "is_admin" in cols else "NO")
    print("USERS_TOTAL:", con.execute("select count(*) from users").fetchone()[0])
    if "is_admin" in cols:
        for r in con.execute(
                "select id, username, is_admin, substr(password_hash,1,8), "
                "length(password_hash) from users where is_admin=1"):
            print("  ADMIN_ROW id=%s username=%r is_admin=%s hash=[%s...] len=%s" % r)
        n = con.execute("select count(*) from users where is_admin=1").fetchone()[0]
        print("  ADMIN_COUNT:", n)
    con.close()
except Exception as e:
    print("DB_EXC: %r" % (e,))

print("")
print("=== 6. 生产 chat.py 是否仍缺管理员放行（关键剩余风险）===")
try:
    t = open("/opt/study-workbench/server/routers/chat.py",
             encoding="utf-8", errors="replace").read()
    print("  has can_message :", "can_message" in t)
    print("  has is_friend   :", "is_friend" in t)
    print("  has is_admin    :", "is_admin" in t)
    for m in re.finditer(r"if not (\w+)\(db, user\.id, peer_id\):", t):
        print("  GATE:", m.group(0))
except Exception as e:
    print("  CHAT_READ_EXC: %r" % (e,))
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
    text = re.sub(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-\.]+", "<省略JWT>", text)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    print("WROTE " + OUT)


if __name__ == "__main__":
    main()
