# -*- coding: utf-8 -*-
# 主理人终验 R74-A（只读，不改任何文件）
import os, io

P = r"D:\下载的文件\学习工作台"
out = []
def rd(p):
    with open(p, "rb") as f:
        return f.read()

# 1. 存在性
for name, expect in [("动态空间.html", True), ("朋友圈.html", False), ("动态.html", False),
                     ("我的动态.html", True), ("朋友圈发布.html", True)]:
    p = os.path.join(P, name)
    out.append("%s exists=%s (expect %s) %s" % (name, os.path.exists(p), expect, "PASS" if os.path.exists(p) == expect else "FAIL"))

# 2. app.js
aj = os.path.join(P, "assets", "app.js")
b = rd(aj)
t = b.decode("utf-8", errors="replace")
out.append("app.js size=%d" % len(b))
out.append("app.js moments-new=%d (expect 1) %s" % (t.count("moments: '动态空间.html',"), "PASS" if t.count("moments: '动态空间.html',") == 1 else "FAIL"))
old_in_app = t.count("动态.html'") + t.count("朋友圈.html'")
out.append("app.js old-name refs=%d (expect 0) %s" % (old_in_app, "PASS" if old_in_app == 0 else "FAIL"))
bare = len(b.replace(b"\r\n", b"").split(b"\n")) - 1
out.append("app.js bareLF=%d (expect 0) %s" % (bare, "PASS" if bare == 0 else "FAIL"))

# 3. xt-moments.js
xm = os.path.join(P, "assets", "xt-moments.js")
t2 = rd(xm).decode("utf-8", errors="replace")
c_old = t2.count("动态.html") + t2.count("朋友圈.html")
c_new = t2.count("动态空间.html")
out.append("xt-moments.js old=%d (expect 0) new=%d (expect 3) %s" % (c_old, c_new, "PASS" if c_old == 0 and c_new == 3 else "FAIL"))

# 4. 更多/个人中心
for name in ["更多.html", "个人中心.html", "我的动态.html", "朋友圈发布.html"]:
    t3 = rd(os.path.join(P, name)).decode("utf-8", errors="replace")
    o = t3.count("朋友圈.html") + t3.count("动态.html") - t3.count("动态空间.html")
    # 动态.html 计数含 动态空间.html 吗？不含：'动态空间.html' 不匹配 '动态.html'
    o2 = t3.count("朋友圈.html") + t3.count("动态.html")
    out.append("%s old-refs=%d (expect 0) new-refs=%d %s" % (name, o2, t3.count("动态空间.html"), "PASS" if o2 == 0 else "FAIL"))

# 5. 新页关键内容
t4 = rd(os.path.join(P, "动态空间.html")).decode("utf-8", errors="replace")
checks = [
    ("title", "动态空间 · 星途" in t4),
    ("nav-title", "动态空间" in t4),
    ("entry-card 我的动态", "我的动态.html" in t4),
    ("moOpenUser", "moOpenUser" in t4),
    ("no old 动态.html", "动态.html" not in t4),
    ("no 朋友圈.html", "朋友圈.html" not in t4),
]
out.append("动态空间.html checks: " + ", ".join("%s=%s" % (k, v) for k, v in checks))

# 6. 全站侧栏计数
cnt_pages = 0
total = 0
for fn in os.listdir(P):
    if not fn.endswith(".html"):
        continue
    fp = os.path.join(P, fn)
    t5 = rd(fp).decode("utf-8", errors="replace")
    n = t5.count('data-page="moments"')
    if n > 0:
        cnt_pages += 1
        total += n
out.append("sidebar pages=%d hits=%d (A线报 35/35)" % (cnt_pages, total))

# 7. B 线文件应仍含旧引用（等 r74b 处理）
for name in ["assets/api.js", "assets/xt-profile.js"]:
    t6 = rd(os.path.join(P, name)).decode("utf-8", errors="replace")
    out.append("%s 动态.html refs=%d（归 B 线，待改）" % (name, t6.count("动态.html")))

# 8. mtime 证据
import datetime
for rel in ["动态空间.html", "assets/app.js", "assets/xt-moments.js", "个人中心.html", "更多.html"]:
    fp = os.path.join(P, rel)
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(fp)).strftime("%H:%M:%S")
    out.append("mtime %s = %s (%d B)" % (rel, mt, os.path.getsize(fp)))

io.open(r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8677e3fc\_r74a_lead_verify.txt", "w", encoding="utf-8").write("\n".join(out))
print("done")
