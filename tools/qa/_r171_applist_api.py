# -*- coding: utf-8 -*-
"""R171-B 后端「已安装应用列表」接口行为级验收（隔离临时库 + TestClient，绝不碰生产数据）。

覆盖矩阵：
  1. 鉴权三态：用户侧 3 条未登录 401；管理侧非管理员 403 / 管理员 200。
  2. 上报：3 条（1 条 icon 超 8192）→ 200 且 saved 正确、超限 icon 落库为 ""；
     再报 2 条 → upsert 覆盖，DB 仍只有 1 行。
  3. 上报 201 条 → 400。
  4. status：无行 → {enabled:True, appCount:0, updatedAt:""}。
  5. toggle：关闭 → {ok,enabled:False} 且 DB apps="[]"、app_count=0；
     关闭后再上报 → saved=0 且 DB 未被写入；再开启 → status.enabled=True。
  6. 管理侧：appCount / updatedAt / apps 逐项断言；审计多一条 user_apps_view；
     不存在的 uid → 404；无行用户 → 默认值。
  7. 隐私红线：本人公开主页 / 他人主页 / 好友搜索 返回均不含 label / pkg / com. / apps。

用法：
    server/.venv/Scripts/python.exe tools/qa/_r171_applist_api.py
结果：
    tools/qa/_r171_applist_api.txt（逐项 PASS/FAIL + 失败原文 + 末行结论）
"""
import json
import os
import sys
import tempfile
import traceback
from urllib.parse import quote

_HERE = os.path.dirname(os.path.abspath(__file__))
_SERVER = os.path.abspath(os.path.join(_HERE, "..", "..", "server"))

_TMP_DB = os.path.join(tempfile.gettempdir(), "r171_applist.sqlite3")
_TMP_DATA = tempfile.mkdtemp(prefix="r171_applist_data_")
if os.path.exists(_TMP_DB):
    os.remove(_TMP_DB)
os.environ["DATABASE_PATH"] = _TMP_DB
os.environ["JWT_SECRET"] = "r171-applist-test-secret"
os.environ["ADMIN_USERNAME"] = "管理员"
os.environ["ADMIN_PASSWORD"] = "admin-test-pw-123"
os.environ["RATE_AUTH_PER_MIN"] = "100000"      # 本验收会多次登录，抬掉限流误伤
os.environ["RATE_GLOBAL_PER_MIN"] = "1000000"
sys.path.insert(0, _SERVER)

from fastapi import FastAPI                      # noqa: E402
from fastapi.testclient import TestClient        # noqa: E402

from database import (AdminOpLog, SessionLocal, User, UserAppList,   # noqa: E402
                      init_db, now_str)
from routers import app_list, auth, feedback_public, friends          # noqa: E402
from routers import users as users_router                            # noqa: E402
from security import hash_password                                   # noqa: E402

OUT, PASS, FAIL = [], [], []


def log(s=""):
    OUT.append(str(s))


def chk(name, cond, detail=""):
    if cond:
        PASS.append(name)
        log("  [PASS] " + name)
    else:
        FAIL.append(name)
        log("  [FAIL] " + name + "  :: " + str(detail)[:600])


def sec(title):
    log("")
    log("=" * 78)
    log(title)
    log("=" * 78)


PW = "Passw0rd@2026"
BIG_ICON = "data:image/png;base64," + ("A" * 9000)   # 远超 8192 上限

# 3 条上报（第 2 条图标超限）
APPS3 = [
    {"label": "测试应用甲", "pkg": "com.xtqa.reporter.app1",
     "icon": "data:image/png;base64,AAA"},
    {"label": "测试应用乙", "pkg": "com.xtqa.reporter.app2", "icon": BIG_ICON},
    {"label": "测试应用丙", "pkg": "com.xtqa.reporter.app3", "icon": ""},
]
# 2 条上报（用于 upsert 覆盖）
APPS2 = [
    {"label": "微信", "pkg": "com.tencent.mm", "icon": "data:image/png;base64,MM"},
    {"label": "QQ", "pkg": "com.tencent.mobileqq", "icon": ""},
]


def mk_user(db, username, nickname, is_admin=False):
    u = User(username=username, password_hash=hash_password(PW), nickname=nickname,
             motto="", avatar=None, created_at=now_str(), is_admin=is_admin)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def login(c, username, password=PW):
    r = c.post("/api/auth/login", json={"username": username, "password": password})
    if r.status_code != 200:
        return None, r
    d = r.json() or {}
    return (d.get("token") or d.get("accessToken") or d.get("access_token") or ""), r


def H(tok):
    return {"Authorization": "Bearer " + tok}


def HJ(tok):
    return {"Authorization": "Bearer " + tok, "Content-Type": "application/json"}


def main():
    init_db()
    # 免登录反馈存储指向临时目录（绝不动 server/data/feedback.json）
    feedback_public.DATA_FILE = type(feedback_public.DATA_FILE)(
        os.path.join(_TMP_DATA, "feedback.json"))

    db = SessionLocal()
    admin_u = mk_user(db, "管理员", "管理员", is_admin=True)
    A = mk_user(db, "reporter_a", "上报者甲")
    B = mk_user(db, "plain_b", "旁观者乙")
    A_id, B_id, ADMIN_id = A.id, B.id, admin_u.id
    db.close()

    app = FastAPI()
    for r_ in (auth.router, users_router.router, friends.router,
               app_list.router, app_list.router_admin):
        app.include_router(r_)
    c = TestClient(app, raise_server_exceptions=False)

    tok_admin, _ = login(c, "管理员")
    tok_A, _ = login(c, "reporter_a")
    tok_B, _ = login(c, "plain_b")
    chk("夹具登录：管理员 / reporter_a / plain_b 全部拿到令牌",
        all([tok_admin, tok_A, tok_B]),
        "admin=%s A=%s B=%s" % (bool(tok_admin), bool(tok_A), bool(tok_B)))
    if not all([tok_admin, tok_A, tok_B]):
        raise SystemExit("夹具登录失败，终止")

    # ======================================================================
    sec("1. 鉴权三态")
    r = c.post("/api/user/app-list", json={"apps": APPS3})
    chk("1a POST /api/user/app-list 未登录 → 401", r.status_code == 401, r.status_code)
    r = c.post("/api/user/app-list/toggle", json={"enabled": True})
    chk("1b POST /api/user/app-list/toggle 未登录 → 401", r.status_code == 401, r.status_code)
    r = c.get("/api/user/app-list/status")
    chk("1c GET /api/user/app-list/status 未登录 → 401", r.status_code == 401, r.status_code)
    r = c.get("/api/admin/users/%d/apps" % A_id, headers=H(tok_B))
    chk("1d GET /api/admin/users/{uid}/apps 非管理员 → 403", r.status_code == 403, r.status_code)
    r = c.get("/api/admin/users/%d/apps" % A_id)
    chk("1e GET /api/admin/users/{uid}/apps 未登录 → 401", r.status_code == 401, r.status_code)
    r = c.get("/api/admin/users/%d/apps" % A_id, headers=H(tok_admin))
    chk("1f GET /api/admin/users/{uid}/apps 管理员 → 200", r.status_code == 200, r.text[:200])

    # ======================================================================
    sec("4. status：无行默认开启（旁观者 B 从未上报）")
    r = c.get("/api/user/app-list/status", headers=H(tok_B))
    d = r.json() or {}
    chk("4a 无行 status → enabled=True",
        r.status_code == 200 and d.get("enabled") is True, r.text[:200])
    chk("4b 无行 status → appCount=0", d.get("appCount") == 0, d.get("appCount"))
    chk("4c 无行 status → updatedAt=''", d.get("updatedAt") == "", repr(d.get("updatedAt")))

    # ======================================================================
    sec("2. 上报（含超限图标）")
    r = c.post("/api/user/app-list", headers=HJ(tok_A),
               json={"apps": APPS3, "appCount": 187, "truncated": False, "iconDropped": False})
    chk("2a 上报 3 条 → 200 且 saved=3",
        r.status_code == 200 and (r.json() or {}).get("saved") == 3, r.text[:200])
    chk("2b 返回 updatedAt 非空", bool((r.json() or {}).get("updatedAt")), r.text[:200])
    db = SessionLocal()
    row = db.get(UserAppList, A_id)
    stored = json.loads(row.apps) if row else []
    chk("2c DB 落库 3 条", len(stored) == 3, (row.apps[:200] if row else "NO_ROW"))
    chk("2d 超限 icon 落库为 ''", bool(stored) and stored[1].get("icon") == "",
        repr(stored[1].get("icon") if len(stored) > 1 else None)[:120])
    chk("2e app_count = 请求 appCount(187)", row is not None and row.app_count == 187,
        (row.app_count if row else None))
    chk("2f enabled 置回 True", row is not None and row.enabled is True,
        (row.enabled if row else None))
    db.close()

    # upsert 覆盖
    r = c.post("/api/user/app-list", headers=HJ(tok_A), json={"apps": APPS2})
    chk("2g 再上报 2 条 → saved=2",
        r.status_code == 200 and (r.json() or {}).get("saved") == 2, r.text[:200])
    db = SessionLocal()
    cnt = db.query(UserAppList).filter(UserAppList.user_id == A_id).count()
    row = db.get(UserAppList, A_id)
    stored = json.loads(row.apps) if row else []
    chk("2h upsert 后 DB 仍只有 1 行", cnt == 1, cnt)
    chk("2i 覆盖后 apps 为 2 条", len(stored) == 2, (row.apps[:200] if row else "NO_ROW"))
    chk("2j appCount 缺省取 len(apps)=2", row is not None and row.app_count == 2,
        (row.app_count if row else None))
    db.close()

    # ======================================================================
    sec("3. 数量上限")
    many = [{"label": "a%d" % i, "pkg": "com.x.p%d" % i, "icon": ""} for i in range(201)]
    r = c.post("/api/user/app-list", headers=HJ(tok_A), json={"apps": many})
    chk("3a 上报 201 条 → 400", r.status_code == 400, "%s %s" % (r.status_code, r.text[:200]))
    r = c.post("/api/user/app-list", headers=HJ(tok_A), json={"apps": "notarray"})
    chk("3b apps 非数组 → 400", r.status_code == 400, "%s %s" % (r.status_code, r.text[:200]))

    # ======================================================================
    sec("6. 管理侧查看某用户应用列表")
    db = SessionLocal()
    n_before = db.query(AdminOpLog).filter(AdminOpLog.action == "user_apps_view").count()
    db.close()

    r = c.get("/api/admin/users/%d/apps" % A_id, headers=H(tok_admin))
    d = r.json() or {}
    chk("6a 管理员查看 → 200", r.status_code == 200, r.text[:200])
    chk("6b userId/username/nickname 正确",
        d.get("userId") == A_id and d.get("username") == "reporter_a"
        and d.get("nickname") == "上报者甲", json.dumps(d, ensure_ascii=False)[:300])
    chk("6c appCount=2", d.get("appCount") == 2, d.get("appCount"))
    chk("6d updatedAt 非空", bool(d.get("updatedAt")), repr(d.get("updatedAt")))
    chk("6e enabled=True", d.get("enabled") is True, d.get("enabled"))
    chk("6f apps 逐项匹配（含包名/图标原样透传）", d.get("apps") == APPS2,
        json.dumps(d.get("apps"), ensure_ascii=False)[:400])
    db = SessionLocal()
    n_after = db.query(AdminOpLog).filter(AdminOpLog.action == "user_apps_view").count()
    last = (db.query(AdminOpLog).filter(AdminOpLog.action == "user_apps_view")
            .order_by(AdminOpLog.id.desc()).first())
    db.close()
    chk("6g 查看后审计 +1 条 user_apps_view", n_after == n_before + 1,
        "before=%s after=%s" % (n_before, n_after))
    chk("6g2 审计行 target_type='user' 且 target_id=uid",
        bool(last) and last.target_type == "user" and last.target_id == A_id,
        "%s / %s" % (getattr(last, "target_type", None), getattr(last, "target_id", None)))

    r = c.get("/api/admin/users/999999/apps", headers=H(tok_admin))
    chk("6h 不存在的 uid → 404", r.status_code == 404, "%s %s" % (r.status_code, r.text[:200]))

    r = c.get("/api/admin/users/%d/apps" % B_id, headers=H(tok_admin))
    d = r.json() or {}
    chk("6i 无上报记录用户 → enabled True/appCount 0/updatedAt ''/apps []",
        d.get("enabled") is True and d.get("appCount") == 0
        and d.get("updatedAt") == "" and d.get("apps") == [],
        json.dumps(d, ensure_ascii=False)[:300])
    db = SessionLocal()
    n_after2 = db.query(AdminOpLog).filter(AdminOpLog.action == "user_apps_view").count()
    db.close()
    chk("6j 再查看一次 → 审计再 +1（累计 +2）", n_after2 == n_before + 2,
        "before=%s now=%s" % (n_before, n_after2))

    # ======================================================================
    sec("5. 开关（关闭清空 / 关闭后不写入 / 再开启）")
    r = c.post("/api/user/app-list/toggle", headers=HJ(tok_A), json={"enabled": False})
    chk("5a 关闭 → {ok:true, enabled:false}",
        r.status_code == 200 and (r.json() or {}).get("enabled") is False, r.text[:200])
    db = SessionLocal()
    row = db.get(UserAppList, A_id)
    chk("5b 关闭后 DB apps='[]'", row is not None and row.apps == "[]",
        (row.apps[:100] if row else "NO_ROW"))
    chk("5c 关闭后 app_count=0", row is not None and row.app_count == 0,
        (row.app_count if row else None))
    chk("5d 关闭后 enabled=False", row is not None and row.enabled is False,
        (row.enabled if row else None))
    db.close()

    r = c.post("/api/user/app-list", headers=HJ(tok_A), json={"apps": APPS3, "appCount": 3})
    chk("5e 关闭后上报 → saved=0 (ok:true)",
        r.status_code == 200 and (r.json() or {}).get("saved") == 0, r.text[:200])
    db = SessionLocal()
    row = db.get(UserAppList, A_id)
    chk("5f 关闭后上报 DB 未被写入（apps 仍 '[]'、app_count 仍 0）",
        row is not None and row.apps == "[]" and row.app_count == 0,
        "apps=%s count=%s" % (row.apps[:80] if row else "NO_ROW",
                              (row.app_count if row else None)))
    db.close()

    r = c.post("/api/user/app-list/toggle", headers=HJ(tok_A), json={"enabled": True})
    chk("5g 再开启 → enabled=true",
        r.status_code == 200 and (r.json() or {}).get("enabled") is True, r.text[:200])
    r = c.get("/api/user/app-list/status", headers=H(tok_A))
    chk("5h 再开启后 status.enabled=true",
        r.status_code == 200 and (r.json() or {}).get("enabled") is True, r.text[:200])

    # ======================================================================
    sec("7. 隐私红线（普通接口不得泄露应用列表）")
    # 重新上报，确保库内有真实数据
    c.post("/api/user/app-list", headers=HJ(tok_A), json={"apps": APPS3, "appCount": 3})
    FORBID = ["label", "pkg", "com.", "apps", "xtqa", "测试应用甲"]
    checks = [
        ("7a 本人公开主页", "/api/users/%d" % A_id, tok_A),
        ("7b 他人看其主页", "/api/users/%d" % A_id, tok_B),
        ("7c 好友搜索", "/api/friends/search?q=" + quote("上报者甲"), tok_B),
    ]
    for label, url, tok in checks:
        r = c.get(url, headers=H(tok))
        body = r.text or ""
        hits = [t for t in FORBID if t in body]
        chk("%s 无 label/pkg/com./apps 泄露" % label,
            r.status_code == 200 and not hits,
            "status=%s hits=%s body=%s" % (r.status_code, hits, body[:300]))

    # ======================================================================
    log("")
    log("=" * 78)
    log("PASS: %d  FAIL: %d" % (len(PASS), len(FAIL)))
    if FAIL:
        log("失败项清单：")
        for f in FAIL:
            log("  - " + f)
    log("R171_APPLIST_API_" + ("ALL_PASS" if not FAIL else "HAS_FAIL"))
    log("=" * 78)
    with open(os.path.join(_HERE, "_r171_applist_api.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(OUT) + "\nR171_APPLIST_API_DONE\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        OUT.append("")
        OUT.append("!! 脚本级异常（非断言失败）：")
        OUT.append(traceback.format_exc())
        OUT.append("PASS: %d  FAIL: %d" % (len(PASS), len(FAIL) + 1))
        OUT.append("R171_APPLIST_API_HAS_FAIL")
        with open(os.path.join(_HERE, "_r171_applist_api.txt"), "w", encoding="utf-8") as fh:
            fh.write("\n".join(OUT) + "\nR171_APPLIST_API_DONE\n")
        raise
