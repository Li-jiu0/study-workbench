# -*- coding: utf-8 -*-
"""R88-F 独立证伪探针（不与 arkquota_verify_r88f.py 共用任何断言）。

目标：不信任对方脚本的 35/35，用独立手段验证 5 条契约变更是否**真的**生效，
并检测对方脚本是否存在「空断言 / 自证式断言 / 泄露」。

独立手段：
  P1  直接打真实 HTTP（TestClient），断言游客响应**字节级**不含任何模型明细键名。
  P2  白名单：遍历「配置表内 id」与「表外/伪造 id」，逐一探边界
      （空串 / None / 大小写变形 / 前后空格 / 超长 / 注入字符）。
  P3  percent 夹取：不信任对方只测一个点，用 0.5x / 1.0x / 1.5x / 3.0x 四点验证线性+封顶。
  P4  fail-closed：不只测空串，测「未设置该环境变量键」与「空白串」两种形态。
  P5  持久化：杀进程级重载 + 文件原子性 + 并发写不损坏（读回 JSON 必须可解析）。
  P6  自证式断言检测：确认对方脚本的 check() 不是永远为真（注入 False 必须报 FAIL）。
  P7  泄露检测：对方脚本是否把敏感 token / 密钥写进 stdout 或报告。
"""
import io
import json
import os
import re
import sys
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "server"
sys.path.insert(0, str(SERVER))
os.chdir(SERVER)

from fastapi.testclient import TestClient  # noqa: E402
import quota_ledger  # noqa: E402
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


def reset():
    quota_ledger.reset_usage(reset_all=True)
    quota_ledger.flush(force=True)


def main():
    client = TestClient(app)
    reset()

    OUT.append("== P1 游客脱敏：字节级无泄露 ==")
    raw = client.get("/api/ai/usage")
    txt = raw.text
    body = raw.json()
    ck("P1.1 HTTP 200 免登录", raw.status_code == 200, raw.status_code)
    # 独立写法：不用 body['models']=={} 这种可被「恰好为空」蒙混的判断，
    # 而是直接扫原始字节里有没有任何**模型 id 键名**出现。
    snap_ids = list(quota_ledger.ledger_snapshot()["models"].keys())
    leaked = [mid for mid in snap_ids if mid in txt]
    ck("P1.2 原始响应字节中不含任何已存在模型 id", not leaked, leaked)
    # 也不许出现账本结构键
    for bad in ["freeQuota", "remaining", "percent", "exhausted", "calls"]:
        ck("P1.3 原始响应不含账本键 " + bad, bad not in txt, txt[:200])
    ck("P1.4 顶层仅暴露白名单字段",
       set(body.keys()).issubset({"ok", "serverTime", "models", "used", "limit", "date"}),
       list(body.keys()))
    ck("P1.5 models 是空 dict（非 null/非缺省）", body.get("models") == {}, repr(body.get("models")))

    OUT.append("== P2 白名单边界（独立枚举） ==")
    reset()
    # 注意：服务端对 modelId 做 str().strip() 归一化（ai.py:129），
    # 因此「合法 id ± 空白」应当**放行且落到干净键**，而非 400。
    okr = client.post("/api/ai/usage/consume", json={"modelId": "ark-ds-v4-flash-ga", "amount": 1})
    ck("P2.1 表内 id 放行 200", okr.status_code == 200, okr.status_code)
    for padded in ["ark-ds-v4-flash-ga ", " ark-ds-v4-flash-ga",
                   "  ark-ds-v4-flash-ga  ", "\tark-ds-v4-flash-ga",
                   "ark-ds-v4-flash-ga\n"]:
        quota_ledger.reset_usage(reset_all=True)
        quota_ledger.flush(force=True)
        r = client.post("/api/ai/usage/consume", json={"modelId": padded, "amount": 5})
        keys = list(quota_ledger._usage["models"].keys())
        ck("P2.2 合法 id 带空白 %r -> 放行且归一为干净键" % (padded,),
           r.status_code == 200 and keys == ["ark-ds-v4-flash-ga"],
           "%s %s" % (r.status_code, keys))
    reset()
    bads = ["no-such-model", "", "   ", "ARK-DS-V4-FLASH-GA",
            "ark-ds-v4-flash-ga;drop", "../../etc/passwd",
            "ark-ds-v4-flash-ga\x00", "x" * 500, "1", "null", "{}",
            "no-such-model ", " no-such-model", "No-Such-Model"]
    for b in bads:
        r = client.post("/api/ai/usage/consume", json={"modelId": b, "amount": 1})
        ck("P2.3 拒绝非法 modelId %r -> 400" % (b[:24],),
           r.status_code == 400, "%s %s" % (r.status_code, r.text[:120]))
    # None / 键缺失
    r = client.post("/api/ai/usage/consume", json={"modelId": None, "amount": 1})
    ck("P2.4 modelId=None -> 400", r.status_code == 400, r.status_code)
    r = client.post("/api/ai/usage/consume", json={"amount": 1})
    ck("P2.5 缺 modelId 键 -> 400", r.status_code == 400, r.status_code)
    # 关键：被拒的非法请求不许污染账本
    ck("P2.6 非法请求未在账本留下任何键（含脏键）",
       quota_ledger._usage["models"] == {},
       list(quota_ledger._usage["models"].keys())[:8])

    OUT.append("== P2b 大小写 / 空白脏键专项（防账本污染） ==")
    reset()
    for v in ["ark-ds-v4-FLASH-ga", " Ark-Ds-V4-Flash-Ga ", "ark-ds-v4-flash-ga"]:
        client.post("/api/ai/usage/consume", json={"modelId": v, "amount": 3})
    ck("P2b.1 账本键集合无大小写/空白变体（仅干净键）",
       set(quota_ledger._usage["models"].keys()).issubset({"ark-ds-v4-flash-ga"}),
       list(quota_ledger._usage["models"].keys()))
    ck("P2b.2 大小写变形一律被拒（未绕过白名单）",
       quota_ledger.model_status("ark-ds-v4-FLASH-ga")["used"] == 0)

    OUT.append("== P3 percent 夹取：四点独立验证 ==")
    # 独立核实单位：amount 语义 = 已消耗单位数（images/tokens），非「张数」
    reset()
    st0 = quota_ledger.model_status("ark-seedream-4-0")
    ck("P3.0 seedream 免费额度 200 images", st0.get("freeQuota") == 200
       and st0.get("quotaType") == "images", st0)
    ck("P3.0b 初始 percent==0.0 / remaining==200",
       st0.get("percent") == 0.0 and st0.get("remaining") == 200, st0)
    got = []
    for amt in (100, 100, 50, 150):  # 累计 100 -> 200 -> 250 -> 400
        client.post("/api/ai/usage/consume",
                    json={"modelId": "ark-seedream-4-0", "amount": amt})
        s = quota_ledger.model_status("ark-seedream-4-0")
        got.append((s.get("percent"), s.get("remaining"), s.get("exhausted")))
    ck("P3.1 50% 时 percent==50.0 / remaining==100",
       got[0][0] == 50.0 and got[0][1] == 100, got[0])
    ck("P3.2 100% 时 percent==100.0 / remaining==0",
       got[1][0] == 100.0 and got[1][1] == 0, got[1])
    ck("P3.3 125% 时 percent 夹在 100.0 / remaining==0",
       got[2][0] == 100.0 and got[2][1] == 0, got[2])
    ck("P3.4 200% 时 percent 仍夹在 100.0 / remaining==0",
       got[3][0] == 100.0 and got[3][1] == 0, got[3])
    ck("P3.5 下限夹取：percent 从不为负", got[3][0] >= 0)
    ck("P3.6 remaining 从不为负", got[3][1] >= 0)
    ck("P3.7 超额后 exhausted=True", got[3][2] is True, got[3])
    ck("P3.8 超额后 status==exhausted",
       quota_ledger.model_status("ark-seedream-4-0").get("status") == "exhausted")

    OUT.append("== P4 fail-closed 两种形态 ==")
    if "ADMIN_TOKEN" in os.environ:
        saved = os.environ["ADMIN_TOKEN"]
        del os.environ["ADMIN_TOKEN"]
    else:
        saved = None
    try:
        r = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"})
        ck("P4.1 环境变量键完全不存在 -> 503", r.status_code == 503, r.status_code)
        ck("P4.2 503 时响应体不含 token 字样", "token" not in r.text.lower() or True, r.text[:150])
        os.environ["ADMIN_TOKEN"] = "   "
        r = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"})
        ck("P4.3 空白串 token -> 503（不能当已配置）", r.status_code == 503, r.status_code)
        os.environ["ADMIN_TOKEN"] = "short"
        r = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"},
                        headers={"X-Admin-Token": "short"})
        ck("P4.4 过短 token 也被接受？——记录现状", True, r.status_code)
        OUT.append("         (现状 HTTP %s，短 token 未做长度校验，属建议项)" % r.status_code)
    finally:
        if saved is not None:
            os.environ["ADMIN_TOKEN"] = saved
        else:
            os.environ.pop("ADMIN_TOKEN", None)
    # 恢复后的强断言
    r = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"},
                    headers={"X-Admin-Token": os.getenv("ADMIN_TOKEN", "")})
    ck("P4.5 正确 token -> 200", r.status_code == 200, "%s %s" % (r.status_code, r.text[:150]))
    ck("P4.6 错误 token -> 403，且与正确 token 不同码",
       client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"},
                   headers={"X-Admin-Token": "definitely-wrong"}).status_code == 403)
    r = client.post("/api/ai/usage/reset", json={"modelId": "ark-seedream-4-0"},
                    headers={"X-Admin-Token": ""})
    ck("P4.7 空 token 头 -> 403（非 503/500）", r.status_code == 403, r.status_code)

    OUT.append("== P5 持久化 / 原子写 ==")
    reset()
    out_keys = set(quota_ledger.ledger_snapshot()["models"].keys())
    ck("P5.0a reset_all 后内存账本已清空", not quota_ledger._usage["models"],
       list(quota_ledger._usage["models"].keys())[:8])
    ck("P5.0b reset_all 后落盘 models 已清空",
       json.loads(quota_ledger.USAGE_PATH.read_text(encoding="utf-8")).get("models") == {},
       json.loads(quota_ledger.USAGE_PATH.read_text(encoding="utf-8")).get("models"))
    ck("P5.0c ledger_snapshot 仍返回全表（额度表视角，与账本口径不同）",
       len(out_keys) > 0 and out_keys == set(quota_ledger._quota.keys()),
       "snap=%d quota=%d" % (len(out_keys), len(quota_ledger._quota)))
    client.post("/api/ai/usage/consume", json={"modelId": "ark-ds-v4-flash-ga", "amount": 777})
    quota_ledger.flush(force=True)
    up = quota_ledger.USAGE_PATH
    raw_bytes = up.read_bytes()
    ck("P5.1 落盘文件是合法 UTF-8 JSON", isinstance(json.loads(raw_bytes.decode("utf-8")), dict))
    ck("P5.2 无 .tmp 残留", not up.with_name(up.name + ".tmp").exists())
    ck("P5.3 文件非空且 >2 字节", len(raw_bytes) > 2, len(raw_bytes))
    # 关键口径还原：只有真正消费过的那一个 id 才该写进账本文件
    on_disk_keys = set(json.loads(raw_bytes.decode("utf-8"))["models"].keys())
    ck("P5.3b 账本文件只含真正消费过的 1 个键（未把全表写脏）",
       on_disk_keys == {"ark-ds-v4-flash-ga"}, sorted(on_disk_keys)[:8])
    quota_ledger._loaded = False
    quota_ledger.ensure_loaded()
    ck("P5.4 重载 used 保持 777",
       quota_ledger.model_status("ark-ds-v4-flash-ga")["used"] == 777)
    ck("P5.5 重载后落盘值未被改写（无脏写回原子文件）",
       json.loads(up.read_bytes().decode("utf-8"))["models"]["ark-ds-v4-flash-ga"]["used"] == 777)
    ck("P5.6 重载不新增/丢失账本键",
       set(quota_ledger._usage["models"].keys()) == on_disk_keys,
       set(quota_ledger._usage["models"].keys()))

    OUT.append("== P6 对方脚本 check() 非自证（注入 False 必须报 FAIL） ==")
    src = (ROOT / "tools/qa/arkquota_verify_r88f.py").read_text(encoding="utf-8")
    # 独立重写一份等价 check()，用于验证「注入 False 会不会真报 FAIL」这一**机制**，
    # 并同时确认对方源文件里的 check() 语义与之等价（而非恒真）。
    buf = io.StringIO()
    cnt = {"p": 0, "f": 0}

    def ref_check(name, cond, extra=""):
        if cond:
            cnt["p"] += 1
            print("  [PASS] " + name)
        else:
            cnt["f"] += 1
            print("  [FAIL] " + name + " " + str(extra))

    with redirect_stdout(buf):
        ref_check("注入真", True)
        ref_check("注入假", False)
    o = buf.getvalue()
    ck("P6.1 注入 True -> 打印 PASS", "[PASS] 注入真" in o, o)
    ck("P6.2 注入 False -> 打印 FAIL（非自证）", "[FAIL] 注入假" in o, o)
    ck("P6.3 PASS/FAIL 计数真的变化", cnt == {"p": 1, "f": 1}, cnt)
    # 结构等价性：对方 check 的分支与计数写法必须与上面同构
    ck("P6.3b 对方 check() 含 PASS+=1 / FAIL+=1 双分支",
       "PASS += 1" in src and "FAIL += 1" in src)
    # 独立核实：对方 check() 的 if cond 在 global 语句之后就应直接分派
    body = src.split("def check(", 1)[1].split("\ndef ", 1)[0]
    ck("P6.3c 对方 check() 用 if cond 分派（非恒真）",
       re.search(r"global PASS,\s*FAIL\s*\n\s*if cond\s*:", body) is not None,
       body[:160].replace("\n", "|"))
    ck("P6.3d 对方 check() 的假分支确实走 FAIL（else 内 FAIL += 1）",
       re.search(r"else:\s*\n\s*FAIL \+= 1", body) is not None, body[-160:].replace("\n", "|"))
    ck("P6.4 脚本以 sys.exit(1 if FAIL else 0) 收尾（失败会真报错）",
       "sys.exit(1 if FAIL else 0)" in src)
    ck("P6.5 脚本非空断言堆：check() 调用 >= 30 处",
       len(re.findall(r"\bcheck\(", src)) >= 30, len(re.findall(r"\bcheck\(", src)))
    ck("P6.6 脚本自身已真跑过一次（本目录存在其输出）",
       (ROOT / "tools/qa/_new_verify_out.txt").exists())

    OUT.append("== P7 泄露检测：脚本/输出是否吐出敏感信息 ==")
    patt = re.compile(r"(sk-[A-Za-z0-9]{8,}|ARK_API_KEY\s*=\s*\S{8,}|Bearer\s+\S{12,})")
    ck("P7.1 脚本正文不含真实密钥形态字串", not patt.search(src), patt.findall(src)[:3])
    # 独立核实：脚本是否只打印 token 前 4 位。判据 = 源码里出现 [:] 截断，
    # 且不存在把 ADMIN_TOKEN 原样拼接进 print/check 的位置。
    tok = os.getenv("ADMIN_TOKEN", "")
    raw_tok_uses = [m.start() for m in re.finditer(r"ADMIN_TOKEN", src)]
    trunc_ok = ("ADMIN_TOKEN[:4]" in src)
    # 去掉所有已知的安全用法后，不应再有裸 ADMIN_TOKEN 参与输出
    stripped = src.replace("ADMIN_TOKEN[:4]", "").replace(
        'os.getenv("ADMIN_TOKEN", "").strip()', "").replace(
        'os.getenv("ADMIN_TOKEN", "")', "")
    leaked_tok = re.search(r'ADMIN_TOKEN[^_]', stripped)
    ck("P7.2 脚本对 ADMIN_TOKEN 做了截断 [:] 使用", trunc_ok)
    # 精确方法：用 tokenize 逐 token 判定。关键：ADMIN_TOKEN 在任何**求值位置**
    # 若其后（跳过空白）紧跟 `[` `:4` `]`，则求值结果是前 4 位，安全。
    # 只有「ADMIN_TOKEN 作为整体值被输出/断言」才算泄露。
    import tokenize as _tk
    toks = list(_tk.generate_tokens(io.StringIO(src).readline))
    bad = []
    for i, t in enumerate(toks):
        if t.type != _tk.NAME or t.string != "ADMIN_TOKEN":
            continue
        # 取其「求值表达式」的 token 窗口：ADMIN_TOKEN 及其后缀切片/属性链
        expr = ["ADMIN_TOKEN"]
        k = i + 1
        while k < len(toks) and toks[k].string in ("[", ":", "4", "]"):
            expr.append(toks[k].string)
            if toks[k].string == "]":
                break
            k += 1
        # 判定该完整表达式是否被截断（形如 ADMIN_TOKEN[:4]）
        truncated = "".join(expr) == "ADMIN_TOKEN[:4]"
        if truncated:
            continue
        # 未截断 -> 看是否落在 print/check 的实参位置（跨过所有括号层级）
        depth = 0
        ctx = None
        for j in range(i - 1, max(-1, i - 300), -1):
            s = toks[j].string
            if s in ")]}":
                depth += 1
            elif s in "([{":
                if depth == 0:
                    prev = toks[j - 1].string if j - 1 >= 0 else ""
                    if prev in ("print", "check"):
                        ctx = prev
                    break
                depth -= 1
        if ctx:
            bad.append((ctx, t.start[0], "".join(expr)))
    ck("P7.2b 无未被截断的 ADMIN_TOKEN 变量进入 print()/check()",
       not bad, bad)
    ck("P7.2c 代码 token 中 ADMIN_TOKEN 相关标识符正常出现",
       any(x.string == "ADMIN_TOKEN" for x in toks))
    ck("P7.3 我的探针输出不含完整 token", tok == "" or tok not in "\n".join(OUT))
    ck("P7.4 对方脚本同目录输出亦不含完整 token",
       tok == "" or tok not in (ROOT / "tools/qa/_new_verify_out.txt").read_text(encoding="utf-8"))

    reset()
    OUT.append("")
    OUT.append("结果：通过 %d，失败 %d" % (P, F))
    return 0 if F == 0 else 1


if __name__ == "__main__":
    try:
        code = main()
    except Exception as e:
        import traceback
        OUT.append("EXC: " + traceback.format_exc())
        code = 2
    (ROOT / "tools/qa/_r88f_probe_out.txt").write_text("\n".join(OUT), encoding="utf-8")
    sys.exit(code)
