# -*- coding: utf-8 -*-
"""需求01 端到端修复实测：/api/admin/contact（普通用户可访问，仅最小字段）。"""
import io
import sys
import time

sys.path.insert(0, r'D:\下载的文件\学习工作台\server')

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

OUT = io.open(r'D:\下载的文件\学习工作台\_r01_contact_out.txt', 'w', encoding='utf-8')


def log(s=""):
    OUT.write(s + "\n")


def run():
    import config
    from routers import admin as admin_mod
    admin_pwd = (config.ADMIN_PASSWORD or "").strip() or admin_mod._ADMIN_DEFAULT_PASSWORD

    c = TestClient(main.app)
    suffix = str(int(time.time()))[-6:]
    nu, npw, nnick = "cuser" + suffix, "Test@12345", "联系测试" + suffix

    # 造一个普通用户
    r = c.post("/api/auth/register", json={"username": nu, "password": npw, "nickname": nnick})
    reg = r.json() if r.status_code == 200 else {}
    user_token = reg.get("token")
    uh = {"Authorization": "Bearer " + (user_token or "")}

    log("普通用户注册 -> %s id=%s" % (r.status_code, (reg.get("user") or {}).get("id")))

    log()
    log("① 普通用户 token 调 GET /api/admin/contact")
    r = c.get("/api/admin/contact", headers=uh)
    log("   -> %s %s" % (r.status_code, r.text[:200]))
    body = r.json() if r.status_code == 200 else {}
    admin_id = body.get("id")

    log()
    log("③ contact 响应体是否只含 id/username/nickname（无多余字段）")
    log("   keys = %s" % sorted(body.keys()))
    log("   exactly_minimal = %s" % (sorted(body.keys()) == ["id", "nickname", "username"]))
    for bad in ("isOnline", "online", "lastActive", "createdAt", "stats", "isAdmin", "phone", "bio", "city"):
        if bad in body:
            log("   !! 泄漏字段: %s" % bad)

    log()
    log("② GET /api/friends/search?q=管理员 仍 0 命中（隐形不破）")
    r = c.get("/api/friends/search", params={"q": "管理员"}, headers=uh)
    items = (r.json() or {}).get("items") or []
    log("   q=管理员 -> %s items=%d" % (r.status_code, len(items)))
    r = c.get("/api/friends/search", params={"q": "管理"}, headers=uh)
    items = (r.json() or {}).get("items") or []
    log("   q=管理   -> %s items=%d" % (r.status_code, len(items)))

    log()
    log("④ 无 token 调 GET /api/admin/contact -> 401")
    r = c.get("/api/admin/contact")
    log("   -> %s %s" % (r.status_code, r.text[:120]))

    log()
    log("admin_id 可用于普通用户直接发私信：")
    if admin_id:
        r = c.post("/api/chat/%s/messages" % admin_id, headers=uh,
                   json={"content": "通过 contact 拿到 id 后发起的私信", "kind": "text"})
        log("   POST /api/chat/%s/messages -> %s %s" % (admin_id, r.status_code, r.text[:140]))

    log()
    log("DONE")


if __name__ == "__main__":
    try:
        run()
    except Exception:
        import traceback
        OUT.write("EXCEPTION\n" + traceback.format_exc())
    finally:
        OUT.close()
