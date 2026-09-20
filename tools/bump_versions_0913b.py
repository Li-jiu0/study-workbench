# -*- coding: utf-8 -*-
"""批次三 T（2026-09-13）：把「本批被改动的页面」的缓存版本号统一 bump 到 20260913b

⚠️ 安全策略（2026-09-11「正则吞注释」事故后立项，本项目铁律）：
  1. **先按行过滤**：只有 lstrip 后以 `<script` 开头且含**真实相对路径** `.js` 的
     `src=` 引用的行，或 lstrip 后以 `<link` 开头且含**真实相对路径** `.css` 的
     `href=` 引用的行，才会进入替换；
     （2026-09-13 修订：不再要求 `assets/` 前缀，否则 `data/mock-papers.js`
      这类资源会被漏掉，产生「混合版本页」）
  2. **绝不**使用跨行通配正则（事故根因是 `assets/app\\.js(\\?v=[^"']*)?` 里的
     `[^"']*` 能跨行吞掉 HTML 注释里的内容，连 `-->` 与后续标签一起吃掉，
     导致「个人中心整页空白」）；
  3. 行内正则只匹配 `<script … src="xxx.js` / `<link … href="xxx.css`
     这一小段，绝不匹配到引号之外的任何字符；
  4. HTML 注释里的资源引用一律**保持原样**（不带版本号）：既跳过以 `<!--`
     开头的行，也用注释状态机跳过跨行注释块的正文；
  5. 改后逐文件校验：注释配对 / div 配对 / script 配对 / link 计数 /
     版本号损坏签名，任一不通过即拒绝落盘。

范围：本批改动 assets/app.js、assets/data/exam-bank.json、assets/voiceplayer.js，
因此 PAGES = 全部引用 app.js 的正式页（其中 四级备考 / 学途 同时引用 voiceplayer.js），
共 27 个；其余 5 个页面（登录页等，未加载本批改动的资源）保持 20260913a 不动。

用法：
    python tools/bump_versions_0913b.py                 # 预演（--check，不落盘）
    python tools/bump_versions_0913b.py --write         # 真正写入
    python tools/bump_versions_0913b.py --write 更多页面.html   # 追加页面
"""
from __future__ import annotations

import io
import os
import re
import sys

VERSION = "20260913b"

# 本批被改动的正式页（草稿页 settings*.html / profile*.html / 设置_旧版.html 一律不参与）
PAGES = [
    "PPT案例拆解.html",
    "PPT版式库.html",
    "PPT训练.html",
    "blog_wechat.html",
    "mock_exam.html",
    "mock_exam_result.html",
    "mock_exam_run.html",
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
    "学途.html",
    "工具.html",
    "更多.html",
    "私聊.html",
    "行测刷题.html",
    "设置.html",
    "错题本.html",
    "面试题库.html",
    "高情商表达.html",
]

# ---------------------------------------------------------------------------
# 真·资源引用正则（2026-09-13 修订：去掉硬编码的 `assets/` 前缀）
#
# 结构：<script ... src="<任意相对路径>.js[?查询串]"  —— 只到引号为止，绝不越界
#   · 路径段被引号夹住，天然不跨行、不吞注释；
#   · _NOT_REMOTE 负向预查排除外链（http(s)://、协议相对 //cdn…）、data URI 与
#     锚点，保证只作用于本站相对路径资源；
#   · 支持单引号 / 双引号，并整体替换既有查询串（不会出现 ?a=1?v=x 畸形）。
# ---------------------------------------------------------------------------
_NOT_REMOTE = r'(?!(?:https?:)?//|data:|#)'

# 分组口径（与 bump_line 的替换逻辑强绑定，改动时务必同步）：
#   1 = `<script … src="` + 资源路径 + `.js`   2 = 既有查询串   3 = 闭合引号
RE_SCRIPT = re.compile(r'''(<script\b[^>]*?\bsrc\s*=\s*["']'''
                       + _NOT_REMOTE
                       + r'''[^"']*?\.js)(\?[^"']*)?(["'])''')

RE_LINK = re.compile(r'''(<link\b[^>]*?\bhref\s*=\s*["']'''
                     + _NOT_REMOTE
                     + r'''[^"']*?\.css)(\?[^"']*)?(["'])''')

# 损坏特征：真实标签应为 ?v=xxx">，若引号后紧跟非 `>` 非空白字符说明正则吃多了
RE_CORRUPT = re.compile(r'\.(?:js|css)\?v=[0-9A-Za-z._]+["\'][^>\s]')
RE_BROKEN_CLASS = re.compile(r'class="nav-item active data-page=')


def is_real_asset_line(line: str) -> bool:
    """只有真正的资源引用行才允许进入替换（HTML 注释 / 内联脚本正文一律排除）。

    判定与 RE_SCRIPT / RE_LINK 同源：行首（去空白后）必须是 `<script` / `<link`
    标签，且该行内确实存在一条「相对路径 .js / .css」的 src / href 引用。
    不再要求 `assets/` 前缀，因此 `data/mock-papers.js` 等资源同样生效。
    """
    s = line.lstrip()
    low = s.lower()
    if low.startswith("<!--"):  # 注释行（含注释里的资源引用）保持原样
        return False
    if low.startswith("<script") and RE_SCRIPT.search(line):
        return True
    if low.startswith("<link") and RE_LINK.search(line):
        return True
    return False


def bump_line(line: str, version: str, in_comment: bool = False) -> str:
    """给一行里的资源引用打上版本号；非资源行 / 注释块内原样返回。"""
    if in_comment or not is_real_asset_line(line):
        return line
    if line.lstrip().lower().startswith("<script"):
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
    # 用「原始行」推进 HTML 注释状态机，跨行注释块内的资源引用一律保持原样
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
    io.open(os.path.join("tools", "qa", "_bump_0913b_" + ("out" if write else "check") + ".txt"),
            "w", encoding="utf-8").write(txt)
    print(txt)
    sys.exit(2 if all_problems else 0)


if __name__ == "__main__":
    main()
