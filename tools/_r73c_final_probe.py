# -*- coding: utf-8 -*-
# R73c 收尾：SMTP 独立探针 + 生产内容复核
import re, subprocess, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'D:\下载的文件\学习工作台'
src = open(ROOT + r'\upload_v23.ps1', encoding='utf-8').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
PASS, HOST = m.group(1), m.group(2)
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
PLINK = ROOT + r'\tools\plink.exe'

remote = (
    "cd /opt/study-workbench && python3 - <<'PYEOF'\n"
    "import sys, io, urllib.request\n"
    "sys.path.insert(0, '/opt/study-workbench/server')\n"
    "import config\n"
    "print('smtp_configured=', config.smtp_configured())\n"
    "from mailer import send_code_email\n"
    "send_code_email('2903163626@qq.com', '752913', 'probe')\n"
    "print('SMTP_PROBE_SEND_OK')\n"
    "s = urllib.request.urlopen('http://127.0.0.1/%E8%AE%BE%E7%BD%AE.html', timeout=10).read().decode('utf-8','replace')\n"
    "print('设置页 email-only 渠道:', \"ST_BIND_CHANNELS = ['email']\" in s)\n"
    "print('设置页 手机入口残留:', \"stOpenBindPanel('phone')\" in s)\n"
    "l = urllib.request.urlopen('http://127.0.0.1/%E7%99%BB%E5%BD%95.html', timeout=10).read().decode('utf-8','replace')\n"
    "print('登录页 在线版字样残留:', '当前为多人在线版' in l)\n"
    "print('登录页 邮箱登录占位:', ('用户名 或 绑定邮箱' in l))\n"
    "import sqlite3\n"
    "c = sqlite3.connect('/opt/study-workbench/server/data.db')\n"
    "print('users_count=', c.execute('select count(*) from users').fetchone()[0])\n"
    "print('email_codes_table=', bool(c.execute(\"select name from sqlite_master where type='table' and name='email_codes'\").fetchone()))\n"
    "PYEOF"
)
r = subprocess.run([PLINK, '-ssh', '-pw', PASS, '-batch', '-hostkey', HK,
                    'root@' + HOST, remote], capture_output=True, timeout=120)
print(r.stdout.decode('utf-8', 'replace'))
err = r.stderr.decode('utf-8', 'replace')
if err.strip(): print('ERR:', err[-500:])
