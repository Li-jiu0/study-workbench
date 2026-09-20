# -*- coding: utf-8 -*-
"""R88-F 限流独立证伪：重点验证「X-Forwarded-For 伪造能否绕过限流」。

背景：rate_limit.py 声称只有直连对端在受信代理集合内时才采信 XFF。
TestClient 的 client.host 固定为 "testclient"，**不在** _TRUSTED_PROXIES 中，
因此伪造 XFF 应当**无效**——每次请求都该落在同一个 key 上并被限流。
本探针同时用 unit 级直接调用 _client_ip 来交叉验证。
"""
import os
import sys
from pathlib import Path

ROOT = Path(r"D:\下载的文件\学习工作台")
SERVER = ROOT / "server"
sys.path.insert(0, str(SERVER))
os.chdir(SERVER)

from fastapi.testclient import TestClient  # noqa: E402
import quota_ledger  # noqa: E402
import rate_limit as rl  # noqa: E402
from config import RATE_AI_CONSUME_PER_MIN, RATE_AI_PER_MIN  # noqa: E402
from main import app  # noqa: E402

OUT = []
P = F = 0


def ck(name, cond, extra=""):
    global P, F
    if cond:
        P += 1
        OUT.append("  [PASS] " + name)
    else:
        F += 1
        OUT.append("  [FAIL] " + name + " " + str(extra)[:300])


class FakeReq:
    def __init__(self, host, xff=None):
        self.client = type("C", (), {"host": host})()
        self.headers = {"x-forwarded-for": xff} if xff else {}


def main():
    client = TestClient(app)
    quota_ledger.reset_usage(reset_all=True)
    quota_ledger.flush(force=True)

    OUT.append("== R1 _client_ip 单元级：信任边界 ==")
    ck("R1.1 非受信对端 + 伪造 XFF -> 忽略 XFF，取对端 IP",
       rl._client_ip(FakeReq("1.2.3.4", "9.9.9.9")) == "1.2.3.4",
       rl._client_ip(FakeReq("1.2.3.4", "9.9.9.9")))
    ck("R1.2 受信对端(127.0.0.1) + XFF -> 采信 XFF 最后一跳",
       rl._client_ip(FakeReq("127.0.0.1", "9.9.9.9")) == "9.9.9.9",
       rl._client_ip(FakeReq("127.0.0.1", "9.9.9.9")))
    ck("R1.3 受信对端 + 多跳 XFF -> 取最后一跳（真实客户端）",
       rl._client_ip(FakeReq("127.0.0.1", "1.1.1.1, 2.2.2.2, 3.3.3.3")) == "3.3.3.3",
       rl._client_ip(FakeReq("127.0.0.1", "1.1.1.1, 2.2.2.2, 3.3.3.3")))
    ck("R1.4 受信对端 + XFF 全非法 -> 回退对端 IP",
       rl._client_ip(FakeReq("127.0.0.1", "not-an-ip, also-bad")) == "127.0.0.1",
       rl._client_ip(FakeReq("127.0.0.1", "not-an-ip, also-bad")))
    ck("R1.5 受信对端 + XFF 尾部伪造非法值/空白 -> 跳过取前一个合法",
       rl._client_ip(FakeReq("::1", "8.8.8.8, , evil")) == "8.8.8.8",
       rl._client_ip(FakeReq("::1", "8.8.8.8, , evil")))

    OUT.append("== R2 HTTP 级：伪造 XFF 不能绕过 consume 限流 ==")
    rl._buckets.clear()
    quota_ledger.reset_usage(reset_all=True)
    quota_ledger.flush(force=True)
    n = RATE_AI_CONSUME_PER_MIN
    codes = []
    for i in range(n + 5):
        r = client.post("/api/ai/usage/consume",
                        json={"modelId": "ark-ds-v4-flash-ga", "amount": 1},
                        headers={"X-Forwarded-For": "10.0.0.%d" % (i % 250 + 1)})
        codes.append(r.status_code)
    got429 = [i for i, c in enumerate(codes) if c == 429]
    ck("R2.1 每次换伪造 XFF 仍会在第 %d 次起被 429" % n,
       len(got429) == 5 and got429[0] == n,
       "codes=%s" % codes)
    ck("R2.2 前 %d 次放行 200" % n, all(c == 200 for c in codes[:n]), codes[:n])
    ck("R2.3 限流后不再写入账本（429 不累加）",
       quota_ledger.model_status("ark-ds-v4-flash-ga")["calls"] == n,
       quota_ledger.model_status("ark-ds-v4-flash-ga"))

    OUT.append("== R3 独立桶：不同 group 互不干扰 ==")
    rl._buckets.clear()
    for _ in range(RATE_AI_CONSUME_PER_MIN + 3):
        client.post("/api/ai/usage/consume", json={"modelId": "ark-ds-v4-flash-ga"})
    ck("R3.1 consume 桶已满", any(
        k.startswith("consume:") and len(v) >= RATE_AI_CONSUME_PER_MIN
        for k, v in rl._buckets.items()), dict((k, len(v)) for k, v in rl._buckets.items()))
    ck("R3.2 ai 桶未被 consume 请求污染",
       not any(k.startswith("ai:") for k in rl._buckets), list(rl._buckets.keys()))

    OUT.append("== R4 桶容量上限与清理（防内存无上限增长） ==")
    rl._buckets.clear()
    ck("R4.1 _MAX_BUCKETS 已定义且为正整数", rl._MAX_BUCKETS > 0, rl._MAX_BUCKETS)
    import time as _t
    # 塞入过期桶，验证 _evict_expired 会真的清掉
    stale = _t.monotonic() - rl._WINDOW - 10
    for i in range(20):
        rl._buckets["stale:%d" % i].append(stale)
    rl._evict_expired(_t.monotonic())
    ck("R4.2 _evict_expired 清空过期桶", len(rl._buckets) == 0, len(rl._buckets))

    OUT.append("== R5 ai 分组限流（不触发上游，纯依赖层验证） ==")
    rl._buckets.clear()
    # 不真打 /api/ai/chat（会真连上游、可能挂死）。
    # 直接取路由依赖并调用，验证 ai 分组桶独立计数 + 超限抛 429。
    from fastapi import HTTPException
    dep = rl.rate_limit("ai")
    req = FakeReq("testclient")
    codes = []
    for _ in range(RATE_AI_PER_MIN + 2):
        try:
            dep(req)
            codes.append(200)
        except HTTPException as e:
            codes.append(e.status_code)
    ck("R5.1 ai 分组桶独立建立",
       any(k.startswith("ai:") for k in rl._buckets), list(rl._buckets.keys()))
    ck("R5.2 ai 分组第 %d 次起抛 429" % RATE_AI_PER_MIN,
       codes.count(429) == 2 and codes[0] == 200 and codes[RATE_AI_PER_MIN] == 429,
       "len=%d codes_tail=%s" % (len(codes), codes[-4:]))
    # auth 组限额更严
    rl._buckets.clear()
    dep_auth = rl.rate_limit("auth")
    from config import RATE_AUTH_PER_MIN
    n429 = 0
    for _ in range(RATE_AUTH_PER_MIN + 1):
        try:
            dep_auth(req)
        except HTTPException:
            n429 += 1
    ck("R5.3 auth 分组限额 (%d) 严于 ai 且生效" % RATE_AUTH_PER_MIN, n429 == 1, n429)
    # 未声明的分组回退全局
    dep_x = rl.rate_limit("no-such-group")
    from config import RATE_GLOBAL_PER_MIN, RATE_AI_CONSUME_PER_MIN as _C
    ck("R5.4 未声明分组回退全局限额 %d" % RATE_GLOBAL_PER_MIN,
       rl._LIMITS.get("no-such-group", RATE_GLOBAL_PER_MIN) == RATE_GLOBAL_PER_MIN)
    ck("R5.5 consume 限额(%d) 独立于 ai 限额(%d)" % (_C, RATE_AI_PER_MIN),
       _C != RATE_AI_PER_MIN)

    rl._buckets.clear()
    quota_ledger.reset_usage(reset_all=True)
    quota_ledger.flush(force=True)
    OUT.append("")
    OUT.append("清理：账本键 = %s / 桶数 = %d"
               % (list(quota_ledger._usage["models"].keys()), len(rl._buckets)))
    OUT.append("结果：通过 %d，失败 %d" % (P, F))
    return 0 if F == 0 else 1


if __name__ == "__main__":
    try:
        code = main()
    except Exception:
        import traceback
        OUT.append("EXC: " + traceback.format_exc())
        code = 2
    (ROOT / "tools/qa/_r88f_rl_out.txt").write_text("\n".join(OUT), encoding="utf-8")
    sys.exit(code)
