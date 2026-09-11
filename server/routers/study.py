"""学习行为日志路由（P0-8 统计底座，2026-09-11 增量）。

前端 study-stats.js 本地优先（渲染只读 localStorage），此处仅做云端汇聚：
- POST /api/study/logs：批量上报（≤100 条/次），幂等去重键 user_id+module+event+payload+createdAt。
- GET /api/study/summary?module=xxx：近 7 天每日分钟数/事件数 + 累计事件数。
【后续扩展点：账号级云同步 syncFromCloud】—— 本轮不实现合并逻辑。
"""
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import StudyLog, User, get_db, now_str
from schemas import StudyLogBatchIn
from security import get_current_user

router = APIRouter(prefix="/api/study", tags=["study"])

_VALID_MODULES = ("cet4", "xingce", "eq", "etiquette", "ppt", "tools")


def _payload_hash(payload: dict) -> str:
    """payload 规范化 JSON 的 md5（幂等判重用）。"""
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(canonical.encode("utf-8")).hexdigest()


@router.post("/logs")
def batch_upload(body: StudyLogBatchIn, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """批量上报学习日志；重复提交不产生重复行（按规范化 payload + createdAt 判重）。"""
    added = 0
    seen_in_batch: set[tuple] = set()
    for item in body.logs:
        if item.module not in _VALID_MODULES:
            raise HTTPException(400, f"未知模块 {item.module}")
        created = (item.createdAt or "").strip()[:19] or now_str()
        payload_json = json.dumps(item.payload, sort_keys=True, ensure_ascii=False)
        ph = _payload_hash(item.payload)
        key = (item.module, item.event, payload_json, created)
        if key in seen_in_batch:
            continue
        seen_in_batch.add(key)
        exists = db.query(StudyLog.id).filter(
            StudyLog.user_id == user.id, StudyLog.module == item.module,
            StudyLog.event == item.event, StudyLog.payload == payload_json,
            StudyLog.created_at == created,
        ).first()
        if exists:
            continue
        db.add(StudyLog(user_id=user.id, module=item.module, event=item.event,
                        payload=payload_json, created_at=created))
        added += 1
    db.commit()
    return {"ok": True, "added": added, "received": len(body.logs)}


@router.get("/summary")
def summary(module: str = Query(default=""), user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    """聚合：近 7 天每日分钟数（payload.minutes 求和）/事件数 + 累计事件数。"""
    import datetime

    if module and module not in _VALID_MODULES:
        raise HTTPException(400, f"未知模块 {module}")
    cond = StudyLog.user_id == user.id
    if module:
        cond = cond & (StudyLog.module == module)
    since = (datetime.date.today() - datetime.timedelta(days=6)).strftime("%Y-%m-%d")
    recent = db.query(StudyLog).filter(cond, StudyLog.created_at >= since).all()

    days: dict[str, dict] = {}
    total_events = 0
    for r in recent:
        day = r.created_at[:10]
        d = days.setdefault(day, {"date": day, "minutes": 0, "events": 0})
        d["events"] += 1
        total_events += 1
        try:
            p = json.loads(r.payload or "{}")
            d["minutes"] += int(p.get("minutes", 0) or 0)
        except (ValueError, TypeError):
            pass
    day_list = [days[k] for k in sorted(days)]
    return {
        "module": module or "all",
        "days": day_list,
        "totalEvents": total_events,
        "totalMinutes": sum(d["minutes"] for d in day_list),
    }


def sync_from_cloud() -> None:
    """【后续扩展点：study-stats 云端合并】多设备统计合并逻辑，本轮留空实现。"""
    return None
