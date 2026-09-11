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
    avatar = Column(String(256), nullable=True)
    last_seen_at = Column(String(19), nullable=True)  # 最近一次鉴权请求时间（在线状态展示）
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
    content = Column(String(2000), nullable=False)
    created_at = Column(String(16), nullable=False)
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


def init_db() -> None:
    Base.metadata.create_all(engine)
    _upgrade_legacy_schema()


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
