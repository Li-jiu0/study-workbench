# -*- coding: utf-8 -*-
"""R73n 线上验证（80 端口 nginx）"""
import subprocess, io
PLINK = r'D:\下载的文件\学习工作台\tools\plink.exe'
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CMD = (
    "for u in '/AI.html' '/ai-settings.html' '/设置.html' '/面测.html'; do"
    " n=$(curl -s \"http://127.0.0.1$u\" | grep -c '20260918a'); echo \"$u stamp=$n\"; done ;"
    "curl -s -o /dev/null -w 'svc-js:%{http_code}\\n' 'http://127.0.0.1/assets/ai-service.js?v=20260918a' ;"
    "curl -s -o /dev/null -w 'settings-js:%{http_code}\\n' 'http://127.0.0.1/assets/ai-settings.js?v=20260918a' ;"
    "curl -s 'http://127.0.0.1/assets/ai-service.js?v=20260918a' | grep -c 'HEALTH_TIMEOUT_PROXY' ;"
    "curl -s 'http://127.0.0.1/assets/ai-settings.js?v=20260918a' | grep -c '平台可达但响应慢'"
)
r = subprocess.run([PLINK, '-pw', 'Li050800!', '-batch', '-hostkey', HOSTKEY,
                    'root@110.42.134.62', CMD], capture_output=True, timeout=90)
io.open(r'C:\Users\ATM\_r73n_verify.txt', 'w', encoding='utf-8').write(
    'rc=%d\n%s\n%s' % (r.returncode, r.stdout.decode('utf-8', 'ignore'),
                       r.stderr.decode('utf-8', 'ignore')))
