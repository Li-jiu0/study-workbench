"""通用文件上传（笔记内插图，存服务器文件而非 base64 入库）。"""
import time

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from config import FILE_DIR, IMAGE_DIR, VIDEO_DIR, VOICE_DIR
from database import User, get_db
from filecheck import ext_for, ext_for_audio, ext_for_file, ext_for_video
from security import get_current_user

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

_MAX = 8 * 1024 * 1024
# 语音消息上限 2MB（A7）：前端 MediaRecorder ≤60s 的 opus/webm 通常远小于此
_MAX_VOICE = 2 * 1024 * 1024
# 聊天图片消息上限 5MB（R51）：与语音同一模型——先落盘拿 url，再以 kind='image' 发消息
_MAX_CHAT_IMAGE = 5 * 1024 * 1024
# 视频上传上限 50MB（R88-M3）：手机随手拍 10-60s 常见 10-50MB；mp4/webm 魔数白名单
_MAX_VIDEO = 50 * 1024 * 1024
# 通用文档上传上限 20MB（R88-M8 私聊「发送文件」）：pdf/zip/docx/xlsx/pptx/rar；
# 危险扩展名（exe/php/html/svg/js...）在黑名单里一律拒（见 filecheck.DANGEROUS_EXTS）
_MAX_FILE = 20 * 1024 * 1024


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


@router.post("/video")
def upload_video(file: UploadFile = File(...), user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """通用视频上传（R88-M3）：≤50MB，魔数白名单 mp4 / webm；存 server/uploads/videos/。

    返回 {url}，前端直接用于 <video src>（朋友圈发布 / 后续其它页面通用）。
    与既有 /api/uploads（图片 ≤8MB）、/api/uploads/image（聊天图 ≤5MB）、
    /api/uploads/voice（音频 ≤2MB）并存，互不影响。
    """
    data = file.file.read(_MAX_VIDEO + 1)
    if len(data) > _MAX_VIDEO:
        raise HTTPException(400, "视频超过 50MB")
    if not data:
        raise HTTPException(400, "空文件")
    ext = ext_for_video(data)
    if not ext:
        raise HTTPException(400, "仅支持 MP4 / WebM 视频")
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    name = f"u{user.id}_{int(time.time() * 1000)}{ext}"
    (VIDEO_DIR / name).write_bytes(data)
    return {"url": f"/uploads/videos/{name}"}


@router.post("/file")
def upload_file(file: UploadFile = File(...), user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """通用文档上传（R88-M8，私聊「发送文件」）：≤20MB。

    安全口径（这是任意文件上传入口，从严）：
      1) 原始文件名扩展名先过黑名单（filecheck.is_dangerous_ext）→ 命中直接 400；
      2) 再按文件头魔数判定真实类型（filecheck.ext_for_file）→ 白名单外一律 400；
      3) 落盘名固定为 u{user.id}_{ms}{ext}，ext 来自魔数判定，**不使用用户文件名**（防路径穿越）。
    放行类型：pdf / zip / docx / xlsx / pptx / rar。存 server/uploads/files/。
    返回 {url}，前端以 kind='file' 发消息（content 存该 URL）。
    """
    data = file.file.read(_MAX_FILE + 1)
    if len(data) > _MAX_FILE:
        raise HTTPException(400, "文件超过 20MB")
    if not data:
        raise HTTPException(400, "空文件")
    ext = ext_for_file(data, file.filename or "")
    if not ext:
        raise HTTPException(400, "不支持的文件类型")
    FILE_DIR.mkdir(parents=True, exist_ok=True)
    name = f"u{user.id}_{int(time.time() * 1000)}{ext}"
    (FILE_DIR / name).write_bytes(data)
    return {"url": f"/uploads/files/{name}"}
