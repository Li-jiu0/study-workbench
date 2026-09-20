# -*- coding: utf-8 -*-
"""r86j —— 替换后自检"""
import os
import re

ROOT = r"D:\下载的文件\学习工作台"
htmls = sorted(f for f in os.listdir(ROOT)
               if f.lower().endswith(".html") and os.path.isfile(os.path.join(ROOT, f)))

tot = {"好友": 0, "加好友": 0, "通讯录": 0}
bare_add = 0          # 未前置「添」的 加好友
malformed = []
eol_bad = []
nav_left = 0
nav_new = 0
crlf_files = 0

for name in htmls:
    with open(os.path.join(ROOT, name), "rb") as fh:
        raw = fh.read()
    text = raw.decode("utf-8")
    crlf = raw.count(b"\r\n")
    lf = raw.count(b"\n") - crlf
    if crlf and not lf:
        crlf_files += 1
    elif crlf and lf:
        eol_bad.append((name, "MIXED", crlf, lf))

    tot["好友"] += text.count("好友")
    tot["通讯录"] += text.count("通讯录")
    bare_add += len(re.findall(r"(?<!添)加好友", text))

    for bad in ("通讯录申请", "添加好友申请", "添添加好友", "通讯录私信 · 好友申请"):
        if bad in text:
            malformed.append((name, bad))

    # 侧栏 nav-item 残留 / 新值
    nav_left += len(re.findall(
        r'<div\s+class="nav-item"[^>]*onclick="gotoChat\(\)"[^>]*>.{0,500}?<span[^>]*>\s*好友\s*</span>',
        text, re.S))
    nav_new += len(re.findall(
        r'<div\s+class="nav-item"[^>]*onclick="gotoChat\(\)"[^>]*>.{0,500}?<span[^>]*>\s*通讯录\s*</span>',
        text, re.S))

print("根目录 html 文件数        :", len(htmls))
print("纯 CRLF 文件数           :", crlf_files)
print("换行异常文件             :", eol_bad if eol_bad else "无")
print("「好友」总出现次数        :", tot["好友"])
print("「通讯录」总出现次数      :", tot["通讯录"])
print("裸「加好友」剩余(应为 0)  :", bare_add)
print("侧栏 nav-item 仍写「好友」:", nav_left, "(应为 0)")
print("侧栏 nav-item 已写「通讯录」:", nav_new, "(应为 36)")
print("畸形词                  :", malformed if malformed else "无")
print()

# 抽查 3 个页面：EOL + 关键片段
for name in ("学习工作台.html", "设置.html", "私聊.html"):
    with open(os.path.join(ROOT, name), "rb") as fh:
        raw = fh.read()
    text = raw.decode("utf-8")
    crlf = raw.count(b"\r\n")
    lf = raw.count(b"\n") - crlf
    print("== 抽查 %s  CRLF=%d  LF=%d" % (name, crlf, lf))
    for m in re.finditer(r'.{0,60}通讯录.{0,60}', text):
        print("     …%s…" % m.group(0).replace("\r", "").replace("\n", " "))
    print()
