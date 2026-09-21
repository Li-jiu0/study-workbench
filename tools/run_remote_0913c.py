# -*- coding: utf-8 -*-
"""通用远端执行器：把本地 .py 以 base64 送到服务器 /tmp 执行，输出写日志。
用法: python run_remote_0913c.py <local_script.py> <logfile>
"""
import base64, hashlib, os, re, subprocess, sys

ROOT = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8d0a1649"
CRED = r"D:\下载的文件\学习工作台\upload_v23.ps1"
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"

HOST = os.environ.get("SW_HOST", "")
PASS = os.environ.get("SW_PASS", "")
if not HOST or not PASS:
    s = open(CRED, encoding="utf-8", errors="replace").read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        raise SystemExit("no creds")
    PASS, HOST = m.group(1), m.group(2)


def md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(65536), b""):
            h.update(c)
    return h.hexdigest()


src_path = sys.argv[1]
log_path = sys.argv[2]
body = open(src_path, "rb").read()
b64 = base64.b64encode(body).decode("ascii")
remote = f"echo {b64} | base64 -d > /tmp/sw_remote.py && python3 /tmp/sw_remote.py; echo REMOTE_EXIT=$?"
r = subprocess.run([PLINK, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, f"root@{HOST}", remote],
                   capture_output=True, timeout=420)
out = r.stdout.decode("utf-8", "replace")
err = r.stderr.decode("utf-8", "replace")

# 本地参考 md5
extra = []
for rel in ("assets/data/vocab-cet4-ext.json", "assets/app.js",
            "assets/data/exam-bank-ext-index.json", "assets/data/listening-ext.json"):
    p = os.path.join(ROOT, rel.replace("/", os.sep))
    if os.path.isfile(p):
        extra.append(f"LOCAL_MD5 {rel} {md5(p)}")

text = ("===== REMOTE STDOUT =====\n" + out + "\n===== REMOTE STDERR =====\n" + err
        + "\n===== LOCAL REFS =====\n" + "\n".join(extra) + "\n")
open(log_path, "w", encoding="utf-8").write(text)
print("runner done rc=", r.returncode, "->", log_path)
