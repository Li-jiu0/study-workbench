# -*- coding: utf-8 -*-
"""R44 第五轮：应 kou-r44-client 要求，带 token 实测接口状态 + 拉取生产 /api/chat/unread 源码（只读）。

用法：python tools/qa/r44_probe5.py
输出：tools/qa/r44_probe5_out.txt
"""
import hashlib
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_probe5_out.txt")
# 故意无效的假 token（非真实凭据，仅用于区分「路由不存在 404」与「鉴权未通过 401」）
FAKE = "INVALID.TEST.TOKEN.NOT.A.REAL.JWT"


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


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


REMOTE = r'''
echo "=== 1. 带（无效）Bearer 的状态码对照：401=路由存在 / 404=路由不存在 ==="
for p in /api/auth/me /api/chat/unread /api/admin/contact /api/admin/users /api/admin/users/1 /api/admin/online; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer __FAKE__' http://127.0.0.1:8000$p)"
done
echo ""
echo "=== 2. 同上，但走 nginx 80 端口（与浏览器一致）==="
for p in /api/admin/contact /api/chat/unread; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer __FAKE__' http://127.0.0.1$p)"
done
echo ""
echo "=== 3. 生产 chat.py 的 /unread 实现（peerId 类型的权威来源）==="
python3 - <<'PYEOF'
t = open("/opt/study-workbench/server/routers/chat.py", encoding="utf-8", errors="replace").read()
i = t.find('@router.get("/unread")')
j = t.find('@router.post("/{peer_id}/read")')
print(t[i:j if j > i else i + 1800])
PYEOF
echo ""
echo "=== 4. 生产 chat.py MD5 与文件大小 ==="
md5sum /opt/study-workbench/server/routers/chat.py
stat -c '%s %y' /opt/study-workbench/server/routers/chat.py
echo ""
echo "=== 5. 生产库中 Message.sender_id 的列类型（决定 peerId 是 number 还是 string）==="
python3 - <<'PYEOF'
import sqlite3
con = sqlite3.connect("file:/opt/study-workbench/server/data.db?mode=ro", uri=True)
for r in con.execute("PRAGMA table_info(messages)"):
    if r[1] in ("sender_id", "receiver_id", "id"):
        print("COL", r[1], "type=", r[2])
print("SAMPLE_SENDER_ID_VALUES:",
      [r[0] for r in con.execute("select distinct sender_id from messages limit 8")])
print("PY_TYPES:", set(type(r[0]).__name__
                       for r in con.execute("select sender_id from messages limit 50")))
con.close()
PYEOF
'''.replace("__FAKE__", FAKE)


def main():
    host, pwd = load_credentials()
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, REMOTE],
                       capture_output=True, timeout=300)
    text = r.stdout.decode("utf-8", "replace")
    if r.stderr.strip():
        text += "\nSTDERR:\n" + r.stderr.decode("utf-8", "replace")[-500:]
    text = text.replace(pwd, "<已省略>")
    local_chat = os.path.join(ROOT, "server", "routers", "chat.py")
    text += ("\n=== 6. 本地 chat.py MD5（与上面生产 MD5 比对）===\n%s  %s\n"
             % (md5(local_chat), local_chat))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    print("WROTE " + OUT)


if __name__ == "__main__":
    main()
