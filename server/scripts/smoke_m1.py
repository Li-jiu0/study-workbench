"""里程碑1 冒烟测试：JWT 双令牌 / 刷新 / 软删除回收站 / 上传魔数 / 认证限流。

用法：先启动后端，再：
    python scripts/smoke_m1.py [BASE_URL]
    # 默认 http://127.0.0.1:8021
"""
import sys
import time

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8021"
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # 兼容 GBK 控制台
except Exception:
    pass
suffix = str(time.time_ns() % 10_000_000)
PASS = 0
FAIL = 0


def check(name, ok, extra=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✓ {name}" + (f"  {extra}" if extra else ""))
    else:
        FAIL += 1
        print(f"  ✗ FAIL {name}  {extra}")


c = httpx.Client(base_url=BASE, timeout=30, trust_env=False)  # 禁用系统代理，直连本机

print("== 注册 / 登录返回双令牌 ==")
r = c.post("/api/auth/register", json={"username": f"t{suffix}", "password": "pass123456", "nickname": f"测试{suffix}"})
check("register 200", r.status_code == 200, str(r.status_code))
d = r.json()
check("register 返回 token+refreshToken", bool(d.get("token")) and bool(d.get("refreshToken")))
access, refresh = d["token"], d["refreshToken"]
uid = d["user"]["id"]

print("== access 鉴权 / /me ==")
me = c.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
check("me 200", me.status_code == 200, str(me.status_code))

print("== refresh 轮换令牌对 ==")
r = c.post("/api/auth/refresh", json={"refresh": refresh})
check("refresh 200", r.status_code == 200, str(r.status_code))
d2 = r.json()
new_access = d2.get("token", "")
check("refresh 返回新 token", bool(new_access))
me2 = c.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
check("新 token 可用", me2.status_code == 200)
r_bad = c.post("/api/auth/refresh", json={"refresh": "not.a.token"})
check("伪造 refresh 被拒", r_bad.status_code == 401, str(r_bad.status_code))

print("== 笔记创建 / 软删除 / 回收站 ==")
h = {"Authorization": f"Bearer {access}"}
note = c.post("/api/notes", headers=h, json={
    "title": f"冒烟笔记{suffix}", "content": "hello soft delete", "category": "other",
    "privacy": "public", "status": "published", "tags": ["smoke"],
}).json()
nid = note["id"]
check("创建笔记", bool(nid))

plaza = c.get("/api/notes?scope=plaza", headers=h).json()
check("广场含新笔记", any(x["id"] == nid for x in plaza["items"]))

dl = c.delete(f"/api/notes/{nid}", headers=h)
check("删除=软删 200", dl.status_code == 200)
trash = c.get("/api/notes/trash", headers=h).json()
check("回收站含该笔记", any(x["id"] == nid for x in trash["items"]))
mine = c.get("/api/notes?scope=mine", headers=h).json()
check("我的列表不再含它", not any(x["id"] == nid for x in mine["items"]))
pz2 = c.get("/api/notes?scope=plaza", headers=h).json()
check("广场不再含它", not any(x["id"] == nid for x in pz2["items"]))
detail = c.get(f"/api/notes/{nid}", headers=h)
check("已删笔记详情 404", detail.status_code == 404, str(detail.status_code))

rs = c.post(f"/api/notes/{nid}/restore", headers=h)
check("恢复 200", rs.status_code == 200)
pz3 = c.get("/api/notes?scope=plaza", headers=h).json()
check("恢复后回广场", any(x["id"] == nid for x in pz3["items"]))

c.delete(f"/api/notes/{nid}", headers=h)  # 再软删
pu = c.delete(f"/api/notes/trash/{nid}", headers=h)
check("彻底删除 200", pu.status_code == 200)
tr2 = c.get("/api/notes/trash", headers=h).json()
check("彻底删除后不在回收站", not any(x["id"] == nid for x in tr2["items"]))

print("== 上传魔数校验 ==")
png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
                    "53640000000c4944415408d763f8cfc00000030101001bc21a940000000049454e44ae426082")
r_img = c.post("/api/uploads", headers=h, files={"file": ("a.png", png, "image/png")})
check("真实 PNG 上传成功", r_img.status_code == 200 and r_img.json().get("url"), str(r_img.status_code))
r_txt = c.post("/api/uploads", headers=h, files={"file": ("x.png", b"<html><script>alert(1)</script>", "image/png")})
check("HTML 伪装 png 被拒 400", r_txt.status_code == 400, str(r_txt.status_code))
r_badtype = c.post("/api/uploads", headers=h, files={"file": ("a.txt", b"hello", "text/plain")})
check("text/plain 被拒", r_badtype.status_code == 400, str(r_badtype.status_code))

print("== 认证接口限流(末段应出现 429) ==")
hit_429 = 0
for i in range(14):
    rr = c.post("/api/auth/login", json={"username": f"t{suffix}", "password": "wrong-password"})
    if rr.status_code == 429:
        hit_429 += 1
check("同 IP 高频登录触发 429", hit_429 >= 1, f"429x{hit_429}")

print(f"\n结果：通过 {PASS}，失败 {FAIL}")
sys.exit(1 if FAIL else 0)
