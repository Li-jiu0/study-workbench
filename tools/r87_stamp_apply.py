# -*- coding: utf-8 -*-
"""R87 资产刷戳 pass：把「本批内容真改过」的资产统一刷到 ?v=20260918c。

背景
----
本项目「AI 修好了但用户测还是老样子」的头号成因（SOP §8.1）：资产的 <script src>
不带 ?v= → 浏览器 / WebView 命中缓存里的旧文件。R87 本批真正改动的资产里：
  · 补戳（当前全裸 BARE）：8 个 ai-cap-*.js（含 registry）+ xt-aiusage.js + xt-update.js
  · 升戳（20260918b → 20260918c）：ai-config.js / ai-service.js / ai-settings.js / ai-page.js

安全约束（逐条对应 SOP 实事故）
----
  · §2.0 属性锚定：仅在 (src|href)=["']assets/<name>["']（可带 ?v=）处替换 —— 绝不误伤
    注释 / 用户可见字符串里的裸路径（R63 事故：注释 `assets/api.js 请求带…`、报错文案
    `new Error('AI 底座（assets/ai-service.js）尚未就绪')` 被污染）。
  · §2.0.1 无双后缀：捕获组不含 .js、替换串里 `assets/<name>.js` 只出现一次，杜绝 `js.js`（R64 事故）。
  · §5.0 二进制读写：open(p,'rb') → re.subn → open(p,'wb')，行尾逐字节不变（曾把 39 页 CRLF 静默改 LF 推生产）。
  · §2.1 最小变更：只碰 TARGETS 资产，其余资产/旧戳一律不动。
  · 独立终态复验：用与替换「不同的」标签解析 pattern 重数每资产戳分布，必须非空且满足预期；
    并显式扫 `\\.js\\.js\\?v=` 与非属性命中，均须为 0。

用法
----
    python tools/r87_stamp_apply.py            # 默认 dry-run，只打印不写盘
    python tools/r87_stamp_apply.py --apply    # 真正写盘（执行前务必确认 T03 已冻结！）

注意：xt-aiusage.js 的引用行位于 ai-settings.html（T03 独占）。脚本能处理它，但 --apply
必须等 T03 冻结后再跑（否则会与 T03 的改动冲突 / 互相覆盖）。
"""
from __future__ import annotations

import glob
import os
import re
import shutil
import sys
from typing import Dict, List, Tuple

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAMP = "20260918c"
BAK = ".bak-pre-r87-20260918"
OUT = os.path.join(ROOT, "tools", "r87_stamp_apply_out.txt")

# 目标 1：补戳（当前 BARE，无 ?v=）
ADD_ASSETS = [
    "assets/ai-cap-registry.js",
    "assets/ai-cap-image.js",
    "assets/ai-cap-vision.js",
    "assets/ai-cap-audio.js",
    "assets/ai-cap-embed.js",
    "assets/ai-cap-translate.js",
    "assets/ai-cap-video.js",
    "assets/ai-cap-3d.js",
    "assets/xt-aiusage.js",
    "assets/xt-update.js",
]
# 目标 2：升戳（现有 ?v= 一律改成本批戳；若裸则补）
UPG_ASSETS = [
    "assets/ai-config.js",
    "assets/ai-service.js",
    "assets/ai-settings.js",
    "assets/ai-page.js",
]
TARGETS = ADD_ASSETS + UPG_ASSETS

# 排除清单（废弃草稿，与部署清单一致；不刷戳，避免无谓 diff 污染审计）
EXCLUDE_HTML = {"blog_wechat.html"}

# 纯 LF 例外（不参与 CRLF 断言）
EOL_LF_EXCEPT = {"ai-settings.html"}

_LOG: List[str] = []


def log(s: str = "") -> None:
    _LOG.append(str(s))


# ----------------------------------------------------------------------
# 替换 pattern（属性锚定；捕获组不含 .js；替换串里 .js 只出现一次）
# ----------------------------------------------------------------------
def rx_ref(rel: str) -> "re.Pattern[bytes]":
    esc = re.escape(rel.encode("utf-8"))
    return re.compile(
        rb'((?:src|href)\s*=\s*["\'])' + esc + rb'(\?v=[0-9A-Za-z_.\-]+)?(?=["\'])',
        re.IGNORECASE,
    )


RX_MAP = {rel: rx_ref(rel) for rel in TARGETS}


def repl_for(rel: str):
    relb = rel.encode("utf-8")
    stampb = STAMP.encode("ascii")

    def _rep(m: "re.Match[bytes]") -> bytes:
        return m.group(1) + relb + b"?v=" + stampb

    return _rep


# ----------------------------------------------------------------------
# 独立终态复验用 pattern（标签解析，与替换 pattern 不同）
# ----------------------------------------------------------------------
RX_TAG = re.compile(rb'<(?:script|link)\b[^>]*>', re.IGNORECASE)
RX_ATTR = re.compile(rb'(?:src|href)\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
RX_ASSETPATH = re.compile(rb'assets/([^"\'?]+)\?v=([0-9A-Za-z_.\-]+)')


def tag_parse_dist(raw: bytes) -> Dict[str, Dict[str, int]]:
    """用标签解析法统计 assets/<name>?v=<stamp> 分布（独立于替换 pattern）。"""
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
    """标签解析法：assets/ 路径但无 ?v=（裸引用）。"""
    bare = []
    for tg in RX_TAG.findall(raw):
        for u in RX_ATTR.findall(tg):
            if u.startswith(b"assets/") and b"?v=" not in u:
                bare.append(u.decode("utf-8", "replace"))
    return bare


# ----------------------------------------------------------------------
# 非属性命中检查（§2.0 必做）：assets/<target>?v=<stamp> 前面 40 字节内必须出现 src=/href=
# ----------------------------------------------------------------------
def non_attr_hits(raw: bytes) -> List[str]:
    hits = []
    for rel in TARGETS:
        pat = re.compile(re.escape(rel.encode("utf-8")) + rb'\?v=' + STAMP.encode("ascii"))
        for m in pat.finditer(raw):
            start = max(0, m.start() - 40)
            window = raw[start:m.start()].lower()
            if (b'src=' not in window) and (b'href=' not in window):
                hits.append(rel)
    return hits


def lone_lf(raw: bytes) -> int:
    return raw.count(b"\n") - raw.count(b"\r\n")


# ======================================================================
def main(argv: List[str]) -> int:
    apply = "--apply" in argv
    if apply and "--dry-run" in argv:
        print("错误：--apply 与 --dry-run 不能同时使用。")
        return 2
    dry_run = not apply

    files = sorted(
        p for p in glob.glob(os.path.join(ROOT, "*.html"))
        if os.path.basename(p) not in EXCLUDE_HTML
    )

    log("=== R87 资产刷戳 pass ===")
    log("模式: %s" % ("apply（写盘）" if apply else "dry-run（不写盘）"))
    log("新戳: %s   目标资产: 补戳 %d + 升戳 %d = %d"
        % (STAMP, len(ADD_ASSETS), len(UPG_ASSETS), len(TARGETS)))
    log("根 HTML（排除 %s）: %d 个" % (", ".join(sorted(EXCLUDE_HTML)) or "无", len(files)))
    log("")

    # ---------- BEFORE 戳分布（独立标签解析） ----------
    before_dist: Dict[str, Dict[str, int]] = {}
    before_bare: Dict[str, int] = {}
    for p in files:
        with open(p, "rb") as f:
            raw = f.read()
        for k, v in tag_parse_dist(raw).items():
            if k in TARGETS:
                d = before_dist.setdefault(k, {})
                for s, c in v.items():
                    d[s] = d.get(s, 0) + c
        for b in tag_parse_bare(raw):
            if b in TARGETS:
                before_bare[b] = before_bare.get(b, 0) + 1
    log("-- BEFORE 目标资产戳分布 --")
    for rel in TARGETS:
        d = before_dist.get(rel, {})
        bare = before_bare.get(rel, 0)
        log("  %-30s stamped=%s  bare=%d" % (rel, d if d else "{}", bare))
    log("")

    # ---------- 逐页替换（内存中算好） ----------
    plan: List[Tuple[str, bytes, bytes, Dict[str, int], List[Tuple[str, str]]]] = []
    for p in files:
        with open(p, "rb") as f:
            raw = f.read()
        cur = raw
        per: Dict[str, int] = {}
        for rel in TARGETS:
            cur, n = RX_MAP[rel].subn(repl_for(rel), cur)
            if n:
                per[rel] = per.get(rel, 0) + n
        if cur != raw:
            # 行级 diff（替换只发生在行内）
            old_lines = raw.split(b"\n")
            new_lines = cur.split(b"\n")
            diffs = []
            for i in range(min(len(old_lines), len(new_lines))):
                if old_lines[i] != new_lines[i]:
                    diffs.append((
                        old_lines[i].decode("utf-8", "replace").rstrip("\r"),
                        new_lines[i].decode("utf-8", "replace").rstrip("\r"),
                    ))
            plan.append((p, raw, cur, per, diffs))

    log("-- 逐页改动（%d 个文件） --" % len(plan))
    for p, raw, cur, per, diffs in plan:
        log("  [%s] +%d bytes  %s"
            % (os.path.basename(p), len(cur) - len(raw),
               {k.replace("assets/", ""): v for k, v in per.items()}))
        for old, new in diffs:
            log("        - %s" % old)
            log("        + %s" % new)
    log("")

    # ---------- 写盘（含备份） ----------
    wrote = 0
    if dry_run:
        log("[dry-run] 未写盘。去掉 --dry-run / 加 --apply 才真正生效。")
    else:
        for p, raw, cur, per, diffs in plan:
            bkp = p + BAK
            if not os.path.exists(bkp):
                shutil.copy2(p, bkp)
            with open(p, "wb") as f:
                f.write(cur)
            wrote += 1
        log("已写入 %d 个文件（备份后缀 %s）。" % (wrote, BAK))
    log("")

    # ---------- 终态复验（对「内存中已替换」的字节做，dry-run 亦有效） ----------
    after_raw: Dict[str, bytes] = {}
    for p, raw, cur, per, diffs in plan:
        after_raw[p] = cur
    # 未改动的文件也要参与全站统计
    all_after: Dict[str, bytes] = {}
    for p in files:
        if p in after_raw:
            all_after[p] = after_raw[p]
        else:
            with open(p, "rb") as f:
                all_after[p] = f.read()

    after_dist: Dict[str, Dict[str, int]] = {}
    after_bare: Dict[str, int] = {}
    for p, raw in all_after.items():
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
        log("  %-30s %-28s bare=%d  %s"
            % (rel, d if d else "{}", bare, "PASS" if ok else "FAIL"))
    log("")

    # ---------- 事故特征扫描 ----------
    acc_jsjs = 0
    acc_jsjs_files = []
    non_attr_total = 0
    non_attr_files = []
    for p, raw in all_after.items():
        n = raw.count(b".js.js?v=") + raw.count(b".css.css?v=")
        if n:
            acc_jsjs += n
            acc_jsjs_files.append(os.path.basename(p))
        nh = non_attr_hits(raw)
        if nh:
            non_attr_total += len(nh)
            non_attr_files.append((os.path.basename(p), nh))

    lone_bad = []
    for p, raw in all_after.items():
        name = os.path.basename(p)
        lone = lone_lf(raw)
        if name in EOL_LF_EXCEPT:
            crlf = raw.count(b"\r\n")
            if not (crlf == 0 and lone > 0):
                lone_bad.append("%s(除页,期望纯LF) crlf=%d lone=%d" % (name, crlf, lone))
        elif lone != 0:
            lone_bad.append("%s lone=%d" % (name, lone))

    log("-- 事故特征扫描 --")
    log("  .js.js?v= / .css.css?v= 命中: %d %s"
        % (acc_jsjs, acc_jsjs_files if acc_jsjs_files else ""))
    log("  非属性命中（assets/<target>?v= 前 40B 无 src=/href=）: %d %s"
        % (non_attr_total, non_attr_files if non_attr_files else ""))
    log("  行尾 loneLF 违规: %d %s" % (len(lone_bad), lone_bad if lone_bad else ""))
    log("")

    ok_all = (not bad) and acc_jsjs == 0 and non_attr_total == 0 and not lone_bad
    log("=== 结论: %s ===" % ("全部自检通过 ✅" if ok_all else "存在 FAIL ❌ 见上"))
    if dry_run:
        log("（dry-run：以上 AFTER 为「若执行 --apply 的预期终态」）")

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
