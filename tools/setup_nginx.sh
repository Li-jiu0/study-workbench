#!/bin/bash
# 配置 Nginx 托管前端 + API 反向代理
set -e

echo "=== 解压前端文件 ==="
cd /opt/study-workbench
mkdir -p web
tar xzf frontend.tar.gz -C /opt/study-workbench/
ls web/ | head -10

echo "=== 安装 Nginx ==="
apt-get install -y -qq nginx 2>&1 | tail -3

echo "=== 写入配置 ==="
cat > /etc/nginx/sites-available/study-workbench << 'NGINX_EOF'
server {
    listen 80;
    server_name _;
    root /opt/study-workbench/web;
    index 学习工作台.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:8000;
    }
}
NGINX_EOF

ln -sf /etc/nginx/sites-available/study-workbench /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "=== 测试配置 ==="
nginx -t

echo "=== 启动 Nginx ==="
systemctl restart nginx
systemctl enable nginx
sleep 2

echo "=== 状态 ==="
systemctl is-active nginx
curl -s http://127.0.0.1/api/health
echo ""
curl -s -o /dev/null -w "Frontend HTTP: %{http_code}\n" http://127.0.0.1/
echo "DONE"
