# -*- coding: utf-8 -*-
"""⚠️ 已废弃（2026-09-11，T09）——请改用 tools/bump_versions_0911e.py

安全版缓存版本号替换（历史脚本，保留备查）：
只处理真正的 <script src=...> / <link href=...> 行（先按行过滤、再正则替换），
绝不触碰 HTML 注释或其他文本，避免 2026-09-11 上午"正则吞注释"事故重演。

【为什么废弃 / 待爆的雷】旧版把版本号写死为 20260911c（API_V/CSS_V/APP_V），
而全站现已统一到 20260911g。**不带参数直接运行会把全站反向降级回 c**，
让用户吃到被顶掉的旧缓存资源（含本批加固过的 common.css / app.js）。

【现在的行为】必须显式在命令行传入版本号，例如：
    python tools/bump_versions_safe.py 20260911g
不传版本号则拒绝执行并指向新脚本，杜绝"无参运行即反向降级"。

建议：新流程一律用 tools/bump_versions_0911e.py（带 --check 预演、排除历史副本、
改后做注释/标签配对校验），本脚本仅作历史留档。
"""
import glob
import io
import re
import sys

# 版本号必须由命令行显式传入；绝不写死，杜绝"无参运行即反向降级"。
V = None

RE_API = re.compile(r'(src="assets/api\.js\?v=)[0-9A-Za-z._]+(")')
RE_CSS = re.compile(r'(href="assets/polish\.css\?v=)[0-9A-Za-z._]+(")')
RE_APP = re.compile(r'(src="assets/app\.js\?v=)[0-9A-Za-z._]+(")')


def _cli_version():
    """命令行首个非 - 开头的 [0-9A-Za-z._]+ 参数作为版本号；未提供返回 None。"""
    for a in sys.argv[1:]:
        if not a.startswith("-") and re.fullmatch(r"[0-9A-Za-z._]+", a):
            return a
    return None


def bump_line(line: str) -> str:
    """仅对本行是真实资源引用时替换版本号。"""
    stripped = line.lstrip()
    if stripped.startswith("<script") and "assets/api.js" in line:
        return RE_API.sub(lambda m: m.group(1) + V + m.group(2), line)
    if stripped.startswith("<script") and "assets/app.js" in line:
        return RE_APP.sub(lambda m: m.group(1) + V + m.group(2), line)
    if stripped.startswith("<link") and "assets/polish.css" in line:
        return RE_CSS.sub(lambda m: m.group(1) + V + m.group(2), line)
    return line


def main() -> None:
    global V
    V = _cli_version()
    if not V:
        print("⚠️ 已废弃的脚本：为避免把全站版本号反向降级，必须显式传入版本号。")
        print("   例：python tools/bump_versions_safe.py 20260911g")
        print("   推荐改用：python tools/bump_versions_0911e.py [--check] <版本号>")
        sys.exit(2)

    changed_files = 0
    for f in glob.glob("*.html"):
        text = io.open(f, encoding="utf-8-sig").read()
        lines = text.split("\n")
        new_lines = [bump_line(ln) for ln in lines]
        new_text = "\n".join(new_lines)
        n_chg = sum(1 for a, b in zip(lines, new_lines) if a != b)
        if n_chg:
            io.open(f, "w", encoding="utf-8", newline="").write(new_text)
            changed_files += 1
            print(f"[bump] {f}: {n_chg} 行")
    print(f"共更新 {changed_files} 个文件 -> api.js/app.js/polish.css ?v={V}")

    # ---- 改后校验 ----
    problems = []
    for f in glob.glob("*.html"):
        t = io.open(f, encoding="utf-8-sig").read()
        if t.count("<!--") != t.count("-->"):
            problems.append(f"{f}: 注释不平衡")
        nd = len(re.findall(r"<div[\s>]", t))
        ed = t.count("</div>")
        if nd != ed:
            problems.append(f"{f}: div {nd}/{ed} 不平衡")
        # 损坏特征：版本号后紧跟引号+属性（真实标签应为 ?v=xxx">）
        for m in re.finditer(r'\.js\?v=[0-9A-Za-z._]+"[^>\s]', t):
            problems.append(f"{f}: 可疑片段 {m.group(0)[:40]!r}")
    print("校验:", "全部通过 ✅" if not problems else "\n".join(problems))


if __name__ == "__main__":
    main()
