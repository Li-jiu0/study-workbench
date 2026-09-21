# -*- coding: utf-8 -*-
"""R44-C 部署前置侦察（只读，不改任何远端状态）。

用途：确认生产后端如何读取环境变量（systemd EnvironmentFile vs server/.env），
并摸清远端 server/ 目录现状（哪些 .py 缺失 / 与本地不一致），为部署脚本提供依据。

只读保证：全程只用 cat / ls / md5sum / systemctl show / curl GET，不写任何文件。
"""
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
PSCP = os.path.join(ROOT, "tools", "pscp.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_ROOT = "/opt/study-workbench"
SERVICE_NAME = "study-workbench"


def load_credentials():
    host = os.environ.get("SW_HOST", "")
    pwd = os.environ.get("SW_PASS", "")
    if not host or not pwd:
        s = open(CRED, encoding="utf-8", errors="replace").read()
        m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
        if not m:
            raise SystemExit("无法解析凭据: " + CRED)
        pwd, host = m.group(1), m.group(2)
    return host, pwd


def run(cmd, timeout=300):
    r = subprocess.run(cmd, capture_output=True, timeout=timeout)
    return (r.returncode,
            r.stdout.decode("utf-8", "replace"),
            r.stderr.decode("utf-8", "replace"))


def plink(remote, host, pwd, timeout=300):
    return run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                "root@" + host, remote], timeout)


REMOTE = r"""
echo "=== SYSTEMD UNIT FILE ==="
systemctl cat study-workbench 2>/dev/null | grep -v '^#\s*$' || echo "(systemctl cat failed)"
echo "=== UNIT FRAGMENT ENV ==="
systemctl show study-workbench -p EnvironmentFiles -p Environment -p ExecStart -p WorkingDirectory -p User 2>/dev/null
echo "=== SERVER DIR TOP ==="
ls -la /opt/study-workbench/server/ 2>/dev/null
echo "=== SERVER ROUTERS DIR ==="
ls -la /opt/study-workbench/server/routers/ 2>/dev/null
echo "=== REMOTE ADMIN.PY EXISTS? ==="
test -f /opt/study-workbench/server/routers/admin.py && echo ADMIN_PY_PRESENT || echo ADMIN_PY_MISSING
echo "=== REMOTE .ENV KEYS (只打印键名，不打印值) ==="
if [ -f /opt/study-workbench/server/.env ]; then
  grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' /opt/study-workbench/server/.env | tr -d '=' | sort
else
  echo "(no .env)"
fi
echo "=== REMOTE .ENV ADMIN_PASSWORD SET? ==="
grep -c '^ADMIN_PASSWORD=' /opt/study-workbench/server/.env 2>/dev/null || echo 0
echo "=== REMOTE SERVER MD5 (top-level py) ==="
cd /opt/study-workbench/server && md5sum *.py 2>/dev/null
echo "=== REMOTE SERVER MD5 (routers py) ==="
cd /opt/study-workbench/server && md5sum routers/*.py 2>/dev/null
echo "=== PROCESS ENV ADMIN_PASSWORD? (1=set in process env) ==="
PID=$(systemctl show -p MainPID --value study-workbench)
echo "MAINPID:$PID"
if [ -n "$PID" ] && [ "$PID" != "0" ] && [ -r /proc/$PID/environ ]; then
  tr '\0' '\n' < /proc/$PID/environ | grep -c '^ADMIN_PASSWORD=' || echo 0
else
  echo "ENVIRON_UNREADABLE"
fi
echo "=== ADMIN ROUTES PROBE (no token) ==="
for p in contact overview users online feedback; do
  echo "ADMIN_NOAUTH_${p}:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/admin/${p})"
done
echo "=== HEALTH ==="
echo "HEALTH:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health)"
echo "=== USERS TABLE ==="
cd /opt/study-workbench/server && python3 -c "
import sqlite3
c = sqlite3.connect('data.db')
cols = [r[1] for r in c.execute('PRAGMA table_info(users)')]
print('USERS_COLS:', ','.join(cols))
print('HAS_IS_ADMIN:', 'is_admin' in cols)
print('USERS_COUNT:', c.execute('select count(*) from users').fetchone()[0])
try:
    rows = c.execute('select id, username, is_admin from users order by id').fetchall()
    for r in rows:
        print('ROW:', r[0], r[1], r[2])
except Exception as e:
    print('ROW_ERR:', e)
"
echo "=== PREFLIGHT-END ==="
"""


def main():
    host, pwd = load_credentials()
    rc, out, err = plink(REMOTE, host, pwd, timeout=300)
    dest = os.path.join(ROOT, "tools", "qa", "_r44c_preflight_out.txt")
    with open(dest, "w", encoding="utf-8") as f:
        f.write("rc=%s\n" % rc)
        f.write(out)
        f.write("\n---STDERR---\n")
        f.write(err)
    print("rc=%s -> %s" % (rc, dest))
    print(out)


if __name__ == "__main__":
    main()
