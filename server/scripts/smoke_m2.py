"""里程碑2 冒烟测试：好友申请/同意/删除 + 私聊历史分页 + 已读 + WebSocket 实时收发。

用法：先启动后端（空库），再：
    python scripts/smoke_m2.py [BASE_URL]   # 默认 http://127.0.0.1:8022
依赖：httpx、websockets（uvicorn[standard] 自带 websockets）。
"""
import sys
import time

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8022"
WS_BASE = BASE.replace("http", "ws", 1)
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


def reg(name):
    r = c.post("/api/auth/register", json={"username": name, "password": "pass123456", "nickname": name})
    assert r.status_code == 200, (r.status_code, r.text)
    return r.json()


uA = reg("fa" + suffix)
uB = reg("fb" + suffix)
uC = reg("fc" + suffix)
uE = reg("fe" + suffix)
uF = reg("ff" + suffix)
hA = {"Authorization": f"Bearer {uA['token']}"}
hB = {"Authorization": f"Bearer {uB['token']}"}
hC = {"Authorization": f"Bearer {uC['token']}"}
hE = {"Authorization": f"Bearer {uE['token']}"}
hF = {"Authorization": f"Bearer {uF['token']}"}
A, B, C, E, F = uA["user"]["id"], uB["user"]["id"], uC["user"]["id"], uE["user"]["id"], uF["user"]["id"]

print("== 好友申请 / 同意 ==")
r = c.post("/api/friends/requests", headers=hA, json={"toUserId": B})
check("A→B 发申请", r.status_code == 200, str(r.status_code))
r = c.post("/api/friends/requests", headers=hA, json={"toUserId": A})
check("不能加自己 400", r.status_code == 400)
req = c.get("/api/friends/requests", headers=hB).json()
inbox = [x for x in req["incoming"] if x["user"]["id"] == A]
check("B 收件箱有 A 的申请", len(inbox) == 1)
rid = inbox[0]["id"]
r = c.post(f"/api/friends/requests/{rid}/accept", headers=hB)
check("B 同意", r.status_code == 200)
fr = c.get("/api/friends", headers=hA).json()
check("A 好友列表含 B", any(x["id"] == B for x in fr["items"]))
r = c.post("/api/friends/requests", headers=hA, json={"toUserId": B})
check("已是好友不能再申请 400", r.status_code == 400)
r = c.post("/api/friends/requests", headers=hB, json={"toUserId": A})
check("重复方向同样拦截 400", r.status_code == 400)

print("== 互发申请的自动成好友 ==")
c.post("/api/friends/requests", headers=hE, json={"toUserId": F})
r = c.post("/api/friends/requests", headers=hF, json={"toUserId": E})
check("F→E 触发自动同意", r.status_code == 200 and r.json().get("autoAccepted") is True, str(r.status_code))

print("== 私聊权限（非好友禁聊）==")
r = c.post(f"/api/chat/{A}/messages", headers=hC, json={"content": "hi", "kind": "text"})
check("C(非好友)→A 被拒 403", r.status_code == 403, str(r.status_code))
r = c.post(f"/api/chat/{B}/messages", headers=hA, json={"content": "你好 B", "kind": "text"})
check("A→B 好友可发", r.status_code == 200, str(r.status_code))
m1 = r.json()

print("== 未读 / 已读 ==")
un = c.get("/api/chat/unread", headers=hB).json()
b_unread = [x for x in un["items"] if x["peerId"] == A]
check("B 侧未读 1 条", un["total"] == 1 and b_unread and b_unread[0]["count"] == 1, f"total={un['total']}")
r = c.post(f"/api/chat/{A}/read", headers=hB, json={"upToId": m1["id"]})
check("B 标记已读", r.status_code == 200 and r.json()["marked"] == 1, str(r.text))
un2 = c.get("/api/chat/unread", headers=hB).json()
check("已读后 B 未读归零", un2["total"] == 0)

print("== 历史分页 ==")
for i in range(5):
    c.post(f"/api/chat/{A}/messages", headers=hB, json={"content": f"B消息{i}", "kind": "text"})
hist = c.get(f"/api/chat/{A}/messages", headers=hB, params={"limit": 3}).json()
check("按时间正序返回最新3条", [x["content"] for x in hist["items"]] == ["B消息2", "B消息3", "B消息4"], str([x["content"] for x in hist["items"]]))
check("hasMore=true", hist["hasMore"] is True)
older = c.get(f"/api/chat/{A}/messages", headers=hB, params={"before_id": hist["items"][0]["id"], "limit": 5}).json()
check("向前翻到更早的3条", len(older["items"]) == 3 and [x["content"] for x in older["items"]] == ["你好 B", "B消息0", "B消息1"], str([x["content"] for x in older["items"]]))

print("== WebSocket 实时收发 / 已读回推 ==")
from websockets.sync.client import connect  # noqa: E402

wsA = connect(f"{WS_BASE}/ws/chat?token={uA['token']}")
wsB = connect(f"{WS_BASE}/ws/chat?token={uB['token']}")
ha = wsA.recv(); hb = wsB.recv()
check("双方收到 hello", '"hello"' in ha and '"hello"' in hb)
wsB.send('{"type":"msg","to":' + str(A) + ',"content":"ws实时你好","kind":"text"}')
frame = wsA.recv()
import json  # noqa: E402
jf = json.loads(frame)
check("A 实时收到 B 消息", jf.get("type") == "msg" and jf["message"]["content"] == "ws实时你好")
mid = jf["message"]["id"]
wsA.send('{"type":"read","peer":' + str(B) + ',"upToId":' + str(mid) + '}')
# B 会先收到自己那条消息的“回显”，再收到已读回执
got_receipt = False
for _ in range(4):
    jr = json.loads(wsB.recv())
    if jr.get("type") == "readReceipt" and jr.get("upToId") == mid:
        got_receipt = True
        break
check("B 收到已读回执", got_receipt)
wsA.close()
wsB.close()

print("== 拒绝申请 / 删除好友 ==")
c.post("/api/friends/requests", headers=hA, json={"toUserId": C})
reqc = [x for x in c.get("/api/friends/requests", headers=hC).json()["incoming"] if x["user"]["id"] == A]
c.post(f"/api/friends/requests/{reqc[0]['id']}/decline", headers=hC)
after = c.get("/api/friends/requests", headers=hC).json()
check("C 拒绝后收件箱空", len(after["incoming"]) == 0)

r = c.delete(f"/api/friends/{B}", headers=hA)
check("A 删除好友 B", r.status_code == 200)
r = c.post(f"/api/chat/{A}/messages", headers=hB, json={"content": "x"})
check("删好友后不能发消息 403", r.status_code == 403, str(r.status_code))

print(f"\n结果：通过 {PASS}，失败 {FAIL}")
sys.exit(1 if FAIL else 0)
