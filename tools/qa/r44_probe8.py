# -*- coding: utf-8 -*-
"""R44 第八轮：应 kou-r44-server 要求，核实 feedback_public 私有符号 + .env 配置（只读，不打印口令值）。

用法：python tools/qa/r44_probe8.py
输出：tools/qa/r44_probe8_out.txt
"""
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_probe8_out.txt")


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
echo "=== 1. 生产 feedback_public.py：admin.py 依赖的三个私有符号是否存在 ==="
python3 - <<'PYEOF'
import re
p = "/opt/study-workbench/server/routers/feedback_public.py"
try:
    t = open(p, encoding="utf-8", errors="replace").read()
except Exception as e:
    print("READ_FAIL: %r" % (e,)); raise SystemExit
print("FILE_BYTES:", len(t))
for sym in ("_load_all", "_write_lock", "_save_all"):
    m = re.search(r"^def\s+%s\b" % re.escape(sym), t, re.M)
    m2 = re.search(r"^%s\s*=" % re.escape(sym), t, re.M)
    print("  %-12s def=%s  assign=%s" % (sym, "YES" if m else "NO",
                                         "YES" if m2 else "NO"))
print("  ---- 文件内所有顶层 def ----")
for m in re.finditer(r"^def\s+(\w+)", t, re.M):
    print("   def", m.group(1))
PYEOF

echo ""
echo "=== 2. .env / systemd 环境变量（只报是否设置，绝不打印值）==="
F=/opt/study-workbench/server/.env
if [ -f "$F" ]; then
  echo "ENV_FILE: YES"
  for k in ADMIN_USERNAME ADMIN_PASSWORD; do
    v=$(grep -E "^[[:space:]]*$k[[:space:]]*=" "$F" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r')
    if [ -n "$v" ]; then echo "  $k: SET(len=${#v})"; else echo "  $k: EMPTY_OR_ABSENT"; fi
  done
else
  echo "ENV_FILE: NO"
fi
echo "SYSTEMD_ENV:"
systemctl show -p Environment -p EnvironmentFiles --value study-workbench 2>/dev/null
grep -nE "^Environment" /etc/systemd/system/study-workbench.service 2>/dev/null

echo ""
echo "=== 3. 生产 auth.py 是否含 is_admin / isAdmin 双写（Bug D 入口显示依赖）==="
grep -c "is_admin\|isAdmin" /opt/study-workbench/server/routers/auth.py 2>/dev/null
echo "  (0 = 无，即旧版)"

echo ""
echo "=== 4. 生产 database.py 是否含 is_admin_user / can_message（混部署 ImportError 风险）==="
python3 - <<'PYEOF'
t = open("/opt/study-workbench/server/database.py", encoding="utf-8", errors="replace").read()
for sym in ("is_admin_user", "can_message"):
    print("  %-14s %s" % (sym, "YES" if ("def " + sym) in t else "NO"))
PYEOF

echo ""
echo "=== 5. /api/feedback/mine 现状（kou-r44-server 提到）==="
echo "/api/feedback/mine -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/feedback/mine)"
echo "/api/health        -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/health)"
'''


def main():
    host, pwd = load_credentials()
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, REMOTE],
                       capture_output=True, timeout=300)
    text = r.stdout.decode("utf-8", "replace")
    if r.stderr.strip():
        text += "\nSTDERR:\n" + r.stderr.decode("utf-8", "replace")[-500:]
    text = text.replace(pwd, "<已省略>")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    print("WROTE " + OUT)


if __name__ == "__main__":
    main()
