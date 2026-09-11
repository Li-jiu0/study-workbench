# -*- coding: utf-8 -*-
"""安全版缓存版本号替换：
只处理真正的 <script src=...> / <link href=...> 行（先按行过滤、再正则替换），
绝不触碰 HTML 注释或其他文本，避免 2026-09-11 上午"正则吞注释"事故重演。
改完自动校验：<!-- / --> 配对、<div / </div 配对、损坏特征签名。
"""
import io
import re
import glob

API_V = "20260911c"
CSS_V = "20260911c"
APP_V = "20260911c"

RE_API = re.compile(r'(src="assets/api\.js\?v=)[0-9a-zA-Z]+(")')
RE_CSS = re.compile(r'(href="assets/polish\.css\?v=)[0-9a-zA-Z]+(")')
RE_APP = re.compile(r'(src="assets/app\.js\?v=)[0-9a-zA-Z]+(")')


def bump_line(line: str) -> str:
    """仅对本行是真实资源引用时替换版本号。"""
    stripped = line.lstrip()
    if stripped.startswith("<script") and "assets/api.js" in line:
        return RE_API.sub(lambda m: m.group(1) + API_V + m.group(2), line)
    if stripped.startswith("<script") and "assets/app.js" in line:
        return RE_APP.sub(lambda m: m.group(1) + APP_V + m.group(2), line)
    if stripped.startswith("<link") and "assets/polish.css" in line:
        return RE_CSS.sub(lambda m: m.group(1) + CSS_V + m.group(2), line)
    return line


def main() -> None:
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
    print(f"共更新 {changed_files} 个文件 -> api.js?v={API_V}, polish.css?v={CSS_V}")

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
        for m in re.finditer(r'\.js\?v=[0-9a-zA-Z]+"[^>\s]', t):
            problems.append(f"{f}: 可疑片段 {m.group(0)[:40]!r}")
    print("校验:", "全部通过 ✅" if not problems else "\n".join(problems))


if __name__ == "__main__":
    main()
