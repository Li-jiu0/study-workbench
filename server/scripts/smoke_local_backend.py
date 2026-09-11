# -*- coding: utf-8 -*-
"""T07 隔离环境端到端 smoke：对真实运行的 FastAPI 后端逐条真跑 HTTP 用例。

覆盖批次一后端改动（T02 + TTS）：
  1) 注册 → 登录，取 token
  2) POST /api/auth/change-password 四路（旧错 400 / 新旧相同 400 / 5 位 422 / 正常 200）
     —— 并做闭环：改后用新密码能登录、用旧密码登录 400
  3) POST /api/uploads/voice 四路（webm 200 落盘 / PNG 400 / 空 400 / >2MB 400）
  4) kind=voice 放行（私聊发 voice → 200；GET 取回 kind=voice；bogus → 落回 text）
  5) GET /api/tts（空 400 / 纯标点 400 / hello 200 或联网不可达时 SKIP /
     带标点整句必须 502 不是 500 / 假上游必须 502 + {"error":"tts_unavailable"}）
  6) GET /api/users/{id} 响应体不含 phone/gender/birthday（隐私红线）
  7) 好友申请已读角标（2026-09-12）：
     - POST /api/friends/requests/seen 未登录 → 401
     - 全新账号（从未查看）GET /api/friends/requests → 含 unreadCount 且 == pending incoming 条数
     - POST seen 之后 GET → unreadCount == 0 且 incoming 数组内容不变（只加字段不改语义）
     - seen 后新到一条申请 → unreadCount == 1
     - 无任何申请的新账号 → unreadCount == 0 且 incoming == []

依赖：纯 stdlib + httpx（假上游用例额外用 fastapi.testclient，仅在后端依赖齐全时启用）。

用法（推荐在隔离副本目录里跑）：
    # 终端 A（在 server 副本目录，端口 8899）
    python -m uvicorn main:app --host 127.0.0.1 --port 8899
    # 终端 B
    python scripts/smoke_local_backend.py
    # 或指定地址
    SW_BASE=http://127.0.0.1:8899 python scripts/smoke_local_backend.py

退出码：0 全过；1 有 FAIL；2 前置不满足（服务不可达 / 缺 httpx）。
"""
import os
import sys
import time
import uuid

try:
    import httpx
except ImportError:  # pragma: no cover
    print("需要 httpx：请先 pip install httpx")
    sys.exit(2)

BASE = os.environ.get("SW_BASE", "http://127.0.0.1:8899").rstrip("/")
SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIMEOUT = float(os.environ.get("SW_TIMEOUT", "30"))

PASS = 0
FAIL = 0
SKIP = 0
FAILED_NAMES: list[str] = []


def _local_client() -> "httpx.Client":
    """指向本机后端的客户端：trust_env=False 绕过系统 HTTP(S)_PROXY，直连 127.0.0.1。"""
    return httpx.Client(base_url=BASE, timeout=TIMEOUT, trust_env=False)


def section(title: str) -> None:
    print("\n========== %s ==========" % title)


def ck(label: str, cond, detail="") -> bool:
    """记录一条断言。cond 为真记 PASS，否则记 FAIL。"""
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
    print(line)
    return ok


def skip(label: str, reason: str) -> None:
    global SKIP
    SKIP += 1
    print("  SKIP " + label + "  -> " + reason)


def auth(token: str) -> dict:
    return {"Authorization": "Bearer " + token}


def register(c: "httpx.Client", suffix: str, tag: str, nick: str, pw: str) -> str:
    """注册一个冒烟账号并返回其 token（注册即发 token，无需再登录）。"""
    r = c.post("/api/auth/register",
               json={"username": tag + suffix, "password": pw, "nickname": nick + suffix})
    return (r.json().get("token") if r.status_code == 200 else "") or ""


def main() -> int:
    # ---------- 0. 服务可达性 ----------
    section("[0] 服务可达性")
    try:
        with _local_client() as c:
            r = c.get("/api/health")
        ck("GET /api/health → 200", r.status_code == 200, r.status_code)
        ck("health.ok == True", r.json().get("ok") is True, r.text[:120])
    except Exception as e:  # noqa: BLE001
        print("  服务不可达（%s）：请先在隔离副本目录起 `python -m uvicorn main:app --port 8899`" % BASE)
        print("  详细错误：%r" % (e,))
        return 2

    suffix = uuid.uuid4().hex[:8]
    u1 = "smk" + suffix            # 11 位，符合 3-20 位用户名规则
    u2 = "smq" + suffix
    nick1 = "冒烟一号" + suffix
    old_pw = "pass1234"
    new_pw = "newpass99"
    tok1 = ""
    tok2 = ""
    uid1 = 0
    uid2 = 0

    with _local_client() as c:
        # ---------- 1. 注册 → 登录 ----------
        section("[1] 注册 → 登录（取 token）")
        r = c.post("/api/auth/register", json={"username": u1, "password": old_pw, "nickname": nick1})
        ck("注册 u1 → 200", r.status_code == 200, r.status_code)
        body = r.json() if r.status_code == 200 else {}
        ck("注册返回 access token", bool(body.get("token")), (body.get("token") or "")[:16] + "...")
        ck("注册返回 user.id", isinstance(body.get("user", {}).get("id"), int), body.get("user"))
        uid1 = (body.get("user") or {}).get("id", 0)
        ck("u1.id 为正整数", isinstance(uid1, int) and uid1 > 0, uid1)

        r = c.post("/api/auth/register", json={"username": u2, "password": old_pw, "nickname": "冒烟二号" + suffix})
        ck("注册 u2 → 200", r.status_code == 200, r.status_code)
        b2 = r.json() if r.status_code == 200 else {}
        uid2 = (b2.get("user") or {}).get("id", 0)
        tok2 = b2.get("token", "")
        ck("u2.id 为正整数", isinstance(uid2, int) and uid2 > 0, uid2)

        r = c.post("/api/auth/login", json={"username": u1, "password": old_pw})
        ck("u1 用初始密码登录 → 200", r.status_code == 200, r.status_code)
        tokA = (r.json().get("token") if r.status_code == 200 else "") or ""
        ck("登录取得 access token", bool(tokA), (tokA or "")[:16] + "...")

        # ---------- 2. 修改密码四路 + 闭环 ----------
        section("[2] POST /api/auth/change-password（四路 + 闭环）")
        r = c.post("/api/auth/change-password",
                   json={"oldPassword": "WRONG_pw", "newPassword": new_pw}, headers=auth(tokA))
        ck("①旧密码错 → 400", r.status_code == 400, r.status_code)
        ck("①文案=当前密码不正确", "当前密码不正确" in r.text, r.text[:80])

        r = c.post("/api/auth/change-password",
                   json={"oldPassword": old_pw, "newPassword": old_pw}, headers=auth(tokA))
        ck("②新密码==旧密码 → 400", r.status_code == 400, r.status_code)
        ck("②文案=不能与当前密码相同", "不能与当前密码相同" in r.text, r.text[:80])

        r = c.post("/api/auth/change-password",
                   json={"oldPassword": old_pw, "newPassword": "pass1"}, headers=auth(tokA))
        ck("③新密码 5 位 → 422（pydantic min_length=6，非 400）", r.status_code == 422, r.status_code)

        r = c.post("/api/auth/change-password",
                   json={"oldPassword": old_pw, "newPassword": new_pw}, headers=auth(tokA))
        ck("④正常改密 → 200", r.status_code == 200, r.status_code)
        ck("④返回 {ok:true}", r.json().get("ok") is True, r.text[:80])

        # 闭环：新密码能登录、旧密码不能
        r = c.post("/api/auth/login", json={"username": u1, "password": new_pw})
        ck("闭环：用【新】密码登录 → 200", r.status_code == 200, r.status_code)
        tok1 = (r.json().get("token") if r.status_code == 200 else "") or ""
        r = c.post("/api/auth/login", json={"username": u1, "password": old_pw})
        ck("闭环：用【旧】密码登录 → 400", r.status_code == 400, r.status_code)

        # ---------- 3. 语音上传四路 ----------
        section("[3] POST /api/uploads/voice（四路）")
        webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 2048          # EBML(webm) 魔数，≥1KB
        r = c.post("/api/uploads/voice",
                   files={"file": ("rec.webm", webm, "audio/webm")}, headers=auth(tok1))
        ck("①webm 魔数 ≥1KB → 200", r.status_code == 200, r.status_code)
        url = (r.json().get("url") if r.status_code == 200 else "") or ""
        ck("①返回 url 以 /uploads/voice/ 开头", url.startswith("/uploads/voice/"), url)
        # 落盘验证：通过静态挂载把文件取回来，字节一致即证明已落盘
        if url:
            fr = c.get(url)
            ck("①上传文件确实落盘（GET 静态 URL → 200 且字节一致）",
               fr.status_code == 200 and fr.content == webm,
               "status=%s len=%s/%s" % (fr.status_code, len(fr.content), len(webm)))
        else:
            ck("①上传文件确实落盘（GET 静态 URL → 200 且字节一致）", False, "无 url")

        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        r = c.post("/api/uploads/voice",
                   files={"file": ("x.png", png, "image/png")}, headers=auth(tok1))
        ck("②非音频（PNG 魔数）→ 400", r.status_code == 400, r.status_code)

        r = c.post("/api/uploads/voice",
                   files={"file": ("empty.webm", b"", "audio/webm")}, headers=auth(tok1))
        ck("③空文件 → 400", r.status_code == 400, r.status_code)

        big = b"\x1a\x45\xdf\xa3" + b"\x00" * (2 * 1024 * 1024 + 8)   # > 2MB
        r = c.post("/api/uploads/voice",
                   files={"file": ("big.webm", big, "audio/webm")}, headers=auth(tok1))
        ck("④>2MB → 400", r.status_code == 400, r.status_code)
        ck("④文案=语音超过 2MB", "语音超过 2MB" in r.text, r.text[:80])

        # ---------- 4. kind=voice 放行 ----------
        section("[4] 私聊 kind=voice 放行（需先成为好友）")
        r = c.post("/api/friends/requests", json={"toUserId": uid2}, headers=auth(tok1))
        ck("u1 向 u2 发好友申请 → 200", r.status_code == 200, r.status_code)
        rid = (r.json().get("requestId") if r.status_code == 200 else 0) or 0
        r = c.post("/api/friends/requests/%d/accept" % rid, headers=auth(tok2))
        ck("u2 同意申请 → 200", r.status_code == 200, r.status_code)

        voice_url = url or "/uploads/voice/placeholder.webm"
        r = c.post("/api/chat/%d/messages" % uid2,
                   json={"content": voice_url, "kind": "voice"}, headers=auth(tok1))
        ck("发 kind=voice 消息 → 200", r.status_code == 200, r.status_code)
        ck("返回 kind 保持 voice", r.json().get("kind") == "voice", r.json().get("kind"))

        r = c.get("/api/chat/%d/messages" % uid2, headers=auth(tok1))
        ck("GET 会话消息 → 200", r.status_code == 200, r.status_code)
        items = r.json().get("items", []) if r.status_code == 200 else []
        voice_msgs = [m for m in items if m.get("kind") == "voice"]
        ck("取回的 voice 消息仍在（kind 未被改写）", len(voice_msgs) >= 1,
           "voice=%d / total=%d" % (len(voice_msgs), len(items)))

        r = c.post("/api/chat/%d/messages" % uid2,
                   json={"content": "hello", "kind": "bogus"}, headers=auth(tok1))
        ck("kind=bogus → 200 且落回 text", r.status_code == 200 and r.json().get("kind") == "text",
           "status=%s kind=%s" % (r.status_code, r.json().get("kind")))

        # ---------- 5. TTS ----------
        section("[5] GET /api/tts")
        r = c.get("/api/tts", params={"text": ""})
        ck("①text 空 → 400", r.status_code == 400, r.status_code)

        r = c.get("/api/tts", params={"text": "?!!"})
        ck("②纯标点（清洗后为空）→ 400", r.status_code == 400, r.status_code)

        # 先探测本机能否连上有道（决定 ③ 是断言 200 还是 SKIP）
        youdao_ok = False
        try:
            probe = httpx.get("https://dict.youdao.com/dictvoice?audio=hello&type=1", timeout=10)
            youdao_ok = probe.status_code == 200 and len(probe.content) > 0
        except Exception:  # noqa: BLE001
            youdao_ok = False

        r = c.get("/api/tts", params={"text": "hello"})
        if youdao_ok:
            ck("③text=hello → 200 audio/mpeg", r.status_code == 200, r.status_code)
            ck("③Content-Type 含 audio/mpeg", "audio/mpeg" in r.headers.get("content-type", ""),
               r.headers.get("content-type"))
        else:
            if r.status_code == 502:
                skip("③text=hello → 200 audio/mpeg", "本机连不上有道（上游不可达），返回 502 属预期")
            else:
                ck("③text=hello → 200 或 502（联网不可达时）", r.status_code in (200, 502), r.status_code)

        r = c.get("/api/tts", params={"text": "Hi, what can I get for you today?", "lang": "en"})
        ck("④带标点整句 → 不 500（502/200 均可，验收点=不是 500）", r.status_code != 500, r.status_code)
        ck("④状态码 ∈ {200, 502}", r.status_code in (200, 502), r.status_code)
        if r.status_code == 502:
            ck("④失败体为 {error:tts_unavailable}", r.json().get("error") == "tts_unavailable", r.text[:120])

    # ---------- 5⑤ 假上游（进程内 monkeypatch，确定性验证 502） ----------
    _offline_upstream_case()

    # ---------- 6. 隐私红线 ----------
    section("[6] GET /api/users/{id} 隐私红线")
    with _local_client() as c:
        r = c.get("/api/users/%d" % uid2, headers=auth(tok1))
        ck("GET /api/users/{u2} → 200", r.status_code == 200, r.status_code)
        prof = r.json() if r.status_code == 200 else {}
        leaked = [k for k in ("phone", "gender", "birthday") if k in prof]
        ck("响应体不含 phone/gender/birthday", not leaked, ("泄露字段=%s" % leaked) if leaked else "clean")
        ck("仍含公开字段 nickname/isFriend", "nickname" in prof and "isFriend" in prof,
           sorted(prof.keys()))

    # ---------- 7. 好友申请已读角标 ----------
    section("[7] 好友申请已读：GET /requests 的 unreadCount + POST /requests/seen")
    with _local_client() as c:
        # ① 未登录调 seen → 401
        r = c.post("/api/friends/requests/seen")
        ck("①未登录 POST /requests/seen → 401", r.status_code == 401, r.status_code)

        # ② 注册 u3/u4/u5（注册即发 token）；u3 给 u1 发一条申请
        tok3 = register(c, suffix, "smr", "冒烟三号", old_pw)
        tok4 = register(c, suffix, "sms", "冒烟四号", old_pw)
        tok5 = register(c, suffix, "smt", "冒烟五号", old_pw)
        ck("②u3/u4/u5 注册均取得 token", bool(tok3) and bool(tok4) and bool(tok5),
           "tok3=%s tok4=%s tok5=%s" % (bool(tok3), bool(tok4), bool(tok5)))
        r = c.post("/api/friends/requests", json={"toUserId": uid1}, headers=auth(tok3))
        ck("②u3 向 u1 发申请 → 200", r.status_code == 200, r.text[:80])

        # ③ 全新视角（u1 从未查看过，last_request_seen_at=NULL）
        r = c.get("/api/friends/requests", headers=auth(tok1))
        ck("③u1 GET /requests → 200", r.status_code == 200, r.status_code)
        body = r.json() if r.status_code == 200 else {}
        n_in = len(body.get("incoming", []))
        ck("③响应含新增字段 unreadCount（且 incoming/outgoing 仍在）",
           "unreadCount" in body and "incoming" in body and "outgoing" in body,
           sorted(body.keys()))
        ck("③未查看时 unreadCount == pending incoming 条数",
           body.get("unreadCount") == n_in and n_in >= 1,
           "unreadCount=%s incoming=%d" % (body.get("unreadCount"), n_in))
        incoming_before = body.get("incoming")

        # ④ 标记已读 → unreadCount 清零，且 incoming 内容逐字节不变
        r = c.post("/api/friends/requests/seen", headers=auth(tok1))
        ck("④u1 POST /requests/seen → 200", r.status_code == 200, r.status_code)
        ck("④返回 {ok:true, unreadCount:0}",
           r.json().get("ok") is True and r.json().get("unreadCount") == 0, r.text[:120])
        r = c.get("/api/friends/requests", headers=auth(tok1))
        body = r.json() if r.status_code == 200 else {}
        ck("④seen 后 unreadCount == 0", body.get("unreadCount") == 0, body.get("unreadCount"))
        ck("④incoming 数组内容未变（证明只加字段没改语义）",
           body.get("incoming") == incoming_before,
           "before=%s after=%d" % (len(incoming_before or []), len(body.get("incoming", []))))

        # ⑤ seen 之后新到一条申请 → unreadCount == 1
        # created_at 与 last_request_seen_at 均为秒级精度（'YYYY-MM-DD HH:MM:SS'），
        # 比较用 >（严格大于），同一秒内新到的申请不计入未读；为让本用例确定性通过，先等 1.2s。
        time.sleep(1.2)
        r = c.post("/api/friends/requests", json={"toUserId": uid1}, headers=auth(tok4))
        ck("⑤u4 向 u1 发新申请 → 200", r.status_code == 200, r.text[:80])
        r = c.get("/api/friends/requests", headers=auth(tok1))
        body = r.json() if r.status_code == 200 else {}
        ck("⑤新到的申请计入未读：unreadCount == 1",
           body.get("unreadCount") == 1, body.get("unreadCount"))

        # ⑥ 无任何申请的新账号 → unreadCount == 0
        r = c.get("/api/friends/requests", headers=auth(tok5))
        body = r.json() if r.status_code == 200 else {}
        ck("⑥无申请账号 unreadCount == 0", body.get("unreadCount") == 0, body.get("unreadCount"))
        ck("⑥无申请账号 incoming == []", body.get("incoming") == [], body.get("incoming"))

    # ---------- 汇总 ----------
    total = PASS + FAIL
    print("\n========== 汇总 ==========")
    print("通过 %d 项，失败 %d 项，跳过 %d 项（共 %d 项）" % (PASS, FAIL, SKIP, total + SKIP))
    if FAILED_NAMES:
        print("失败用例：")
        for n in FAILED_NAMES:
            print("  - " + n)
    return 1 if FAIL else 0


def _offline_upstream_case() -> None:
    """假上游用例：monkeypatch 有道的抓取函数，断言 TTS 必返 502 而非 500。

    说明：任务允许「把 url 改成本机不存在的端口或 monkeypatch httpx」。这里用
    fastapi.testclient 在进程内起 app，并把 routers.social._fetch_youdao_voice
    替换为「恒失败」，从而确定性地验证「上游不可达 → 502 + JSON」这条兜底路径，
    不依赖外网、不产生第二个监听端口。
    """
    section("[5⑤] TTS 假上游不可达 → 必须 502（进程内 monkeypatch）")
    if SERVER_DIR not in sys.path:
        sys.path.insert(0, SERVER_DIR)
    try:
        import httpx as _hx
        from fastapi.testclient import TestClient

        import routers.social as social
        from main import app  # 触发 init_db（幂等）

        tc = TestClient(app)
        orig = social._fetch_youdao_voice

        async def _returns_none(piece, tts_type):  # 模拟上游 500/空响应
            return None

        async def _raises(piece, tts_type):         # 模拟上游连接异常
            raise _hx.ConnectError("offline-upstream")

        try:
            social._fetch_youdao_voice = _returns_none
            r = tc.get("/api/tts", params={"text": "hello"})
            ck("假上游（永久失败）→ 502", r.status_code == 502, r.status_code)
            ck("假上游 → JSON {\"error\":\"tts_unavailable\"}",
               r.json() == {"error": "tts_unavailable"}, r.text[:120])

            social._fetch_youdao_voice = _raises
            r = tc.get("/api/tts", params={"text": "hello"})
            ck("上游抛异常 → 502（绝不 500 透传）", r.status_code == 502, r.status_code)
        finally:
            social._fetch_youdao_voice = orig
    except Exception as e:  # noqa: BLE001
        ck("假上游离线用例可执行（需后端依赖齐全）", False, repr(e))


if __name__ == "__main__":
    sys.exit(main())
