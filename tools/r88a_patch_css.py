# -*- coding: utf-8 -*-
"""R88-A 补丁 3：ai-settings.html —— 为「按模型单独列出 + A 口径」新增所需 CSS。

禁 clamp()/min()/max()：一律固定值 + @media（项目硬约束）。
配色沿用项目既有警示色：#e0504d（红=危险，符合中文数据场景直觉）。
"""
import sys

PATH = r"D:\下载的文件\学习工作台\ai-settings.html"

ADD_CSS = (
    "/* R88-A：按模型单独列出 + A 口径（剩余可用量）新增样式 */\n"
    ".xt-us-model.warn{border-left:3px solid #e8a33d;padding-left:8px;}\n"
    ".xt-us-model.danger{border-left:3px solid #e0504d;padding-left:8px;}\n"
    ".xt-us-metric{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0 6px;}\n"
    ".xt-us-metric-item{\n"
    "  min-width:0;box-sizing:border-box;background:var(--ai-bg);border:1px solid var(--ai-border);\n"
    "  border-radius:10px;padding:7px 9px;display:flex;flex-direction:column;gap:2px;\n"
    "}\n"
    ".xt-us-metric-label{font-size:11px;color:var(--ai-sub);line-height:1.4;}\n"
    ".xt-us-metric-val{font-size:13px;font-weight:700;color:var(--ai-text);line-height:1.4;word-break:break-word;}\n"
    ".xt-us-metric-val.danger{color:#e0504d;}\n"
    ".xt-us-model-id{margin:2px 0 0;line-height:1.4;}\n"
    ".xt-us-raw-id{\n"
    "  display:inline-block;max-width:100%;padding:0 6px;border-radius:6px;background:var(--ai-code-bg);\n"
    "  color:var(--ai-muted);font-size:10.5px;word-break:break-all;font-family:ui-monospace,Menlo,Consolas,monospace;\n"
    "}\n"
    ".xt-us-risk{\n"
    "  display:inline-block;margin-left:6px;padding:0 7px;border-radius:999px;\n"
    "  font-size:10.5px;font-weight:600;line-height:17px;vertical-align:1px;\n"
    "}\n"
    ".xt-us-risk.warn{color:#b8761a;background:rgba(232,163,61,.14);}\n"
    ".xt-us-risk.danger{color:#e0504d;background:rgba(224,80,77,.12);}\n"
    ".xt-us-muted{color:var(--ai-muted);}\n"
)

# 插到 .xt-us-warn 规则之后（紧邻模型卡片样式区，便于维护）
ANCHOR = ".xt-us-warn{color:#e0504d;}\n"

MEDIA_ANCHOR = "@media (max-width:640px){\n  .xt-us-cell{flex:1 1 44%;min-width:0;}\n  .xt-us-cell-num{font-size:17px;}\n}"
MEDIA_NEW = (
    "@media (max-width:640px){\n"
    "  .xt-us-cell{flex:1 1 44%;min-width:0;}\n"
    "  .xt-us-cell-num{font-size:17px;}\n"
    "  .xt-us-metric{grid-template-columns:repeat(2,1fr);}\n"
    "}"
)

REPLACEMENTS = [
    ("insert-css", ANCHOR, ANCHOR + ADD_CSS),
    ("media-2col", MEDIA_ANCHOR, MEDIA_NEW),
]


def main():
    with open(PATH, "rb") as f:
        raw = f.read()
    if raw.count(b"\r") != 0:
        print("FATAL: 非纯 LF，拒绝改动")
        sys.exit(2)
    text = raw.decode("utf-8")

    for label, old, new in REPLACEMENTS:
        cnt = text.count(old)
        if cnt != 1:
            print("FATAL: [%s] 锚点 %d 次" % (label, cnt))
            sys.exit(3)
        text = text.replace(old, new, 1)
        print("OK  [%s]" % label)

    with open(PATH, "wb") as f:
        f.write(text.encode("utf-8"))

    with open(PATH, "rb") as f:
        check = f.read()
    print("bytes: %d -> %d, CR=%d" % (len(raw), len(check), check.count(b"\r")))
    if check.count(b"\r") != 0:
        print("FATAL: 行尾污染")
        sys.exit(4)
    t = check.decode("utf-8")
    for frag in [".xt-us-metric-item{", ".xt-us-raw-id{", ".xt-us-risk.danger{", "repeat(2,1fr)"]:
        if frag not in t:
            print("FATAL: 缺少 %s" % frag)
            sys.exit(5)
    if "clamp(" in t:
        print("FATAL: 引入了 clamp()")
        sys.exit(6)
    print("EOL = LF ✔  改动生效 ✔")


if __name__ == "__main__":
    main()
