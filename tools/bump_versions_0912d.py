# -*- coding: utf-8 -*-
"""T06 定向版本号 bump（2026-09-12d，寇豆码）

只 bump 本次真正改动的 4 个页面：个人中心.html / mock_exam.html /
mock_exam_run.html / mock_exam_result.html —— 绝不整站替换（项目铁律）。

复用 bump_versions_0912a.py 的「安全策略」：
  1) 先按行过滤：只有 lstrip 后以 <script/<link 开头且含真实 src/href="assets/…" 的行才替换；
  2) 不跨行通配；HTML 注释里的引用保持原样；
  3) 改后校验：注释/div/script/nav/span 配对 + link 计数 + 版本号损坏签名，任一不过即拒绝落盘。

用法：
    python tools/bump_versions_0912d.py            # 预演（CHECK）
    python tools/bump_versions_0912d.py --write    # 落盘
"""
from __future__ import annotations

import io
import os
import re
import sys

VERSION = "20260912d"
PAGES = [
    "个人中心.html",
    "mock_exam.html",
    "mock_exam_run.html",
    "mock_exam_result.html",
]

RE_SCRIPT = re.compile(r'(<script\b[^>]*?\bsrc\s*=\s*"(?:assets|data)/[^"]*?\.js)(\?v=[0-9A-Za-z._]+)?(")')
RE_LINK = re.compile(r'(<link\b[^>]*?\bhref\s*=\s*"(?:assets|data)/[^"]*?\.css)(\?v=[0-9A-Za-z._]+)?(")')
RE_CORRUPT = re.compile(r'\.(?:js|css)\?v=[0-9A-Za-z._]+"[^>\s]')


def is_real_asset_line(line: str) -> bool:
    s = line.lstrip()
    if s.startswith("<script") and ('src="assets/' in line or 'src="data/' in line):
        return True
    if s.startswith("<link") and ('href="assets/' in line or 'href="data/' in line):
        return True
    return False


def bump_line(line: str, version: str) -> str:
    if not is_real_asset_line(line):
        return line
    if line.lstrip().startswith("<script"):
        return RE_SCRIPT.sub(lambda m: m.group(1) + "?v=" + version + m.group(3), line)
    return RE_LINK.sub(lambda m: m.group(1) + "?v=" + version + m.group(3), line)


def balance(text: str, tag: str):
    op = len(re.findall(r"<" + tag + r"(\s|>)", text, re.I))
    cl = len(re.findall(r"</" + tag + r">", text, re.I))
    return op, cl


def process(page: str, version: str, write: bool):
    if not os.path.exists(page):
        return 0, [f"{page}: 文件不存在"]
    raw = open(page, "rb").read()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    lines = text.split("\n")
    new_lines = [bump_line(ln, version) for ln in lines]
    n_changed = sum(1 for a, b in zip(lines, new_lines) if a != b)
    if n_changed == 0:
        return 0, []
    new_text = "\n".join(new_lines)

    problems = []
    if text.count("<!--") != new_text.count("<!--") or text.count("-->") != new_text.count("-->"):
        problems.append(f"{page}: 注释配对变化，拒绝落盘")
    for tag in ("div", "script", "nav", "span"):
        if balance(text, tag) != balance(new_text, tag):
            problems.append(f"{page}: <{tag}> 配对变化 {balance(text, tag)} → {balance(new_text, tag)}，拒绝落盘")
    if len(re.findall(r"<link(\s|>)", text, re.I)) != len(re.findall(r"<link(\s|>)", new_text, re.I)):
        problems.append(f"{page}: <link> 计数变化，拒绝落盘")
    m = RE_CORRUPT.search(new_text)
    if m:
        problems.append(f"{page}: 版本号损坏签名 {m.group(0)!r}，拒绝落盘")

    if problems:
        return n_changed, problems
    if write:
        payload = ("\ufeff" if has_bom else "") + new_text
        open(page, "wb").write(payload.encode("utf-8"))
    return n_changed, []


def main():
    write = "--write" in sys.argv[1:]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    out = [f"模式: {'WRITE（已落盘）' if write else 'CHECK（预演）'}",
           f"目标版本号: {VERSION}",
           f"目标页面数: {len(PAGES)}", ""]
    tf = tl = 0
    probs_all = []
    for p in PAGES:
        n, probs = process(p, VERSION, write)
        if probs:
            probs_all.extend(probs)
            out.append(f"  ! {p}: 跳过（{len(probs)} 问题）")
            continue
        if n:
            tf += 1
            tl += n
            out.append(f"  ~ {p}  ({n} 行)")
        else:
            out.append(f"  = {p}  (已是 {VERSION}，无需改动)")
    out.append("")
    out.append(f"改动文件 {tf} 个，改动行 {tl} 行")
    out.append("问题: " + ("无 ✅" if not probs_all else ""))
    for pr in probs_all:
        out.append("  - " + pr)
    txt = "\n".join(out)
    os.makedirs(os.path.join("tools", "qa"), exist_ok=True)
    io.open(os.path.join("tools", "qa", "_bump_0912d_" + ("out" if write else "check") + ".txt"),
            "w", encoding="utf-8").write(txt)
    print(txt)
    sys.exit(2 if probs_all else 0)


if __name__ == "__main__":
    main()
