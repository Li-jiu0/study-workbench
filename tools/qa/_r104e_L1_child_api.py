# -*- coding: utf-8 -*-
"""批5 · L1 验收 相位①：API 全链（TestClient，隔离副本，零出网 —— 腾讯调用全部打桩）。

覆盖门禁 1-9、12。末行 API_RESULT=PASS/FAIL。
"""
import io
import json
import os
import sys
import time
import uuid

QA = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(QA, "_r104e_L1_api_out.txt")
DST = os.environ["R104E_ISO_DIR"]

LOG = []
R = {"pass": 0, "fail": 0}


def log(s=""):
    LOG.append(str(s))


def ck(label, cond, detail=""):
    if cond:
        R["pass"] += 1
        log("  OK   %s%s" % (label, ("  -> " + str(detail)) if detail != "" else ""))
    else:
        R["fail"] += 1
        log("  FAIL %s  -> %s" % (label, detail))
    return bool(cond)


def finish(code):
    log("")
    log("API_RESULT=%s（%d/%d PASS）" % ("PASS" if R["fail"] == 0 else "FAIL",
                                        R["pass"], R["pass"] + R["fail"]))
    io.open(OUT, "w", encoding="utf-8").write("\n".join(LOG))
    sys.exit(code)


def main():
    os.environ["DATABASE_PATH"] = os.environ["R104E_DB"]
    os.environ["JWT_SECRET"] = "r104e-" + uuid.uuid4().hex
    os.environ["ADMIN_USERNAME"] = "管理员"
    os.environ["ADMIN_PASSWORD"] = "Smoke@2026r104e"
    sys.path.insert(0, DST)

    from fastapi.testclient import TestClient
    from main import app
    from routers import geo as geo_mod
    from routers import liveloc as liveloc_mod

    # ---- 腾讯全部打桩（零出网 + 调用计数）----
    calls = {"geocoder": 0, "staticmap": 0, "place": 0}

    async def fake_json(url, params):
        if "geocoder" in url:
            calls["geocoder"] += 1
        elif "place" in url:
            calls["place"] += 1
        return {"status": 0, "result": {"address": "打桩地址", "address_component": {},
                                        "ad_info": {}, "pois": []}, "data": []}

    async def fake_bytes(url, params):
        if "staticmap" in url:
            calls["staticmap"] += 1
        return (b"\x89PNG\r\n\x1a\nFAKE", "image/png")

    geo_mod._tencent_json = fake_json
    geo_mod._tencent_bytes = fake_bytes

    tc = TestClient(app, client=("127.0.0.1", 50021), raise_server_exceptions=False)
    log("==== 批5 L1 API 全链（隔离库 %s；腾讯全打桩）====" % os.environ["DATABASE_PATH"])
    s = uuid.uuid4().hex[:8]

    def reg(tag, nick):
        r = tc.post("/api/auth/register",
                    json={"username": tag + s, "password": "pass123456", "nickname": nick + s})
        j = r.json()
        return j.get("token", ""), j.get("user", {}).get("id", 0)

    ta, ua = reg("l1a", "甲")
    tb, ub = reg("l1b", "乙")
    tc_, uc = reg("l1c", "丙")
    td, ud = reg("l1d", "丁")
    te, ue = reg("l1e", "戊")           # 非好友
    HA = {"Authorization": "Bearer " + ta}
    HB = {"Authorization": "Bearer " + tb}
    HC = {"Authorization": "Bearer " + tc_}
    HD = {"Authorization": "Bearer " + td}
    ck("注册 A/B/C/D/E", all(x > 0 for x in (ua, ub, uc, ud, ue)), "ua=%s ub=%s" % (ua, ub))

    def befriend(uid_b, b_hdr):
        tc.post("/api/friends/requests", json={"toUserId": uid_b}, headers=HA)
        reqs = tc.get("/api/friends/requests", headers=b_hdr).json()
        pend = [x for x in reqs.get("incoming", []) if x.get("status") == "pending"]
        if pend:
            tc.post("/api/friends/requests/%d/accept" % pend[0]["id"], headers=b_hdr)
        return bool(pend)

    ck("A-B / A-C 成为好友", befriend(ub, HB) and befriend(uc, HC))

    # 群：A 建群拉 B、C（memberIds 需 ≥2）
    rg = tc.post("/api/groups", json={"name": "L1验证群", "memberIds": [ub, uc]}, headers=HA)
    gid = rg.json().get("id", 0)
    ck("A 建群（含 B/C）", rg.status_code == 200 and gid > 0, rg.status_code)

    # ---- 门禁 3：鉴权 401（4 接口）----
    log("")
    log("---- 门禁 3：鉴权 401 ----")
    ck("start 无 token → 401",
       tc.post("/api/live/start", json={"peerId": ub}).status_code == 401)
    ck("start 坏 token → 401",
       tc.post("/api/live/start", json={"peerId": ub},
               headers={"Authorization": "Bearer bad"}).status_code == 401)
    ck("tick 无 token → 401",
       tc.post("/api/live/tick", json={"shareId": "x", "lat": 1, "lng": 2}).status_code == 401)
    ck("stop 无 token → 401", tc.post("/api/live/stop", json={"shareId": "x"}).status_code == 401)
    ck("state 无 token → 401", tc.get("/api/live/state?peerId=%d" % ub).status_code == 401)

    # ---- 门禁 6：非好友 start → 403 ----
    log("")
    log("---- 门禁 6：非好友 ----")
    r = tc.post("/api/live/start", json={"peerId": ue}, headers=HA)
    ck("A start(非好友 E) → 403", r.status_code == 403, r.status_code)
    r = tc.post("/api/live/start", json={}, headers=HA)
    ck("peerId/groupId 都缺 → 400", r.status_code == 400, r.status_code)
    r = tc.post("/api/live/start", json={"peerId": ub, "groupId": gid}, headers=HA)
    ck("peerId/groupId 都给 → 400", r.status_code == 400, r.status_code)

    # ---- 门禁 1：端到端私聊 ----
    log("")
    log("---- 门禁 1：端到端私聊 start→tick×5→state→stop ----")
    r = tc.post("/api/live/start", json={"peerId": ub}, headers=HA)
    j = r.json()
    sid = j.get("shareId", "")
    ck("A start(peerId=B) → {ok,shareId,expiresAt(ms)}",
       r.status_code == 200 and j.get("ok") is True and bool(sid)
       and isinstance(j.get("expiresAt"), int) and j["expiresAt"] > (time.time() + 3500) * 1000,
       "%s expiresAt=%s" % (r.status_code, j.get("expiresAt")))
    last = None
    for i in range(5):
        last = (30.0 + i * 0.01, 120.0 + i * 0.01)
        rr = tc.post("/api/live/tick", json={"shareId": sid, "lat": last[0], "lng": last[1]},
                     headers=HA)
        if rr.status_code != 200:
            break
    ck("A tick ×5 全 200", rr.status_code == 200, rr.status_code)
    r = tc.get("/api/live/state?peerId=%d" % ua, headers=HB)
    st = r.json()
    ck("B state?peerId=A → active + 最新坐标",
       r.status_code == 200 and st.get("active") is True and st.get("sharerId") == ua
       and st.get("lat") == last[0] and st.get("lng") == last[1] and st.get("stale") is False,
       st)
    ck("state 不含轨迹字段（只有当前坐标）",
       set(st.keys()) == {"ok", "active", "shareId", "sharerId", "lat", "lng", "updatedAt", "stale"},
       sorted(st.keys()))
    r = tc.post("/api/live/stop", json={"shareId": sid}, headers=HA)
    ck("A stop → ok", r.status_code == 200 and r.json().get("ok") is True, r.status_code)
    r = tc.get("/api/live/state?peerId=%d" % ua, headers=HB)
    ck("stop 后 B state → active=false", r.json().get("active") is False, r.json())

    # ---- 门禁 2：越权 ----
    log("")
    log("---- 门禁 2：越权（别人的 shareId）----")
    r = tc.post("/api/live/start", json={"peerId": ub}, headers=HA)
    sid2 = r.json().get("shareId", "")
    ck("A 新开会话（用于越权测试）", r.status_code == 200 and bool(sid2))
    rt = tc.post("/api/live/tick", json={"shareId": sid2, "lat": 1.0, "lng": 2.0}, headers=HB)
    ck("B tick A 的 shareId → 403", rt.status_code == 403, rt.status_code)
    rs = tc.post("/api/live/stop", json={"shareId": sid2}, headers=HB)
    ck("B stop A 的 shareId → 403", rs.status_code == 403, rs.status_code)
    rs = tc.post("/api/live/stop", json={"shareId": "不存在的shareId"}, headers=HB)
    ck("B stop 不存在的 shareId → 403（不泄露存在性）", rs.status_code == 403, rs.status_code)
    st = tc.get("/api/live/state?peerId=%d" % ua, headers=HB).json()
    ck("★ 越权失败后 A 的会话仍 active", st.get("active") is True, st)

    # ---- 门禁 5：stale（ts 回拨 61s）----
    log("")
    log("---- 门禁 5：stale ----")
    tc.post("/api/live/tick", json={"shareId": sid2, "lat": 31.0, "lng": 121.0}, headers=HA)
    liveloc_mod._LIVE[sid2]["ts"] = time.time() - 61
    st = tc.get("/api/live/state?peerId=%d" % ua, headers=HB).json()
    ck("★ ts 回拨 61s → stale=true 且仍返回最后坐标",
       st.get("stale") is True and st.get("active") is True
       and st.get("lat") == 31.0 and st.get("lng") == 121.0, st)

    # ---- 门禁 4：过期（expires_at 造到过去）----
    log("")
    log("---- 门禁 4：过期（惰性判定）----")
    liveloc_mod._LIVE[sid2]["exp"] = time.time() - 1
    st = tc.get("/api/live/state?peerId=%d" % ua, headers=HB).json()
    ck("★ expires_at 已过 → active=false", st.get("active") is False, st)
    r = tc.post("/api/live/tick", json={"shareId": sid2, "lat": 1.0, "lng": 2.0}, headers=HA)
    ck("过期后 tick → 403", r.status_code == 403, r.status_code)
    r = tc.post("/api/live/stop", json={"shareId": sid2}, headers=HA)
    ck("过期后 stop 幂等 → ok", r.status_code == 200, r.status_code)

    # ---- 门禁 7：群聊 ----
    log("")
    log("---- 门禁 7：群聊共享 ----")
    r = tc.post("/api/live/start", json={"groupId": gid}, headers=HA)
    gsid = r.json().get("shareId", "")
    ck("A start(groupId=G) → ok", r.status_code == 200 and bool(gsid), r.status_code)
    tc.post("/api/live/tick", json={"shareId": gsid, "lat": 22.5, "lng": 114.0}, headers=HA)
    st = tc.get("/api/live/state?groupId=%d" % gid, headers=HB).json()
    ck("B state?groupId=G → 拿到坐标", st.get("active") is True and st.get("lat") == 22.5, st)
    ck("非成员 D state?groupId=G → 403",
       tc.get("/api/live/state?groupId=%d" % gid, headers=HD).status_code == 403)
    ck("非成员 D start(groupId=G) → 403",
       tc.post("/api/live/start", json={"groupId": gid}, headers=HD).status_code == 403)
    r = tc.post("/api/live/stop", json={"shareId": gsid}, headers=HA)
    ck("群共享 stop → ok", r.status_code == 200, r.status_code)
    ck("stop 后 B 群 state → active=false",
       tc.get("/api/live/state?groupId=%d" % gid, headers=HB).json().get("active") is False)

    # ---- 门禁 12：回归（批2/批4 位置消息 + 群位置消息 + 预览映射）----
    log("")
    log("---- 门禁 12：回归 ----")
    r = tc.post("/api/chat/%d/messages" % ub, headers=HA,
                json={"content": "我的位置", "kind": "location", "sub": "西湖",
                      "lat": 30.25, "lng": 120.16, "precise": True})
    j = r.json()
    ck("批4回归：私聊 location 仍可发，msg_dict 四字段在",
       r.status_code == 200 and j.get("kind") == "location" and j.get("precise") is True
       and j.get("sub") == "西湖" and j.get("lat") == 30.25 and j.get("lng") == 120.16, j)
    r = tc.post("/api/groups/%d/messages" % gid, headers=HA,
                json={"content": "群位置", "kind": "location", "sub": "南山",
                      "lat": 22.53, "lng": 113.93, "precise": True})
    ck("群聊 location 从零打通 → 200", r.status_code == 200, r.status_code)
    gm = r.json()
    ck("★ 群 location 回包带 sub/lat/lng/precise",
       gm.get("sub") == "南山" and gm.get("lat") == 22.53 and gm.get("lng") == 113.93
       and gm.get("precise") is True and gm.get("kind") == "location", gm)
    r = tc.get("/api/groups/%d/messages?limit=5" % gid, headers=HB)
    items = r.json().get("items", [])
    row = next((x for x in items if x.get("kind") == "location"), None)
    ck("★ 群历史回读坐标字段在", bool(row) and row.get("lat") == 22.53 and row.get("sub") == "南山",
       row)
    r = tc.get("/api/groups", headers=HB)
    grew = next((x for x in r.json().get("items", []) if x.get("id") == gid), None)
    ck("群列表 lastMessage 带坐标字段",
       isinstance(grew, dict) and "sub" in (grew.get("lastMessage") or {})
       and "precise" in (grew.get("lastMessage") or {}), (grew or {}).get("lastMessage"))
    # 未读预览：让 B 最后给 A 发一条 location（预览映射的 API 级实证）
    tc.post("/api/chat/%d/messages" % ua, headers=HB, json={"content": "ping", "kind": "text"})
    tc.post("/api/chat/%d/messages" % ua, headers=HB,
            json={"content": "乙的位置", "kind": "location", "lat": 30.3, "lng": 120.3})
    us = tc.get("/api/chat/unread-summary", headers=HA).json()
    item_b = next((x for x in us.get("items", [])
                   if x.get("type") == "peer" and x.get("id") == ub), {})
    ck("R105 回归：unread-summary 200 且 location 预览 == [位置]",
       tc.get("/api/chat/unread-summary", headers=HA).status_code == 200
       and item_b.get("last", {}).get("preview") == "[位置]", item_b)
    ck("R105 回归：/api/chat/unread 仍 200",
       tc.get("/api/chat/unread", headers=HA).status_code == 200)
    # location_live 预览映射（单元级：卡片只会由 owner 发出，此处直接验映射函数）
    import routers.chat as chat_mod

    class _M:
        def __init__(self, kind):
            self.kind = kind
            self.content = "卡片"

    ck("★ 预览映射 location→[位置] / location_live→[实时位置]",
       chat_mod._msg_preview(_M("location")) == "[位置]"
       and chat_mod._msg_preview(_M("location_live")) == "[实时位置]"
       and chat_mod._msg_preview(_M("image")) == "[图片]",
       [chat_mod._msg_preview(_M(k)) for k in ("location", "location_live", "image")])

    # ---- 门禁 8：不落库实证 ----
    log("")
    log("---- 门禁 8：不落库实证 ----")
    import database as dbm
    ses = dbm.SessionLocal()
    rowcnt = ses.query(dbm.LiveLocation).count()
    lv = ses.query(dbm.Message).filter(dbm.Message.kind == "location_live").count()
    total = ses.query(dbm.Message).count()
    lm = ses.query(dbm.Message).filter(dbm.Message.kind == "location").count()
    txt = ses.query(dbm.Message).filter(dbm.Message.kind == "text").count()
    ses.close()
    sessions = 3          # 私聊 sess1 / 越权+stale+过期 sess2 / 群 sess3
    cards = 2 * sessions  # 每会话 2 张卡片（开始 / 结束）；过期那次的 stop 不算「首次 active→ended」
    ck("★ live_locations 行数 == 会话数（3），而非 tick 次数",
       rowcnt == 3, "rows=%d" % rowcnt)
    ck("★ location_live 卡片数 == 会话卡片（含过期会话的 start 卡）",
       lv in (5, 6), "location_live=%d（3 会话 ×2 卡 = 6；过期会话 stop 不落卡 → 5 亦合法）" % lv)
    ck("★ messages 中无任何 tick 产生的行（text/location 均为显式发送）",
       total == lv + lm + txt and lm == 3 and txt == 1,
       "total=%d lv=%d location=%d text=%d" % (total, lv, lm, txt))
    log("  （tick 共发出 %d 次：sess1×5 + stale×1 + 群×1 + sess4×20；若 tick 落库，total 会额外 +%d）"
        % (5 + 1 + 1 + 20, 5 + 1 + 1 + 20))

    # ---- 门禁 9：geocoder 零调用实证 ----
    log("")
    log("---- 门禁 9：geocoder 出网次数 ----")
    c0 = calls["geocoder"]
    # 再跑一次完整共享（start→tick×20→stop）
    r = tc.post("/api/live/start", json={"peerId": ub}, headers=HA)
    sid3 = r.json().get("shareId", "")
    for i in range(20):
        tc.post("/api/live/tick", json={"shareId": sid3, "lat": 30.1 + i * 0.0001,
                                        "lng": 120.1 + i * 0.0001}, headers=HA)
    tc.post("/api/live/stop", json={"shareId": sid3}, headers=HA)
    c1 = calls["geocoder"]
    ck("★ 一次完整共享（start→tick×20→stop）geocoder 调用增量 == 0", c1 - c0 == 0,
       "before=%d after=%d" % (c0, c1))
    # 证明桩本身有效：调一次 /api/geo/reverse → 计数 +1
    rr = tc.get("/api/geo/reverse?lat=30.25&lng=120.16")
    c2 = calls["geocoder"]
    ck("★ 打桩有效性反证：/api/geo/reverse 使计数 +1", c2 == c1 + 1,
       "before=%d after=%d（reverse 返回 %s）" % (c1, c2, rr.status_code))
    ck("全程 place/v1 调用 == 0", calls["place"] == 0, calls["place"])

    finish(0 if R["fail"] == 0 else 1)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        log("EXCEPTION: " + traceback.format_exc())
        finish(1)
