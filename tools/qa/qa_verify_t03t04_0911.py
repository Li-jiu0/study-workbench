#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""星途学习工作台 · 批次三（T03 隐私 + T04 群设置）后端独立验证脚本。

定位：由 QA（严过关）独立编写，与工程师自测脚本（ed_smoke_t03_0911.py /
ed_smoke_t04_0911.py）**无关**。目标不是复跑他们的用例，而是换一双眼睛证伪：
自建夹具、自想边界、自造刁钻输入，**用真实 HTTP 响应 + DB 落库事实**取证。

隔离原则：
- 全程只碰临时目录下的 server 副本（TEMP_ROOT/server），绝不触碰仓库 server/data.db。
- 事实来源两条：① 真实 HTTP 状态码/响应片段；② 直接只读 sqlite 查落库事实（残留检查）。
- 用独立端口 8897（不占工程师的 8899/8898），跑完强制回收 uvicorn。

用法（需用指定解释器 + PYTHONPATH 运行）：
    python qa_verify_t03t04_0911.py            # 全流程：legacy 迁移 + 起服务 + seed + HTTP + unit
    python qa_verify_t03t04_0911.py --mode legacy
    python qa_verify_t03t04_0911.py --mode seed
    python qa_verify_t03t04_0911.py --mode unit
    python qa_verify_t03t04_0911.py --mode http # 需服务已在跑

输出：TEMP_ROOT/qa_report.json 与 stdout 末行 JSON 摘要。
"""
from __future__ import annotations

import json
import os
import socket
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------- 常量 / 环境
TEMP_ROOT = Path(os.environ.get("QA_TEMP_ROOT", r"C:\Users\ATM\AppData\Local\Temp\qa_xingtu_t03t04"))
SERVER_DIR = TEMP_ROOT / "server"
LEGACY_DB = TEMP_ROOT / "legacy_data.db"
HTTP_DB = TEMP_ROOT / "http_data.db"
PORT = int(os.environ.get("QA_PORT", "8897"))
HOST = "127.0.0.1"
BASE = f"http://{HOST}:{PORT}"
JWT_SECRET = "qa-probe-secret-0911-t03t04"
PY = os.environ.get("QA_PY", r"C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe")
SITE = os.environ.get(
    "QA_SITE_PACKAGES",
    r"C:\Users\ATM\.workbuddy\binaries\python\envs\xingtu-backend\Lib\site-packages",
)
SERVER_LOG = TEMP_ROOT / "uvicorn_8897.log"

# 夹具用户 id（显式指定，父进程可直接引用）
ME, F1, PRIV, PUB = 1, 2, 3, 4
NOB, EV, NOSEARCH = 5, 6, 7
BLOCKER, BLOCKED = 8, 9          # 8 拉黑了我；我拉黑了 9
STRANGER, REQ, REQ2 = 10, 11, 12  # 10 保持非好友；11/12 用于申请流
NICK = {
    ME: "QA我_zzq1", F1: "QA好友_zzq2", PRIV: "QA私密_zzq3", PUB: "QA公开_zzq4",
    NOB: "QA拒加_zzq5", EV: "QA免验_zzq6", NOSEARCH: "QA隐身_zzq7",
    BLOCKER: "QA拉黑我_zzq8", BLOCKED: "QA被我拉黑_zzq9", STRANGER: "QA陌生人_zq10",
    REQ: "QA申请_zq11", REQ2: "QA申请2_zq12",
}
G1, G2, G3 = 1, 2, 3  # g1: 我(owner)+2+10；g2: 2(owner)+我(member)；g3: 仅 2


def child_env(extra: dict | None = None) -> dict:
    env = os.environ.copy()
    env["PYTHONPATH"] = SITE + os.pathsep + str(SERVER_DIR)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    if extra:
        env.update(extra)
    return env


# ---------------------------------------------------------------- 结果收集
class Reporter:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def check(self, tid, desc, ok, expected, actual, evidence="") -> bool:
        self.rows.append({
            "id": tid, "desc": desc, "status": "PASS" if ok else "FAIL",
            "expected": expected, "actual": actual, "evidence": str(evidence)[:600],
        })
        return bool(ok)

    def note(self, tid, desc, evidence) -> None:
        """非断定型观察（不计入通过率），用于记录可疑但需人判的点。"""
        self.rows.append({
            "id": tid, "desc": desc, "status": "NOTE",
            "expected": "", "actual": "", "evidence": str(evidence)[:600],
        })

    def summary(self) -> dict:
        p = sum(1 for r in self.rows if r["status"] == "PASS")
        f = sum(1 for r in self.rows if r["status"] == "FAIL")
        n = sum(1 for r in self.rows if r["status"] == "NOTE")
        return {"total": p + f, "passed": p, "failed": f, "notes": n}


def ro_query(dbpath: Path, sql: str, args=()) -> list[tuple]:
    """只读打开临时库查询（落库事实，独立于 HTTP 层）。"""
    con = sqlite3.connect(f"file:{dbpath.as_posix()}?mode=ro", uri=True, timeout=8.0)
    try:
        return con.execute(sql, args).fetchall()
    finally:
        con.close()


# ================================================================ MODE: legacy
LEGACY_DDL = [
    """CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL, motto TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT 'secret', birthday TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '', avatar TEXT, last_seen_at TEXT,
      last_request_seen_at TEXT, last_seen_request_id INTEGER,
      token_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)""",
    """CREATE TABLE chat_groups (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner_id INTEGER NOT NULL,
      avatar TEXT, created_at TEXT NOT NULL)""",
    """CREATE TABLE chat_group_members (
      id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', last_read_msg_id INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL, UNIQUE (group_id, user_id))""",
]
NEW_COLS = {
    "users": ["moment_visibility", "friend_allow", "searchable"],
    "chat_groups": ["announcement"],
    "chat_group_members": ["group_nickname"],
}


def mode_legacy() -> int:
    """老库升级验证：造一个「改造前」库 → 连跑 3 次 init_db → 断言列/存量行默认值。"""
    LEGACY_DB.unlink(missing_ok=True)
    con = sqlite3.connect(LEGACY_DB)
    for ddl in LEGACY_DDL:
        con.execute(ddl)
    con.execute("INSERT INTO users(id,username,password_hash,nickname,created_at) "
                "VALUES(1,'legacyuser','x','老用户','2026-01-01 00:00')")
    con.execute("INSERT INTO chat_groups(id,name,owner_id,created_at) "
                "VALUES(1,'老群',1,'2026-01-01 00:00')")
    con.execute("INSERT INTO chat_group_members(id,group_id,user_id,role,joined_at) "
                "VALUES(1,1,1,'owner','2026-01-01 00:00')")
    con.commit()
    cols_before = {t: {r[1] for r in con.execute(f"PRAGMA table_info({t})")} for t in NEW_COLS}
    con.close()

    os.environ["DATABASE_PATH"] = str(LEGACY_DB)
    sys.path.insert(0, str(SERVER_DIR))
    import database  # noqa: E402

    errors, runs = [], 0
    for i in range(3):
        try:
            database.init_db()
            runs += 1
        except Exception as e:  # noqa: BLE001
            errors.append(f"init_db#{i + 1}: {type(e).__name__}: {e}")

    con = sqlite3.connect(LEGACY_DB)
    cols_after = {t: {r[1] for r in con.execute(f"PRAGMA table_info({t})")} for t in NEW_COLS}
    added = {t: sorted(cols_after[t] - cols_before[t]) for t in NEW_COLS}
    row = con.execute("SELECT moment_visibility, friend_allow, searchable FROM users WHERE id=1").fetchone()
    ann = con.execute("SELECT announcement FROM chat_groups WHERE id=1").fetchone()
    gnick = con.execute("SELECT group_nickname FROM chat_group_members WHERE id=1").fetchone()
    n_users = con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    con.close()

    out = {
        "runs_ok": runs, "errors": errors, "added_columns": added,
        "legacy_user_defaults": list(row) if row else None,
        "legacy_group_announcement": ann[0] if ann else None,
        "legacy_member_group_nickname": gnick[0] if gnick else None,
        "users_row_count_preserved": n_users,
    }
    output_json(out)
    return 0


# ================================================================== MODE: seed
def mode_seed() -> int:
    """在临时库建立确定性夹具（显式 id），供 HTTP 阶段使用。"""
    os.environ["DATABASE_PATH"] = str(HTTP_DB)
    sys.path.insert(0, str(SERVER_DIR))
    import database as D  # noqa: E402

    D.init_db()
    db = D.SessionLocal()
    try:
        T = "2026-09-11 10:00:00"

        def u(uid, extra=None):
            base = dict(
                id=uid, username=f"qa_u{uid}", password_hash="x", nickname=NICK[uid],
                motto="", bio="", gender="secret", birthday="", city="", phone="",
                goal="", tags="", avatar=None, created_at="2026-01-01 00:00",
                moment_visibility="friends", friend_allow="need_confirm", searchable=1,
            )
            base.update(extra or {})
            db.add(D.User(**base))

        u(ME, {"gender": "male", "birthday": "1990-01-02", "city": "北京", "phone": "13800001111"})
        u(F1)
        u(PRIV, {"moment_visibility": "private"})
        u(PUB, {"moment_visibility": "public"})
        u(NOB, {"friend_allow": "nobody"})
        u(EV, {"friend_allow": "everyone"})
        u(NOSEARCH, {"searchable": 0})
        u(BLOCKER, {"moment_visibility": "public"})
        u(BLOCKED, {"moment_visibility": "public"})
        u(STRANGER)
        u(REQ)
        u(REQ2)
        db.flush()

        # 好友：我<->2（friends）；我<->3（3 为 private 可见性）
        db.add(D.Friend(user_a=ME, user_b=F1, created_at=T))
        db.add(D.Friend(user_a=ME, user_b=PRIV, created_at=T))
        # 黑名单：8 拉黑我；我拉黑 9
        db.add(D.UserBlock(blocker_id=BLOCKER, blocked_id=ME, created_at=T))
        db.add(D.UserBlock(blocker_id=ME, blocked_id=BLOCKED, created_at=T))

        # 动态：每条 1 个（用 createdAt 递增保证顺序）
        moments = [
            (ME, "M_me_oldest"), (ME, "M_me_newest"), (F1, "M_f1_friend"),
            (PRIV, "M_priv_private_friend"), (PUB, "M_pub_public_stranger"),
            (STRANGER, "M_stranger_nonpublic"), (BLOCKER, "M_blocker_public_blockedme"),
            (BLOCKED, "M_blocked_public_iblocked"),
        ]
        for i, (uid, txt) in enumerate(moments, start=1):
            db.add(D.Moment(user_id=uid, content=txt, images="[]",
                            created_at=f"2026-09-11 11:{i:02d}:00"))

        # 群：g1 我(owner)+2+10；g2 2(owner)+我(member)；g3 仅 2
        db.add(D.ChatGroup(id=G1, name="QA群一", owner_id=ME, avatar=None,
                           announcement="初始公告", created_at=T))
        db.add(D.ChatGroup(id=G2, name="QA群二", owner_id=F1, avatar=None,
                           announcement="", created_at=T))
        db.add(D.ChatGroup(id=G3, name="QA群三", owner_id=F1, avatar=None,
                           announcement="", created_at=T))
        for gid, uid, role in [(G1, ME, "owner"), (G1, F1, "member"), (G1, STRANGER, "member"),
                               (G2, F1, "owner"), (G2, ME, "member"), (G3, F1, "owner")]:
            db.add(D.ChatGroupMember(group_id=gid, user_id=uid, role=role,
                                     group_nickname="", last_read_msg_id=0, joined_at=T))
        db.commit()
        ids = {"users": sorted(NICK), "groups": [G1, G2, G3]}
        output_json({"ok": True, **ids})
    finally:
        db.close()
    return 0


# ================================================================== MODE: unit
def mode_unit() -> int:
    """纯单元探针：直接调用业务函数，覆盖 HTTP 难以触达的分支。"""
    os.environ["DATABASE_PATH"] = str(HTTP_DB)
    sys.path.insert(0, str(SERVER_DIR))
    from routers.groups import group_msg_dict  # noqa: E402
    from schemas import privacy_of  # noqa: E402

    res = []

    class S:  # 假 sender
        def __init__(self, nick, av=None):
            self.nickname, self.avatar = nick, av

    class M:
        def __init__(self, sid):
            self.id, self.sender_id, self.kind, self.content, self.created_at = 1, sid, "text", "x", "t"

    def nick(m, sender, nm):
        return group_msg_dict(m, sender, 1, nm)["senderNickname"]

    res.append(("unit.nick.group_nick_wins",
                nick(M(5), S("全局昵称"), {5: "群名片A"}) == "群名片A",
                "群名片A", nick(M(5), S("全局昵称"), {5: "群名片A"})))
    res.append(("unit.nick.strip_group_nick",
                nick(M(5), S("全局昵称"), {5: "  群名片B  "}) == "群名片B",
                "群名片B", nick(M(5), S("全局昵称"), {5: "  群名片B  "})))
    res.append(("unit.nick.blank_group_nick_falls_back",
                nick(M(5), S("全局昵称"), {5: "   "}) == "全局昵称",
                "全局昵称", nick(M(5), S("全局昵称"), {5: "   "})))
    res.append(("unit.nick.no_map_falls_back",
                nick(M(5), S("全局昵称"), None) == "全局昵称",
                "全局昵称", nick(M(5), S("全局昵称"), None)))
    res.append(("unit.nick.deleted_sender",
                nick(M(5), None, {}) == "已注销用户",
                "已注销用户", nick(M(5), None, {})))
    res.append(("unit.nick.deleted_sender_avatar_none",
                group_msg_dict(M(5), None, 1, {})["senderAvatar"] is None,
                "None", group_msg_dict(M(5), None, 1, {})["senderAvatar"]))

    class Legacy:
        moment_visibility = None
        friend_allow = None
        searchable = None

    class Zero:
        moment_visibility = "public"
        friend_allow = "everyone"
        searchable = 0

    p1, p2 = privacy_of(Legacy()), privacy_of(Zero())
    res.append(("unit.privacy_of.legacy_null_defaults",
                p1 == {"momentVisibility": "friends", "friendAllow": "need_confirm", "searchable": True},
                "friends/need_confirm/True", p1))
    res.append(("unit.privacy_of.searchable_0_is_false",
                p2["searchable"] is False, "False", p2))

    output_json({"ok": True, "cases": [{"id": i, "ok": ok, "expected": e, "actual": a}
                                       for i, ok, e, a in res]})
    return 0


# ============================================================== HTTP 测试主体
def deep_keys(obj, keys, path="") -> list[str]:
    """递归查找 JSON 中出现的敏感 key（返回其路径）。"""
    hits = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in keys:
                hits.append(f"{path}.{k}")
            hits += deep_keys(v, keys, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            hits += deep_keys(v, keys, f"{path}[{i}]")
    return hits


def http_suite(rep: Reporter) -> None:
    import jwt
    import httpx

    secret = JWT_SECRET

    def tok(uid, typ="access", ttl=3600):
        now = int(time.time())
        return jwt.encode({"sub": str(uid), "typ": typ, "iat": now, "exp": now + ttl},
                          secret, algorithm="HS256")

    T = {uid: {"Authorization": f"Bearer {tok(uid)}"} for uid in NICK}
    client = httpx.Client(base_url=BASE, timeout=20, trust_env=False,
                          headers={"Accept": "application/json"})

    def R(method, path, who=ME, **kw):
        h = dict(T.get(who, {})) if who else {}
        h.update(kw.pop("headers", {}) or {})
        return client.request(method, path, headers=h, **kw)

    def jid(resp, key="id"):
        try:
            return resp.json().get(key)
        except Exception:  # noqa: BLE001
            return None

    # ---------- 0. 服务健康 ----------
    h = client.get("/api/health")
    rep.check("S0.health", "服务可启动且健康", h.status_code == 200 and h.json().get("ok") is True,
              "200/ok", f"{h.status_code}/{h.text[:80]}")

    # ==================== A. 鉴权（新接口） ====================
    for tid, path, method in [
        ("A1.no-auth.privacy", "/api/users/me/privacy", "PUT"),
        ("A1.no-auth.patch-group", f"/api/groups/{G1}", "PATCH"),
        ("A1.no-auth.patch-group-me", f"/api/groups/{G1}/me", "PATCH"),
    ]:
        r = client.request(method, path, json={})
        rep.check(tid, f"缺 token 访问 {method} {path} → 401", r.status_code == 401,
                  "401", f"{r.status_code}")
    bad = {"Authorization": "Bearer not-a-real-jwt"}
    r = client.put("/api/users/me/privacy", headers=bad, json={"momentVisibility": "public"})
    rep.check("A2.bogus-token", "伪造 token → 401", r.status_code == 401, "401", f"{r.status_code}")
    r = client.patch(f"/api/groups/{G1}", headers=bad, json={"name": "x"})
    rep.check("A2.bogus-token.group", "伪造 token 访问群 PATCH → 401", r.status_code == 401,
              "401", f"{r.status_code}")
    r = client.put("/api/users/me/privacy", headers={"Authorization": f"Bearer {tok(ME, 'refresh')}"},
                   json={"momentVisibility": "public"})
    rep.check("A3.refresh-as-access", "refresh 令牌当 access 用 → 401", r.status_code == 401,
              "401", f"{r.status_code}")
    r = client.put("/api/users/me/privacy",
                   headers={"Authorization": f"Bearer {tok(ME, 'access', ttl=-10)}"},
                   json={"momentVisibility": "public"})
    rep.check("A4.expired-token", "过期 access → 401", r.status_code == 401, "401", f"{r.status_code}")

    # ==================== B. /auth/me 隐私三项 ====================
    r = R("GET", "/api/auth/me")
    me = r.json() if r.status_code == 200 else {}
    rep.check("B1.me.privacy-present", "GET /auth/me 含 privacy 对象",
              isinstance(me.get("privacy"), dict),
              "dict", f"{r.status_code} privacy={me.get('privacy')}")
    rep.check("B2.me.privacy-defaults",
              "默认 privacy = friends/need_confirm/True",
              me.get("privacy") == {"momentVisibility": "friends", "friendAllow": "need_confirm",
                                    "searchable": True},
              "friends/need_confirm/True", me.get("privacy"))

    # ==================== C. PUT /me/privacy ====================
    r = R("PUT", "/api/users/me/privacy", json={"momentVisibility": "private"})
    rep.check("C1.partial-update-returns-full",
              "部分更新仅改传入字段并返回全量 privacy",
              r.status_code == 200 and r.json().get("momentVisibility") == "private"
              and r.json().get("friendAllow") == "need_confirm" and r.json().get("searchable") is True,
              "200{private,need_confirm,True}", f"{r.status_code}{r.json() if r.status_code==200 else r.text[:120]}")

    # 非法枚举 + 半更新防护：先设 public，再传 {合法 momentVisibility, 非法 friendAllow}
    R("PUT", "/api/users/me/privacy", json={"momentVisibility": "public"})
    r = R("PUT", "/api/users/me/privacy", json={"momentVisibility": "private", "friendAllow": "maybe"})
    still = R("GET", "/api/auth/me").json().get("privacy", {}).get("momentVisibility")
    rep.check("C2.invalid-enum-400", "非法 friendAllow → 400「设置值不合法」",
              r.status_code == 400 and "不合法" in r.text, "400/不合法",
              f"{r.status_code}/{r.text[:80]}")
    rep.check("C3.no-partial-write-on-invalid",
              "非法枚举时不得发生半更新（momentVisibility 仍为 public）",
              still == "public", "public", still)
    for bad_val, field in [("PUBLIC", "momentVisibility"), ("", "momentVisibility"),
                           ("maybe", "friendAllow"), ("friend", "friendAllow")]:
        r = R("PUT", "/api/users/me/privacy", json={field: bad_val})
        rep.check(f"C4.invalid.{field}.{bad_val or 'empty'}",
                  f"{field}='{bad_val}' → 400", r.status_code == 400, "400", f"{r.status_code}")
    r = R("PUT", "/api/users/me/privacy", json={})
    rep.check("C5.empty-body-400", "三字段全未传 → 400", r.status_code == 400, "400", f"{r.status_code}")
    r = R("PUT", "/api/users/me/privacy", json={"searchable": False})
    rep.check("C6.searchable-false", "searchable:false 仅改该字段且返回 False",
              r.status_code == 200 and r.json().get("searchable") is False
              and r.json().get("momentVisibility") == "public",
              "200{searchable:False,mv:public}", f"{r.status_code}{r.json() if r.status_code==200 else r.text[:120]}")

    # ==================== D. 搜索 searchable 过滤 ====================
    r = R("GET", "/api/friends/search", who=ME, params={"q": "zzq2"})
    rep.check("D1.search.normal-found", "默认可搜用户能搜到",
              r.status_code == 200 and any(i["id"] == F1 for i in r.json().get("items", [])),
              "含 id=2", f"{r.status_code} ids={[i['id'] for i in r.json().get('items', [])] if r.status_code==200 else r.text[:100]}")
    r = R("GET", "/api/friends/search", who=ME, params={"q": "zzq7"})
    rep.check("D2.search.searchable0-hidden", "searchable=0 的用户搜不到（空 items 且非报错）",
              r.status_code == 200 and r.json().get("items") == [],
              "200/[]", f"{r.status_code}/{r.json() if r.status_code==200 else r.text[:100]}")
    r = R("GET", "/api/friends/search", who=F1, params={"q": "zzq1"})  # 我已被设为 searchable=0
    rep.check("D3.search.self-excluded+searchable0",
              "searchable=0 的本人不出现（且本就被排除自己）",
              r.status_code == 200 and all(i["id"] != ME for i in r.json().get("items", [])),
              "不含 id=1", f"{r.status_code} ids={[i['id'] for i in r.json().get('items', [])] if r.status_code==200 else ''}")
    r = R("GET", "/api/friends/search", who=F1, params={"q": ""})
    rep.check("D4.search.empty-q", "空关键词 → 200/[] 非报错",
              r.status_code == 200 and r.json().get("items") == [], "200/[]",
              f"{r.status_code}/{r.json() if r.status_code==200 else r.text[:80]}")
    r = R("GET", "/api/friends/search", who=F1, params={"q": "zzz-no-such-user"})
    rep.check("D5.search.none-found", "搜不到 → 200/[] 非报错",
              r.status_code == 200 and r.json().get("items") == [], "200/[]", f"{r.status_code}")
    # 我 self 也测：把自己改回来（后续用）
    R("PUT", "/api/users/me/privacy", json={"searchable": True})

    # ==================== E. 红线：公开主页不泄露隐私字段 ====================
    SECRET_KEYS = {"phone", "gender", "birthday", "privacy"}
    for tid, uid in [("E1.public-profile.other", F1), ("E2.public-profile.self", ME)]:
        r = R("GET", f"/api/users/{uid}")
        body = r.text
        keyhits = deep_keys(r.json(), SECRET_KEYS) if r.status_code == 200 else ["<non-200>"]
        valhits = [v for v in ("13800001111", "male", "1990-01-02") if v in body]
        rep.check(tid, f"GET /api/users/{uid} 不返回 phone/gender/birthday/privacy（逐字段+全文本扫描）",
                  r.status_code == 200 and not keyhits and not valhits,
                  "无敏感 key/值", f"keys={keyhits} vals={valhits} status={r.status_code}")
    # 其它白名单端点也不得带隐私字段
    r = R("GET", "/api/users/presence", params={"ids": f"{F1},{ME}"})
    leaks = deep_keys(r.json(), SECRET_KEYS)
    rep.check("E4.presence-no-secrets", "在线状态接口不泄露 phone/gender/birthday/privacy",
              r.status_code == 200 and not leaks, "无敏感 key", leaks)
    r = R("GET", "/api/friends/search", who=ME, params={"q": "zzq5"})
    leaks = deep_keys(r.json(), SECRET_KEYS)
    rep.check("E5.search-no-secrets", "用户搜索结果不泄露 phone/gender/birthday/privacy",
              r.status_code == 200 and not leaks, "无敏感 key", leaks)

    # 反向锚点：本人接口必须含这些字段
    r = R("GET", "/api/auth/me")
    me_body = r.json()
    rep.check("E3.auth-me.has-secret-fields",
              "GET /auth/me 本人接口允许含 phone/gender/birthday/privacy",
              all(k in me_body for k in ("phone", "gender", "birthday", "privacy"))
              and me_body.get("phone") == "13800001111",
              "含且 phone=13800001111",
              f"{[k for k in ('phone','gender','birthday','privacy') if k in me_body]} phone={me_body.get('phone')}")

    # ==================== F. 动态可见性 ====================
    r = R("GET", "/api/moments/feed", params={"limit": 50})
    feed = r.json() if r.status_code == 200 else {}
    authors = sorted({m["author"]["id"] for m in feed.get("items", [])})
    texts = [m["content"] for m in feed.get("items", [])]
    rep.check("F1.feed.includes.friend-self-public",
              "feed 含 自己(1)/好友(2)/公开作者(4)",
              {1, 2, 4}.issubset(set(authors)), "⊇{1,2,4}", authors)
    rep.check("F2.feed.excludes.nonpublic-stranger",
              "feed 不含 非好友非公开(10)", 10 not in authors, "不含 10", authors)
    rep.check("F3.feed.excludes.blocker-and-blocked",
              "feed 不含 双向拉黑用户(8 拉黑我 / 9 我拉黑)",
              8 not in authors and 9 not in authors, "不含 8、9", authors)
    # —— 关键探针：好友把动态设为 private，仍不应出现在我 feed（PRD §6.1 C1①）
    leaked = [m for m in feed.get("items", []) if m["author"]["id"] == PRIV]
    rep.check("F4.feed.excludes.private-friend",
              "【红线】好友(3)动态可见性=private 时，其动态不得进入我的 feed（PRD §6.1-C1①）",
              3 not in authors and "M_priv_private_friend" not in texts,
              "不含作者 3 及其动态",
              f"authors={authors} leaked_item={json.dumps(leaked, ensure_ascii=False)}")

    # 直连 user_moments / 点赞 应严格按三档（与 feed 对照）
    r = R("GET", f"/api/moments/user/{PRIV}")
    rep.check("F5.user_moments.private-friend-403",
              "好友(3,private) 的 user_moments → 403",
              r.status_code == 403, "403", f"{r.status_code}")
    r = R("GET", f"/api/moments/user/{PUB}")
    rep.check("F6.user_moments.public-nonfriend-200",
              "非好友(4,public) 的 user_moments → 200",
              r.status_code == 200, "200", f"{r.status_code}")
    r = R("GET", f"/api/moments/user/{STRANGER}")
    rep.check("F7.user_moments.nonpublic-nonfriend-403",
              "非好友(10,默认 friends) 的 user_moments → 403",
              r.status_code == 403, "403", f"{r.status_code}")
    r = R("GET", f"/api/moments/user/{BLOCKER}")
    rep.check("F8.user_moments.blocked-me-403",
              "(8,public 但拉黑我) user_moments → 403（拉黑优先于 public）",
              r.status_code == 403, "403", f"{r.status_code}")
    r = R("GET", f"/api/moments/user/{F1}")
    rep.check("F9.user_moments.friend-friends-200",
              "好友(2,friends) user_moments → 200", r.status_code == 200, "200", f"{r.status_code}")
    r = R("GET", f"/api/moments/user/{ME}")
    rep.check("F10.user_moments.self-200", "本人 user_moments → 200",
              r.status_code == 200, "200", f"{r.status_code}")

    # 点赞/评论私有好友动态应 403（与 F4 对照）
    mids = R("GET", f"/api/moments/user/{PRIV}")  # 403, 无法取 id → 直接用 DB 拿
    priv_mid = ro_query(HTTP_DB, "SELECT id FROM moments WHERE user_id=? LIMIT 1", (PRIV,))
    if priv_mid:
        pid = priv_mid[0][0]
        r = R("POST", f"/api/moments/{pid}/like")
        rep.check("F11.like.private-friend-403",
                  "对好友(3,private)动态点赞 → 403（不可见）", r.status_code == 403, "403",
                  f"{r.status_code}")
    # 分页 + 黑名单
    p1 = R("GET", "/api/moments/feed", params={"limit": 2})
    b1 = p1.json() if p1.status_code == 200 else {}
    ids1 = [m["id"] for m in b1.get("items", [])]
    nb = b1.get("nextBefore")
    p2 = R("GET", "/api/moments/feed", params={"limit": 2, "before_id": nb or 0})
    b2 = p2.json() if p2.status_code == 200 else {}
    ids2 = [m["id"] for m in b2.get("items", [])]
    rep.check("F12.feed.pagination",
              "feed 游标分页正确（无重叠、hasMore 语义）",
              p1.status_code == 200 and b1.get("hasMore") is True and nb and not (set(ids1) & set(ids2)),
              "page1∩page2=∅ 且 hasMore", f"p1={ids1} nb={nb} p2={ids2} hm2={b2.get('hasMore')}")
    # 拉黑后 feed 不含该用户全部动态（8/9 各有 1 条）
    blocked_mids = [r[0] for r in ro_query(HTTP_DB, "SELECT id FROM moments WHERE user_id IN (8,9)")]
    all_feed_ids = set(ids1) | set(ids2)
    more = R("GET", "/api/moments/feed", params={"limit": 50}).json().get("items", [])
    all_feed_ids |= {m["id"] for m in more}
    rep.check("F13.feed.blocked-moments-absent",
              "拉黑涉及用户的动态在 feed 中一条都不出现",
              not (set(blocked_mids) & all_feed_ids), "无交集",
              f"blocked={blocked_mids} feed={sorted(all_feed_ids)}")

    # ==================== G. 加好友三档 + 优先级 ====================
    def reqrow(a, b):
        return ro_query(HTTP_DB,
                        "SELECT id,status FROM friend_requests WHERE from_user_id=? AND to_user_id=?", (a, b))

    def friendrow(a, b):
        x, y = (a, b) if a < b else (b, a)
        return ro_query(HTTP_DB, "SELECT id FROM friends WHERE user_a=? AND user_b=?", (x, y))

    # nobody
    r = R("POST", "/api/friends/requests", json={"toUserId": NOB})
    rep.check("G1.nobody-400", "对方 friendAllow=nobody → 400",
              r.status_code == 400, "400", f"{r.status_code}/{r.text[:80]}")
    rep.check("G2.nobody-no-residue", "nobody 被拒后不得产生任何 pending 申请",
              not reqrow(ME, NOB) and not reqrow(NOB, ME), "无 friend_requests 行",
              f"mine={reqrow(ME, NOB)} theirs={reqrow(NOB, ME)}")

    # everyone
    r = R("POST", "/api/friends/requests", json={"toUserId": EV})
    rep.check("G3.everyone-autoaccept", "对方 friendAllow=everyone → 免验证直接好友(autoAccepted)",
              r.status_code == 200 and r.json().get("autoAccepted") is True,
              "200/autoAccepted", f"{r.status_code}/{r.json() if r.status_code==200 else r.text[:80]}")
    rep.check("G4.everyone-mutual-visibility",
              "everyone 免验证后双方互见（friends 行存在 + 双方列表可见）",
              bool(friendrow(ME, EV))
              and any(i["id"] == EV for i in R("GET", "/api/friends").json().get("items", []))
              and any(i["id"] == ME for i in R("GET", "/api/friends", who=EV).json().get("items", [])),
              "friends 行存在且互见",
              f"row={friendrow(ME, EV)}")
    rep.check("G5.everyone-no-pending-residue",
              "everyone 免验证不得留下 pending 残留",
              not reqrow(ME, EV) and not reqrow(EV, ME), "无 friend_requests 行",
              f"mine={reqrow(ME, EV)} theirs={reqrow(EV, ME)}")

    # need_confirm
    r = R("POST", "/api/friends/requests", json={"toUserId": REQ})
    rep.check("G6.need_confirm-pending", "默认 need_confirm → 产生 pending 申请",
              r.status_code == 200 and r.json().get("requestId") and reqrow(ME, REQ),
              "200/requestId + pending 行",
              f"{r.status_code} row={reqrow(ME, REQ)}")
    r2 = R("POST", "/api/friends/requests", json={"toUserId": REQ})
    rep.check("G7.pending-duplicate-400", "重复申请 pending → 400",
              r2.status_code == 400, "400", f"{r2.status_code}/{r2.text[:60]}")
    r = R("GET", "/api/friends/requests", who=REQ)
    rep.check("G8.incoming-visible", "对方收件箱能看到该 pending 申请",
              r.status_code == 200 and any(i["user"]["id"] == ME for i in r.json().get("incoming", [])),
              "incoming 含我", f"{r.status_code}")
    # 互申请 autoAccept（11 回申请我）
    r = R("POST", "/api/friends/requests", who=REQ, json={"toUserId": ME})
    rep.check("G9.mutual-autoaccept", "对方先申请我后我再申请 → autoAccept 成为好友",
              r.status_code == 200 and r.json().get("autoAccepted") is True and bool(friendrow(ME, REQ)),
              "200/autoAccepted + friends 行", f"{r.status_code}/{r.json() if r.status_code==200 else r.text[:80]}")

    # 黑名单优先级：把 9 设为 everyone，我仍被拉黑关系拦住
    R("PUT", "/api/users/me/privacy", who=BLOCKED, json={"friendAllow": "everyone"})
    r = R("POST", "/api/friends/requests", json={"toUserId": BLOCKED})
    rep.check("G10.block-beats-everyone", "黑名单优先于 everyone 档 → 400",
              r.status_code == 400, "400", f"{r.status_code}/{r.text[:60]}")
    r = R("POST", "/api/friends/requests", json={"toUserId": BLOCKER})
    rep.check("G11.blocked-me-cannot-apply", "对方拉黑我时我申请加对方 → 400",
              r.status_code == 400, "400", f"{r.status_code}/{r.text[:60]}")
    r = R("POST", "/api/friends/requests", json={"toUserId": F1})
    rep.check("G12.already-friend-400", "已是好友再申请 → 400",
              r.status_code == 400, "400", f"{r.status_code}/{r.text[:60]}")
    # 解除拉黑后可正常申请
    R("DELETE", f"/api/friends/block/{BLOCKED}")
    r = R("POST", "/api/friends/requests", json={"toUserId": BLOCKED})
    rep.check("G13.unblock-then-apply-ok",
              "解除拉黑后申请恢复（9 已是 everyone → 免验证）",
              r.status_code == 200, "200",
              f"{r.status_code}/{r.json() if r.status_code==200 else r.text[:80]}")

    # 状态一致性：先留一条 pending，再让对方切 everyone，我重申请 → 成好友后旧 pending 是否残留
    R("POST", "/api/friends/requests", json={"toUserId": REQ2})                 # 先生成 pending
    R("PUT", "/api/users/me/privacy", who=REQ2, json={"friendAllow": "everyone"})
    r = R("POST", "/api/friends/requests", json={"toUserId": REQ2})            # 三档 everyone → 免验证
    stale = reqrow(ME, REQ2)
    rep.check("G14.everyone-stale-pending【P3】",
              "成为好友后不应残留 pending 申请（避免已好友仍显示待处理申请/角标）",
              r.status_code == 200 and bool(friendrow(ME, REQ2)) and not stale,
              "friends 行存在且无 pending 残留",
              f"status={r.status_code} friends={friendrow(ME, REQ2)} stale_req={stale}")

    # ==================== H. T04 群设置 ====================
    r = R("GET", f"/api/groups/{G1}")
    g = r.json() if r.status_code == 200 else {}
    rep.check("H1.group-detail.new-fields",
              "GET /gid 新增 announcement/myRole/myGroupNickname + members[].groupNickname",
              r.status_code == 200 and g.get("announcement") == "初始公告"
              and g.get("myRole") == "owner" and g.get("myGroupNickname") == ""
              and all("groupNickname" in m for m in g.get("members", [])),
              "announcement/myRole/myGroupNickname/groupNickname",
              f"{r.status_code} ann={g.get('announcement')!r} myRole={g.get('myRole')} "
              f"members={[list(m) for m in g.get('members', [])][:1]}")
    leaks = deep_keys(g, {"phone", "gender", "birthday"})
    rep.check("H2.group-members-no-secrets", "群成员列表不泄露 phone/gender/birthday",
              not leaks, "无敏感 key", leaks)

    # 权限
    r = R("PATCH", f"/api/groups/{G2}", json={"name": "越权改名"})  # 我是 member
    rep.check("H3.member-patch-403", "普通成员改群名 → 403", r.status_code == 403, "403", f"{r.status_code}")
    r = R("PATCH", f"/api/groups/{G3}", json={"name": "非成员改名"})  # 非成员
    rep.check("H4.nonmember-patch-403", "非成员 PATCH 群 → 403", r.status_code == 403, "403", f"{r.status_code}")
    r = R("PATCH", "/api/groups/99999", json={"name": "x"})
    rep.check("H5.missing-group-404", "不存在群 PATCH → 404", r.status_code == 404, "404", f"{r.status_code}")
    r = R("PATCH", f"/api/groups/{G3}/me", json={"groupNickname": "x"})
    rep.check("H6.nonmember-patch-me-403", "非成员改群名片 → 403", r.status_code == 403, "403", f"{r.status_code}")

    # 群名边界
    cases = [
        (20, True, "H7.name.20-ok"), (21, False, "H8.name.21-400"),
        (0, False, "H9.name.empty-400"),
    ]
    for n, ok_expect, tid in cases:
        val = "啊" * n
        r = R("PATCH", f"/api/groups/{G1}", json={"name": val})
        rep.check(tid, f"群名 {n} 字 {'允许' if ok_expect else '拒绝'}",
                  (r.status_code == 200) == ok_expect, "200" if ok_expect else "400",
                  f"{r.status_code}/{r.text[:60]}")
    r = R("PATCH", f"/api/groups/{G1}", json={"name": "   \u3000  "})
    rep.check("H10.name.whitespace-only-400", "纯空格/全角空格群名 → 400（strip 后为空）",
              r.status_code == 400, "400", f"{r.status_code}/{r.text[:60]}")
    r = R("PATCH", f"/api/groups/{G1}", json={"name": "中文😀名称\r\n换行"})
    after = R("GET", f"/api/groups/{G1}").json().get("name")
    rep.check("H11.name.emoji-newline-accepted-and-stripped",
              "含 emoji/换行的群名被接受且首尾空白被 strip",
              r.status_code == 200 and after == "中文😀名称\r\n换行".strip(),
              repr("中文😀名称\r\n换行".strip()), f"{r.status_code} stored={after!r}")
    # 恢复合法群名
    R("PATCH", f"/api/groups/{G1}", json={"name": "QA群一"})

    # 公告边界
    r = R("PATCH", f"/api/groups/{G1}", json={"announcement": "公" * 300})
    rep.check("H12.ann.300-ok", "公告 300 字 → 200", r.status_code == 200, "200", f"{r.status_code}")
    r = R("PATCH", f"/api/groups/{G1}", json={"announcement": "公" * 301})
    rep.check("H13.ann.301-400", "公告 301 字 → 400", r.status_code == 400, "400", f"{r.status_code}/{r.text[:60]}")
    r = R("PATCH", f"/api/groups/{G1}", json={"announcement": ""})
    rep.check("H14.ann.clear", "公告空串 → 清空", r.status_code == 200 and r.json().get("announcement") == "",
              "200/''", f"{r.status_code}/{r.json() if r.status_code==200 else r.text[:60]}")
    # 非法公告不得落库（先设 300，再传 301 后仍为 300）
    R("PATCH", f"/api/groups/{G1}", json={"announcement": "公" * 300})
    R("PATCH", f"/api/groups/{G1}", json={"announcement": "公" * 301})
    still_ann = R("GET", f"/api/groups/{G1}").json().get("announcement")
    rep.check("H15.ann.invalid-no-write", "公告超限被拒后不得改动原公告",
              still_ann == "公" * 300, "300 字原文", f"len={len(still_ann or '')}")

    # 群名片
    r = R("PATCH", f"/api/groups/{G1}/me", json={"groupNickname": "甲" * 20})
    rep.check("H16.gnick.20-ok", "群名片 20 字 → 200", r.status_code == 200, "200", f"{r.status_code}")
    r = R("PATCH", f"/api/groups/{G1}/me", json={"groupNickname": "甲" * 21})
    rep.check("H17.gnick.21-400", "群名片 21 字 → 400", r.status_code == 400, "400", f"{r.status_code}/{r.text[:60]}")
    r = R("PATCH", f"/api/groups/{G1}/me", json={"groupNickname": ""})
    rep.check("H18.gnick.clear", "群名片空串 → 清除返回 ''",
              r.status_code == 200 and r.json().get("groupNickname") == "", "200/''",
              f"{r.status_code}/{r.json() if r.status_code==200 else r.text[:60]}")
    # 只能改自己：2 设置自己的名片，我的名片不受影响
    R("PATCH", f"/api/groups/{G1}/me", json={"groupNickname": "我的名片"})
    R("PATCH", f"/api/groups/{G1}/me", who=F1, json={"groupNickname": "甲群名片"})
    gd = R("GET", f"/api/groups/{G1}").json()
    mine = {m["id"]: m.get("groupNickname") for m in gd.get("members", [])}
    rep.check("H19.gnick.only-self",
              "群名片只能改自己（2 改名后我仍是自己的名片）",
              mine.get(ME) == "我的名片" and mine.get(F1) == "甲群名片",
              "1=我的名片, 2=甲群名片", mine)

    # 群消息昵称优先级
    s2 = R("POST", f"/api/groups/{G1}/messages", who=F1, json={"content": "来自好友"})
    rep.check("H20.msg.senderNickname.group-nick",
              "群消息 senderNickname 优先取群名片(2=甲群名片)",
              s2.status_code == 200 and s2.json().get("senderNickname") == "甲群名片",
              "甲群名片", f"{s2.status_code}/{s2.json().get('senderNickname') if s2.status_code==200 else s2.text[:60]}")
    R("PATCH", f"/api/groups/{G1}/me", json={"groupNickname": "   "})  # 纯空格=清除
    s1 = R("POST", f"/api/groups/{G1}/messages", json={"content": "来自我"})
    rep.check("H21.msg.blank-group-nick-falls-back",
              "群名片为纯空格 → senderNickname 回落全局昵称",
              s1.status_code == 200 and s1.json().get("senderNickname") == NICK[ME],
              NICK[ME], f"{s1.status_code}/{s1.json().get('senderNickname') if s1.status_code==200 else s1.text[:60]}")
    ml = R("GET", f"/api/groups/{G1}/messages").json().get("items", [])
    byid = {m["senderId"]: m["senderNickname"] for m in ml}
    rep.check("H22.msg.list-nicknames", "消息列表同样应用群名片优先级",
              byid.get(F1) == "甲群名片" and byid.get(ME) == NICK[ME],
              f"2=甲群名片, 1={NICK[ME]}", byid)
    r = R("GET", f"/api/groups/{G1}/messages")
    leaks = deep_keys(r.json(), {"phone", "gender", "birthday", "privacy"})
    rep.check("H22b.msg.no-secret-keys", "群消息响应不泄露 phone/gender/birthday/privacy",
              not leaks, "无敏感 key", leaks)
    # 群名非法时不得连带写入公告（部分写入防护）
    before_ann = R("GET", f"/api/groups/{G1}").json().get("announcement")
    R("PATCH", f"/api/groups/{G1}", json={"name": "超" * 21, "announcement": "不该被写入"})
    rep.check("H22c.patch-no-partial-write", "群名非法时公告不得被连带写入",
              R("GET", f"/api/groups/{G1}").json().get("announcement") == before_ann,
              before_ann, R("GET", f"/api/groups/{G1}").json().get("announcement"))

    # 踢人 → 被踢成员访问
    r = R("DELETE", f"/api/groups/{G1}/members/{STRANGER}")
    rep.check("H23.kick-ok", "群主踢人 → 200", r.status_code == 200, "200", f"{r.status_code}")
    r = R("GET", f"/api/groups/{G1}", who=STRANGER)
    rep.check("H24.kicked-cannot-access", "被踢成员再访问群 → 403", r.status_code == 403, "403", f"{r.status_code}")
    r = R("DELETE", f"/api/groups/{G1}/members/{ME}")
    rep.check("H25.owner-cannot-kick-self", "群主踢自己 → 400", r.status_code == 400, "400", f"{r.status_code}")

    # ==================== I. 回归（既有接口不受本批影响） ====================
    r = R("POST", "/api/notes", json={"title": "QA回归笔记", "content": "正文", "status": "published"})
    nid = jid(r)
    r2 = R("GET", f"/api/notes/{nid}") if nid else None
    rep.check("I1.notes.create+get", "笔记创建/详情正常",
              r.status_code in (200, 201) and r2 is not None and r2.status_code == 200,
              "200/200", f"{r.status_code}/{getattr(r2,'status_code',None)}")
    r = R("GET", "/api/board")
    rep.check("I2.board.list", "留言板列表正常", r.status_code == 200 and "items" in r.json(),
              "200/items", f"{r.status_code}")
    r = R("POST", "/api/board", json={"content": "QA回归留言"})
    bid = jid(r)
    rep.check("I3.board.post", "留言板发帖正常", r.status_code == 200 and bid, "200/id", f"{r.status_code}")
    if bid:
        R("DELETE", f"/api/board/{bid}")
    r = R("POST", f"/api/chat/{F1}/messages", json={"content": "QA私聊", "kind": "text"})
    rep.check("I4.chat.private-send", "私聊发送正常（且私聊无 senderNickname 影响）",
              r.status_code == 200 and "senderNickname" not in r.json(), "200 且无 senderNickname",
              f"{r.status_code} keys={list(r.json()) if r.status_code==200 else r.text[:60]}")
    r = R("GET", f"/api/chat/{F1}/messages")
    rep.check("I5.chat.history", "私聊历史正常", r.status_code == 200, "200", f"{r.status_code}")
    r = R("GET", "/api/friends")
    rep.check("I6.friends.list", "好友列表正常且含好友 2",
              r.status_code == 200 and any(i["id"] == F1 for i in r.json().get("items", [])),
              "含 id=2", f"{r.status_code}")
    r = R("GET", "/api/friends/blocked")
    rep.check("I7.friends.blocked-list", "黑名单列表正常",
              r.status_code == 200 and "items" in r.json(), "200/items", f"{r.status_code}")
    r = R("GET", "/api/auth/me")
    rep.check("I8.auth.me", "个人中心正常", r.status_code == 200, "200", f"{r.status_code}")

    # 建群/退群回归（用好友 2、6 建新群，再解散）
    r = R("POST", "/api/groups", json={"name": "QA临时群", "memberIds": [F1, EV]})
    gid = jid(r)
    rep.check("I9.group.create", "建群正常", r.status_code == 200 and gid, "200/id", f"{r.status_code}")
    if gid:
        rq = R("POST", f"/api/groups/{gid}/quit")
        rep.check("I10.group.quit-dissolve", "群主退群=解散正常",
                  rq.status_code == 200 and rq.json().get("dissolved") is True, "200/dissolved",
                  f"{rq.status_code}/{rq.json() if rq.status_code==200 else rq.text[:60]}")

    client.close()


def mode_http() -> int:
    """跑 HTTP 验证（需服务已在 8897 运行）。"""
    rep = Reporter()
    try:
        http_suite(rep)
    except Exception as e:  # noqa: BLE001
        import traceback
        rep.check("HTTP.CRASH", "HTTP 阶段未崩溃", False, "无异常", f"{type(e).__name__}: {e}",
                  traceback.format_exc())
    output_json({"summary": rep.summary(), "rows": rep.rows})
    return 1 if rep.summary()["failed"] else 0


# ---------------------------------------------------------------- 服务生命周期
def port_free(port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.0)
    try:
        return s.connect_ex((HOST, port)) != 0
    finally:
        s.close()


def kill_port(port: int) -> None:
    """兜底：按端口找 PID 强杀（防幽灵 uvicorn 假绿）。"""
    try:
        out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, timeout=20).stdout
    except Exception:  # noqa: BLE001
        return
    pids = set()
    for line in out.splitlines():
        if f":{port}" in line and "LISTENING" in line:
            pids.add(line.split()[-1])
    for pid in pids:
        subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True, text=True)


def start_server():
    log = open(SERVER_LOG, "w", encoding="utf-8")
    proc = subprocess.Popen(
        [PY, "-m", "uvicorn", "main:app", "--host", HOST, "--port", str(PORT), "--log-level", "warning"],
        cwd=str(SERVER_DIR), env=child_env({"DATABASE_PATH": str(HTTP_DB)}),
        stdout=log, stderr=subprocess.STDOUT)
    return proc, log


def wait_health(timeout=30.0) -> bool:
    import httpx
    c = httpx.Client(base_url=BASE, timeout=2, trust_env=False)
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if c.get("/api/health").status_code == 200:
                c.close()
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.4)
    c.close()
    return False


def run_child(mode: str, extra_env=None):
    r = subprocess.run([PY, os.path.abspath(__file__), "--mode", mode],
                       capture_output=True, text=True, env=child_env(extra_env), timeout=180)
    return r


# -------------------------------------------------------------------- 编排
def mode_all() -> int:
    report = {"legacy": None, "unit": None, "http": None, "server_log": str(SERVER_LOG)}

    rc = run_child("legacy")
    try:
        report["legacy"] = json.loads(rc.stdout.strip().splitlines()[-1])
    except Exception:  # noqa: BLE001
        report["legacy"] = {"error": rc.stdout[-1500:] + rc.stderr[-1500:]}

    rc = run_child("unit")
    try:
        report["unit"] = json.loads(rc.stdout.strip().splitlines()[-1])
    except Exception:  # noqa: BLE001
        report["unit"] = {"error": rc.stdout[-1500:] + rc.stderr[-1500:]}

    HTTP_DB.unlink(missing_ok=True)
    rc = run_child("seed")
    try:
        report["seed"] = json.loads(rc.stdout.strip().splitlines()[-1])
    except Exception:  # noqa: BLE001
        report["seed"] = {"error": rc.stdout[-1500:] + rc.stderr[-1500:]}

    if not port_free(PORT):
        kill_port(PORT)
        time.sleep(1)

    proc, log = start_server()
    try:
        if not wait_health():
            report["http"] = {"error": "server failed to become healthy", "log": SERVER_LOG.read_text(encoding="utf-8", errors="ignore")[-2000:]}
        else:
            rc = run_child("http")
            try:
                report["http"] = json.loads(rc.stdout.strip().splitlines()[-1])
            except Exception:  # noqa: BLE001
                report["http"] = {"error": rc.stdout[-3000:] + rc.stderr[-1500:]}
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=8)
        log.close()
        if not port_free(PORT):
            kill_port(PORT)
            time.sleep(1)
    report["port_released"] = port_free(PORT)

    (TEMP_ROOT / "qa_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    # 摘要
    ls = report.get("legacy") or {}
    us = report.get("unit") or {}
    hs = (report.get("http") or {}).get("summary") or {}
    unit_cases = us.get("cases") or []
    unit_fail = [c for c in unit_cases if not c["ok"]]
    summary = {
        "legacy_ok": bool(ls and not ls.get("errors") and ls.get("runs_ok") == 3),
        "unit_total": len(unit_cases), "unit_failed": len(unit_fail),
        "http_total": hs.get("total"), "http_passed": hs.get("passed"),
        "http_failed": hs.get("failed"), "http_notes": hs.get("notes"),
        "port_released": report["port_released"],
        "report": str(TEMP_ROOT / "qa_report.json"),
    }
    output_json(summary)
    return 0


# -------------------------------------------------------------------- utils
def output_json(obj) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> int:
    mode = "all"
    args = sys.argv[1:]
    if "--mode" in args:
        mode = args[args.index("--mode") + 1]
    return {"legacy": mode_legacy, "seed": mode_seed, "unit": mode_unit,
            "http": mode_http, "all": mode_all}[mode]()


if __name__ == "__main__":
    sys.exit(main())
