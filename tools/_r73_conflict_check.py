# -*- coding: utf-8 -*-
"""R73 冲突核查：assets/api.js 被两条线同时写入，核验两边改动是否都还在"""
import os

ROOT = r"D:\下载的文件\学习工作台"
out = []

def stats(p):
    raw = open(p, "rb").read()
    return raw, raw.count(b"\r\n"), raw.count(b"\n")

def check(rel, needles_present, needles_absent):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        out.append("!! %s 不存在" % rel)
        return
    raw, crlf, lf = stats(p)
    t = raw.decode("utf-8", "replace")
    out.append("=== %s | %d B | CRLF=%d bareLF=%d ===" % (rel, len(raw), crlf, lf - crlf))
    for n in needles_present:
        c = t.count(n)
        out.append("   [期望存在] %-46s -> %d %s" % (n[:46], c, "OK" if c > 0 else "*** 缺失! ***"))
    for n in needles_absent:
        c = t.count(n)
        out.append("   [期望为0 ] %-46s -> %d %s" % (n[:46], c, "OK" if c == 0 else "*** 仍在! ***"))

# api.js: 任务十七改的(帖子数据统计) + 任务十二改的(删多人在线/计时说明)
check("assets/api.js",
      ["帖子数据统计"],
      ["博客数据统计", "多人在线：资料保存在服务器数据库", "打开任意页面即开始计时"])

# app.js: 任务十七改的
check("assets/app.js",
      ["帖子数据统计"],
      ["博客数据统计"])

# 错题本.html: 任务十二改的
check("错题本.html",
      ["公共 Key 限 10 次/分钟。"],
      ["模块级：输出该模块最该补的 3 个考点"])

# 个人中心.html: 任务十二改的
check("个人中心.html",
      [],
      ["多人在线：资料保存在服务器数据库", "打开任意页面即开始计时"])

# 设置.html: 需求9 项4/5 尚未落地（待转派）
check("设置.html",
      [],
      ["被拉黑的用户无法向你发送好友申请或私信"])

# 新文件存在性
out.append("=== 新增文件存在性 ===")
for rel in ["个人资料.html", "assets/xt-profile.js", "assets/xt-profile.css",
            "朋友圈.html", "我的朋友圈.html", "发布.html", "赞助.html",
            "assets/xt-moments.js", "assets/xt-android.js"]:
    p = os.path.join(ROOT, rel)
    out.append("   %-28s %s" % (rel, ("YES %d B" % os.path.getsize(p)) if os.path.exists(p) else "-"))

# 根目录 html 总数
htmls = sorted([f for f in os.listdir(ROOT) if f.lower().endswith(".html")])
out.append("=== 根目录 html 总数: %d ===" % len(htmls))
out.append("   " + " | ".join(htmls))

open(os.path.join(ROOT, "tools", "_r73_conflict_check.txt"), "w", encoding="utf-8").write("\n".join(out))
print("OK")
