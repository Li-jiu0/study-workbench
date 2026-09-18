# -*- coding: utf-8 -*-
"""R88-M1 补丁 F：ai-settings.html 新增 .xt-set-catfilter 样式（分类筛选提示条）。行尾 LF。"""
import sys

P = r"D:\下载的文件\学习工作台\ai-settings.html"


def read_text(path):
    b = open(path, "rb").read()
    if b.count(b"\r") != 0:
        print("FATAL: 非纯 LF")
        sys.exit(2)
    return b.decode("utf-8")


def write_text(path, text):
    open(path, "wb").write(text.encode("utf-8"))
    b = open(path, "rb").read()
    if b.count(b"\r") != 0:
        print("FATAL: 写回后出现 CR")
        sys.exit(4)
    return len(b)


t = read_text(P)
ANCHOR = "#setSortCat .xt-set-select{margin-top:2px;}\n"
NEW = ANCHOR + (
    "\n"
    "/* R88-M1（R88-C）：模型列表顶部的分类筛选提示条 */\n"
    ".xt-set-catfilter{\n"
    "  display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:0 0 10px;\n"
    "  padding:8px 11px;border:1px solid var(--ai-border);border-radius:10px;\n"
    "  background:rgba(255,140,0,.06);font-size:12px;color:var(--ai-sub);line-height:1.6;\n"
    "}\n"
)
c = t.count(ANCHOR)
if c != 1:
    print("FATAL: 锚点 %d 次" % c)
    sys.exit(3)
t = t.replace(ANCHOR, NEW, 1)
print("OK  [catfilter-css]")
n = write_text(P, t)
print("    ai-settings.html bytes=%d" % n)
print("PATCH-F(css) done.")
