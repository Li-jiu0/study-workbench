# -*- coding: utf-8 -*-
"""2026-09-13f 部署后验证：修复是否在线生效 + 版本核对。"""
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
echo "=== 1. 线上版本号分布（首页） ==="
curl -s http://127.0.0.1/ | grep -oE '[?&]v=20260913[a-f]' | sort | uniq -c
echo "=== 2. run 页：交卷是否改为 replace ==="
curl -s "http://127.0.0.1/mock_exam_run.html" | grep -c "location.replace('mock_exam_result"
echo "=== 3. run 页：是否仍有 location.href=result(应为0) ==="
curl -s "http://127.0.0.1/mock_exam_run.html" | grep -c "location.href = 'mock_exam_result"
echo "=== 4. result 页：返回箭头是否指向选卷页 ==="
curl -s "http://127.0.0.1/mock_exam_result.html" | grep -c 'href="mock_exam.html" class="xt-page-back"'
echo "=== 5. result 页：是否仍有 history.back(应为0) ==="
curl -s "http://127.0.0.1/mock_exam_result.html" | grep -c 'javascript:history.back()'
echo "=== 6. 三个模考页可达性 ==="
for p in mock_exam.html mock_exam_run.html mock_exam_result.html; do
  printf "%s: " "$p"
  curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "http://127.0.0.1/$p"
done
echo "=== 7. 四件套 + 用户数 ==="
echo "SITE:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)"
echo "HEALTH:$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health)"
echo "SERVICE:$(systemctl is-active study-workbench)"
echo "USERS:$(cd /opt/study-workbench/server && python3 -c "import sqlite3;print(sqlite3.connect('data.db').execute('select count(*) from users').fetchone()[0])")"
echo "=== 8. journalctl 异常计数 ==="
journalctl -u study-workbench --since -10min | grep -ciE 'traceback|exception|500 internal' || true
'''

r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, f"root@{host}", CMD],
                   capture_output=True, timeout=240)
out = r.stdout.decode("utf-8", "replace")
err = r.stderr.decode("utf-8", "replace")
print("rc=%d" % r.returncode)
print(out)
if err.strip():
    print("STDERR:", err[-500:])
with open(os.path.join(ROOT, "tools", "qa", "_b5f_verify.txt"), "w", encoding="utf-8") as f:
    f.write(out)
