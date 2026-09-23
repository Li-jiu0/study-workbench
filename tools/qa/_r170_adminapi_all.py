# -*- coding: utf-8 -*-
"""R170 管理员后端「全路由 + 副作用真伪」行为级验收（隔离临时库 + TestClient，绝不碰生产数据）。

为什么有这个脚本：原派的 QA-1 因模型配额 429 中断，核心验收不能缺位，由主会话接手自写。

验收矩阵（对应需求 R170）：
  A. 鉴权三态：admin_ops 全部 47 条路由 × （未登录 401 / 非管理员 403 / 管理员 2xx）
     —— 两条 router_public（/api/announcements）非管理员应为 2xx（只要求登录），单独标注。
  B. 用户治理副作用真伪：封禁→登录 403；解封→恢复；禁言→发内容 403 且到期恢复；
     踢下线→旧令牌 401；重置密码→旧密码失败/新密码成功/旧令牌失效；改资料→落库；
     彻底删除→逐表断言关联行归零 + feedbacks.user_id 置 NULL 且行仍在 + 审计落 user_delete +
       确认文本不匹配时不删任何数据 + 不能删自己/其他管理员 + 异常路径 rollback（monkeypatch 触发）。
  C. 内容治理副作用：隐藏/取消隐藏/删除，**真打公开接口**验证（动态 feed / 动态评论 / 笔记详情 / 留言板 / 留言回复）。
  D. 公告：发布 → 公开接口可见；已读 → 未读位变化；改/删生效。
  E. 群组：成员列表；移除成员后该成员拿不到群详情、发不了群消息；解散后群/成员/消息清空。
  F. 私聊审计：会话列表/正文/搜索能取到真实内容；管理员删单条后普通用户接口查不到。
  G. 审计日志：抽查 7 类动作是否落库。
  H. 隐身开关：现身后普通用户可见（公开主页 200 / 可被搜到）；隐身后不可见（404 / 搜不到）。

用法：
    server/.venv/Scripts/python.exe tools/qa/_r170_adminapi_all.py
结果：tools/qa/_r170_adminapi_all.txt（逐项 PASS/FAIL + 失败项请求响应原文 + 末行结论）
"""
import datetime
import json
import os
import sys
import tempfile
import traceback

_HERE = os.path.dirname(os.path.abspath(__file__))
_SERVER = os.path.abspath(os.path.join(_HERE, "..", "..", "server"))

_TMP_DB = os.path.join(tempfile.gettempdir(), "r170_adminapi.sqlite3")
_TMP_DATA = tempfile.mkdtemp(prefix="r170_api_data_")
if os.path.exists(_TMP_DB):
    os.remove(_TMP_DB)
os.environ["DATABASE_PATH"] = _TMP_DB
os.environ["JWT_SECRET"] = "r170-api-test-secret"
os.environ["ADMIN_USERNAME"] = "管理员"
os.environ["ADMIN_PASSWORD"] = "admin-test-pw-123"
os.environ["RATE_AUTH_PER_MIN"] = "100000"     # 本验收会多次登录，抬掉限流误伤
os.environ["RATE_GLOBAL_PER_MIN"] = "1000000"
sys.path.insert(0, _SERVER)

from fastapi import FastAPI                      # noqa: E402
from fastapi.testclient import TestClient        # noqa: E402

import database                                  # noqa: E402
from database import (AdminOpLog, AiLog, AiUsage, Announcement, BoardLike,   # noqa: E402
                      BoardMessage, BoardReply, ChatGroup, ChatGroupMember,
                      Comment, EmailCode, Favorite, Feedback, Friend,
                      FriendRemark, FriendRequest, Like, LiveLocation, Message,
                      Moment, MomentComment, MomentLike, Note, Notification,
                      SessionLocal, StudyLog, User, UserAppList, UserAppSig,
                      UserBlock, UserDevice, init_db, now_iso, now_str)
from routers.moments import MomentCommentMeta, MomentMeta    # noqa: E402
from routers import (admin, admin_ops, app_list, auth, chat,  # noqa: E402
                     feedback, feedback_public, friends, groups, moments,
                     notes, social)
from routers import users as users_router        # noqa: E402
from security import hash_password               # noqa: E402

OUT = []
PASS = []
FAIL = []
UNVERIFIED = []


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


# ==========================================================================
# 环境与夹具
# ==========================================================================
PW = "Passw0rd@2026"


def mk_user(db, username, nickname, account=None, is_admin=False, mv=None):
    u = User(username=username, password_hash=hash_password(PW), nickname=nickname,
             motto="", avatar=None, created_at=now_str(), is_admin=is_admin)
    if account:
        u.account = account
    if mv:
        u.moment_visibility = mv
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def build_fixtures():
    """造出「数据丰富的用户 A」+ 控件用户，供删除级联与三态矩阵使用。"""
    db = SessionLocal()
    F = {}
    F["admin"] = mk_user(db, "管理员", "管理员", is_admin=True)
    F["adm2"] = mk_user(db, "admin2_x", "管理员二号", is_admin=True)
    F["A"] = mk_user(db, "rich_user", "富数据用户", account="rich001")
    F["B"] = mk_user(db, "friend_b", "好友B")
    F["C"] = mk_user(db, "plain_c", "普通C")
    F["G1"] = mk_user(db, "gov_ban", "封禁对象")
    F["G2"] = mk_user(db, "gov_mute", "禁言对象")
    F["G3"] = mk_user(db, "gov_kick", "踢线对象")
    F["G4"] = mk_user(db, "gov_pwd", "改密对象")
    F["MX"] = mk_user(db, "mx_user", "矩阵对象")
    F["DC"] = mk_user(db, "discard_c", "一次性内容作者", mv="public")
    a, b, c, dc = F["A"], F["B"], F["C"], F["DC"]

    # 好友 / 申请 / 备注 / 拉黑
    db.add(Friend(user_a=min(a.id, b.id), user_b=max(a.id, b.id), created_at=now_iso()))
    db.add(Friend(user_a=min(c.id, dc.id), user_b=max(c.id, dc.id), created_at=now_iso()))
    db.add(FriendRequest(from_user_id=a.id, to_user_id=c.id, status="pending", created_at=now_iso()))
    db.add(FriendRequest(from_user_id=c.id, to_user_id=a.id, status="pending", created_at=now_iso()))
    db.add(FriendRemark(owner_id=a.id, peer_id=b.id, remark="小B", updated_at=now_iso()))
    db.add(UserBlock(blocker_id=a.id, blocked_id=c.id, created_at=now_iso()))

    # 笔记域（A 的笔记 + B 的赞/藏/评）
    n1 = Note(user_id=a.id, title="A的笔记一", category="other", privacy="public",
              status="published", tags="[]", content="正文一", excerpt="摘",
              created_at=now_str(), updated_at=now_str())
    n2 = Note(user_id=a.id, title="A的草稿二", category="other", privacy="private",
              status="draft", tags="[]", content="正文二", excerpt="摘",
              created_at=now_str(), updated_at=now_str())
    db.add_all([n1, n2])
    db.commit()
    db.add_all([
        Like(note_id=n1.id, user_id=b.id, created_at=now_str()),
        Favorite(note_id=n1.id, user_id=b.id, created_at=now_str()),
        Comment(note_id=n1.id, user_id=a.id, content="自评", parent_id=None, created_at=now_str()),
        Comment(note_id=n1.id, user_id=b.id, content="B的评论", parent_id=None, created_at=now_str()),
    ])

    # 动态域
    m1 = Moment(user_id=a.id, content="A的动态一", images="[]", created_at=now_iso())
    m2 = Moment(user_id=a.id, content="A的动态二", images="[]", created_at=now_iso())
    db.add_all([m1, m2])
    db.commit()
    db.add(MomentMeta(moment_id=m1.id, vis_scope="", vis_ids="[]"))
    mc_a = MomentComment(moment_id=m1.id, user_id=a.id, content="A自评动态", created_at=now_iso())
    db.add(mc_a)
    db.commit()
    db.add(MomentCommentMeta(comment_id=mc_a.id, parent_id=0))
    db.add_all([
        MomentComment(moment_id=m1.id, user_id=b.id, content="B评动态", created_at=now_iso()),
        MomentLike(moment_id=m1.id, user_id=b.id, created_at=now_iso()),
    ])

    # 留言板域
    bm = BoardMessage(user_id=a.id, content="A的留言", created_at=now_str())
    db.add(bm)
    db.commit()
    db.add_all([
        BoardLike(message_id=bm.id, user_id=b.id, created_at=now_str()),
        BoardReply(message_id=bm.id, user_id=b.id, content="B的回复", created_at=now_str()),
        BoardReply(message_id=bm.id, user_id=a.id, content="A的回复", created_at=now_str()),
    ])

    # 私聊 + 群聊
    db.add_all([
        Message(sender_id=a.id, receiver_id=b.id, kind="text", content="hello from A",
                sub="", precise=False, created_at=now_iso()),
        Message(sender_id=b.id, receiver_id=a.id, kind="text", content="hello from B",
                sub="", precise=False, created_at=now_iso()),
    ])
    g = ChatGroup(name="A的群", owner_id=a.id, announcement="", created_at=now_iso())
    db.add(g)
    db.commit()
    db.add_all([
        ChatGroupMember(group_id=g.id, user_id=a.id, role="owner", joined_at=now_iso()),
        ChatGroupMember(group_id=g.id, user_id=b.id, role="member", joined_at=now_iso()),
        Message(sender_id=a.id, receiver_id=0, group_id=g.id, kind="text",
                content="群消息一", sub="", precise=False, created_at=now_iso()),
    ])

    # 通知 / 学习 / AI / 邮箱码 / 设备 / 应用指纹 / 实时位置
    db.add_all([
        Notification(user_id=a.id, actor_id=b.id, type="like", note_id=n1.id,
                     is_read=False, created_at=now_str()),
        Notification(user_id=b.id, actor_id=a.id, type="like", note_id=n1.id,
                     is_read=False, created_at=now_str()),
        StudyLog(user_id=a.id, module="cet4", event="answer", payload="{}", created_at=now_iso()),
        AiUsage(user_id=a.id, day="2026-09-23", count=3),
        AiLog(user_id=a.id, role="user", content="问", provider="", created_at=now_iso()),
        EmailCode(email="rich@example.com", code_hash="x", purpose="bind", user_id=a.id,
                  expires_at=datetime.datetime.now(), used=False, attempts=0,
                  created_at=datetime.datetime.now()),
        UserDevice(user_id=a.id, device="{}", last_active=now_iso()),
        UserAppSig(user_id=a.id, sigs="[]", app_count=0, updated_at=now_iso()),
        LiveLocation(share_id="share-aaaa-bbbb", owner_id=a.id, state="active",
                     created_at=now_iso(), expires_at=now_iso()),
        UserAppList(user_id=a.id, apps="[{\"label\":\"微信\",\"pkg\":\"com.tencent.mm\",\"icon\":\"\"}]",
                    app_count=1, enabled=True, updated_at=now_iso()),
    ])

    # 反馈：删除用户后必须「行保留、user_id 置 NULL」
    fb = Feedback(user_id=a.id, type="bug", content="A的反馈", status="pending",
                  created_at=now_iso())
    db.add(fb)

    # 一次性内容（内容治理用，归属 DC，避免污染 A 的删除断言）
    dm = Moment(user_id=dc.id, content="DC的动态hello", images="[]", created_at=now_iso())
    dn = Note(user_id=dc.id, title="DC的笔记", category="other", privacy="public",
              status="published", tags="[]", content="DC正文", excerpt="",
              created_at=now_str(), updated_at=now_str())
    bn = Note(user_id=b.id, title="B的笔记(控组)", category="other", privacy="public",
              status="published", tags="[]", content="B正文", excerpt="",
              created_at=now_str(), updated_at=now_str())
    db.add_all([dm, dn, bn])
    db.commit()
    db.add(MomentComment(moment_id=dm.id, user_id=b.id, content="B评DC动态hello",
                         created_at=now_iso()))
    dbm = BoardMessage(user_id=dc.id, content="DC的留言hello", created_at=now_str())
    db.add(dbm)
    db.commit()
    db.add(BoardReply(message_id=dbm.id, user_id=dc.id, content="DC的回复hello",
                      created_at=now_str()))
    # 矩阵专用群（成员 C / DC），以及 C↔DC 私聊（供 chat 单删用）
    gmx = ChatGroup(name="矩阵群", owner_id=c.id, announcement="", created_at=now_iso())
    db.add(gmx)
    db.commit()
    db.add_all([
        ChatGroupMember(group_id=gmx.id, user_id=c.id, role="owner", joined_at=now_iso()),
        ChatGroupMember(group_id=gmx.id, user_id=dc.id, role="member", joined_at=now_iso()),
        Message(sender_id=c.id, receiver_id=dc.id, kind="text", content="matrix chat hello",
                sub="", precise=False, created_at=now_iso()),
    ])
    db.commit()

    F.update({
        "note1": n1.id, "note2": n2.id, "moment1": m1.id, "moment2": m2.id,
        "moment_comment_a": mc_a.id, "board": bm.id, "group": g.id,
        "dc_moment": dm.id, "dc_note": dn.id, "dc_board": dbm.id, "b_note": bn.id,
        "mx_group": gmx.id, "feedback": fb.id,
    })
    db.close()
    return F


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

    F = build_fixtures()

    app = FastAPI()
    for r_ in (auth.router, users_router.router, notes.router, social.router,
               friends.router, chat.router, groups.router, moments.router,
               feedback.router, feedback_public.router, admin.router,
               admin_ops.router, admin_ops.router_public,
               app_list.router, app_list.router_admin):
        app.include_router(r_)
    c = TestClient(app, raise_server_exceptions=False)

    tok_admin, _ = login(c, "管理员")
    tok_A, _ = login(c, "rich_user")
    tok_B, _ = login(c, "friend_b")
    tok_C, _ = login(c, "plain_c")
    tok_DC, _ = login(c, "discard_c")
    chk("夹具登录：管理员/rich_user/friend_b/plain_c/discard_c 全部拿到令牌",
        all([tok_admin, tok_A, tok_B, tok_C, tok_DC]),
        "admin=%s A=%s B=%s C=%s DC=%s" % (bool(tok_admin), bool(tok_A), bool(tok_B),
                                          bool(tok_C), bool(tok_DC)))
    if not all([tok_admin, tok_A, tok_B, tok_C, tok_DC]):
        raise SystemExit("夹具登录失败，终止")

    ids = {k: v.id for k, v in F.items() if isinstance(v, User)}

    # ======================================================================
    sec("C. 内容治理副作用（真打公开接口）")
    # ---- 动态 ----
    r = c.get("/api/moments/feed", headers=H(tok_C))
    chk("C1 公开动态 feed 可读(plain_c)", r.status_code == 200, r.text[:200])
    has_dc = any(it.get("id") == F["dc_moment"] for it in (r.json() or {}).get("items", []))
    chk("C1 DC 的动态出现在普通用户 feed 里（治理前）", has_dc, r.text[:300])
    r = c.post("/api/admin/content/moments/%d/hide" % F["dc_moment"], headers=H(tok_admin))
    chk("C2 管理员隐藏动态 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/moments/feed", headers=H(tok_C))
    still = any(it.get("id") == F["dc_moment"] for it in (r.json() or {}).get("items", []))
    chk("C3 隐藏后普通用户 feed 里不再出现（公开接口实证）", not still, r.text[:400])
    # 详情路径也应 404
    r = c.post("/api/moments/%d/like" % F["dc_moment"], headers=H(tok_C))
    chk("C4 隐藏后点赞该动态 → 404（详情路径一并挡住）", r.status_code == 404, r.status_code)
    r = c.post("/api/admin/content/moments/%d/unhide" % F["dc_moment"], headers=H(tok_admin))
    chk("C5 取消隐藏 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/moments/feed", headers=H(tok_C))
    back = any(it.get("id") == F["dc_moment"] for it in (r.json() or {}).get("items", []))
    chk("C6 取消隐藏后重新出现", back, r.text[:400])

    # ---- 动态评论 ----
    db = SessionLocal()
    mcid = db.query(MomentComment.id).filter(MomentComment.moment_id == F["dc_moment"]).first()[0]
    db.close()
    r = c.get("/api/moments/%d/comments" % F["dc_moment"], headers=H(tok_C))
    chk("C7 公开动态评论列表可读", r.status_code == 200, r.text[:200])
    chk("C7b 评论在列表里（治理前）",
        any(it.get("id") == mcid for it in (r.json() or {}).get("items", [])), r.text[:300])
    r = c.post("/api/admin/content/moment-comments/%d/hide" % mcid, headers=H(tok_admin))
    chk("C8 隐藏动态评论 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/moments/%d/comments" % F["dc_moment"], headers=H(tok_C))
    chk("C9 隐藏后评论列表中不再出现",
        not any(it.get("id") == mcid for it in (r.json() or {}).get("items", [])), r.text[:300])
    r = c.post("/api/admin/content/moment-comments/%d/unhide" % mcid, headers=H(tok_admin))
    chk("C10 取消隐藏评论 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/moments/%d/comments" % F["dc_moment"], headers=H(tok_C))
    chk("C11 取消隐藏后评论重新出现",
        any(it.get("id") == mcid for it in (r.json() or {}).get("items", [])), r.text[:300])

    # ---- 笔记（隐藏 = 软删 deleted_at）----
    r = c.get("/api/notes/%d" % F["dc_note"], headers=H(tok_C))
    chk("C12 公开笔记详情可读（治理前）", r.status_code == 200, r.status_code)
    r = c.post("/api/admin/content/notes/%d/hide" % F["dc_note"], headers=H(tok_admin))
    chk("C13 隐藏笔记 → 200", r.status_code == 200, r.text[:200])
    db = SessionLocal()
    dn = db.get(Note, F["dc_note"])
    chk("C14 隐藏笔记落 deleted_at", bool(dn and dn.deleted_at), dn.deleted_at if dn else None)
    db.close()
    r = c.get("/api/notes/%d" % F["dc_note"], headers=H(tok_C))
    chk("C15 隐藏后公开笔记详情 → 404（公开接口实证）", r.status_code == 404, r.status_code)
    r = c.post("/api/admin/content/notes/%d/unhide" % F["dc_note"], headers=H(tok_admin))
    chk("C16 取消隐藏笔记 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/notes/%d" % F["dc_note"], headers=H(tok_C))
    chk("C17 取消隐藏后笔记详情恢复 200", r.status_code == 200, r.status_code)

    # ---- 留言板 ----
    r = c.get("/api/board", headers=H(tok_C))
    chk("C18 公开留言板可读", r.status_code == 200, r.text[:200])
    chk("C18b DC 留言在列表里（治理前）",
        any(it.get("id") == F["dc_board"] for it in (r.json() or {}).get("items", [])), r.text[:300])
    r = c.post("/api/admin/content/board/%d/hide" % F["dc_board"], headers=H(tok_admin))
    chk("C19 隐藏留言 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/board", headers=H(tok_C))
    chk("C20 隐藏后留言板不再出现",
        not any(it.get("id") == F["dc_board"] for it in (r.json() or {}).get("items", [])),
        r.text[:300])
    r = c.post("/api/admin/content/board/%d/unhide" % F["dc_board"], headers=H(tok_admin))
    chk("C21 取消隐藏留言 → 200", r.status_code == 200, r.text[:200])

    # ---- 留言回复 ----
    db = SessionLocal()
    brid = db.query(BoardReply.id).filter(BoardReply.message_id == F["dc_board"]).first()[0]
    db.close()
    r = c.get("/api/board/%d/replies" % F["dc_board"], headers=H(tok_C))
    chk("C22 公开留言回复列表可读", r.status_code == 200, r.text[:200])
    r = c.post("/api/admin/content/board-replies/%d/hide" % brid, headers=H(tok_admin))
    chk("C23 隐藏留言回复 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/board/%d/replies" % F["dc_board"], headers=H(tok_C))
    chk("C24 隐藏后回复列表中不再出现",
        not any(it.get("id") == brid for it in (r.json() or {}).get("items", [])), r.text[:300])
    r = c.post("/api/admin/content/board-replies/%d/unhide" % brid, headers=H(tok_admin))
    chk("C25 取消隐藏留言回复 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/board/%d/replies" % F["dc_board"], headers=H(tok_C))
    chk("C26 取消隐藏后回复重新出现",
        any(it.get("id") == brid for it in (r.json() or {}).get("items", [])), r.text[:300])

    # ======================================================================
    sec("D. 全站公告（管理端 + 普通用户端）")
    r = c.post("/api/admin/announcements", headers=HJ(tok_admin),
               json={"title": "D测试公告", "content": "公告正文D"})
    chk("D1 管理员发布公告 → 200", r.status_code == 200, r.text[:300])
    aid = (r.json() or {}).get("id")
    r = c.get("/api/announcements", headers=H(tok_C))
    chk("D2 普通用户公开接口可见该公告",
        r.status_code == 200 and any(it.get("id") == aid for it in (r.json() or {}).get("items", [])),
        r.text[:400])
    chk("D2b 未登录打公开公告 → 401", c.get("/api/announcements").status_code == 401)
    r = c.post("/api/announcements/read", headers=H(tok_C))
    chk("D3 标记已读 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/announcements", headers=H(tok_C))
    chk("D4 标记已读后 unread=False", (r.json() or {}).get("unread") is False, r.text[:300])
    r = c.patch("/api/admin/announcements/%s" % aid, headers=HJ(tok_admin),
                json={"title": "D改后标题", "active": False})
    chk("D5 管理员改公告 → 200", r.status_code == 200, r.text[:300])
    r = c.get("/api/announcements", headers=H(tok_C))
    chk("D6 停用后普通用户不再看到该公告",
        not any(it.get("id") == aid for it in (r.json() or {}).get("items", [])), r.text[:400])
    r = c.patch("/api/admin/announcements/%s" % aid, headers=HJ(tok_admin), json={"active": True})
    chk("D7 重新启用 → 200", r.status_code == 200 and (r.json() or {}).get("active") is True,
        r.text[:300])
    r = c.delete("/api/admin/announcements/%s" % aid, headers=H(tok_admin))
    chk("D8 管理员删除公告 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/announcements", headers=H(tok_C))
    chk("D9 删除后普通用户查不到",
        not any(it.get("id") == aid for it in (r.json() or {}).get("items", [])), r.text[:400])
    r = c.post("/api/admin/announcements", headers=HJ(tok_admin), json={"title": "", "content": ""})
    chk("D10 空内容发布 → 400（服务端校验）", r.status_code == 400, r.status_code)

    # ======================================================================
    sec("E. 群组管理")
    ge = None
    r = c.post("/api/admin/announcements", headers=HJ(tok_admin),
               json={"title": "占位", "content": "占位"})  # 无副作用，仅确保接口活
    db = SessionLocal()
    ge = ChatGroup(name="E测试群", owner_id=ids["B"], announcement="", created_at=now_iso())
    db.add(ge)
    db.commit()
    gid = ge.id
    db.add_all([
        ChatGroupMember(group_id=gid, user_id=ids["B"], role="owner", joined_at=now_iso()),
        ChatGroupMember(group_id=gid, user_id=ids["A"], role="member", joined_at=now_iso()),
        ChatGroupMember(group_id=gid, user_id=ids["C"], role="member", joined_at=now_iso()),
    ])
    db.commit()
    db.close()
    r = c.get("/api/admin/groups/%d/members" % gid, headers=H(tok_admin))
    mem = (r.json() or {}).get("items", [])
    chk("E1 管理员群成员列表 → 3 人", r.status_code == 200 and len(mem) == 3, r.text[:300])
    r = c.patch("/api/admin/groups/%d" % gid, headers=HJ(tok_admin),
                json={"name": "E改名群", "announcement": "E群公告"})
    chk("E2 管理员改群名/群公告 → 200", r.status_code == 200, r.text[:300])
    r = c.get("/api/groups/%d" % gid, headers=H(tok_C))
    chk("E3 普通成员能看到改后群名与公告",
        r.status_code == 200 and (r.json() or {}).get("name") == "E改名群"
        and (r.json() or {}).get("announcement") == "E群公告", r.text[:400])
    r = c.delete("/api/admin/groups/%d/members/%d" % (gid, ids["C"]), headers=H(tok_admin))
    chk("E4 管理员移除成员 C → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/groups/%d" % gid, headers=H(tok_C))
    chk("E5 被移除后 C 拿不到群详情（403/404）", r.status_code in (403, 404), r.status_code)
    r = c.post("/api/groups/%d/messages" % gid, headers=HJ(tok_C), json={"content": "我还想发"})
    chk("E6 被移除后 C 发不了群消息（403/404）", r.status_code in (403, 404), r.status_code)
    r = c.delete("/api/admin/groups/%d/members/%d" % (gid, ids["B"]), headers=H(tok_admin))
    chk("E7 移除群主 → 400（红线）", r.status_code == 400, r.status_code)
    r = c.post("/api/admin/groups/%d/dismiss" % gid, headers=H(tok_admin))
    chk("E8 解散群 → 200", r.status_code == 200, r.text[:200])
    db = SessionLocal()
    chk("E9 解散后群行已删", db.get(ChatGroup, gid) is None)
    chk("E9b 解散后群成员清空",
        db.query(ChatGroupMember).filter(ChatGroupMember.group_id == gid).count() == 0)
    chk("E9c 解散后群消息清空",
        db.query(Message).filter(Message.group_id == gid).count() == 0)
    db.close()
    r = c.get("/api/groups/%d" % gid, headers=H(tok_B))
    chk("E10 解散后群详情 → 404", r.status_code == 404, r.status_code)

    # ======================================================================
    sec("F. 私聊审计（只读 + 单删）")
    r = c.get("/api/admin/chat/threads", headers=H(tok_admin))
    chk("F1 会话列表 → 200", r.status_code == 200, r.text[:200])
    thr = (r.json() or {}).get("items", [])
    pair = [it for it in thr if {it.get("aId"), it.get("bId")} == {ids["A"], ids["B"]}]
    chk("F2 包含 A↔B 会话且能取到双方昵称", len(pair) == 1
        and pair[0].get("aNickname") and pair[0].get("bNickname"), json.dumps(thr, ensure_ascii=False)[:400])
    r = c.get("/api/admin/chat/thread/%d/%d/messages" % (ids["A"], ids["B"]), headers=H(tok_admin))
    txt = r.text
    chk("F3 会话正文能取到真实消息内容", r.status_code == 200
        and "hello from A" in txt and "hello from B" in txt, txt[:400])
    r = c.get("/api/admin/chat/search?q=hello", headers=H(tok_admin))
    chk("F4 关键词检索命中私聊正文", r.status_code == 200
        and (r.json() or {}).get("total", 0) >= 1, r.text[:300])
    # 单删：删 C↔DC 的那条，然后普通用户接口查不到
    db = SessionLocal()
    mid = db.query(Message.id).filter(Message.content == "matrix chat hello").first()[0]
    db.close()
    r = c.get("/api/chat/%d/messages" % ids["DC"], headers=H(tok_C))
    chk("F5 普通用户能看到待删消息（前置条件）",
        r.status_code == 200 and str(mid) in r.text, r.text[:300])
    r = c.delete("/api/admin/chat/messages/%d" % mid, headers=H(tok_admin))
    chk("F6 管理员删单条消息 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/chat/%d/messages" % ids["DC"], headers=H(tok_C))
    db = SessionLocal()
    gone = db.get(Message, mid) is None
    db.close()
    chk("F7 删除后普通用户接口查不到该条", gone and ('"id": %d' % mid) not in r.text,
        "db_gone=%s body=%s" % (gone, r.text[:200]))
    r = c.delete("/api/admin/chat/messages/999999", headers=H(tok_admin))
    chk("F8 删不存在的消息 → 404", r.status_code == 404, r.status_code)

    # ======================================================================
    sec("A. 鉴权三态 × admin_ops 全路由")
    ROUTES = [
        ("GET", "/api/admin/users/{MX}/data-summary", None, 403),
        ("POST", "/api/admin/users/{MX}/ban", {"reason": "矩阵"}, 403),
        ("POST", "/api/admin/users/{MX}/unban", None, 403),
        ("POST", "/api/admin/users/{MX}/mute", {"minutes": 1}, 403),
        ("POST", "/api/admin/users/{MX}/kick", None, 403),
        ("POST", "/api/admin/users/{MX}/reset-password", {"newPassword": "MxPassw0rd@2026"}, 403),
        ("PATCH", "/api/admin/users/{MX}/profile", {"nickname": "矩阵昵称"}, 403),
        ("GET", "/api/admin/content/summary", None, 403),
        ("GET", "/api/admin/content/moments", None, 403),
        ("POST", "/api/admin/content/moments/{DM}/hide", None, 403),
        ("POST", "/api/admin/content/moments/{DM}/unhide", None, 403),
        ("GET", "/api/admin/content/moment-comments", None, 403),
        ("POST", "/api/admin/content/moment-comments/{MC}/hide", None, 403),
        ("POST", "/api/admin/content/moment-comments/{MC}/unhide", None, 403),
        ("GET", "/api/admin/content/notes", None, 403),
        ("POST", "/api/admin/content/notes/{DN}/hide", None, 403),
        ("POST", "/api/admin/content/notes/{DN}/unhide", None, 403),
        ("GET", "/api/admin/content/board", None, 403),
        ("POST", "/api/admin/content/board/{DB}/hide", None, 403),
        ("POST", "/api/admin/content/board/{DB}/unhide", None, 403),
        ("GET", "/api/admin/content/board-replies", None, 403),
        ("POST", "/api/admin/content/board-replies/{BR}/hide", None, 403),
        ("POST", "/api/admin/content/board-replies/{BR}/unhide", None, 403),
        ("GET", "/api/admin/announcements", None, 403),
        ("POST", "/api/admin/announcements", {"title": "矩阵公告", "content": "矩阵正文"}, 403),
        ("PATCH", "/api/admin/announcements/{AM}", {"title": "矩阵公告改"}, 403),
        ("GET", "/api/announcements", None, 200),
        ("POST", "/api/announcements/read", None, 200),
        ("GET", "/api/admin/groups", None, 403),
        ("GET", "/api/admin/groups/{GX}/members", None, 403),
        ("PATCH", "/api/admin/groups/{GX}", {"name": "矩阵群改名"}, 403),
        ("DELETE", "/api/admin/groups/{GX}/members/{DC}", None, 403),
        ("POST", "/api/admin/groups/{GX}/dismiss", None, 403),
        ("GET", "/api/admin/chat/threads", None, 403),
        ("GET", "/api/admin/chat/thread/{A}/{B}/messages", None, 403),
        ("GET", "/api/admin/chat/search?q=hello", None, 403),
        ("GET", "/api/admin/logs", None, 403),
        ("GET", "/api/admin/me/visibility", None, 403),
        ("POST", "/api/admin/me/visibility", {"hidden": False}, 403),
        # —— R171-B 新增路由（三条用户侧只要求登录，故非管理员预期 200；一条管理侧预期 403）——
        ("GET", "/api/user/app-list/status", None, 200),
        ("POST", "/api/user/app-list", {"apps": [{"label": "t", "pkg": "p", "icon": ""}],
                                                 "appCount": 1}, 200),
        ("POST", "/api/user/app-list/toggle", {"enabled": True}, 200),
        ("GET", "/api/admin/users/{A}/apps", None, 403),
        # —— 销毁性路由放最后；**子对象必须先删**，否则父对象级联后子对象 404（属正常行为）——
        ("DELETE", "/api/admin/content/moment-comments/{MC}", None, 403),
        ("DELETE", "/api/admin/content/board-replies/{BR}", None, 403),
        ("DELETE", "/api/admin/content/moments/{DM}", None, 403),
        ("DELETE", "/api/admin/content/notes/{DN}", None, 403),
        ("DELETE", "/api/admin/content/board/{DB}", None, 403),
        ("DELETE", "/api/admin/announcements/{AM}", None, 403),
        ("DELETE", "/api/admin/chat/messages/{CM}", None, 403),
    ]
    db = SessionLocal()
    br_id = db.query(BoardReply.id).filter(BoardReply.message_id == F["dc_board"]).first()[0]
    mc_id = db.query(MomentComment.id).filter(MomentComment.moment_id == F["dc_moment"]).first()[0]
    cm_id = db.query(Message.id).filter(Message.content == "hello from A").first()[0]
    db.close()
    SUB = {"MX": ids["MX"], "DM": F["dc_moment"], "MC": mc_id, "DN": F["dc_note"],
           "DB": F["dc_board"], "BR": br_id, "GX": F["mx_group"], "DC": ids["DC"],
           "A": ids["A"], "B": ids["B"], "CM": cm_id}
    _ra = c.post("/api/admin/announcements", headers=HJ(tok_admin),
                 json={"title": "矩阵公告A", "content": "矩阵公告正文"})
    SUB["AM"] = (_ra.json() or {}).get("id") or 0

    detail_rows = []
    for method, tmpl, body, na_expect in ROUTES:
        path = tmpl.format(**SUB)
        # 未登录
        if method == "GET":
            r1 = c.get(path)
        elif method == "DELETE":
            r1 = c.delete(path)
        elif method == "PATCH":
            r1 = c.patch(path, json=body or {})
        else:
            r1 = c.post(path, json=body or {})
        ok1 = (r1.status_code == 401)
        # 非管理员
        if method == "GET":
            r2 = c.get(path, headers=H(tok_C))
        elif method == "DELETE":
            r2 = c.delete(path, headers=H(tok_C))
        elif method == "PATCH":
            r2 = c.patch(path, headers=HJ(tok_C), json=body or {})
        else:
            r2 = c.post(path, headers=HJ(tok_C), json=body or {})
        ok2 = (r2.status_code == na_expect)
        # 管理员
        if method == "GET":
            r3 = c.get(path, headers=H(tok_admin))
        elif method == "DELETE":
            r3 = c.delete(path, headers=H(tok_admin))
        elif method == "PATCH":
            r3 = c.patch(path, headers=HJ(tok_admin), json=body or {})
        else:
            r3 = c.post(path, headers=HJ(tok_admin), json=body or {})
        ok3 = (200 <= r3.status_code < 300)
        detail_rows.append("  %-6s %-52s 未登录=%s(%s) 非管理员=%s(%s) 管理员=%s(%s)"
                           % (method, path, r1.status_code, "OK" if ok1 else "!!",
                              r2.status_code, "OK" if ok2 else "!!",
                              r3.status_code, "OK" if ok3 else "!!"))
        if not ok3:
            detail_rows.append("       ↑ 管理员失败原文: " + r3.text[:300])
        chk("A %s %s 三态" % (method, path), ok1 and ok2 and ok3,
            "未登录=%s(期望401) 非管理员=%s(期望%s) 管理员=%s(期望2xx) :: %s"
            % (r1.status_code, r2.status_code, na_expect, r3.status_code, r3.text[:200]))
    # DELETE /api/admin/users/{uid}?confirm= 单独处理（需 query）
    r1 = c.delete("/api/admin/users/%d?confirm=mx_user" % ids["MX"])
    chk("A DELETE /users/{uid} 未登录 → 401", r1.status_code == 401, r1.status_code)
    r2 = c.delete("/api/admin/users/%d?confirm=mx_user" % ids["MX"], headers=H(tok_C))
    chk("A DELETE /users/{uid} 非管理员 → 403", r2.status_code == 403, r2.status_code)
    r3 = c.delete("/api/admin/users/%d?confirm=mx_user" % ids["MX"], headers=H(tok_admin))
    chk("A DELETE /users/{uid} 管理员 → 200", r3.status_code == 200, r3.text[:300])
    detail_rows.append("  %-6s %-52s 未登录=%s 非管理员=%s 管理员=%s"
                       % ("DELETE", "/api/admin/users/{uid}?confirm=", r1.status_code,
                          r2.status_code, r3.status_code))
    db = SessionLocal()
    chk("A 矩阵对象 MX 确实被删除", db.get(User, ids["MX"]) is None)
    db.close()
    log("")
    log("  —— 三态矩阵明细（共 %d 条路由，应 = admin_ops 全部 47 条）——" % (len(ROUTES) + 1))
    for ln in detail_rows:
        log(ln)

    # ======================================================================
    sec("B. 用户治理副作用真伪")
    # B1 封禁 → 登录 403
    r = c.post("/api/admin/users/%d/ban" % ids["G1"], headers=HJ(tok_admin),
               json={"reason": "违规测试原因"})
    chk("B1 封禁 → 200 且返回被拒原因", r.status_code == 200
        and (r.json() or {}).get("isBanned") is True, r.text[:300])
    tk, rr = login(c, "gov_ban")
    chk("B2 封禁后登录 → 403（不是 401）", rr.status_code == 403, rr.status_code)
    chk("B2b 403 文案带封禁原因", "违规测试原因" in rr.text, rr.text[:200])
    r = c.post("/api/admin/users/%d/unban" % ids["G1"], headers=HJ(tok_admin))
    chk("B3 解封 → 200", r.status_code == 200, r.text[:200])
    tk, rr = login(c, "gov_ban")
    chk("B4 解封后可重新登录", rr.status_code == 200 and bool(tk), rr.status_code)

    # B5 禁言 → 发内容 403；到期恢复
    r = c.post("/api/admin/users/%d/mute" % ids["G2"], headers=HJ(tok_admin), json={"minutes": 30})
    chk("B5 禁言 30 分钟 → 200", r.status_code == 200, r.text[:200])
    tk_g2, _ = login(c, "gov_mute")
    chk("B5b 禁言对象仍可登录（禁言只拦发内容）", bool(tk_g2))
    r = c.post("/api/moments", headers=HJ(tk_g2), json={"content": "禁言期发的动态"})
    chk("B6 禁言期发动态 → 403", r.status_code == 403, "%s %s" % (r.status_code, r.text[:200]))
    chk("B6b 403 文案含解禁时间", "禁言" in r.text, r.text[:200])
    r = c.post("/api/admin/users/%d/mute" % ids["G2"], headers=HJ(tok_admin), json={"minutes": -1})
    chk("B7 解除禁言（minutes<=0）→ 200", r.status_code == 200, r.text[:200])
    r = c.post("/api/moments", headers=HJ(tk_g2), json={"content": "解除后发的动态"})
    chk("B8 解除后可正常发动态 → 200", r.status_code == 200, "%s %s" % (r.status_code, r.text[:200]))
    # 禁言到期自然恢复（把 mute_until 改成过去时间）
    c.post("/api/admin/users/%d/mute" % ids["G2"], headers=HJ(tok_admin), json={"minutes": 30})
    db = SessionLocal()
    g2 = db.get(User, ids["G2"])
    g2.mute_until = "2020-01-01 00:00:00"
    db.commit()
    db.close()
    r = c.post("/api/moments", headers=HJ(tk_g2), json={"content": "到期后发的动态"})
    chk("B9 mute_until 过期后自动恢复发言", r.status_code == 200,
        "%s %s" % (r.status_code, r.text[:200]))
    r = c.post("/api/admin/users/%d/mute" % ids["G2"], headers=HJ(tok_admin), json={"minutes": 99999})
    chk("B10 禁言超 30 天上限 → 400", r.status_code == 400, r.status_code)

    # B11 踢下线 → 旧令牌 401
    tk_g3, _ = login(c, "gov_kick")
    r = c.get("/api/auth/me", headers=H(tk_g3))
    chk("B11 踢线前旧令牌可用", r.status_code == 200, r.status_code)
    r = c.post("/api/admin/users/%d/kick" % ids["G3"], headers=H(tok_admin))
    chk("B11b 踢下线 → 200", r.status_code == 200, r.text[:200])
    r = c.get("/api/auth/me", headers=H(tk_g3))
    chk("B12 踢线后旧令牌 → 401", r.status_code == 401, "%s %s" % (r.status_code, r.text[:200]))

    # B13 重置密码
    tk_g4, _ = login(c, "gov_pwd")
    NEWPW = "NewPassw0rd@2026"
    r = c.post("/api/admin/users/%d/reset-password" % ids["G4"], headers=HJ(tok_admin),
               json={"newPassword": NEWPW})
    chk("B13 重置密码 → 200", r.status_code == 200, r.text[:250])
    _, rr = login(c, "gov_pwd")
    chk("B14 旧密码登录失败", rr.status_code == 400, rr.status_code)
    tk2, rr = login(c, "gov_pwd", NEWPW)
    chk("B15 新密码登录成功", rr.status_code == 200 and bool(tk2), rr.status_code)
    r = c.get("/api/auth/me", headers=H(tk_g4))
    chk("B16 改密后旧令牌失效 → 401", r.status_code == 401, r.status_code)
    r = c.post("/api/admin/users/%d/reset-password" % ids["G4"], headers=HJ(tok_admin),
               json={"newPassword": "123"})
    chk("B17 弱密码 → 400（走强度校验）", r.status_code == 400, r.status_code)

    # B18 改资料
    r = c.patch("/api/admin/users/%d/profile" % ids["B"], headers=HJ(tok_admin),
                json={"nickname": "B改后昵称", "motto": "改后签名", "gender": "male"})
    chk("B18 改资料 → 200 且 changed 含字段", r.status_code == 200
        and set((r.json() or {}).get("changed", [])) >= {"nickname", "motto", "gender"},
        r.text[:300])
    db = SessionLocal()
    b2 = db.get(User, ids["B"])
    chk("B19 改资料真的落库",
        b2.nickname == "B改后昵称" and b2.motto == "改后签名" and b2.gender == "male",
        "nickname=%s motto=%s gender=%s" % (b2.nickname, b2.motto, b2.gender))
    db.close()
    r = c.patch("/api/admin/users/%d/profile" % ids["B"], headers=HJ(tok_admin),
                json={"gender": "不明"})
    chk("B20 非法性别 → 400", r.status_code == 400, r.status_code)

    # B21 治理目标闸：不能对自己 / 不能对其他管理员
    r = c.post("/api/admin/users/%d/ban" % ids["admin"], headers=HJ(tok_admin), json={"reason": "x"})
    chk("B21 封禁自己 → 400", r.status_code == 400, r.status_code)
    r = c.post("/api/admin/users/%d/ban" % ids["adm2"], headers=HJ(tok_admin), json={"reason": "x"})
    chk("B22 封禁其他管理员 → 400", r.status_code == 400, r.status_code)
    r = c.delete("/api/admin/users/%d?confirm=管理员" % ids["admin"], headers=H(tok_admin))
    chk("B23 删除自己 → 400", r.status_code == 400, r.status_code)
    r = c.patch("/api/admin/users/%d/profile" % ids["adm2"], headers=HJ(tok_admin),
                json={"nickname": "不该改"})
    chk("B24 改其他管理员资料 → 400", r.status_code == 400, r.status_code)
    r = c.post("/api/admin/users/999999/ban", headers=HJ(tok_admin), json={"reason": "x"})
    chk("B25 治理不存在用户 → 404", r.status_code == 404, r.status_code)

    # B26 彻底删除：确认文本不匹配 → 不删任何数据
    db = SessionLocal()
    def counts_snapshot():
        return {
            "moments": db.query(Moment).filter(Moment.user_id == ids["A"]).count(),
            "notes": db.query(Note).filter(Note.user_id == ids["A"]).count(),
            "board": db.query(BoardMessage).filter(BoardMessage.user_id == ids["A"]).count(),
            "msgs": db.query(Message).filter(Message.sender_id == ids["A"]).count(),
            "user": 1 if db.get(User, ids["A"]) else 0,
            "feedbacks": db.query(Feedback).filter(Feedback.user_id == ids["A"]).count(),
        }
    before = counts_snapshot()
    r = c.delete("/api/admin/users/%d?confirm=wrong_text" % ids["A"], headers=H(tok_admin))
    chk("B26 确认文本不匹配 → 400", r.status_code == 400, r.status_code)
    after = counts_snapshot()
    chk("B27 不匹配时一行都没删（事务未开始）", before == after,
        "before=%s after=%s" % (before, after))
    db.close()

    # B28 异常路径 rollback：monkeypatch _op_log 使其抛错 → 500 且数据完好
    real_op_log = admin_ops._op_log

    def boom(*a, **k):
        raise RuntimeError("forced failure for rollback test")

    admin_ops._op_log = boom
    r = c.delete("/api/admin/users/%d?confirm=rich001" % ids["A"], headers=H(tok_admin))
    admin_ops._op_log = real_op_log
    chk("B28 删除中途异常 → 500", r.status_code == 500, "%s %s" % (r.status_code, r.text[:200]))
    db = SessionLocal()
    mid_state = counts_snapshot()
    chk("B29 异常后整体 rollback：数据与删除前一致", mid_state == before,
        "before=%s after_err=%s" % (before, mid_state))
    db.close()

    # B30 真正删除（用账号 confirm）
    db = SessionLocal()
    a_moment_ids = [x[0] for x in db.query(Moment.id).filter(Moment.user_id == ids["A"]).all()]
    a_note_ids = [x[0] for x in db.query(Note.id).filter(Note.user_id == ids["A"]).all()]
    a_board_ids = [x[0] for x in db.query(BoardMessage.id).filter(BoardMessage.user_id == ids["A"]).all()]
    a_mc_ids = [x[0] for x in db.query(MomentComment.id).filter(MomentComment.user_id == ids["A"]).all()]
    b_note_cnt = 1 if db.get(Note, F["b_note"]) else 0
    fb_cnt_before = db.query(Feedback).count()
    db.close()
    r = c.delete("/api/admin/users/%d?confirm=rich001" % ids["A"], headers=H(tok_admin))
    det = {}
    try:
        det = (r.json() or {}).get("deleted") or {}
    except Exception:
        pass
    chk("B30 彻底删除（confirm=账号）→ 200", r.status_code == 200, r.text[:400])
    chk("B30b 返回 deleted 明细含多表", len(det) >= 8, json.dumps(det, ensure_ascii=False)[:400])
    db = SessionLocal()
    chk("B31 users 行已删除", db.get(User, ids["A"]) is None)
    for label, model, cond in [
        ("动态", Moment, Moment.user_id == ids["A"]),
        ("动态点赞", MomentLike, MomentLike.user_id == ids["A"]),
        ("动态评论", MomentComment, MomentComment.user_id == ids["A"]),
        ("笔记", Note, Note.user_id == ids["A"]),
        ("笔记点赞", Like, Like.user_id == ids["A"]),
        ("笔记收藏", Favorite, Favorite.user_id == ids["A"]),
        ("笔记评论", Comment, Comment.user_id == ids["A"]),
        ("留言", BoardMessage, BoardMessage.user_id == ids["A"]),
        ("留言点赞", BoardLike, BoardLike.user_id == ids["A"]),
        ("留言回复", BoardReply, BoardReply.user_id == ids["A"]),
        ("私聊消息", Message, (Message.sender_id == ids["A"]) | (Message.receiver_id == ids["A"])),
        ("好友关系", Friend, (Friend.user_a == ids["A"]) | (Friend.user_b == ids["A"])),
        ("好友申请", FriendRequest, (FriendRequest.from_user_id == ids["A"]) | (FriendRequest.to_user_id == ids["A"])),
        ("好友备注", FriendRemark, (FriendRemark.owner_id == ids["A"]) | (FriendRemark.peer_id == ids["A"])),
        ("拉黑", UserBlock, (UserBlock.blocker_id == ids["A"]) | (UserBlock.blocked_id == ids["A"])),
        ("通知(收件)", Notification, Notification.user_id == ids["A"]),
        ("学习日志", StudyLog, StudyLog.user_id == ids["A"]),
        ("AI用量", AiUsage, AiUsage.user_id == ids["A"]),
        ("AI日志", AiLog, AiLog.user_id == ids["A"]),
        ("邮箱验证码", EmailCode, EmailCode.user_id == ids["A"]),
        ("设备", UserDevice, UserDevice.user_id == ids["A"]),
        ("应用指纹", UserAppSig, UserAppSig.user_id == ids["A"]),
        ("实时位置", LiveLocation, LiveLocation.owner_id == ids["A"]),
        ("应用列表(R171)", UserAppList, UserAppList.user_id == ids["A"]),
    ]:
        n = db.query(model).filter(cond).count()
        chk("B32 删除后「%s」关联行 = 0" % label, n == 0, "实际 %d" % n)
    if a_moment_ids:
        n = db.query(MomentMeta).filter(MomentMeta.moment_id.in_(a_moment_ids)).count()
        chk("B33 删除后动态旁路表 MomentMeta = 0", n == 0, "实际 %d" % n)
        n = db.query(Message).filter(Message.group_id == F["group"]).count()
        chk("B33b 删除后 A 的群消息已清", n == 0, "实际 %d" % n)
        n = db.query(ChatGroupMember).filter(ChatGroupMember.group_id == F["group"]).count()
        chk("B33c 删除后 A 的群成员关系已清", n == 0, "实际 %d" % n)
    if a_mc_ids:
        n = db.query(MomentCommentMeta).filter(MomentCommentMeta.comment_id.in_(a_mc_ids)).count()
        chk("B33d 删除后动态评论旁路表 MomentCommentMeta = 0", n == 0, "实际 %d" % n)
    if a_note_ids:
        n = db.query(Notification).filter(Notification.note_id.in_(a_note_ids)).count()
        chk("B33e 删除后指向 A 笔记的通知已清", n == 0, "实际 %d" % n)
    if a_board_ids:
        n = db.query(BoardReply).filter(BoardReply.message_id.in_(a_board_ids)).count()
        chk("B33f 删除后别人对 A 留言的回复已清", n == 0, "实际 %d" % n)
    fb = db.get(Feedback, F["feedback"])
    chk("B34 feedbacks 行保留（未被删）", db.query(Feedback).count() == fb_cnt_before,
        "before=%d after=%d" % (fb_cnt_before, db.query(Feedback).count()))
    chk("B34b feedbacks.user_id 已置 NULL", fb is not None and fb.user_id is None,
        "user_id=%s" % (fb.user_id if fb else "ROW_MISSING"))
    b_alive = 1 if db.get(Note, F["b_note"]) else 0
    chk("B35 未误删他人数据（B 的笔记仍在）", b_alive == b_note_cnt,
        "before=%d after=%d" % (b_note_cnt, b_alive))
    chk("B36 审计日志已落 user_delete",
        db.query(AdminOpLog).filter(AdminOpLog.action == "user_delete",
                                    AdminOpLog.target_id == ids["A"]).count() == 1)
    db.close()

    # ======================================================================
    sec("G. 审计日志")
    r = c.get("/api/admin/logs", headers=H(tok_admin))
    chk("G1 审计日志接口 → 200", r.status_code == 200, r.text[:200])
    actions = {it.get("action") for it in (r.json() or {}).get("items", [])}
    need = ["user_ban", "user_unban", "user_mute", "user_kick", "user_reset_password",
            "user_profile", "user_delete", "moment_hide", "moment_unhide",
            "announce_create", "announce_update", "announce_delete",
            "group_update", "group_member_remove", "group_dismiss",
            "message_delete"]
    missing = [a for a in need if a not in actions]
    chk("G2 16 类写操作动作全部落审计", not missing, "缺失=%s 实际=%s" % (missing, sorted(actions)))
    db = SessionLocal()
    tot = db.query(AdminOpLog).count()
    db.close()
    chk("G3 日志 total 与库内行数一致", (r.json() or {}).get("total") == tot,
        "api=%s db=%s" % ((r.json() or {}).get("total"), tot))

    # ======================================================================
    sec("H. 管理员隐身开关（单向可见原则）")
    # 矩阵里的 POST /me/visibility {hidden:False} 已把当前管理员改成「现身」，先复位再验
    db = SessionLocal()
    fresh_adm = User(username="fresh_admin_x", password_hash=hash_password(PW),
                     nickname="新管理员", motto="", avatar=None, created_at=now_str(),
                     is_admin=True)
    db.add(fresh_adm)
    db.commit()
    db.refresh(fresh_adm)
    from database import is_hidden_from_public
    chk("H0 新建管理员 admin_hidden 缺省即「隐身」（默认值正确）",
        is_hidden_from_public(fresh_adm),
        "admin_hidden=%r" % getattr(fresh_adm, "admin_hidden", None))
    db.close()
    c.post("/api/admin/me/visibility", headers=HJ(tok_admin), json={"hidden": True})
    r = c.get("/api/admin/me/visibility", headers=H(tok_admin))
    chk("H1 复位后隐身状态确为 hidden=True", r.status_code == 200
        and (r.json() or {}).get("hidden") is True, r.text[:200])
    r = c.get("/api/users/%d" % ids["admin"], headers=H(tok_C))
    chk("H2 隐身时普通用户看管理员主页 → 404", r.status_code == 404, r.status_code)
    r = c.get("/api/friends/search?q=%E7%AE%A1%E7%90%86%E5%91%98", headers=H(tok_C))
    chk("H3 隐身时普通用户搜不到管理员",
        not any(it.get("id") == ids["admin"] for it in (r.json() or {}).get("items", [])),
        r.text[:300])
    r = c.post("/api/admin/me/visibility", headers=HJ(tok_admin), json={"hidden": False})
    chk("H4 现身 → 200", r.status_code == 200 and (r.json() or {}).get("hidden") is False,
        r.text[:250])
    r = c.get("/api/users/%d" % ids["admin"], headers=H(tok_C))
    chk("H5 现身后普通用户可看管理员主页 → 200", r.status_code == 200, r.status_code)
    r = c.get("/api/friends/search?q=%E7%AE%A1%E7%90%86%E5%91%98", headers=H(tok_C))
    chk("H6 现身后普通用户能搜到管理员",
        any(it.get("id") == ids["admin"] for it in (r.json() or {}).get("items", [])), r.text[:300])
    r = c.post("/api/admin/me/visibility", headers=HJ(tok_admin), json={"hidden": True})
    chk("H7 恢复隐身 → 200", r.status_code == 200 and (r.json() or {}).get("hidden") is True,
        r.text[:250])
    r = c.get("/api/admin/overview", headers=H(tok_admin))
    chk("H8 隐身不影响管理员自身后台可用（/api/admin/overview → 200）",
        r.status_code == 200, r.status_code)

    # ======================================================================
    log("")
    log("=" * 78)
    log("PASS: %d  FAIL: %d" % (len(PASS), len(FAIL)))
    if FAIL:
        log("失败项清单：")
        for f in FAIL:
            log("  - " + f)
    log("未验证项：" + (", ".join(UNVERIFIED) if UNVERIFIED else "（无）"))
    log("R170_ADMINAPI_" + ("ALL_PASS" if not FAIL else "HAS_FAIL"))
    log("=" * 78)
    with open(os.path.join(_HERE, "_r170_adminapi_all.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(OUT) + "\nR170_ADMINAPI_DONE\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        OUT.append("")
        OUT.append("!! 脚本级异常（非断言失败）：")
        OUT.append(traceback.format_exc())
        OUT.append("PASS: %d  FAIL: %d" % (len(PASS), len(FAIL) + 1))
        OUT.append("R170_ADMINAPI_HAS_FAIL")
        with open(os.path.join(_HERE, "_r170_adminapi_all.txt"), "w", encoding="utf-8") as fh:
            fh.write("\n".join(OUT) + "\nR170_ADMINAPI_DONE\n")
        raise
