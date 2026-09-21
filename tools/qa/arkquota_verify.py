"""服务端统一用量检测 —— 验收脚本（FastAPI TestClient，不联网）。

用法（用 server/.venv 解释器，裸 python 没装 fastapi）：
    D:\\下载的文件\\学习工作台\\server\\.venv\\Scripts\\python.exe tools\\qa\\arkquota_verify.py

覆盖：
    1. GET  /api/ai/usage          免登录、结构正确、额度/状态字段齐全
    2. POST /api/ai/usage/consume  累加正确、ok=false 只记 failCalls、缺省按 1
    3. 超额：consume 到额度上限 -> status=exhausted，check_quota=False
    4. percent 夹在 100 以内、remaining 不为负（进度条不溢出）
    5. POST /api/ai/chat           额度耗尽时本地拦截（HTTP 200 + exhausted），不转发
    6. POST /api/ai/usage/reset    ADMIN_TOKEN 保护（无/错 token 403，对 token 200）
    7. 配置表完整性：52 个模型在位、seedream-5-0-lite 已删、退役模型 expired 标记
    8. 持久化：flush 后 model_usage.json 落盘，进程重启可读回

跑完自动把账本清回初始状态。
"""
import json
import os
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[2] / "server"
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


def main() -> None:
    global PASS, FAIL
    client = TestClient(app)
    reset_all()

    print("== 1. GET /api/ai/usage（免登录） ==")
    r = client.get("/api/ai/usage")
    check("HTTP 200 且免登录可访问", r.status_code == 200, str(r.status_code))
    body = r.json()
    check("含 ok / serverTime / models", body.get("ok") is True
          and bool(body.get("serverTime")) and isinstance(body.get("models"), dict),
          json.dumps(body, ensure_ascii=False)[:200])
    check("兼容旧字段 used / limit / date",
          set(["used", "limit", "date"]).issubset(body.keys()), str(list(body)[:8]))
    m = body["models"].get("ark-ds-v4-flash-ga") or {}
    check("ark-ds-v4-flash-ga 额度 500000 tokens",
          m.get("freeQuota") == 500000 and m.get("quotaType") == "tokens", str(m))
    check("初始 used=0 remaining=500000 status=ok",
          m.get("used") == 0 and m.get("remaining") == 500000
          and m.get("status") == "ok" and m.get("exhausted") is False, str(m))
    unk = client.post("/api/ai/usage/consume",
                      json={"modelId": "no-such-model", "amount": 5}).json()
    unk = client.get("/api/ai/usage").json()["models"].get("no-such-model") or {}
    check("额度表外的模型：freeQuota=null / status=unknown / 放行",
          unk.get("freeQuota") is None and unk.get("percent") is None
          and unk.get("status") == "unknown" and unk.get("exhausted") is False, str(unk))

    print("== 2. POST /api/ai/usage/consume 累加 ==")
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
    st = client.get("/api/ai/usage").json()["models"]["ark-ds-v4-flash-ga"]
    check("failCalls=1 / calls=3 / percent=0.2",
          st.get("failCalls") == 1 and st.get("calls") == 3
          and st.get("percent") == 0.2, str(st))
    check("缺 modelId 返回 400",
          client.post("/api/ai/usage/consume", json={"amount": 1}).status_code == 400)
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
    st = client.get("/api/ai/usage").json()["models"]["ark-seedream-4-0"]
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

    print("== 5. POST /api/ai/usage/reset（ADMIN_TOKEN 保护） ==")
    check("已配置 ADMIN_TOKEN（前 4 位 " + ADMIN_TOKEN[:4] + "****）",
          len(ADMIN_TOKEN) >= 32, f"len={len(ADMIN_TOKEN)}")
    rr = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"})
    check("无 X-Admin-Token -> 403", rr.status_code == 403, str(rr.status_code))
    rr = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"},
                     headers={"X-Admin-Token": "wrong-token"})
    check("错误 X-Admin-Token -> 403", rr.status_code == 403, str(rr.status_code))
    rr = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"},
                     headers={"X-Admin-Token": ADMIN_TOKEN})
    check("正确 token -> 200 且 reset 命中 + authBypass=false",
          rr.status_code == 200 and "ark-seedream-4-0" in rr.json().get("reset", [])
          and rr.json().get("authBypass") is False, str(rr.json()))
    check("重置后 check_quota 恢复 True",
          quota_ledger.check_quota("ark-seedream-4-0")[0] is True)
    rr = client.post("/api/ai/usage/reset", json={"all": True},
                     headers={"X-Admin-Token": ADMIN_TOKEN})
    check("all=true 全量重置 200", rr.status_code == 200, str(rr.status_code))

    print("== 6. 配置表完整性（key 必须是前端 id） ==")
    reset_all()  # 清掉第 1 节里 no-such-model 产生的临时条目，只数配置表里的模型
    snap = client.get("/api/ai/usage").json()["models"]
    check("模型总数 41（40 个目标模型 + 1 个 provider 级 ark 兜底）",
          len(snap) == 41, f"实际 {len(snap)}")
    must = ["ark-seed-2-1-pro", "ark-seed-2-0-mini", "ark-ds-v4-flash-ga", "ark-glm-5-3-flash",
            "ark-seed-evolving", "ark-seedream-4-0", "ark-seedream-4-5", "ark-seedance-2-0",
            "ark-seedance-1-5-pro", "ark-seed3d-2-0", "ark-hyper3d-gen2", "ark-hitem3d-2-0",
            "ark-embedding-vision", "ark"]
    miss = [x for x in must if x not in snap]
    check("关键 modelId 全部在位", not miss, f"缺 {miss}")
    check("★ 旧 id（ark-v4-flash / ark-seedream-4-0415）已清掉",
          "ark-v4-flash" not in snap and "ark-seedream-4-0415" not in snap)
    check("★ ark-seedream-5-0-lite 已从额度表删除",
          "ark-seedream-5-0-lite" not in snap)

    print("== 6b. ★ 前端 id 能解析出真实模型名（决定「模型能不能真被选中」） ==")
    # (provider, 前端 id, 期望的平台侧真实模型名)
    cases = [
        ("ark", "ark-seed-2-1-pro", "doubao-seed-2-1-pro-260915"),
        ("ark", "ark-seed-2-0-mini", "doubao-seed-2-0-mini-260428"),
        ("ark", "ark-seed-2-0-code", "doubao-seed-2-0-code-preview-260215"),
        ("ark", "ark-seed-translation", "doubao-seed-translation-250915"),
        ("ark", "ark-ds-v4-flash-ga", "deepseek-v4-flash-ga-260731"),
        ("ark", "ark-glm-5-3-flash", "glm-5-3-flash-260828"),
        ("ark", "ark-seed-evolving", "doubao-seed-evolving"),
        ("arkimage", "ark-seedream-4-0", "doubao-seedream-4-0-250828"),
        ("arkimage", "ark-seedream-4-5", "doubao-seedream-4-5-251128"),
        ("ark", "ark-embedding-vision", "doubao-embedding-vision-251215"),
    ]
    bad = [(prov, mid, want, quota_ledger.resolve_model_name(prov, mid))
           for prov, mid, want in cases
           if quota_ledger.resolve_model_name(prov, mid) != want]
    check("10 个前端 id 全部解析出正确模型名（不再退回 ARK_MODEL）", not bad, f"不符：{bad}")
    check("provider 不匹配时不解析（防跨 provider 误用模型）",
          quota_ledger.resolve_model_name("ark", "ark-seedream-4-0") == "")
    check("未知 id 解析为空串（安全回退，不会误用别人的模型）",
          quota_ledger.resolve_model_name("ark", "ark-not-exist") == "")
    reg = json.loads(quota_ledger.REGISTRY_PATH.read_text(encoding="utf-8"))
    unresolvable = [mid for mid, entry in reg.items()
                    if not mid.startswith("_")
                    and not quota_ledger.resolve_model_name(entry.get("provider", "ark"), mid)]
    check("40 个模型全部可解析（registry 无遗漏、provider 自洽）",
          not unresolvable, f"解析不出：{unresolvable}")

    retiring = [k for k, v in snap.items() if v.get("expireAt") == "2026-09-21"]
    expect_retiring = {"ark-seed-1-8", "ark-seed-1-6", "ark-seed-1-6-flash",
                       "ark-seed-1-6-vision", "ark-seed-code", "ark-1-5-pro-32k",
                       "ark-1-5-lite-32k", "ark-1-5-vision-pro-32k", "ark-ds-v4-flash",
                       "ark-glm-4-7", "ark-seedance-1-5-pro", "ark-seedance-1-0-lite-t2v",
                       "ark-seedance-1-0-lite-i2v"}
    check("★ 13 个退役模型带 expireAt=2026-09-21 且与名单完全一致",
          len(retiring) == 13 and set(retiring) == expect_retiring,
          f"实际 {len(retiring)} 差集 {set(retiring) ^ expect_retiring}")
    check("★ 我多算的那两个已删（doubao-seed-1-6-250615 / character-250715）",
          "doubao-seed-1-6-250615" not in snap
          and "doubao-1-5-pro-32k-character-250715" not in snap)
    check("未到期时 expired=false（今天 < 2026-09-21）",
          all(snap[k].get("expired") is False for k in retiring),
          str([(k, snap[k].get("expired")) for k in retiring[:3]]))
    quota_ledger._quota["__tmp_expired__"] = {"freeQuota": 10, "quotaType": "tokens",
                                              "expireAt": "2020-01-01"}
    tmp = quota_ledger.model_status("__tmp_expired__")
    check("过期模型返回 expired=true", tmp.get("expired") is True
          and tmp.get("expireAt") == "2020-01-01", str(tmp))
    quota_ledger._quota.pop("__tmp_expired__", None)
    reg = json.loads(quota_ledger.REGISTRY_PATH.read_text(encoding="utf-8"))
    check("registry 表 real model 映射非空（ark-ds-v4-flash-ga -> deepseek-v4-flash-ga-260731）",
          (reg.get("ark-ds-v4-flash-ga") or {}).get("model") == "deepseek-v4-flash-ga-260731",
          str(reg.get("ark-ds-v4-flash-ga")))
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
    quota_ledger._loaded = False          # 模拟进程重启：强制从磁盘重载
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
