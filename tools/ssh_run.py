# -*- coding: utf-8 -*-
"""远程执行 SSH 命令（用 SSH_ASKPASS 自动输入密码）"""
import subprocess, os, sys

HOST = "root@110.42.134.62"
ASKPASS = r"D:\下载的文件\学习工作台\tools\askpass.bat"

def run(cmd, timeout=120):
    env = os.environ.copy()
    env["SSH_ASKPASS"] = ASKPASS
    env["DISPLAY"] = ":0"
    env["SSH_ASKPASS_REQUIRE"] = "force"
    full = [
        "ssh", "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=NUL",
        "-o", "ConnectTimeout=15",
        HOST, cmd
    ]
    # CREATE_NEW_PROCESS_GROUP = 0x00000200，让 ssh 没有控制终端，从而调用 SSH_ASKPASS
    p = subprocess.run(full, capture_output=True, text=True, timeout=timeout,
                       env=env, creationflags=0x00000200)
    print("=== STDOUT ===")
    print(p.stdout)
    if p.stderr:
        print("=== STDERR ===")
        print(p.stderr)
    print("=== EXIT:", p.returncode, "===")
    return p.returncode

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "echo hello && whoami && uname -a"
    run(cmd)
