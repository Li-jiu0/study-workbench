"""用户：个人资料修改 / 头像上传（存服务器文件）/ 公开主页 / 在线状态。"""
import re
import time
from datetime import date as _date
from datetime import datetime as _datetime
from datetime import timedelta as _timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from config import AVATAR_DIR
from database import User, engine, get_db, is_admin_user, is_friend, now_iso
from filecheck import ext_for
from rate_limit import rate_limit
from schemas import PrivacyIn, ProfileIn, note_card, privacy_of, user_brief
from security import get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])

_MAX_AVATAR = 8 * 1024 * 1024
# 在线判定阈值：5 分钟内有任意鉴权请求即视为在线（决策见架构文档 §9-3）
ONLINE_THRESHOLD_SECONDS = 5 * 60

# 隐私三项合法枚举（T03）：非法值 → 400「设置值不合法」
_MOMENT_VISIBILITY = ("public", "friends", "private")
_FRIEND_ALLOW = ("everyone", "need_confirm", "nobody")

# ==================== R86-B：资料变更频率限制（服务端权威校验） ====================
# 需求：可被用户修改的资料字段，每位用户每月（30 天）最多变更一次。
# 存储：独立表 profile_change_log（(user_id, field) 取最新一条变更时间）。
# 口径：
#   - 首次修改（无任何变更记录）不受限；
#   - 值未发生变化的字段不计一次（幂等，重复提交同一份资料不会被拦）；
#   - 超限时 400，错误信息里带「下次可修改时间」。
# 该表由本模块导入时幂等建表（CREATE TABLE IF NOT EXISTS），无需改 database.py。
CHANGE_COOLDOWN_DAYS = 30
_CHANGE_LOG_TABLE = "profile_change_log"
CHANGE_FIELDS = ("nickname", "motto", "bio", "gender", "birthday", "city", "phone", "goal", "tags")
_CHANGE_LABELS = {
    "nickname": "昵称",
    "motto": "个性签名",
    "bio": "个人简介",
    "gender": "性别",
    "birthday": "出生年月",
    "city": "所在地区",
    "phone": "手机号",
    "goal": "学习目标",
    "tags": "备考方向标签",
}
# 出生年月合法区间（与前端 xtValidateBirthday 保持一致）
_BD_MIN = _date(1950, 1, 1)
_BD_MAX = _date(2015, 12, 31)


def _ensure_change_log_table() -> None:
    """幂等建表 + 索引；任何异常都不阻断服务启动（降级为不限制）。"""
    try:
        with engine.begin() as conn:
            conn.execute(text(
                f"CREATE TABLE IF NOT EXISTS {_CHANGE_LOG_TABLE} ("
                " id INTEGER PRIMARY KEY AUTOINCREMENT,"
                " user_id INTEGER NOT NULL,"
                " field TEXT NOT NULL,"
                " changed_at TEXT NOT NULL"
                ")"
            ))
            conn.execute(text(
                f"CREATE INDEX IF NOT EXISTS ix_pcl_user_field "
                f"ON {_CHANGE_LOG_TABLE}(user_id, field)"
            ))
    except Exception as exc:  # pragma: no cover - 建表失败不应让接口整体不可用
        print(f"[WARN] profile_change_log 初始化失败，变更频率限制降级为不限制：{exc}")


_ensure_change_log_table()


def _clean_str(value) -> str:
    """统一去空白，None → ''。"""
    return ("" if value is None else str(value)).strip()


def _last_changed_at(db: Session, user_id: int, field: str):
    """该用户该字段最近一次变更时间（无记录 → None）。"""
    try:
        row = db.execute(
            text(
                f"SELECT changed_at FROM {_CHANGE_LOG_TABLE} "
                "WHERE user_id = :uid AND field = :f ORDER BY id DESC LIMIT 1"
            ),
            {"uid": user_id, "f": field},
        ).fetchone()
    except Exception:
        return None
    if not row:
        return None
    try:
        return _datetime.strptime(str(row[0])[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def _record_change(db: Session, user_id: int, field: str, when: _datetime) -> None:
    """写一条变更记录（append-only，不做 update，便于审计）。"""
    try:
        db.execute(
            text(
                f"INSERT INTO {_CHANGE_LOG_TABLE} (user_id, field, changed_at) "
                "VALUES (:uid, :f, :t)"
            ),
            {"uid": user_id, "f": field, "t": when.strftime("%Y-%m-%d %H:%M:%S")},
        )
    except Exception as exc:  # 记日志失败不应让资料保存失败
        print(f"[WARN] 写入 profile_change_log 失败（field={field}）：{exc}")


def _check_change_allowed(db: Session, user: User, field: str, new_value: str, now: _datetime) -> bool:
    """校验某字段是否允许变更。

    返回 True = 值确实发生了变化且允许变更（调用方需随后写入变更记录）；
    返回 False = 值没变（幂等，不计一次）；
    超限则直接抛 400，错误信息含「下次可修改时间」。
    """
    old = _clean_str(getattr(user, field, ""))
    new = _clean_str(new_value)
    if old == new:
        return False
    last = _last_changed_at(db, user.id, field)
    if last is None:
        # 首次修改，不受限
        return True
    next_at = last + _timedelta(days=CHANGE_COOLDOWN_DAYS)
    if now < next_at:
        label = _CHANGE_LABELS.get(field, field)
        raise HTTPException(
            400,
            f"{label}每月仅可修改一次，下次可修改时间：{next_at.strftime('%Y-%m-%d %H:%M')}。"
            f"（上次修改于 {last.strftime('%Y-%m-%d %H:%M')}）其他信息可正常修改。",
        )
    return True


def _locks_of(db: Session, user_id: int) -> dict:
    """全字段锁定态，供前端置灰编辑入口 + 展示下次可改时间。"""
    now = _datetime.now()
    out: dict[str, dict] = {}
    for f in CHANGE_FIELDS:
        last = _last_changed_at(db, user_id, f)
        if last is None:
            out[f] = {"locked": False, "changedAt": "", "nextAvailableAt": ""}
            continue
        next_at = last + _timedelta(days=CHANGE_COOLDOWN_DAYS)
        out[f] = {
            "locked": now < next_at,
            "changedAt": last.strftime("%Y-%m-%d %H:%M"),
            "nextAvailableAt": next_at.strftime("%Y-%m-%d %H:%M"),
        }
    return out


def _validate_birthday(raw: str) -> str:
    """出生年月校验：统一 YYYY-MM-DD，拦截未来日期 / 不存在日期 / 越界年月。"""
    s = _clean_str(raw)[:10]
    if not s:
        return ""
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if not m:
        raise HTTPException(400, "出生日期格式不正确，应为 YYYY-MM-DD（如 1990-01-02）")
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not 1 <= mo <= 12:
        raise HTTPException(400, "出生日期月份需在 1~12 之间")
    try:
        dd = _date(y, mo, d)
    except ValueError:
        raise HTTPException(400, f"{mo} 月没有 {d} 日，请检查出生日期")
    if dd < _BD_MIN:
        raise HTTPException(400, "出生日期不能早于 1950-01-01")
    if dd > _BD_MAX:
        raise HTTPException(400, "出生日期不能晚于 2015-12-31（不能填未来日期）")
    return dd.strftime("%Y-%m-%d")


def _presence_fields(target: User) -> dict:
    """在线状态白名单增量：lastSeenAt + online（非敏感，不碰隐私字段）。"""
    last = target.last_seen_at or ""
    online = False
    if last:
        try:
            import datetime
            t = datetime.datetime.strptime(last, "%Y-%m-%d %H:%M:%S")
            online = (datetime.datetime.now() - t).total_seconds() <= ONLINE_THRESHOLD_SECONDS
        except ValueError:
            online = False
    return {"lastSeenAt": last, "online": online}


@router.get("/me/change-locks")
def get_change_locks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """R86-B：资料字段变更锁定态（前端据此置灰编辑入口并展示下次可改时间）。

    返回 { cooldownDays, locks: { 字段: { locked, changedAt, nextAvailableAt } } }。
    只读接口，不产生任何写入。
    """
    return {"cooldownDays": CHANGE_COOLDOWN_DAYS, "locks": _locks_of(db, user.id)}


@router.put("/me")
def update_profile(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 手机号：仅保留数字，长度 0 或 11 位（中国大陆），私密字段不对外暴露
    ph = "".join(ch for ch in body.phone if ch.isdigit())[:11]
    if ph and len(ph) != 11:
        raise HTTPException(400, "手机号需为 11 位数字")
    # 出生年月：统一 YYYY-MM-DD，拦截未来日期 / 不存在日期 / 越界年月（R86-B 需求1）
    birthday = _validate_birthday(body.birthday)
    # 标签清洗：中英文逗号统一、去空、去重、最多 8 个、单个最长 12 字
    seen: set[str] = set()
    clean: list[str] = []
    for t in body.tags.replace("，", ",").split(","):
        t = t.strip()[:12]
        if t and t not in seen and len(clean) < 8:
            seen.add(t)
            clean.append(t)

    incoming = {
        "nickname": _clean_str(body.nickname) or user.nickname,   # 空昵称沿用原值，不做清空
        "motto": _clean_str(body.motto),
        "bio": _clean_str(body.bio),
        "gender": body.gender if body.gender in ("secret", "male", "female") else "secret",
        "birthday": birthday,
        "city": _clean_str(body.city),
        "phone": ph,
        "goal": _clean_str(body.goal)[:120],
        "tags": ",".join(clean),
    }

    # 变更频率：先整体校验再落库（任一字段超限即 400，不产生任何写入）
    now_dt = _datetime.now()
    changed = [f for f in CHANGE_FIELDS if _check_change_allowed(db, user, f, incoming[f], now_dt)]

    user.nickname = incoming["nickname"]
    user.motto = incoming["motto"]
    user.bio = incoming["bio"]
    user.gender = incoming["gender"]
    user.birthday = incoming["birthday"]
    user.city = incoming["city"]
    user.phone = incoming["phone"]
    user.goal = incoming["goal"]
    user.tags = incoming["tags"]
    for f in changed:
        _record_change(db, user.id, f, now_dt)
    db.commit()
    return {"id": user.id,
            # R86-B 需求2：账号（登录用户名），只读，不随资料更新
            "username": user.username,
            "nickname": user.nickname, "motto": user.motto, "bio": user.bio,
            "gender": user.gender, "birthday": user.birthday, "city": user.city,
            "phone": user.phone, "goal": user.goal, "tags": user.tags, "avatarUrl": user.avatar,
            # R86-B 需求3：本次变更后各字段的锁定态（含下次可修改时间）
            "cooldownDays": CHANGE_COOLDOWN_DAYS,
            "changeLocks": _locks_of(db, user.id)}


@router.put("/me/privacy")
def update_privacy(body: PrivacyIn, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db), _rl: None = Depends(rate_limit("default"))):
    """隐私设置部分更新（T03 增量，C1/C2/C3）。

    - 只更新显式传入的字段（未传入字段不动）；三字段全未传 → 400。
    - 非法枚举（momentVisibility / friendAllow）→ 400「设置值不合法」。
    - searchable：API 层 bool，落库 INTEGER 0/1。
    - 返回全量 privacy 对象（含未改动字段），供前端局部刷新。
    """
    # 先整体校验再落库，避免半更新（校验失败即抛 400，不产生任何写入）
    if body.momentVisibility is not None and body.momentVisibility not in _MOMENT_VISIBILITY:
        raise HTTPException(400, "设置值不合法")
    if body.friendAllow is not None and body.friendAllow not in _FRIEND_ALLOW:
        raise HTTPException(400, "设置值不合法")
    if body.momentVisibility is None and body.friendAllow is None and body.searchable is None:
        raise HTTPException(400, "设置值不合法")
    if body.momentVisibility is not None:
        user.moment_visibility = body.momentVisibility
    if body.friendAllow is not None:
        user.friend_allow = body.friendAllow
    if body.searchable is not None:
        user.searchable = 1 if body.searchable else 0
    db.commit()
    return privacy_of(user)


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


@router.get("/presence")
def presence(ids: str = Query(default=""), user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    """批量在线状态：仅返回 {id, lastSeenAt, online}，非敏感（无任何隐私字段）。"""
    out = []
    seen: set[int] = set()
    for part in ids.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            uid = int(part)
        except ValueError:
            continue
        if uid in seen or uid <= 0:
            continue
        seen.add(uid)
        t = db.get(User, uid)
        # 需求01：管理员的在线状态对普通用户完全不可见（跳过，不返回任何条目）
        if t and not is_admin_user(t):
            out.append({"id": t.id, **_presence_fields(t)})
    return {"items": out}


@router.get("/{user_id}")
def public_profile(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """对外公开主页：只返回对方公开（published + public）笔记，草稿/私密/归档一律不可见。"""
    from sqlalchemy import and_

    from database import Note

    target = db.get(User, user_id)
    # 需求01：管理员的资料与状态对普通用户完全不可见 → 一律按不存在处理
    if not target or is_admin_user(target):
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
        "goal": target.goal or "",   # 学习目标（主动填写，公开展示）
        "tags": target.tags or "",   # 备考方向标签（主动填写，公开展示）
        "createdAt": target.created_at,
        "isMe": target.id == user.id,
        # 好友关系增量（P0-5）：已好友时前端隐藏「添加好友」、显示「发消息」
        "isFriend": target.id != user.id and is_friend(db, user.id, target.id),
        # 在线状态增量（P0-6）：白名单字段，不含隐私信息
        **_presence_fields(target),
        "stats": {  # 服务端可核算的创作数据（学习时长等本机数据不对外）
            "published": len(notes),
            "likes": sum(n.likes_count for n in notes),
            "comments": sum(n.comments_count for n in notes),
            "views": sum(n.views for n in notes),
        },
        "notes": [note_card(n) for n in notes],
    }
