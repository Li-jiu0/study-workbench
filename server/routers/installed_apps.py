"""R3-L5：账号与设备安全风控 —— 已安装第三方应用指纹上报（POST /api/user/installed-apps）。

用途定位（唯一）：**账号与设备安全风控** —— 识别多开/模拟器/异常设备、同账号设备突变。
采集时机：仅在【用户同意隐私政策】且设置中「设备安全/风控」开关开启时，由 App 原生桥
采集并上报；拒绝/关闭时不产生该请求。

隐私红线（与 routers/device.py 同源，但本表单独存、单独同意）：
- 只接收【包名加盐 SHA-256 哈希】列表，**不接收明文包名**；不接收应用名/图标/版本；
- 与 user_devices 分开存（user_app_sigs），**不并入** POST /api/user/device 白名单；
- 严禁用于用户画像/广告，不对外公开；普通接口与前端页面无法读取本表。

鉴权与全站一致：未登录 / 无效 token 由 get_current_user 统一 401。
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import UserAppSig, get_db, now_iso
from security import get_current_user

router = APIRouter(prefix="/api/user", tags=["installed-apps"])

# 数量与单条长度上限（超限直接 422，防滥用 / 防超大 JSON 打爆存储）
MAX_SIGS = 500
MAX_SIG_LEN = 128


class InstalledAppsIn(BaseModel):
    """已安装第三方应用指纹（哈希列表）。

    ⚠️ 隐私红线：sigs 只允许是【包名加盐 SHA-256 的十六进制串】，严禁明文包名；
    不接受应用名/图标/版本等任何额外字段（pydantic 默认忽略未声明字段，且只落库 sigs）。
    """
    sigs: list[str] = Field(default_factory=list, max_length=MAX_SIGS)


@router.post("/installed-apps")
def report_installed_apps(body: InstalledAppsIn, user=Depends(get_current_user),
                          db: Session = Depends(get_db)):
    """记录 / 更新当前登录用户的已安装应用指纹（重复上报 = upsert，同一用户恒一行）。

    - 数量上限 500 条（超过 → 422，由 pydantic max_length 拦截）；
    - 单条长度 ≤128（超长 → 422，本函数显式校验后抛 HTTPException(422)）；
    - 每条去重后去空白；全空条目忽略；结果按字典序排序后存 JSON，保证同集合重复上报稳定。
    """
    raw = body.sigs or []
    if len(raw) > MAX_SIGS:
        # 双保险：pydantic max_length 已拦，这里再挡一道（例如上限常量调整后仍生效）
        raise HTTPException(status_code=422, detail=f"应用指纹数量超过上限 {MAX_SIGS}")

    cleaned: list[str] = []
    seen: set[str] = set()
    for item in raw:
        s = str(item or "").strip()
        if not s:
            continue
        if len(s) > MAX_SIG_LEN:
            raise HTTPException(status_code=422, detail=f"单条应用指纹长度超过上限 {MAX_SIG_LEN}")
        if s in seen:
            continue
        seen.add(s)
        cleaned.append(s)

    # 若去重后仍超上限（恶意构造大量重复+唯一混合），同样拒绝
    if len(cleaned) > MAX_SIGS:
        raise HTTPException(status_code=422, detail=f"应用指纹数量超过上限 {MAX_SIGS}")

    cleaned.sort()
    sigs_json = json.dumps(cleaned, ensure_ascii=False)
    now = now_iso()
    row = db.get(UserAppSig, user.id)
    if row is None:
        db.add(UserAppSig(user_id=user.id, sigs=sigs_json,
                          app_count=len(cleaned), updated_at=now))
    else:
        row.sigs = sigs_json
        row.app_count = len(cleaned)
        row.updated_at = now
    db.commit()
    return {"ok": True, "count": len(cleaned)}
