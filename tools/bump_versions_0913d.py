#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批次五 T03（2026-09 批次五）：bump 0913d —— 把版本体系从「HTML 标签」扩展到
「运行时数据路径」。不改 0913c，本脚本是它的超集。

相对 0913c 的增量（本批新增的两类注入点）：
  1. **JS 里的资源 fetch 字面量**：`fetch('assets/data/xxx.json?v=<ver>')`
     —— 命中 `assets/data/*.json?v=<ver>` 的字符串字面量，重写版本串。
  2. **数据索引 JSON 的 file 字段**：`"file": "assets/data/xxx.json?v=<ver>"`
     —— vocab 索引 8 条 + exam 索引 15 条。

安全策略（沿用 0913c 铁律，2026-09-11「正则吞注释」事故后立项）：
  1. HTML：仅 `<script ... src=.js>` / `<link ... href=.css>` 真实行进入替换，
     行内正则匹配到闭合引号为止，绝不跨行；注释行 + 注释状态机双重跳过。
  2. JS：逐字符注释掩码（识别 `//`、`/* */`、字符串、**正则字面量**），
     仅掩码外的 `?v=` 才重写；注释里的提及保持原样。
  3. JSON：先 `json.loads` 校验原文；重写后**再次** `json.loads` 校验，失败即中止，
     绝不允许把 JSON 写坏。
  4. 改后逐文件安全校验：注释配对 / div·script·nav·span 配平 / link 计数 /
     版本号损坏签名。任一不通过 → 拒绝落盘。

用法：
    python tools/bump_versions_0913d.py                      # 预演（--check，全部 scope）
    python tools/bump_versions_0913d.py --scope js,json      # 只检查新增注入点
    python tools/bump_versions_0913d.py --write              # 真正写入
    python tools/bump_versions_0913d.py 20260913d --write    # 指定目标版本号

退出码：
    0 = 预演无改动（幂等）
    2 = 出现安全问题（已拒绝落盘）
    3 = 预演出现改动（硬门禁：说明还没 bump 到目标版本，或分片线中间态）
"""
from __future__ import annotations

import io
import json
import os
import re
import sys

VERSION = "20260913c"   # 批次五当前目标版本；全局 bump 由主代理统一发起

# 不加载 assets/app.js 的 5 个页面：保持旧版本号 20260913a（沿用 0913c 的豁免约定）
KEEP_OLD = {"AI模拟面试.html", "PPT素材库.html", "四级经验分享.html",
            "好友申请.html", "登录.html"}

# ---------------------------------------------------------------------------
# HTML：script / link（与 0913c 同源）
# ---------------------------------------------------------------------------
_NOT_REMOTE = r'(?!(?:https?:)?//|data:|#)'
RE_SCRIPT = re.compile(r'''(<script\b[^>]*?\bsrc\s*=\s*["']'''
                       + _NOT_REMOTE
                       + r'''[^"']*?\.js)(\?[^"']*)?(["'])''')
RE_LINK = re.compile(r'''(<link\b[^>]*?\bhref\s*=\s*["']'''
                     + _NOT_REMOTE
                     + r'''[^"']*?\.css)(\?[^"']*)?(["'])''')
RE_CORRUPT = re.compile(r'\.(?:js|css)\?v=[0-9A-Za-z._]+["\'][^>\s]')
RE_BROKEN_CLASS = re.compile(r'class="nav-item active data-page=')

# ---------------------------------------------------------------------------
# 新增：JS fetch 字面量 & JSON file 字段（均为「已有 ?v=」的版本串重写）
# ---------------------------------------------------------------------------
RE_JS_FETCH = re.compile(r'''(assets/data/[A-Za-z0-9_\-./]+\.json)\?v=[0-9A-Za-z._]+''')
RE_JSON_FILE = re.compile(r'''("file"\s*:\s*")(assets/data/[A-Za-z0-9_\-./]+\.json)\?v=[0-9A-Za-z._]+(")''')


# ---------------------------------------------------------------------------
# JS 注释掩码（识别 // 、/* */ 、字符串、正则字面量）—— 与扫描脚本 maskJS 同源
# ---------------------------------------------------------------------------
_JS_KW_BEFORE_REGEX = {"return", "typeof", "instanceof", "in", "of", "new",
                       "delete", "void", "do", "else", "case", "yield",
                       "await", "throw"}


def _regex_allowed(s: str, i: int) -> bool:
    j = i - 1
    while j >= 0 and s[j] in " \t\r\n":
        j -= 1
    if j < 0:
        return True
    p = s[j]
    if p.isalnum() or p in "_$)]}'\"`":
        k = j
        while k >= 0 and (s[k].isalnum() or s[k] in "_$"):
            k -= 1
        word = s[k + 1:j + 1]
        return word in _JS_KW_BEFORE_REGEX
    return True


def mask_js(s: str) -> bytearray:
    n = len(s)
    mask = bytearray(n)
    i = 0
    while i < n:
        c = s[i]
        if c == '/' and i + 1 < n and s[i + 1] == '/':          # 行注释
            j = i
            while j < n and s[j] != '\n':
                mask[j] = 1
                j += 1
            i = j
            continue
        if c == '/' and i + 1 < n and s[i + 1] == '*':          # 块注释
            j = i
            mask[i] = 1
            if i + 1 < n:
                mask[i + 1] = 1
            j = i + 2
            while j < n:
                if s[j] == '*' and j + 1 < n and s[j + 1] == '/':
                    mask[j] = 1
                    mask[j + 1] = 1
                    j += 2
                    break
                mask[j] = 1
                j += 1
            i = j
            continue
        if c in ('"', "'", '`'):                                 # 字符串
            q = c
            j = i + 1
            while j < n:
                if s[j] == '\\':
                    j += 2
                    continue
                if s[j] == q:
                    j += 1
                    break
                j += 1
            i = j
            continue
        if c == '/' and _regex_allowed(s, i):                    # 正则字面量
            j = i + 1
            in_class = False
            while j < n:
                d = s[j]
                if d == '\\':
                    j += 2
                    continue
                if d == '\n':
                    break
                if d == '[':
                    in_class = True
                    j += 1
                    continue
                if d == ']':
                    in_class = False
                    j += 1
                    continue
                if d == '/' and not in_class:
                    j += 1
                    break
                j += 1
            while j < n and s[j].isalpha():                      # flags
                j += 1
            i = j
            continue
        i += 1
    return mask


def _line_starts(s: str) -> list[int]:
    starts = [0]
    for i, ch in enumerate(s):
        if ch == '\n':
            starts.append(i + 1)
    return starts


def _line_of(starts: list[int], idx: int) -> int:
    lo, hi, ans = 0, len(starts) - 1, 0
    while lo <= hi:
        mid = (lo + hi) // 2
        if starts[mid] <= idx:
            ans = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return ans + 1


# ---------------------------------------------------------------------------
# HTML 处理（原样沿用 0913c）
# ---------------------------------------------------------------------------
def is_real_asset_line(line: str) -> bool:
    s = line.lstrip()
    low = s.lower()
    if low.startswith("<!--"):
        return False
    if low.startswith("<script") and RE_SCRIPT.search(line):
        return True
    if low.startswith("<link") and RE_LINK.search(line):
        return True
    return False


def bump_line(line: str, version: str, in_comment: bool = False) -> str:
    if in_comment or not is_real_asset_line(line):
        return line
    if line.lstrip().lower().startswith("<script"):
        return RE_SCRIPT.sub(lambda m: m.group(1) + "?v=" + version + m.group(3), line)
    return RE_LINK.sub(lambda m: m.group(1) + "?v=" + version + m.group(3), line)


def balance(text: str, tag: str) -> tuple[int, int]:
    op = len(re.findall(r"<" + tag + r"(\s|>)", text, re.I))
    cl = len(re.findall(r"</" + tag + r">", text, re.I))
    return op, cl


def process_html(path: str, version: str, write: bool) -> tuple[int, bool, list[str]]:
    raw = open(path, "rb").read()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    lines = text.split("\n")
    new_lines: list[str] = []
    in_comment = False
    for ln in lines:
        new_lines.append(bump_line(ln, version, in_comment))
        if not in_comment and ln.count("<!--") > ln.count("-->"):
            in_comment = True
        elif in_comment and "-->" in ln and ln.count("-->") >= ln.count("<!--"):
            in_comment = False
    n_changed = sum(1 for a, b in zip(lines, new_lines) if a != b)
    if n_changed == 0:
        return 0, True, []
    new_text = "\n".join(new_lines)
    problems: list[str] = []
    if text.count("<!--") != new_text.count("<!--") or text.count("-->") != new_text.count("-->"):
        problems.append(f"{path}: 注释配对发生变化，拒绝落盘")
    for tag in ("div", "script", "nav", "span"):
        if balance(text, tag) != balance(new_text, tag):
            problems.append(f"{path}: <{tag}> 配平变化，拒绝落盘")
    if len(re.findall(r"<link(\s|>)", text, re.I)) != len(re.findall(r"<link(\s|>)", new_text, re.I)):
        problems.append(f"{path}: <link> 计数变化，拒绝落盘")
    if RE_CORRUPT.search(new_text):
        problems.append(f"{path}: 版本号损坏签名 {RE_CORRUPT.search(new_text).group(0)!r}，拒绝落盘")
    if RE_BROKEN_CLASS.search(new_text):
        problems.append(f"{path}: 畸形属性 class=\"nav-item active data-page=，拒绝落盘")
    if problems:
        return n_changed, False, problems
    if write:
        payload = ("\ufeff" if has_bom else "") + new_text
        open(path, "wb").write(payload.encode("utf-8"))
    return n_changed, True, []


# ---------------------------------------------------------------------------
# JS 处理（新增注入点 ①：assets/data/*.json?v=）
# ---------------------------------------------------------------------------
def process_js(path: str, version: str, write: bool) -> tuple[int, list[str], list[str]]:
    text = open(path, "rb").read().decode("utf-8-sig")
    mask = mask_js(text)
    starts = _line_starts(text)
    pieces: list[str] = []
    changes: list[str] = []
    last = 0
    for m in RE_JS_FETCH.finditer(text):
        if mask[m.start()]:
            continue                       # 位于注释/字符串外才算……（字符串内才应命中，此处仅挡注释）
        old = m.group(0)
        new = m.group(1) + "?v=" + version
        pieces.append(text[last:m.start()])
        pieces.append(new)
        last = m.end()
        if old != new:
            changes.append(f"{os.path.basename(path)}:{_line_of(starts, m.start())}  {old}  ->  {new}")
    pieces.append(text[last:])
    new_text = "".join(pieces)
    if not changes:
        return 0, [], []
    if write:
        open(path, "wb").write(new_text.encode("utf-8"))
    return len(changes), changes, []


# ---------------------------------------------------------------------------
# JSON 处理（新增注入点 ②："file": "assets/data/*.json?v="）
# ---------------------------------------------------------------------------
def process_json(path: str, version: str, write: bool) -> tuple[int, list[str], list[str]]:
    raw = open(path, "rb").read()
    text = raw.decode("utf-8-sig")
    problems: list[str] = []
    try:
        json.loads(text)                       # 原文必须合法
    except Exception as e:                     # noqa: BLE001
        return 0, [], [f"{path}: 原文 JSON 解析失败（{e}），跳过且不写"]
    starts = _line_starts(text)
    pieces: list[str] = []
    changes: list[str] = []
    last = 0
    for m in RE_JSON_FILE.finditer(text):
        old = m.group(0)
        new = m.group(1) + m.group(2) + "?v=" + version + m.group(3)
        pieces.append(text[last:m.start()])
        pieces.append(new)
        last = m.end()
        if old != new:
            changes.append(f"{os.path.basename(path)}:{_line_of(starts, m.start())}  file 字段版本串 -> {version}")
    pieces.append(text[last:])
    new_text = "".join(pieces)
    if not changes:
        return 0, [], []
    try:
        json.loads(new_text)                   # 写回前二次校验，坏了一律中止
    except Exception as e:                     # noqa: BLE001
        problems.append(f"{path}: 重写后 JSON 解析失败（{e}），拒绝落盘")
        return len(changes), [], problems
    if write:
        open(path, "wb").write(new_text.encode("utf-8"))
    return len(changes), changes, problems


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def collect(root: str):
    htmls = sorted(f for f in os.listdir(root)
                   if f.lower().endswith(".html") and os.path.isfile(os.path.join(root, f)))
    assets = os.path.join(root, "assets")
    jss = []
    if os.path.isdir(assets):
        for f in sorted(os.listdir(assets)):
            if f.endswith(".js") and not re.search(r"\.bak|\.removed", f):
                jss.append(os.path.join("assets", f))
    data_dir = os.path.join(assets, "data")
    jsons = []
    if os.path.isdir(data_dir):
        for f in sorted(os.listdir(data_dir)):
            if f.endswith(".json") and not re.search(r"\.bak", f):
                jsons.append(os.path.join("assets", "data", f))
    return htmls, jss, jsons


def main() -> None:
    args = sys.argv[1:]
    write = "--write" in args
    version = VERSION
    scope = {"html", "js", "json"}
    for i, a in enumerate(args):
        if a == "--scope" and i + 1 < len(args):
            scope = set(x.strip() for x in args[i + 1].split(",") if x.strip())
        elif re.fullmatch(r"[0-9A-Za-z._]{4,}", a) and not a.startswith("--"):
            version = a

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    htmls, jss, jsons = collect(root)

    out: list[str] = [
        f"模式: {'WRITE（已落盘）' if write else 'CHECK（预演，未落盘）'}",
        f"目标版本号: {version}",
        f"scope: {','.join(sorted(scope))}",
        f"候选文件: HTML {len(htmls)} / JS {len(jss)} / JSON {len(jsons)}",
        "",
    ]
    total = 0
    files_changed = 0
    per_scope = {"html": 0, "js": 0, "json": 0}
    all_problems: list[str] = []

    if "html" in scope:
        for f in htmls:
            if os.path.basename(f) in KEEP_OLD:
                out.append(f"  - {f}: 跳过（不加载 app.js，保持 20260913a）")
                continue
            n, ok, probs = process_html(f, version, write)
            if probs:
                all_problems.extend(probs)
                out.append(f"  ! {f}: 跳过（{len(probs)} 问题）")
                continue
            if n:
                files_changed += 1
                total += n
                per_scope["html"] += n
                out.append(f"  ~ {f}  ({n} 行)")
    if "js" in scope:
        for rel in jss:
            n, chs, probs = process_js(rel, version, write)
            if probs:
                all_problems.extend(probs)
                continue
            if n:
                files_changed += 1
                total += n
                per_scope["js"] += n
                out.append(f"  ~ {rel}  ({n} 处)")
                out.extend("      " + c for c in chs)
    if "json" in scope:
        for rel in jsons:
            n, chs, probs = process_json(rel, version, write)
            if probs:
                all_problems.extend(probs)
                out.append(f"  ! {rel}: 跳过")
                continue
            if n:
                files_changed += 1
                total += n
                per_scope["json"] += n
                out.append(f"  ~ {rel}  ({n} 处)")
                out.extend("      " + c for c in chs)

    out.append("")
    out.append(f"改动文件 {files_changed} 个，改动点 {total} 个"
               f"  （html {per_scope['html']} / js {per_scope['js']} / json {per_scope['json']}）")
    out.append("问题: " + ("无 ✅" if not all_problems else ""))
    for pr in all_problems:
        out.append("  - " + pr)

    txt = "\n".join(out)
    os.makedirs(os.path.join("tools", "qa"), exist_ok=True)
    report = os.path.join("tools", "qa", "_bump_0913d_" + ("out" if write else "check") + ".txt")
    io.open(report, "w", encoding="utf-8").write(txt)
    print(txt)

    if all_problems:
        sys.exit(2)
    if not write and total > 0:
        print("!! CHECK 未通过：预演出现改动（幂等门禁要求 0 改动）")
        sys.exit(3)
    sys.exit(0)


if __name__ == "__main__":
    main()
