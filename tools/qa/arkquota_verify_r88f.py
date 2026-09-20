# -*- coding: utf-8 -*-
"""服务端统一用量检测 —— R88-F 修订版验收脚本（FastAPI TestClient，不联网）。

与旧脚本 tools/qa/arkquota_verify.py 的差异（因 R88-F 安全修复而必须调整）：
  1. GET /api/ai/usage 现在对**游客脱敏**（models 为空）。旧脚本以游客身份断言
     models 明细，与新的安全契约冲突。
     - 本脚本：游客断言「models 为空、不含 freeQuota/remaining」；
       需要看明细的地方，**直接读服务端内部 quota_ledger.ledger_snapshot()**
       （等价于登录用户视角，且无需求造登录态），保持断言强度不降。
  2. POST /api/ai/usage/consume 现在有 **modelId 白名单 + IP 限流**。
     - 旧脚本用 "no-such-model" 造「表外模型」条目 -> 现被 400 拒绝。
     - 本脚本：断言未知 modelId -> 400；「表外模型」改为直接调用
       quota_ledger.model_status() 验证 status=unknown 的语义。
  3. POST /api/ai/usage/reset 改为 **fail-closed**（未配 ADMIN_TOKEN -> 503）。
     - 本脚本：先测「未配 -> 503」（mock 清空），再测「已配 -> 403/200」。

用法（用 server/.venv 解释器，裸 python 没装 fastapi）：
    <repo>\\server\\.venv\\Scripts\\python.exe tools\\qa\\arkquota_verify_r88f.py

跑完自动把账本清回初始状态。
"""
import json
import os
import sys
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "server"
sys.path.insert(0, str(SERVER))
os.chdir(SERVER)

from fastapi.testclient import TestClient  # noqa: E402

import quota_ledger  # noqa: E402
from main import app  # noqa: E402

PASS = 0
FAIL = 0
USAGE_PATH = quota_ledger.USAGE_PATH
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "").strip()


def check(name: str, cond: bool, extra: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [PASS] {name}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name} {extra}")


def reset_all() -> None:
    quota_ledger.reset_usage(reset_all=True)
    quota_ledger.flush(force=True)


def snapshot() -> dict:
    """服务端内部全量快照（等价登录用户视角；绕开游客脱敏）。"""
    return quota_ledger.ledger_snapshot()["models"]


def main() -> None:
    global PASS, FAIL
    client = TestClient(app)
    reset_all()

    print("== 1. GET /api/ai/usage（R88-F 游客脱敏） ==")
    r = client.get("/api/ai/usage")
    check("HTTP 200 且仍免登录可访问（游客不 401/403）",
          r.status_code == 200, str(r.status_code))
    body = r.json()
    check("游客响应 models 为空（不泄露账本明细）",
          body.get("models") == {}, json.dumps(body, ensure_ascii=False)[:200])
    check("游客响应不含 freeQuota / remaining",
          "freeQuota" not in json.dumps(body) and "remaining" not in json.dumps(body))
    check("兼容旧字段 used / limit / date 仍在",
          set(["used", "limit", "date"]).issubset(body.keys()), str(list(body)[:8]))

    print("== 1b. 服务端账本快照（登录视角，等价原断言） ==")
    snap = snapshot()
    m = snap.get("ark-ds-v4-flash-ga") or {}
    check("ark-ds-v4-flash-ga 额度 500000 tokens",
          m.get("freeQuota") == 500000 and m.get("quotaType") == "tokens", str(m))
    check("初始 used=0 remaining=500000 status=ok",
          m.get("used") == 0 and m.get("remaining") == 500000
          and m.get("status") == "ok" and m.get("exhausted") is False, str(m))
    # 表外模型：直接查内部状态（HTTP consume 已不允许写未知 modelId）
    unk = quota_ledger.model_status("no-such-model")
    check("额度表外的模型：freeQuota=null / status=unknown / 放行",
          unk.get("freeQuota") is None and unk.get("percent") is None
          and unk.get("status") == "unknown" and unk.get("exhausted") is False, str(unk))

    print("== 2. POST /api/ai/usage/consume 累加 + 白名单 ==")
    reset_all()
    r1 = client.post("/api/ai/usage/consume",
                     json={"modelId": "ark-ds-v4-flash-ga", "amount": 1000, "ok": True})
    check("consume 1000 -> used=1000, status=ok",
          r1.json().get("ok") is True and r1.json().get("used") == 1000
          and r1.json().get("status") == "ok", str(r1.json()))
    r2 = client.post("/api/ai/usage/consume", json={"modelId": "ark-ds-v4-flash-ga"})
    check("缺省 amount 按 1 计 -> used=1001", r2.json().get("used") == 1001, str(r2.json()))
    r3 = client.post("/api/ai/usage/consume",
                     json={"modelId": "ark-ds-v4-flash-ga", "amount": 999, "ok": False})
    check("ok=false 不累加 used（仍 1001）", r3.json().get("used") == 1001, str(r3.json()))
    st = snapshot()["ark-ds-v4-flash-ga"]
    check("failCalls=1 / calls=3 / percent=0.2",
          st.get("failCalls") == 1 and st.get("calls") == 3
          and st.get("percent") == 0.2, str(st))
    check("缺 modelId 返回 400",
          client.post("/api/ai/usage/consume", json={"amount": 1}).status_code == 400)
    # ★ R88-F 新增：未知 modelId 白名单拦截
    check("★ 未知 modelId -> 400（R88-F 白名单）",
          client.post("/api/ai/usage/consume",
                      json={"modelId": "no-such-model", "amount": 5}).status_code == 400)
    big = client.post("/api/ai/usage/consume",
                      json={"modelId": "ark-ds-v4-flash-ga", "amount": 99999999}).json()
    check("超大 amount 被夹到 100000", big.get("used") == 101001, str(big))

    print("== 3. 超额 -> exhausted / check_quota=False ==")
    reset_all()
    last = None
    for _ in range(50):
        last = client.post("/api/ai/usage/consume",
                           json={"modelId": "ark-seedream-4-0", "amount": 6}).json()
    check("200 张额度耗尽 -> status=exhausted",
          last.get("status") == "exhausted" and last.get("used") == 300, str(last))
    st = snapshot()["ark-seedream-4-0"]
    check("remaining=0 非负 / exhausted=true",
          st.get("remaining") == 0 and st.get("exhausted") is True, str(st))
    check("★ percent 夹在 100.0（300/200 不再是 150）",
          st.get("percent") == 100.0, str(st.get("percent")))
    allowed, reason = quota_ledger.check_quota("ark-seedream-4-0")
    check("check_quota 返回 False + 中文原因",
          allowed is False and "免费额度已用完" in reason, f"{allowed} {reason}")
    check("未超额的 check_quota 返回 True",
          quota_ledger.check_quota("ark-ds-v4-flash-ga")[0] is True)

    print("== 4. /api/ai/chat 额度耗尽时本地拦截（不转发） ==")
    rr = client.post("/api/ai/chat", json={"provider": "ark",
                                           "modelId": "ark-seedream-4-0",
                                           "messages": [{"role": "user", "content": "hi"}]})
    check("HTTP 200（不是 4xx/5xx）", rr.status_code == 200, str(rr.status_code))
    jj = rr.json()
    check("返回 ok=false / exhausted=true / 中文提示",
          jj.get("ok") is False and jj.get("exhausted") is True
          and "该模型免费额度已用完" in (jj.get("error") or ""), json.dumps(jj, ensure_ascii=False))
    check("未产生上游调用（账本 calls 不因转发增加）",
          quota_ledger.model_status("ark-seedream-4-0")["calls"] == 50,
          str(quota_ledger.model_status("ark-seedream-4-0")))

    print("== 5. POST /api/ai/usage/reset（R88-F fail-closed + ADMIN_TOKEN） ==")
    # 5a. 未配置 ADMIN_TOKEN -> 503（fail-closed）
    with mock.patch.dict(os.environ, {"ADMIN_TOKEN": ""}, clear=False):
        rr = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"})
    check("★ 未配置 ADMIN_TOKEN -> 503（fail-closed，不再放行）",
          rr.status_code == 503, str(rr.status_code))
    # 5b. 已配置
    check("已配置 ADMIN_TOKEN（前 4 位 " + ADMIN_TOKEN[:4] + "****）",
          len(ADMIN_TOKEN) >= 32, f"len={len(ADMIN_TOKEN)}")
    rr = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"})
    check("无 X-Admin-Token -> 403", rr.status_code == 403, str(rr.status_code))
    rr = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"},
                     headers={"X-Admin-Token": "wrong-token"})
    check("错误 X-Admin-Token -> 403", rr.status_code == 403, str(rr.status_code))
    rr = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"},
                     headers={"X-Admin-Token": ADMIN_TOKEN})
    check("正确 token -> 200 且 reset 命中",
          rr.status_code == 200 and "ark-seedream-4-0" in rr.json().get("reset", []),
          str(rr.json()))
    check("重置后 check_quota 恢复 True",
          quota_ledger.check_quota("ark-seedream-4-0")[0] is True)
    rr = client.post("/api/ai/usage/reset", json={"all": True},
                     headers={"X-Admin-Token": ADMIN_TOKEN})
    check("all=true 全量重置 200", rr.status_code == 200, str(rr.status_code))

    print("== 6. 配置表完整性（key 必须是前端 id） ==")
    reset_all()
    snap = snapshot()
    must = ["ark-seed-2-1-pro", "ark-seed-2-0-mini", "ark-ds-v4-flash-ga", "ark-glm-5-3-flash",
            "ark-seed-evolving", "ark-seedream-4-0", "ark-seedream-4-5", "ark-seedance-2-0",
            "ark-seedance-1-5-pro", "ark-seed3d-2-0", "ark-hyper3d-gen2", "ark-hitem3d-2-0"]
    miss = [x for x in must if x not in snap]
    check("关键 modelId 全部在位", not miss, f"缺 {miss}")
    check("resolve_model_name 能解析出真实模型名",
          quota_ledger.resolve_model_name("ark", "ark-ds-v4-flash-ga") == "deepseek-v4-flash-ga-260731")

    print("== 7. 持久化（落盘 + 重载） ==")
    reset_all()
    client.post("/api/ai/usage/consume", json={"modelId": "ark-ds-v4-flash-ga", "amount": 777})
    quota_ledger.flush(force=True)
    on_disk = json.loads(USAGE_PATH.read_text(encoding="utf-8"))
    check("model_usage.json 已落盘且含 777",
          on_disk["models"]["ark-ds-v4-flash-ga"]["used"] == 777, str(on_disk)[:200])
    check("无 .tmp 残留（原子写完已 replace）",
          not USAGE_PATH.with_name(USAGE_PATH.name + ".tmp").exists())
    quota_ledger._loaded = False
    quota_ledger.ensure_loaded()
    check("重载后 used 仍为 777（重启不丢）",
          quota_ledger.model_status("ark-ds-v4-flash-ga")["used"] == 777,
          str(quota_ledger.model_status("ark-ds-v4-flash-ga")))

    print("== 清理：账本回到初始状态 ==")
    reset_all()
    final = json.loads(USAGE_PATH.read_text(encoding="utf-8"))
    check("model_usage.json 已清空", final.get("models") == {}, str(final)[:200])

    print(f"\n结果：通过 {PASS}，失败 {FAIL}")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
