# -*- coding: utf-8 -*-
"""R44 第六轮：拉取生产 chat.py 与本地逐行 diff（只读）。

用法：python tools/qa/r44_probe6.py
输出：tools/qa/r44_remote_chat.py、tools/qa/r44_chat_diff.txt
"""
import difflib
import os
import re
import subprocess

ROOT = os.environ.get("SW_ROOT", r"D:\下载的文件\学习工作台")
CRED = os.path.join(ROOT, "upload_v23.ps1")
PLINK = os.path.join(ROOT, "tools", "plink.exe")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"
REMOTE_SRC = os.path.join(ROOT, "tools", "qa", "r44_remote_chat.py")
DIFF_OUT = os.path.join(ROOT, "tools", "qa", "r44_chat_diff.txt")
LOCAL_SRC = os.path.join(ROOT, "server", "routers", "chat.py")


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


def main():
    host, pwd = load_credentials()
    r = subprocess.run([PLINK, "-pw", pwd, "-batch", "-hostkey", HOSTKEY,
                        "root@" + host, "cat /opt/study-workbench/server/routers/chat.py"],
                       capture_output=True, timeout=300)
    remote = r.stdout.decode("utf-8", "replace")
    with open(REMOTE_SRC, "w", encoding="utf-8") as f:
        f.write(remote)

    local = open(LOCAL_SRC, encoding="utf-8", errors="replace").read()
    d = list(difflib.unified_diff(
        remote.splitlines(), local.splitlines(),
        fromfile="PROD chat.py", tofile="LOCAL chat.py", lineterm="", n=2))

    # 关键能力点检测
    def has(t, pat):
        return bool(re.search(pat, t))

    checks = [
        ("can_message 调用", r"can_message\("),
        ("管理员放行注释/逻辑", r"is_admin|管理员"),
        ("friend_allow 检查", r"friend_allow"),
        ("is_blocked 检查", r"is_blocked"),
    ]
    lines = ["=== 关键能力点：生产 vs 本地 ==="]
    for label, pat in checks:
        lines.append("  %-22s PROD=%-5s LOCAL=%s"
                     % (label, has(remote, pat), has(local, pat)))
    lines += ["", "=== diff（PROD -> LOCAL，共 %d 行）===" % len(d)]
    lines += d if d else ["（两文件完全一致）"]
    with open(DIFF_OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("WROTE %s / %s (diff lines=%d)" % (REMOTE_SRC, DIFF_OUT, len(d)))


if __name__ == "__main__":
    main()
