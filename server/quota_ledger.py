"""模型免费额度账本（服务端统一累计）。

背景：火山方舟（Ark / 豆包）的免费额度是**账号级共享**的，不是每个用户一份。
前端 localStorage 各算各的，多人并发会严重超量导致账号欠费。因此所有调用量必须
在服务端累计到同一个账本，达到额度上限后自动停用该模型。

对外能力：
    check_quota(model_id)               -> (allowed, reason)  转发前额度检查（只拦未过期的 402 标记）
    record_usage(model_id, amount, ok)  -> dict               累计一次消耗（成功调用自愈/校准）
    ledger_snapshot()                   -> dict               GET /api/ai/usage 数据
    reset_usage(model_id, reset_all)    -> dict               充值后重置
    force_exhaust(model_id)             -> dict               上游 402 时打 24h 临时耗尽标记（自愈式）
    resolve_model_name(provider, mid)   -> str                modelId -> 真实模型名

持久化：server/data/model_usage.json
    {"models": {"<modelId>": {"used": n, "calls": n, "failCalls": n, "updatedAt": ""}},
     "updatedAt": ""}
    原子写（.tmp + os.replace）；内存缓存 + 5 秒定时落盘 + 进程退出 flush，
    既扛得住高频上报，进程重启也不丢。

额度表：server/data/model_quota.json
    {"<modelId>": {"freeQuota": 500000, "quotaType": "tokens"}}
    表里没有的 modelId 视为「无额度限制」放行，绝不误拦。
"""
import atexit
import json
import os
import threading
import time
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
USAGE_PATH = DATA_DIR / "model_usage.json"
QUOTA_PATH = DATA_DIR / "model_quota.json"
REGISTRY_PATH = DATA_DIR / "model_registry.json"

# 落盘间隔（秒）：高频 consume 只改内存，定期批量落盘，避免每次全量重写大 JSON
FLUSH_INTERVAL = 5.0
# 单次上报的用量上限，防止恶意刷大数字把模型一次性打停
MAX_AMOUNT = 100000
# 剩余比例 <= 20% 视为 low，= 0 视为 exhausted
LOW_RATIO = 0.2
# R151：上游 402 打的 blocked 标记有效期（秒）。超过即自动过期进入自愈重试窗口，
# 真耗尽会被上游再次 402 重新打标（闭环）；误报 / 已充值则靠成功调用或超时自愈。
BLOCK_TTL_SECONDS = 86400

_lock = threading.RLock()

_usage: dict = {"models": {}, "updatedAt": ""}
_quota: dict = {}
_registry: dict = {}
_loaded = False
_dirty = False
_last_flush_ts = 0.0
_worker_started = False


def _now() -> str:
    """本地时间 ISO（秒级），与项目其余地方 now_iso() 的格式保持一致。"""
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


def _default_usage() -> dict:
    return {"models": {}, "updatedAt": ""}


def _read_json(path: Path, default: dict) -> dict:
    """读 JSON 文件；缺失 / 空 / 损坏时返回 default 并告警，绝不抛异常打断启动。"""
    try:
        if not path.exists():
            return json.loads(json.dumps(default))
        raw = path.read_bytes()
        if not raw.strip():
            return json.loads(json.dumps(default))
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            return json.loads(json.dumps(default))
        return data
    except Exception as exc:  # noqa: BLE001 —— 账本损坏不能拖垮服务
        print(f"[WARN] 读取 {path.name} 失败，按空数据处理：{exc}")
        return json.loads(json.dumps(default))


def _atomic_write(path: Path, data: dict) -> None:
    """原子写：先写 .tmp 再 os.replace，避免并发/中断把 JSON 写坏。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                   encoding="utf-8", newline="\n")
    os.replace(tmp, path)


def _load_all() -> None:
    """加载账本 / 额度表 / 模型注册表（线程安全，幂等）。"""
    global _usage, _quota, _registry, _loaded
    if _loaded:
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    usage = _read_json(USAGE_PATH, _default_usage())
    if not isinstance(usage.get("models"), dict):
        usage["models"] = {}
    for key, val in list(usage["models"].items()):
        if not isinstance(val, dict):
            usage["models"][key] = {"used": 0, "calls": 0, "failCalls": 0, "updatedAt": ""}
    usage.setdefault("updatedAt", "")
    _usage = usage

    quota = _read_json(QUOTA_PATH, {})
    _quota = {k: v for k, v in quota.items()
              if not str(k).startswith("_") and isinstance(v, dict)}

    registry = _read_json(REGISTRY_PATH, {})
    _registry = {k: v for k, v in registry.items()
                 if not str(k).startswith("_") and isinstance(v, dict)}

    _loaded = True


def ensure_loaded() -> None:
    """供外部显式预热（路由层每次调用内部也会兜底）。"""
    with _lock:
        _load_all()


def get_quota(model_id: str) -> tuple:
    """返回 (freeQuota, quotaType)；未配置的模型返回 (None, None) 表示不限。"""
    ensure_loaded()
    cfg = _quota.get(model_id) or {}
    quota = cfg.get("freeQuota")
    try:
        quota = int(quota) if quota is not None else None
    except (TypeError, ValueError):
        quota = None
    if quota is not None and quota <= 0:
        quota = None
    qtype = cfg.get("quotaType") or ("tokens" if quota else None)
    return quota, qtype


def _expire_info(model_id: str) -> tuple:
    """读取模型退役日期。

    两张表（model_quota.json / model_registry.json）任一处配了 expireAt 都算数。
    :return: (expireAt: str, expired: bool)。expired = 今天 >= 退役日（当天即算退役）。
    """
    ensure_loaded()
    expire_at = ""
    for table in (_quota.get(model_id), _registry.get(model_id)):
        if isinstance(table, dict):
            val = table.get("expireAt")
            if isinstance(val, str) and val.strip():
                expire_at = val.strip()
                break
    if not expire_at:
        return "", False
    try:
        day = datetime.strptime(expire_at[:10], "%Y-%m-%d").date()
    except ValueError:
        return expire_at, False  # 日期写错就当不退役，绝不误伤
    return expire_at, datetime.now().date() >= day


def _blocked_active(rec: dict) -> bool:
    """rec 里的上游欠费标记（blocked）是否仍有效（未过 24h 自愈窗口）。

    - 无 blocked / 空 rec → False；
    - 有 blocked 但无 blockedAt（旧版账本遗留）→ 视为已过期：放行一次试探，
      真耗尽会被上游 402 重新打上带时间戳的标记，闭环自洽；
    - blockedAt 解析失败 → 同上按已过期处理（绝不因坏数据把模型永久锁死）。
    """
    if not isinstance(rec, dict) or not rec.get("blocked"):
        return False
    at = rec.get("blockedAt")
    if not isinstance(at, str) or not at.strip():
        return False
    try:
        t = datetime.strptime(at[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return False
    return (datetime.now() - t).total_seconds() < BLOCK_TTL_SECONDS


def model_status(model_id: str) -> dict:
    """单个模型的用量 + 额度 + 状态，供 /api/ai/usage 与 consume 返回复用。

    R151 自愈式判定（修复「平台实际还有额度却标已耗尽」）：
      - blocked 且未过 24h → exhausted（唯一硬耗尽口径：上游真实欠费信号）；
      - blocked 超过 24h（或旧账本无 blockedAt）→ 视为未 block，进入自愈重试；
      - remaining<=0 但无 blocked → "low"（口径存疑：账本口径可能低估平台实际
        可用额度），不再判 exhausted，放行试探由上游 402 闭环兜底。
    """
    ensure_loaded()
    free, qtype = get_quota(model_id)
    expire_at, expired = _expire_info(model_id)
    rec = _usage["models"].get(model_id) or {}
    used = int(rec.get("used") or 0)
    calls = int(rec.get("calls") or 0)
    fail_calls = int(rec.get("failCalls") or 0)
    updated_at = rec.get("updatedAt") or ""
    hard_exhausted = _blocked_active(rec)

    if free is None:
        # 额度表里没有 → 不限量放行；仅「未过期的上游欠费标记」算耗尽
        status = "exhausted" if hard_exhausted else "unknown"
        return {
            "used": used,
            "calls": calls,
            "failCalls": fail_calls,
            "updatedAt": updated_at,
            "freeQuota": None,
            "quotaType": None,
            "remaining": None,
            "percent": None,
            "status": status,
            "exhausted": status == "exhausted",
            "expireAt": expire_at,
            "expired": expired,
        }

    remaining = max(free - used, 0)
    # 用超了也只显示 100%，避免前端进度条溢出
    percent = round(min(used * 100.0 / free, 100.0), 1)
    if hard_exhausted:
        # 上游真实欠费信号，优先级最高（即便 remaining 还算得出正数）
        status = "exhausted"
    elif remaining <= free * LOW_RATIO:
        # 含 remaining<=0 的情形：账本口径存疑，给 low 而非 exhausted（R151 自愈式）
        status = "low"
    else:
        status = "ok"
    return {
        "used": used,
        "calls": calls,
        "failCalls": fail_calls,
        "updatedAt": updated_at,
        "freeQuota": free,
        "quotaType": qtype,
        "remaining": remaining,
        "percent": percent,
        "status": status,
        "exhausted": status == "exhausted",
        "expireAt": expire_at,
        "expired": expired,
    }


def ledger_snapshot() -> dict:
    """全量快照：额度表里的模型 + 已产生用量的模型，取并集。"""
    ensure_loaded()
    ids = set(_quota.keys()) | set(_usage["models"].keys())
    return {
        "ok": True,
        "serverTime": _now(),
        "models": {mid: model_status(mid) for mid in sorted(ids)},
    }


def record_usage(model_id: str, amount: int = 1, ok: bool = True) -> dict:
    """累计一次调用消耗。

    :param model_id: 模型 ID（前端 ai-config.js 的 id，或 provider 级兜底 key）
    :param amount:   本次消耗量（tokens / 张 / 个）；缺省 1，负数与非数字按 1
    :param ok:       False 只累加 failCalls，不累加 used
    :return:         该模型最新状态 dict（同 model_status）
    """
    ensure_loaded()
    try:
        amt = int(amount)
    except (TypeError, ValueError):
        amt = 1
    amt = min(max(amt, 0), MAX_AMOUNT)

    with _lock:
        rec = _usage["models"].setdefault(
            model_id, {"used": 0, "calls": 0, "failCalls": 0, "updatedAt": ""})
        rec["calls"] = int(rec.get("calls") or 0) + 1
        if ok:
            if amt <= 0:
                amt = 1
            rec["used"] = int(rec.get("used") or 0) + amt
            # R151 自愈 1：一次成功调用即清除上游欠费标记（账号充值 / 402 误报后自愈）
            if rec.get("blocked"):
                rec["blocked"] = False
                rec.pop("blockedAt", None)
                rec["selfHeals"] = int(rec.get("selfHeals") or 0) + 1
            # R151 自愈 2：口径校准 —— 无欠费标记却 used>=free，说明账本口径低估了
            # 平台实际可用额度（如方舟免费额度外每天另有协作奖励），从本次消耗重新起算。
            # 能成功调用本身就证明平台侧还有额度，校准不会引入真实超耗。
            free_now, _qt = get_quota(model_id)
            if free_now and int(rec.get("used") or 0) >= free_now:
                rec["lastCalibrationFrom"] = int(rec.get("used") or 0)
                rec["used"] = amt
                rec["calibrations"] = int(rec.get("calibrations") or 0) + 1
                rec["lastCalibrationAt"] = _now()
        else:
            rec["failCalls"] = int(rec.get("failCalls") or 0) + 1
        rec["updatedAt"] = _now()
        _mark_dirty()
    return model_status(model_id)


def check_quota(model_id: str) -> tuple:
    """转发前的额度前置检查。

    R151 自愈式：只拦「blocked 且未过 24h 自愈窗口」的硬耗尽；remaining<=0
    不再硬拦——账本口径可能低估平台实际额度（方舟每天另有 200 万协作奖励），
    放行试探，真耗尽会被上游 402 回来重新打标，闭环拦截。

    :return: (allowed: bool, reason: str)。allowed=False 时不要转发，避免产生真实费用。
    """
    status = model_status(model_id)
    if status["exhausted"]:
        return False, "该模型免费额度已用完，请切换其他模型"
    return True, ""


def force_exhaust(model_id: str) -> dict:
    """上游返回 402（账户欠费 / 额度耗尽）时，给该模型打临时耗尽标记。

    R151 自愈式：不再把 used 拉满到 freeQuota（旧做法把账本永久钉死在
    「已耗尽」，账号充值 / 平台口径变化后永远无法恢复——用户投诉的误标根因）。
    现只打 blocked=True + blockedAt 时间戳：
      - 24h 内 model_status / check_quota 按耗尽处理（真实欠费信号）；
      - 超过 24h 自动过期，放行试探；真耗尽会被上游再次 402 重新打标（闭环）；
      - 期间出现一次成功调用（record_usage ok=True）即清除标记。
    额度表里没有该模型时同样生效（free=None 分支按 blocked 判 exhausted）。
    返回值结构不变（仍为该模型最新 model_status）。
    """
    ensure_loaded()
    with _lock:
        rec = _usage["models"].setdefault(
            model_id, {"used": 0, "calls": 0, "failCalls": 0, "updatedAt": ""})
        rec["blocked"] = True
        rec["blockedAt"] = _now()
        rec["updatedAt"] = _now()
        _mark_dirty()
    return model_status(model_id)


def reset_usage(model_id: str = "", reset_all: bool = False) -> dict:
    """充值后重置用量，重新启用模型。

    :param model_id:  指定模型；为空则看 reset_all
    :param reset_all: True 时清空所有模型的用量
    """
    ensure_loaded()
    with _lock:
        if reset_all:
            # 全量重置直接清表，磁盘上不留一堆 0 值条目
            targets = list(_usage["models"].keys())
            _usage["models"] = {}
        elif model_id:
            targets = [model_id]
            _usage["models"][model_id] = {"used": 0, "calls": 0, "failCalls": 0,
                                          "updatedAt": _now()}
        else:
            return {"reset": []}
        _usage["updatedAt"] = _now()
        _mark_dirty()
    flush(force=True)
    return {"reset": targets}


def tokens_from_usage(usage_obj: dict) -> int:
    """从上游响应的 usage 字段里取出本次消耗（total_tokens 优先，否则 prompt+completion）。"""
    if not isinstance(usage_obj, dict):
        return 0
    total = usage_obj.get("total_tokens")
    if isinstance(total, (int, float)) and total > 0:
        return int(total)
    try:
        prompt = int(usage_obj.get("prompt_tokens") or 0)
        completion = int(usage_obj.get("completion_tokens") or 0)
    except (TypeError, ValueError):
        return 0
    return max(prompt + completion, 0)


def known_model_ids() -> set:
    """返回服务端认可的合法 modelId 集合（额度表 ∪ 注册表 ∪ 已有账本键）。

    供 /usage/consume 做白名单校验，防止前端上报不存在的模型名污染账本。
    任何一张表非空即可用；三张全空（未初始化）时返回空集，调用方应放行以免误拦。
    """
    ensure_loaded()
    ids = set(_quota.keys()) | set(_registry.keys()) | set(_usage["models"].keys())
    return {str(k) for k in ids if k and not str(k).startswith("_")}


def _lookup_registry(model_id: str) -> tuple:
    """按 modelId 查注册表，返回 (真实模型名, provider)。

    支持两种 key 形态（R88-M1 修复「选什么都跑同一个模型」）：
      1) modelId 命中 registry 的【键】（如 ark-ds-v4-flash-ga）；
      2) modelId 本身就是【真实模型名】（如 deepseek-v4-flash-ga-260731），
         反查 registry 的 value —— 因为前端 ai-config.js 的 id 与 registry 键
         并不一致（实测 47 个 id 仅 8 个与 registry 键相同），仅按键查会大量落空。
    查不到返回 ("", "")。
    """
    ensure_loaded()
    if not model_id:
        return "", ""
    mid = str(model_id).strip()
    # (1) 按注册表键命中
    entry = _registry.get(mid) or {}
    name = entry.get("model")
    if isinstance(name, str) and name.strip():
        return name.strip(), str(entry.get("provider") or "")
    # (2) 按真实模型名反查（value 命中）
    for _key, _val in _registry.items():
        if not isinstance(_val, dict):
            continue
        if str(_val.get("model") or "").strip() == mid:
            return mid, str(_val.get("provider") or "")
    return "", ""


def resolve_model_name(provider: str, model_id: str) -> str:
    """modelId -> 真实模型名（查 server/data/model_registry.json）。

    严格版：provider 必须匹配（或注册表未标 provider）才返回，用于「转发用哪个模型」。
    查不到就返回空串，调用方回退到 .env 里配置的默认模型。
    """
    name, entry_provider = _lookup_registry(model_id)
    if not name:
        return ""
    if not entry_provider or entry_provider == provider:
        return name
    return ""


def resolve_model_name_lenient(model_id: str) -> str:
    """modelId -> 真实模型名（宽松版，忽略 provider 校验）。

    用于「展示名」等不影响转发的场景：只要注册表能查到就返回真实模型名，
    避免因 provider 记录不全而把真实名丢掉（绝不返回编造值，查不到即空串）。
    """
    name, _provider = _lookup_registry(model_id)
    return name


def _mark_dirty() -> None:
    """标记脏数据；距上次落盘超过间隔就顺手落一次（高频调用也不会每次写盘）。"""
    global _dirty
    _dirty = True
    if time.time() - _last_flush_ts >= FLUSH_INTERVAL:
        flush()


def flush(force: bool = False) -> None:
    """把内存账本落盘。force=True 时无条件写（退出 / 重置用）。"""
    global _dirty, _last_flush_ts
    ensure_loaded()
    with _lock:
        if not _dirty and not force:
            return
        _usage["updatedAt"] = _now()
        _atomic_write(USAGE_PATH, _usage)
        _dirty = False
        _last_flush_ts = time.time()


def _flush_worker() -> None:
    """后台落盘线程：每 FLUSH_INTERVAL 秒检查一次脏标记。"""
    while True:
        time.sleep(FLUSH_INTERVAL)
        try:
            flush()
        except Exception as exc:  # noqa: BLE001
            print(f"[WARN] 用量账本定时落盘失败：{exc}")


def _atexit_flush() -> None:
    try:
        flush(force=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] 用量账本退出前落盘失败：{exc}")


def start_flush_worker() -> None:
    """启动后台落盘线程并注册退出 flush（幂等）。"""
    global _worker_started
    if _worker_started:
        return
    _worker_started = True
    atexit.register(_atexit_flush)
    threading.Thread(target=_flush_worker, name="quota-ledger-flush",
                     daemon=True).start()


start_flush_worker()
