"""临时冒烟（HTTP 版）：真实 uvicorn + 独立测试库 wt_test.db。"""
import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8123"
# 绕过系统代理，直连本机测试服务
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def req(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}
    except Exception as e:
        return -1, {"detail": str(e)}


def main():
    out = []

    def run():
        s, r = req("GET", "/api/health")
        out.append(f"health: {s} {r}")

        tokens = {}
        for u in ("t_mom_a", "t_mom_b", "t_mom_c"):
            s, r = req("POST", "/api/auth/register", body={"username": u, "password": "test123456", "nickname": u})
            out.append(f"register {u}: {s} {'OK' if s == 200 else r}")
            if s == 200 and isinstance(r, dict) and r.get("token"):
                tokens[u] = r["token"]
            else:
                s, r = req("POST", "/api/auth/login", body={"username": u, "password": "test123456"})
                out.append(f"login {u}: {s} {'OK' if s == 200 else r}")
                if s == 200 and isinstance(r, dict) and r.get("token"):
                    tokens[u] = r["token"]
        out.append(f"tokens ok: {len(tokens)}")
        if len(tokens) < 3:
            return

        s, r = req("GET", "/api/auth/me", tokens["t_mom_a"]); ra = r["id"]
        s, r = req("GET", "/api/auth/me", tokens["t_mom_b"]); rb = r["id"]
        s, r = req("GET", "/api/auth/me", tokens["t_mom_c"]); rc = r["id"]

        req("POST", "/api/friends/requests", tokens["t_mom_a"], {"toUserId": rb})
        req("POST", "/api/friends/requests", tokens["t_mom_a"], {"toUserId": rc})
        for tk in (tokens["t_mom_b"], tokens["t_mom_c"]):
            s, r = req("GET", "/api/friends/requests", tk)
            for x in r["incoming"]:
                if x["user"]["id"] == ra:
                    s, _ = req("POST", f"/api/friends/requests/{x['id']}/accept", tk)
        out.append(f"friend accept status: {s}")

        s, r = req("POST", "/api/moments", tokens["t_mom_a"], {"content": "今天的打卡内容哦", "images": []})
        out.append(f"moment publish: {s} {r if s != 200 else r['id']}")
        mid = r["id"]

        s, r = req("GET", "/api/moments/feed", tokens["t_mom_b"])
        out.append(f"feed for b: {s} ids={[m['id'] for m in r['items']]}")
        s, r = req("GET", f"/api/moments/user/{ra}", tokens["t_mom_c"])
        out.append(f"c view a moments (expect 403): {s}")

        s, r = req("POST", f"/api/moments/{mid}/like", tokens["t_mom_b"])
        out.append(f"like: {s} {r}")
        s, r = req("POST", f"/api/moments/{mid}/comments", tokens["t_mom_b"], {"content": "赞一个，继续加油！"})
        out.append(f"comment: {s} {r}")
        cid = r["id"]
        s, r = req("DELETE", f"/api/moments/comments/{cid}", tokens["t_mom_a"])
        out.append(f"author delete comment: {s} {r}")
        s, r = req("GET", "/api/notifications", tokens["t_mom_a"])
        out.append(f"a notifications types={[x['type'] for x in r['items']]}")

        s, r = req("POST", "/api/groups", tokens["t_mom_a"], {"name": "四级冲刺群", "memberIds": [rc]})
        out.append(f"group with 1 member (expect 422): {s}")
        s, r = req("POST", "/api/groups", tokens["t_mom_a"], {"name": "四级冲刺群", "memberIds": [rb, rc]})
        out.append(f"group create: {s} {r if s != 200 else r}")
        gid = r["id"]
        s, r = req("GET", f"/api/groups/{gid}", tokens["t_mom_c"])
        out.append(f"c view group (expect 403): {s}")
        s, r = req("POST", f"/api/groups/{gid}/messages", tokens["t_mom_a"], {"content": "大家好", "kind": "text"})
        out.append(f"group msg: {s} sender={r.get('senderNickname')}")
        s, r = req("GET", f"/api/groups/{gid}/messages", tokens["t_mom_b"])
        out.append(f"b fetch group msgs: {s} n={len(r['items'])}")
        s, r = req("GET", "/api/groups", tokens["t_mom_b"])
        out.append(f"b groups unread: {[(g['id'], g['unreadCount']) for g in r['items']]}")
        s, r = req("POST", f"/api/groups/{gid}/read", tokens["t_mom_b"], {"upToId": 10 ** 9})
        out.append(f"b mark read: {s} {r}")
        s, r = req("POST", f"/api/groups/{gid}/quit", tokens["t_mom_b"])
        out.append(f"b quit: {s} {r}")
        s, r = req("GET", f"/api/groups/{gid}", tokens["t_mom_b"])
        out.append(f"b view group after quit (expect 403): {s}")

        s, r = req("POST", "/api/feedbacks", tokens["t_mom_a"], {"type": "bug", "content": "消息发不出去帮我看看", "anonymous": True})
        out.append(f"feedback: {s} {r}")
        s, r = req("POST", "/api/feedbacks", tokens["t_mom_a"], {"type": "bug", "content": "第二条太快了会被限制", "anonymous": False})
        out.append(f"feedback 2nd (expect 429): {s}")
        s, r = req("GET", "/api/feedbacks/mine", tokens["t_mom_a"])
        out.append(f"feedback mine: {[(x['id'], x['status']) for x in r['items']]}")

        logs = {"logs": [
            {"module": "cet4", "event": "task", "payload": {"task": "words"}, "createdAt": "2026-09-11 10:00:00"},
            {"module": "cet4", "event": "task", "payload": {"task": "words"}, "createdAt": "2026-09-11 10:00:00"},
        ]}
        s, r = req("POST", "/api/study/logs", tokens["t_mom_a"], logs)
        out.append(f"study logs 1st: {s} {r}")
        s, r = req("POST", "/api/study/logs", tokens["t_mom_a"], logs)
        out.append(f"study logs 2nd (dup): {s} {r}")
        s, r = req("GET", "/api/study/summary?module=cet4", tokens["t_mom_a"])
        out.append(f"study summary: {r}")

        s, r = req("GET", f"/api/users/{rb}", tokens["t_mom_a"])
        bad = [k for k in r.keys() if k.lower() in ("phone", "gender", "birthday")]
        out.append(f"profile privacy keys (expect []): {bad}")
        out.append(f"profile has isFriend/online/lastSeenAt: {('isFriend' in r, 'online' in r, 'lastSeenAt' in r)}")

        s, r = req("GET", f"/api/users/presence?ids={ra},{rb}", tokens["t_mom_c"])
        out.append(f"presence: {s} {r}")

    try:
        run()
    except Exception as e:
        import traceback
        out.append("EXCEPTION: " + traceback.format_exc())
    finally:
        with open(r"D:\下载的文件\wt_smoke_out.txt", "w", encoding="utf-8") as f:
            f.write("\n".join(out))
    print("DONE")


main()
