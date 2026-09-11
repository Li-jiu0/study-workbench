# -*- coding: utf-8 -*-
"""T03 后端增量（隐私与群设置 · 2026-09-11）冒烟验证。

覆盖范围（与架构文档 T03 验收点一一对应）：
  A. 守卫式 ALTER 幂等：用「旧库 schema」建库 → 连跑两遍 init_db 不报错，且 5 新列都在，
     存量行取默认值（老用户零感知）。
  B. HTTP 真跑（临时隔离副本 + uvicorn）：
     [1] GET /api/auth/me 含 privacy 三字段（默认 friends/need_confirm/True）
     [2] PUT /api/users/me/privacy 部分更新只改传入字段 + 全量返回 + 持久化
     [3] 非法枚举 / 空请求体 → 400「设置值不合法」
     [4] GET /api/users/{id} 公开主页不含 privacy/phone/gender/birthday（红线）
     [5] GET /api/friends/search：searchable=0 搜不到；存量 NULL 行仍可搜（双保险）；
         已是好友不受影响
     [6] POST /api/friends/requests 三档：nobody→400 / everyone→免验证成好友（结构同构）/
         need_confirm→pending；黑名单优先于三档
     [7] 动态可见性三档 + 双向拉黑剔除（feed 与 user/{uid}）

自足运行：把 server/ 复制到临时目录（剔除 .venv / *.db / .env / uploads），
先做 A，再起 uvicorn 做 B，跑完必杀进程、清理临时目录。

用法（推荐本机 python + 后端依赖 PYTHONPATH）：
    set PYTHONPATH=C:\\Users\\ATM\\.workbuddy\\binaries\\python\\envs\\xingtu-backend\\site-packages
    "C:\\Users\\ATM\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe" tools/qa/ed_smoke_t03_0911.py
可选环境变量：SW_PORT（默认 8899）。

退出码：0 全过；1 有 FAIL；2 前置不满足（缺 httpx / 服务起不来）。
"""
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid

try:
    import httpx
except ImportError:  # pragma: no cover
    print("需要 httpx：请先 pip install httpx")
    sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))          # tools/qa -> tools -> repo 根
SERVER_SRC = os.path.join(REPO, "server")
PORT = int(os.environ.get("SW_PORT", "8899"))
BASE = "http://127.0.0.1:%d" % PORT
TIMEOUT = float(os.environ.get("SW_TIMEOUT", "30"))

# ------- 旧库 schema（模拟历史生产库：users/chat_groups/chat_group_members 均缺新列） -------
LEGACY_DDL = """
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  motto TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE chat_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  avatar TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE chat_group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  last_read_msg_id INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  UNIQUE (group_id, user_id)
);
INSERT INTO users (username, password_hash, nickname, motto, created_at)
VALUES ('legacy_user', 'x', '老用户', '', '2026-01-01 00:00');
"""

PASS = 0
FAIL = 0
FAILED_NAMES: list[str] = []

# 报告落盘（便于在无法回显 stdout 的终端/工具里核对结果）
REPORT_PATH = os.path.join(HERE, "_ed_smoke_t03_report.txt")


def log(line: str = "") -> None:
    print(line)
    try:
        with open(REPORT_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:  # noqa: BLE001
        pass


def section(title: str) -> None:
    log("\n========== %s ==========" % title)


def ck(label: str, cond, detail="") -> bool:
    global PASS, FAIL
    ok = bool(cond)
    if ok:
        PASS += 1
    else:
        FAIL += 1
        FAILED_NAMES.append(label)
    line = ("  OK  " if ok else "  FAIL") + " " + label
    if detail != "":
        line += "  -> " + str(detail)
    log(line)
    return ok


def hdr(tok: str) -> dict:
    return {"Authorization": "Bearer " + tok}


def client() -> "httpx.Client":
    # trust_env=False：绕过系统 http(s)_proxy（本机指向死代理 127.0.0.1:50558）
    return httpx.Client(base_url=BASE, timeout=TIMEOUT, trust_env=False)


def sql_exec(db_path: str, sql: str, params=()) -> None:
    conn = sqlite3.connect(db_path, timeout=10)
    try:
        conn.execute(sql, params)
        conn.commit()
    finally:
        conn.close()


def sql_cols(db_path: str, table: str) -> set:
    conn = sqlite3.connect(db_path, timeout=10)
    try:
        return {r[1] for r in conn.execute("PRAGMA table_info(%s)" % table)}
    finally:
        conn.close()


def _kill(proc) -> None:
    if proc is None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=10)
    except Exception:  # noqa: BLE001
        try:
            proc.kill()
        except Exception:  # noqa: BLE001
            pass


# ============================ A. 守卫式 ALTER 幂等 ============================
def part_a(work: str, env: dict, db_path: str) -> None:
    section("[A] 守卫式 ALTER 幂等（旧库连跑两遍 init_db）")
    # 建旧库并写入一条存量用户行
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(LEGACY_DDL)
        conn.commit()
    finally:
        conn.close()
    ck("旧库 schema 已建（users 缺 5 新列）",
       "moment_visibility" not in sql_cols(db_path, "users")
       and "announcement" not in sql_cols(db_path, "chat_groups")
       and "group_nickname" not in sql_cols(db_path, "chat_group_members"))

    # 进程内连跑两遍 init_db（幂等性核心断言：第二遍不得抛错）
    code = "import database as d; d.init_db(); d.init_db(); print('INIT_OK')"
    r1 = subprocess.run([sys.executable, "-c", code], cwd=work, env=env,
                        capture_output=True, text=True, timeout=180)
    ck("旧库 init_db 连跑两遍 → 退出码 0", r1.returncode == 0,
       (r1.stderr or r1.stdout)[-200:])
    ck("两遍 init_db 打印 INIT_OK", "INIT_OK" in (r1.stdout or ""), r1.stdout[-120:])

    # 再单独起一个进程跑第三遍（跨进程幂等）
    r2 = subprocess.run([sys.executable, "-c", code], cwd=work, env=env,
                        capture_output=True, text=True, timeout=180)
    ck("第三次跨进程 init_db → 退出码 0（无 duplicate column）", r2.returncode == 0,
       (r2.stderr or r2.stdout)[-200:])

    # 5 列齐备
    u = sql_cols(db_path, "users")
    ck("users.moment_visibility 已加", "moment_visibility" in u)
    ck("users.friend_allow 已加", "friend_allow" in u)
    ck("users.searchable 已加", "searchable" in u)
    ck("chat_groups.announcement 已加", "announcement" in sql_cols(db_path, "chat_groups"))
    ck("chat_group_members.group_nickname 已加",
       "group_nickname" in sql_cols(db_path, "chat_group_members"))

    # 存量行默认值 = 现状行为
    conn = sqlite3.connect(db_path, timeout=10)
    try:
        row = conn.execute(
            "SELECT moment_visibility, friend_allow, searchable FROM users WHERE username='legacy_user'"
        ).fetchone()
    finally:
        conn.close()
    ck("存量行默认 moment_visibility='friends'", row and row[0] == "friends", row)
    ck("存量行默认 friend_allow='need_confirm'", row and row[1] == "need_confirm", row)
    ck("存量行默认 searchable=1（可被搜索）", row and row[2] == 1, row)

    # 双保险谓词语义：searchable 三态（1 / NULL / 0）在 (col IS NULL OR col != 0) 下的取舍。
    # 线上列经守卫 ALTER 为 NOT NULL DEFAULT 1（NULL 不可达），但半迁移/老库可能存在可空列，
    # 故用可空列独立验证「NULL 视为可搜、仅 0 被排除」，确保历史 NULL 行不被误伤。
    probe_db = os.path.join(work, "probe_null.db")
    if os.path.exists(probe_db):
        os.remove(probe_db)
    pconn = sqlite3.connect(probe_db)
    try:
        pconn.execute("CREATE TABLE probe (id INTEGER PRIMARY KEY, searchable INTEGER)")
        pconn.executemany("INSERT INTO probe (id, searchable) VALUES (?, ?)",
                          [(1, 1), (2, 0), (3, None)])
        pconn.commit()
        hit = [r[0] for r in pconn.execute(
            "SELECT id FROM probe WHERE searchable IS NULL OR searchable != 0 ORDER BY id")]
    finally:
        pconn.close()
    ck("双保险谓词：searchable=1 命中（id=1）", 1 in hit, hit)
    ck("双保险谓词：searchable=0 被排除（id=2 不命中）", 2 not in hit, hit)
    ck("双保险谓词：NULL 行视为可搜（id=3 命中）", 3 in hit, hit)


# ============================ B. HTTP 用例 ============================
def part_b(work: str, env: dict, db_path: str) -> None:
    proc = None
    c = client()
    try:
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app",
             "--host", "127.0.0.1", "--port", str(PORT), "--log-level", "warning"],
            cwd=work, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        section("[B0] 服务可达性（等 /api/health）")
        up = False
        for _ in range(80):
            if proc.poll() is not None:
                break
            try:
                if c.get("/api/health").status_code == 200:
                    up = True
                    break
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.5)
        if not up:
            out = ""
            try:
                out = (proc.stdout.read() or "")[-500:] if proc.stdout else ""
            except Exception:  # noqa: BLE001
                pass
            log("  服务未能就绪；uvicorn 输出：\n%s" % out)
            ck("uvicorn 就绪", False, "服务不可达")
            return
        ck("GET /api/health → 200", True, BASE)

        suffix = uuid.uuid4().hex[:6]

        def reg(tag: str, nick: str):
            r = c.post("/api/auth/register",
                       json={"username": tag + suffix, "password": "pass1234",
                             "nickname": nick + suffix})
            body = r.json() if r.status_code == 200 else {}
            return body.get("token", ""), (body.get("user") or {}).get("id", 0)

        def put_priv(tok, patch):
            return c.put("/api/users/me/privacy", json=patch, headers=hdr(tok))

        # ---------- [1] /me 含 privacy 默认值 ----------
        section("[1] GET /api/auth/me 含 privacy（默认 friends/need_confirm/True）")
        tok1, uid1 = reg("eda", "甲")
        ck("注册 eda → 取得 token/id", bool(tok1) and uid1 > 0, uid1)
        me = c.get("/api/auth/me", headers=hdr(tok1))
        ck("GET /api/auth/me → 200", me.status_code == 200, me.status_code)
        mj = me.json() if me.status_code == 200 else {}
        ck("响应含 privacy 对象", isinstance(mj.get("privacy"), dict), sorted(mj.keys()))
        p = mj.get("privacy", {})
        ck("默认 momentVisibility='friends'", p.get("momentVisibility") == "friends", p)
        ck("默认 friendAllow='need_confirm'", p.get("friendAllow") == "need_confirm", p)
        ck("默认 searchable=True（bool）", p.get("searchable") is True, p)

        # ---------- [2] PUT 部分更新 ----------
        section("[2] PUT /api/users/me/privacy 部分更新 + 全量返回 + 持久化")
        r = put_priv(tok1, {"friendAllow": "nobody"})
        ck("PUT {friendAllow:nobody} → 200", r.status_code == 200, r.status_code)
        b = r.json() if r.status_code == 200 else {}
        ck("响应为全量 privacy（三字段齐）",
           set(b.keys()) == {"momentVisibility", "friendAllow", "searchable"}, sorted(b.keys()))
        ck("friendAllow 已更新=nobody", b.get("friendAllow") == "nobody", b)
        ck("未传字段 momentVisibility 保持='friends'", b.get("momentVisibility") == "friends", b)
        ck("未传字段 searchable 保持=True", b.get("searchable") is True, b)
        me2 = c.get("/api/auth/me", headers=hdr(tok1)).json()
        ck("GET /me 已持久化 friendAllow=nobody",
           me2.get("privacy", {}).get("friendAllow") == "nobody", me2.get("privacy"))

        r = put_priv(tok1, {"searchable": False})
        ck("PUT {searchable:false} → 200 且返回 False",
           r.status_code == 200 and r.json().get("searchable") is False, r.text[:80])
        ck("searchable 更新不影响 friendAllow（仍 nobody）",
           r.json().get("friendAllow") == "nobody", r.json())

        # ---------- [3] 非法枚举 ----------
        section("[3] 非法枚举 / 空请求体 → 400「设置值不合法」")
        for bad in ({"momentVisibility": "everyone"}, {"friendAllow": "sometimes"}, {}):
            r = put_priv(tok1, bad)
            ck("非法/空请求体 %s → 400" % (bad or "空对象"), r.status_code == 400, r.status_code)
        ck("错误 detail=设置值不合法", "设置值不合法" in r.text, r.text[:120])

        # ---------- [4] 公开主页红线 ----------
        section("[4] GET /api/users/{id} 不含 privacy/phone/gender/birthday")
        tok2, uid2 = reg("edb", "乙")
        prof = c.get("/api/users/%d" % uid2, headers=hdr(tok1))
        ck("GET /api/users/{id} → 200", prof.status_code == 200, prof.status_code)
        pj = prof.json()
        leak = [k for k in ("privacy", "phone", "gender", "birthday") if k in pj]
        ck("公开主页不含 privacy/phone/gender/birthday（逐字段）", not leak, leak)
        ck("公开主页响应体不含隐私字段串",
           all(('"%s"' % k) not in prof.text for k in ("phone", "gender", "birthday", "privacy")),
           prof.text[:80])
        ck("公开主页仍含公开字段 nickname/isFriend",
           "nickname" in pj and "isFriend" in pj, sorted(pj.keys()))

        # ---------- [5] 搜索过滤 ----------
        section("[5] GET /api/friends/search searchable 过滤 + NULL 双保险 + 好友不受影响")
        tok3, uid3 = reg("edc", "可搜丙")
        q = "可搜丙" + suffix
        r = c.get("/api/friends/search", params={"q": q}, headers=hdr(tok2))
        ck("默认（searchable=1）可搜到 uid3",
           uid3 in [it["id"] for it in r.json().get("items", [])], r.text[:120])

        put_priv(tok3, {"searchable": False})
        r = c.get("/api/friends/search", params={"q": q}, headers=hdr(tok2))
        ck("searchable=0：搜不到 uid3",
           uid3 not in [it["id"] for it in r.json().get("items", [])], r.text[:120])
        ck("搜不到返回 200 + 空 items（不报错，防探测）",
           r.status_code == 200 and r.json().get("items") == [], r.text[:120])

        # 注：searchable 经守卫 ALTER 为 NOT NULL DEFAULT 1，线上不会产生 NULL 行；
        #     NULL 兜底谓词（is_(None) OR !=0）的语义在 [A] 段以 SQL 探针单独验证。

        # 已是好友不受 searchable 影响
        r = c.post("/api/friends/requests", json={"toUserId": uid3}, headers=hdr(tok2))
        rid = (r.json().get("requestId") if r.status_code == 200 else 0) or 0
        c.post("/api/friends/requests/%d/accept" % rid, headers=hdr(tok3))
        fr = c.get("/api/friends", headers=hdr(tok2)).json()
        ck("关闭搜索不影响已是好友（好友列表含 uid3）",
           uid3 in [it["id"] for it in fr.get("items", [])], [it["id"] for it in fr.get("items", [])])

        # ---------- [6] 加好友三档 ----------
        section("[6] POST /api/friends/requests 三档 + 黑名单优先")
        tokN, uidN = reg("edn", "不收丁")
        put_priv(tokN, {"friendAllow": "nobody"})
        r = c.post("/api/friends/requests", json={"toUserId": uidN}, headers=hdr(tok2))
        ck("nobody → 400", r.status_code == 400, r.status_code)
        ck("nobody 文案=对方暂不接受好友申请", "对方暂不接受好友申请" in r.text, r.text[:120])
        out = c.get("/api/friends/requests", headers=hdr(tok2)).json().get("outgoing", [])
        ck("nobody 不产生 pending 记录",
           not any((o.get("user") or {}).get("id") == uidN for o in out), len(out))

        tokE, uidE = reg("ede", "免验戊")
        put_priv(tokE, {"friendAllow": "everyone"})
        r = c.post("/api/friends/requests", json={"toUserId": uidE}, headers=hdr(tok2))
        ck("everyone → 200", r.status_code == 200, r.status_code)
        eb = r.json() if r.status_code == 200 else {}
        ck("everyone 返回结构同构 {ok,autoAccepted,user}",
           set(eb.keys()) == {"ok", "autoAccepted", "user"}, sorted(eb.keys()))
        ck("everyone 返回 autoAccepted=True 且 ok=True",
           eb.get("autoAccepted") is True and eb.get("ok") is True, eb)
        ck("everyone 返回的 user.id == 目标",
           isinstance(eb.get("user"), dict) and eb["user"].get("id") == uidE, eb.get("user"))
        a_list = [x["id"] for x in c.get("/api/friends", headers=hdr(tok2)).json()["items"]]
        e_list = [x["id"] for x in c.get("/api/friends", headers=hdr(tokE)).json()["items"]]
        ck("everyone：双方好友列表互见", uidE in a_list and uid2 in e_list,
           "a=%s e=%s" % (a_list, e_list))

        tokC, uidC = reg("edf", "待验己")
        r = c.post("/api/friends/requests", json={"toUserId": uidC}, headers=hdr(tok2))
        ck("need_confirm → 200 走 pending（含 requestId）",
           r.status_code == 200 and "requestId" in r.json(), r.text[:120])
        ck("need_confirm 非 autoAccepted", r.json().get("autoAccepted") is not True, r.json())

        tokB, uidB = reg("edg", "拉黑庚")
        put_priv(tokB, {"friendAllow": "everyone"})
        c.post("/api/friends/block", json={"userId": uidB}, headers=hdr(tok2))  # 我拉黑对方
        r = c.post("/api/friends/requests", json={"toUserId": uidB}, headers=hdr(tok2))
        ck("黑名单（我拉黑对方）优先于 everyone 三档 → 400", r.status_code == 400, r.status_code)
        tokH, uidH = reg("edh", "反向辛")
        put_priv(tokH, {"friendAllow": "everyone"})
        c.post("/api/friends/block", json={"userId": uid2}, headers=hdr(tokH))  # 对方拉黑我
        r = c.post("/api/friends/requests", json={"toUserId": uidH}, headers=hdr(tok2))
        ck("黑名单（对方拉黑我）优先于 everyone 三档 → 400", r.status_code == 400, r.status_code)

        # ---------- [7] 动态可见性 ----------
        section("[7] 动态可见性三档 + 双向拉黑剔除")
        tokA, uidA = reg("edi", "观者壬")
        tokP, uidP = reg("edj", "作者癸")
        r = c.post("/api/moments", json={"content": "t03 可见性样本", "images": []}, headers=hdr(tokP))
        ck("作者发动态 → 200", r.status_code == 200, r.status_code)

        # friends（默认）：非好友不可见
        feed = c.get("/api/moments/feed", headers=hdr(tokA)).json()
        ck("friends 三档：非好友 feed 不含作者动态",
           all(it["author"]["id"] != uidP for it in feed.get("items", [])),
           [it["author"]["id"] for it in feed.get("items", [])])
        r = c.get("/api/moments/user/%d" % uidP, headers=hdr(tokA))
        ck("friends：非好友 GET /moments/user/{uid} → 403", r.status_code == 403, r.status_code)
        ck("403 文案=仅好友可见该动态", "仅好友可见" in r.text, r.text[:120])

        # public：任何登录用户可见
        put_priv(tokP, {"momentVisibility": "public"})
        feed = c.get("/api/moments/feed", headers=hdr(tokA)).json()
        ck("public：非好友 feed 可见",
           any(it["author"]["id"] == uidP for it in feed.get("items", [])),
           [it["author"]["id"] for it in feed.get("items", [])])
        r = c.get("/api/moments/user/%d" % uidP, headers=hdr(tokA))
        ck("public：非好友 GET /moments/user/{uid} → 200", r.status_code == 200, r.status_code)

        # private：仅本人
        put_priv(tokP, {"momentVisibility": "private"})
        feed = c.get("/api/moments/feed", headers=hdr(tokA)).json()
        ck("private：非好友 feed 不含",
           all(it["author"]["id"] != uidP for it in feed.get("items", [])), "ok")
        ck("private：非好友 GET user/{uid} → 403",
           c.get("/api/moments/user/%d" % uidP, headers=hdr(tokA)).status_code == 403)
        ck("private：本人 GET user/{uid} → 200",
           c.get("/api/moments/user/%d" % uidP, headers=hdr(tokP)).status_code == 200)

        # friends 生效：成为好友
        put_priv(tokP, {"momentVisibility": "friends"})
        r = c.post("/api/friends/requests", json={"toUserId": uidP}, headers=hdr(tokA))
        rid = (r.json().get("requestId") if r.status_code == 200 else 0) or 0
        c.post("/api/friends/requests/%d/accept" % rid, headers=hdr(tokP))
        feed = c.get("/api/moments/feed", headers=hdr(tokA)).json()
        ck("friends：成为好友后 feed 可见",
           any(it["author"]["id"] == uidP for it in feed.get("items", [])), "ok")

        # 双向拉黑剔除（我拉黑对方）
        c.post("/api/friends/block", json={"userId": uidP}, headers=hdr(tokA))
        feed = c.get("/api/moments/feed", headers=hdr(tokA)).json()
        ck("我拉黑对方：feed 剔除该好友动态（本批修复点）",
           all(it["author"]["id"] != uidP for it in feed.get("items", [])), "ok")
        ck("我拉黑对方：GET user/{uid} → 403",
           c.get("/api/moments/user/%d" % uidP, headers=hdr(tokA)).status_code == 403)
        c.delete("/api/friends/block/%d" % uidP, headers=hdr(tokA))

        # 反向：对方拉黑我
        c.put("/api/users/me/privacy", json={"momentVisibility": "public"}, headers=hdr(tokP))
        c.post("/api/friends/block", json={"userId": uidA}, headers=hdr(tokP))
        feed = c.get("/api/moments/feed", headers=hdr(tokA)).json()
        ck("对方拉黑我：feed 同样剔除（双向）",
           all(it["author"]["id"] != uidP for it in feed.get("items", [])), "ok")
        c.delete("/api/friends/block/%d" % uidA, headers=hdr(tokP))

        # 解除后 public 恢复可见
        feed = c.get("/api/moments/feed", headers=hdr(tokA)).json()
        ck("解除拉黑后 public 作者恢复可见",
           any(it["author"]["id"] == uidP for it in feed.get("items", [])), "ok")

        # 本人动态恒可见
        c.post("/api/moments", json={"content": "我自己的动态", "images": []}, headers=hdr(tokA))
        feed = c.get("/api/moments/feed", headers=hdr(tokA)).json()
        ck("本人动态恒可见于自己的 feed",
           any(it["author"]["id"] == uidA for it in feed.get("items", [])), "ok")

        # feed 作者字段白名单（隐私红线）
        au_keys = set()
        for it in feed.get("items", []):
            au_keys |= set((it.get("author") or {}).keys())
        ck("feed 作者字段仅白名单（无 phone/gender/birthday/privacy）",
           not (au_keys & {"phone", "gender", "birthday", "privacy"}), au_keys)

    finally:
        _kill(proc)
        try:
            c.close()
        except Exception:  # noqa: BLE001
            pass
        log("\n  [清理] uvicorn 进程已终止")


def main() -> int:
    try:
        with open(REPORT_PATH, "w", encoding="utf-8"):
            pass
    except Exception:  # noqa: BLE001
        pass
    log("T03 后端冒烟（隐私与群设置）· 隔离副本模式")
    tmp_root = tempfile.mkdtemp(prefix="ed_t03_")
    work = os.path.join(tmp_root, "server")
    try:
        shutil.copytree(
            SERVER_SRC, work,
            ignore=shutil.ignore_patterns(".venv", "*.db", "*.db-*", ".env",
                                          "uploads", "__pycache__", "*.pyc"))
        # 另造 .env（不复制生产 .env）
        with open(os.path.join(work, ".env"), "w", encoding="utf-8") as f:
            f.write("JWT_SECRET=ed-t03-smoke-secret\n")
        env = os.environ.copy()
        env["JWT_SECRET"] = "ed-t03-smoke-secret"
        env["DATABASE_PATH"] = "data.db"
        env["RATE_AUTH_PER_MIN"] = "100"   # 冒烟注册较多账号，避免触发限流
        db_path = os.path.join(work, "data.db")

        log("隔离副本：%s" % work)
        part_a(work, env, db_path)
        part_b(work, env, db_path)
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)

    total = PASS + FAIL
    log("\n========== 汇总 ==========")
    log("通过 %d / %d 项，失败 %d 项" % (PASS, total, FAIL))
    if FAILED_NAMES:
        log("失败用例：")
        for n in FAILED_NAMES:
            log("  - " + n)
    return 1 if FAIL else 0


if __name__ == "__main__":
    try:
        _rc = main()
    except Exception:  # noqa: BLE001
        import traceback

        with open(REPORT_PATH, "a", encoding="utf-8") as _f:
            _f.write("CRASH:\n" + traceback.format_exc())
        _rc = 3
    sys.exit(_rc)
