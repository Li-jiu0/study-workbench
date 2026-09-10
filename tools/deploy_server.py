# -*- coding: utf-8 -*-
"""打包 server 目录（排除缓存/虚拟环境/数据库），上传到服务器并解压"""
import tarfile, os, subprocess, sys

SERVER_DIR = r"D:\下载的文件\学习工作台\server"
TAR_PATH = r"D:\下载的文件\学习工作台\tools\server.tar.gz"
PLINK = r"D:\下载的文件\学习工作台\tools\plink.exe"
PSCP = r"D:\下载的文件\学习工作台\tools\pscp.exe"
HOST = "root@110.42.134.62"
PASS = "REDACTED_USE_ENV"
HOSTKEY = "SHA256:i2DNTi3iEPauuTxvJEPlZ4jLf8K0LdDsaijQxArUU1M"

EXCLUDE_DIRS = {'__pycache__', '.venv', 'venv', 'node_modules', '.git'}
EXCLUDE_EXTS = {'.pyc', '.pyo', '.db', '.sqlite', '.sqlite3'}
EXCLUDE_FILES = {'data.db'}

def should_exclude(path):
    name = os.path.basename(path)
    if name in EXCLUDE_DIRS and os.path.isdir(path):
        return True
    if name in EXCLUDE_FILES:
        return True
    ext = os.path.splitext(name)[1].lower()
    if ext in EXCLUDE_EXTS:
        return True
    # 排除路径中包含 __pycache__ 或 .venv 的
    parts = path.replace('\\', '/').split('/')
    for p in parts:
        if p in EXCLUDE_DIRS:
            return True
    return False

# 1. 打包
print("=== 打包 server 目录 ===")
with tarfile.open(TAR_PATH, "w:gz") as tar:
    for root, dirs, files in os.walk(SERVER_DIR):
        # 排除目录
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            full = os.path.join(root, f)
            if should_exclude(full):
                continue
            arcname = os.path.relpath(full, os.path.dirname(SERVER_DIR))
            tar.add(full, arcname=arcname)
            print(f"  + {arcname}")

tar_size = os.path.getsize(TAR_PATH)
print(f"打包完成: {tar_size} bytes")

# 2. 上传
print("\n=== 上传到服务器 ===")
r = subprocess.run([PSCP, "-pw", PASS, "-batch", "-hostkey", HOSTKEY, TAR_PATH, f"{HOST}:/opt/study-workbench/"],
                   capture_output=True, text=True, timeout=120)
print(r.stdout)
if r.stderr:
    print("STDERR:", r.stderr[-500:])
print("上传 exit:", r.returncode)

# 3. 服务器上解压 + 清理旧文件 + 安装依赖 + 启动
print("\n=== 服务器端部署 ===")
remote_cmd = """cd /opt/study-workbench && rm -rf server && tar xzf server.tar.gz && ls -la server/ && echo '---CREATE VENV---' && cd server && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple 2>&1 | tail -5 && echo '---START---' && pkill -f 'uvicorn main:app' 2>/dev/null; sleep 1 && nohup .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 > /opt/study-workbench/server.log 2>&1 & sleep 3 && echo '---HEALTH---' && curl -s http://127.0.0.1:8000/api/health && echo '' && echo '---LOG---' && tail -20 /opt/study-workbench/server.log"""

r = subprocess.run([PLINK, "-ssh", "-pw", PASS, "-batch", "-hostkey", HOSTKEY, HOST, remote_cmd],
                   capture_output=True, text=True, timeout=180)
print(r.stdout)
if r.stderr:
    print("STDERR:", r.stderr[-1000:])
print("部署 exit:", r.returncode)
