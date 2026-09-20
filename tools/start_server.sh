#!/bin/bash
cd /opt/study-workbench/server
source .venv/bin/activate
echo "=== TEST IMPORT ==="
python3 -c "from main import app; print('IMPORT OK')" 2>&1
echo "=== START SERVER ==="
pkill -f 'uvicorn main:app' 2>/dev/null
sleep 1
nohup .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 > /opt/study-workbench/server.log 2>&1 &
sleep 4
echo "=== PROCESS ==="
ps aux | grep uvicorn | grep -v grep
echo "=== HEALTH ==="
curl -s http://127.0.0.1:8000/api/health
echo ""
echo "=== LOG ==="
cat /opt/study-workbench/server.log 2>&1 | tail -30
