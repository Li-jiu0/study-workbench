# -*- coding: utf-8 -*-
"""R73n 排查：线上静态服务方式"""
import subprocess, io
PLINK = r'D:\下载的文件\学习工作台\tools\plink.exe'
HOSTKEY = 'SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M'
CMD = (
    "curl -s -o /dev/null -w 'root:%{http_code}\\n' http://127.0.0.1:8000/ ;"
    "curl -s http://127.0.0.1:8000/ | head -c 200 ; echo ;"
    "curl -s -o /dev/null -w 'assets-js:%{http_code}\\n' http://127.0.0.1:8000/assets/ai-service.js ;"
    "curl -s -o /dev/null -w 'web-js:%{http_code}\\n' http://127.0.0.1:8000/web/assets/ai-service.js ;"
    "ls /etc/nginx/sites-enabled/ 2>/dev/null ;"
    "grep -r 'root\\|proxy_pass\\|alias' /etc/nginx/sites-enabled/ 2>/dev/null | head -20 ;"
    "nginx -T 2>/dev/null | grep -E 'root |server_name|listen|location|alias|proxy_pass' | head -30"
)
r = subprocess.run([PLINK, '-pw', 'Li050800!', '-batch', '-hostkey', HOSTKEY,
                    'root@110.42.134.62', CMD], capture_output=True, timeout=90)
io.open(r'C:\Users\ATM\_r73n_probe2.txt', 'w', encoding='utf-8').write(
    'rc=%d\n%s\n%s' % (r.returncode, r.stdout.decode('utf-8', 'ignore'),
                       r.stderr.decode('utf-8', 'ignore')))
