# -*- coding: utf-8 -*-
"""R73m 步骤1：拉取远程 .env 到本地 temp 查看"""
import subprocess, io

ROOT = r'D:\下载的文件\学习工作台'
PSCP = ROOT + r'\tools\pscp.exe'
OUT = r'C:\Users\ATM\_r73m_remote_env.env'
LOG = r'C:\Users\ATM\_r73m_fetch_out.txt'

r = subprocess.run([PSCP, '-pw', 'Li050800!', '-batch',
                    '-hostkey', 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M',
                    'root@110.42.134.62:/opt/study-workbench/server/.env', OUT],
                   capture_output=True)
lines = ['rc=%d' % r.returncode,
         r.stdout.decode('utf-8', 'ignore'),
         r.stderr.decode('utf-8', 'ignore')]
try:
    raw = open(OUT, 'rb').read()
    lines.append('--- remote .env (%d bytes) ---' % len(raw))
    # 脱敏打印：只显示 Key 名与非 Key 行的值
    for ln in raw.decode('utf-8', 'ignore').splitlines():
        s = ln.strip()
        if not s or s.startswith('#') or '=' not in s:
            lines.append(s)
        else:
            k, v = s.split('=', 1)
            lines.append(k + '=' + (v if ('KEY' not in k and 'PASS' not in k and 'SECRET' not in k) else '<%d chars>' % len(v)))
except Exception as e:
    lines.append('read err: %s' % e)
io.open(LOG, 'w', encoding='utf-8').write('\n'.join(lines))
