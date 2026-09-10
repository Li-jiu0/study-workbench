#!/bin/bash
# 配置 systemd 服务，实现后端开机自启
cat > /etc/systemd/system/study-workbench.service << 'EOF'
[Unit]
Description=Study Workbench FastAPI Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/study-workbench/server
ExecStart=/opt/study-workbench/server/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable study-workbench
systemctl restart study-workbench
sleep 3
echo "=== SERVICE STATUS ==="
systemctl status study-workbench --no-pager | head -10
echo "=== HEALTH ==="
curl -s http://127.0.0.1:8000/api/health
echo ""
echo "DONE"
