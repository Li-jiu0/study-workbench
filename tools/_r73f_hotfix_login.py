# -*- coding: utf-8 -*-
# R73f 热修：单文件推送 登录.html 到生产并复核
import hashlib, io, os, re, shutil, subprocess, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = r'D:\下载的文件\学习工作台'
src = open(ROOT + r'\upload_v23.ps1', encoding='utf-8').read()
m = re.search(r'pscp\.exe"\s+-pw\s+"([^"]+)"[^\n]*?root@([0-9.]+):', src)
PASS, HOST = m.group(1), m.group(2)
PSCP = ROOT + r'\tools\pscp.exe'
PLINK = ROOT + r'\tools\plink.exe'
HK = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
LOCAL = os.path.join(ROOT, '登录.html')
LOCAL_MD5 = hashlib.md5(open(LOCAL, 'rb').read()).hexdigest()
print('local md5:', LOCAL_MD5)

def plink(cmd, timeout=60):
    r = subprocess.run([PLINK, '-ssh', '-pw', PASS, '-batch', '-hostkey', HK,
                        'root@' + HOST, cmd], capture_output=True, timeout=timeout)
    return r.stdout.decode('utf-8', 'replace'), r.stderr.decode('utf-8', 'replace')

# 1) 远端备份
out, err = plink('mkdir -p /opt/study-workbench/backups/hotfix-r73f && '
                 'cp -a /opt/study-workbench/web/登录.html /opt/study-workbench/backups/hotfix-r73f/ && echo BACKUP_OK')
print(out.strip()[:100], err.strip()[:150] if err.strip() else '')

# 2) 上传 ASCII 临时名
r = subprocess.run([PSCP, '-pw', PASS, '-batch', '-hostkey', HK, LOCAL,
                    'root@%s:/tmp/sw_up_login.html' % HOST], capture_output=True, timeout=120)
print('upload exit=%d' % r.returncode)

# 3) 远端 UTF-8 重命名 + MD5
out, err = plink('python3 -c "import shutil; shutil.move(\'/tmp/sw_up_login.html\', \'/opt/study-workbench/web/登录.html\')" && '
                 'md5sum /opt/study-workbench/web/登录.html')
print(out.strip()[:200])
srv_md5 = out.split()[0] if out.strip() else '?'
print('MD5 一致:', srv_md5 == LOCAL_MD5)

# 4) 内容复核（直读 HTTP 服务内容）
out, err = plink("python3 -c \"import urllib.request; s=urllib.request.urlopen('http://127.0.0.1/%E7%99%BB%E5%BD%95.html', timeout=10).read().decode('utf-8','replace'); print('opensource=', '开源：' in s and 'study-workbench' in s); print('backend_label=', '后端地址' in s)\"")
print(out.strip())
