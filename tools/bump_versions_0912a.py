# -*- coding: utf-8 -*-
"""批次五 T05（2026-09-12）：把「本批被改动的页面」的缓存版本号统一 bump 到 20260912a

⚠️ 安全策略（2026-09-11「正则吞注释」事故后立项，本项目铁律）：
  1. **先按行过滤**：只有 lstrip 后以 `<script` 开头且含真实 `src="assets/…js"` 的行，
     或 lstrip 后以 `<link` 开头且含真实 `href="assets/…css"` 的行，才会进入替换；
  2. **绝不**使用跨行通配正则（事故根因是 `assets/app\\.js(\\?v=[^"']*)?` 里的
     `[^"']*` 能跨行吞掉 HTML 注释里的内容，连 `-->` 与后续标签一起吃掉，
     导致「个人中心整页空白」）；
  3. 行内正则只匹配 `<script … src="assets/xxx.js` / `<link … href="assets/xxx.css`
     这一小段，绝不匹配到引号之外的任何字符；
  4. HTML 注释里的资源引用一律**保持原样**（不带版本号）；
  5. 改后逐文件校验：注释配对 / div 配对 / script 配对 / link 计数 /
     版本号损坏签名，任一不通过即拒绝落盘。

范围（PRD §8.1）：旧页继续 20260911i；本批被改页 bump 到 20260912a。
本批被改页 = T01(学习工作台/blog_wechat/个人中心/工具/更多)
          + T02(设置/个人中心 + subpage-router.js)
          + T03(私聊 + chat-local.js)
          + T04(登录 + 全站侧栏换图标的 23 页 + icon-map.js)
          = 下列 PAGES 清单（24 个）。

用法：
    python tools/bump_versions_0912a.py                 # 预演（--check，不落盘）
    python tools/bump_versions_0912a.py --write         # 真正写入
    python tools/bump_versions_0912a.py --write 更多页面.html   # 追加页面
"""
from __future__ import annotations

import io
import os
import re
import sys

VERSION = "20260912a"

# 本批被改动的正式页（草稿页 settings*.html / profile*.html / 设置_旧版.html 一律不参与）
PAGES = [
    "PPT案例拆解.html",
    "PPT版式库.html",
    "PPT训练.html",
    "blog_wechat.html",
    "万能金句库.html",
    "个人中心.html",
    "动态.html",
    "商务礼仪.html",
    "商务礼仪面试.html",
    "四级备考.html",
    "四级词汇.html",
    "场景话术库.html",
    "央国企笔试.html",
    "学习博客.html",
    "学习工作台.html",
    "工具.html",
    "更多.html",
    "登录.html",
    "私聊.html",
    "行测刷题.html",
    "设置.html",
    "错题本.html",
    "面试题库.html",
    "高情商表达.html",
]

# 真·资源引用正则：只匹配 "<script ... src="assets/xxx.js" 这一小段（不含尾部引号外的任何字符）
RE_SCRIPT = re.compile(r'(<script\b[^>]*?\bsrc\s*=\s*"assets/[^"]*?\.js)(\?v=[0-9A-Za-z._]+)?(")')
RE_LINK = re.compile(r'(<link\b[^>]*?\bhref\s*=\s*"assets/[^"]*?\.css)(\?v=[0-9A-Za-z._]+)?(")')

# 损坏特征：真实标签应为 ?v=xxx">，若引号后紧跟非 `>` 非空白字符说明正则吃多了
RE_CORRUPT = re.compile(r'\.js\?v=[0-9A-Za-z._]+"[^>\s]')
RE_BROKEN_CLASS = re.compile(r'class="nav-item active data-page=')


def is_real_asset_line(line: str) -> bool:
    """只有真正的资源引用行才允许进入替换（HTML 注释 / 内联脚本正文一律排除）。"""
    s = line.lstrip()
    if s.startswith("<script") and 'src="assets/' in line:
        return True
    if s.startswith("<link") and 'href="assets/' in line:
        return True
    return False


def bump_line(line: str, version: str) -> str:
    if not is_real_asset_line(line):
        return line
    if line.lstrip().startswith("<script"):
        return RE_SCRIPT.sub(lambda m: m.group(1) + "?v=" + version + m.group(3), line)
    return RE_LINK.sub(lambda m: m.group(1) + "?v=" + version + m.group(3), line)


def balance(text: str, tag: str) -> tuple[int, int]:
    op = len(re.findall(r"<" + tag + r"(\s|>)", text, re.I))
    cl = len(re.findall(r"</" + tag + r">", text, re.I))
    return op, cl


def process(page: str, version: str, write: bool) -> tuple[int, list[str]]:
    """返回 (改动行数, 问题列表)。任何问题 → 不落盘。"""
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

    problems: list[str] = []
    # 1) 注释配对
    if text.count("<!--") != new_text.count("<!--") or text.count("-->") != new_text.count("-->"):
        problems.append(f"{page}: 注释配对发生变化，拒绝落盘")
    # 2) 标签配对
    for tag in ("div", "script", "nav", "span"):
        if balance(text, tag) != balance(new_text, tag):
            problems.append(f"{page}: <{tag}> 配对发生变化 "
                            f"{balance(text, tag)} → {balance(new_text, tag)}，拒绝落盘")
    # 3) link 计数
    if len(re.findall(r"<link(\s|>)", text, re.I)) != len(re.findall(r"<link(\s|>)", new_text, re.I)):
        problems.append(f"{page}: <link> 计数发生变化，拒绝落盘")
    # 4) 损坏签名
    if RE_CORRUPT.search(new_text):
        problems.append(f"{page}: 检测到版本号损坏签名 "
                        f"{RE_CORRUPT.search(new_text).group(0)!r}，拒绝落盘")
    if RE_BROKEN_CLASS.search(new_text):
        problems.append(f"{page}: 检测到畸形属性 class=\"nav-item active data-page=，拒绝落盘")

    if problems:
        return n_changed, problems

    if write:
        payload = ("\ufeff" if has_bom else "") + new_text
        open(page, "wb").write(payload.encode("utf-8"))
    return n_changed, []


def main() -> None:
    args = [a for a in sys.argv[1:]]
    write = "--write" in args
    version = VERSION
    for a in args:
        if a.startswith("-"):
            continue
        if re.fullmatch(r"[0-9A-Za-z._]+", a):
            version = a
    extra = [a for a in args
             if not a.startswith("-") and a.endswith(".html")]
    pages = list(dict.fromkeys(PAGES + extra))

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    mode = "WRITE（已落盘）" if write else "CHECK（预演，未落盘）"
    out: list[str] = [f"模式: {mode}", f"目标版本号: {version}", f"目标页面数: {len(pages)}", ""]
    total_files = 0
    total_lines = 0
    all_problems: list[str] = []

    for p in sorted(pages):
        n, probs = process(p, version, write)
        if probs:
            all_problems.extend(probs)
            out.append(f"  ! {p}: 跳过（{len(probs)} 个问题）")
            continue
        if n:
            total_files += 1
            total_lines += n
            out.append(f"  ~ {p}  ({n} 行)")
        else:
            out.append(f"  = {p}  (已是 {version}，无需改动)")

    out.append("")
    out.append(f"改动文件 {total_files} 个，改动行 {total_lines} 行")
    out.append("问题: " + ("无 ✅" if not all_problems else ""))
    for pr in all_problems:
        out.append("  - " + pr)

    txt = "\n".join(out)
    os.makedirs(os.path.join("tools", "qa"), exist_ok=True)
    io.open(os.path.join("tools", "qa", "_bump_" + ("out" if write else "check") + ".txt"),
            "w", encoding="utf-8").write(txt)
    print(txt)
    sys.exit(2 if all_problems else 0)


if __name__ == "__main__":
    main()
