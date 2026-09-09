"""用户：个人资料修改 / 头像上传（存服务器文件）/ 公开主页。"""
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from config import AVATAR_DIR
from database import User, get_db, now_str
from filecheck import ext_for
from schemas import ProfileIn, note_card, user_brief
from security import get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])

_MAX_AVATAR = 8 * 1024 * 1024


@router.put("/me")
def update_profile(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.nickname.strip():
        user.nickname = body.nickname.strip()
    user.motto = body.motto.strip()
    user.bio = body.bio.strip()
    user.gender = body.gender if body.gender in ("secret", "male", "female") else "secret"
    user.birthday = body.birthday.strip()[:10]
    user.city = body.city.strip()
    db.commit()
    return {"id": user.id, "nickname": user.nickname, "motto": user.motto, "bio": user.bio,
            "gender": user.gender, "birthday": user.birthday, "city": user.city, "avatarUrl": user.avatar}


@router.post("/me/avatar")
def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """头像以文件形式存到 server/uploads/avatars/，数据库只存相对 URL，不存 base64。"""
    data = file.file.read(_MAX_AVATAR + 1)
    if len(data) > _MAX_AVATAR:
        raise HTTPException(400, "图片超过 8MB")
    if not data:
        raise HTTPException(400, "空文件")
    ext = ext_for(data)
    if not ext:
        raise HTTPException(400, "仅支持 JPG / PNG / WebP / GIF 图片")
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    # 删除旧头像文件（避免堆积）
    if user.avatar and user.avatar.startswith("/uploads/avatars/"):
        old = AVATAR_DIR / Path(user.avatar).name
        if old.exists():
            old.unlink(missing_ok=True)
    name = f"u{user.id}_{int(time.time())}{ext}"
    (AVATAR_DIR / name).write_bytes(data)
    user.avatar = f"/uploads/avatars/{name}"
    db.commit()
    return {"avatarUrl": user.avatar}


@router.delete("/me/avatar")
def reset_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.avatar and user.avatar.startswith("/uploads/avatars/"):
        old = AVATAR_DIR / Path(user.avatar).name
        if old.exists():
            old.unlink(missing_ok=True)
    user.avatar = None
    db.commit()
    return {"avatarUrl": None}


@router.get("/{user_id}")
def public_profile(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """对外公开主页：只返回对方公开（published + public）笔记，草稿/私密/归档一律不可见。"""
    from sqlalchemy import and_

    from database import Note

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "用户不存在")
    notes = (
        db.query(Note)
        .filter(and_(Note.user_id == target.id, Note.status == "published",
                     Note.privacy == "public", Note.deleted_at.is_(None)))
        .order_by(Note.created_at.desc())
        .all()
    )
    return {
        **user_brief(target),
        "motto": target.motto,
        "bio": target.bio or "",
        "city": target.city or "",   # 对外仅展示所在城市，不展示性别/生日等私密信息
        "createdAt": target.created_at,
        "isMe": target.id == user.id,
        "notes": [note_card(n) for n in notes],
    }
