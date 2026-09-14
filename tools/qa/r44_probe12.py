# -*- coding: utf-8 -*-
"""R44 第十二轮：区分 401（无有效 token）与 403（已登录但非管理员），确认用户是否真的登录（只读）。

用法：python tools/qa/r44_probe12.py
输出：tools/qa/r44_probe12_out.txt
"""
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
OUT = os.path.join(ROOT, "tools", "qa", "r44_probe12_out.txt")


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
LOG="journalctl -u study-workbench --since '2026-09-14 02:36' --no-pager 2>/dev/null"
echo "=== A. 重启后状态码分布（全部）==="
eval $LOG | grep -oE '" [0-9]{3} ' | sort | uniq -c | sort -rn
echo ""

echo "=== B. 401 vs 403 分别计数 ==="
echo "401: $(eval $LOG | grep -c '\" 401 ')"
echo "403: $(eval $LOG | grep -c '\" 403 ')"
echo "200: $(eval $LOG | grep -c '\" 200 ')"
echo ""

echo "=== C. 用户 IP 182.204.50.206 的全部请求（重启后）==="
eval $LOG | grep '182.204.50.206' | tail -25
echo ""

echo "=== D. 是否出现过 403（= 带有效 token 但非管理员）==="
eval $LOG | grep ' 403 ' | tail -10
echo "(空 = 从未出现 403，说明这些请求都没带有效 token)"
echo ""

echo "=== E. 登录相关请求（任何来源）==="
eval $LOG | grep -E 'POST /api/auth/(login|register)' | tail -15
echo ""

echo "=== F. 哪些端点返回过 200（证明有真实登录用户在用）==="
eval $LOG | grep ' 200 ' | grep -oE '"(GET|POST) [^"]+"' | sort | uniq -c | sort -rn | head -20
echo ""

echo "=== G. 重启后是否有 WebSocket 连接（说明前端页面真的在跑）==="
eval $LOG | grep -ci 'websocket' || echo 0
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
