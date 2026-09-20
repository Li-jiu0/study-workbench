# -*- coding: utf-8 -*-
"""精读 xt-profile.js 的 M5 筛选/空态/清空关键切片"""
import os
ROOT = r"D:\下载的文件\学习工作台"
s = open(os.path.join(ROOT, "assets", "xt-profile.js"), "r", encoding="utf-8", errors="replace").read()
lines = s.split("\n")

def show(a, b, label):
    print("===== %s  L%d-%d =====" % (label, a, b))
    for i in range(a - 1, min(len(lines), b)):
        print("%5d| %s" % (i + 1, lines[i].rstrip("\r")))
    print("")

show(1725, 1800, "M5 状态 + 时间范围解析 + 标签")
show(1804, 1870, "工具栏 HTML 生成")
show(1880, 1960, "m5ActiveFilterLabel + m5PanelHtml + m5ClearAll")
show(1985, 2035, "过滤主逻辑 m5Filtered")
show(2230, 2270, "m5Bind 尾部")
