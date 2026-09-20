"""里程碑4 冒烟测试：黑名单（拉黑好友禁聊 / 解除可聊 / 拉黑后不能加好友 / 自我拉黑拒绝）。

用法：先启动后端，再：
    python scripts/smoke_m4.py [BASE_URL]
"""
import sys
import time

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8024"
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
suffix = str(time.time_ns() % 10_000_000)
PASS = 0
FAIL = 0


def check(name, ok, extra=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print("  ✓ " + name + (f"  {extra}" if extra else ""))
    else:
        FAIL += 1
        print("  ✗ FAIL " + name + "  " + extra)


c = httpx.Client(base_url=BASE, timeout=30, trust_env=False)


def reg(n):
    r = c.post("/api/auth/register", json={"username": n, "password": "pass123456", "nickname": n})
    assert r.status_code == 200, (r.status_code, r.text)
    return r.json()


D = reg("bd" + suffix); E = reg("be" + suffix); F = reg("bf" + suffix); G = reg("bg" + suffix)
hD = {"Authorization": f"Bearer {D['token']}"}
hE = {"Authorization": f"Bearer {E['token']}"}
hF = {"Authorization": f"Bearer {F['token']}"}
hG = {"Authorization": f"Bearer {G['token']}"}
EID, FID, GID, DID = E["user"]["id"], F["user"]["id"], G["user"]["id"], D["user"]["id"]

print("== 自我拉黑拒绝 ==")
r = c.post("/api/friends/block", headers=hE, json={"userId": EID})
check("不能拉黑自己 400", r.status_code == 400)

print("== 拉黑好友 → 双向禁聊 ==")
c.post("/api/friends/requests", headers=hE, json={"toUserId": FID})
rid = [x for x in c.get("/api/friends/requests", headers=hF).json()["incoming"] if x["user"]["id"] == EID][0]["id"]
c.post(f"/api/friends/requests/{rid}/accept", headers=hF)
r = c.post(f"/api/chat/{FID}/messages", headers=hE, json={"content": "hi"})
check("拉黑前可发", r.status_code == 200)
r = c.post("/api/friends/block", headers=hE, json={"userId": FID})
check("E 拉黑好友 F", r.status_code == 200)
r = c.post(f"/api/chat/{FID}/messages", headers=hE, json={"content": "x"})
check("拉黑后 E→F 被拒 403", r.status_code == 403, str(r.status_code))
r = c.post(f"/api/chat/{EID}/messages", headers=hF, json={"content": "x"})
check("拉黑后 F→E 被拒 403", r.status_code == 403, str(r.status_code))
bl = c.get("/api/friends/blocked", headers=hE).json()
check("黑名单列表含 F", any(x["id"] == FID for x in bl["items"]))
r = c.delete(f"/api/friends/block/{FID}", headers=hE)
check("E 解除拉黑 F", r.status_code == 200)
r = c.post(f"/api/chat/{FID}/messages", headers=hE, json={"content": "又好了"})
check("解除后 E→F 恢复 200", r.status_code == 200, str(r.status_code))

print("== 拉黑非好友 → 无法加好友 ==")
c.post("/api/friends/block", headers=hD, json={"userId": GID})
r = c.post("/api/friends/requests", headers=hG, json={"toUserId": DID})
check("被拉黑一方发申请被拒 400", r.status_code == 400, str(r.status_code))
r = c.post("/api/friends/requests", headers=hD, json={"toUserId": GID})
check("拉黑一方发申请同样被拒 400", r.status_code == 400, str(r.status_code))
c.delete(f"/api/friends/block/{GID}", headers=hD)
r = c.post("/api/friends/requests", headers=hG, json={"toUserId": DID})
check("解除后可发申请 200", r.status_code == 200, str(r.status_code))

print(f"\n结果：通过 {PASS}，失败 {FAIL}")
sys.exit(1 if FAIL else 0)
