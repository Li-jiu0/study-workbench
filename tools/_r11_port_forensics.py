# -*- coding: utf-8 -*-
"""R11 部署：线上 8000 端口冲突取证（孤儿 uvicorn + GEMINI_PROXY 来源）。"""
import os, re, io, subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
s = io.open(os.path.join(ROOT, 'upload_v23.ps1'), encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s))
pwd, host = m.group(1), m.group(2)
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'

def run(c, t=120):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HK, 'root@' + host, c],
                       capture_output=True, text=True, timeout=t, errors='replace')
    return (r.stdout or '') + (('\n[STDERR] ' + r.stderr.strip()) if (r.stderr or '').strip() else '')

CMDS = [
 ('1) 8000 占用与父进程', "ss -ltnp | grep ':8000'; echo '-- parent --'; ps -o pid,ppid,lstart,cmd -p 3756520 2>/dev/null || echo 'parent gone'"),
 ('2) 孤儿进程 cwd / 起始时间', "ls -l /proc/3756522/cwd; echo '-- start --'; ps -o lstart= -p 3756522"),
 ('3) 孤儿进程 env（GEMINI_PROXY 等）', "cat /proc/3756522/environ | tr '\\0' '\\n' | grep -E 'GEMINI_PROXY|PROXY|OPENROUTER|PYTHONUNBUFFERED' || echo '(env 中无 PROXY)'"),
 ('4) server/.env 是否含 GEMINI_PROXY', "grep -nE 'GEMINI_PROXY|PROXY' /opt/study-workbench/server/.env || echo '(.env 无 PROXY 行)'; echo '-- .env 键名（仅键，不打印值）--'; sed -E 's/=.*/=<hidden>/' /opt/study-workbench/server/.env"),
 ('5) 单元 Environment 全量', "systemctl show study-workbench -p Environment -p EnvironmentFile"),
 ('6) 系统级 mihomo 状态', "systemctl is-active mihomo; ss -ltnp | grep 7897 || echo '(7897 未监听)'"),
 ('7) 公网 API 现状', "curl -s -o /dev/null -w 'models=%{http_code}\\n' http://127.0.0.1:8000/api/ai/models"),
]
for title, c in CMDS:
    print('\n===== %s =====' % title)
    print(run(c).rstrip())
