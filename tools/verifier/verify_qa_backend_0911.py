# -*- coding: utf-8 -*-
"""独立 QA 验证（严过关）—— 不依赖工程师的 smoke_m5.py，自写断言。
对隔离测试库 wt_qa_0911.db + 独立进程 127.0.0.1:8231 做边界/错误路径验证。
"""
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

BASE = "http://127.0.0.1:8231"
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
HERE = os.path.dirname(os.path.abspath(__file__))
# 测试库路径：默认取 server/wt_qa_final.db，可用环境变量 QA_DB 覆盖
DB = os.environ.get("QA_DB") or os.path.abspath(
    os.path.join(HERE, "..", "..", "server", "wt_qa_final.db"))

PASS = 0
FAIL = 0
FAILS = []


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS  " + name + (("  | " + str(detail)) if detail else ""))
    else:
        FAIL += 1
        FAILS.append(name + (("  | " + str(detail)) if detail else ""))
        print("  FAIL  " + name + (("  | " + str(detail)) if detail else ""))


def req(method, path, token=None, body=None):
    """返回 (status_code, parsed_body, raw_text)。"""
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with _OPENER.open(r, timeout=20) as resp:
            txt = resp.read().decode()
            try:
                return resp.status, json.loads(txt), txt
            except Exception:
                return resp.status, None, txt
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt), txt
        except Exception:
            return e.code, None, txt
    except Exception as e:
        return -1, {"detail": str(e)}, str(e)


def login_or_register(u):
    s, r, _ = req("POST", "/api/auth/register",
                  body={"username": u, "password": "test123456", "nickname": u + "昵称"})
    if s == 200 and isinstance(r, dict) and r.get("token"):
        return r["token"], r.get("user", {}).get("id")
    s, r, _ = req("POST", "/api/auth/login", body={"username": u, "password": "test123456"})
    if s == 200 and isinstance(r, dict) and r.get("token"):
        return r["token"], r.get("user", {}).get("id")
    return None, None


def seed_fillers(n):
    """直接向测试库播种 n 个填充用户并令其与 a 成为好友（数据准备用，行为仍走 API）。
    填充用户仅用于「群规模上限」边界，无需登录，故 password_hash 用占位串即可。"""
    pw = "seed-placeholder"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE username='qa_a'")
    a_id = cur.fetchone()[0]
    for i in range(1, n + 1):
        un = "qa_f%02d" % i
        cur.execute("SELECT id FROM users WHERE username=?", (un,))
        row = cur.fetchone()
        if row:
            fid = row[0]
        else:
            cur.execute(
                "INSERT INTO users(username,password_hash,nickname,motto,bio,gender,birthday,"
                "city,phone,goal,tags,avatar,last_seen_at,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (un, pw, un, "", "", "secret", "", "", "", "", "", None, None, now))
            fid = cur.lastrowid
        lo, hi = (a_id, fid) if a_id < fid else (fid, a_id)
        cur.execute("SELECT id FROM friends WHERE user_a=? AND user_b=?", (lo, hi))
        if not cur.fetchone():
            cur.execute("INSERT INTO friends(user_a,user_b,created_at) VALUES(?,?,?)", (lo, hi, now))
    conn.commit()
    conn.close()


def main():
    print("========== 【0】健康检查 ==========")
    s, r, _ = req("GET", "/api/health")
    check("health 200", s == 200 and r.get("ok"), r)

    print("\n========== 【1】注册 4 用户 + 建好友关系 ==========")
    ta, _ = login_or_register("qa_a")
    tb, _ = login_or_register("qa_b")
    tc, _ = login_or_register("qa_c")
    td, _ = login_or_register("qa_d")
    check("四用户注册/登录成功", all([ta, tb, tc, td]))
    _, mea, _ = req("GET", "/api/auth/me", ta)
    _, meb, _ = req("GET", "/api/auth/me", tb)
    _, mec, _ = req("GET", "/api/auth/me", tc)
    _, med, _ = req("GET", "/api/auth/me", td)
    ra, rb, rc, rd = mea["id"], meb["id"], mec["id"], med["id"]

    for tk, uid in ((tb, rb), (tc, rc)):
        req("POST", "/api/friends/requests", ta, {"toUserId": uid})
        s, r, _ = req("GET", "/api/friends/requests", tk)
        for x in r.get("incoming", []):
            if x["user"]["id"] == ra:
                req("POST", "/api/friends/requests/%d/accept" % x["id"], tk)
    s, r, _ = req("GET", "/api/friends", ta)
    fids = {x["id"] for x in r.get("items", [])}
    check("a 与 b,c 已是好友，d 不是", {rb, rc} <= fids and rd not in fids, sorted(fids))

    print("\n========== 【2】未登录访问新接口应 401 ==========")
    for m, p, b in (("GET", "/api/groups", None),
                    ("POST", "/api/groups", {"name": "x", "memberIds": [1, 2]}),
                    ("GET", "/api/moments/feed", None),
                    ("POST", "/api/moments", {"content": "x"}),
                    ("POST", "/api/feedbacks", {"type": "bug", "content": "1234567890"}),
                    ("GET", "/api/feedbacks/mine", None),
                    ("POST", "/api/study/logs", {"logs": [{"module": "cet4", "event": "x", "payload": {}, "createdAt": "2026-01-01 00:00:00"}]}),
                    ("GET", "/api/study/summary", None),
                    ("GET", "/api/users/presence?ids=1", None)):
        s, r, _ = req(m, p, None, b)
        check("401 未登录 %s %s" % (m, p.split("?")[0]), s == 401, "got %s" % s)

    print("\n========== 【3】建群边界（P0-3） ==========")
    s, r, _ = req("POST", "/api/groups", ta, {"name": "四级冲刺群", "memberIds": [rb, rc]})
    check("建群 3 人成功", s == 200 and r.get("memberCount") == 3, "%s %s" % (s, r))
    g1 = r.get("id")
    s, r, _ = req("POST", "/api/groups", ta, {"name": "只有一人", "memberIds": [rb]})
    check("仅 1 名好友被拒（min_length=2）", s in (400, 422), "got %s %s" % (s, r))
    s, r, _ = req("POST", "/api/groups", ta, {"name": "含非好友", "memberIds": [rb, rd]})
    check("含非好友被拒 400", s == 400 and "好友" in str(r.get("detail", "")), "got %s %s" % (s, r))
    s, r, _ = req("POST", "/api/groups", ta, {"name": "", "memberIds": [rb, rc]})
    check("空群名被拒", s in (400, 422), "got %s" % s)

    print("\n---------- 第 51 人上限 ----------")
    seed_fillers(55)
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE username LIKE 'qa_f%' ORDER BY username")
    fillers = [x[0] for x in cur.fetchall()]
    conn.close()
    s, r, _ = req("POST", "/api/groups", ta,
                  {"name": "正好50人群", "memberIds": fillers[:49]})
    check("49 好友建群成功 → 含我 50 人（上限内）", s == 200 and r.get("memberCount") == 50,
          "got %s %s" % (s, r))
    g50 = r.get("id")
    s, r, _ = req("POST", "/api/groups", ta,
                  {"name": "51人群", "memberIds": fillers[:50]})
    check("第 51 人被拒（50 好友 → 含我 51 人）", s in (400, 422),
          "got %s %s" % (s, (r or {}).get("detail")))
    s, r, _ = req("POST", "/api/groups", ta,
                  {"name": "超限", "memberIds": fillers[:55]})
    check("55 好友明显超限被拒", s in (400, 422), "got %s" % s)

    print("\n========== 【4】非成员 / 非好友越权（P0-3/P0-4） ==========")
    for m, p, b in (("GET", "/api/groups/%d" % g1, None),
                    ("GET", "/api/groups/%d/messages" % g1, None),
                    ("POST", "/api/groups/%d/messages" % g1, {"content": "偷偷发"}),
                    ("POST", "/api/groups/%d/read" % g1, {"upToId": 1}),
                    ("DELETE", "/api/groups/%d/members/%d" % (g1, rb), None),
                    ("POST", "/api/groups/%d/quit" % g1, None)):
        s, r, _ = req(m, p, td, b)
        check("非成员 d %s %s → 403" % (m, p.split("/api")[1]), s == 403, "got %s" % s)

    print("\n========== 【5】群消息 + 已读游标隔离（P0-1/P0-3） ==========")
    s, r, _ = req("POST", "/api/groups/%d/messages" % g1, ta, {"content": "大家好，我是甲", "kind": "text"})
    check("群消息发送成功", s == 200 and r.get("senderNickname"), "%s %s" % (s, r))
    _, gl_b, _ = req("GET", "/api/groups", tb)
    _, gl_c, _ = req("GET", "/api/groups", tc)
    _, gl_a, _ = req("GET", "/api/groups", ta)
    ub = next(x["unreadCount"] for x in gl_b["items"] if x["id"] == g1)
    uc = next(x["unreadCount"] for x in gl_c["items"] if x["id"] == g1)
    ua = next(x["unreadCount"] for x in gl_a["items"] if x["id"] == g1)
    check("乙丙未读各 1，甲自己未读 0（发送者不计）", ub == 1 and uc == 1 and ua == 0,
          "b=%s c=%s a=%s" % (ub, uc, ua))
    # 丙拉取即已读，游标只影响丙
    s, r, _ = req("GET", "/api/groups/%d/messages" % g1, tc)
    check("丙拉取群消息成功", s == 200 and len(r.get("items", [])) >= 1, "got %s" % s)
    _, gl_c2, _ = req("GET", "/api/groups", tc)
    _, gl_b2, _ = req("GET", "/api/groups", tb)
    uc2 = next(x["unreadCount"] for x in gl_c2["items"] if x["id"] == g1)
    ub2 = next(x["unreadCount"] for x in gl_b2["items"] if x["id"] == g1)
    check("游标互不干扰：丙归零、乙仍为 1", uc2 == 0 and ub2 == 1, "c=%s b=%s" % (uc2, ub2))

    print("\n========== 【6】群消息分页 before_id（潜在崩溃点） ==========")
    ids = []
    for i in range(4):
        s, r, _ = req("POST", "/api/groups/%d/messages" % g1, ta, {"content": "msg%d" % i})
        ids.append(r.get("id"))
    s, r, txt = req("GET", "/api/groups/%d/messages?before_id=%d" % (g1, max(ids)), tb)
    check("群消息分页 before_id 返回 200 且可分页", s == 200 and "items" in (r or {}),
          "got HTTP %s | body=%s" % (s, txt[:160]))
    s2, r2, _ = req("GET", "/api/groups/%d/messages" % g1, tb)
    check("群消息无游标拉取正常", s2 == 200 and len(r2.get("items", [])) >= 1, "got %s" % s2)

    print("\n========== 【7】私聊拉取即已读（P0-1） ==========")
    s, r, _ = req("POST", "/api/chat/%d/messages" % rb, ta, {"content": "在吗？", "kind": "text"})
    check("甲发私聊给乙成功", s == 200, "%s %s" % (s, r))
    mid = r.get("id")
    check("刚发送时 read=False", r.get("read") is False, r)
    s, r, _ = req("GET", "/api/chat/%d/messages" % ra, tb)
    got = [m for m in r.get("items", []) if m["id"] == mid]
    check("乙拉取后消息 read=True", bool(got) and got[0]["read"] is True, got)
    s, r, _ = req("GET", "/api/chat/%d/messages" % rb, ta)
    got2 = [m for m in r.get("items", []) if m["id"] == mid]
    check("甲端可见该消息 read=True（拉取即已读生效）", bool(got2) and got2[0]["read"] is True, got2)

    print("\n========== 【8】动态可见性/点赞评论通知/删评权限（P0-4） ==========")
    s, r, _ = req("POST", "/api/moments", ta, {"content": "今天背了200个单词，打卡！", "images": []})
    check("甲发布动态成功", s == 200 and r.get("id"), "%s %s" % (s, r))
    mo = r.get("id")
    s, r, _ = req("GET", "/api/moments/feed", tb)
    check("好友乙可见甲动态", s == 200 and any(x["id"] == mo for x in r.get("items", [])),
          [x["id"] for x in r.get("items", [])])
    s, r, _ = req("GET", "/api/moments/feed", td)
    check("非好友丁动态流不含甲动态", s == 200 and not any(x["id"] == mo for x in r.get("items", [])),
          [x["id"] for x in r.get("items", [])])
    s, r, _ = req("GET", "/api/moments/user/%d" % ra, td)
    check("非好友丁看甲动态列表 → 403（不泄漏内容）", s == 403, "got %s %s" % (s, r))
    s, r, _ = req("POST", "/api/moments/%d/like" % mo, tb)
    check("乙点赞成功", s == 200 and r.get("liked") is True, r)
    s, r, _ = req("GET", "/api/notifications", ta)
    types = [x.get("type") for x in r.get("items", [])]
    check("甲收到 moment_like 通知", "moment_like" in types, types)
    s, r, _ = req("POST", "/api/moments/%d/comments" % mo, tb, {"content": "加油，坚持住！"})
    check("乙评论成功", s == 200 and r.get("id"), r)
    cid = r.get("id")
    s, r, _ = req("GET", "/api/notifications", ta)
    types = [x.get("type") for x in r.get("items", [])]
    check("甲收到 moment_comment 通知", "moment_comment" in types, types)
    s, r, _ = req("DELETE", "/api/moments/comments/%d" % cid, td)
    check("陌生人丁删他人评论 → 403", s == 403, "got %s" % s)
    s, r, _ = req("DELETE", "/api/moments/comments/%d" % cid, ta)
    check("动态作者甲可删他人评论 → 200", s == 200, "got %s %s" % (s, r))
    # 删除动态权限
    s, r, _ = req("POST", "/api/moments/%d/comments" % mo, tb, {"content": "再评一条"})
    s, r, _ = req("DELETE", "/api/moments/%d" % mo, tb)
    check("非作者乙删甲动态 → 403", s == 403, "got %s" % s)
    s, r, _ = req("DELETE", "/api/moments/%d" % mo, ta)
    check("作者甲删自己动态 → 200", s == 200, "got %s %s" % (s, r))
    # 图片白名单
    s, r, _ = req("POST", "/api/moments", ta, {"content": "x", "images": ["http://evil/x.png"]})
    check("非法图片地址被拒", s == 400, "got %s" % s)

    print("\n========== 【9】反馈限频 + 匿名（P0-7） ==========")
    s, r, _ = req("POST", "/api/feedbacks", ta,
                  {"type": "bug", "content": "消息发不出去帮我看看哦", "anonymous": True})
    check("首条反馈成功返回编号", s == 200 and r.get("id"), "%s %s" % (s, r))
    s, r, _ = req("POST", "/api/feedbacks", ta,
                  {"type": "bug", "content": "第二条十秒内不应通过", "anonymous": False})
    check("10 分钟内第 2 条 → 429", s == 429, "got %s %s" % (s, r))
    s, r, txt = req("GET", "/api/feedbacks/mine", ta)
    check("我的反馈列表 200", s == 200 and len(r.get("items", [])) >= 1, "%s %s" % (s, r))
    check("匿名反馈响应体不含 nickname/username/昵称",
          ("nickname" not in txt) and ("username" not in txt) and ("qa_a" not in txt),
          txt[:160])
    s, r, _ = req("POST", "/api/feedbacks", tb, {"type": "bug", "content": "太短"})
    check("<10 字被拒（400/422）", s in (400, 422), "got %s" % s)
    s, r, _ = req("POST", "/api/feedbacks", tb, {"type": "hack", "content": "这个类型是不合法的那种问题"})
    check("非法反馈类型被拒 400", s == 400, "got %s" % s)

    print("\n========== 【10】study 幂等上报 + 聚合（P0-8） ==========")
    today = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log = {"module": "cet4", "event": "task", "payload": {"task": "words", "minutes": 25},
           "createdAt": today}
    s, r, _ = req("POST", "/api/study/logs", ta, {"logs": [log, log]})
    check("同批重复 → added=1, received=2", s == 200 and r.get("added") == 1 and r.get("received") == 2,
          "%s %s" % (s, r))
    s, r, _ = req("POST", "/api/study/logs", ta, {"logs": [log, log]})
    check("再次上报同批 → added=0（幂等）", s == 200 and r.get("added") == 0, "%s %s" % (s, r))
    s, r, _ = req("GET", "/api/study/summary?module=cet4", ta)
    today_s = datetime.now().strftime("%Y-%m-%d")
    day = next((d for d in r.get("days", []) if d["date"] == today_s), None)
    check("聚合今日 events=1 且 minutes=25", s == 200 and day and day["events"] == 1 and day["minutes"] == 25,
          r)
    s, r, _ = req("POST", "/api/study/logs", ta,
                  {"logs": [{"module": "bogus", "event": "x", "payload": {}, "createdAt": today}]})
    check("未知模块被拒 400", s == 400, "got %s" % s)

    print("\n========== 【11】隐私红线：新公开接口字符串级断言（P0-4/P0-5/P0-6） ==========")
    secrets = ('"phone"', '"gender"', '"birthday"')
    probes = [
        ("GET", "/api/users/%d" % rb, ta),
        ("GET", "/api/users/presence?ids=%d,%d,%d" % (ra, rb, rd), ta),
        ("GET", "/api/groups/%d" % g1, ta),
        ("GET", "/api/groups", ta),
        ("GET", "/api/groups/%d/messages" % g1, ta),
        ("GET", "/api/moments/feed", tb),
        ("GET", "/api/moments/user/%d" % ra, ta),
        ("GET", "/api/feedbacks/mine", ta),
        ("GET", "/api/friends/search?q=qa_b", ta),
    ]
    for m, p, tk in probes:
        s, r, txt = req(m, p, tk)
        leaked = [k for k in secrets if k in txt]
        check("无隐私字段泄漏 %s" % p.split("?")[0], s == 200 and not leaked,
              "status=%s leaked=%s" % (s, leaked))
    s, r, txt = req("GET", "/api/auth/me", ta)
    check("/api/auth/me 本人接口允许返回 phone/gender/birthday（不在本次范围）",
          all(k in txt for k in secrets), "phones-in-me=%s" % [k for k in secrets if k in txt])

    print("\n========== 【12】回归：旧接口结构兼容 ==========")
    s, r, _ = req("GET", "/api/notes", ta)
    check("旧接口 /api/notes 结构未破坏", s == 200 and "items" in r, "keys=%s" % (list(r.keys()) if isinstance(r, dict) else r))
    s, r, _ = req("GET", "/api/users/%d" % rb, ta)
    need = {"id", "nickname", "avatarUrl", "motto", "bio", "city", "goal", "tags",
            "createdAt", "isMe", "isFriend", "lastSeenAt", "online", "stats", "notes"}
    miss = need - set(r.keys()) if isinstance(r, dict) else need
    check("旧接口 /api/users/{id} 字段齐全且补 isFriend/online/lastSeenAt", s == 200 and not miss,
          "missing=%s" % sorted(miss))
    s, r, _ = req("GET", "/api/chat/unread", tb)
    ok = s == 200 and "total" in r and "items" in r
    if ok and r["items"]:
        ok = all(k in r["items"][0] for k in ("peerId", "count", "lastId", "last", "nickname", "avatar"))
    check("旧接口 /api/chat/unread 补昵称头像且结构兼容", ok, r)
    s, r, _ = req("GET", "/api/friends", ta)
    check("旧接口 /api/friends 结构兼容", s == 200 and "items" in r and "total" in r,
          "keys=%s" % (list(r.keys()) if isinstance(r, dict) else r))
    s, r, _ = req("GET", "/api/friends/search?q=qa_b", ta)
    it = (r.get("items") or [{}])[0]
    check("好友搜索补 isFriend=true", it.get("isFriend") is True, it)
    s, r, _ = req("GET", "/api/chat/%d/messages" % rb, ta)
    check("旧私聊记录接口可用", s == 200 and "items" in r, "got %s" % s)

    print("\n==================================================")
    print("总计：通过 %d 项，失败 %d 项" % (PASS, FAIL))
    if FAILS:
        print("\n失败清单（含责任初判）：")
        for f in FAILS:
            print("  - " + f)
    print("==================================================")
    return 0


if __name__ == "__main__":
    sys.exit(main())
