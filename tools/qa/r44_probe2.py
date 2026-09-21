# -*- coding: utf-8 -*-
"""R44 生产只读取证第二轮：确认远端 server/ 代码是否含 admin 路由（只读）。

用法：python tools/qa/r44_probe2.py
输出：tools/qa/r44_probe2_out.txt
"""
import base64
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_probe2_out.txt")


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


REMOTE = r'''
echo "=== 1. service unit ==="
systemctl show -p FragmentPath -p ExecStart --value study-workbench 2>/dev/null
echo "UNIT_FILE:"
cat "$(systemctl show -p FragmentPath --value study-workbench 2>/dev/null)" 2>/dev/null | grep -Ei "ExecStart|WorkingDirectory|Environment" | head -20
echo ""
echo "=== 2. 端口 ==="
ss -ltnp 2>/dev/null | grep -E "8000|8001|80\b" | head -10
echo ""
echo "=== 3. server/routers 目录 ==="
ls -la /opt/study-workbench/server/routers/ 2>&1 | head -40
echo ""
echo "=== 4. grep admin/contact（远端 server 代码）==="
grep -rn "admin/contact" /opt/study-workbench/server/ 2>/dev/null | head -10
echo "GREP_CONTACT_RC=$?"
echo ""
echo "=== 5. grep is_admin / ensure_admin_user（远端 server 代码）==="
grep -rln "ensure_admin_user" /opt/study-workbench/server/ 2>/dev/null | head -10
grep -rln "is_admin" /opt/study-workbench/server/ 2>/dev/null | head -10
echo ""
echo "=== 6. 已注册路由清单（远端 main.py）==="
grep -nE "include_router|APIRouter\(prefix" /opt/study-workbench/server/main.py 2>/dev/null | head -40
echo ""
echo "=== 7. 远端代码/包时间戳 ==="
stat -c '%y  %n' /opt/study-workbench/server/main.py /opt/study-workbench/server/routers/*.py 2>/dev/null | tail -25
echo ""
echo "=== 8. 进程启动时间 ==="
systemctl show -p ExecMainStartTimestamp --value study-workbench 2>/dev/null
ps -o pid,lstart,etime,cmd -p "$(systemctl show -p MainPID --value study-workbench 2>/dev/null)" 2>/dev/null | head -5
echo ""
echo "=== 9. OpenAPI 里有没有 /api/admin/* ==="
curl -s http://127.0.0.1:8000/openapi.json 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
except Exception as e:
    print('OPENAPI_PARSE_FAIL:%r'%(e,)); sys.exit()
ps=sorted(d.get('paths',{}).keys())
print('TOTAL_PATHS:',len(ps))
print('ADMIN_PATHS:', ','.join([p for p in ps if '/admin' in p]) or 'NONE')
print('AUTH_PATHS:', ','.join([p for p in ps if '/auth' in p]) or 'NONE')
print('CONTACT_IN_OPENAPI:', 'YES' if any('contact' in p for p in ps) else 'NO')
for p in ps:
    if 'contact' in p or '/admin' in p: print('  ',p, ','.join(sorted(d['paths'][p].keys())))
"
echo ""
echo "=== 10. 各 admin 端点真实状态码（区分 404 vs 401/403）==="
for p in /api/admin/contact /api/admin/overview /api/admin/users /api/admin/online /api/admin/feedback /api/health; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000$p)"
done
echo ""
echo "=== 11. 进程实际加载的 main.py（cwd + 文件）==="
PID=$(systemctl show -p MainPID --value study-workbench 2>/dev/null)
echo "MainPID=$PID"
cat /proc/$PID/cmdline 2>/dev/null | tr '\0' ' '; echo
ls -l /proc/$PID/cwd 2>/dev/null
'''


def main():
    host, pwd = load_credentials()
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, REMOTE],
                       capture_output=True, timeout=420)
    out = r.stdout.decode("utf-8", "replace")
    err = r.stderr.decode("utf-8", "replace")
    text = ("RC=%s\n" % r.returncode) + out + ("\nSTDERR:\n" + err[-800:] if err.strip() else "")
    text = text.replace(pwd, "<已省略>")
    text = re.sub(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-\.]+", "<省略JWT>", text)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    print("WROTE " + OUT + " bytes=%d" % len(text))


if __name__ == "__main__":
    main()
