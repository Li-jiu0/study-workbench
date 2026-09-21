# -*- coding: utf-8 -*-
"""T04 后端增量（群设置 · 2026-09-11）冒烟验证。

覆盖架构文档 T04 验收点：
  [1] GET /api/groups/{gid}：无公告默认 ''、myRole/myGroupNickname、members[].groupNickname 齐备；
      成员项无 privacy/phone/gender/birthday（红线）；旧字段（id/name/ownerId/avatar/createdAt）不回归
  [2] PATCH /api/groups/{gid}：仅群主可改（成员/非成员 403）；部分更新；空名/超长名/超长公告 400（中文文案）
  [3] 改群名/公告后其他成员拉取即见（无推送依赖，靠下次拉取）
  [4] PATCH /api/groups/{gid}/me：设群名片；空串清除回退全局昵称；>20 字 400；非成员 403
  [5] 群名片序列化：设置后双方消息 senderNickname 均为群名片；清空回退全局昵称；头像恒全局
  [6] 404 群不存在

自足运行：复制 server/ 到临时目录 → 起 uvicorn → 跑 HTTP → 杀进程。报告写入脚本同目录 _ed_smoke_t04_report.txt。

用法：
    set PYTHONPATH=C:\\Users\\ATM\\.workbuddy\\binaries\\python\\envs\\xingtu-backend\\Lib\\site-packages
    "C:\\Users\\ATM\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe" tools/qa/ed_smoke_t04_0911.py
退出码：0 全过；1 有 FAIL；2 前置不满足。
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

try:
    import httpx
except ImportError:  # pragma: no cover
    print("需要 httpx：请先 pip install httpx")
    sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SERVER_SRC = os.path.join(REPO, "server")
PORT = int(os.environ.get("SW_PORT", "8898"))
BASE = "http://127.0.0.1:%d" % PORT
TIMEOUT = float(os.environ.get("SW_TIMEOUT", "30"))

PASS = 0
FAIL = 0
FAILED_NAMES: list[str] = []
REPORT_PATH = os.path.join(HERE, "_ed_smoke_t04_report.txt")


def log(line: str = "") -> None:
    print(line)
    try:
        with open(REPORT_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:  # noqa: BLE001
        pass


def section(title: str) -> None:
    log("\n========== %s ==========" % title)


def ck(label: str, cond, detail="") -> bool:
    global PASS, FAIL
    ok = bool(cond)
    if ok:
        PASS += 1
    else:
        FAIL += 1
        FAILED_NAMES.append(label)
    line = ("  OK  " if ok else "  FAIL") + " " + label
    if detail != "":
        line += "  -> " + str(detail)
    log(line)
    return ok


def hdr(tok: str) -> dict:
    return {"Authorization": "Bearer " + tok}


def client() -> "httpx.Client":
    return httpx.Client(base_url=BASE, timeout=TIMEOUT, trust_env=False)


def _kill(proc) -> None:
    if proc is None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=10)
    except Exception:  # noqa: BLE001
        try:
            proc.kill()
        except Exception:  # noqa: BLE001
            pass


def run_http(work: str, env: dict) -> None:
    proc = None
    c = client()
    try:
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app",
             "--host", "127.0.0.1", "--port", str(PORT), "--log-level", "warning"],
            cwd=work, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        section("[B0] 服务可达性")
        up = False
        for _ in range(80):
            if proc.poll() is not None:
                break
            try:
                if c.get("/api/health").status_code == 200:
                    up = True
                    break
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.5)
        if not up:
            out = ""
            try:
                out = (proc.stdout.read() or "")[-600:] if proc.stdout else ""
            except Exception:  # noqa: BLE001
                pass
            log("  服务未能就绪；uvicorn 输出：\n%s" % out)
            ck("uvicorn 就绪", False, "服务不可达")
            return
        ck("GET /api/health → 200", True, BASE)

        suffix = uuid.uuid4().hex[:6]

        def reg(tag: str, nick: str):
            r = c.post("/api/auth/register",
                       json={"username": tag + suffix, "password": "pass1234",
                             "nickname": nick + suffix})
            body = r.json() if r.status_code == 200 else {}
            return body.get("token", ""), (body.get("user") or {}).get("id", 0)

        def befriend(a_tok, a_uid, b_tok, b_uid):
            r = c.post("/api/friends/requests", json={"toUserId": b_uid}, headers=hdr(a_tok))
            rid = (r.json().get("requestId") if r.status_code == 200 else 0) or 0
            if rid:
                c.post("/api/friends/requests/%d/accept" % rid, headers=hdr(b_tok))

        tokO, uidO = reg("gdo", "群主")
        tokA, uidA = reg("gda", "成员甲")
        tokB, uidB = reg("gdb", "成员乙")
        tokX, uidX = reg("gdx", "外人")
        befriend(tokO, uidO, tokA, uidA)
        befriend(tokO, uidO, tokB, uidB)
        ck("四账号就绪（群主/两成员/外人）",
           all([tokO, tokA, tokB, tokX]) and all([uidO, uidA, uidB, uidX]))

        # 建群（memberIds 至少 2 个 → 群主 + 甲 + 乙）
        r = c.post("/api/groups", json={"name": "初始群名", "memberIds": [uidA, uidB]},
                   headers=hdr(tokO))
        ck("建群 → 200", r.status_code == 200, r.text[:120])
        gid = (r.json().get("id") if r.status_code == 200 else 0) or 0
        ck("建群返回 groupId", gid > 0, gid)

        # ---------- [1] GET /{gid} 新字段 + 红线 ----------
        section("[1] GET /api/groups/{gid} 新字段齐备 + 成员无隐私字段 + 旧字段不回归")
        d = c.get("/api/groups/%d" % gid, headers=hdr(tokO))
        ck("GET /{gid} → 200", d.status_code == 200, d.status_code)
        dj = d.json() if d.status_code == 200 else {}
        ck("含 announcement（默认 ''）", dj.get("announcement") == "", dj.get("announcement"))
        ck("含 myRole（群主=owner）", dj.get("myRole") == "owner", dj.get("myRole"))
        ck("含 myGroupNickname（默认 ''）", dj.get("myGroupNickname") == "", dj.get("myGroupNickname"))
        members = dj.get("members", [])
        ck("members 每项含 groupNickname",
           bool(members) and all("groupNickname" in m for m in members),
           [sorted(m.keys()) for m in members][:1])
        ck("旧字段不回归（id/name/ownerId/avatar/createdAt）",
           all(k in dj for k in ("id", "name", "ownerId", "avatar", "createdAt")))
        ck("成员项保留 role/joinedAt",
           bool(members) and all(("role" in m and "joinedAt" in m) for m in members))
        leak = [k for m in members for k in ("privacy", "phone", "gender", "birthday") if k in m]
        ck("成员项无 privacy/phone/gender/birthday（逐字段）", not leak, leak)
        ck("响应体不含隐私字段串",
           all(('"%s"' % k) not in d.text for k in ("phone", "gender", "birthday", "privacy")))

        # ---------- [2] PATCH /{gid} 权限 + 校验 ----------
        section("[2] PATCH /api/groups/{gid}：权限 403 + 校验 400")
        r = c.patch("/api/groups/%d" % gid, json={"name": "成员改名"}, headers=hdr(tokA))
        ck("成员改群名 → 403", r.status_code == 403, r.status_code)
        ck("403 文案=仅群主/管理员可以修改", "仅群主/管理员可以修改" in r.text, r.text[:120])
        r = c.patch("/api/groups/%d" % gid, json={"name": "外人改名"}, headers=hdr(tokX))
        ck("非成员改群名 → 403", r.status_code == 403, r.status_code)
        ck("非成员 403 文案=你不是该群成员", "你不是该群成员" in r.text, r.text[:120])

        r = c.patch("/api/groups/%d" % gid, json={"name": ""}, headers=hdr(tokO))
        ck("空群名 → 400", r.status_code == 400, r.status_code)
        ck("空群名文案=群名称不能为空", "群名称不能为空" in r.text, r.text[:120])
        r = c.patch("/api/groups/%d" % gid, json={"name": "字" * 21}, headers=hdr(tokO))
        ck("群名 21 字 → 400", r.status_code == 400, r.status_code)
        ck("超长群名文案=群名称最长 20 字", "群名称最长 20 字" in r.text, r.text[:120])
        r = c.patch("/api/groups/%d" % gid, json={"announcement": "字" * 301}, headers=hdr(tokO))
        ck("公告 301 字 → 400", r.status_code == 400, r.status_code)
        ck("超长公告文案=公告最长 300 字", "公告最长 300 字" in r.text, r.text[:120])

        r = c.patch("/api/groups/%d" % gid, json={"name": "冲刺小组", "announcement": "每日打卡"},
                    headers=hdr(tokO))
        ck("群主改群名+公告 → 200", r.status_code == 200, r.status_code)
        rj = r.json() if r.status_code == 200 else {}
        ck("返回 {id,name,announcement} 且已更新",
           rj.get("name") == "冲刺小组" and rj.get("announcement") == "每日打卡", rj)

        # 部分更新：只传 announcement 不动 name
        r = c.patch("/api/groups/%d" % gid, json={"announcement": "只改公告"}, headers=hdr(tokO))
        ck("部分更新：只传 announcement 不改名",
           r.status_code == 200 and r.json().get("name") == "冲刺小组"
           and r.json().get("announcement") == "只改公告", r.json())

        # ---------- [3] 其他成员拉取即见 ----------
        section("[3] 改群名/公告后成员拉取即见")
        dA = c.get("/api/groups/%d" % gid, headers=hdr(tokA))
        djA = dA.json() if dA.status_code == 200 else {}
        ck("成员拉取见新群名", djA.get("name") == "冲刺小组", djA.get("name"))
        ck("成员拉取见公告", djA.get("announcement") == "只改公告", djA.get("announcement"))
        ck("成员视角 myRole=member", djA.get("myRole") == "member", djA.get("myRole"))

        # ---------- [4] PATCH /{gid}/me 群名片 ----------
        section("[4] PATCH /api/groups/{gid}/me 群名片读写 + 校验")
        r = c.patch("/api/groups/%d/me" % gid, json={"groupNickname": "冲刺君"},
                    headers=hdr(tokA))
        ck("设群名片 → 200", r.status_code == 200, r.status_code)
        ck("返回 groupNickname=冲刺君", r.json().get("groupNickname") == "冲刺君", r.json())
        ck("成员自见 myGroupNickname=冲刺君",
           c.get("/api/groups/%d" % gid, headers=hdr(tokA)).json().get("myGroupNickname") == "冲刺君")
        r = c.patch("/api/groups/%d/me" % gid, json={"groupNickname": "字" * 21}, headers=hdr(tokA))
        ck("群名片 21 字 → 400", r.status_code == 400, r.status_code)
        ck("文案=群昵称最长 20 字", "群昵称最长 20 字" in r.text, r.text[:120])
        r = c.patch("/api/groups/%d/me" % gid, json={"groupNickname": "x"}, headers=hdr(tokX))
        ck("非成员设群名片 → 403", r.status_code == 403, r.status_code)

        # ---------- [5] 群名片序列化 ----------
        section("[5] 群名片序列化：设置后双方消息昵称为群名片；清空回退全局")
        r = c.post("/api/groups/%d/messages" % gid, json={"content": "甲发言1", "kind": "text"},
                   headers=hdr(tokA))
        ck("成员发消息 → 200", r.status_code == 200, r.status_code)
        ck("发送响应 senderNickname=群名片（冲刺君）",
           r.json().get("senderNickname") == "冲刺君", r.json().get("senderNickname"))
        # 群主视角读取，昵称也应是群名片
        r = c.get("/api/groups/%d/messages" % gid, headers=hdr(tokO))
        items = r.json().get("items", []) if r.status_code == 200 else []
        got = [m for m in items if m.get("content") == "甲发言1"]
        ck("群主读取同一条：senderNickname=冲刺君",
           bool(got) and got[0].get("senderNickname") == "冲刺君",
           got[0].get("senderNickname") if got else "no-msg")
        ck("senderAvatar 恒为全局头像字段（存在）", bool(got) and "senderAvatar" in got[0])

        # 清空群名片 → 回退全局昵称
        r = c.patch("/api/groups/%d/me" % gid, json={"groupNickname": ""}, headers=hdr(tokA))
        ck("清空群名片 → 200 且返回 ''", r.status_code == 200 and r.json().get("groupNickname") == "",
           r.json())
        r = c.post("/api/groups/%d/messages" % gid, json={"content": "甲发言2", "kind": "text"},
                   headers=hdr(tokA))
        ck("清空后 senderNickname 回退全局昵称（成员甲%s）" % suffix,
           r.json().get("senderNickname") == "成员甲" + suffix, r.json().get("senderNickname"))

        # 群主自己设群名片，自己发消息
        c.patch("/api/groups/%d/me" % gid, json={"groupNickname": "带头大哥"}, headers=hdr(tokO))
        r = c.post("/api/groups/%d/messages" % gid, json={"content": "群主发言", "kind": "text"},
                   headers=hdr(tokO))
        ck("群主发消息 senderNickname=带头大哥",
           r.json().get("senderNickname") == "带头大哥", r.json().get("senderNickname"))

        # ---------- [6] 404 ----------
        section("[6] 群不存在 → 404")
        r = c.patch("/api/groups/99999999", json={"name": "x"}, headers=hdr(tokO))
        ck("PATCH 不存在群 → 404", r.status_code == 404, r.status_code)
        ck("404 文案=群不存在或已解散", "群不存在或已解散" in r.text, r.text[:120])
        r = c.patch("/api/groups/99999999/me", json={"groupNickname": "x"}, headers=hdr(tokO))
        ck("PATCH /me 不存在群 → 404", r.status_code == 404, r.status_code)

        # ---------- [7] 旧接口回归 ----------
        section("[7] 旧接口非破坏回归")
        ck("GET /api/groups 列表仍 200",
           c.get("/api/groups", headers=hdr(tokO)).status_code == 200)
        ck("GET /{gid}/messages 仍 200",
           c.get("/api/groups/%d/messages" % gid, headers=hdr(tokO)).status_code == 200)
        ck("非成员 GET /{gid} → 403",
           c.get("/api/groups/%d" % gid, headers=hdr(tokX)).status_code == 403)
    finally:
        _kill(proc)
        try:
            c.close()
        except Exception:  # noqa: BLE001
            pass
        log("\n  [清理] uvicorn 进程已终止")


def main() -> int:
    try:
        with open(REPORT_PATH, "w", encoding="utf-8"):
            pass
    except Exception:  # noqa: BLE001
        pass
    log("T04 后端冒烟（群设置）· 隔离副本模式")
    tmp_root = tempfile.mkdtemp(prefix="ed_t04_")
    work = os.path.join(tmp_root, "server")
    try:
        shutil.copytree(
            SERVER_SRC, work,
            ignore=shutil.ignore_patterns(".venv", "*.db", "*.db-*", ".env",
                                          "uploads", "__pycache__", "*.pyc"))
        with open(os.path.join(work, ".env"), "w", encoding="utf-8") as f:
            f.write("JWT_SECRET=ed-t04-smoke-secret\n")
        env = os.environ.copy()
        env["JWT_SECRET"] = "ed-t04-smoke-secret"
        env["DATABASE_PATH"] = "data.db"
        env["RATE_AUTH_PER_MIN"] = "100"
        log("隔离副本：%s" % work)
        run_http(work, env)
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)

    total = PASS + FAIL
    log("\n========== 汇总 ==========")
    log("通过 %d / %d 项，失败 %d 项" % (PASS, total, FAIL))
    if FAILED_NAMES:
        log("失败用例：")
        for n in FAILED_NAMES:
            log("  - " + n)
    return 1 if FAIL else 0


if __name__ == "__main__":
    try:
        _rc = main()
    except Exception:  # noqa: BLE001
        import traceback

        with open(REPORT_PATH, "a", encoding="utf-8") as _f:
            _f.write("CRASH:\n" + traceback.format_exc())
        _rc = 3
    sys.exit(_rc)
