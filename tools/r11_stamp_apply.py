# -*- coding: utf-8 -*-
"""R11 通用资产刷戳工具（由 r10_stamp_apply.py 泛化）。

用法：
    # 只改 assets/*.js 时，给「被改动的资产」刷新戳
    python tools/r11_stamp_apply.py --stamp 20260925a assets/foo.js assets/bar.js
    python tools/r11_stamp_apply.py --stamp 20260925a --apply assets/foo.js

沿用 r10 的安全约束（逐条对应历史事故）：
  · 属性锚定：只在 (src|href)="assets/<name>"(可带 ?v=) 处替换，绝不误伤注释/可见字符串
  · 无双后缀：捕获组不含 .js，替换串 .js 只出现一次，杜绝 `js.js`
  · 二进制读写 rb→subn→wb，行尾逐字节不变（曾静默把 CRLF 改 LF）
  · 最小变更：只碰 targets；其他资产一律不动
  · 独立复验：用「标签解析」另一套 pattern 重数戳分布，必须恰好 == {STAMP}，bare=0
  · 事故扫描：`.js.js?v=` / 非属性命中 / loneLF 变化 必须全 0
"""
from __future__ import annotations

import glob
import os
import re
import shutil
import sys
from typing import Dict, List, Tuple

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tools", "r11_stamp_apply_out.txt")
BAK = ".bak-pre-r11"

EXCLUDE_HTML = {"blog_wechat.html"}

_LOG: List[str] = []
STAMP = ""
TARGETS: List[str] = []


def log(s: str = "") -> None:
    _LOG.append(str(s))


def rx_ref(rel: str) -> "re.Pattern[bytes]":
    esc = re.escape(rel.encode("utf-8"))
    return re.compile(
        rb'((?:src|href)\s*=\s*["\'])'
        + esc
        + rb'(\?v=[0-9A-Za-z_.\-]+)?(?=["\'])',
        re.IGNORECASE,
    )


def repl_for(rel: str):
    relb = rel.encode("utf-8")
    stampb = STAMP.encode("ascii")

    def _rep(m: "re.Match[bytes]") -> bytes:
        return m.group(1) + relb + b"?v=" + stampb

    return _rep


RX_TAG = re.compile(rb'<(?:script|link)\b[^>]*>', re.IGNORECASE)
RX_ATTR = re.compile(rb'(?:src|href)\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
RX_ASSETPATH = re.compile(rb'assets/([^"\'?]+)\?v=([0-9A-Za-z_.\-]+)')


def tag_parse_dist(raw: bytes) -> Dict[str, Dict[str, int]]:
    dist: Dict[str, Dict[str, int]] = {}
    for tg in RX_TAG.findall(raw):
        for u in RX_ATTR.findall(tg):
            m = RX_ASSETPATH.match(u)
            if not m:
                continue
            name = m.group(1).decode("utf-8", "replace")
            stamp = m.group(2).decode("ascii", "replace")
            dist.setdefault("assets/" + name, {}).setdefault(stamp, 0)
            dist["assets/" + name][stamp] += 1
    return dist


def tag_parse_bare(raw: bytes) -> List[str]:
    bare = []
    for tg in RX_TAG.findall(raw):
        for u in RX_ATTR.findall(tg):
            if u.startswith(b"assets/") and b"?v=" not in u:
                bare.append(u.decode("utf-8", "replace"))
    return bare


def non_attr_hits(raw: bytes) -> List[str]:
    hits = []
    for rel in TARGETS:
        pat = re.compile(re.escape(rel.encode("utf-8")) + rb'\?v=' + STAMP.encode("ascii"))
        for m in pat.finditer(raw):
            window = raw[max(0, m.start() - 40):m.start()].lower()
            if (b'src=' not in window) and (b'href=' not in window):
                hits.append(rel)
    return hits


def lone_lf(raw: bytes) -> int:
    return raw.count(b"\n") - raw.count(b"\r\n")


def main(argv: List[str]) -> int:
    global STAMP, TARGETS
    apply = "--apply" in argv
    rest: List[str] = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--apply":
            i += 1
            continue
        if a == "--stamp":
            STAMP = argv[i + 1]
            i += 2
            continue
        rest.append(a)
        i += 1
    TARGETS = [r.replace("\\", "/") for r in rest]

    if not STAMP or not TARGETS:
        print("用法: python tools/r11_stamp_apply.py --stamp <戳> [--apply] assets/a.js [assets/b.js ...]")
        return 2

    RX_MAP = {rel: rx_ref(rel) for rel in TARGETS}

    files = sorted(
        p for p in glob.glob(os.path.join(ROOT, "*.html"))
        if os.path.basename(p) not in EXCLUDE_HTML
        and ".bak" not in os.path.basename(p).lower()
        and not os.path.basename(p).startswith("_")
    )

    log("=== R11 资产刷戳 pass ===")
    log("模式: %s" % ("apply（写盘）" if apply else "dry-run（不写盘）"))
    log("新戳: %s   目标资产: %d  %s" % (STAMP, len(TARGETS), TARGETS))
    log("根 HTML（排除 %s）: %d 个" % (", ".join(sorted(EXCLUDE_HTML)) or "无", len(files)))
    log("")

    before_raw: Dict[str, bytes] = {}
    for p in files:
        with open(p, "rb") as f:
            before_raw[p] = f.read()

    plan: List[Tuple[str, bytes, bytes, Dict[str, int]]] = []
    for p in files:
        raw = before_raw[p]
        cur = raw
        per: Dict[str, int] = {}
        for rel in TARGETS:
            cur, n = RX_MAP[rel].subn(repl_for(rel), cur)
            if n:
                per[rel] = per.get(rel, 0) + n
        if cur != raw:
            plan.append((p, raw, cur, per))

    log("-- 逐页改动（%d 个文件） --" % len(plan))
    for p, raw, cur, per in plan:
        log("  [%s] +%d bytes  %s"
            % (os.path.basename(p), len(cur) - len(raw),
               {k.replace("assets/", ""): v for k, v in per.items()}))
    log("")

    if apply:
        wrote = 0
        for p, raw, cur, per in plan:
            bkp = p + BAK
            if not os.path.exists(bkp):
                shutil.copy2(p, bkp)
            with open(p, "wb") as f:
                f.write(cur)
            wrote += 1
        log("已写入 %d 个文件（备份后缀 %s）。" % (wrote, BAK))
    else:
        log("[dry-run] 未写盘。加 --apply 才真正生效。")
    log("")

    after_raw: Dict[str, bytes] = {p: r for p, r in before_raw.items()}
    for p, raw, cur, per in plan:
        after_raw[p] = cur

    after_dist: Dict[str, Dict[str, int]] = {}
    after_bare: Dict[str, int] = {}
    for p, raw in after_raw.items():
        for k, v in tag_parse_dist(raw).items():
            if k in TARGETS:
                d = after_dist.setdefault(k, {})
                for s, c in v.items():
                    d[s] = d.get(s, 0) + c
        for b in tag_parse_bare(raw):
            if b in TARGETS:
                after_bare[b] = after_bare.get(b, 0) + 1

    log("-- AFTER 目标资产戳分布（独立标签解析复验） --")
    bad: List[str] = []
    for rel in TARGETS:
        d = after_dist.get(rel, {})
        bare = after_bare.get(rel, 0)
        ok = (list(d.keys()) == [STAMP]) and (bare == 0)
        if not ok:
            bad.append("%s stamped=%s bare=%d" % (rel, d, bare))
        log("  %-30s %-34s bare=%d  %s"
            % (rel, d if d else "{}", bare, "PASS" if ok else "FAIL"))
    log("")

    acc_jsjs = 0
    acc_jsjs_files: List[str] = []
    non_attr_total = 0
    non_attr_files: List[str] = []
    eol_bad: List[str] = []
    for p, raw in after_raw.items():
        name = os.path.basename(p)
        n = raw.count(b".js.js?v=") + raw.count(b".css.css?v=")
        if n:
            acc_jsjs += n
            acc_jsjs_files.append(name)
        nh = non_attr_hits(raw)
        if nh:
            non_attr_total += len(nh)
            non_attr_files.append((name, nh))
        if lone_lf(raw) != lone_lf(before_raw[p]):
            eol_bad.append("%s before=%d after=%d" % (name, lone_lf(before_raw[p]), lone_lf(raw)))

    log("-- 事故特征扫描 --")
    log("  .js.js?v= / .css.css?v= 命中: %d %s" % (acc_jsjs, acc_jsjs_files or ""))
    log("  非属性命中: %d %s" % (non_attr_total, non_attr_files or ""))
    log("  行尾变化(loneLF 与改前不一致): %d %s" % (len(eol_bad), eol_bad or ""))
    log("")

    ok_all = (not bad) and acc_jsjs == 0 and non_attr_total == 0 and not eol_bad
    log("=== 结论: %s ===" % ("全部自检通过 OK" if ok_all else "存在 FAIL 见上"))
    if not apply:
        log("（dry-run：AFTER 为「若执行 --apply 的预期终态」）")

    txt = "\n".join(_LOG)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(txt + "\n")
    try:
        print(txt)
    except Exception:
        pass
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
