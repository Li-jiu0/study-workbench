# -*- coding: utf-8 -*-
"""R171 发版前服务健康探查（只读）：防 §14.2「systemctl 早已骗你 + 孤儿 uvicorn」。"""
import io
import os
import re
import subprocess

ROOT = r"D:\下载的文件\学习工作台"
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
CRED = os.path.join(ROOT, 'upload_v23.ps1')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'

src = io.open(CRED, encoding='utf-8', errors='replace').read()
m = (re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
     or re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src))
PWD_, HOST = m.group(1), m.group(2)

SH = r'''
echo "--- is-active ---"
systemctl is-active study-workbench
echo "--- show props ---"
systemctl show study-workbench -p ActiveState -p SubState -p NRestarts -p ExecMainStatus -p MainPID -p ActiveEnterTimestamp
echo "--- port 8000 ---"
ss -ltnp 2>/dev/null | grep ':8000' || echo "no_listener"
echo "--- uvicorn procs ---"
ps -eo pid,ppid,etimes,cmd | grep -E 'uvicorn main:app' | grep -v grep || echo "no_uvicorn"
echo "--- last 20 journal ---"
journalctl -u study-workbench --no-pager -n 20 2>/dev/null | tail -20
echo "--- http checks ---"
curl -s -o /dev/null -w 'root=%{http_code}\n' --max-time 10 http://127.0.0.1/
curl -s -o /dev/null -w 'health=%{http_code}\n' --max-time 10 http://127.0.0.1:8000/api/health
echo "--- app version ---"
curl -s --max-time 10 http://127.0.0.1/api/app/version
echo ""
echo "--- users count ---"
cd /opt/study-workbench/server && python3 -c "import sqlite3;c=sqlite3.connect('data.db');print('users=',c.execute('select count(*) from users').fetchone()[0]);print('tables=',c.execute(\"select count(*) from sqlite_master where type='table'\").fetchone()[0])"
echo "--- journal error scan (10min) ---"
journalctl -u study-workbench --since '-10min' --no-pager 2>/dev/null | grep -icE 'traceback|exception|500 internal' || echo 0
echo "--- apk dir ---"
ls -la /opt/study-workbench/web/static/apk/ 2>/dev/null || echo "apk_dir_missing"
echo "--- bak dirs ---"
ls -d /opt/study-workbench/_bak* 2>/dev/null | tail -5 || echo "no_bak"
'''

r = subprocess.run([PLINK, '-ssh', '-pw', PWD_, '-batch', '-hostkey', HOSTKEY, 'root@' + HOST, SH],
                   capture_output=True, text=True, timeout=300, errors='replace')
out = (r.stdout or '') + (('\n[STDERR] ' + r.stderr.strip()) if (r.stderr or '').strip() else '')
io.open(os.path.join(ROOT, 'tools', 'qa', '_r171_health.txt'), 'w', encoding='utf-8').write(out)
print(out)
print('RC=%d' % r.returncode)
