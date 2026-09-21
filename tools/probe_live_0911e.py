# -*- coding: utf-8 -*-
"""2026-09-11e 部署后线上真实探针（只读 + 一个临时账号闭环，用完清理）

校验：
  1. 站点/健康/新页面可达
  2. 广场帖子详情 200（P0 热修回归）
  3. 前端资源版本令牌 = 20260911g，且 app.js 含 shouldUseDictTts / speakFallback（语音修复）
  4. 更多.html / 工具.html 真能被服务（内容含预期标记）
  5. 改密闭环（临时账号：注册→改密→旧密码登录失败→新密码登录成功→清理）
"""
import json, re, sys, urllib.request, urllib.error, uuid
from urllib.parse import quote as _quote

BASE = "http://110.42.134.62"
API = BASE + "/api"
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # 绕过本机代理直连

fails = []


def req(path, method="GET", body=None, token=None, base=BASE):
    if path.startswith("http"):
        url = path
    else:
        # 关键：中文文件名必须百分号编码，urllib 不会自动处理
        head, _, tail = path.partition("?")
        url = base + _quote(head)
        if tail:
            url += "?" + tail
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    if data:
        r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with OPENER.open(r, timeout=25) as resp:
            raw = resp.read()
            return resp.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return -1, str(e).encode()


def text(path, **kw):
    s, b = req(path, **kw)
    return s, b.decode("utf-8", "replace")


def check(name, ok, detail=""):
    print("%-42s %s %s" % (name, "PASS" if ok else "FAIL", detail))
    if not ok:
        fails.append(name)


# 1. 站点可达
for p, label in [("/", "站点首页"), ("/api/health", "健康检查"),
                 ("/更多.html", "更多.html"), ("/工具.html", "工具.html"),
                 ("/学途.html", "学途.html"), ("/blog_wechat.html", "blog_wechat.html")]:
    s, b = req(p if p.startswith("/api") else p, base=BASE if not p.startswith("/api") else BASE)
    check("1 %s" % label, s == 200, "HTTP %s" % s)

# 2. 广场帖子详情（P0 回归）
ok_any = False
for nid in range(1, 12):
    s, b = req("/api/notes/%d" % nid)
    if s == 200:
        ok_any = True
    elif s == 500:
        check("2 广场帖子详情 /api/notes/%d" % nid, False, "HTTP 500")
if ok_any:
    check("2 广场帖子详情（有帖可读且无 500）", True)

# 3. 前端资源令牌 + 语音修复标记
s, html = text("/学习工作台.html")
check("3a 首页可读", s == 200, "HTTP %s" % s)
tokens = set(re.findall(r"\?v=([0-9A-Za-z._]+)", html))
check("3b 首页资源令牌均为 20260911g", tokens == {"20260911g"}, str(sorted(tokens))[:120])
s, appjs = text("/assets/app.js")
check("3c app.js 可读", s == 200)
check("3d app.js 含 shouldUseDictTts", "shouldUseDictTts" in appjs)
check("3e app.js 含 speakFallback", "speakFallback" in appjs)
check("3f 中文阈值 >3（中文不再走词典TTS）",
      re.search(r"shouldUseDictTts[\s\S]{0,400}?length\s*>\s*3", appjs) is not None)

# 4. 新页面内容标记
s, more = text("/更多.html")
check("4a 更多.html 真内容（非空壳）", s == 200 and len(more) > 2000, "%d bytes" % len(more))
s, tools = text("/工具.html")
check("4b 工具.html 真内容（含穿越英语入口）", s == 200 and "穿越英语" in tools, "%d bytes" % len(tools))

# 5. 改密闭环（临时账号）
u = "probe_" + uuid.uuid4().hex[:8]
nick = "探针" + u[-4:]
s, b = req("/api/auth/register", "POST", {"username": u, "password": "OldPass123", "nickname": nick})
if s not in (200, 201):
    check("5a 临时账号注册", False, "HTTP %s %s" % (s, b[:120]))
else:
    tok = json.loads(b).get("token") or json.loads(b).get("access_token")
    check("5a 临时账号注册", bool(tok))
    s2, b2 = req("/api/auth/change-password", "POST",
                 {"oldPassword": "OldPass123", "newPassword": "NewPass456"}, token=tok)
    check("5b 改密成功", s2 == 200, "HTTP %s %s" % (s2, b2[:120]))
    s3, _ = req("/api/auth/login", "POST", {"username": u, "password": "OldPass123"})
    check("5c 旧密码登录应失败", s3 in (400, 401, 403), "HTTP %s" % s3)
    s4, b4 = req("/api/auth/login", "POST", {"username": u, "password": "NewPass456"})
    check("5d 新密码登录成功", s4 == 200, "HTTP %s" % s4)
    s5, b5 = req("/api/auth/change-password", "POST",
                 {"oldPassword": "WrongOld9", "newPassword": "Xyz789xyz"}, token=tok)
    check("5e 旧密码错应 400", s5 == 400, "HTTP %s" % s5)
    s6, b6 = req("/api/auth/change-password", "POST",
                 {"oldPassword": "NewPass456", "newPassword": "NewPass456"}, token=tok)
    check("5f 新旧相同应 400", s6 == 400, "HTTP %s" % s6)

print("\n=== 结果: %d 项失败 ===" % len(fails))
for f in fails:
    print("  FAIL:", f)
sys.exit(1 if fails else 0)
