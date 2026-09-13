"""帮助与反馈路由（P0-7，2026-09-11 增量）。

限频：每用户 10 分钟 ≤1 条、每天 ≤5 条（进程内滑动窗口，决策见架构文档 §1.7）。
匿名：anonymous=true 时 user_id 仍落库（防滥用），但对外回显绝不出现昵称。
【后续扩展点：反馈处理台】—— 管理员查询/更新接口本轮不实现。
"""
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import Feedback, User, get_db, now_iso
from schemas import FeedbackIn
from security import get_current_user

router = APIRouter(prefix="/api/feedbacks", tags=["feedbacks"])

_TEN_MINUTES = 10 * 60
_DAY_SECONDS = 24 * 60 * 60
_MAX_PER_TEN_MIN = 1
_MAX_PER_DAY = 5

# uid -> deque[epoch]（10 分钟窗口） / uid -> deque[epoch]（自然日窗口，按时间戳近似）
_ten_min_buckets: dict[int, deque[float]] = defaultdict(deque)
_day_buckets: dict[int, deque[float]] = defaultdict(deque)


def _check_rate_limit(uid: int) -> None:
    now = time.time()
    q10 = _ten_min_buckets[uid]
    while q10 and now - q10[0] > _TEN_MINUTES:
        q10.popleft()
    if len(q10) >= _MAX_PER_TEN_MIN:
        raise HTTPException(429, "提交太频繁，请 10 分钟后再试")
    qd = _day_buckets[uid]
    while qd and now - qd[0] > _DAY_SECONDS:
        qd.popleft()
    if len(qd) >= _MAX_PER_DAY:
        raise HTTPException(429, "今天已提交 5 条反馈，请明天再来")


@router.post("")
def submit_feedback(body: FeedbackIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """提交反馈：content ≥10 字（pydantic 校验）；成功返回编号。"""
    content = body.content.strip()
    if len(content) < 10:
        raise HTTPException(400, "反馈描述至少 10 个字")
    if body.type not in ("bug", "suggest", "content", "other"):
        raise HTTPException(400, "反馈类型不合法")
    screenshot = body.screenshot or None
    if screenshot and not screenshot.startswith("/uploads/images/"):
        raise HTTPException(400, "截图地址不合法")
    _check_rate_limit(user.id)
    f = Feedback(user_id=user.id, type=body.type, content=content,
                 screenshot=screenshot, status="pending", created_at=now_iso())
    db.add(f)
    db.commit()
    # 记入限流窗口（仅成功时）
    now = time.time()
    _ten_min_buckets[user.id].append(now)
    _day_buckets[user.id].append(now)
    return {"id": f.id}


@router.get("/mine")
def my_feedbacks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """我的反馈列表（状态 + 时间）；回显不出现昵称（匿名与否均不回显）。"""
    rows = (
        db.query(Feedback)
        .filter(Feedback.user_id == user.id)
        .order_by(Feedback.id.desc())
        .limit(50)
        .all()
    )
    return {"items": [
        {
            "id": f.id,
            "type": f.type,
            "content": f.content,
            "screenshot": f.screenshot,
            "status": f.status,  # pending / replied
            "createdAt": f.created_at,
            # 需求01：管理员回复（未回复时为空串 / NULL）
            "reply": f.reply or "",
            "repliedAt": f.replied_at or "",
        }
        for f in rows
    ]}


def feedback_admin() -> None:
    """【后续扩展点：反馈处理台】管理员查询/标记已处理接口，本轮留空实现。"""
    return None
