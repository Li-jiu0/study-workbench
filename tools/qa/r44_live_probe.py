# -*- coding: utf-8 -*-
"""R44 生产环境只读取证驱动脚本（只读：不写库、不改文件、不重启服务、不打印密码/JWT 明文）。

用法：python tools/qa/r44_live_probe.py
输出：tools/qa/r44_live_out.txt
"""
import base64
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_live_out.txt")
# 线上管理员候选密码（本地默认口令；不打印）
ADMIN_PWD = os.environ.get("SW_ADMIN_PWD", "xingtu2026")


def load_credentials():
    """从 upload_v23.ps1 惰性读取主机与口令（仅用于 plink 传参，绝不落盘）。"""
    host = os.environ.get("SW_HOST", "")
    pwd = os.environ.get("SW_PASS", "")
    if not host or not pwd:
        s = open(CRED, encoding="utf-8", errors="replace").read()
        m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
        if not m:
            raise SystemExit("凭据不可得：请设置 SW_HOST/SW_PASS 或检查 " + CRED)
        pwd, host = m.group(1), m.group(2)
    return host, pwd


REMOTE_PY = r'''# -*- coding: utf-8 -*-
import json
import re
import sqlite3
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
PWD = "__PWD__"
DB = "/opt/study-workbench/server/data.db"


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


print("=== A. 服务与站点状态 ===")
st, _ = req("GET", "/api/health")
print("HEALTH:", st)

print("")
print("=== B. 用户库（只读 SELECT）===")
try:
    con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True)
    cols = [r[1] for r in con.execute("PRAGMA table_info(users)")]
    print("USER_COLS:", ",".join(cols))
    hashcol = None
    for c in cols:
        if "pass" in c.lower() or "hash" in c.lower():
            hashcol = c
            break
    print("HASH_COL:", hashcol)
    total = con.execute("select count(*) from users").fetchone()[0]
    print("USERS_TOTAL:", total)
    q = "select * from users"
    rows = con.execute(q).fetchall()
    idx = {c: i for i, c in enumerate(cols)}
    for r in rows:
        uname = r[idx.get("username", 1)] if "username" in idx else "?"
        isadm = r[idx["is_admin"]] if "is_admin" in idx else "NO_COL"
        mark = ""
        if "username" in idx and "\u7ba1\u7406\u5458" in str(uname):
            mark = " <<< 含管理员"
        if isadm in (1, True):
            mark += " <<< is_admin=1"
        line = "ROW id=%s username=%r is_admin=%s" % (
            r[idx["id"]] if "id" in idx else "?", uname, isadm)
        if hashcol and hashcol in idx:
            hv = r[idx[hashcol]] or ""
            line += " %s=[%s...] len=%d" % (hashcol, str(hv)[:8], len(str(hv)))
        print(line + mark)
    con.close()
except Exception as e:
    print("DB_EXC: %r" % (e,))

print("")
print("=== C. 登录接口实测 ===")
st, body = req("POST", "/api/auth/login",
               {"username": "\u7ba1\u7406\u5458", "password": PWD})
print("LOGIN_STATUS:", st)
print("LOGIN_BODY:", mask(body)[:1200])
tok = ""
try:
    tok = (json.loads(body) or {}).get("token", "") or ""
except Exception:
    tok = ""
print("LOGIN_GOT_TOKEN:", "YES(len=%d)" % len(tok) if tok else "NO")

print("")
print("=== D. /api/admin/contact 无 Authorization ===")
st2, b2 = req("GET", "/api/admin/contact")
print("CONTACT_NOAUTH_STATUS:", st2)
print("CONTACT_NOAUTH_BODY:", mask(b2)[:800])

print("")
print("=== E. /api/admin/contact 带管理员 token ===")
if tok:
    st3, b3 = req("GET", "/api/admin/contact", token=tok)
    print("CONTACT_AUTH_STATUS:", st3)
    print("CONTACT_AUTH_BODY:", mask(b3)[:800])
    try:
        d = json.loads(b3)
        if isinstance(d, dict):
            print("CONTACT_FIELDS:", ",".join(sorted(d.keys())))
        else:
            print("CONTACT_FIELDS: NON-DICT type=%s" % type(d).__name__)
    except Exception:
        print("CONTACT_FIELDS: 非 JSON")
else:
    print("CONTACT_AUTH: 跳过（未拿到 token）")

print("")
print("=== F. chat / 会话相关表结构（Bug C 线索，只读）===")
try:
    con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True)
    tabs = [r[0] for r in con.execute(
        "select name from sqlite_master where type='table' order by name")]
    print("TABLES:", ",".join(tabs))
    for t in tabs:
        tl = t.lower()
        if any(k in tl for k in ("chat", "message", "convers", "session", "friend")):
            cs = [r[1] for r in con.execute("PRAGMA table_info(%s)" % t)]
            n = con.execute("select count(*) from %s" % t).fetchone()[0]
            print("TABLE %s rows=%d cols=%s" % (t, n, ",".join(cs)))
    con.close()
except Exception as e:
    print("CHAT_DB_EXC: %r" % (e,))
'''.replace("__PWD__", ADMIN_PWD)


def main():
    host, pwd = load_credentials()
    b64 = base64.b64encode(REMOTE_PY.encode("utf-8")).decode("ascii")
    remote = (
        "echo SERVICE:$(systemctl is-active study-workbench)\n"
        "echo ---PY---\n"
        "echo " + b64 + " | base64 -d | python3 -\n"
        "echo ---LOG-BEGIN---\n"
        "journalctl -u study-workbench --since '2 hours ago' --no-pager 2>/dev/null "
        "| grep -Ei 'admin/contact|admin\\\\.contact|Traceback|ERROR|500|Exception' "
        "| tail -n 60\n"
        "echo ---LOG-END---\n"
    )
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, remote],
                       capture_output=True, timeout=420)
    out = r.stdout.decode("utf-8", "replace")
    err = r.stderr.decode("utf-8", "replace")
    text = ("RC=%s\n" % r.returncode) + out + ("\nSTDERR:\n" + err[-500:] if err.strip() else "")
    # 二次脱敏：确保任何口令/JWT 不落盘
    for secret in {pwd, ADMIN_PWD}:
        if secret:
            text = text.replace(secret, "<已省略>")
    text = re.sub(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-\.]+", "<省略JWT>", text)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    print("WROTE " + OUT + " bytes=%d" % len(text))


if __name__ == "__main__":
    main()
