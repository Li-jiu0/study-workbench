# -*- coding: utf-8 -*-
"""批次四 T03（2026-09-13）：bump 脚本「页面自动发现」能力升级（版本号不变，仍 20260913b）

与 bump_versions_0913b.py 的差异（本批唯一目标）：
    · **PAGES 不再硬编码**。旧脚本写死 27 个页面，新增页面会漏 bump；
      本脚本改为「扫全站自动发现」——遍历仓库根目录下所有 `*.html`，凡
      引用了「本批改动资源」的页面自动入选。
    · 资源清单（CHANGED_RESOURCES）是本脚本唯一的输入：它是「本批改动了哪些
      带版本号的静态资源」这一事实声明，不是页面清单。新增/删除页面时，
      页面集合由引用关系自动推导，无需改脚本。
    · 版本号仍为 20260913b（本批不 bump）。因此 `--check` 必须报「0 改动」，
      这是拦住「正则写错、把全站资源 URL 抹掉」的唯一信号（硬门禁）。

安全策略（沿用 0913b，2026-09-11「正则吞注释」事故后立项，本项目铁律）：
  1. **先按行过滤**：仅 lstrip 后以 `<script` 开头且含真实相对路径 `.js` 的
     `src=` 行、或以 `<link` 开头且含真实相对路径 `.css` 的 `href=` 行才进入替换；
  2. **绝不**跨行通配；行内正则只匹配到闭合引号为止，绝不吞注释/后续标签；
  3. HTML 注释里的资源引用一律保持原样（注释行 + 跨行注释状态机双重跳过）；
  4. 改后逐文件校验：注释配对 / div·script·nav·span 配对 / link 计数 /
     版本号损坏签名，任一不通过即拒绝落盘。

用法：
    python tools/bump_versions_0913c.py                 # 预演（--check，不落盘）
    python tools/bump_versions_0913c.py --write         # 真正写入
    python tools/bump_versions_0913c.py --resource data/mock-papers.js   # 追加本批改动资源
    python tools/bump_versions_0913c.py --write 更多页面.html            # 追加页面
"""
from __future__ import annotations

import io
import os
import re
import sys

VERSION = "20260913b"  # 本批不 bump；保留常量以便将来升级版本号

# 本批改动的「带版本号的静态资源」——唯一输入，用于自动发现引用它们的页面。
# 批次四代码线只改了 assets/app.js；如将来还改了其它资源，追加到此处即可。
CHANGED_RESOURCES = [
    "assets/app.js",
]

# ---------------------------------------------------------------------------
# 真·资源引用正则（与 0913b 同源：去掉硬编码 `assets/` 前缀，天然不跨行）
# ---------------------------------------------------------------------------
_NOT_REMOTE = r'(?!(?:https?:)?//|data:|#)'

RE_SCRIPT = re.compile(r'''(<script\b[^>]*?\bsrc\s*=\s*["']'''
                       + _NOT_REMOTE
                       + r'''[^"']*?\.js)(\?[^"']*)?(["'])''')

RE_LINK = re.compile(r'''(<link\b[^>]*?\bhref\s*=\s*["']'''
                     + _NOT_REMOTE
                     + r'''[^"']*?\.css)(\?[^"']*)?(["'])''')

# 仅用于「自动发现」时提取被引用的相对路径（去查询串），不参与替换
RE_SCRIPT_REF = re.compile(r'''<script\b[^>]*?\bsrc\s*=\s*["']'''
                           + _NOT_REMOTE
                           + r'''([^"'?]+\.js)(?:\?[^"']*)?["']''', re.I)
RE_LINK_REF = re.compile(r'''<link\b[^>]*?\bhref\s*=\s*["']'''
                         + _NOT_REMOTE
                         + r'''([^"'?]+\.css)(?:\?[^"']*)?["']''', re.I)

# 损坏特征：真实标签应为 ?v=xxx">，若引号后紧跟非 `>` 非空白字符说明正则吃多了
RE_CORRUPT = re.compile(r'\.(?:js|css)\?v=[0-9A-Za-z._]+["\'][^>\s]')
RE_BROKEN_CLASS = re.compile(r'class="nav-item active data-page=')


def is_real_asset_line(line: str) -> bool:
    """只有真正的资源引用行才允许进入替换（HTML 注释 / 内联脚本正文一律排除）。

    判定与 RE_SCRIPT / RE_LINK 同源：行首（去空白后）必须是 `<script` / `<link`
    标签，且该行内确实存在一条「相对路径 .js / .css」的 src / href 引用。
    不要求 `assets/` 前缀，因此 `data/mock-papers.js` 等资源同样生效。
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


def referenced_assets(html: str) -> set[str]:
    """返回该 HTML 里「真实资源行」引用的相对路径集合（.js/.css，已去查询串）。

    与 bump_line 同源的注释处理：跳过注释行与跨行注释块正文，避免把「注释里
    提到的 app.js」误判为「页面引用了 app.js」。
    """
    refs: set[str] = set()
    in_comment = False
    for ln in html.split("\n"):
        s = ln.lstrip()
        low = s.lower()
        if not in_comment and not low.startswith("<!--"):
            if low.startswith("<script"):
                for m in RE_SCRIPT_REF.finditer(ln):
                    refs.add(m.group(1))
            elif low.startswith("<link"):
                for m in RE_LINK_REF.finditer(ln):
                    refs.add(m.group(1))
        # 推进注释状态机（用原始行，跨行注释块内的引用不算）
        if not in_comment and ln.count("<!--") > ln.count("-->"):
            in_comment = True
        elif in_comment and "-->" in ln and ln.count("-->") >= ln.count("<!--"):
            in_comment = False
    return refs


def discover_pages(root: str, resources: list[str], extra_pages: list[str]) -> list[str]:
    """扫全站自动发现目标页面：根目录下所有 *.html 中，引用了任一改动资源的页面。

    资源匹配支持「同目录相对路径」与「显式相对根路径」两种写法：
        · 页面里写 `assets/app.js`            → 直接命中
        · 页面里写 `app.js`（与 assets 同目录） → 按 basename 兜底命中（容错）
    `extra_pages` 允许命令行追加（去重保留顺序）。
    """
    res_norm = {r.replace("\\", "/").lstrip("./") for r in resources}
    res_base = {os.path.basename(r) for r in res_norm}
    found: list[str] = []
    for fn in sorted(os.listdir(root)):
        if not fn.lower().endswith(".html"):
            continue
        fp = os.path.join(root, fn)
        if not os.path.isfile(fp):
            continue
        try:
            html = open(fp, "rb").read().decode("utf-8-sig")
        except Exception:
            continue
        refs = referenced_assets(html)
        if refs & res_norm:
            found.append(fn)
            continue
        # basename 兜底：仅当页面里的引用 basename 命中改动资源 basename 时
        if {os.path.basename(r) for r in refs} & res_base:
            found.append(fn)
    # 合并命令行追加页面（去重、保序）
    for p in extra_pages:
        if p not in found:
            found.append(p)
    return found


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

    # --resource <路径> 追加本批改动资源
    resources = list(CHANGED_RESOURCES)
    for i, a in enumerate(args):
        if a == "--resource" and i + 1 < len(args):
            resources.append(args[i + 1])
    extra_resources = [a for a in args
                       if "/" in a and not a.startswith("-") and not a.endswith(".html")]
    resources.extend(extra_resources)

    extra_pages = [a for a in args
                   if not a.startswith("-") and a.endswith(".html")]

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    pages = discover_pages(root, resources, extra_pages)

    mode = "WRITE（已落盘）" if write else "CHECK（预演，未落盘）"
    out: list[str] = [
        f"模式: {mode}",
        f"目标版本号: {version}",
        f"本批改动资源（自动发现依据）: {', '.join(sorted(set(resources)))}",
        f"自动发现页面数: {len(pages)}（未被引用的页面不会入选）",
        "",
    ]
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
    io.open(os.path.join("tools", "qa", "_bump_0913c_" + ("out" if write else "check") + ".txt"),
            "w", encoding="utf-8").write(txt)
    print(txt)
    # 硬门禁：--check 必须 0 改动（否则说明正则误伤/版本不一致，绝不能放行）
    if not write and total_lines > 0:
        print("!! CHECK 未通过：预演出现改动，期望 0 改动")
        sys.exit(3)
    sys.exit(2 if all_problems else 0)


if __name__ == "__main__":
    main()
