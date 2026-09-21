# -*- coding: utf-8 -*-
# R73j 部署：热修 ai.py 上生产 + 生产 .env 平台 Key 配置盘点（只看键名不看值）+ 真实探针
import hashlib, re, subprocess, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'D:\下载的文件\学习工作台'
src = open(ROOT + r'\upload_v23.ps1', encoding='utf-8').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
PASS, HOST = m.group(1), m.group(2)
PSCP = ROOT + r'\tools\pscp.exe'
PLINK = ROOT + r'\tools\plink.exe'
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
LOCAL = ROOT + r'\server\routers\ai.py'
LOCAL_MD5 = hashlib.md5(open(LOCAL, 'rb').read()).hexdigest()
print('local md5:', LOCAL_MD5)

def plink(cmd, timeout=120):
    r = subprocess.run([PLINK, '-ssh', '-pw', PASS, '-batch', '-hostkey', HK,
                        'root@' + HOST, cmd], capture_output=True, timeout=timeout)
    return r.stdout.decode('utf-8', 'replace'), r.stderr.decode('utf-8', 'replace')

# 1) 远端备份（先与本地 MD5 比对，确认服务器当前版 = 部署基线）
out, err = plink('md5sum /opt/study-workbench/server/routers/ai.py')
srv_md5 = out.split()[0] if out.strip() else '?'
print('服务器当前 ai.py md5:', srv_md5, '| 与部署基线一致:', srv_md5 != LOCAL_MD5)
out, err = plink('mkdir -p /opt/study-workbench/backups/hotfix-r73j && '
                 'cp -a /opt/study-workbench/server/routers/ai.py /opt/study-workbench/backups/hotfix-r73j/ && echo BACKUP_OK')
print(out.strip()[:60])

# 2) 上传 ASCII 临时名 -> 重命名
r = subprocess.run([PSCP, '-pw', PASS, '-batch', '-hostkey', HK, LOCAL,
                    'root@%s:/tmp/sw_up_ai.py' % HOST], capture_output=True, timeout=120)
print('upload exit=%d' % r.returncode)
out, err = plink('python3 -c "import shutil; shutil.move(\'/tmp/sw_up_ai.py\', \'/opt/study-workbench/server/routers/ai.py\')" && '
                 'md5sum /opt/study-workbench/server/routers/ai.py')
print(out.strip()[:120])
print('安装后 MD5 一致:', out.split()[0] == LOCAL_MD5 if out.strip() else False)

# 3) 重启 + .env 平台 Key 盘点（只列键名与是否非空）
out, err = plink('systemctl restart study-workbench && sleep 8 && systemctl is-active study-workbench && '
                 'python3 - <<\'PYEOF\'\n'
                 'import io\n'
                 'for ln in io.open("/opt/study-workbench/server/.env"):\n'
                 '    ln = ln.strip()\n'
                 '    if "=" in ln and not ln.startswith("#"):\n'
                 '        k, v = ln.split("=", 1)\n'
                 '        if k.endswith(("_API_KEY", "_KEY")) or k.startswith(("DEEPSEEK","QW","KIMI","ZHIPU","SILICONFLOW","OPENAI")):\n'
                 '            print("%s = %s(len=%d)" % (k, "SET" if v.strip() else "EMPTY", len(v.strip())))\n'
                 'PYEOF')
print('--- 重启 & .env 平台 Key 盘点 ---')
print(out.strip()[:800])
if err.strip(): print('ERR:', err[-300:])
