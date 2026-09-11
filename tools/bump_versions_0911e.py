# -*- coding: utf-8 -*-
"""批次一 T05（2026-09-11）：统一缓存版本号 bump → ?v=20260911e

安全策略（照 tools/bump_versions_safe.py 的教训，避免"正则吞注释"事故重演）：
  1. 先按「行」过滤：只处理 lstrip 后以 <script / <link 开头，且该行含真实
     src="assets/…" / href="assets/…" 的行；
  2. 再对该行做正则替换：把已有的 ?v=xxx 统一为 ?v=20260911e；
     原缺失 ?v= 的真实资源（如 <script src="assets/chat-local.js">）补上 ?v=20260911e；
  3. 绝不触碰 HTML 注释、内联脚本正文、文本节点。

改完自动校验每个改动文件：<!-- / --> 配对、<div / </div 配对、<script / </script 配对。
用法：python tools/bump_versions_0911e.py [--check]
"""
from __future__ import annotations

import glob
import io
import os
import re
import sys

V = "20260911e"

# 历史副本 / 非 live 页（不参与统一版本号，避免污染存档页）：
#   settings*.html / profile*.html 为标准命名历史副本；设置_旧版 / blog_wechat 为旧存档。
EXCLUDE_PREFIXES = ("settings", "profile")
EXCLUDE_FILES = {"设置_旧版.html", "blog_wechat.html"}

# 真实资源引用行：<script ... src="assets/xxx.js[?v=..]" ...>  /  <link ... href="assets/xxx.css[?v=..]" ...>
RE_SC = re.compile(r'(<script\b[^>]*\bsrc="assets/[^"]*\.js)(\?v=[0-9a-zA-Z]+)?(")')
RE_LK = re.compile(r'(<link\b[^>]*\bhref="assets/[^"]*\.css)(\?v=[0-9a-zA-Z]+)?(")')


def bump_line(line: str) -> str:
    stripped = line.lstrip()
    if stripped.startswith("<script") and 'src="assets/' in line:
        return RE_SC.sub(lambda m: m.group(1) + "?v=" + V + m.group(3), line)
    if stripped.startswith("<link") and 'href="assets/' in line:
        return RE_LK.sub(lambda m: m.group(1) + "?v=" + V + m.group(3), line)
    return line


def balance(text: str, tag: str) -> tuple[int, int]:
    open_re = re.compile(r"<" + tag + r"(\s|>)", re.I)
    close_re = re.compile(r"</" + tag + r">", re.I)
    return len(open_re.findall(text)), len(close_re.findall(text))


def main() -> None:
    check_only = "--check" in sys.argv
    changed_files = 0
    total_lines_changed = 0
    problems: list[str] = []

    for f in sorted(glob.glob("*.html")):
        if f in EXCLUDE_FILES or f.startswith(EXCLUDE_PREFIXES):
            continue
        raw = open(f, "rb").read()
        has_bom = raw.startswith(b"\xef\xbb\xbf")
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            problems.append(f"{f}: 非 UTF-8，跳过")
            continue

        lines = text.split("\n")
        new_lines = [bump_line(ln) for ln in lines]
        if new_lines == lines:
            continue

        new_text = "\n".join(new_lines)

        # 校验：改动前后注释 / 标签配对必须一致
        for tag in ("div", "script"):
            if balance(text, tag) != balance(new_text, tag):
                problems.append(f"{f}: <{tag}> 配对在替换后发生变化，已跳过")
                break
        else:
            if text.count("<!--") != new_text.count("<!--") or text.count("-->") != new_text.count("-->"):
                problems.append(f"{f}: 注释配对在替换后发生变化，已跳过")
                continue

            n = sum(1 for a, b in zip(lines, new_lines) if a != b)
            total_lines_changed += n
            changed_files += 1
            print(f"  ~ {f}  ({n} 行)")
            if not check_only:
                out = ("\ufeff" if has_bom else "") + new_text
                open(f, "wb").write(out.encode("utf-8"))

    print(f"\n改动文件 {changed_files} 个，改动行 {total_lines_changed} 行（版本号 → {V}）")
    if problems:
        print("⚠️ 以下文件存在问题，未处理：")
        for p in problems:
            print("   " + p)
        sys.exit(2)


if __name__ == "__main__":
    main()
