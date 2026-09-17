"""R72 任务一 冒烟测试：私聊会话列表（Bug1）/ 好友备注（Bug3）/ 群列表管理员分支（Bug2）。

不连真库：启动前把 DATABASE_PATH 指向临时 sqlite，再用 FastAPI TestClient 直调路由。
用法（在 server 目录下）：
    python scripts/smoke_r72_chat.py
"""
import os
import sys
import tempfile
import time

# ⚠️ 必须在 import config / main 之前设置：database 模块在 import 时就按 DATABASE_PATH 建 engine。
_TMPDB = os.path.join(tempfile.gettempdir(), "smoke_r72_%d.db" % (time.time_ns() % 10_000_000))
os.environ["DATABASE_PATH"] = _TMPDB
os.environ["ADMIN_USERNAME"] = "管理员"
os.environ["ADMIN_PASSWORD"] = "Admin@2026r72"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402

PASS = 0
FAIL = 0


def check(name, ok, extra=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print("  ✓ " + name + (("  " + str(extra)) if extra else ""))
    else:
        FAIL += 1
        print("  ✗ FAIL " + name + "  " + str(extra))


client = TestClient(main.app)
suffix = str(time.time_ns() % 10_000_000)


def register(u, nick):
    r = client.post("/api/auth/register", json={"username": u, "password": "pass123456", "nickname": nick})
    assert r.status_code == 200, r.text
    return r.json()


def H(tok):
    return {"Authorization": "Bearer " + tok}


def befriend(ta, tb, uid_b):
    """A 向 B 发申请，B 同意，成为好友。"""
    client.post("/api/friends/requests", headers=H(ta), json={"toUserId": uid_b})
    reqs = client.get("/api/friends/requests", headers=H(tb)).json()
    pend = [x for x in reqs.get("incoming", []) if x.get("status") == "pending"]
    if not pend:
        return False
    r = client.post("/api/friends/requests/%d/accept" % pend[0]["id"], headers=H(tb))
    return r.status_code == 200


print("== 准备：注册 A/B/C/D 四个普通用户 + 管理员登录 ==")
A = register("r72a" + suffix, "甲" + suffix)
B = register("r72b" + suffix, "乙" + suffix)
C = register("r72c" + suffix, "丙" + suffix)
D = register("r72d" + suffix, "丁" + suffix)
ta, tb, tc = A["token"], B["token"], C["token"]
ua, ub, uc, ud = A["user"]["id"], B["user"]["id"], C["user"]["id"], D["user"]["id"]

al = client.post("/api/auth/login", json={"username": "管理员", "password": "Admin@2026r72"})
check("管理员登录 200", al.status_code == 200, al.status_code)
tadm = al.json()["token"]
me_adm = client.get("/api/auth/me", headers=H(tadm)).json()
admin_id = me_adm["id"]
check("管理员 is_admin 标记", bool(al.json().get("isAdmin")), al.json().get("isAdmin"))

care_ok = befriend(ta, tb, ub)
check("A-B 成为好友", care_ok)
care2_ok = befriend(ta, tc, uc)
check("A-C 成为好友", care2_ok)

# ------------------------------------------------------------------ Bug1
print("== Bug1：用户给管理员发信 → 管理员回复并已读 → 会话仍不消失 ==")
r = client.post("/api/chat/%d/messages" % admin_id, headers=H(ta), json={"content": "你好管理员", "kind": "text"})
check("A→管理员 发信 200", r.status_code == 200, r.status_code)

u1 = client.get("/api/chat/unread", headers=H(tadm)).json()
check("管理员未读含 A", any(x["peerId"] == ua for x in u1["items"]), u1)

c1 = client.get("/api/chat/conversations", headers=H(tadm)).json()
check("管理员会话含 A（回复前）", any(x["peerId"] == ua for x in c1["items"]), c1)

r = client.post("/api/chat/%d/messages" % ua, headers=H(tadm), json={"content": "收到，我来处理", "kind": "text"})
check("管理员→A 回复 200", r.status_code == 200, r.status_code)

mr = client.get("/api/chat/%d/messages?limit=50&markRead=1" % ua, headers=H(tadm))
check("管理员拉会话历史 200", mr.status_code == 200, mr.status_code)

u2 = client.get("/api/chat/unread", headers=H(tadm)).json()
check("回复后管理员未读已清零", not any(x["peerId"] == ua for x in u2["items"]), u2)

c2 = client.get("/api/chat/conversations", headers=H(tadm)).json()
item_a = next((x for x in c2["items"] if x["peerId"] == ua), None)
check("★ 已读后会话仍在（Bug1 核心）", item_a is not None, c2)
check("会话 lastMessage = 管理员回复",
      bool(item_a and item_a["lastMessage"] and item_a["lastMessage"]["content"] == "收到，我来处理"), item_a)
check("会话 unreadCount = 0", bool(item_a and item_a["unreadCount"] == 0), item_a)

ca = client.get("/api/chat/conversations", headers=H(ta)).json()
check("A 的会话含管理员", any(x["peerId"] == admin_id for x in ca["items"]), ca)
check("A 的会话含好友 B（无消息也返回）", any(x["peerId"] == ub for x in ca["items"]), ca)

# ------------------------------------------------------------------ Bug3
print("== Bug3：好友备注 写入 / 读取 / 隔离 / 截断 / 清除 ==")
r = client.put("/api/friends/%d/remark" % ub, headers=H(ta), json={"remark": "  阿乙  "})
check("写备注 200 且去空格", r.status_code == 200 and r.json().get("peerRemark") == "阿乙", r.json())

fl = client.get("/api/friends", headers=H(ta)).json()
row_b = next((x for x in fl["items"] if x["id"] == ub), None)
check("好友列表带 peerRemark", bool(row_b and row_b.get("peerRemark") == "阿乙"), row_b)

fl_b = client.get("/api/friends", headers=H(tb)).json()
row_a = next((x for x in fl_b["items"] if x["id"] == ua), None)
check("备注不泄露给对端（B 视角为空）", bool(row_a and (row_a.get("peerRemark") or "") == ""), row_a)

cc = client.get("/api/chat/conversations", headers=H(ta)).json()
row_c = next((x for x in cc["items"] if x["peerId"] == ub), None)
check("会话列表带 peerRemark", bool(row_c and row_c.get("peerRemark") == "阿乙"), row_c)

# B 给 A 发一条 → A 有未读，unread 接口应带上 A 对 B 的备注
client.post("/api/chat/%d/messages" % ua, headers=H(tb), json={"content": "在吗", "kind": "text"})
uu = client.get("/api/chat/unread", headers=H(ta)).json()
row_u = next((x for x in uu.get("items", []) if x["peerId"] == ub), None)
check("unread 接口带 peerRemark", bool(row_u and row_u.get("peerRemark") == "阿乙"), uu)

r = client.put("/api/friends/%d/remark" % ub, headers=H(ta),
               json={"remark": "一二三四五六七八九十一二三四五六七八九十甲"})
check("超长截断到 20 字", r.json().get("peerRemark") == "一二三四五六七八九十一二三四五六七八九十", r.json())

r = client.put("/api/friends/%d/remark" % ub, headers=H(ta), json={"remark": "   "})
check("清除备注 200 且为空", r.status_code == 200 and r.json().get("peerRemark") == "", r.json())
fl2 = client.get("/api/friends", headers=H(ta)).json()
row_b2 = next((x for x in fl2["items"] if x["id"] == ub), None)
check("清除后好友列表 peerRemark 为空", bool(row_b2 and row_b2.get("peerRemark") == ""), row_b2)

r = client.put("/api/friends/%d/remark" % ud, headers=H(ta), json={"remark": "陌生人"})
check("给非好友设备注 403", r.status_code == 403, r.status_code)
r = client.put("/api/friends/%d/remark" % ua, headers=H(ta), json={"remark": "自己"})
check("给自己设备注 400", r.status_code == 400, r.status_code)

# ------------------------------------------------------------------ Bug2
print("== Bug2：群列表管理员分支 ==")
g = client.post("/api/groups", headers=H(ta), json={"name": "R72测试群", "memberIds": [ub, uc]})
check("A 建群 200", g.status_code == 200, g.text)
gid = g.json().get("id")

gb = client.get("/api/groups", headers=H(tb)).json()
row_gb = next((x for x in gb["items"] if x["id"] == gid), None)
check("普通成员看到群 role=member", bool(row_gb and row_gb.get("role") == "member"), row_gb)

ga = client.get("/api/groups", headers=H(tadm)).json()
row_ga = next((x for x in ga["items"] if x["id"] == gid), None)
check("★ 管理员看到该群（Bug2 核心）", row_ga is not None, ga)
check("管理员行 role=admin-view", bool(row_ga and row_ga.get("role") == "admin-view"), row_ga)
check("管理员行 unreadCount=0", bool(row_ga and row_ga.get("unreadCount") == 0), row_ga)

det = client.get("/api/groups/%d" % gid, headers=H(tadm))
check("管理员群详情仍 403（只读口径不变）", det.status_code == 403, det.status_code)

g2 = client.post("/api/groups", headers=H(ta), json={"name": "R72第二群", "memberIds": [ub, uc]})
check("A 建第二个群 200", g2.status_code == 200, g2.text)
ga2 = client.get("/api/groups", headers=H(tadm)).json()
check("管理员看到全部群（含第二个）", any(x["id"] == g2.json()["id"] for x in ga2["items"]), ga2)

print("")
print("结果：通过 %d，失败 %d" % (PASS, FAIL))

try:
    from database import engine
    engine.dispose()
    if os.path.exists(_TMPDB):
        os.remove(_TMPDB)
except Exception:
    pass
sys.exit(1 if FAIL else 0)
