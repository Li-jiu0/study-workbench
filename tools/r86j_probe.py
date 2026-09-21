# -*- coding: utf-8 -*-
"""对「不确定」的候选点打印上下文，用于逐条判定改 / 不改。"""
import os
import re

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "tools", "r86j_probe.txt")

buf = []


def emit(s=""):
    buf.append(s)


def readlines(name):
    with open(os.path.join(ROOT, name), "rb") as fh:
        raw = fh.read()
    for enc in ("utf-8", "gbk", "utf-8-sig"):
        try:
            return raw.decode(enc).split("\n")
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace").split("\n")


def show(name, lo, hi, tag):
    lines = readlines(name)
    emit("----- %s  L%d..L%d   [%s]" % (name, lo, hi, tag))
    for i in range(lo, min(hi, len(lines)) + 1):
        emit("  %d| %s" % (i, lines[i - 1].rstrip("\r")[:300]))
    emit("")


# 1) 单行超长侧栏：找 gotoChat 出现位置并打印前后文
emit("############ 1) 超长行里的 gotoChat 上下文 ############")
for name, lineno in [("个人中心.html", 137), ("动态空间.html", 40), ("我的动态.html", 20),
                     ("朋友圈发布.html", 20), ("私聊.html", 92), ("设置.html", 62)]:
    lines = readlines(name)
    line = lines[lineno - 1]
    emit("== %s L%d  len=%d  gotoChat次数=%d" % (name, lineno, len(line), line.count("gotoChat")))
    for m in re.finditer(r"gotoChat", line):
        a = max(0, m.start() - 180)
        b = min(len(line), m.end() + 220)
        emit("   ...%s..." % line[a:b])
    emit("")

# 2) 底部导航 label 多行写法
emit("############ 2) bottom-nav-item 多行写法 ############")
for name, lo, hi in [("关于.html", 270, 285), ("学习概括.html", 303, 316),
                     ("赞助.html", 193, 206), ("更新.html", 203, 216)]:
    show(name, lo, hi, "bottom-nav")

# 3) 设置页：快捷工具 / FAQ / 隐私 / 功能清单
emit("############ 3) 设置.html 候选点 ############")
for lo, hi, tag in [(688, 694, "st-quick-it 快捷工具"), (418, 423, "通知描述"),
                    (510, 516, "FAQ"), (522, 527, "FAQ 数据存储"),
                    (828, 836, "隐私注释"), (853, 870, "隐私控件"),
                    (898, 904, "功能清单"), (1981, 1987, "MOMENT_SCOPE_LABEL")]:
    show("设置.html", lo, hi, tag)

# 4) 关于.html ab-chip
emit("############ 4) 关于.html ab-chip ############")
show("关于.html", 188, 200, "ab-chip")

# 5) 个人中心.html 通知描述
emit("############ 5) 个人中心.html ############")
show("个人中心.html", 580, 590, "通知描述")

# 6) 所有「加好友」出现位置 + 上下文 260 字符
emit("############ 6) 全部「加好友」出现点 (根目录 *.html) ############")
htmls = sorted(f for f in os.listdir(ROOT)
               if f.lower().endswith(".html") and os.path.isfile(os.path.join(ROOT, f)))
cnt = 0
for name in htmls:
    for idx, line in enumerate(readlines(name), start=1):
        for m in re.finditer("加好友", line):
            cnt += 1
            a = max(0, m.start() - 120)
            b = min(len(line), m.end() + 140)
            emit("  %s L%d| ...%s..." % (name, idx, line[a:b].rstrip("\r")))
emit("")
emit("加好友 总出现次数 = %d" % cnt)

# 7) 社区.html 分享区
emit("############ 7) 社区.html 分享区 ############")
show("社区.html", 588, 612, "分享注释")
show("社区.html", 655, 695, "分享菜单")

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("\n".join(buf))
print("WROTE", OUT, "加好友=", cnt)
