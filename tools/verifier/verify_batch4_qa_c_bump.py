# -*- coding: utf-8 -*-
"""批次四 QA 独立验证 · C. bump 脚本「自动发现」证伪脚本

独立于工程师自跑脚本，主动构造边界用例证伪：
  C1  --check 结果应为 0 改动、exit 0（真实全站预演）
  C2  证伪「自动发现」：
        · 引用 assets/app.js 的页面          → 应被发现
        · 只在 HTML 注释里引用 app.js 的页面  → 不应被发现
        · 不引用 app.js 的页面               → 不应被发现
      用脚本内部 discover_pages / referenced_assets 直接验证，全程只在
      临时目录里造页面，不改动任何真实 HTML，不 --write。
  C3  硬门禁 --check「有任何改动即 exit 3」：在临时迷你仓库副本上验证
      （复制脚本 + 造一个引用 app.js 但无版本号的页面）。

用法：python tools/verifier/verify_batch4_qa_c_bump.py
退出码：0=全部通过；1=有失败。结果写入同目录 _qa_c_out.txt
"""
from __future__ import annotations

import io
import os
import shutil
import subprocess
import sys
import tempfile
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BUMP = os.path.join(ROOT, "tools", "bump_versions_0913c.py")

results: list[tuple[str, bool, str]] = []
lines: list[str] = []


def assert_(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, bool(cond), detail))


# 动态加载 bump 脚本模块（不执行 main）
spec = importlib.util.spec_from_file_location("bump0913c", BUMP)
bump = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
spec.loader.exec_module(bump)  # type: ignore[union-attr]


# ---------------------------------------------------------------------------
# C1. 真实全站预演 --check
# ---------------------------------------------------------------------------
def c1() -> None:
    p = subprocess.run([sys.executable, BUMP, "--check"],
                       cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    out = (p.stdout or "") + (p.stderr or "")
    assert_("C1-a bump --check 退出码 = 0", p.returncode == 0, "exit=" + str(p.returncode))
    assert_("C1-b --check 报告 0 改动", "改动文件 0 个，改动行 0 行" in out,
            [s for s in out.splitlines() if "改动" in s][-1:] and " | ".join(
                [s for s in out.splitlines() if "改动文件" in s]))
    assert_("C1-c --check 自动发现 27 页", "自动发现页面数: 27" in out,
            " | ".join([s for s in out.splitlines() if "自动发现" in s]))

    # 独立复核：真实 27 页 = 根目录里「非注释行」引用了 app.js 的 HTML 集合
    manual = []
    for fn in sorted(os.listdir(ROOT)):
        if not fn.lower().endswith(".html"):
            continue
        fp = os.path.join(ROOT, fn)
        if not os.path.isfile(fp):
            continue
        html = open(fp, "rb").read().decode("utf-8-sig")
        refs = bump.referenced_assets(html)
        if any(os.path.basename(r) == "app.js" for r in refs):
            manual.append(fn)
    assert_("C1-d 独立复核：真实引用 app.js 的页面数 = 27（与脚本一致）",
            len(manual) == 27, "实际 " + str(len(manual)))


# ---------------------------------------------------------------------------
# C2. 证伪自动发现（临时目录，绝不碰真实 HTML）
# ---------------------------------------------------------------------------
def c2() -> None:
    tmp = tempfile.mkdtemp(prefix="qa_c2_")
    try:
        cases = {
            "real_ref.html": '<html><body>\n<script src="assets/app.js?v=20260913b"></script>\n</body></html>',
            "real_ref_nov.html": '<html><body>\n<script src="assets/app.js"></script>\n</body></html>',
            "comment_full.html": '<html><body>\n<!-- <script src="assets/app.js"></script> -->\n</body></html>',
            "comment_inline.html": '<html><body>\n<div>x</div><!-- 旧版引用 <script src="assets/app.js"></script> -->\n</body></html>',
            "comment_block.html": '<html><body>\n<!--\n<script src="assets/app.js"></script>\n<script src="assets/foo.js"></script>\n-->\n</body></html>',
            "no_ref.html": '<html><body>\n<script src="assets/other.js"></script>\n</body></html>',
        }
        for fn, txt in cases.items():
            io.open(os.path.join(tmp, fn), "w", encoding="utf-8").write(txt)

        found = set(bump.discover_pages(tmp, ["assets/app.js"], []))
        assert_("C2-a 引用 assets/app.js 的页面被发现（real_ref.html）", "real_ref.html" in found, str(sorted(found)))
        assert_("C2-b 无版本号但引用 app.js 的页面被发现（real_ref_nov.html）", "real_ref_nov.html" in found, str(sorted(found)))
        assert_("C2-c 整行注释引用 app.js 的页面不被发现（comment_full.html）", "comment_full.html" not in found, str(sorted(found)))
        assert_("C2-d 行内注释引用 app.js 的页面不被发现（comment_inline.html）", "comment_inline.html" not in found, str(sorted(found)))
        assert_("C2-e 跨行注释块内引用 app.js 的页面不被发现（comment_block.html）", "comment_block.html" not in found, str(sorted(found)))
        assert_("C2-f 不引用 app.js 的页面不被发现（no_ref.html）", "no_ref.html" not in found, str(sorted(found)))
        assert_("C2-g 自动发现结果集合恰为 {real_ref, real_ref_nov}", found == {"real_ref.html", "real_ref_nov.html"}, str(sorted(found)))

        # referenced_assets 语义复核（注释里的 app.js 不算引用）
        assert_("C2-h referenced_assets 对注释行返回空集",
                bump.referenced_assets(cases["comment_full.html"]) == set(),
                str(bump.referenced_assets(cases["comment_full.html"])))
        assert_("C2-i referenced_assets 对真实引用返回 {assets/app.js}",
                "assets/app.js" in bump.referenced_assets(cases["real_ref.html"]),
                str(bump.referenced_assets(cases["real_ref.html"])))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------------------
# C3. 硬门禁：--check 有任何改动即 exit 3（临时迷你仓库副本）
# ---------------------------------------------------------------------------
def c3() -> None:
    tmp = tempfile.mkdtemp(prefix="qa_c3_")
    try:
        os.makedirs(os.path.join(tmp, "tools"), exist_ok=True)
        os.makedirs(os.path.join(tmp, "assets"), exist_ok=True)
        shutil.copy2(BUMP, os.path.join(tmp, "tools", "bump_versions_0913c.py"))
        io.open(os.path.join(tmp, "assets", "app.js"), "w", encoding="utf-8").write("/* mini */\n")
        # 页面引用 app.js 但无版本号 → --check 应发现 1 处改动 → exit 3
        io.open(os.path.join(tmp, "index.html"), "w", encoding="utf-8").write(
            '<html><body>\n<script src="assets/app.js"></script>\n</body></html>')
        p = subprocess.run(
            [sys.executable, os.path.join(tmp, "tools", "bump_versions_0913c.py"), "--check"],
            cwd=tmp, capture_output=True, text=True, encoding="utf-8")
        out = (p.stdout or "") + (p.stderr or "")
        assert_("C3-a 有改动时 --check 退出码 = 3（硬门禁）", p.returncode == 3, "exit=" + str(p.returncode))
        assert_("C3-b 有改动时报告「改动行 > 0」", "改动行 1 行" in out or "改动行" in out and "改动文件 1 个" in out,
                " | ".join([s for s in out.splitlines() if "改动文件" in s or "改动行" in s]))
        assert_("C3-c 硬门禁提示出现", "CHECK 未通过" in out, out[-160:].replace("\n", " "))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> None:
    c1()
    c2()
    c3()
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [r for r in results if not r[1]]
    lines.append("")
    lines.append("============================================================")
    lines.append("批次四 QA 独立验证 · C. bump 脚本自动发现")
    lines.append("项目根：" + ROOT)
    lines.append("============================================================")
    for i, (name, ok, detail) in enumerate(results, 1):
        lines.append(("  [PASS] " if ok else "  [FAIL] ") + str(i).zfill(2) + ". " + name +
                     ("" if ok else "   →   " + detail))
    lines.append("============================================================")
    lines.append("合计 " + str(len(results)) + " 项：通过 " + str(passed) + "，失败 " + str(len(failed)))
    lines.append("结论：" + ("PASS" if not failed else "FAIL"))
    lines.append("============================================================")
    txt = "\n".join(lines)
    io.open(os.path.join(HERE, "_qa_c_out.txt"), "w", encoding="utf-8").write(txt + "\n")
    sys.stdout.buffer.write((txt + "\n").encode("utf-8", "replace"))
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
