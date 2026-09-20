# -*- coding: utf-8 -*-
"""批5 · L1 验收 相位③：迁移幂等（新表 create_all 自动建 + 既有库重复 init 不报错 + messages 列数不变）。

覆盖门禁 11。末行 MIG_RESULT=PASS/FAIL。
"""
import io
import os
import sys
import uuid

QA = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(QA, "_r104e_L1_mig_out.txt")
DST = os.environ["R104E_ISO_DIR"]

LOG = []
R = {"pass": 0, "fail": 0}


def log(s=""):
    LOG.append(str(s))


def ck(label, cond, detail=""):
    if cond:
        R["pass"] += 1
        log("  OK   %s%s" % (label, ("  -> " + str(detail)) if detail != "" else ""))
    else:
        R["fail"] += 1
        log("  FAIL %s  -> %s" % (label, detail))
    return bool(cond)


def finish(code):
    log("")
    log("MIG_RESULT=%s（%d/%d PASS）" % ("PASS" if R["fail"] == 0 else "FAIL",
                                         R["pass"], R["pass"] + R["fail"]))
    io.open(OUT, "w", encoding="utf-8").write("\n".join(LOG))
    sys.exit(code)


def main():
    os.environ["DATABASE_PATH"] = os.environ["R104E_DB"]
    os.environ["JWT_SECRET"] = "r104emig-" + uuid.uuid4().hex
    sys.path.insert(0, DST)

    import database
    from sqlalchemy import text

    mcols_before = None

    database.init_db()
    database.init_db()          # 重复初始化不报错
    names = {r[0] for r in database.engine.connect().execute(
        text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}
    log("---- ① 新建库 init_db ×2 ----")
    ck("live_locations 表已由 create_all 建出", "live_locations" in names,
       sorted(n for n in names if "live" in n))
    mcols_before = [r[1] for r in database.engine.connect().execute(
        text("PRAGMA table_info(messages)")).fetchall()]
    ck("messages 列含批4 四列（group_id/sub/lat/lng/precise）",
       all(c in mcols_before for c in ("group_id", "sub", "lat", "lng", "precise")),
       mcols_before)

    log("")
    log("---- ② 写入数据后再 init_db ×2，数据完好 ----")
    db = database.SessionLocal()
    db.add(database.LiveLocation(share_id="mig-test-share", owner_id=1, peer_id=2,
                                 group_id=None, state="active", last_lat=30.0, last_lng=120.0,
                                 last_seen="2026-09-19 12:00:00",
                                 created_at="2026-09-19 12:00:00",
                                 expires_at="2026-09-19 13:00:00"))
    db.commit()
    db.close()
    database.init_db()
    database.init_db()
    db = database.SessionLocal()
    row = db.query(database.LiveLocation).filter(
        database.LiveLocation.share_id == "mig-test-share").first()
    ck("init_db ×2 后行完好且坐标保真",
       bool(row) and row.last_lat == 30.0 and row.last_lng == 120.0 and row.state == "active",
       (row.last_lat, row.last_lng, row.state) if row else None)
    db.close()

    log("")
    log("---- ③ 幂等终检 ----")
    lcols = [r[1] for r in database.engine.connect().execute(
        text("PRAGMA table_info(live_locations)")).fetchall()]
    ck("live_locations 列 == 11 个既定字段",
       lcols == ["id", "share_id", "owner_id", "peer_id", "group_id", "state",
                 "last_lat", "last_lng", "last_seen", "created_at", "expires_at"],
       lcols)
    mcols_after = [r[1] for r in database.engine.connect().execute(
        text("PRAGMA table_info(messages)")).fetchall()]
    ck("★ messages 列数/列名完全不变（无迁移副作用）", mcols_after == mcols_before,
       mcols_after)
    tcnt = len([n for n in names if n == "live_locations"])
    ck("sqlite_master 中 live_locations 仅 1 个", tcnt == 1, tcnt)

    finish(0 if R["fail"] == 0 else 1)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        log("EXCEPTION: " + traceback.format_exc())
        finish(1)
