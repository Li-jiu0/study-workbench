"""里程碑3 冒烟测试：笔记分页 + AI 每日限额/429 + 对话入库 + noteId 上下文路径。

用法：启动后端（需配置任意假 DEEPSEEK provider + 低 AI_DAILY_LIMIT，如 smoke 用 3），再：
    python scripts/smoke_m3.py [BASE_URL]
"""
import sys
import time

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8023"
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


uA = reg("pa" + suffix)
uB = reg("pb" + suffix)
hA = {"Authorization": f"Bearer {uA['token']}"}
hB = {"Authorization": f"Bearer {uB['token']}"}
A, B = uA["user"]["id"], uB["user"]["id"]


def mknote(h, title):
    r = c.post("/api/notes", headers=h, json={"title": title, "content": "正文" + title,
                                              "category": "other", "privacy": "public",
                                              "status": "published", "tags": ["m3"]})
    assert r.status_code == 200, (r.status_code, r.text)
    return r.json()


print("== 笔记分页 ==")
ids = []
for i in range(4):
    ids.append(mknote(hA, f"A分页{i}")["id"])
for i in range(3):
    ids.append(mknote(hB, f"B分页{i}")["id"])

p1 = c.get("/api/notes?scope=plaza&page=1&page_size=3", headers=hA).json()
p2 = c.get("/api/notes?scope=plaza&page=2&page_size=3", headers=hA).json()
ids1 = [x["id"] for x in p1["items"]]
ids2 = [x["id"] for x in p2["items"]]
check("第1页 3 条", len(ids1) == 3)
check("两页无重复", len(set(ids1) & set(ids2)) == 0)
check("total≥6 且 hasMore", p1["total"] >= 6 and p1["hasMore"] is True and p2["hasMore"] is True, f"total={p1['total']}")
alld = c.get("/api/notes?scope=plaza&page_size=0", headers=hA).json()
check("page_size=0 返回全部", alld["total"] >= 6 and len(alld["items"]) == alld["total"], f"len={len(alld['items'])}")
mm = c.get("/api/notes?scope=mine&page=1&page_size=2", headers=hA).json()
check("我的笔记分页", mm["total"] == 4 and len(mm["items"]) == 2 and mm["hasMore"] is True)
mmall = c.get("/api/notes?scope=mine&page_size=0", headers=hA).json()
check("我的 page_size=0 全量", len(mmall["items"]) == 4)

print("== AI 用量 / 限额 / 历史入库 ==")
u0 = c.get("/api/ai/usage", headers=hA).json()
check("初始 used=0", u0["used"] == 0)
h0 = c.get("/api/ai/history", headers=hA).json()
check("初始历史空", len(h0["items"]) == 0)

body = {"provider": "deepseek", "messages": [{"role": "user", "content": "hello"}]}
r1 = c.post("/api/ai/chat", json=body, headers=hA)
check("AI chat 200(流式)", r1.status_code == 200, str(r1.status_code))
check("返回了流内容", len(r1.text) > 0)
u1 = c.get("/api/ai/usage", headers=hA).json()
check("用量+1", u1["used"] == 1)
h1 = c.get("/api/ai/history", headers=hA).json()
roles = [x["role"] for x in h1["items"]]
check("入库 user+assistant 两条", "user" in roles and "assistant" in roles, str(roles))

# noteId 上下文：用自己笔记与不存在笔记，均应正常（200），不崩
nid = ids[0]
c.post("/api/ai/chat", json={**body, "noteId": nid}, headers=hA)
c.post("/api/ai/chat", json={**body, "noteId": 999999}, headers=hA)

# 限额 = 3（含上面 3 次成功调用），下一次应 429
r429 = c.post("/api/ai/chat", json=body, headers=hA)
check("超限额返回 429", r429.status_code == 429, str(r429.status_code))
u2 = c.get("/api/ai/usage", headers=hA).json()
check("429 后用量不再增长", u2["used"] == 3, str(u2["used"]))

print(f"\n结果：通过 {PASS}，失败 {FAIL}")
sys.exit(1 if FAIL else 0)
