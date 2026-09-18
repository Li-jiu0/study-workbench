# -*- coding: utf-8 -*-
"""R88-F 补丁：P0-1 / P0-2 / /usage/reset fail-closed（方案 A）。

二进制读写、断言行尾 CRLF、断言锚点唯一、替换、写回、复读复验。
用法：python r88f_patch_p0.py
"""
import io
import sys
from pathlib import Path

ROOT = Path(r"D:\下载的文件\学习工作台")
SERVER = ROOT / "server"

AI = SERVER / "routers" / "ai.py"
RL = SERVER / "rate_limit.py"
CFG = SERVER / "config.py"


def read_bytes(p: Path) -> bytes:
    return p.read_bytes()


def assert_crlf(data: bytes, name: str) -> None:
    crlf = data.count(b"\r\n")
    lf = data.count(b"\n") - crlf
    assert crlf > 0 and lf == 0, f"{name} 行尾异常：CRLF={crlf} LF-only={lf}（预期全 CRLF）"


def replace_once(data: bytes, old: str, new: str, name: str) -> bytes:
    """把 old（UTF-8 文本，含 CRLF 由调用方保证）唯一替换为 new。"""
    old_b = old.encode("utf-8")
    new_b = new.encode("utf-8")
    cnt = data.count(old_b)
    assert cnt == 1, f"{name}: 锚点出现 {cnt} 次（要求唯一）\nOLD=\n{old}"
    return data.replace(old_b, new_b, 1)


def write_back(p: Path, data: bytes) -> None:
    p.write_bytes(data)


def main() -> int:
    # =========================================================
    # 1) config.py —— 新增 consume 限流配置
    # =========================================================
    cfg = read_bytes(CFG)
    assert_crlf(cfg, "config.py")
    old_cfg = (
        "# AI 单用户每日调用上限（默认 200 次/天）\r\n"
        "AI_DAILY_LIMIT = int(_get(\"AI_DAILY_LIMIT\", \"200\") or 200)\r\n"
    )
    new_cfg = (
        "# AI 单用户每日调用上限（默认 200 次/天）\r\n"
        "AI_DAILY_LIMIT = int(_get(\"AI_DAILY_LIMIT\", \"200\") or 200)\r\n"
        "# R88-F：前端直连平台后上报用量（POST /api/ai/usage/consume）的限流（次/分钟，按 IP）\r\n"
        "RATE_AI_CONSUME_PER_MIN = int(_get(\"RATE_AI_CONSUME_PER_MIN\", \"60\") or 60)\r\n"
    )
    cfg = replace_once(cfg, old_cfg, new_cfg, "config.py")
    write_back(CFG, cfg)

    # =========================================================
    # 2) rate_limit.py —— 注册 consume 分组
    # =========================================================
    rl = read_bytes(RL)
    assert_crlf(rl, "rate_limit.py")

    old_import = (
        "from config import RATE_AI_PER_MIN, RATE_AUTH_PER_MIN, RATE_GLOBAL_PER_MIN\r\n"
    )
    new_import = (
        "from config import (RATE_AI_CONSUME_PER_MIN, RATE_AI_PER_MIN,\r\n"
        "                    RATE_AUTH_PER_MIN, RATE_GLOBAL_PER_MIN)\r\n"
    )
    rl = replace_once(rl, old_import, new_import, "rate_limit.py import")

    old_limits = (
        "_LIMITS = {\r\n"
        "    \"auth\": RATE_AUTH_PER_MIN,\r\n"
        "    \"ai\": RATE_AI_PER_MIN,\r\n"
        "    \"default\": RATE_GLOBAL_PER_MIN,\r\n"
        "}\r\n"
    )
    new_limits = (
        "_LIMITS = {\r\n"
        "    \"auth\": RATE_AUTH_PER_MIN,\r\n"
        "    \"ai\": RATE_AI_PER_MIN,\r\n"
        "    # R88-F：用量上报（无人登录态的前端直连场景）单独限流，防刷账本\r\n"
        "    \"consume\": RATE_AI_CONSUME_PER_MIN,\r\n"
        "    \"default\": RATE_GLOBAL_PER_MIN,\r\n"
        "}\r\n"
    )
    rl = replace_once(rl, old_limits, new_limits, "rate_limit.py _LIMITS")
    write_back(RL, rl)

    # =========================================================
    # 3) ai.py —— P0-2：/usage/consume 加限流 + modelId 白名单
    # =========================================================
    ai = read_bytes(AI)
    assert_crlf(ai, "ai.py")

    # 3a. 导入：新增 rate_limit 已存在；新增 ensure_loaded 判断白名单需要 registry
    old_imp = (
        "from quota_ledger import (check_quota, force_exhaust, ledger_snapshot,\r\n"
        "                          record_usage, reset_usage, resolve_model_name,\r\n"
        "                          tokens_from_usage)\r\n"
    )
    new_imp = (
        "from quota_ledger import (check_quota, force_exhaust, known_model_ids,\r\n"
        "                          ledger_snapshot, record_usage, reset_usage,\r\n"
        "                          resolve_model_name, tokens_from_usage)\r\n"
    )
    ai = replace_once(ai, old_imp, new_imp, "ai.py import quota_ledger")

    # 3b. /usage/consume 签名 + 白名单校验
    old_consume = (
        "@router.post(\"/usage/consume\")\r\n"
        "def ai_usage_consume(body: dict):\r\n"
        "    \"\"\"前端直连模型平台（生图 / 视频 / 3D 等）后上报消耗。\r\n"
        "\r\n"
        "    入参：{\"modelId\": \"ark-xxx\", \"amount\": 1234, \"ok\": true, \"unit\": \"tokens\"}\r\n"
        "      - modelId 必填；amount 缺省按 1 计（生图按张、视频按个）\r\n"
        "      - ok=false 只累加 failCalls，不累加 used\r\n"
        "    出参：{\"ok\": true, \"used\": 新累计用量, \"status\": \"ok|low|exhausted\"}\r\n"
        "    \"\"\"\r\n"
        "    if not isinstance(body, dict):\r\n"
        "        raise HTTPException(400, \"请求体必须是 JSON 对象\")\r\n"
        "    model_id = str(body.get(\"modelId\") or \"\").strip()\r\n"
        "    if not model_id:\r\n"
        "        raise HTTPException(400, \"缺少 modelId\")\r\n"
    )
    new_consume = (
        "@router.post(\"/usage/consume\")\r\n"
        "def ai_usage_consume(body: dict, _rl: None = Depends(rate_limit(\"consume\"))):\r\n"
        "    \"\"\"前端直连模型平台（生图 / 视频 / 3D 等）后上报消耗。\r\n"
        "\r\n"
        "    入参：{\"modelId\": \"ark-xxx\", \"amount\": 1234, \"ok\": true, \"unit\": \"tokens\"}\r\n"
        "      - modelId 必填，且必须命中 server/data/model_registry.json 白名单\r\n"
        "        （R88-F：防止刷不存在的模型名污染账本 / 无意义涨涨）\r\n"
        "      - amount 缺省按 1 计（生图按张、视频按个）\r\n"
        "      - ok=false 只累加 failCalls，不累加 used\r\n"
        "    出参：{\"ok\": true, \"used\": 新累计用量, \"status\": \"ok|low|exhausted\"}\r\n"
        "    防护（R88-F）：按 IP 限流（默认 60 次/分钟）+ modelId 白名单 + amount 上限。\r\n"
        "    注：本接口服务端无法强制登录（前端视频/3D 上报不带令牌），仅做服务端加固。\r\n"
        "    \"\"\"\r\n"
        "    if not isinstance(body, dict):\r\n"
        "        raise HTTPException(400, \"请求体必须是 JSON 对象\")\r\n"
        "    model_id = str(body.get(\"modelId\") or \"\").strip()\r\n"
        "    if not model_id:\r\n"
        "        raise HTTPException(400, \"缺少 modelId\")\r\n"
        "    if model_id not in known_model_ids():\r\n"
        "        raise HTTPException(400, \"未知的 modelId（不在服务端模型注册表中）\")\r\n"
    )
    ai = replace_once(ai, old_consume, new_consume, "ai.py /usage/consume")

    # =========================================================
    # 4) ai.py —— P0-1：/usage 游客脱敏
    # =========================================================
    old_usage = (
        "@router.get(\"/usage\")\r\n"
        "def ai_usage(user: User = Depends(get_current_user_optional),\r\n"
        "             db: Session = Depends(get_db)):\r\n"
        "    \"\"\"模型用量总账（免登录）+ 当前登录用户的今日调用数（兼容旧字段）。\r\n"
        "\r\n"
        "    - models：服务端全局累计。火山方舟免费额度是账号级共享的，多用户必须累计到\r\n"
        "      同一个账本，否则前端 localStorage 各算各的会超量欠费。\r\n"
        "    - used / limit / date：本用户今日调用数（游客为 0），旧客户端与冒烟脚本仍在用。\r\n"
        "    \"\"\"\r\n"
        "    snap = ledger_snapshot()\r\n"
        "    used = 0\r\n"
        "    if user:\r\n"
        "        row = db.query(AiUsage).filter(AiUsage.user_id == user.id, AiUsage.day == _today()).first()\r\n"
        "        used = row.count if row else 0\r\n"
        "    snap[\"used\"] = used\r\n"
        "    snap[\"limit\"] = AI_DAILY_LIMIT\r\n"
        "    snap[\"date\"] = _today()\r\n"
        "    return snap\r\n"
    )
    new_usage = (
        "@router.get(\"/usage\")\r\n"
        "def ai_usage(user: User = Depends(get_current_user_optional),\r\n"
        "             db: Session = Depends(get_db)):\r\n"
        "    \"\"\"模型用量总账 + 当前登录用户的今日调用数（兼容旧字段）。\r\n"
        "\r\n"
        "    R88-F 安全修复：接口仍允许游客访问（前端「关于 → 用量」面板设计为免登录），\r\n"
        "    但**游客不再能看到全站账本明细**——只返回中性的空 models 与本人今日计数（=0），\r\n"
        "    避免免登录泄露各平台配额、剩余额度、真实模型名与全局调用量。\r\n"
        "    登录用户返回全量快照（原行为不变）。\r\n"
        "\r\n"
        "    - models：服务端全局累计（仅登录用户）。火山方舟免费额度是账号级共享的，\r\n"
        "      多用户必须累计到同一个账本，否则前端 localStorage 各算各的会超量欠费。\r\n"
        "    - used / limit / date：本用户今日调用数（游客为 0），旧客户端与冒烟脚本仍在用。\r\n"
        "    \"\"\"\r\n"
        "    used = 0\r\n"
        "    if user:\r\n"
        "        row = db.query(AiUsage).filter(AiUsage.user_id == user.id, AiUsage.day == _today()).first()\r\n"
        "        used = row.count if row else 0\r\n"
        "        snap = ledger_snapshot()\r\n"
        "    else:\r\n"
        "        # 游客：不回账本明细（脱敏），只给最小骨架，前端据此渲染「游客模式」空态\r\n"
        "        snap = {\"ok\": True, \"serverTime\": now_iso(), \"models\": {}}\r\n"
        "    snap[\"used\"] = used\r\n"
        "    snap[\"limit\"] = AI_DAILY_LIMIT\r\n"
        "    snap[\"date\"] = _today()\r\n"
        "    return snap\r\n"
    )
    ai = replace_once(ai, old_usage, new_usage, "ai.py /usage")

    # =========================================================
    # 5) ai.py —— /usage/reset fail-closed
    # =========================================================
    old_reset = (
        "    \"\"\"充值后重置用量并重新启用模型（管理用）。\r\n"
        "\r\n"
        "    入参：{\"modelId\": \"ark-xxx\"} 或 {\"all\": true}\r\n"
        "    保护：请求头 X-Admin-Token 必须等于环境变量 ADMIN_TOKEN；\r\n"
        "    未配置 ADMIN_TOKEN 时放行（方便本地调试），返回里用 authBypass=true 注明。\r\n"
        "    \"\"\"\r\n"
        "    required = os.getenv(\"ADMIN_TOKEN\", \"\").strip()\r\n"
        "    if required and x_admin_token != required:\r\n"
        "        raise HTTPException(403, \"X-Admin-Token 无效，禁止重置用量\")\r\n"
    )
    new_reset = (
        "    \"\"\"充值后重置用量并重新启用模型（管理用）。\r\n"
        "\r\n"
        "    入参：{\"modelId\": \"ark-xxx\"} 或 {\"all\": true}\r\n"
        "    保护（R88-F 改为 fail-closed）：请求头 X-Admin-Token 必须等于环境变量\r\n"
        "    ADMIN_TOKEN；**未配置 ADMIN_TOKEN 时直接拒绝（503），不再放行**——重置接口\r\n"
        "    能清零全站配额，是比用量上报更直接的破坏力，必须拒绝而非默认开放。\r\n"
        "    \"\"\"\r\n"
        "    required = os.getenv(\"ADMIN_TOKEN\", \"\").strip()\r\n"
        "    if not required:\r\n"
        "        raise HTTPException(503, \"服务端未配置 ADMIN_TOKEN，用量重置接口已禁用（fail-closed）\")\r\n"
        "    if x_admin_token != required:\r\n"
        "        raise HTTPException(403, \"X-Admin-Token 无效，禁止重置用量\")\r\n"
    )
    ai = replace_once(ai, old_reset, new_reset, "ai.py /usage/reset")

    write_back(AI, ai)

    # =========================================================
    # 6) quota_ledger.py —— 新增 known_model_ids()
    # =========================================================
    ql_path = SERVER / "quota_ledger.py"
    ql = read_bytes(ql_path)
    assert_crlf(ql, "quota_ledger.py")
    old_ql = (
        "def resolve_model_name(provider: str, model_id: str) -> str:\r\n"
    )
    new_ql = (
        "def known_model_ids() -> set:\r\n"
        "    \"\"\"返回服务端认可的合法 modelId 集合（额度表 ∪ 注册表 ∪ 已有账本键）。\r\n"
        "\r\n"
        "    供 /usage/consume 做白名单校验，防止前端上报不存在的模型名污染账本。\r\n"
        "    任何一张表非空即可用；三张全空（未初始化）时返回空集，调用方应放行以免误拦。\r\n"
        "    \"\"\"\r\n"
        "    ensure_loaded()\r\n"
        "    ids = set(_quota.keys()) | set(_registry.keys()) | set(_usage[\"models\"].keys())\r\n"
        "    return {str(k) for k in ids if k and not str(k).startswith(\"_\")}\r\n"
        "\r\n"
        "\r\n"
        "def resolve_model_name(provider: str, model_id: str) -> str:\r\n"
    )
    ql = replace_once(ql, old_ql, new_ql, "quota_ledger.py known_model_ids")
    write_back(ql_path, ql)

    # =========================================================
    # 复读复验
    # =========================================================
    def verify(p: Path, needles):
        d = p.read_bytes()
        assert_crlf(d, p.name)
        t = d.decode("utf-8")
        for n in needles:
            assert n in t, f"{p.name}: 复验失败，缺少 {n!r}"
        print(f"OK  {p.name}  ({len(d)} bytes)")

    verify(CFG, ["RATE_AI_CONSUME_PER_MIN"])
    verify(RL, ["\"consume\": RATE_AI_CONSUME_PER_MIN", "RATE_AI_CONSUME_PER_MIN, RATE_AI_PER_MIN"])
    verify(AI, [
        "known_model_ids",
        "_rl: None = Depends(rate_limit(\"consume\"))",
        "if model_id not in known_model_ids():",
        "snap = {\"ok\": True, \"serverTime\": now_iso(), \"models\": {}}",
        "raise HTTPException(503, \"服务端未配置 ADMIN_TOKEN",
    ])
    verify(ql_path, ["def known_model_ids() -> set:"])

    print("PATCH DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
