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
  type       TEXT    NOT NULL CHECK (type IN ('like','comment')),
  note_id    INTEGER REFERENCES notes(id) ON DELETE CASCADE,
  is_read    INTEGER NOT NULL DEFAULT 0,          -- 0 未读 / 1 已读
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
