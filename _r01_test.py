# -*- coding: utf-8 -*-
"""需求01 本地实测：管理员超级账号 + 反馈处理（进程内 TestClient，实跑真实 ASGI 栈）。

输出写入 _r01_test_out.txt；全程不打印任何密码。
"""
import io
import sys
import time

sys.path.insert(0, r'D:\下载的文件\学习工作台\server')

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402  （导入即 init_db + ensure_admin_user）

OUT = io.open(r'D:\下载的文件\学习工作台\_r01_test_out.txt', 'w', encoding='utf-8')


def log(s: str = "") -> None:
    OUT.write(s + "\n")


def sec(title: str) -> None:
    log()
    log("=" * 60)
    log(title)
    log("=" * 60)


def brief(d, keys=None):
    if not isinstance(d, dict):
        return str(d)[:200]
    if keys:
        return {k: d.get(k) for k in keys}
    return d


def run() -> None:
    import config
    from routers import admin as admin_mod
    admin_pwd = (config.ADMIN_PASSWORD or "").strip() or admin_mod._ADMIN_DEFAULT_PASSWORD
    log("ADMIN_PASSWORD_SET_IN_ENV = %s" % bool((config.ADMIN_PASSWORD or "").strip()))

    c = TestClient(main.app)
    suffix = str(int(time.time()))[-6:]
    nu, npw, nnick = "tuser" + suffix, "Test@12345", "普通用户" + suffix

    sec("0. 健康检查")
    r = c.get("/api/health")
    log("GET /api/health -> %s %s" % (r.status_code, r.text[:120]))

    sec("1. 注册普通用户 + 登录（检查 isAdmin / is_admin 双写）")
    r = c.post("/api/auth/register", json={"username": nu, "password": npw, "nickname": nnick})
    log("POST /api/auth/register -> %s" % r.status_code)
    reg = r.json() if r.status_code == 200 else {}
    log("  reg.isAdmin=%s reg.is_admin=%s reg.user.isAdmin=%s reg.user.is_admin=%s" % (
        reg.get("isAdmin"), reg.get("is_admin"),
        (reg.get("user") or {}).get("isAdmin"), (reg.get("user") or {}).get("is_admin")))
    user_token = reg.get("token")
    user_id = (reg.get("user") or {}).get("id")

    r = c.post("/api/auth/login", json={"username": nu, "password": npw})
    lg = r.json() if r.status_code == 200 else {}
    log("POST /api/auth/login(普通) -> %s isAdmin=%s is_admin=%s" % (
        r.status_code, lg.get("isAdmin"), lg.get("is_admin")))

    sec("2. 管理员登录（username=管理员）")
    r = c.post("/api/auth/login", json={"username": "管理员", "password": admin_pwd})
    log("POST /api/auth/login(管理员) -> %s" % r.status_code)
    ad = r.json() if r.status_code == 200 else {}
    log("  isAdmin=%s is_admin=%s user=%s" % (
        ad.get("isAdmin"), ad.get("is_admin"), brief(ad.get("user"))))
    admin_token = ad.get("token")
    admin_id = (ad.get("user") or {}).get("id")
    log("  普通用户 id=%s  管理员 id=%s" % (user_id, admin_id))

    uh = {"Authorization": "Bearer " + (user_token or "")}
    ah = {"Authorization": "Bearer " + (admin_token or "")}

    sec("3. /api/auth/me 返回管理员标记")
    r = c.get("/api/auth/me", headers=uh)
    log("GET /api/auth/me(普通) -> %s isAdmin=%s is_admin=%s" % (
        r.status_code, (r.json() or {}).get("isAdmin"), (r.json() or {}).get("is_admin")))
    r = c.get("/api/auth/me", headers=ah)
    log("GET /api/auth/me(管理员) -> %s isAdmin=%s is_admin=%s" % (
        r.status_code, (r.json() or {}).get("isAdmin"), (r.json() or {}).get("is_admin")))

    sec("4. 【实测①】非管理员调 /api/admin/* 全部 403")
    for p in ["/api/admin/overview", "/api/admin/users", "/api/admin/online", "/api/admin/feedback"]:
        r = c.get(p, headers=uh)
        log("  GET %-26s -> %s %s" % (p, r.status_code, r.text[:70]))
    r = c.get("/api/admin/users/%s" % user_id, headers=uh)
    log("  GET /api/admin/users/{id}       -> %s %s" % (r.status_code, r.text[:70]))
    r = c.post("/api/admin/feedback/public-1/reply", headers=uh, json={"reply": "x"})
    log("  POST /api/admin/feedback/../reply -> %s %s" % (r.status_code, r.text[:70]))
    r = c.get("/api/admin/overview")
    log("  无 token GET /api/admin/overview  -> %s %s" % (r.status_code, r.text[:70]))

    sec("5. 【实测②】管理员能列出用户 / 看全看真")
    r = c.get("/api/admin/overview", headers=ah)
    log("GET /api/admin/overview -> %s %s" % (r.status_code, r.text[:220]))
    r = c.get("/api/admin/users", headers=ah)
    body = r.json() or {}
    log("GET /api/admin/users -> %s total=%s" % (r.status_code, body.get("total")))
    for it in (body.get("items") or [])[:6]:
        log("   %s" % brief(it, ["id", "username", "nickname", "createdAt", "lastActive",
                                "isOnline", "isAdmin", "stats"]))
    r = c.get("/api/admin/online", headers=ah)
    body = r.json() or {}
    log("GET /api/admin/online -> %s total=%s window=%s" % (
        r.status_code, body.get("total"), body.get("onlineWindowSeconds")))
    for it in (body.get("items") or [])[:6]:
        log("   online: id=%s %s isOnline=%s" % (it.get("id"), it.get("username"), it.get("isOnline")))
    r = c.get("/api/admin/users/%s" % user_id, headers=ah)
    log("GET /api/admin/users/%s -> %s %s" % (user_id, r.status_code,
                                              brief(r.json() or {}, ["id", "username", "nickname",
                                                                     "isAdmin", "city", "goal",
                                                                     "lastActive"])))

    sec("6. 【实测④-1】管理员对普通用户完全不可见（单向可见）")
    r = c.get("/api/friends/search", params={"q": "管理"}, headers=uh)
    items = (r.json() or {}).get("items") or []
    log("GET /api/friends/search?q=管理 -> %s items=%d 命中=%s" % (
        r.status_code, len(items), [i.get("username") for i in items]))
    r = c.get("/api/friends/search", params={"q": "管理员"}, headers=uh)
    items = (r.json() or {}).get("items") or []
    log("GET /api/friends/search?q=管理员 -> %s items=%d 命中=%s" % (
        r.status_code, len(items), [i.get("username") for i in items]))
    r = c.get("/api/friends", headers=uh)
    items = (r.json() or {}).get("items") or []
    log("GET /api/friends(好友列表) -> %s 含管理员=%s" % (
        r.status_code, any(i.get("id") == admin_id for i in items)))
    r = c.get("/api/users/presence", params={"ids": str(admin_id)}, headers=uh)
    log("GET /api/users/presence?ids=<管理员id> -> %s %s" % (r.status_code, r.text[:120]))
    r = c.get("/api/users/%s" % admin_id, headers=uh)
    log("GET /api/users/<管理员id>(公开主页) -> %s %s" % (r.status_code, r.text[:80]))
    r = c.post("/api/friends/requests", headers=uh, json={"toUserId": admin_id})
    log("POST /api/friends/requests(加管理员) -> %s %s" % (r.status_code, r.text[:80]))

    sec("7. 【实测③】普通用户可主动给管理员发私信（聊天不排除管理员）")
    r = c.post("/api/chat/%s/messages" % admin_id, headers=uh,
               json={"content": "你好管理员，这是一条测试私信", "kind": "text"})
    log("POST /api/chat/<管理员id>/messages -> %s %s" % (r.status_code, r.text[:160]))
    r = c.get("/api/chat/%s/messages" % admin_id, headers=uh)
    body = r.json() or {}
    log("GET  /api/chat/<管理员id>/messages -> %s items=%d" % (r.status_code, len(body.get("items") or [])))

    sec("8. 反馈：免登录提交 / 带 token 提交 / 我的反馈")
    r = c.post("/api/feedback", json={"nickname": "匿名同学", "type": "suggestion",
                                      "content": "希望增加夜间模式（免登录提交测试）"})
    log("POST /api/feedback(免登录) -> %s %s" % (r.status_code, r.text[:80]))
    r = c.post("/api/feedback", headers=uh, json={"nickname": nnick, "type": "bug",
                                                  "content": "登录后提交：笔记保存偶发失败"})
    log("POST /api/feedback(带token) -> %s %s" % (r.status_code, r.text[:80]))
    r = c.get("/api/feedback/mine", headers=uh)
    body = r.json() or {}
    log("GET /api/feedback/mine -> %s total=%s" % (r.status_code, body.get("total")))
    for it in (body.get("items") or []):
        log("   mine: %s" % brief(it, ["source", "key", "status", "reply", "content"]))
    r = c.get("/api/feedback/mine")
    log("GET /api/feedback/mine(无token) -> %s %s" % (r.status_code, r.text[:60]))

    sec("9. 登录用户反馈（account 源）")
    r = c.post("/api/feedbacks", headers=uh, json={"type": "bug",
                                                   "content": "这是登录用户提交的反馈内容，超过十字"})
    log("POST /api/feedbacks -> %s %s" % (r.status_code, r.text[:80]))
    r = c.get("/api/feedbacks/mine", headers=uh)
    body = r.json() or {}
    log("GET /api/feedbacks/mine -> %s %s" % (r.status_code,
                                              [brief(i, ["id", "status", "reply"]) for i in (body.get("items") or [])]))

    sec("10. 管理员合并两源反馈 + 回复")
    r = c.get("/api/admin/feedback", headers=uh)
    log("GET /api/admin/feedback(普通用户) -> %s %s" % (r.status_code, r.text[:60]))
    r = c.get("/api/admin/feedback", headers=ah)
    body = r.json() or {}
    log("GET /api/admin/feedback(管理员) -> %s total=%s" % (r.status_code, body.get("total")))
    pub_id = acc_id = None
    for it in (body.get("items") or []):
        log("   %s" % brief(it, ["source", "key", "id", "nickname", "type", "status", "reply"]))
        if it.get("source") == "public" and pub_id is None:
            pub_id = it.get("id")
        if it.get("source") == "account" and acc_id is None:
            acc_id = it.get("id")
    log("   sources=%s" % sorted({i.get("source") for i in (body.get("items") or [])}))

    if pub_id:
        r = c.post("/api/admin/feedback/public-%s/reply" % pub_id, headers=ah,
                   json={"reply": "已收到，夜间模式排期中（管理员回复-public）"})
        log("POST /api/admin/feedback/public-%s/reply -> %s %s" % (pub_id, r.status_code, r.text[:120]))
    if acc_id:
        r = c.post("/api/admin/feedback/account-%s/reply" % acc_id, headers=ah,
                   json={"reply": "已定位问题，下个版本修复（管理员回复-account）"})
        log("POST /api/admin/feedback/account-%s/reply -> %s %s" % (acc_id, r.status_code, r.text[:120]))
    if pub_id:
        r = c.post("/api/admin/feedback/%s/reply?source=public" % pub_id, headers=ah,
                   json={"reply": "兼容写法：纯数字id+source查询参数"})
        log("POST /api/admin/feedback/{id}/reply?source=public -> %s %s" % (r.status_code, r.text[:100]))

    r = c.get("/api/admin/feedback", headers=ah)
    body = r.json() or {}
    log("回复后 GET /api/admin/feedback 抽查（有 reply 的）：")
    for it in (body.get("items") or []):
        if it.get("reply"):
            log("   %s" % brief(it, ["source", "key", "status", "reply", "repliedAt"]))

    sec("11. 用户端能读到管理员回复")
    r = c.get("/api/feedback/mine", headers=uh)
    body = r.json() or {}
    log("GET /api/feedback/mine -> %s" % r.status_code)
    for it in (body.get("items") or []):
        log("   %s" % brief(it, ["source", "key", "status", "reply"]))
    r = c.get("/api/feedbacks/mine", headers=uh)
    body = r.json() or {}
    log("GET /api/feedbacks/mine -> %s" % r.status_code)
    for it in (body.get("items") or []):
        log("   %s" % brief(it, ["id", "status", "reply", "repliedAt"]))

    sec("12. 兼容：X-Admin-Key 的 GET /api/feedback 未被破坏")
    r = c.get("/api/feedback")
    log("GET /api/feedback(无 X-Admin-Key) -> %s %s" % (r.status_code, r.text[:80]))
    r = c.get("/api/feedback", headers={"X-Admin-Key": "wrong-key"})
    log("GET /api/feedback(错 Key) -> %s %s" % (r.status_code, r.text[:80]))

    log()
    log("ALL_TESTS_DONE")


if __name__ == "__main__":
    try:
        run()
    except Exception:
        import traceback
        OUT.write("EXCEPTION\n")
        OUT.write(traceback.format_exc())
    finally:
        OUT.close()
