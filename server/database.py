"""数据库：SQLAlchemy ORM 模型（表结构见 建表SQL.sql）。"""
from datetime import datetime

from sqlalchemy import (Boolean, Column, ForeignKey, Integer, String, Text,
                        UniqueConstraint, create_engine, or_, text)
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


class Message(Base):
    """聊天消息。kind: text / image。content: 文本内容或图片 URL。read_at NULL=对方未读。
    group_id NULL=私聊（按 sender/receiver 查询）；group_id 非空=群消息（receiver_id 恒为 0）。"""
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    group_id = Column(Integer, ForeignKey("chat_groups.id", ondelete="CASCADE"), nullable=True)
    kind = Column(String(16), nullable=False, default="text")
    content = Column(Text, nullable=False, default="")
    read_at = Column(String(19), nullable=True)
    created_at = Column(String(19), nullable=False)

    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])


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


def init_db() -> None:
    Base.metadata.create_all(engine)
    _upgrade_legacy_schema()


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
