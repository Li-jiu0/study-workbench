"""Pydantic 请求/响应模型与笔记序列化。"""
import json
import re

from pydantic import BaseModel, Field, field_validator


# ---------- 密码强度（P0-B T01） ----------
# 规则唯一表述：至少 8 位，且同时包含字母和数字。
# 与前端 登录.html / 设置.html 的 pwStrongEnough 正则保持一致。
_PASSWORD_STRONG_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,64}$")

# 弱密码黑名单（P0-B T01 denylist，case-insensitive）。
# 即使满足长度 + 字母数字混合，仍必须排除这 10 个被业内公认为弱密码的组合。
_WEAK_PASSWORD_DENYLIST = frozenset({
    "test123456", "password", "qwerty", "qwerty123",
    "12345678", "11111111", "abc12345", "admin123",
    "iloveyou", "123456789",
})


def check_password_strength(pw: str) -> str:
    """校验密码强度，不匹配抛 ValueError（供 pydantic field_validator 使用）。

    校验顺序：
      1) 正则：≥8 位且同时含字母与数字（提示消息含「密码强度不足」字样，匹配 PRD §2.3 AC-1.5）
      2) 黑名单：大小写精确匹配（提示消息含「过于常见」字样，匹配 PRD §2.3 AC-1.6）
         不再做 .lower() 转换，避免误伤形如 'Abc12345' 这类变形密码（P0-B T01 修复）。
    仅用于注册 / 修改密码两个入口；登录不走此校验，
    存量弱密码用户登录不受影响（守卫式，不动表结构）。
    """
    if not _PASSWORD_STRONG_RE.match(pw or ""):
        raise ValueError("密码强度不足：需至少 8 位，且同时包含字母和数字")
    if (pw or "") in _WEAK_PASSWORD_DENYLIST:
        raise ValueError("该密码过于常见，请更换为更复杂的密码")
    return pw


# ---------- 邮箱格式（R73 邮箱绑定） ----------
# 基础格式校验：含 @ 且域名部分含点（不做 MX 探测，仅拦截明显非法输入）。
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str) -> str:
    """规范化邮箱：去空格 + 统一小写（邮箱大小写不敏感）。"""
    return (email or "").strip().lower()


def check_email_format(email: str) -> str:
    """基础邮箱格式校验（含 @ 与域名点），非法抛 ValueError（→ pydantic 422）。

    返回值恒为规范化后的邮箱（小写去空格），供路由层直接落库/比对。
    """
    e = normalize_email(email)
    if not _EMAIL_RE.match(e):
        raise ValueError("邮箱格式不正确")
    return e


# ---------- 请求 ----------
class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    password: str = Field(min_length=8, max_length=64)
    nickname: str = Field(default="", max_length=20)

    # 注册入口校验密码强度（P0-B T01）
    @field_validator("password")
    @classmethod
    def _check_password(cls, v: str) -> str:
        return check_password_strength(v)


class LoginIn(BaseModel):
    """登录：登录标识兼容「用户名」与「绑定邮箱」。

    向后兼容：老前端仍发 username；新前端可发 account（用户名或邮箱）。
    路由层取 account 优先、username 兜底，两者皆空则 400。
    """
    username: str = ""
    account: str = ""
    password: str


class RefreshIn(BaseModel):
    refresh: str = Field(min_length=1)


class ChangePasswordIn(BaseModel):
    """修改密码（A6）：旧密码校验 + 新密码强度（≥8 位且含字母和数字）。"""
    oldPassword: str = Field(min_length=1, max_length=64)
    newPassword: str = Field(min_length=8, max_length=64)

    # 修改密码入口校验新密码强度（P0-B T01）
    @field_validator("newPassword")
    @classmethod
    def _check_new_password(cls, v: str) -> str:
        return check_password_strength(v)


class EmailSendCodeIn(BaseModel):
    """POST /api/auth/email/send-code：发送邮箱验证码。purpose: bind / reset。"""
    email: str = Field(min_length=3, max_length=128)
    purpose: str = Field(default="bind")

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return check_email_format(v)


class EmailVerifyIn(BaseModel):
    """POST /api/auth/email/verify：校验邮箱验证码。"""
    email: str = Field(min_length=3, max_length=128)
    code: str = Field(min_length=4, max_length=8)
    purpose: str = Field(default="bind")

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return check_email_format(v)


class EmailBindIn(BaseModel):
    """POST /api/auth/email/bind：绑定邮箱（需登录）。"""
    email: str = Field(min_length=3, max_length=128)
    code: str = Field(min_length=4, max_length=8)

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return check_email_format(v)


class FindAccountIn(BaseModel):
    """POST /api/auth/find-account：用已验证邮箱找回账号（可选重置密码）。"""
    email: str = Field(min_length=3, max_length=128)
    code: str = Field(min_length=4, max_length=8)
    newPassword: str | None = Field(default=None, max_length=64)

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return check_email_format(v)

    @field_validator("newPassword")
    @classmethod
    def _check_new_password(cls, v):
        if v is None:
            return v
        return check_password_strength(v)


class ProfileIn(BaseModel):
    nickname: str = Field(default="", max_length=20)
    motto: str = Field(default="", max_length=60)
    bio: str = Field(default="", max_length=300)
    gender: str = Field(default="secret", max_length=16)
    birthday: str = Field(default="", max_length=10)
    city: str = Field(default="", max_length=64)
    phone: str = Field(default="", max_length=20)
    goal: str = Field(default="", max_length=120)
    tags: str = Field(default="", max_length=300)


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=200_000)
    category: str = "other"
    privacy: str = "public"
    status: str = "draft"
    cover: str = ""
    tags: list[str] = []


class NotePatch(BaseModel):
    """归档/恢复等局部更新。"""
    status: str | None = None
    privacy: str | None = None


class CommentIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    # 可选：回复某条评论（对应 comments.parent_id）。缺省为顶层评论。
    parent_id: int | None = None


class ChatIn(BaseModel):
    provider: str
    modelId: str | None = None   # 可选：前端 ai-config.js 的模型 id（额度账本 / 模型路由）
    messages: list[dict]
    noteId: int | None = None        # 可选：让 AI 读取这篇笔记作为上下文（作者本人笔记或公开笔记）
    temperature: float | None = None  # 0~2，缺省用服务商默认
    maxTokens: int | None = None      # 可选：输出上限


class MigrateIn(BaseModel):
    notes: list[dict]


class PrivacyIn(BaseModel):
    """隐私设置部分更新（T03 增量，PUT /api/users/me/privacy）。

    三字段均为「可选、部分更新」：只更新显式传入的字段。
    - momentVisibility ∈ public/friends/private
    - friendAllow ∈ everyone/need_confirm/nobody
    - searchable：API 层 bool，DB 层 INTEGER 0/1
    未传入字段保持 None，由路由层区分「未提供」与「显式值」。
    """
    momentVisibility: str | None = None
    friendAllow: str | None = None
    searchable: bool | None = None


# ---------- 增量（2026-09-11）：群聊 / 动态 / 反馈 / 学习统计 ----------

class GroupCreateIn(BaseModel):
    """建群：成员须均为我的好友，含创建者共 2~50 人。"""
    name: str = Field(min_length=1, max_length=20)
    memberIds: list[int] = Field(min_length=2, max_length=49)


def clamp_duration(v) -> int | None:
    """语音消息时长夹取（私聊语音 duration）：None/非法 → None，其余夹取到 1~600 秒。

    私聊入口 routers/chat.py SendMsgIn 与群聊 GroupMsgIn 共用，保证两通道口径一致。
    """
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return max(1, min(600, n))


class GroupMsgIn(BaseModel):
    content: str = Field(max_length=5000)
    kind: str = "text"  # text / image / voice / location / location_live
    # 批5：群聊位置消息从零打通 —— 可选坐标字段；旧客户端不传 → 默认空值，零影响
    sub: str = ""
    lat: float | None = None
    lng: float | None = None
    precise: bool = False
    # 语音时长（秒）：可选；经 clamp_duration 夹取 1~600，缺省 None。
    # 群聊线（groups.py）暂不读取/落库，仅保证契约与私聊一致（前向兼容）。
    duration: int | None = None

    @field_validator("duration")
    @classmethod
    def _clamp_duration(cls, v):
        return clamp_duration(v)


class GroupReadIn(BaseModel):
    upToId: int = Field(gt=0)


class GroupPatchIn(BaseModel):
    """改群名 / 群公告 / 群头像（T04 D1 + R53）：部分更新。

    长度/空值不走 pydantic 约束，统一在路由层抛中文 400
    （空群名→「群名称不能为空」/超长→「群名称最长 20 字」/公告超长→「公告最长 300 字」）。

    R53 群头像 avatar 取值三选一（前端保证，后端只做长度/前缀校验）：
      - "/uploads/images/xxx.png"：上传图片（走 POST /api/uploads/image）
      - "color:#RRGGBB"：纯色块
      - 单个 emoji / 短文本：兜底展示
    """
    name: str | None = None
    announcement: str | None = None
    avatar: str | None = None


class GroupMeIn(BaseModel):
    """设置我在本群的群名片（T04，D5）：空串 = 清除，回退全局昵称。"""
    groupNickname: str | None = None


class FriendRemarkIn(BaseModel):
    """好友备注（Bug3，R72）：PUT /api/friends/{peer_id}/remark 请求体。

    - 空串 / 去空格后为空 = 删除该备注（回退显示对方昵称）；
    - 长度由路由层截断到 20 字（此处不设 max_length，避免超长直接 422，
      统一走「截断」语义，与群名片 groupNickname 的处理风格一致）。
    - 警告：不要把备注塞进 schemas.user_brief()：它被 notes/moments/social 多处复用，
      塞进去会污染公开契约。
    """
    remark: str | None = None


class GroupTransferIn(BaseModel):
    """群主转让（R54，2026-09-14）：仅群主可把群主身份转给某个现有成员。"""
    userId: int


class MomentIn(BaseModel):
    content: str = Field(default="", max_length=2000)
    images: list[str] = Field(default=[], max_length=9)


class MomentCommentIn(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class FeedbackIn(BaseModel):
    type: str = Field(default="other", max_length=16)
    content: str = Field(min_length=10, max_length=2000)
    screenshot: str | None = Field(default=None, max_length=256)
    anonymous: bool = False


class StudyLogItem(BaseModel):
    module: str = Field(max_length=16)
    event: str = Field(max_length=32)
    payload: dict = Field(default={})
    createdAt: str = Field(max_length=19)


class StudyLogBatchIn(BaseModel):
    logs: list[StudyLogItem] = Field(min_length=1, max_length=100)


# ---------- 序列化 ----------
def user_brief(u) -> dict:
    return {
        "id": u.id,
        "nickname": u.nickname,
        "avatarUrl": u.avatar,
    }


def privacy_of(u) -> dict:
    """隐私三项全量视图（T03 增量）：仅用于本人 /api/auth/me 与 PUT /me/privacy 响应。

    - momentVisibility / friendAllow：老库/存量行取默认值（friends / need_confirm）。
    - searchable：对外恒为 bool；存量 NULL（历史行）视为可搜索 True。
    """
    raw = getattr(u, "searchable", 1)
    return {
        "momentVisibility": getattr(u, "moment_visibility", None) or "friends",
        "friendAllow": getattr(u, "friend_allow", None) or "need_confirm",
        "searchable": not (raw is not None and raw == 0),
    }


def note_tags(n) -> list:
    try:
        v = json.loads(n.tags or "[]")
        return v if isinstance(v, list) else []
    except Exception:
        return []


def note_card(n, *, liked=False, favorited=False, with_content=False) -> dict:
    """列表卡片（不含正文，除非 with_content=True）。"""
    d = {
        "id": n.id,
        "userId": n.user_id,
        "author": user_brief(n.author),
        "title": n.title,
        "category": n.category,
        "privacy": n.privacy,
        "status": n.status,
        "cover": n.cover or "",
        "tags": note_tags(n),
        "excerpt": n.excerpt,
        "views": n.views,
        "likes": n.likes_count,
        "commentsCount": n.comments_count,
        "liked": liked,
        "favorited": favorited,
        "createdAt": n.created_at,
        "updatedAt": n.updated_at,
        "deletedAt": n.deleted_at or "",
    }
    if with_content:
        d["content"] = n.content
    return d


def note_detail(n, *, liked=False, favorited=False, prev=None, nxt=None) -> dict:
    d = note_card(n, liked=liked, favorited=favorited, with_content=True)
    d["comments"] = [
        {
            "id": c.id,
            "userId": c.user_id,
            # 空值防御（2026-09-11 热修）：作者已注销时 author 为 None，避免再次 500。
            # 文案「已注销用户」沿用 social.py 既有写法，保持一致。
            "nickname": c.author.nickname if c.author else "已注销用户",
            "avatarUrl": c.author.avatar if c.author else None,
            "text": c.content,
            "time": c.created_at,
        }
        for c in reversed(n.comments)  # 新评论在前
    ]
    d["prev"] = {"id": prev.id, "title": prev.title} if prev else None
    d["next"] = {"id": nxt.id, "title": nxt.title} if nxt else None
    return d
