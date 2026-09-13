# -*- coding: utf-8 -*-
"""20260913n 安全换版本号（前端静态资源缓存戳）。

只处理真正的 <script src=...> / <link href=...> 行，将其中的 20260913m -> 20260913n；
绝不触碰 HTML 注释或其他文本。不含 20260913m 的冻结页（AI模拟面试/PPT素材库/四级经验分享/
好友申请/登录 等）天然不动。改后做 注释/div/标签配对 校验，损坏特征为 0 才放行。

用法（在 ROOT=D:\下载的文件\学习工作台 下执行）：
  python tools/bump_versions_0913n.py            # 默认 OLD=20260913m NEW=20260913n
  python tools/bump_versions_0913n.py 20260913x # 指定新戳（可选）
"""
import glob
import io
import re
import sys

OLD = "20260913m"
NEW = "20260913n"


def _cli_version():
    for a in sys.argv[1:]:
        if re.fullmatch(r"[0-9A-Za-z._]+", a):
            return a
    return None


def bump_line(line: str) -> str:
    s = line.lstrip()
    if (s.startswith("<script") or s.startswith("<link")) and OLD in line:
        return line.replace(OLD, NEW)
    return line


def main() -> None:
    global NEW
    v = _cli_version()
    if v:
        NEW = v

    changed_files = 0
    for f in sorted(glob.glob("*.html")):
        text = io.open(f, encoding="utf-8-sig").read()
        lines = text.split("\n")
        new_lines = [bump_line(ln) for ln in lines]
        new_text = "\n".join(new_lines)
        n_chg = sum(1 for a, b in zip(lines, new_lines) if a != b)
        if n_chg:
            io.open(f, "w", encoding="utf-8", newline="").write(new_text)
            changed_files += 1
            print("[bump] %s: %d 行 -> ?v=%s" % (f, n_chg, NEW))
    print("共更新 %d 个文件（OLD=%s NEW=%s）" % (changed_files, OLD, NEW))

    # ---- 改后校验 ----
    problems = []
    for f in sorted(glob.glob("*.html")):
        t = io.open(f, encoding="utf-8-sig").read()
        if t.count("<!--") != t.count("-->"):
            problems.append("%s: 注释不平衡 (%d/%d)" % (f, t.count("<!--"), t.count("-->")))
        nd = len(re.findall(r"<div[\s>]", t))
        ed = t.count("</div>")
        if nd != ed:
            problems.append("%s: div %d/%d 不平衡" % (f, nd, ed))
        for m in re.finditer(r'\.js\?v=[0-9A-Za-z._]+"[^>\s]', t):
            problems.append("%s: 可疑片段 %r" % (f, m.group(0)[:40]))
    print("校验:", "全部通过 ✅" if not problems else ("\n".join(problems)))
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
