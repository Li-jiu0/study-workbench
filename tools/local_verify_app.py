"""本地验收星途（前端 + 后端同源启动，仅本机使用，勿部署）。

用途：把 server/ 的 FastAPI（/api/*）与项目根的前端静态文件挂在**同一端口**，
让前端以 http 同源方式访问 API（前端 api.js 在 http 协议下 API_BASE=''，即同源）。

启动（需 xingtu-backend venv）：
  set ADMIN_PASSWORD=<管理员密码>   # Windows；不设则用后端默认回落
  venv\\Scripts\\python.exe tools/local_verify_app.py

访问： http://127.0.0.1:8000/学习工作台.html
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))          # 项目根（前端静态根）
SERVER_DIR = os.path.join(ROOT, "server")                 # 后端包目录

sys.path.insert(0, SERVER_DIR)
os.chdir(SERVER_DIR)                                      # 让后端相对路径（data/ 等）正确

from main import app  # noqa: E402  —— 已 include 所有 /api 路由 + ensure_admin_user()
from fastapi.staticfiles import StaticFiles  # noqa: E402

# 关键：/api、/uploads 具体路由已注册在前，mount('/') 作为兜底 serve 前端静态
app.mount("/", StaticFiles(directory=ROOT, html=True), name="web")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("XINGTU_PORT", "8000"))
    print(f"[local-verify] 前端+后端同源: http://127.0.0.1:{port}/学习工作台.html")
    print(f"[local-verify] ADMIN_PASSWORD set = {bool(os.environ.get('ADMIN_PASSWORD'))}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
