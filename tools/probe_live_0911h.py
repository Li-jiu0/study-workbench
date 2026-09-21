# -*- coding: utf-8 -*-
"""2026-09-11h 部署后线上端到端探针（临时账号闭环，用完清理）

1. 前端资产：版本令牌 20260911h + 关键函数存在（formatPresence/imApplyRequestBadge/news源）
2. 需求1 闭环：A申请B → B unreadCount=1 → B seen → 0 → B拒绝 → A同秒再发 → 1（同秒边界）
3. 需求10：/api/news/daily 线上返回逐条真实 URL，并抽查一条原文 URL 可访问
4. P0 回归：/api/notes/1、/api/notes/2 仍 200 且评论昵称正常
"""
import json, sys, time, urllib.request, urllib.error, uuid
from urllib.parse import quote as _quote

BASE = "http://110.42.134.62"
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
fails = []


def call(path, method="GET", body=None, token=None, base=BASE):
    if path.startswith("http"):
        url = path
    else:
        head, _, tail = path.partition("?")
        url = base + _quote(head) + (("?" + tail) if tail else "")
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    if data:
        r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with OP.open(r, timeout=25) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return -1, str(e)


def check(name, ok, detail=""):
    print("%-46s %s %s" % (name, "PASS" if ok else "FAIL", detail))
    if not ok:
        fails.append(name)


def register():
    u = "probe_" + uuid.uuid4().hex[:8]
    s, b = call("/api/auth/register", "POST",
                {"username": u, "password": "OldPass123", "nickname": "探针" + u[-4:]})
    if s not in (200, 201):
        return None, None
    j = json.loads(b)
    return u, (j.get("token") or j.get("access_token"))


# ---------- 1. 前端资产 ----------
s, html = call("/私聊.html")
toks = set()
if s == 200:
    import re
    toks = set(re.findall(r"\?v=([0-9A-Za-z._]+)", html))
check("1a 私聊.html 令牌全为 20260911h", s == 200 and toks == {"20260911h"}, str(sorted(toks))[:100])
check("1b 私聊.html 无「后续扩展点：旧页回退」", "后续扩展点：旧页回退" not in html)
s, appjs = call("/assets/app.js")
check("1c app.js 含 formatPresence", s == 200 and "formatPresence" in appjs)
s, cljs = call("/assets/chat-local.js")
check("1d chat-local.js 含 imApplyRequestBadge", s == 200 and "imApplyRequestBadge" in cljs)
check("1e chat-local.js 含 seen 调用", "requests/seen" in cljs)
check("1f chat-local.js 重渲染清 swipeOpen", "swipeOpen = null" in cljs)
s, hnjs = call("/assets/hotnews.js")
check("1g hotnews.js 接入 /api/news/daily", s == 200 and "/api/news/daily" in hnjs)
s, cc = call("/assets/common.css")
check("1h common.css 吸底 fixed", "position: fixed" in cc and ".ed-actions-bar" in cc)

# ---------- 2. 需求1 闭环（双账号，含同秒边界） ----------
ua, ta = register()
ub, tb = register()
if not (ta and tb):
    check("2a 临时账号注册 x2", False)
else:
    check("2a 临时账号注册 x2", True)
    # A -> B 申请
    s, b = call("/api/users", token=ta)  # 占位，无需
    s, b = call("/api/friends/search?q=" + ub, token=ta)
    uid_b = None
    if s == 200:
        items = json.loads(b).get("items", [])
        uid_b = next((it["id"] for it in items if it.get("nickname") == "探针" + ub[-4:]), None)
    check("2b A 搜索到 B", uid_b is not None, "uid=%s" % uid_b)
    s, b = call("/api/friends/requests", "POST", {"toUserId": uid_b}, token=ta)
    check("2c A→B 发申请", s == 200, "HTTP %s" % s)
    s, b = call("/api/friends/requests", token=tb)
    j = json.loads(b)
    check("2d B 收件箱 unreadCount=1", s == 200 and j.get("unreadCount") == 1,
          "unread=%s incoming=%d" % (j.get("unreadCount"), len(j.get("incoming", []))))
    rid = j["incoming"][0]["id"]
    check("2e 收件箱行带 status 字段", "status" in j["incoming"][0], str(list(j["incoming"][0].keys())))
    s, b = call("/api/friends/requests/seen", "POST", None, token=tb)
    check("2f B seen → ok", s == 200 and json.loads(b).get("unreadCount") == 0)
    s, b = call("/api/friends/requests", token=tb)
    check("2g seen 后 unreadCount=0", json.loads(b).get("unreadCount") == 0)
    # B 拒绝 → A 同秒再发（同秒边界）
    s, b = call("/api/friends/requests/%d/decline" % rid, "POST", None, token=tb)
    check("2h B 拒绝申请", s == 200)
    s, b = call("/api/friends/requests", "POST", {"toUserId": uid_b}, token=ta)
    check("2i A 同秒再发申请", s == 200)
    s, b = call("/api/friends/requests", token=tb)
    j = json.loads(b)
    check("2j 同秒新申请 unreadCount=1（BUG-2 线上回归）", j.get("unreadCount") == 1,
          "unread=%s" % j.get("unreadCount"))
    # 删除申请记录（预检补回的线上既有功能）
    rid2 = next((r["id"] for r in j["incoming"] if r.get("status") == "pending"), None)
    if rid2:
        s, b = call("/api/friends/requests/%d" % rid2, "DELETE", None, token=ta)
        check("2k DELETE /requests/{rid} 仍可用（预检补回）", s == 200, "HTTP %s" % s)

# ---------- 3. 需求10 线上 ----------
s, b = call("/api/news/daily")
ok = s == 200
items = []
if ok:
    j = json.loads(b)
    items = j.get("items", [])
check("3a /api/news/daily 200", ok)
check("3b source=中国新闻网", j.get("source") == "中国新闻网", str(j.get("source")))
urls = [it.get("url") for it in items if it.get("url")]
check("3c 逐条原文 URL 存在（≥10 条）", len(urls) >= 10, "urls=%d" % len(urls))
if urls:
    s2, b2 = call(urls[0], base="")
    check("3d 抽查原文 URL 可访问", s2 in (200, 206), "HTTP %s %s" % (s2, urls[0][:60]))

# ---------- 4. P0 回归 ----------
tok = ta or tb
if tok:
    for nid in (1, 2):
        s, b = call("/api/notes/%d" % nid, token=tok)
        ok = s == 200
        detail = "HTTP %s" % s
        if ok:
            names = [c.get("nickname") for c in json.loads(b).get("comments", [])]
            detail = "comments=%d %s" % (len(names), names[:2])
            ok = all(isinstance(n, str) and n for n in names)
        check("4%s 帖子详情 /api/notes/%d" % ("abcd"[nid - 1], nid), ok, detail)

print("\n=== 结果: %d 项失败（探针账号 %s / %s 需清理）===" % (len(fails), ua, ub))
for f in fails:
    print("  FAIL:", f)
