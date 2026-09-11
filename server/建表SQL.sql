-- ============================================================
-- 学习工作台 · 多人博客 SQLite 建表 SQL
-- 说明：后端使用 SQLAlchemy ORM，首次启动会自动按本结构建表；
--       本文件供人工核对 / 手工初始化 / 数据库设计评审使用。
-- ============================================================

PRAGMA foreign_keys = ON;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,          -- 登录账号（3-20位字母/数字/中文/下划线）
  password_hash TEXT    NOT NULL,                 -- PBKDF2-SHA256（盐 + 12万轮迭代）
  nickname      TEXT    NOT NULL,                 -- 昵称（对外展示）
  motto         TEXT    NOT NULL DEFAULT '',      -- 个性签名
  moment_visibility TEXT NOT NULL DEFAULT 'friends',      -- 动态可见范围：public/friends/private（T03 增量）
  friend_allow  TEXT    NOT NULL DEFAULT 'need_confirm',  -- 谁可加我：everyone/need_confirm/nobody（T03 增量）
  searchable    INTEGER NOT NULL DEFAULT 1,        -- 能否被搜索：1=可 / 0=不可（T03 增量）
  avatar        TEXT,                             -- 头像 URL（/uploads/avatars/xxx，NULL=默认emoji）
  created_at    TEXT    NOT NULL                  -- 'YYYY-MM-DD HH:MM'
);

-- 笔记表
CREATE TABLE IF NOT EXISTS notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  category      TEXT    NOT NULL DEFAULT 'other', -- cet/exam/comm/interview/ppt/other
  privacy       TEXT    NOT NULL DEFAULT 'public' CHECK (privacy IN ('public','private')),
  status        TEXT    NOT NULL DEFAULT 'draft'  CHECK (status IN ('published','draft','archived')),
  cover         TEXT,                             -- 封面图URL或emoji（可空）
  tags          TEXT    NOT NULL DEFAULT '[]',    -- JSON 数组字符串，如 ["四级","词汇"]
  content       TEXT    NOT NULL DEFAULT '',       -- Markdown 正文
  excerpt       TEXT    NOT NULL DEFAULT '',       -- 摘要（列表展示用）
  views         INTEGER NOT NULL DEFAULT 0,
  likes_count   INTEGER NOT NULL DEFAULT 0,       -- 冗余计数，等于 likes 表行数
  comments_count INTEGER NOT NULL DEFAULT 0,       -- 冗余计数，等于 comments 表行数
  deleted_at    TEXT,                              -- 软删除标记：NULL=正常；非空=已在回收站
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user    ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_plaza   ON notes(status, privacy, created_at); -- 广场列表

-- 点赞表（一人一篇最多一次）
CREATE TABLE IF NOT EXISTS likes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  UNIQUE (note_id, user_id)
);

-- 收藏表（一人一篇最多一次）
CREATE TABLE IF NOT EXISTS favorites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  UNIQUE (note_id, user_id)
);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_note ON comments(note_id);

-- 消息通知表（收到点赞 / 评论时写入，通知笔记作者）
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- 收信人（笔记作者）
  actor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- 触发人（点赞/评论者）
  type       TEXT    NOT NULL CHECK (type IN ('like','comment','moment_like','moment_comment')),
  note_id    INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  is_read    INTEGER NOT NULL DEFAULT 0,          -- 0 未读 / 1 已读
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);

-- ============================================================
-- 以下为 2026-09-11 增量新增（群聊 / 动态 / 反馈 / 学习统计）
-- 旧库升级由 database._upgrade_legacy_schema() 守卫式 ALTER 完成；
-- 新表由 SQLAlchemy create_all 自动创建，此处为同步 DDL。
-- ============================================================

-- 聊天消息表补列：group_id NULL=私聊，非空=群消息
-- （若 messages 表已存在则手工执行：ALTER TABLE messages ADD COLUMN group_id INTEGER REFERENCES chat_groups(id) ON DELETE CASCADE;）

-- 群聊表
CREATE TABLE IF NOT EXISTS chat_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,                          -- 群名（≤20 字）
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avatar     TEXT,                                      -- 群头像 URL（默认 NULL，前端九宫格拼图占位）
  announcement TEXT  NOT NULL DEFAULT '',               -- 群公告（≤300 字，T03 增量）
  created_at TEXT    NOT NULL
);

-- 群成员表（last_read_msg_id 为每人独立推进的群已读游标）
CREATE TABLE IF NOT EXISTS chat_group_members (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id         INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             TEXT    NOT NULL DEFAULT 'member',    -- owner / member
  group_nickname   TEXT    NOT NULL DEFAULT '',          -- 群名片（空=用全局昵称，T03 增量）
  last_read_msg_id INTEGER NOT NULL DEFAULT 0,
  joined_at        TEXT    NOT NULL,
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_cgm_user ON chat_group_members(user_id);

-- 个人动态表（仅好友可见）
CREATE TABLE IF NOT EXISTS moments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL DEFAULT '',                -- ≤2000 字
  images     TEXT    NOT NULL DEFAULT '[]',              -- JSON 数组，≤9 个 /uploads/images/ URL
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_moments_user ON moments(user_id, id DESC);

-- 动态点赞表
CREATE TABLE IF NOT EXISTS moment_likes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  moment_id  INTEGER NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  UNIQUE (moment_id, user_id)
);

-- 动态评论表（≤500 字，作者可删他人对自己动态的评论）
CREATE TABLE IF NOT EXISTS moment_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  moment_id  INTEGER NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

-- 帮助与反馈表（匿名时 user_id 仍落库防滥用，对外不回显昵称）
CREATE TABLE IF NOT EXISTS feedbacks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT    NOT NULL DEFAULT 'other',           -- bug/suggest/content/other
  content    TEXT    NOT NULL,                           -- ≥10 字
  screenshot TEXT,                                       -- /uploads/images/ URL（可选 1 张）
  status     TEXT    NOT NULL DEFAULT 'pending',         -- pending / replied
  created_at TEXT    NOT NULL
);

-- 学习行为日志表（统计底座，本地优先 + 云端汇聚）
CREATE TABLE IF NOT EXISTS study_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module     TEXT    NOT NULL,                           -- cet4/xingce/eq/etiquette/ppt/tools
  event      TEXT    NOT NULL,                           -- start/finish/task/answer/tool_use...
  payload    TEXT    NOT NULL DEFAULT '{}',              -- JSON（题型、正确数等）
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_study_user_module ON study_logs(user_id, module, created_at);
