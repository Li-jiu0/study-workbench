# -*- coding: utf-8 -*-
"""批次五部署后：在线内容核对 + 真实链路探针（不打印任何凭据）。"""
import os
import re
import subprocess
import sys

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
        if not m:
            raise SystemExit("凭据未找到")
        pwd, host = m.group(1), m.group(2)
    return host, pwd


host, pwd = creds()


def remote(cmd, timeout=240):
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY, f"root@{host}", cmd],
                       capture_output=True, timeout=timeout)
    return r.returncode, r.stdout.decode("utf-8", "replace"), r.stderr.decode("utf-8", "replace")


CMD = r'''
echo "=== 1. 首页版本号分布 ==="
curl -s http://127.0.0.1/ | grep -oE '[?&]v=20260913[a-z]' | sort | uniq -c
echo "=== 2. 词库索引(远端) 头部 ==="
curl -s "http://127.0.0.1/assets/data/vocab-cet4-ext-index.json" | head -c 260
echo ""
echo "=== 3. 词库分片可达性(HTTP码+字节) ==="
for s in a-c d-f g-i j-l m-o p-r s-u v-z; do
  printf "%s: " "$s"
  curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "http://127.0.0.1/assets/data/vocab-cet4-ext-$s.json"
done
echo "=== 4. app.js 远端 MD5 ==="
md5sum /opt/study-workbench/web/assets/app.js /opt/study-workbench/web/assets/data/vocab-cet4-ext-index.json
echo "=== 5. 探针 register ==="
curl -s -o /tmp/_r5.json -w "%{http_code}" -X POST http://127.0.0.1:8000/api/auth/register -H "Content-Type: application/json" -d '{"username":"b5probe01","password":"Probe12345","nickname":"B5探针"}'
echo ""
cat /tmp/_r5.json; echo ""
echo "=== 6. 探针 login ==="
curl -s -o /tmp/_l5.json -w "%{http_code}" -X POST http://127.0.0.1:8000/api/auth/login -H "Content-Type: application/json" -d '{"username":"b5probe01","password":"Probe12345"}'
echo ""
cat /tmp/_l5.json; echo ""
echo "=== 7. 探针 me（带 token）==="
TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/_l5.json')).get('access_token') or json.load(open('/tmp/_l5.json')).get('token') or '')" 2>/dev/null)
echo "token_len=${#TOKEN}"
curl -s -o /tmp/_m5.json -w "%{http_code}" http://127.0.0.1:8000/api/auth/me -H "Authorization: Bearer $TOKEN"; echo ""
cat /tmp/_m5.json; echo ""
echo "=== 8. 隐私边界：GET /api/users/1 字段 ==="
curl -s http://127.0.0.1:8000/api/users/1 | python3 -c "import sys,json; d=json.load(sys.stdin); ks=set(d.keys()); bad=[k for k in ('phone','gender','birthday','email') if k in ks]; print('KEYS:',sorted(ks)); print('LEAK:',bad)" 2>&1
echo "=== 9. journalctl 最近10分钟异常计数 ==="
journalctl -u study-workbench --since -10min | grep -ciE 'traceback|exception|500 internal' || true
echo "=== 10. 当前用户列表 ==="
cd /opt/study-workbench/server && python3 -c "
import sqlite3
c=sqlite3.connect('data.db')
for r in c.execute('select id,username,nickname from users order by id'):
    print(r)
print('COUNT:', c.execute('select count(*) from users').fetchone()[0])
"
'''

rc, out, err = remote(CMD)
print("rc=%d" % rc)
print(out)
if err.strip():
    print("STDERR:", err[-500:])
with open(os.path.join(ROOT, "tools", "qa", "_b5_postdeploy.txt"), "w", encoding="utf-8") as f:
    f.write(out)
