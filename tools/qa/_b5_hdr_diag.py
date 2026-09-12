# -*- coding: utf-8 -*-
"""诊断：/assets/data/ 的 Cache-Control 是否生效（全头输出）。"""
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
echo "=== 站点配置尾部 ==="
sed -n '1,40p' /etc/nginx/sites-available/study-workbench
echo "=== 全响应头：/assets/data/*.json ==="
curl -s -D - -o /dev/null "http://127.0.0.1/assets/data/vocab-cet4-ext-index.json"
echo "=== 全响应头：/assets/app.js ==="
curl -s -D - -o /dev/null "http://127.0.0.1/assets/app.js"
echo "=== 带 gzip 的请求头 ==="
curl -s -D - -o /dev/null -H "Accept-Encoding: gzip" "http://127.0.0.1/assets/data/vocab-cet4-ext-index.json"
'''

r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, f"root@{host}", CMD],
                   capture_output=True, timeout=180)
print(r.stdout.decode("utf-8", "replace"))
e = r.stderr.decode("utf-8", "replace")
if e.strip():
    print("STDERR:", e[-400:])
