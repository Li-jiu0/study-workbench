# -*- coding: utf-8 -*-
"""R44 第九轮：复验生产当前状态（第八轮与早轮结论冲突，需确认是否有部署介入）+ 口令候选比对（不打印明文）。

用法：python tools/qa/r44_probe9.py
输出：tools/qa/r44_probe9_out.txt
"""
import hashlib
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_probe9_out.txt")


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


# 本地 admin.py 的内置默认口令（只取来做 md5 候选比对，不打印）
def local_default_pwd():
    t = open(os.path.join(ROOT, "server", "routers", "admin.py"),
             encoding="utf-8", errors="replace").read()
    m = re.search(r'_ADMIN_DEFAULT_PASSWORD\s*=\s*["\']([^"\']*)["\']', t)
    return m.group(1) if m else ""


CANDIDATES = {}


def build_remote():
    d = local_default_pwd()
    cands = {"<local _ADMIN_DEFAULT_PASSWORD>": d, "xingtu2026": "xingtu2026"}
    CANDIDATES.update({hashlib.md5(v.encode()).hexdigest(): k for k, v in cands.items()})
    lines = []
    for i, (k, v) in enumerate(cands.items()):
        lines.append('C%d_MD5_%s' % (i, hashlib.md5(v.encode()).hexdigest()))
    return "\n".join(lines)


REMOTE_TAIL = r'''
echo "=== 6. 生产 .env 中 ADMIN_PASSWORD 的 MD5（用于候选比对，不打印明文）==="
F=/opt/study-workbench/server/.env
v=$(grep -E "^[[:space:]]*ADMIN_PASSWORD[[:space:]]*=" "$F" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r')
u=$(grep -E "^[[:space:]]*ADMIN_USERNAME[[:space:]]*=" "$F" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r')
echo "ADMIN_PASSWORD_MD5:$(printf '%s' "$v" | md5sum | cut -d' ' -f1)"
echo "ADMIN_USERNAME_LEN:${#u}"
echo "ADMIN_PASSWORD_LEN:${#v}"
'''

REMOTE = r'''
echo "=== A. 当前 admin.py 是否已存在 ==="
ls -la /opt/study-workbench/server/routers/admin.py 2>&1 | head -3
echo ""
echo "=== B. main.py mtime + 是否 include admin router ==="
stat -c '%y %s' /opt/study-workbench/server/main.py
grep -n "admin" /opt/study-workbench/server/main.py | head -10
echo ""
echo "=== C. 服务启动时间 / PID（判断是否被重启过）==="
systemctl show -p ExecMainStartTimestamp --value study-workbench 2>/dev/null
systemctl show -p MainPID --value study-workbench 2>/dev/null
echo ""
echo "=== D. 关键接口当前状态码 ==="
for p in /api/health /api/admin/contact /api/admin/users /api/feedback/mine /api/chat/unread; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000$p)"
done
echo ""
echo "=== E. 各文件 is_admin / isAdmin 命中数（复验早轮结论）==="
for f in auth.py database.py users.py chat.py; do
  echo "  $f: $(grep -c 'is_admin\|isAdmin' /opt/study-workbench/server/routers/$f 2>/dev/null || grep -c 'is_admin\|isAdmin' /opt/study-workbench/server/$f 2>/dev/null)"
done
echo ""
echo "=== F. 远端 OpenAPI 中 admin / feedback 路径 ==="
curl -s http://127.0.0.1:8000/openapi.json | python3 -c "
import sys,json
d=json.load(sys.stdin); ps=sorted(d.get('paths',{}).keys())
print('  ADMIN:', ','.join(p for p in ps if '/admin' in p) or 'NONE')
print('  FEEDBACK:', ','.join(p for p in ps if 'feedback' in p) or 'NONE')
print('  TOTAL:', len(ps))
"
'''


def main():
    host, pwd = load_credentials()
    remote = REMOTE + "\n" + REMOTE_TAIL + "\n" + build_remote() + "\n"
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, remote],
                       capture_output=True, timeout=300)
    text = r.stdout.decode("utf-8", "replace")
    if r.stderr.strip():
        text += "\nSTDERR:\n" + r.stderr.decode("utf-8", "replace")[-500:]
    text = text.replace(pwd, "<已省略>")
    # 用 md5 反查候选名（不明文输出）
    def repl(m):
        return m.group(0) + "  <=> " + CANDIDATES.get(m.group(1), "未知候选")
    text = re.sub(r"ADMIN_PASSWORD_MD5:([0-9a-f]{32})", repl, text)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    print("WROTE " + OUT)


if __name__ == "__main__":
    main()
