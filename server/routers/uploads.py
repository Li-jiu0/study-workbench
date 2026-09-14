"""通用文件上传（笔记内插图，存服务器文件而非 base64 入库）。"""
import time

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from config import IMAGE_DIR, VOICE_DIR
from database import User, get_db
from filecheck import ext_for, ext_for_audio
from security import get_current_user

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

_MAX = 8 * 1024 * 1024
# 语音消息上限 2MB（A7）：前端 MediaRecorder ≤60s 的 opus/webm 通常远小于此
_MAX_VOICE = 2 * 1024 * 1024
# 聊天图片消息上限 5MB（R51）：与语音同一模型——先落盘拿 url，再以 kind='image' 发消息
_MAX_CHAT_IMAGE = 5 * 1024 * 1024


@router.post("")
def upload_image(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = file.file.read(_MAX + 1)
    if len(data) > _MAX:
        raise HTTPException(400, "图片超过 8MB")
    if not data:
        raise HTTPException(400, "空文件")
    ext = ext_for(data)
    if not ext:
        raise HTTPException(400, "仅支持 JPG / PNG / WebP / GIF 图片")
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    name = f"u{user.id}_{int(time.time() * 1000)}{ext}"
    (IMAGE_DIR / name).write_bytes(data)
    return {"url": f"/uploads/images/{name}"}


@router.post("/voice")
def upload_voice(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """语音消息上传（A7）：≤2MB，魔数白名单 webm/ogg/mp4(m4a)/wav；存 server/uploads/voice/。

    返回 {url}，前端再以 kind='voice' 发消息（content 存该 URL）。
    """
    data = file.file.read(_MAX_VOICE + 1)
    if len(data) > _MAX_VOICE:
        raise HTTPException(400, "语音超过 2MB")
    if not data:
        raise HTTPException(400, "空文件")
    ext = ext_for_audio(data)
    if not ext:
        raise HTTPException(400, "仅支持 webm / ogg / mp4 / wav 音频")
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    name = f"u{user.id}_{int(time.time() * 1000)}{ext}"
    (VOICE_DIR / name).write_bytes(data)
    return {"url": f"/uploads/voice/{name}"}


@router.post("/image")
def upload_chat_image(file: UploadFile = File(...), user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    """聊天图片上传（R51，2026-09-14）：≤5MB，魔数白名单 jpg/png/webp/gif；存 server/uploads/images/。

    与 POST /api/uploads（笔记插图，≤8MB）分开：聊天图片限得更严，避免聊天流被大图拖垮。
    返回 {url}，前端再以 kind='image' 发私聊 / 群聊消息（content 存该 URL）。
    """
    data = file.file.read(_MAX_CHAT_IMAGE + 1)
    if len(data) > _MAX_CHAT_IMAGE:
        raise HTTPException(400, "图片超过 5MB")
    if not data:
        raise HTTPException(400, "空文件")
    ext = ext_for(data)
    if not ext:
        raise HTTPException(400, "仅支持 JPG / PNG / WebP / GIF 图片")
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    name = f"u{user.id}_{int(time.time() * 1000)}{ext}"
    (IMAGE_DIR / name).write_bytes(data)
    return {"url": f"/uploads/images/{name}"}
