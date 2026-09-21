# -*- coding: utf-8 -*-
"""R44 第十一轮：确认回滚基线存在 + 全量 26 文件部署后的回归检查（只读，不打印口令值）。

用法：python tools/qa/r44_probe11.py
输出：tools/qa/r44_probe11_out.txt
"""
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_probe11_out.txt")


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
echo "=== A. 回滚基线：备份文件是否存在 ==="
ls -la /opt/study-workbench/backups/ 2>/dev/null | tail -8
echo "---"
ls -la /opt/study-workbench/server/.env.bak-* 2>/dev/null | tail -5
echo ""

echo "=== B. .env 结构（只统计键名与行数，不打印值）==="
F=/opt/study-workbench/server/.env
echo "ENV_LINES: $(wc -l < $F)"
echo "ENV_KEYS:"
grep -oE "^[[:space:]]*[A-Z_]+[[:space:]]*=" "$F" 2>/dev/null | tr -d ' =' | sort
echo "BAK_LINES: $(wc -l < /opt/study-workbench/server/.env.bak-20260914c 2>/dev/null || echo NA)"
echo "BAK_KEYS:"
grep -oE "^[[:space:]]*[A-Z_]+[[:space:]]*=" /opt/study-workbench/server/.env.bak-20260914c 2>/dev/null | tr -d ' =' | sort
echo ""

echo "=== C. 服务状态（重启后是否稳定）==="
echo "ACTIVE: $(systemctl is-active study-workbench)"
echo "START : $(systemctl show -p ExecMainStartTimestamp --value study-workbench)"
echo "PID   : $(systemctl show -p MainPID --value study-workbench)"
echo "NRESTARTS: $(systemctl show -p NRestarts --value study-workbench)"
echo ""

echo "=== D. 重启后日志：Traceback / ERROR / 500 回归检查 ==="
echo "TRACEBACK_COUNT: $(journalctl -u study-workbench --since '2026-09-14 02:36' --no-pager 2>/dev/null | grep -ci 'traceback' || echo 0)"
echo "ERROR_COUNT: $(journalctl -u study-workbench --since '2026-09-14 02:36' --no-pager 2>/dev/null | grep -ci 'ERROR' || echo 0)"
echo "HTTP500_COUNT: $(journalctl -u study-workbench --since '2026-09-14 02:36' --no-pager 2>/dev/null | grep -c 'HTTP/1.[01]\" 500' || echo 0)"
echo "HTTP4XX_COUNT: $(journalctl -u study-workbench --since '2026-09-14 02:36' --no-pager 2>/dev/null | grep -cE 'HTTP/1.[01]\" (40[0-9]|50[0-9])' || echo 0)"
echo "--- 最近 15 条 4xx/5xx 明细 ---"
journalctl -u study-workbench --since '2026-09-14 02:36' --no-pager 2>/dev/null | grep -E 'HTTP/1.[01]" (40[0-9]|50[0-9])' | tail -15
echo ""

echo "=== E. 关键端点当前状态 ==="
for p in /api/health /api/admin/contact /api/admin/users /api/admin/overview /api/admin/online /api/admin/feedback /api/auth/me /api/chat/unread /api/feedback/mine; do
  echo "  $p -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000$p)"
done
echo ""

echo "=== F. 站点首页与关键静态资源 ==="
for p in / /assets/admin-contact.js /assets/chat-local.js /data/mock-papers.js; do
  echo "  $p -> $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1$p")"
done
echo ""

echo "=== G. 数据完整性（只读）==="
python3 - <<'PYEOF'
import sqlite3
con = sqlite3.connect("file:/opt/study-workbench/server/data.db?mode=ro", uri=True)
for t in ("users", "messages", "notes", "friends", "moments", "feedbacks", "study_logs"):
    try:
        print("  %-12s %s" % (t, con.execute("select count(*) from %s" % t).fetchone()[0]))
    except Exception as e:
        print("  %-12s ERR %r" % (t, e))
cols = [r[1] for r in con.execute("PRAGMA table_info(users)")]
print("  users.has_is_admin:", "YES" if "is_admin" in cols else "NO")
print("  admin rows:", con.execute("select count(*) from users where is_admin=1").fetchone()[0])
con.close()
PYEOF
'''


def main():
    host, pwd = load_credentials()
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, REMOTE],
                       capture_output=True, timeout=360)
    text = r.stdout.decode("utf-8", "replace")
    if r.stderr.strip():
        text += "\nSTDERR:\n" + r.stderr.decode("utf-8", "replace")[-800:]
    text = text.replace(pwd, "<已省略>")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    print("WROTE " + OUT)


if __name__ == "__main__":
    main()
