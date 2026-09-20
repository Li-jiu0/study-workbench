# -*- coding: utf-8 -*-
"""R72 后端独立回归（项2/4/5 后端部分）。
自建临时 sqlite（绝不连真库），FastAPI TestClient，覆盖：
- Bug1 会话列表回归：管理员回复并置已读后 conversations 仍返回该对端
- Bug2 群列表：普通成员 member / 管理员 admin-view+unread=0+可见全部 / 管理员群详情 403
- Bug3 备注昵称：写读清除、超长截断20、隔离性(对端空)、非好友403、对自己400、三处带peerRemark
结果写 UTF-8。
"""
import os, sys, json

DB = r"D:\下载的文件\学习工作台\tools\qa\r72\_qa_backend.db"
if os.path.exists(DB):
    os.remove(DB)
os.environ["DATABASE_PATH"] = DB
sys.path.insert(0, r"D:\下载的文件\学习工作台\server")

import database
from database import (Base, User, Friend, FriendRemark, ChatGroup,
                      ChatGroupMember, Message)
from sqlalchemy.orm import Session
import wsmanager
async def _noop_send(*a, **k):
    return None
wsmanager.send_to = _noop_send  # 阻断 ws 副作用
import security
from fastapi import Depends
from main import app
from fastapi.testclient import TestClient

Base.metadata.create_all(database.engine)

OUT = r"D:\下载的文件\学习工作台\tools\qa\r72\r72_backend.txt"
checks = []  # (name, status, detail)

def C(name, ok, detail=""):
    checks.append((name, "PASS" if ok else "FAIL", detail))

_cur = {"id": None}

def fake_get_user(db: Session = Depends(database.get_db)):
    return db.get(User, _cur["id"])
app.dependency_overrides[security.get_current_user] = fake_get_user

client = TestClient(app)

def login(uid):
    _cur["id"] = uid

def mk_user(name, admin=False):
    db = database.SessionLocal()
    u = User(username=name, password_hash="x", nickname=name,
             is_admin=admin, created_at="2026-09-17 00:00:00")
    db.add(u); db.commit(); db.refresh(u); db.close()
    return u.id

# ---------- 种子 ----------
uA = mk_user("userA")
uB = mk_user("userB")
uAdmin = mk_user("adminX", admin=True)
db = database.SessionLocal()
a, b = database.friend_pair(uA, uB)
db.add(Friend(user_a=a, user_b=b, created_at="2026-09-17 00:00:00"))
db.commit(); db.close()

def send_msg(sender, peer, content):
    login(sender)
    r = client.post(f"/api/chat/{peer}/messages", json={"content": content})
    assert r.status_code == 200, (r.status_code, r.text)
    return r.json()

def set_remark(owner, peer, remark):
    login(owner)
    r = client.put(f"/api/friends/{peer}/remark", json={"remark": remark})
    return r

# ===== Bug1 会话列表回归 =====
# A -> admin 发消息
send_msg(uA, uAdmin, "你好管理员")
# admin 拉取 A 的会话并置已读
login(uAdmin)
r = client.get(f"/api/chat/{uA}/messages?mark_read=1")
C("Bug1-admin读A消息-200", r.status_code == 200)
# admin 回复 A
send_msg(uAdmin, uA, "已收到")
# admin 视角 conversations 必须仍含 A
login(uAdmin)
r = client.get("/api/chat/conversations")
j = r.json()
ids = [it["peerId"] for it in j["items"]]
C("Bug1-admin会话仍含A(核心回归)", uA in ids, f"items={ids}")
conv_a = next((it for it in j["items"] if it["peerId"] == uA), None)
C("Bug1-admin对A未读=0", conv_a and conv_a["unreadCount"] == 0,
  f"unread={conv_a['unreadCount'] if conv_a else 'NA'}")
C("Bug1-admin对A最后消息=回复内容",
  conv_a and conv_a["lastMessage"] and conv_a["lastMessage"]["content"] == "已收到"
  and conv_a["lastMessage"]["senderId"] == uAdmin)
C("Bug1-admin会话带peerRemark字段", conv_a and "peerRemark" in conv_a)

# A 视角：conversations 含 admin（有消息）+ B（好友无消息）
login(uA)
r = client.get("/api/chat/conversations")
j = r.json()
idsA = [it["peerId"] for it in j["items"]]
C("Bug1-A会话含admin", uAdmin in idsA, f"ids={idsA}")
bconv = next((it for it in j["items"] if it["peerId"] == uB), None)
C("Bug1-A会话含好友B(无消息)", bconv is not None)
C("Bug1-A对B无消息-lastMessage为null", bconv and bconv["lastMessage"] is None)
C("Bug1-A对admin未读=1",
  (next((it for it in j["items"] if it["peerId"] == uAdmin), None) or {}).get("unreadCount") == 1)

# limit 上限
login(uA)
r = client.get("/api/chat/conversations?limit=1")
j = r.json()
C("Bug1-limit=1返回<=1项且total正确",
  len(j["items"]) <= 1 and j["total"] == len(idsA), f"len={len(j['items'])} total={j['total']}")
r = client.get("/api/chat/conversations?limit=9999")
C("Bug1-limit封顶500", r.json()["total"] <= 500)

# unread 带 peerRemark：A 给 admin 设备注，A 视角 unread 含 admin 且 peerRemark
set_remark(uA, uAdmin, " boss管理员")
login(uA)
r = client.get("/api/chat/unread")
j = r.json()
un = next((it for it in j["items"] if it["peerId"] == uAdmin), None)
C("Bug1-unread含admin", un is not None)
C("Bug1-unread带peerRemark", un and un.get("peerRemark") == "boss管理员",
  f"peerRemark={un.get('peerRemark') if un else 'NA'}")

# ===== Bug2 群列表 =====
db = database.SessionLocal()
g = ChatGroup(name="测试群", owner_id=uA, created_at="2026-09-17 00:00:00")
db.add(g); db.flush()
db.add(ChatGroupMember(group_id=g.id, user_id=uA, role="owner", last_read_msg_id=0, joined_at="2026-09-17 00:00:00"))
db.add(ChatGroupMember(group_id=g.id, user_id=uB, role="member", last_read_msg_id=0, joined_at="2026-09-17 00:00:00"))
db.commit(); db.close()
GID = g.id

login(uA)
r = client.get("/api/groups")
j = r.json()
gA = next((it for it in j["items"] if it["id"] == GID), None)
C("Bug2-群主A role=owner", gA and gA["role"] == "owner", f"role={gA['role'] if gA else 'NA'}")
login(uB)
r = client.get("/api/groups")
j = r.json()
gB = next((it for it in j["items"] if it["id"] == GID), None)
C("Bug2-普通成员B role=member", gB and gB["role"] == "member", f"role={gB['role'] if gB else 'NA'}")

login(uAdmin)
r = client.get("/api/groups")
j = r.json()
gAd = next((it for it in j["items"] if it["id"] == GID), None)
C("Bug2-管理员可见全部群", gAd is not None, f"count={len(j['items'])}")
C("Bug2-管理员 role=admin-view", gAd and gAd["role"] == "admin-view", f"role={gAd['role'] if gAd else 'NA'}")
C("Bug2-管理员 unreadCount=0", gAd and gAd["unreadCount"] == 0)
# 管理员点群详情仍 403
r = client.get(f"/api/groups/{GID}")
C("Bug2-管理员群详情仍403(只读)", r.status_code == 403, f"status={r.status_code}")

# ===== Bug3 备注昵称 =====
# 写
r = set_remark(uA, uB, "我的好友B")
C("Bug3-设置备注200", r.status_code == 200, r.text[:120])
C("Bug3-返回peerRemark正确", r.status_code == 200 and r.json().get("peerRemark") == "我的好友B")
# 超长截断20
longr = "备注" * 15  # 30字
r = set_remark(uA, uB, longr)
got = r.json().get("peerRemark", "")
C("Bug3-超长截断<=20字", len(got) <= 20, f"len={len(got)} val={got}")
# list_friends 带 peerRemark
login(uA)
r = client.get("/api/friends")
j = r.json()
fb = next((it for it in j["items"] if it["id"] == uB), None)
C("Bug3-list_friends带peerRemark", fb and fb.get("peerRemark") == got, f"peerRemark={fb.get('peerRemark') if fb else 'NA'}")
# conversations 带 peerRemark（A视角对B）
login(uA)
r = client.get("/api/chat/conversations")
j = r.json()
cb = next((it for it in j["items"] if it["peerId"] == uB), None)
C("Bug3-conversations带peerRemark", cb and cb.get("peerRemark") == got)
# 隔离性：B 视角看不到 A 给 B 的备注
login(uB)
r = client.get("/api/friends")
j = r.json()
fa = next((it for it in j["items"] if it["id"] == uA), None)
C("Bug3-隔离性:B的friends中A的peerRemark为空(隐私红线)",
  fa is not None and fa.get("peerRemark") == "", f"peerRemark={fa.get('peerRemark') if fa else 'NA'}")
login(uB)
r = client.get("/api/chat/conversations")
j = r.json()
ca = next((it for it in j["items"] if it["peerId"] == uA), None)
C("Bug3-隔离性:B的conversations中A的peerRemark为空",
  ca is not None and ca.get("peerRemark") == "")
# 非好友 403
uC = mk_user("userC")  # 与 A 非好友、非管理员
r = set_remark(uA, uC, "对陌生人的备注")
C("Bug3-非好友403", r.status_code == 403, f"status={r.status_code}")
# 对自己 400
r = set_remark(uA, uA, "给自己")
C("Bug3-给自己400", r.status_code == 400, f"status={r.status_code}")
# 清除
r = set_remark(uA, uB, "   ")
C("Bug3-清空备注200", r.status_code == 200 and r.json().get("peerRemark") == "")
login(uA)
r = client.get("/api/friends")
j = r.json()
fb2 = next((it for it in j["items"] if it["id"] == uB), None)
C("Bug3-清除后friends peerRemark为空", fb2 and fb2.get("peerRemark") == "")

# ---------- 输出 ----------
lines = ["R72 后端独立回归（项2/4/5后端）", "=" * 60]
for name, st, detail in checks:
    lines.append("[%s] %s  %s" % (st, name, detail))
lines.append("=" * 60)
np = sum(1 for _, s, _ in checks if s == "PASS")
nf = sum(1 for _, s, _ in checks if s == "FAIL")
lines.append("后端用例 PASS=%d FAIL=%d" % (np, nf))
open(OUT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines))
