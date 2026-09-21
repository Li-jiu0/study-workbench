"""数据库：SQLAlchemy ORM 模型（表结构见 建表SQL.sql）。"""
from datetime import datetime

from sqlalchemy import (Boolean, Column, DateTime, Float, ForeignKey, Integer, String,
                        Text, UniqueConstraint, create_engine, or_, text)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

from config import DB_URL

engine = create_engine(DB_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def now_str() -> str:
    """统一时间格式 'YYYY-MM-DD HH:MM'（与前端 fmtTime 兼容）。"""
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def now_iso() -> str:
    """带秒的完整时间 'YYYY-MM-DD HH:MM:SS'，用于聊天等需要精确排序的场景。"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(32), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    nickname = Column(String(64), nullable=False)
    motto = Column(String(256), nullable=False, default="")
    bio = Column(String(300), nullable=False, default="")  # 个人简介
    gender = Column(String(16), nullable=False, default="secret")  # secret/male/female
    birthday = Column(String(10), nullable=False, default="")      # YYYY-MM-DD
    city = Column(String(64), nullable=False, default="")          # 所在城市
    phone = Column(String(20), nullable=False, default="")         # 手机号（私密，仅自己可见）
    goal = Column(String(120), nullable=False, default="")         # 学习目标（公开主页展示）
    tags = Column(String(300), nullable=False, default="")         # 备考方向标签，逗号分隔（公开主页展示）
    # 隐私三字段（T03 增量 2026-09-11）：账户级默认，默认值 = 现状行为（老用户零感知升级）
    moment_visibility = Column(String(16), nullable=False, default="friends")  # public/friends/private（动态可见范围）
    friend_allow = Column(String(16), nullable=False, default="need_confirm")  # everyone/need_confirm/nobody（谁可加我）
    searchable = Column(Integer, nullable=False, default=1)                    # 1=可被搜索 / 0=不可被搜索
    avatar = Column(String(256), nullable=True)
    last_seen_at = Column(String(19), nullable=True)  # 最近一次鉴权请求时间（在线状态展示）
    # 最近一次「查看好友申请列表」时间（互动页申请角标 unreadCount 的已读水位线）。
    # 写入用 now_iso()（19 字符 'YYYY-MM-DD HH:MM:SS'），与 friend_requests.created_at
    # 同格式同长度，可做定长字符串比较；NULL = 从未查看过。
    last_request_seen_at = Column(String(19), nullable=True)
    # 已读「主」水位线：seen 时记录当时 pending incoming 的最大申请 id（0 = seen 时无
    # pending）。id 单调递增，用它计数可根治秒级时间戳「同一秒内新申请被当已读」的
    # 同秒边界（BUG-2）。NULL = 存量用户（列刚加、还没重新 seen 过）→ 回退时间路径。
    last_seen_request_id = Column(Integer, nullable=True)
    # 令牌版本号（A6/B3）：本批只加列不启用鉴权校验（避免全站鉴权风险），
    # 「退出所有设备」的签发/校验留到批次二 B3 落地。
    token_version = Column(Integer, nullable=False, default=0)
    # 需求01（2026-09-13）：管理员超级账号标记。1=管理员。
    # 单向可见：不出现在普通用户的好友列表 / 用户搜索 / 在线状态里；
    # 但私信通道对其放行（普通用户可主动给管理员发私信，管理员可回复）。
    # 默认 0，存量用户行为零变化。
    # 注：用户活跃时间复用同表 last_seen_at（security._touch_last_seen 已在每次
    # 鉴权请求节流刷新，60s 粒度），不另建 last_active 列，避免双份数据不一致。
    is_admin = Column(Boolean, nullable=False, default=False)
    # R73（邮箱绑定）：email 唯一（可空；SQLite 唯一索引允许并存多个 NULL，存量用户不冲突），
    # email_verified_at 记录验证通过时间（未验证为 NULL）。
    email = Column(String(128), unique=True, nullable=True, index=True)
    email_verified_at = Column(DateTime, nullable=True)
    # R141/R142（2026-09-21）：账号（account）—— 用户对外可见的「账号」，**可用于登录**。
    # - 语义（用户 2026-09-21 纠正后口径）：它就是**用户注册 / 登录所用的那个账号**，
    #   默认取注册账号 username（init_db 会做一次性口径纠偏），用户可自助改（30 天一次，
    #   频率限制复用 routers/users.py 的 profile_change_log 表，字段名 'account'）。
    # - username 作为注册时的原始账号**保留不变**（仍可登录），避免用户改号后自锁。
    # - 唯一（可空；SQLite 唯一索引允许多个 NULL，存量行由 _ensure_account 惰性补齐）；
    #   唯一性与登录匹配均按「忽略大小写」比较（见 users._account_taken / auth.login）。
    # - 格式：3~20 位中文 / 字母 / 数字 / 下划线（校验在 schemas.check_account_format）。
    # - ⚠️ 隐私边界：account 属登录标识 → **仅本人 /api/auth/me 与登录/注册/刷新响应
    #   （_auth_payload）、以及「本人或好友」查看资料时（users.public_profile）可见**；
    #   用户搜索 / 好友列表 / 陌生人主页一律不返回（用户要求：好友能互看账号）。
    account = Column(String(32), unique=True, nullable=True, index=True)
    created_at = Column(String(16), nullable=False)

    notes = relationship("Note", back_populates="author", cascade="all, delete-orphan")


class Note(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    category = Column(String(32), nullable=False, default="other")
    privacy = Column(String(16), nullable=False, default="public")   # public / private
    status = Column(String(16), nullable=False, default="draft")      # published / draft / archived
    cover = Column(String(512), nullable=True)
    tags = Column(Text, nullable=False, default="[]")
    content = Column(Text, nullable=False, default="")
    excerpt = Column(String(300), nullable=False, default="")
    views = Column(Integer, nullable=False, default=0)
    likes_count = Column(Integer, nullable=False, default=0)
    comments_count = Column(Integer, nullable=False, default=0)
    deleted_at = Column(String(16), nullable=True, default=None)  # 软删除标记，NULL=正常
    created_at = Column(String(16), nullable=False)
    updated_at = Column(String(16), nullable=False)

    author = relationship("User", back_populates="notes")
    comments = relationship("Comment", back_populates="note", cascade="all, delete-orphan")
    likes = relationship("Like", back_populates="note", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="note", cascade="all, delete-orphan")


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (UniqueConstraint("note_id", "user_id", name="uq_like"),)
    id = Column(Integer, primary_key=True)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(String(16), nullable=False)
    note = relationship("Note", back_populates="likes")


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("note_id", "user_id", name="uq_favorite"),)
    id = Column(Integer, primary_key=True)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(String(16), nullable=False)
    note = relationship("Note", back_populates="favorites")


class Comment(Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # 评论作者关系（2026-09-11 热修）：schemas.note_detail 一直在访问 c.author，
    # 但模型缺该关系 → 有评论的帖子 GET /api/notes/{id} 抛 AttributeError 500。
    # 写法照抄 BoardMessage/BoardReply：带 foreign_keys 指定外键，不用 back_populates
    # （User 上没有对应的 comments 关系）。
    author = relationship("User", foreign_keys=[user_id])
    content = Column(String(2000), nullable=False)
    created_at = Column(String(16), nullable=False)
    # 回复目标评论 id（NULL = 顶层评论）。2026-09-11 补齐：social.py 的评论接口一直在用它。
    parent_id = Column(Integer, nullable=True)
    note = relationship("Note", back_populates="comments")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)  # 收信人
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)  # 触发人
    type = Column(String(16), nullable=False)  # like / comment
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(String(16), nullable=False)

    actor = relationship("User", foreign_keys=[actor_id])
    note = relationship("Note")


class FriendRequest(Base):
    """好友申请。status: pending / accepted / declined。"""
    __tablename__ = "friend_requests"
    id = Column(Integer, primary_key=True)
    from_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    to_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(16), nullable=False, default="pending")
    created_at = Column(String(19), nullable=False)

    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user = relationship("User", foreign_keys=[to_user_id])


class Friend(Base):
    """好友关系（单向存储归一化为 a<b，保证唯一，查询双向都命中）。"""
    __tablename__ = "friends"
    __table_args__ = (UniqueConstraint("user_a", "user_b", name="uq_friend_pair"),)
    id = Column(Integer, primary_key=True)
    user_a = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user_b = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(String(19), nullable=False)


class UserBlock(Base):
    """黑名单：blocker 屏蔽 blocked（单向）。"""
    __tablename__ = "user_blocks"
    __table_args__ = (UniqueConstraint("blocker_id", "blocked_id", name="uq_block"),)
    id = Column(Integer, primary_key=True)
    blocker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    blocked_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(String(19), nullable=False)


class FriendRemark(Base):
    """好友备注（Bug3，R72）：owner 对 peer 的私有备注名，仅本人可见。

    - 空串/去空格后为空 = 无备注（路由层删除该行）；
    - 唯一约束 (owner_id, peer_id)：同一人对同一好友只存一条；
    - 不改 friends 表结构（历史库零迁移），备注属「本人私有」，与好友关系解耦。
    """
    __tablename__ = "friend_remarks"
    __table_args__ = (UniqueConstraint("owner_id", "peer_id", name="uq_friend_remark"),)
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    peer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    remark = Column(String(20), nullable=False, default="")
    updated_at = Column(String(19), nullable=False)


class Message(Base):
    """聊天消息。kind: text / image / voice / location（location 为私聊位置消息）。
    content: 文本内容，或图片 / 语音 URL（location 时可存地点名，亦允许空串）。
    read_at NULL=对方未读。
    group_id NULL=私聊（按 sender/receiver 查询）；group_id 非空=群消息（receiver_id 恒为 0）。

    R104 项3（位置消息）：location 消息的坐标与地点副标题存于 sub / lat / lng；
    旧消息 / 非位置消息此三列为空（sub=''、lat/lng=NULL），前端走纯文字回退。
    R104d 批4：precise=True 表示用户实时精确定位（「我的位置」）；False / 旧消息 = 用户选择的地点。
    批5：kind 另增 location_live（实时位置共享系统卡片；sub=shareId，**不含坐标**）。
    """
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    group_id = Column(Integer, ForeignKey("chat_groups.id", ondelete="CASCADE"), nullable=True)
    kind = Column(String(16), nullable=False, default="text")
    content = Column(Text, nullable=False, default="")
    sub = Column(Text, nullable=False, default="")  # 位置消息地点副标题（非位置消息恒为 ''）
    lat = Column(Float, nullable=True)  # 位置消息纬度（旧消息 / 非位置消息为 NULL）
    lng = Column(Float, nullable=True)  # 位置消息经度（旧消息 / 非位置消息为 NULL）
    precise = Column(Boolean, nullable=False, default=False)  # R104d：True=实时精确定位；False/旧消息=选的地点
    # 语音消息时长（秒，1~600）：仅 kind=voice 携带；旧消息 / 非语音为 NULL（前端显示「语音」占位）
    duration = Column(Integer, nullable=True)
    # R3b-C U9（长按引用）：微信式「引用 / 回复」四个可空列，全部守卫式 ALTER 加列（存量库零破坏）。
    #   reply_to_id：被引用消息 id（逻辑外键，不做 DB 级 FK —— 被引用消息可能已被删除 / 撤回）；
    #   reply_sender_name / reply_kind / reply_text：冗余「最小快照」，避免被引用消息删/撤后引用空白。
    # 非引用消息 / 旧消息此四列全 NULL，前端按「无引用」正常渲染。
    reply_to_id = Column(Integer, nullable=True)
    reply_sender_name = Column(String(64), nullable=True)
    reply_kind = Column(String(16), nullable=True)
    reply_text = Column(String(100), nullable=True)
    read_at = Column(String(19), nullable=True)
    created_at = Column(String(19), nullable=False)

    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])


class LiveLocation(Base):
    """批5：实时位置共享会话元数据（**只存会话，不存坐标流**）。

    - 每会话一行；state: active / ended；expires_at 到点即视为结束（惰性判定，无后台线程）；
    - last_lat/last_lng/last_seen 仅保留「最近一次心跳坐标」（供进程重启后 state 兜底），
      由 ≥30s 一次的同 ID UPDATE 刷新，**绝不做轨迹追加写入**；
    - 新表由 init_db 的 create_all（CREATE TABLE IF NOT EXISTS 语义）自动建，存量库零 ALTER。

    隐私红线：只保留当前/最后一点坐标，不保留历史轨迹；日志绝不打印 lat/lng 明文。
    """
    __tablename__ = "live_locations"
    id = Column(Integer, primary_key=True)
    share_id = Column(String(36), unique=True, nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    peer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    group_id = Column(Integer, ForeignKey("chat_groups.id", ondelete="CASCADE"), nullable=True)
    state = Column(String(16), nullable=False, default="active")   # active / ended
    last_lat = Column(Float, nullable=True)
    last_lng = Column(Float, nullable=True)
    last_seen = Column(String(19), nullable=True)                  # now_iso()
    created_at = Column(String(19), nullable=False)
    expires_at = Column(String(19), nullable=False)


class ChatGroup(Base):
    """群聊（P0-3）。name ≤20 字；owner 为创建者。"""
    __tablename__ = "chat_groups"
    id = Column(Integer, primary_key=True)
    name = Column(String(64), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    avatar = Column(String(256), nullable=True)  # 群头像 URL，P0 默认 NULL（前端九宫格拼图占位）
    announcement = Column(Text, nullable=False, default="")  # 群公告（T03 增量 2026-09-11，≤300 字）
    created_at = Column(String(19), nullable=False)

    owner = relationship("User", foreign_keys=[owner_id])


class ChatGroupMember(Base):
    """群成员。role: owner / member。last_read_msg_id 为群已读游标（每人独立推进）。"""
    __tablename__ = "chat_group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_member"),)
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("chat_groups.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(16), nullable=False, default="member")
    group_nickname = Column(Text, nullable=False, default="")  # 群名片（T03 增量 2026-09-11，空=用全局昵称）
    last_read_msg_id = Column(Integer, nullable=False, default=0)
    joined_at = Column(String(19), nullable=False)


class Moment(Base):
    """个人动态（朋友圈式，P0-4）。仅好友可见；images 为 JSON 数组字符串（≤9 个 /uploads/images/ URL）。"""
    __tablename__ = "moments"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False, default="")
    images = Column(Text, nullable=False, default="[]")
    created_at = Column(String(19), nullable=False)


class MomentLike(Base):
    """动态点赞（一人一条最多一次）。"""
    __tablename__ = "moment_likes"
    __table_args__ = (UniqueConstraint("moment_id", "user_id", name="uq_moment_like"),)
    id = Column(Integer, primary_key=True)
    moment_id = Column(Integer, ForeignKey("moments.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(String(19), nullable=False)


class MomentComment(Base):
    """动态评论。≤500 字；作者可删他人对自己动态的评论。"""
    __tablename__ = "moment_comments"
    id = Column(Integer, primary_key=True)
    moment_id = Column(Integer, ForeignKey("moments.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(String(500), nullable=False)
    created_at = Column(String(19), nullable=False)


class Feedback(Base):
    """帮助与反馈（P0-7）。user_id 匿名时仍落库（防滥用），对外不回显昵称。
    type: bug / suggest / content / other；status: pending / replied。"""
    __tablename__ = "feedbacks"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    type = Column(String(16), nullable=False, default="other")
    content = Column(Text, nullable=False)
    screenshot = Column(String(256), nullable=True)
    status = Column(String(16), nullable=False, default="pending")
    created_at = Column(String(19), nullable=False)
    # 需求01（2026-09-13）：管理员回复。reply 空串 = 未回复；replied_at NULL = 未回复。
    reply = Column(Text, nullable=False, default="")
    replied_at = Column(String(19), nullable=True)


class StudyLog(Base):
    """学习行为日志（P0-8 统计底座）。module: cet4/xingce/eq/etiquette/ppt/tools。"""
    __tablename__ = "study_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module = Column(String(16), nullable=False)
    event = Column(String(32), nullable=False)
    payload = Column(Text, nullable=False, default="{}")  # JSON（题型、正确数等）
    created_at = Column(String(19), nullable=False)


class BoardMessage(Base):
    """留言板：所有人可见的公开留言。"""
    __tablename__ = "board_messages"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(String(500), nullable=False)
    created_at = Column(String(16), nullable=False)
    likes_count = Column(Integer, nullable=False, default=0)
    replies_count = Column(Integer, nullable=False, default=0)
    author = relationship("User", foreign_keys=[user_id])


class BoardLike(Base):
    """留言板点赞。"""
    __tablename__ = "board_likes"
    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, ForeignKey("board_messages.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(String(16), nullable=False)
    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_board_like"),)


class BoardReply(Base):
    """留言板回复。"""
    __tablename__ = "board_replies"
    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, ForeignKey("board_messages.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(String(300), nullable=False)
    created_at = Column(String(16), nullable=False)
    author = relationship("User", foreign_keys=[user_id])


class AiUsage(Base):
    """AI 每日调用计数（用于限额/防滥用）。"""
    __tablename__ = "ai_usage"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_ai_usage_day"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    day = Column(String(10), nullable=False)  # 'YYYY-MM-DD'
    count = Column(Integer, nullable=False, default=0)


class AiLog(Base):
    """AI 对话记录（多设备可见）。role: user / assistant。"""
    __tablename__ = "ai_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(16), nullable=False)
    content = Column(Text, nullable=False, default="")
    provider = Column(String(32), nullable=False, default="")
    created_at = Column(String(19), nullable=False)


class EmailCode(Base):
    """邮箱验证码（R73 邮箱绑定）。

    - code_hash：仅存哈希（复用 security.hash_password），绝不落明文；
    - purpose  ：bind（绑定）/ reset（找回账号 / 重置密码）；
    - user_id  ：可空（预留审计用途）；
    - used     ：一次性消费后置 1；attempts：错误累计，达到上限即作废；
    - expires_at：10 分钟有效期。
    """
    __tablename__ = "email_codes"
    id = Column(Integer, primary_key=True)
    email = Column(String(128), nullable=False, index=True)
    code_hash = Column(Text, nullable=False)
    purpose = Column(String(16), nullable=False, default="bind")  # bind / reset
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False)


class UserDevice(Base):
    """R105：App 设备信息上报（POST /api/user/device），每用户一行。

    - user_id 主键：同一用户重复上报 = upsert（覆盖 device + 刷新 last_active）；
    - device：前端上报字段的 JSON 串（brand/model/osVersion/appVersion/androidId/
      screenWidth/screenHeight/language，全部可选，长度上限见 routers/device.py）；
    - last_active：最近一次上报时间（now_iso()，'YYYY-MM-DD HH:MM:SS'）。
    新表由 init_db 的 Base.metadata.create_all（CREATE TABLE IF NOT EXISTS 语义）
    自动建表，存量库无需 ALTER、无数据迁移。

    ⚠️ 隐私红线：本表只允许存用户端主动上报的上述白名单字段；严禁收集 / 扩展
    IMEI、IMSI、通讯录、短信、通话记录、剪贴板、定位轨迹等敏感个人信息。
    后续新增字段必须先过隐私合规评审，并在 DeviceIn 同步声明与限长。
    """
    __tablename__ = "user_devices"
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    device = Column(Text, nullable=False, default="{}")
    last_active = Column(String(19), nullable=False)


class UserAppSig(Base):
    """R3-L5：账号与设备安全风控 —— 已安装第三方应用指纹（POST /api/user/installed-apps），每用户一行。

    - user_id 主键：同一用户重复上报 = upsert（覆盖 sigs + 刷新 app_count / updated_at），不膨胀；
    - sigs：包名加盐 SHA-256 的 JSON 数组字符串（如 ["<64hex>", ...]），**不含明文包名**；
    - app_count：本次上报的哈希条数（便于风控侧快速判断设备应用规模突变）；
    - updated_at：最近一次上报时间（now_iso()，'YYYY-MM-DD HH:MM:SS'）。
    新表由 init_db 的 Base.metadata.create_all（CREATE TABLE IF NOT EXISTS 语义）自动建表，
    存量库无需 ALTER、无数据迁移。

    ⚠️ 隐私红线：本表与 user_devices **分开存、单独同意**，仅用于「识别多开/模拟器/异常设备、
    同账号设备突变」等账号安全风控；严禁用于用户画像、广告投放或对外公开。只允许存
    加盐哈希，严禁落盘 / 上传明文包名、应用名、图标、版本，严禁采集 IMEI/IMSI/MAC/
    通讯录/短信/通话记录等敏感个人信息。本表数据不得被普通接口或前端页面读取。
    """
    __tablename__ = "user_app_sigs"
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    sigs = Column(Text, nullable=False, default="[]")
    app_count = Column(Integer, nullable=False, default=0)
    updated_at = Column(String(19), nullable=False)


def friend_pair(a: int, b: int) -> tuple[int, int]:
    """好友表里一律存小号在前，保证 (A,B) 与 (B,A) 是同一行。"""
    return (a, b) if a < b else (b, a)


def is_friend(db: Session, a: int, b: int) -> bool:
    x, y = friend_pair(a, b)
    return db.query(Friend).filter(Friend.user_a == x, Friend.user_b == y).first() is not None


def friend_ids_of(db: Session, uid: int) -> set[int]:
    """一次查出 uid 的全部好友 id（不含自己）。动态可见性、建群校验共用。"""
    rows = db.query(Friend.user_a, Friend.user_b).filter(
        or_(Friend.user_a == uid, Friend.user_b == uid)).all()
    return {b if a == uid else a for a, b in rows}


def is_admin_user(user) -> bool:
    """需求01：是否管理员账号。

    用 getattr 兜底，兼容 is_admin 列缺失的老会话对象 / None 用户（一律视为非管理员），
    避免管理员判断把请求打挂。
    """
    return bool(getattr(user, "is_admin", False))


def can_message(db: Session, a: int, b: int) -> bool:
    """需求01：a 与 b 是否允许互发私信。

    好友之间照旧放行；此外任一方是管理员时额外放行 —— 管理员不在任何人的好友表里
    （单向可见，普通用户的列表里看不到他），但需求要求「普通用户可主动发起私信给
    管理员、管理员可回复」。只用于私信通道，不放大任何其它权限。
    """
    if not a or not b or a == b:
        return False
    if is_friend(db, a, b):
        return True
    return is_admin_user(db.get(User, a)) or is_admin_user(db.get(User, b))


def _table_names() -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
    return {r[0] for r in rows}


def _table_columns(table: str) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {r[1] for r in rows}


def _upgrade_legacy_schema() -> None:
    """对已存在的旧库做无损迁移：仅新增列，不触碰已有数据。"""
    names = _table_names()
    if "notes" in names and "deleted_at" not in _table_columns("notes"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE notes ADD COLUMN deleted_at TEXT"))
    if "users" in names and "bio" not in _table_columns("users"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''"))
    if "users" in names:
        cols = _table_columns("users")
        with engine.begin() as conn:
            if "gender" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'secret'"))
            if "birthday" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN birthday TEXT DEFAULT ''"))
            if "city" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN city TEXT DEFAULT ''"))
            if "phone" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''"))
            if "goal" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN goal TEXT DEFAULT ''"))
            if "tags" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN tags TEXT DEFAULT ''"))
            if "last_seen_at" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN last_seen_at TEXT"))
            if "last_request_seen_at" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN last_request_seen_at TEXT"))
            if "last_seen_request_id" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN last_seen_request_id INTEGER"))
    # 留言板旧表补列（无损）
    if "board_messages" in names:
        bcols = _table_columns("board_messages")
        with engine.begin() as conn:
            if "likes_count" not in bcols:
                conn.execute(text("ALTER TABLE board_messages ADD COLUMN likes_count INTEGER DEFAULT 0"))
            if "replies_count" not in bcols:
                conn.execute(text("ALTER TABLE board_messages ADD COLUMN replies_count INTEGER DEFAULT 0"))
    # 增量升级（2026-09-11）：messages 补群聊归属列；新表（chat_groups 等 7 张）由 create_all 自动建，无需 ALTER
    if "messages" in names and "group_id" not in _table_columns("messages"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE messages ADD COLUMN group_id INTEGER REFERENCES chat_groups(id) ON DELETE CASCADE"))
    # R104 项3（位置消息）：messages 补 sub / lat / lng（守卫式、幂等、无损）。
    # SQLite 无 ADD COLUMN IF NOT EXISTS，先 PRAGMA 判断列存在再 ALTER；
    # sub 带 DEFAULT ''、lat/lng 允许 NULL，存量行自动填默认，老消息前端走纯文字回退。
    if "messages" in names:
        mcols = _table_columns("messages")
        with engine.begin() as conn:
            if "sub" not in mcols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN sub TEXT NOT NULL DEFAULT ''"))
            if "lat" not in mcols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN lat REAL"))
            if "lng" not in mcols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN lng REAL"))
            # R104d 批4：precise 布尔（守卫式、幂等、无损）；存量行默认 0 = 「地点」
            if "precise" not in mcols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN precise BOOLEAN NOT NULL DEFAULT 0"))
            # 语音时长（私聊语音消息）：duration 秒（1~600），可空；旧消息 / 非语音恒为 NULL。
            # 守卫式、幂等、无损：SQLite 无 ADD COLUMN IF NOT EXISTS，先 PRAGMA 判断列存在
            # 再 ALTER，旧库无损补列（存量行自动 NULL），重复启动不会报 duplicate column。
            if "duration" not in mcols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN duration INTEGER"))
            # R3b-C U9（长按引用）：messages 补 reply_to_id / reply_sender_name / reply_kind / reply_text
            # 四个可空列（守卫式、幂等、无损）。SQLite 无 ADD COLUMN IF NOT EXISTS，先 PRAGMA 判断
            # 列存在再 ALTER：存量库自动补 NULL，重复启动不会报 duplicate column name。
            # reply_to_id 为逻辑外键（不建 DB 级 FK）—— 被引用消息可能已被删除 / 撤回，故不做级联。
            if "reply_to_id" not in mcols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN reply_to_id INTEGER"))
            if "reply_sender_name" not in mcols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN reply_sender_name TEXT"))
            if "reply_kind" not in mcols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN reply_kind TEXT"))
            if "reply_text" not in mcols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN reply_text TEXT"))
    # 修复（2026-09-11）：comments.parent_id 缺失导致 social.py 评论接口 AttributeError（生产 500），此处无损补列
    if "comments" in names and "parent_id" not in _table_columns("comments"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE comments ADD COLUMN parent_id INTEGER"))
    # A6 增量（2026-09-11）：users 补 token_version（守卫式、幂等、无损）。
    # 本批只加列不启用校验；批次二 B3「退出所有设备」再落地签发/校验。
    if "users" in names and "token_version" not in _table_columns("users"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0"))
    # 需求01（2026-09-13）：users 补 is_admin（守卫式、幂等、无损）。
    # 先 PRAGMA 判断列是否存在，已有库重复启动不会报 duplicate column name。
    if "users" in names and "is_admin" not in _table_columns("users"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
    # 需求01（2026-09-13）：feedbacks 补 reply / replied_at（守卫式、幂等、无损）。
    if "feedbacks" in names:
        fcols = _table_columns("feedbacks")
        with engine.begin() as conn:
            if "reply" not in fcols:
                conn.execute(text("ALTER TABLE feedbacks ADD COLUMN reply TEXT NOT NULL DEFAULT ''"))
            if "replied_at" not in fcols:
                conn.execute(text("ALTER TABLE feedbacks ADD COLUMN replied_at TEXT"))
    # T03 增量（2026-09-11）：隐私三字段 + 群公告 + 群名片（5 列守卫式 ALTER，幂等、无损）。
    # 默认值 = 现状行为（仅好友可见 / 需验证 / 可被搜索 / 无公告 / 无群名片），老用户零感知。
    if "users" in names:
        cols = _table_columns("users")
        with engine.begin() as conn:
            if "moment_visibility" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN moment_visibility TEXT NOT NULL DEFAULT 'friends'"))
            if "friend_allow" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN friend_allow TEXT NOT NULL DEFAULT 'need_confirm'"))
            if "searchable" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN searchable INTEGER NOT NULL DEFAULT 1"))
    if "chat_groups" in names and "announcement" not in _table_columns("chat_groups"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE chat_groups ADD COLUMN announcement TEXT NOT NULL DEFAULT ''"))
    if "chat_group_members" in names and "group_nickname" not in _table_columns("chat_group_members"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE chat_group_members ADD COLUMN group_nickname TEXT NOT NULL DEFAULT ''"))
    # R73（邮箱绑定）：users 补 email / email_verified_at（守卫式、幂等、无损）。
    # SQLite 无 ADD COLUMN IF NOT EXISTS，故先 PRAGMA 判断列是否存在再 ALTER。
    # 唯一索引 ix_users_email：NULL 互不冲突，存量用户 email 全为 NULL 不受影响。
    if "users" in names:
        ucols = _table_columns("users")
        with engine.begin() as conn:
            if "email" not in ucols:
                conn.execute(text("ALTER TABLE users ADD COLUMN email TEXT"))
            if "email_verified_at" not in ucols:
                conn.execute(text("ALTER TABLE users ADD COLUMN email_verified_at DATETIME"))
        with engine.begin() as conn:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users(email)"))
    # R141/R142（2026-09-21）：users 补 account（**账号**——即用户注册/登录所用的账号；
    # 守卫式、幂等、无损）。
    # SQLite 无 ADD COLUMN IF NOT EXISTS，故先 PRAGMA 判断列是否存在再 ALTER；
    # 唯一索引 ix_users_account：NULL 互不冲突，存量用户 account 全为 NULL → 不受影响，
    # 首个持有者在 /api/auth/me 或登录时由 routers/users._ensure_account 自动补齐
    # （口径：优先取注册账号 username，与「账号就是注册登录的账号」一致）。
    if "users" in names:
        accols = _table_columns("users")
        with engine.begin() as conn:
            if "account" not in accols:
                conn.execute(text("ALTER TABLE users ADD COLUMN account TEXT"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_account ON users(account)"))
    # R142（2026-09-21）一次性口径纠偏：R141 首版把 account 随机生成（如 hfkm9bbh），
    # 与「账号 = 用户注册登录的账号」不符。用户明确纠正后，把**自动生成、且用户从未改过**
    # （profile_change_log 无 field='account' 记录）的 account 重置为注册账号 username。
    # 幂等：重置后 account == username，下次不再命中；用户手动改过的账号一律不动。
    if "users" in names and "profile_change_log" in names:
        with engine.begin() as conn:
            pending = list(conn.execute(text(
                "SELECT u.id, u.username, u.account FROM users u "
                "WHERE u.account IS NOT NULL AND u.account <> u.username "
                "AND u.id NOT IN (SELECT user_id FROM profile_change_log WHERE field = 'account')"
            )))
            if pending:
                taken = {r[0] for r in conn.execute(text(
                    "SELECT account FROM users WHERE account IS NOT NULL"))}
                for uid, uname, acct in pending:
                    uname = (uname or "").strip()
                    if not uname:
                        continue
                    taken.discard(acct)
                    if uname in taken:      # 与现有账号撞名 → 保留原值，不冒险覆盖
                        taken.add(acct)
                        continue
                    conn.execute(text("UPDATE users SET account = :a WHERE id = :i"),
                                 {"a": uname, "i": uid})
                    taken.add(uname)
    # R3-L5（账号与设备安全风控）：user_app_sigs 为【纯新增表】，由 Base.metadata.create_all
    # （CREATE TABLE IF NOT EXISTS 语义）自动建立、存量库零 ALTER。此处仅做一次显式存在性兜底：
    # create_all 在极老版本/异常中断场景可能未建到，故再补一条 IF NOT EXISTS（幂等，重复执行不报错）。
    if "user_app_sigs" not in names:
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE TABLE IF NOT EXISTS user_app_sigs ("
                "user_id INTEGER NOT NULL PRIMARY KEY "
                "REFERENCES users(id) ON DELETE CASCADE, "
                "sigs TEXT NOT NULL DEFAULT '[]', "
                "app_count INTEGER NOT NULL DEFAULT 0, "
                "updated_at TEXT NOT NULL)"))


def init_db() -> None:
    Base.metadata.create_all(engine)
    _upgrade_legacy_schema()


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
