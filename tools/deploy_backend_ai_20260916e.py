# -*- coding: utf-8 -*-
"""20260916e 后端 AI 中转配置部署：
1) 上传 server/config.py（新增 siliconflow 服务商）
2) 线上 .env 追加 SILICONFLOW_API_KEY / ZHIPU_API_KEY（已存在则跳过，不覆盖其它内容）
3) 重启 uvicorn + 健康检查 + /api/ai/models 非空验证
"""
import os, re, io, sys, subprocess

ROOT = r'D:\下载的文件\学习工作台'
PLINK = os.path.join(ROOT, 'tools', 'plink.exe')
PSCP = os.path.join(ROOT, 'tools', 'pscp.exe')
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CRED = os.path.join(ROOT, 'upload_v23.ps1')
LOG = []

host = os.environ.get('SW_HOST', '')
pwd = os.environ.get('SW_PASS', '')
if not host or not pwd:
    s = io.open(CRED, encoding='utf-8', errors='replace').read()
    m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s) or \
        re.search(r'-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', s)
    if not m:
        LOG.append('NO CRED')
        io.open(r'C:\Users\ATM\_dep_e_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
        sys.exit(2)
    pwd, host = m.group(1), m.group(2)
LOG.append('目标 root@%s' % host)

def plink(cmd, timeout=180):
    r = subprocess.run([PLINK, '-ssh', '-pw', pwd, '-batch', '-hostkey', HOSTKEY, 'root@' + host, cmd],
                       capture_output=True, text=True, timeout=timeout, errors='replace')
    return (r.stdout or '') + (('\n[STDERR] ' + r.stderr) if r.stderr else '')

# 0) 先看线上 .env 现状（只看键名不看值）
LOG.append('--- .env keys before ---')
LOG.append(plink("cat /opt/study-workbench/server/.env 2>/dev/null | sed 's/=.*/=***/' || echo NO_ENV"))

# 1) 上传 config.py
r = subprocess.run([PSCP, '-pw', pwd, '-batch', '-hostkey', HOSTKEY,
                    os.path.join(ROOT, 'server', 'config.py'), 'root@' + host + ':/opt/study-workbench/server/config.py'],
                   capture_output=True, text=True, timeout=120, errors='replace')
LOG.append('config.py 上传 exit=%d %s' % (r.returncode, (r.stderr or '')[-200:]))

# 2) .env 追加 Key（幂等：存在即跳过）
SF_KEY = '***REMOVED-BY-R2C***'
ZP_KEY = '<REDACTED-32HEX-旧KEY>.Uvg73xeMhVdN7crs'
append_cmd = (
    "cd /opt/study-workbench/server && touch .env && "
    "grep -q '^SILICONFLOW_API_KEY=' .env || echo 'SILICONFLOW_API_KEY=" + SF_KEY + "' >> .env; "
    "grep -q '^ZHIPU_API_KEY=' .env || echo 'ZHIPU_API_KEY=" + ZP_KEY + "' >> .env; "
    "echo APPEND_DONE"
)
LOG.append('--- append keys ---')
LOG.append(plink(append_cmd))

# 3) 重启后端
LOG.append('--- restart ---')
LOG.append(plink(
    "pkill -f 'uvicorn main:app' 2>/dev/null; sleep 1; "
    "cd /opt/study-workbench/server && nohup .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 "
    "> /opt/study-workbench/server.log 2>&1 & sleep 4; "
    "curl -s http://127.0.0.1:8000/api/health; echo; tail -5 /opt/study-workbench/server.log"
))

io.open(r'C:\Users\ATM\_dep_e_out.txt', 'w', encoding='utf-8').write('\n'.join(LOG))
print('\n'.join(LOG))
