"""通用文件上传（笔记内插图，存服务器文件而非 base64 入库）。"""
import time

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from config import IMAGE_DIR
from database import User, get_db
from filecheck import ext_for
from security import get_current_user

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

_MAX = 8 * 1024 * 1024


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
