# -*- coding: utf-8 -*-
"""需求 10 后端冒烟：GET /api/news/daily（时政新闻聚合，带原文链接）。

依赖：真实运行的隔离后端（端口 8899） + 进程内 TestClient（确定性用例）。

用法（在隔离副本目录跑）：
    # 终端 A（在 server 副本目录，端口 8899）
    python -m uvicorn main:app --host 127.0.0.1 --port 8899
    # 终端 B
    python scripts/smoke_news.py
    # 或指定地址
    SW_BASE=http://127.0.0.1:8899 python scripts/smoke_news.py

覆盖：
  [A] 真实 HTTP：200 / ok / items 非空 / source 存在 / 核心验收点
      —— source=中国新闻网 时至少一条 url 以 http 开头
  [B] 上游可达性探测：直接探中新网 RSS（如实报告，不伪造）
  [C] 缓存命中（进程内，mock 成功上游）：连续两次请求，上游只被调用一次，
      fetched_at 不变、两次响应体一致
  [D] 上游全挂（进程内，monkeypatch 两个上游为恒失败）：
      必须 502 + {"error":"news_unavailable"}，绝不 500

退出码：0 全过；1 有 FAIL；2 前置不满足（服务不可达 / 缺依赖）。
"""
import os
import sys

try:
    import httpx
except ImportError:  # pragma: no cover
    print("需要 httpx：请先 pip install httpx")
    sys.exit(2)

BASE = os.environ.get("SW_BASE", "http://127.0.0.1:8899").rstrip("/")
SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RSS_URL = "https://www.chinanews.com/rss/scroll-news.xml"

PASS = 0
FAIL = 0
SKIP = 0
FAILED_NAMES: list[str] = []


def _local_client() -> "httpx.Client":
    """trust_env=False 绕过系统 HTTP(S)_PROXY，直连 127.0.0.1。"""
    return httpx.Client(base_url=BASE, timeout=30, trust_env=False)


def section(title: str) -> None:
    print("\n========== %s ==========" % title)


def ck(label: str, cond, detail="") -> bool:
    global PASS, FAIL
    ok = bool(cond)
    if ok:
        PASS += 1
    else:
        FAIL += 1
        FAILED_NAMES.append(label)
    line = ("  OK  " if ok else "  FAIL") + " " + label
    if detail != "":
        line += "  -> " + str(detail)
    print(line)
    return ok


def skip(label: str, reason: str) -> None:
    global SKIP
    SKIP += 1
    print("  SKIP " + label + "  -> " + reason)


def main() -> int:
    # ---------- [A] 真实 HTTP ----------
    section("[A] GET /api/news/daily（真实后端，含真实外呼）")
    try:
        with _local_client() as c:
            r0 = c.get("/api/health")
        ck("服务可达 /api/health → 200", r0.status_code == 200, r0.status_code)
    except Exception as e:  # noqa: BLE001
        print("  服务不可达（%s）：请先在隔离副本目录起 `python -m uvicorn main:app --port 8899`" % BASE)
        print("  详细错误：%r" % (e,))
        return 2

    with _local_client() as c:
        r = c.get("/api/news/daily")
        ck("GET /api/news/daily → 200", r.status_code == 200, r.status_code)
        ck("响应头 Cache-Control: public, max-age=1800",
           r.headers.get("cache-control") == "public, max-age=1800",
           r.headers.get("cache-control"))
        body = r.json() if r.status_code == 200 else {}
        ck("ok == true", body.get("ok") is True, body.get("ok"))
        ck("source 字段存在", bool(body.get("source")), body.get("source"))
        items = body.get("items") or []
        ck("items 非空", len(items) > 0, "n=%d" % len(items))
        if items:
            it0 = items[0]
            ck("条目含 title/hot/url 三字段",
               all(k in it0 for k in ("title", "hot", "url")), sorted(it0.keys()))
        with_url = [it for it in items if isinstance(it.get("url"), str) and it["url"].startswith("http")]
        if body.get("source") == "中国新闻网":
            ck("★核心验收：至少一条 url 为 http(s) 开头的非空字符串（带原文链接）",
               len(with_url) > 0, "有链接条目=%d / 总=%d" % (len(with_url), len(items)))
            ck("url 形如中新网原文页",
               all("/" in (it.get("url") or "") and ".shtml" in (it.get("url") or "") for it in with_url),
               (with_url[0].get("url") if with_url else ""))
            ck("dailyLink 为 null（主源无整期早报链接）", body.get("dailyLink") is None, body.get("dailyLink"))
        else:
            skip("★核心验收：至少一条 url 以 http 开头",
                 "本次降级到 %s（沙箱外呼受限），主源验收见 [B] 探测与服务器复验" % body.get("source"))
            ck("降级源：每条 url 为 null", all(it.get("url") is None for it in items), "n=%d" % len(items))
            ck("降级源：dailyLink 为微信早报整期链接",
               isinstance(body.get("dailyLink"), str) and body.get("dailyLink", "").startswith("http"),
               body.get("dailyLink"))

    # ---------- [B] 上游可达性探测（如实报告） ----------
    section("[B] 中新网 RSS 直连探测（trust_env=False，如实报告）")
    rss_ok = False
    try:
        pr = httpx.get(RSS_URL, timeout=10, trust_env=False)
        rss_ok = pr.status_code == 200 and b"<item>" in pr.content
        ck("中新网 RSS 直连 → 200 且含 <item>", rss_ok,
           "status=%s bytes=%d items=%d" % (pr.status_code, len(pr.content), pr.content.count(b"<item>")))
    except Exception as e:  # noqa: BLE001
        ck("中新网 RSS 直连 → 200 且含 <item>", False, "异常：%r" % (e,))

    # ---------- [C][D] 进程内确定性用例（TestClient + monkeypatch） ----------
    _in_process_cases()

    # ---------- 汇总 ----------
    total = PASS + FAIL
    print("\n========== 汇总 ==========")
    print("通过 %d 项，失败 %d 项，跳过 %d 项（共 %d 项）" % (PASS, FAIL, SKIP, total + SKIP))
    if FAILED_NAMES:
        print("失败用例：")
        for n in FAILED_NAMES:
            print("  - " + n)
    return 1 if FAIL else 0


def _in_process_cases() -> None:
    """[C] 缓存命中 + [D] 上游全挂 → 502。进程内 TestClient，确定性、不依赖外网。"""
    section("[C] 服务端内存缓存命中（mock 成功上游）")
    if SERVER_DIR not in sys.path:
        sys.path.insert(0, SERVER_DIR)
    try:
        from fastapi.testclient import TestClient

        import routers.news as news_mod
        from main import app  # 触发 init_db（幂等）

        tc = TestClient(app)
        news_mod._reset_cache()

        canned = {
            "ok": True,
            "source": "中国新闻网",
            "updated": "Fri, 11 Sep 2026 12:03:53 +0800",
            "items": [
                {"title": "测试条目一", "hot": "", "url": "https://www.chinanews.com.cn/gn/2026/09-11/10694528.shtml"},
                {"title": "测试条目二", "hot": "", "url": "https://www.chinanews.com.cn/gn/2026/09-11/10694529.shtml"},
            ],
            "dailyLink": None,
        }
        calls = {"n": 0}

        async def _fake_ok():
            calls["n"] += 1
            return canned

        orig = (news_mod._FETCHERS, news_mod._CACHE)
        news_mod._FETCHERS = [("fake_ok", _fake_ok)]

        try:
            r1 = tc.get("/api/news/daily")
            ck("第 1 次请求 → 200 且返回 mock 载荷", r1.status_code == 200 and r1.json().get("source") == "中国新闻网",
               r1.status_code)
            fetched_at_1 = news_mod._CACHE[0]
            ck("缓存已写入（fetched_at > 0）", fetched_at_1 > 0, fetched_at_1)
            r2 = tc.get("/api/news/daily")
            ck("第 2 次请求 → 200（命中缓存）", r2.status_code == 200, r2.status_code)
            ck("第 2 次不打上游（上游调用次数仍为 1）", calls["n"] == 1, "calls=%d" % calls["n"])
            ck("fetched_at 不变（命中缓存）", news_mod._CACHE[0] == fetched_at_1,
               "%s vs %s" % (fetched_at_1, news_mod._CACHE[0]))
            ck("两次响应体一致", r1.json() == r2.json(), "")
        finally:
            news_mod._FETCHERS, news_mod._CACHE = orig
            news_mod._reset_cache()
    except Exception as e:  # noqa: BLE001
        ck("进程内缓存用例可执行（需后端依赖齐全）", False, repr(e))

    section("[D] 上游全挂 → 必须 502 + news_unavailable（monkeypatch，绝不 500）")
    try:
        from fastapi.testclient import TestClient

        import routers.news as news_mod
        from main import app

        tc = TestClient(app)
        news_mod._reset_cache()

        async def _raises():
            raise httpx.ConnectError("offline-upstream")

        orig = (news_mod._FETCHERS, news_mod._CACHE)
        news_mod._FETCHERS = [("fake_rss", _raises), ("fake_60s", _raises)]
        try:
            r = tc.get("/api/news/daily")
            ck("上游全挂 → 502（不是 500）", r.status_code == 502, r.status_code)
            ck("失败体为 {\"error\":\"news_unavailable\"}",
               r.json() == {"error": "news_unavailable"}, r.text[:120])
            ck("不透传上游异常细节", "offline-upstream" not in r.text, r.text[:80])
            # 上游恢复后应能恢复 200（缓存未被 502 污染）
            news_mod._reset_cache()
            news_mod._FETCHERS = [("fake_ok2", _fake_ok_factory())]
            r2 = tc.get("/api/news/daily")
            ck("上游恢复后 → 重新 200（502 未污染缓存）", r2.status_code == 200, r2.status_code)
        finally:
            news_mod._FETCHERS, news_mod._CACHE = orig
            news_mod._reset_cache()
    except Exception as e:  # noqa: BLE001
        ck("进程内 502 用例可执行（需后端依赖齐全）", False, repr(e))


def _fake_ok_factory():
    async def _fake_ok():
        return {
            "ok": True,
            "source": "中国新闻网",
            "updated": "",
            "items": [{"title": "恢复测试", "hot": "", "url": "https://www.chinanews.com.cn/x.shtml"}],
            "dailyLink": None,
        }
    return _fake_ok


if __name__ == "__main__":
    sys.exit(main())
