# -*- coding: utf-8 -*-
"""批5 · L1 验收 相位②：staticmap 每日熔断（cap=1，零出网 —— 全部打桩）。

覆盖门禁 10：命中缓存不计数/不出网 → 未命中 take → 超限返回 degraded 且不出网 → 换日重置。
末行 CAP_RESULT=PASS/FAIL。
"""
import io
import os
import sys
import uuid

QA = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(QA, "_r104e_L1_cap_out.txt")
DST = os.environ["R104E_ISO_DIR"]

LOG = []
R = {"pass": 0, "fail": 0}


def log(s=""):
    LOG.append(str(s))


def ck(label, cond, detail=""):
    if cond:
        R["pass"] += 1
        log("  OK   %s%s" % (label, ("  -> " + str(detail)) if detail != "" else ""))
    else:
        R["fail"] += 1
        log("  FAIL %s  -> %s" % (label, detail))
    return bool(cond)


def finish(code):
    log("")
    log("CAP_RESULT=%s（%d/%d PASS）" % ("PASS" if R["fail"] == 0 else "FAIL",
                                         R["pass"], R["pass"] + R["fail"]))
    io.open(OUT, "w", encoding="utf-8").write("\n".join(LOG))
    sys.exit(code)


def main():
    os.environ["DATABASE_PATH"] = os.environ["R104E_DB"]
    os.environ["JWT_SECRET"] = "r104ecap-" + uuid.uuid4().hex
    os.environ["GEO_STATICMAP_DAILY_CAP"] = "1"   # 熔断阈值压到 1，便于实证
    sys.path.insert(0, DST)

    from fastapi.testclient import TestClient
    from main import app
    from routers import geo as geo_mod

    calls = {"staticmap": 0}

    async def fake_bytes(url, params):
        calls["staticmap"] += 1
        return (b"\x89PNG\r\n\x1a\nFAKE", "image/png")

    geo_mod._tencent_bytes = fake_bytes
    log("==== 批5 门禁10：staticmap 每日熔断（cap=%s，打桩零出网）====" % geo_mod._STATICMAP_DAILY_MAX)
    ck("config 读取 GEO_STATICMAP_DAILY_CAP == 1", geo_mod._STATICMAP_DAILY_MAX == 1,
       geo_mod._STATICMAP_DAILY_MAX)
    ck("计数文件路径 = <server>/data/geo_staticmap_count.json",
       str(geo_mod._STATICMAP_COUNT_FILE).replace("\\", "/").endswith(
           "/data/geo_staticmap_count.json"), geo_mod._STATICMAP_COUNT_FILE)

    tc = TestClient(app, client=("127.0.0.1", 50022), raise_server_exceptions=False)

    r1 = tc.get("/api/geo/staticmap?lat=30.2500&lng=120.1600&zoom=16")
    ck("① 第 1 次（未命中）→ 200 image/*", r1.status_code == 200
       and r1.headers.get("content-type", "").startswith("image/"),
       "%s %s" % (r1.status_code, r1.headers.get("content-type")))
    ck("① 出网 1 次", calls["staticmap"] == 1, calls["staticmap"])

    r1b = tc.get("/api/geo/staticmap?lat=30.2500&lng=120.1600&zoom=16")
    ck("② 同坐标再请求 → 命中缓存，仍 200 图片", r1b.status_code == 200
       and r1b.headers.get("content-type", "").startswith("image/"), r1b.status_code)
    ck("② 命中缓存不计数/不出网（出网仍 1 次）", calls["staticmap"] == 1, calls["staticmap"])

    r2 = tc.get("/api/geo/staticmap?lat=31.0000&lng=121.0000&zoom=16")
    j2 = None
    try:
        j2 = r2.json()
    except Exception:
        j2 = None
    ck("③ 第 3 次（新坐标、已超 cap）→ degraded:true + staticmap_daily_cap",
       isinstance(j2, dict) and j2.get("ok") is False and j2.get("degraded") is True
       and j2.get("error") == "staticmap_daily_cap", j2)
    ck("★ ③ 熔断后绝不出网（出网仍 1 次）", calls["staticmap"] == 1, calls["staticmap"])

    # 换日重置：把内存态与落盘文件都造到「昨天 + 已用满」，再请求 → 应重置为 0 并放行
    geo_mod._STATICMAP_DAY = "2020-01-01"
    geo_mod._STATICMAP_COUNT = 999
    geo_mod._STATICMAP_LOADED = True
    io.open(geo_mod._STATICMAP_COUNT_FILE, "w", encoding="utf-8").write(
        '{"day": "2020-01-01", "count": 999}')
    r3 = tc.get("/api/geo/staticmap?lat=32.0000&lng=122.0000&zoom=16")
    ck("④ 换日重置（day 变化）→ 恢复放行，200 图片", r3.status_code == 200
       and r3.headers.get("content-type", "").startswith("image/"), r3.status_code)
    ck("④ 换日后出网 +1（=2）", calls["staticmap"] == 2, calls["staticmap"])
    saved = io.open(geo_mod._STATICMAP_COUNT_FILE, encoding="utf-8").read()
    ck("④ 计数文件已重写为「今日 + count=1」", '"count": 1' in saved and "2020-01-01" not in saved,
       saved)

    finish(0 if R["fail"] == 0 else 1)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        log("EXCEPTION: " + traceback.format_exc())
        finish(1)
