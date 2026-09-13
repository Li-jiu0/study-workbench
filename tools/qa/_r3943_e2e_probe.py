# R39/R40/R42/R43 真实端到端探针（127.0.0.1:8000）
# 用 server/.env 的 JWT_SECRET 自签 access 令牌（uid 6=管理员, 7/8=普通用户），
# 直打真实接口验证前端依赖的数据契约。输出写 tools/qa/_r3943_e2e_probe.txt
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.request
import urllib.error
from pathlib import Path

# 手工实现 HS256 JWT（避免依赖 PyJWT）

BASE = "http://127.0.0.1:8000"
ROOT = Path(r"D:\下载的文件\学习工作台")
OUT = ROOT / "tools" / "qa" / "_r3943_e2e_probe.txt"

# 读 JWT_SECRET
secret = "dev-insecure-secret-change-me"
envf = ROOT / "server" / ".env"
if envf.exists():
    for line in envf.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.strip().startswith("JWT_SECRET="):
            secret = line.split("=", 1)[1].strip()

def _b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=")

def tok(uid):
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": str(uid), "typ": "access", "iat": now, "exp": now + 3600}
    seg = _b64url(json.dumps(header, separators=(",", ":")).encode()) + b"." + \
          _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), seg, hashlib.sha256).digest()
    return (seg + b"." + _b64url(sig)).decode()

def call(method, path, uid=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if uid is not None:
        req.add_header("Authorization", "Bearer " + tok(uid))
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            raw = r.read().decode("utf-8", "ignore")
            return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")
    except Exception as e:
        return -1, "ERR " + str(e)

L = []
L.append("===== R39/R40/R42/R43 真实 E2E 探针 (127.0.0.1:8000) =====")
L.append("取样时间: " + time.strftime("%Y-%m-%dT%H:%M:%S"))
L.append("JWT_SECRET 来源: " + (".env" if envf.exists() else "default"))
L.append("")

def show(tag, status, raw, keep=260):
    body = raw if len(raw) <= keep else raw[:keep] + "...(truncated)"
    L.append("[%s] status=%s body=%s" % (tag, status, body))

# 1) /api/admin/contact : 登录即可，返回管理员最小信息（R43 id 来源）
s, b = call("GET", "/api/admin/contact", uid=7)
admin_id = None
try:
    admin_id = json.loads(b).get("id")
except Exception:
    pass
show("R43 admin/contact (uid7)", s, b)
L.append("  -> 解析 admin_id = %s" % admin_id)

# 2) /api/admin/users : 管理员 200 / 普通用户 403（R40 数据源 + 降级判定）
s6, b6 = call("GET", "/api/admin/users", uid=6)
show("R40 admin/users (uid6)", s6, b6)
users_items = []
try:
    users_items = json.loads(b6).get("items", [])
except Exception:
    pass
if users_items:
    sample = users_items[0]
    keys = ["id", "username", "nickname", "lastActive", "last_active", "isOnline", "is_online", "isAdmin", "is_admin"]
    L.append("  -> 首行字段: " + json.dumps({k: sample.get(k) for k in keys}, ensure_ascii=False))
    L.append("  -> 行数 total=%s；含管理员行(id=%s, isAdmin=%s)" % (
        len(users_items),
        next((u.get("id") for u in users_items if u.get("isAdmin") or u.get("is_admin")), None),
        next((u.get("isAdmin") or u.get("is_admin") for u in users_items if u.get("isAdmin") or u.get("is_admin")), None)))
s7, b7 = call("GET", "/api/admin/users", uid=7)
show("R40 admin/users (uid7 期望403)", s7, b7)

# 3) /api/admin/users/{id} : 管理员 200 / 普通用户 403（R42）
s, b = call("GET", "/api/admin/users/7", uid=6)
show("R42 admin/users/7 (uid6)", s, b)
s, b = call("GET", "/api/admin/users/7", uid=7)
show("R42 admin/users/7 (uid7 期望403)", s, b)

# 4) R39：管理员(6) 给用户(7) 发信 → 用户(7) 的 unread 应出现 peerId=6 的会话
if admin_id:
    s, b = call("POST", "/api/chat/7/messages", uid=6, body={"content": "e2e-r3943-admin-to-user", "kind": "text"})
    show("R39 admin(6)->user(7) send (can_message 管理员放行?)", s, b)
    s, b = call("POST", "/api/chat/8/messages", uid=7, body={"content": "e2e-r3943-user7-to-user8", "kind": "text"})
    show("对照: user7 -> user8 非好友 send (期望403)", s, b)
    s, b = call("GET", "/api/chat/unread", uid=7)
    show("R39/R43 chat/unread (uid7)", s, b)
    try:
        items = json.loads(b).get("items", [])
        hit = [it for it in items if int(it.get("peerId", 0)) == int(admin_id)]
        L.append("  -> uid7 未读中含 peerId=%s 的条目: %s" % (admin_id, json.dumps(hit, ensure_ascii=False)))
    except Exception as e:
        L.append("  -> 解析 unread 失败: " + str(e))

# 5) 未登录访问 admin/contact / users 的鉴权（R40/R43 前置）
s, b = call("GET", "/api/admin/contact", uid=None)
show("R43 admin/contact (无token 期望401)", s, b)
s, b = call("GET", "/api/admin/users", uid=None)
show("R40 admin/users (无token 期望401)", s, b)

L.append("")
L.append("--- 结论 ---")
L.append("R40 数据源(管理员200/普通403)、R42 资料(管理员200/普通403)、R43 admin/contact 返回最小 id、" +
         "R39 unread 端点可用性见上。")
OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
print("\n".join(L))
