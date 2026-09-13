"""学习工作台 · 多人博客后端入口。

启动（在 server/ 目录下）：
    pip install -r requirements.txt
    copy .env.example .env   （并填写 JWT_SECRET / 大模型密钥）
    python -m uvicorn main:app --host 0.0.0.0 --port 8000

首次启动自动建表（结构见 建表SQL.sql）。
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import AVATAR_DIR, IMAGE_DIR, UPLOAD_DIR
from database import init_db
from routers import (admin, ai, auth, chat, feedback, feedback_public, friends,
                     groups, migrate, moments, news, notes, social, study,
                     uploads, users)
import ws

app = FastAPI(title="学习工作台 · 多人博客后端", version="2.0")

# 允许前端以 file:// 直开（Origin=null）或任意本地端口访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
# 需求01：确保管理员超级账号存在且 is_admin=1（幂等；密码走 ADMIN_PASSWORD 环境变量）
admin.ensure_admin_user()

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(notes.router)
app.include_router(social.router)
app.include_router(friends.router)
app.include_router(chat.router)
app.include_router(groups.router)
app.include_router(moments.router)
app.include_router(feedback.router)
app.include_router(feedback_public.router)  # 20260913j：免登录创作者反馈（POST/GET /api/feedback）
app.include_router(study.router)
app.include_router(news.router)   # 需求10：时政新闻聚合（免登录公开接口）
app.include_router(ai.router)
app.include_router(uploads.router)
app.include_router(migrate.router)
app.include_router(ws.router)
app.include_router(admin.router)  # 需求01：管理员观察台（/api/admin/*，非管理员 403）

# 头像 / 笔记插图静态目录（数据库只存相对 URL）
for d in (UPLOAD_DIR, AVATAR_DIR, IMAGE_DIR):
    d.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health")
def health():
    return {"ok": True, "service": "study-workbench-backend"}
