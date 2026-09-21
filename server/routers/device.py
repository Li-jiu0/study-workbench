"""R105：App 设备信息上报（POST /api/user/device）。

App 启动 / 登录后调用，用于机型适配与问题排查。字段全部可选且有长度上限；
隐私红线见 database.UserDevice —— 只落库本文件声明的白名单字段，严禁上报 /
收集 IMEI、通讯录、短信等敏感个人信息。
鉴权与全站一致：未登录 / 无效 token 由 get_current_user 统一 401。
"""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import UserDevice, get_db, now_iso
from security import get_current_user

router = APIRouter(prefix="/api/user", tags=["device"])


class DeviceIn(BaseModel):
    """设备信息（全可选；字符串 ≤100、language ≤20，超长直接 422）。

    ⚠️ 隐私红线：只声明下列白名单字段；严禁新增 IMEI / 通讯录 / 短信等敏感字段。
    """
    brand: str = Field(default="", max_length=100)
    model: str = Field(default="", max_length=100)
    osVersion: str = Field(default="", max_length=100)
    appVersion: str = Field(default="", max_length=100)
    androidId: str = Field(default="", max_length=100)
    screenWidth: int = Field(default=0, ge=0, le=100000)
    screenHeight: int = Field(default=0, ge=0, le=100000)
    language: str = Field(default="", max_length=20)


@router.post("/device")
def report_device(body: DeviceIn, user=Depends(get_current_user),
                  db: Session = Depends(get_db)):
    """记录 / 更新当前登录用户的设备信息（重复上报 = upsert，同一用户恒一行）。"""
    payload = {
        "brand": body.brand.strip(),
        "model": body.model.strip(),
        "osVersion": body.osVersion.strip(),
        "appVersion": body.appVersion.strip(),
        "androidId": body.androidId.strip(),
        "screenWidth": body.screenWidth,
        "screenHeight": body.screenHeight,
        "language": body.language.strip(),
    }
    device_json = json.dumps(payload, ensure_ascii=False)
    now = now_iso()
    row = db.get(UserDevice, user.id)
    if row is None:
        db.add(UserDevice(user_id=user.id, device=device_json, last_active=now))
    else:
        row.device = device_json
        row.last_active = now
    db.commit()
    return {"ok": True}
