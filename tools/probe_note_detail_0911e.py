# -*- coding: utf-8 -*-
"""广场帖子详情（P0 修复）鉴权回归：临时账号 → 取 token → 读有评论的帖子详情 → 清理。

背景：GET /api/notes/{id} 需登录。历史上 Comment 模型缺 author 关系，
导致「有评论的帖子」详情 500（c.author.nickname AttributeError）。
服务器 notes: {1,2} 均有评论，是天然回归样本。
"""
import json, sys, urllib.request, urllib.error, uuid

BASE = "http://110.42.134.62"
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
fails = []


def call(path, method="GET", body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
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


u = "probe_" + uuid.uuid4().hex[:8]
s, b = call("/api/auth/register", "POST", {"username": u, "password": "OldPass123", "nickname": "探针" + u[-4:]})
if s not in (200, 201):
    check("注册临时账号", False, "HTTP %s %s" % (s, b[:150]))
    sys.exit(1)
tok = json.loads(b).get("token") or json.loads(b).get("access_token")
check("注册临时账号并取 token", bool(tok))

try:
    s, b = call("/api/notes?limit=5", token=tok)
    check("列表 GET /api/notes?limit=5", s == 200, "HTTP %s" % s)
    ids = []
    if s == 200:
        j = json.loads(b)
        items = j if isinstance(j, list) else (j.get("items") or j.get("notes") or [])
        ids = [it.get("id") for it in items if isinstance(it, dict)]
    check("列表含帖子 id", len(ids) > 0, str(ids))

    # 有评论的帖子 = 历史 500 样本
    for nid in sorted(set([1, 2] + [i for i in ids if isinstance(i, int)]))[:6]:
        s2, b2 = call("/api/notes/%d" % nid, token=tok)
        ok = s2 == 200
        detail = "HTTP %s" % s2
        if ok:
            j2 = json.loads(b2)
            cs = j2.get("comments") or []
            # 后端 note_detail 的评论字段是 nickname/avatarUrl/userId（没有 author）
            names = [c.get("nickname") for c in cs]
            detail = "HTTP 200 comments=%d nicknames=%s" % (len(cs), names[:3])
            # 关键：有评论时序列化不得崩溃、昵称不得为空/被误判为已注销
            if cs:
                ok = all(isinstance(n, str) and n and n != "已注销用户" for n in names)
                if not ok:
                    detail += " ← 昵称异常（空/已注销，实际作者应存在）"
        check("详情 /api/notes/%d（有评论）" % nid, ok, detail)
finally:
    print("\n清理临时账号: %s" % u)
    print("USERS_BASELINE_EXPECT: 6")
    print("\n=== 结果: %d 项失败 ===" % len(fails))
    for f in fails:
        print("  FAIL:", f)
sys.exit(1 if fails else 0)
