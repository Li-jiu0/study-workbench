# -*- coding: utf-8 -*-
"""R88-F P0 修复自测（TestClient，不启动真实 server、不碰真实数据库）。

三条核心断言：
  T1  P0-1 游客 GET /api/ai/usage 不再泄露账本明细（models 为空、无 freeQuota/remaining）
  T2  P0-2 POST /api/ai/usage/consume 传入未知 modelId 被 400 拒绝（白名单生效）
  T3  /usage/reset 在 ADMIN_TOKEN 未配置时 fail-closed 返回 503；配置后错误 token 403、正确 token 200

隔离手段：DATABASE_PATH 指向临时文件；只挂 ai 路由；不触碰 server/data.db 与 data/*.json。
"""
import json
import os
import sys
import tempfile
import traceback
from pathlib import Path

SERVER = Path(r"D:\下载的文件\学习工作台\server")
sys.path.insert(0, str(SERVER))

# ---- 隔离：临时数据库，避免动到真实 data.db ----
_tmp_db = Path(tempfile.gettempdir()) / "r88f_selftest.db"
if _tmp_db.exists():
    _tmp_db.unlink()
os.environ["DATABASE_PATH"] = str(_tmp_db)

# ADMIN_TOKEN 先清空（测 fail-closed），后续再设（测 403/200）
os.environ.pop("ADMIN_TOKEN", None)

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import database  # noqa: E402
from database import init_db  # noqa: E402
init_db()

# ---- 隔离：把账本数据目录指向临时目录，绝不触碰真实 server/data/*.json ----
import quota_ledger  # noqa: E402
_tmpdata = Path(tempfile.gettempdir()) / "r88f_selftest_data"
_tmpdata.mkdir(parents=True, exist_ok=True)
quota_ledger.DATA_DIR = _tmpdata
quota_ledger.USAGE_PATH = _tmpdata / "model_usage.json"
quota_ledger.QUOTA_PATH = _tmpdata / "model_quota.json"
quota_ledger.REGISTRY_PATH = _tmpdata / "model_registry.json"
import shutil  # noqa: E402
shutil.copy2(SERVER / "data" / "model_quota.json", quota_ledger.QUOTA_PATH)
shutil.copy2(SERVER / "data" / "model_registry.json", quota_ledger.REGISTRY_PATH)
if quota_ledger.USAGE_PATH.exists():
    quota_ledger.USAGE_PATH.unlink()

from routers import ai as ai_router  # noqa: E402

app = FastAPI()
app.include_router(ai_router.router)
client = TestClient(app)

passed = []
failed = []


def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else f"  | {detail}"))


try:
    # ============ T1：游客 /usage 脱敏 ============
    r = client.get("/api/ai/usage")
    j = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    check("T1-a 游客 GET /usage 返回 200", r.status_code == 200, f"status={r.status_code}")
    check("T1-b 游客响应 models 为空（不泄露账本）",
          j.get("models") == {}, f"models={j.get('models')!r}")
    # 确认没有泄露 freeQuota / remaining / 真实模型名
    raw = json.dumps(j, ensure_ascii=False)
    check("T1-c 游客响应不含 freeQuota", "freeQuota" not in raw, raw[:200])
    check("T1-d 游客响应不含 remaining", "remaining" not in raw, raw[:200])
    check("T1-e 游客 used=0 / limit / date 仍在（旧字段兼容）",
          j.get("used") == 0 and "limit" in j and "date" in j, json.dumps(j, ensure_ascii=False))

    # ============ T2：/consume modelId 白名单 ============
    r2 = client.post("/api/ai/usage/consume", json={"modelId": "no-such-model-xyz", "amount": 5})
    check("T2-a 未知 modelId -> 400（白名单拦截）", r2.status_code == 400,
          f"status={r2.status_code} body={r2.text[:200]}")

    r2b = client.post("/api/ai/usage/consume", json={"modelId": "", "amount": 5})
    check("T2-b 空 modelId -> 400", r2b.status_code == 400, f"status={r2b.status_code}")

    # 合法 modelId（在 model_registry.json 里）：允许上报
    r2c = client.post("/api/ai/usage/consume", json={"modelId": "ark-seedream-4-0", "amount": 3})
    j2c = r2c.json() if r2c.status_code == 200 else {}
    check("T2-c 合法 modelId 可上报（200 且 used 递增）",
          r2c.status_code == 200 and j2c.get("ok") is True, f"status={r2c.status_code} {r2c.text[:200]}")

    # ============ T3：/usage/reset fail-closed ============
    # 注意：config.py 会 load_dotenv(server/.env)，真实 .env 已配 ADMIN_TOKEN。
    # 要测「未配置」分支必须在**请求期间**用 mock 覆盖 os.environ。
    from unittest import mock  # noqa: E402
    with mock.patch.dict(os.environ, {"ADMIN_TOKEN": ""}, clear=False):
        r3 = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"})
    check("T3-a 未配置 ADMIN_TOKEN -> 503 fail-closed", r3.status_code == 503,
          f"status={r3.status_code} body={r3.text[:200]}")

    # 配置 ADMIN_TOKEN 后
    os.environ["ADMIN_TOKEN"] = "TESTTOKEN-r88f-0123456789abcdef"
    r3b = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"},
                      headers={"X-Admin-Token": "wrong"})
    check("T3-b ADMIN_TOKEN 已配 + 错误 token -> 403", r3b.status_code == 403,
          f"status={r3b.status_code}")

    r3c = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"},
                      headers={"X-Admin-Token": "TESTTOKEN-r88f-0123456789abcdef"})
    check("T3-c ADMIN_TOKEN 已配 + 正确 token -> 200", r3c.status_code == 200,
          f"status={r3c.status_code} body={r3c.text[:200]}")

except Exception:
    traceback.print_exc()
    failed.append("EXCEPTION")

print("\n==== R88-F SELFTEST SUMMARY ====")
print("PASS:", len(passed), "FAIL:", len(failed))
if failed:
    print("FAILED:", failed)
    sys.exit(1)
print("ALL_ASSERTIONS_PASS")
