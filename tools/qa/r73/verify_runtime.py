"""R73 read-only review helper #2.

Verifies two runtime facts without touching any project DB:
  A) SQLite connection pragmas from the app engine (foreign_keys / journal_mode / busy_timeout).
  B) routers.moments._can_view references an undefined name `_visibility_allows` (NameError risk).
Writes result to tools/qa/r73/verify_report.txt.
"""
import os
import sys
import tempfile

SERVER_DIR = "D:/\u4e0b\u8f7d\u7684\u6587\u4ef6/\u5b66\u4e60\u5de5\u4f5c\u53f0/server"
OUT_FILE = "D:/\u4e0b\u8f7d\u7684\u6587\u4ef6/\u5b66\u4e60\u5de5\u4f5c\u53f0/tools/qa/r73/verify_report.txt"

tmpdir = tempfile.mkdtemp(prefix="r73_v_")
os.environ["DATABASE_PATH"] = os.path.join(tmpdir, "probe.db")
sys.path.insert(0, SERVER_DIR)

lines = []

# ---- A) engine pragmas ----
from database import engine  # noqa: E402

with engine.connect() as conn:
    fk = conn.exec_driver_sql("PRAGMA foreign_keys").scalar()
    jm = conn.exec_driver_sql("PRAGMA journal_mode").scalar()
    bt = conn.exec_driver_sql("PRAGMA busy_timeout").scalar()
    lines.append("A) engine pragmas: foreign_keys=%s journal_mode=%s busy_timeout=%s" % (fk, jm, bt))
    lines.append("   engine url=%s" % str(engine.url))
    lines.append("   pool class=%s" % type(engine.pool).__name__)

# ---- B) moments undefined name ----
from routers import moments  # noqa: E402

fn = moments._can_view
names = set(fn.__code__.co_names)
has_def = hasattr(moments, "_visibility_allows")
lines.append("B) moments._can_view defined at line %d" % fn.__code__.co_firstlineno)
lines.append("   referenced globals in _can_view: %s" % sorted(names))
lines.append("   module has _visibility_allows? %s" % has_def)
lines.append("   -> NameError on call? %s" % ("_visibility_allows" in names and not has_def))
lines.append("   moments module line count = %d" % len(open(moments.__file__, encoding="utf-8").readlines()))

with open(OUT_FILE, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))
