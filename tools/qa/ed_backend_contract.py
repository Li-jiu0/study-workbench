# -*- coding: utf-8 -*-
"""QA 独立契约测试（D 部分）：真隔离后端实测。
- 拷贝 server/ 到隔离目录（剔除 .venv/data.db/.env/uploads/backups）
- 造隔离 .env（新 JWT_SECRET、新库、放开限流）
- versions python + PYTHONPATH 指向 xingtu-backend site-packages 启动 uvicorn 8899
- 实测 friends unreadCount 水位线语义 / seen 幂等 / users 隐私 / news 契约
跑法：python tools/qa/ed_backend_contract.py   （自管进程生命周期，跑完自动 kill）
"""
import io, os, shutil, subprocess, sys, time, json, secrets

PY = r"C:/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python.exe"
SITE = r"C:/Users/ATM/.workbuddy/binaries/python/envs/xingtu-backend/Lib/site-packages"
sys.path.insert(0, SITE)  # 主进程也要 fastapi/httpx（D9 进程内测试用）
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(REPO, "server")
WORK = r"D:\cache\temp\qa_backend_iso"
PORT = 8899
BASE = "http://127.0.0.1:%d" % PORT

passed, failed = [0], [0]
def check(label, cond, detail=""):
    if cond:
        passed[0] += 1; print("  PASS " + label + ((" -> " + str(detail)) if detail else ""))
    else:
        failed[0] += 1; print("  FAIL " + label + "  *** FAIL ***" + ((" -> " + str(detail)) if detail else ""))

def copy_server():
    if os.path.exists(WORK):
        shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK, exist_ok=True)
    SKIP = {".venv", "uploads", "backups", "__pycache__", ".pytest_cache"}
    for root, dirs, files in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in SKIP]
        rel = os.path.relpath(root, SRC)
        dst_root = os.path.join(WORK, rel) if rel != "." else WORK
        os.makedirs(dst_root, exist_ok=True)
        for f in files:
            if f in ("data.db", ".env", "data.db-journal", "data.db-wal", "data.db-shm"):
                continue
            shutil.copy2(os.path.join(root, f), os.path.join(dst_root, f))
    env = io.open(os.path.join(WORK, ".env"), "w", encoding="utf-8")
    env.write("JWT_SECRET=qa-iso-%s\n" % secrets.token_hex(24))
    env.write("JWT_EXPIRE_DAYS=7\nDATABASE_PATH=qa_data.db\n")
    env.write("RATE_AUTH_PER_MIN=1000\nRATE_GLOBAL_PER_MIN=1000\nRATE_AI_PER_MIN=1000\n")
    env.close()

def start_backend():
    env = dict(os.environ)
    env["PYTHONPATH"] = SITE
    env.pop("HTTP_PROXY", None); env.pop("HTTPS_PROXY", None)
    env.pop("http_proxy", None); env.pop("https_proxy", None)
    proc = subprocess.Popen(
        [PY, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=WORK, env=env,
        stdout=open(os.path.join(WORK, "uvicorn.log"), "ab"),
        stderr=subprocess.STDOUT)
    return proc

def wait_health(proc, timeout=40):
    import httpx
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return False
        try:
            r = httpx.get(BASE + "/docs", timeout=2, trust_env=False)
            if r.status_code < 500:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False

def main():
    print("== 准备隔离环境 ==")
    copy_server()
    check("server/ 已拷贝到隔离目录（不含 data.db/.env/.venv）",
          os.path.exists(os.path.join(WORK, "main.py")) and
          not os.path.exists(os.path.join(WORK, "data.db")) and
          not os.path.exists(os.path.join(WORK, "qa_data.db")))
    proc = start_backend()
    try:
        ok = wait_health(proc)
        check("隔离后端在 127.0.0.1:8899 启动", ok, "uvicorn.log 尾部见 uvicorn.log")
        if not ok:
            return
        import httpx
        c = httpx.Client(base_url=BASE, trust_env=False, timeout=15)

        print("== [D] 契约实测 ==")
        suf = str(int(time.time()))[-6:]
        def register(name):
            r = c.post("/api/auth/register", json={
                "username": "qaed%s%s" % (name, suf),
                "password": "QaPass!%s" % suf, "nickname": "QA测%s%s" % (name, suf)})
            j = r.json()
            if r.status_code != 200 or not j.get("token"):
                # 可能已存在，直接登录
                r2 = c.post("/api/auth/login", json={
                    "username": "qaed%s%s" % (name, suf), "password": "QaPass!%s" % suf})
                j = r2.json()
            if not j.get("token"):
                raise RuntimeError("注册/登录失败: %s %s" % (r.status_code, json.dumps(j, ensure_ascii=False)[:200]))
            return j["token"], j["user"]["id"]
        tokA, idA = register("A")
        tokB, idB = register("B")
        tokC, idC = register("C")
        tokD, idD = register("D")
        tokE, idE = register("E")
        ha = {"Authorization": "Bearer " + tokA}

        # B → A 申请
        r = c.post("/api/friends/requests", json={"toUserId": idA}, headers={"Authorization": "Bearer " + tokB})
        check("B 向 A 发好友申请成功", r.status_code == 200, r.text[:120])

        r = c.get("/api/friends/requests", headers=ha)
        j = r.json()
        check("GET /api/friends/requests 返回 unreadCount（从未查看 → 1，int 类型）",
              isinstance(j.get("unreadCount"), int) and j["unreadCount"] == 1,
              "unreadCount=%r type=%s" % (j.get("unreadCount"), type(j.get("unreadCount")).__name__))
        check("incoming 仍为 1 条且字段形状不变（id/fromMe/user/createdAt）",
              len(j["incoming"]) == 1 and set(j["incoming"][0].keys()) == {"id", "fromMe", "user", "createdAt"},
              json.dumps(j["incoming"][0], ensure_ascii=False)[:120])

        r1 = c.post("/api/friends/requests/seen", headers=ha)
        j1 = r1.json()
        r2 = c.post("/api/friends/requests/seen", headers=ha)
        j2 = r2.json()
        check("POST seen 幂等（连调两次响应一致）", j1 == j2 and j1.get("ok") is True and j1.get("unreadCount") == 0,
              "%s vs %s" % (j1, j2))

        r = c.get("/api/friends/requests", headers=ha)
        j = r.json()
        check("查看后 unreadCount=0 且 incoming 不丢（原字段语义不变）",
              j["unreadCount"] == 0 and len(j["incoming"]) == 1, "unreadCount=%s" % j["unreadCount"])

        # B 视角：outgoing 1 条；unreadCount 只统计 incoming（放在任何 DB 干预之前）
        r = c.get("/api/friends/requests", headers={"Authorization": "Bearer " + tokB})
        j = r.json()
        check("B 视角 outgoing=1、unreadCount=0（outgoing 不计入未读）",
              len(j["outgoing"]) == 1 and j["unreadCount"] == 0, json.dumps(j)[:150])

        # C 再来一条（间隔 >1 秒）→ 关键水位线场景：unreadCount 必须变 1
        time.sleep(1.3)
        c.post("/api/friends/requests", json={"toUserId": idA}, headers={"Authorization": "Bearer " + tokC})
        r = c.get("/api/friends/requests", headers=ha)
        j = r.json()
        check("查看后又来新申请（隔秒）→ unreadCount=1（不是 0，也不是 2）",
              j["unreadCount"] == 1 and len(j["incoming"]) == 2, "unreadCount=%s incoming=%s" % (j["unreadCount"], len(j["incoming"])))

        # 同秒边界（BUG-2 修复验证）：用新用户 D（重复 pending 会被 400 去重，不能用同一发送者）
        # seen 后立刻（大概率同秒）D 发申请 → unreadCount 必须=1
        c.post("/api/friends/requests/seen", headers=ha)
        r_send = c.post("/api/friends/requests", json={"toUserId": idA}, headers={"Authorization": "Bearer " + tokD})
        check("同秒探针前置：D 的申请发送成功（非重复拒绝）", r_send.status_code == 200, r_send.text[:120])
        r = c.get("/api/friends/requests", headers=ha)
        j = r.json()
        check("同秒边界（BUG-2 修后）：seen 后立刻新申请 → unreadCount=1",
              j["unreadCount"] == 1 and len(j["incoming"]) == 3, "unreadCount=%s incoming=%s" % (j["unreadCount"], len(j["incoming"])))
        check("响应键集合不变（仅 incoming/outgoing/unreadCount）",
              set(j.keys()) == {"incoming", "outgoing", "unreadCount"}, str(sorted(j.keys())))

        # ---- 双水位线 DB 级验证（隔离库 qa_data.db，只碰隔离副本） ----
        # 先补一次 seen：让「写回水位线」与「max pending id」处于同一时刻口径（此前 seen 发生在 D 申请之前）
        c.post("/api/friends/requests/seen", headers=ha)
        import sqlite3
        con = sqlite3.connect(os.path.join(WORK, "qa_data.db"))
        cur = con.cursor()
        row = cur.execute("SELECT last_seen_request_id, last_request_seen_at FROM users WHERE id=?", (idA,)).fetchone()
        max_pending = cur.execute(
            "SELECT MAX(id) FROM friend_requests WHERE to_user_id=? AND status='pending'", (idA,)).fetchone()[0]
        check("seen 写回主水位线 = 当时最大 pending incoming id",
              row is not None and row[0] == max_pending, "last_seen_request_id=%r max_pending=%r" % (row and row[0], max_pending))
        check("时间水位线 last_request_seen_at 保留继续写（存量回退依赖）",
              row is not None and row[1], "last_request_seen_at=%r" % (row and row[1]))

        # 存量回退路径（受控数据法）：清空 pending → seen 写 0 → 手工把 id 水位线置 NULL、
        # 时间水位线固定为 T0 → 直插 3 条申请（T0-60s / T0-30s / T0+3600s）→
        # 时间路径必须只计未来那条（=1），证明「不复活旧已读 + 新申请计数」
        cur.execute("UPDATE friend_requests SET status='accepted' WHERE to_user_id=?", (idA,))
        con.commit()
        c.post("/api/friends/requests/seen", headers=ha)
        T0 = time.strftime("%Y-%m-%d %H:%M:%S")
        def shift(ts, secs):
            import datetime
            return (datetime.datetime.strptime(ts, "%Y-%m-%d %H:%M:%S") + datetime.timedelta(seconds=secs)).strftime("%Y-%m-%d %H:%M:%S")
        cur.execute("UPDATE users SET last_seen_request_id=NULL, last_request_seen_at=? WHERE id=?", (T0, idA))
        cur.execute("INSERT INTO friend_requests(from_user_id,to_user_id,status,created_at) VALUES(?,?, 'pending', ?)", (idB, idA, shift(T0, -60)))
        cur.execute("INSERT INTO friend_requests(from_user_id,to_user_id,status,created_at) VALUES(?,?, 'pending', ?)", (idC, idA, shift(T0, -30)))
        cur.execute("INSERT INTO friend_requests(from_user_id,to_user_id,status,created_at) VALUES(?,?, 'pending', ?)", (idD, idA, shift(T0, 3600)))
        con.commit()
        r = c.get("/api/friends/requests", headers=ha)
        j = r.json()
        check("存量回退（id 水位线 NULL）走时间路径：水位线前的 2 条不复活、未来的 1 条计数 → unreadCount=1",
              j["unreadCount"] == 1 and len(j["incoming"]) == 3, "unreadCount=%s incoming=%s" % (j["unreadCount"], len(j["incoming"])))
        # 重新 seen → 主水位线写回 max id（含直插行），主路径恢复
        c.post("/api/friends/requests/seen", headers=ha)
        row = cur.execute("SELECT last_seen_request_id FROM users WHERE id=?", (idA,)).fetchone()
        max_pending = cur.execute(
            "SELECT MAX(id) FROM friend_requests WHERE to_user_id=? AND status='pending'", (idA,)).fetchone()[0]
        check("重新 seen 后主水位线写回正确 max id", row[0] == max_pending, "id=%r max=%r" % (row[0], max_pending))
        r = c.get("/api/friends/requests", headers=ha)
        check("重新 seen 后 unreadCount=0（主路径恢复）", r.json()["unreadCount"] == 0)

        # 无 pending 时 seen → 写 0；此后新申请仍正确计数（id > 0）
        cur.execute("UPDATE friend_requests SET status='accepted' WHERE to_user_id=?", (idA,))
        con.commit()
        c.post("/api/friends/requests/seen", headers=ha)
        row = cur.execute("SELECT last_seen_request_id FROM users WHERE id=?", (idA,)).fetchone()
        check("无 pending 时 seen → 主水位线写 0", row[0] == 0, "last_seen_request_id=%r" % row[0])
        c.post("/api/friends/requests", json={"toUserId": idA}, headers={"Authorization": "Bearer " + tokE})
        r = c.get("/api/friends/requests", headers=ha)
        check("主水位线为 0 后新申请仍计数（id>0 路径）→ unreadCount=1", r.json()["unreadCount"] == 1,
              "unreadCount=%s" % r.json()["unreadCount"])
        con.close()

        # 隐私红线：GET /api/users/{id} 不得新增 phone/gender/birthday
        r = c.get("/api/users/%d" % idB, headers=ha)
        j = r.json()
        bad = [k for k in ("phone", "gender", "birthday") if k in j]
        check("GET /api/users/{id} 无 phone/gender/birthday", not bad, "keys=" + ",".join(sorted(j.keys())))
        check("公开主页带 presence 白名单字段 lastSeenAt/online",
              "lastSeenAt" in j and "online" in j and isinstance(j["online"], bool))

        # news 契约：真实上游可达 → 200 结构校验；不可达 → 502 news_unavailable（两种都是合法契约）
        r = c.get("/api/news/daily")
        if r.status_code == 200:
            jn = r.json()
            items = jn.get("items") or []
            check("news 200：ok=true / source / updated / items[].title·hot·url 结构齐全",
                  jn.get("ok") is True and isinstance(items, list) and len(items) > 0 and
                  all(("title" in it and "hot" in it and "url" in it) for it in items),
                  "source=%s items=%d" % (jn.get("source"), len(items)))
            check("news 主源：source=中国新闻网 且逐条带真实原文 URL（http 开头，绝无伪造空链接）",
                  jn.get("source") == "中国新闻网" and
                  all(str(it.get("url", "")).startswith("http") for it in items),
                  "sample=" + json.dumps(items[0], ensure_ascii=False)[:120])
            check("news dailyLink 键存在（主源为 null）", "dailyLink" in jn and jn["dailyLink"] is None, repr(jn.get("dailyLink")))
            r2 = c.get("/api/news/daily")
            check("news 30min 服务端缓存命中（第二次请求 updated 与首次一致）",
                  r2.status_code == 200 and r2.json().get("updated") == jn.get("updated"))
        else:
            check("news 上游全挂 → 502 + news_unavailable，不透传上游错误",
                  r.status_code == 502 and r.json() == {"error": "news_unavailable"},
                  "status=%s body=%s" % (r.status_code, r.text[:80]))

        # 401 守卫
        r = c.get("/api/friends/requests")
        check("无 token 访问 friends/requests → 401", r.status_code == 401, str(r.status_code))

        c.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        print("（隔离后端已停止）")

    # ---- 序列化契约（进程内，monkeypatch 上游，不打外网）----
    print("== [D9] news 响应序列化契约（进程内 + 桩上游） ==")
    sys.path.insert(0, WORK)
    os.chdir(WORK)
    import asyncio
    import routers.news as news
    async def stub_china():
        return {"source": "中国新闻网", "updated": "x",
                "items": [{"title": "带链接", "hot": "", "url": "https://www.chinanews.com/a"},
                          {"title": "无链接", "hot": "", "url": None}],
                "dailyLink": None}
    news._FETCHERS = [("stub", stub_china)]
    news._reset_cache()
    resp = asyncio.run(news.news_daily())
    body = json.loads(resp.body.decode("utf-8"))
    check("news_daily 200 ok=true source 正确", resp.status_code == 200 and body["ok"] is True and body["source"] == "中国新闻网")
    check("url=None 序列化为 JSON null（不会变成字符串 None）",
          body["items"][1]["url"] is None and body["items"][0]["url"] == "https://www.chinanews.com/a",
          json.dumps(body["items"][1], ensure_ascii=False))
    check("Cache-Control public,max-age=1800", resp.headers.get("cache-control") == "public, max-age=1800", str(resp.headers.get("cache-control")))
    # 缓存命中：改桩仍返回旧缓存
    async def stub2():
        return {"source": "另一个源", "updated": "", "items": [{"title": "新", "hot": "", "url": "x"}], "dailyLink": None}
    news._FETCHERS = [("stub2", stub2)]
    resp2 = asyncio.run(news.news_daily())
    body2 = json.loads(resp2.body.decode("utf-8"))
    check("30min 服务端缓存命中（不改桩结果仍返回第一条数据）", body2["source"] == "中国新闻网" and len(body2["items"]) == 2)

    print("\n===== 汇总 =====")
    print("PASS=%d  FAIL=%d" % (passed[0], failed[0]))
    sys.exit(1 if failed[0] else 0)

if __name__ == "__main__":
    main()
