# -*- coding: utf-8 -*-
"""打包前端文件并上传到服务器，配置 Nginx"""
import tarfile, os, subprocess, io

ROOT = r"D:\下载的文件\学习工作台"
TAR_PATH = r"D:\下载的文件\学习工作台\tools\frontend.tar.gz"
PLINK = r"D:\下载的文件\学习工作台\tools\plink.exe"
PSCP = r"D:\下载的文件\学习工作台\tools\pscp.exe"
# 凭据从环境变量读取，切勿把真实密码写进代码（历史泄漏事故：2026-09-11）
# 用法：set SW_HOST=root@1.2.3.4 && set SW_PASS=xxx && python tools/deploy_xxx.py
HOST = os.environ.get("SW_HOST", "")
PASS = os.environ.get("SW_PASS", "")
if not HOST or not PASS:
    raise SystemExit("请先设置环境变量 SW_HOST 与 SW_PASS（服务器地址与密码）")
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"

EXCLUDE_DIRS = {'server', 'android', 'tools', '.git', 'node_modules', '__pycache__', 'server(2)', '学习工作台(2)'}
EXCLUDE_EXTS = {'.apk', '.png', '.jpg', '.jpeg', '.gif', '.md', '.py', '.pyc', '.zip', '.tar.gz', '.docx', '.xlsx', '.pptx', '.txt', '.keystore', '.jks'}
EXCLUDE_FILES = {'.gitignore', '.env', '.env.example'}

# 1. 打包
print("=== 打包前端文件 ===")
count = 0
with tarfile.open(TAR_PATH, "w:gz") as tar:
    for item in os.listdir(ROOT):
        full = os.path.join(ROOT, item)
        if os.path.isdir(full):
            if item in EXCLUDE_DIRS:
                continue
            # 打包 assets 目录
            for root, dirs, files in os.walk(full):
                dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and d != '__pycache__']
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in EXCLUDE_EXTS:
                        continue
                    fp = os.path.join(root, f)
                    arcname = os.path.relpath(fp, ROOT)
                    tar.add(fp, arcname='web/' + arcname.replace('\\', '/'))
                    count += 1
        else:
            ext = os.path.splitext(item)[1].lower()
            if ext in EXCLUDE_EXTS:
                continue
            if item in EXCLUDE_FILES:
                continue
            # 只打包 HTML 文件
            if ext == '.html':
                tar.add(full, arcname='web/' + item)
                count += 1

print(f"打包 {count} 个文件, {os.path.getsize(TAR_PATH)} bytes")

# 2. 上传
print("\n=== 上传 ===")
r = subprocess.run([PSCP, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, TAR_PATH, f"{HOST}:/opt/study-workbench/"],
                   capture_output=True, text=True, timeout=120)
print(r.stdout[-500:] if r.stdout else "")
print("exit:", r.returncode)

# 3. 服务器端解压 + 安装 Nginx + 配置
print("\n=== 配置 Nginx ===")
nginx_conf = """server {
    listen 80;
    server_name _;
    root /opt/study-workbench/web;
    index 学习工作台.html;

    # 前端静态文件
    location / {
        try_files $uri $uri/ =404;
    }

    # API 反向代理到后端 8000
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket 支持
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}"""

remote_cmd = f"""set -e
cd /opt/study-workbench
mkdir -p web
tar xzf frontend.tar.gz -C /opt/study-workbench/
echo '--- FILES ---'
ls web/ | head -20
echo '--- INSTALL NGINX ---'
apt-get install -y -qq nginx 2>&1 | tail -3
echo '--- CONFIG ---'
cat > /etc/nginx/sites-available/study-workbench << 'NGINX_EOF'
{nginx_conf}
NGINX_EOF
ln -sf /etc/nginx/sites-available/study-workbench /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx
echo '--- TEST ---'
curl -s http://127.0.0.1/api/health
echo ''
curl -s -o /dev/null -w "HTTP %%{http_code}" http://127.0.0.1/
echo ''
echo DONE"""

r = subprocess.run([PLINK, "-ssh", "-pw", PASS, "-batch", "-hostkey", HOSTKEY, HOST, remote_cmd],
                   capture_output=True, text=True, timeout=180)
print(r.stdout)
if r.stderr:
    print("STDERR:", r.stderr[-500:])
print("部署 exit:", r.returncode)
