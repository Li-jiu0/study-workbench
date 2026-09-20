# -*- coding: utf-8 -*-
"""批5：实时位置共享会话接口（私聊 + 群聊），传输无关。

契约（_r104e_contract.txt / _r104e_L1_backend.txt）：
- 坐标流**绝不落库**：tick 只改进程内内存；DB 仅「会话元数据 1 行」+「≥30s 一次的同 ID 心跳 UPDATE」。
- 单进程假定（线上 uvicorn 单 worker 已实测）；进程重启后内存索引清零 → state 回退查 DB 该行。
- 过期惰性判定（expires_at），**不起后台线程 / 定时任务**。
- 不调 geocoder / place/v1（start 只落卡片，不取地址标签）→ geocoder 出网 == 0。
- 隐私：state 只回当前坐标（无轨迹）；日志绝不打印 lat/lng。
- 限流用既有 rate_limit("default")（600/分/IP），**绝不挂 rate_limit("geo")**。
"""
import time
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import (ChatGroupMember, LiveLocation, User, can_message, get_db,
                      now_iso)
from rate_limit import rate_limit
from routers.chat import send_live_card
from routers.groups import send_group_card
from security import get_current_user

router = APIRouter(prefix="/api/live", tags=["live"])

# ---- 进程内状态（单进程假定；重启即清零，DB 行兜底）----
# _LIVE[shareId] = {owner, peer, group, lat, lng, ts(monotonic基准=time.time), exp(epoch秒),
#                   ended(bool), last_db_hb(上次落盘 epoch秒)}
_LIVE: dict[str, dict] = {}
# 双向私聊索引：键 (min(a,b), max(a,b)) → 该对上所有 active 会话 shareId 列表。
# 双向共享：A、B 各自 start 后并存两条会话，列表 append/remove；列表空则整个键 pop（防慢泄漏）。
_LIVE_BY_PEER: dict[tuple[int, int], list[str]] = {}
# 群聊索引：groupId → 该群所有 active 会话 shareId 列表
_LIVE_BY_GROUP: dict[int, list[str]] = {}

_LIVE_SHARE_MAX_SEC = 3600   # 单次共享时长上限 60 分钟（到期惰性结束）
_LIVE_STALE_SEC = 60         # 心跳超过 60s → stale（App 被杀 / 断网）
_LIVE_DB_HB_SEC = 30         # DB 心跳最小间隔（同 ID UPDATE，绝不 INSERT）


def _pair(a: int, b: int) -> tuple[int, int]:
    """私聊双向键归一化（小号在前），保证 A→B 与 B→A 命中同一会话。"""
    return (a, b) if a < b else (b, a)


def _ms(t: float) -> int:
    """epoch 秒 → epoch 毫秒（与前端 Date.now() 同单位）。"""
    return int(t * 1000)


def _iso(t: float) -> str:
    """epoch 秒 → 'YYYY-MM-DD HH:MM:SS'（与 now_iso() 同格式，供 DB 存/比）。"""
    return datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M:%S")


def _parse_iso(s: str) -> float | None:
    """'YYYY-MM-DD HH:MM:SS' → epoch 秒；解析失败返回 None（绝不抛）。"""
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").timestamp()
    except (TypeError, ValueError):
        return None


def _hydrate(row: LiveLocation) -> dict:
    """把 DB 行回填成内存条目（进程重启后 state/tick 兜底用）。

    守护：仅 active（未 ended 且未过期）的行才写二级索引；ended/expired 行只回填 _LIVE
    （供 tick 返回 403「共享已结束」用），绝不进索引——顺带修掉「ended 行覆盖索引」的隐患。
    """
    it = {
        "owner": row.owner_id,
        "peer": row.peer_id,
        "group": row.group_id,
        "lat": row.last_lat,
        "lng": row.last_lng,
        "ts": _parse_iso(row.last_seen) or time.time(),
        "exp": _parse_iso(row.expires_at) or time.time(),
        "ended": (row.state != "active"),
        "last_db_hb": time.time(),
    }
    _LIVE[row.share_id] = it
    if (not it["ended"]) and time.time() <= it["exp"]:
        if it["peer"]:
            key = _pair(it["owner"], it["peer"])
            lst = _LIVE_BY_PEER.setdefault(key, [])
            if row.share_id not in lst:
                lst.append(row.share_id)
        elif it["group"]:
            lst = _LIVE_BY_GROUP.setdefault(it["group"], [])
            if row.share_id not in lst:
                lst.append(row.share_id)
    return it


def _drop_indexes(it: dict, share_id: str) -> None:
    """从内存索引摘除一个会话（stop / 覆盖旧会话时用）：按值 remove，列表空则摘键防慢泄漏。"""
    _LIVE.pop(share_id, None)
    if it.get("peer"):
        key = _pair(it["owner"], it["peer"])
        lst = _LIVE_BY_PEER.get(key)
        if lst is not None:
            try:
                lst.remove(share_id)
            except ValueError:
                pass
            if not lst:
                _LIVE_BY_PEER.pop(key, None)
    if it.get("group"):
        lst = _LIVE_BY_GROUP.get(it["group"])
        if lst is not None:
            try:
                lst.remove(share_id)
            except ValueError:
                pass
            if not lst:
                _LIVE_BY_GROUP.pop(it["group"], None)


def _end_row(db: Session, row: LiveLocation | None) -> None:
    """把 DB 行置为 ended（幂等；行可能不存在，静默跳过）。"""
    if row is not None and row.state != "ended":
        row.state = "ended"
        db.commit()


def _active(it: dict, now: float) -> bool:
    """惰性判定是否仍在共享中（未 stop 且未过期）。"""
    return (not it.get("ended")) and now <= it.get("exp", 0)


class StartIn(BaseModel):
    """start 入参：peerId / groupId 二选一。"""
    peerId: int | None = None
    groupId: int | None = None


class TickIn(BaseModel):
    """tick 入参：shareId + 坐标（**只进内存，不落库**）。"""
    shareId: str = Field(min_length=1, max_length=36)
    lat: float
    lng: float


class StopIn(BaseModel):
    """stop 入参。"""
    shareId: str = Field(min_length=1, max_length=36)


@router.post("/start")
async def live_start(body: StartIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db),
                     _rl: None = Depends(rate_limit("default"))):
    """开始共享实时位置。

    - 私聊：复用 can_message（好友 / 管理员放行），否则 403；
    - 群聊：必须是群成员，否则 403；
    - 幂等：本人已有 active 会话 → 先自动结束旧的，再开新的（不报错）；
    - 副作用：往消息流落 1 张 kind=location_live 系统卡片（**不含坐标**），私聊/群聊各走对应路径。
    """
    peer = int(body.peerId or 0)
    gid = int(body.groupId or 0)
    if bool(peer) == bool(gid):  # 都缺 / 都给
        raise HTTPException(400, "peerId / groupId 必须二选一")
    if peer:
        if peer == user.id or not can_message(db, user.id, peer):
            raise HTTPException(403, "仅好友之间可以共享位置")
    else:
        m = db.query(ChatGroupMember).filter(
            ChatGroupMember.group_id == gid, ChatGroupMember.user_id == user.id).first()
        if not m:
            raise HTTPException(403, "你不是该群成员")

    # 幂等：本人已有 active 会话 → 先自动结束旧的（不落卡片，避免噪音）
    _end_existing(db, user.id, peer=peer or None, group=gid or None)

    share_id = uuid.uuid4().hex  # 32 字符（≤36）
    now = time.time()
    exp = now + _LIVE_SHARE_MAX_SEC
    db.add(LiveLocation(share_id=share_id, owner_id=user.id, peer_id=peer or None,
                        group_id=gid or None, state="active", last_lat=None, last_lng=None,
                        last_seen=None, created_at=now_iso(), expires_at=_iso(exp)))
    db.commit()
    _LIVE[share_id] = {"owner": user.id, "peer": peer or None, "group": gid or None,
                       "lat": None, "lng": None, "ts": now, "exp": exp, "ended": False,
                       "last_db_hb": now}
    if peer:
        lst = _LIVE_BY_PEER.setdefault(_pair(user.id, peer), [])
        if share_id not in lst:
            lst.append(share_id)
    else:
        lst = _LIVE_BY_GROUP.setdefault(gid, [])
        if share_id not in lst:
            lst.append(share_id)

    # 系统卡片（只有文案，无坐标）：私聊 / 群聊各走自己的落库+推送路径
    if peer:
        await send_live_card(db, user, peer, "开始共享实时位置", share_id)
    else:
        await send_group_card(db, gid, user, "开始共享实时位置", share_id)
    return {"ok": True, "shareId": share_id, "expiresAt": _ms(exp)}


def _end_existing(db: Session, owner: int, peer: int | None, group: int | None) -> None:
    """结束本人「同一目标」上所有仍 active 的旧会话（幂等；不落卡片）。

    双向共享后同一 pair/群下本人可能残留多条历史会话，.all() 全部清干净
    （不再只结最新一条），pair/群列表里只剩对方会话（若有）+ 本人新会话。
    """
    q = db.query(LiveLocation).filter(LiveLocation.owner_id == owner,
                                      LiveLocation.state == "active")
    if peer:
        q = q.filter(LiveLocation.peer_id == peer, LiveLocation.group_id.is_(None))
    else:
        q = q.filter(LiveLocation.group_id == group)
    for row in q.order_by(LiveLocation.id.desc()).all():
        it = _LIVE.get(row.share_id) or _hydrate(row)
        it["ended"] = True
        _drop_indexes(it, row.share_id)
        _end_row(db, row)


@router.post("/tick")
def live_tick(body: TickIn, user: User = Depends(get_current_user),
              db: Session = Depends(get_db),
              _rl: None = Depends(rate_limit("default"))):
    """上报一次坐标（安卓前台服务原生调用）。

    - **绝不写 messages**；只改内存，外加「≥30s 一次的 DB 心跳同 ID UPDATE」；
    - 仅会话发起人可 tick；越权一律 403（不用 404，避免泄露存在性）；
    - 进程重启后内存缺失 → 回退查 DB 该行（owner 仍可续报）。
    """
    it = _LIVE.get(body.shareId)
    row = None
    if it is None:
        row = db.query(LiveLocation).filter(
            LiveLocation.share_id == body.shareId).first()
        if row is None or row.owner_id != user.id:
            raise HTTPException(403, "无权更新该共享")
        it = _hydrate(row)
    if it["owner"] != user.id:
        raise HTTPException(403, "无权更新该共享")
    now = time.time()
    if not _active(it, now):
        raise HTTPException(403, "共享已结束")

    it["lat"], it["lng"], it["ts"] = body.lat, body.lng, now
    # DB 心跳：≥30s 一次，UPDATE 同一行（绝不 INSERT / 绝不追加轨迹）
    if now - it.get("last_db_hb", 0.0) >= _LIVE_DB_HB_SEC:
        it["last_db_hb"] = now
        if row is None:
            row = db.query(LiveLocation).filter(LiveLocation.share_id == body.shareId).first()
        if row is not None:
            row.last_lat, row.last_lng, row.last_seen = body.lat, body.lng, now_iso()
            db.commit()
    return {"ok": True}


@router.post("/stop")
async def live_stop(body: StopIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db),
                    _rl: None = Depends(rate_limit("default"))):
    """结束共享（幂等）：内存摘除 + DB 行置 ended + 落 1 张「已结束」卡片（仅首次）。"""
    it = _LIVE.get(body.shareId)
    row = db.query(LiveLocation).filter(LiveLocation.share_id == body.shareId).first()
    owner = it["owner"] if it else (row.owner_id if row else None)
    if owner is None or owner != user.id:
        raise HTTPException(403, "无权结束该共享")
    was_active = bool((it and _active(it, time.time()))
                      or (row is not None and row.state == "active"))
    peer = (it or {}).get("peer") or (row.peer_id if row else None)
    gid = (it or {}).get("group") or (row.group_id if row else None)
    if it is not None:
        it["ended"] = True
        _drop_indexes(it, body.shareId)
    _end_row(db, row)
    # 只有从 active 变为 ended 才落卡片（重复 stop 不刷屏）；到期自动结束不落卡片
    if was_active:
        sender = db.get(User, user.id)
        if peer:
            await send_live_card(db, sender, peer, "已结束实时位置共享", body.shareId)
        elif gid:
            await send_group_card(db, gid, sender, "已结束实时位置共享", body.shareId)
    return {"ok": True}


@router.get("/state")
def live_state(peerId: int = 0, groupId: int = 0,
               user: User = Depends(get_current_user), db: Session = Depends(get_db),
               _rl: None = Depends(rate_limit("default"))):
    """查询「我对该对端 / 该群」当前是否有人在共享及其当前坐标（**不含轨迹**）。

    读取顺序：先内存（命中零 DB 查询）→ 内存没有（进程重启过）才查 DB 并回填内存。
    返回该对/该群下**所有** active 会话列表（sessions[]），另附顶层旧字段兼容层。
    """
    if bool(peerId) == bool(groupId):
        raise HTTPException(400, "peerId / groupId 必须二选一")
    now = time.time()
    pairs: list[tuple[str, dict]] = []  # (share_id, it) —— 该对/群下全部候选会话
    if peerId:
        key = _pair(user.id, peerId)
        for sid in list(_LIVE_BY_PEER.get(key, [])):
            it = _LIVE.get(sid)
            if it is not None and _active(it, now):
                pairs.append((sid, it))
        if not pairs:
            a, b = key
            rows = (db.query(LiveLocation)
                    .filter(LiveLocation.state == "active", LiveLocation.group_id.is_(None))
                    .filter(((LiveLocation.owner_id == a) & (LiveLocation.peer_id == b))
                            | ((LiveLocation.owner_id == b) & (LiveLocation.peer_id == a)))
                    .order_by(LiveLocation.id.desc()).all())
            for row in rows:
                it = _LIVE.get(row.share_id) or _hydrate(row)
                if _active(it, now):
                    pairs.append((row.share_id, it))
    else:
        if not db.query(ChatGroupMember).filter(
                ChatGroupMember.group_id == groupId,
                ChatGroupMember.user_id == user.id).first():
            raise HTTPException(403, "你不是该群成员")
        for sid in list(_LIVE_BY_GROUP.get(groupId, [])):
            it = _LIVE.get(sid)
            if it is not None and _active(it, now):
                pairs.append((sid, it))
        if not pairs:
            rows = (db.query(LiveLocation)
                    .filter(LiveLocation.group_id == groupId,
                            LiveLocation.state == "active")
                    .order_by(LiveLocation.id.desc()).all())
            for row in rows:
                it = _LIVE.get(row.share_id) or _hydrate(row)
                if _active(it, now):
                    pairs.append((row.share_id, it))

    if not pairs:
        return {"ok": True, "active": False, "shareId": "", "sharerId": 0,
                "lat": None, "lng": None, "updatedAt": 0, "stale": True}

    # 发起人昵称批量取齐（每 uid 至多一次 db.get，不逐条查询）
    owners: dict[int, str] = {}
    for _sid, it in pairs:
        if it["owner"] not in owners:
            u = db.get(User, it["owner"])
            owners[it["owner"]] = ((u.nickname or "") if u else "")

    sessions = []
    for sid, it in pairs:
        lat, lng = it["lat"], it["lng"]
        # hasFix 语义锁定：lat/lng 均非 None 才算就绪；绝不把 null 转 0、绝不返回 0 坐标
        has_fix = (lat is not None) and (lng is not None)
        sessions.append({
            "shareId": sid,
            "sharerId": it["owner"],
            "sharerName": owners.get(it["owner"], ""),
            "lat": lat,
            "lng": lng,
            "hasFix": has_fix,
            "updatedAt": _ms(it["ts"]),
            "stale": (now - it["ts"]) > _LIVE_STALE_SEC,
        })
    sessions.sort(key=lambda s: s["updatedAt"], reverse=True)  # 最新坐标在前（稳定排序）

    # ===== 旧字段兼容层：优先取 peer（=对方发起）的会话，还原旧行为「显示对方坐标」；
    # 无 peer 会话时取任一条（updatedAt 最高，即 sessions[0]）。新前端只读 sessions[]，互不干扰。
    top = sessions[0]
    if peerId:
        for s in sessions:
            if s["sharerId"] == peerId:
                top = s
                break
    return {
        "ok": True,
        "active": True,
        "count": len(sessions),
        "sessions": sessions,
        # 以下顶层旧字段仅供旧缓存页面兼容（类型与升级前完全一致）
        "shareId": top["shareId"],
        "sharerId": top["sharerId"],
        "lat": top["lat"],
        "lng": top["lng"],
        "updatedAt": top["updatedAt"],
        "stale": top["stale"],
    }
