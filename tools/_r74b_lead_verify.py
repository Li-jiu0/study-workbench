# -*- coding: utf-8 -*-
# 主理人终验 R74-B（只读）
import os, io, datetime, re

P = r"D:\下载的文件\学习工作台"
out = []

def read(p):
    with open(p, "rb") as f:
        return f.read()

def txt(p):
    return read(p).decode("utf-8", errors="replace")

files = {
    "xt-profile.js": os.path.join(P, "assets", "xt-profile.js"),
    "xt-profile.css": os.path.join(P, "assets", "xt-profile.css"),
    "api.js": os.path.join(P, "assets", "api.js"),
    "chat-local.js": os.path.join(P, "assets", "chat-local.js"),
}

# mtime + size
for name, p in files.items():
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(p)).strftime("%m-%d %H:%M:%S")
    out.append("%s size=%d mtime=%s" % (name, os.path.getsize(p), mt))
    bak = p + ".bak-pre-r74-20260917"
    out.append("  backup exists=%s" % os.path.exists(bak))

t = txt(files["xt-profile.js"])
# 关键内容抽查
out.append("xt-profile otherHeroActsHtml=%s" % ("otherHeroActsHtml" in t))
out.append("xt-profile otherDelFriend=%s" % ("otherDelFriend" in t))
out.append("xt-profile otherSetRemark=%s" % ("otherSetRemark" in t))
out.append("xt-profile otherMomentsListHtml=%s" % ("otherMomentsListHtml" in t))
out.append("xt-profile loadOtherRemark=%s" % ("loadOtherRemark" in t))
out.append("xt-profile DELETE friends 调用=%d" % (t.count("DELETE") > 0 and len(re.findall(r"/api/friends/", t))))
out.append("xt-profile 动态空间.html=%d (报3处)" % t.count("动态空间.html"))
standalone_old = len([m for m in re.finditer(r"动态\.html", t) if not t[max(0,m.start()-2):m.start()].endswith("我的")])
out.append("xt-profile 独立 动态.html=%d (expect 0)" % standalone_old)
out.append("xt-profile 我的动态.html=%d (expect 1)" % t.count("我的动态.html"))

ta = txt(files["api.js"])
standalone_old_a = len([m for m in re.finditer(r"动态\.html", ta) if not ta[max(0,m.start()-2):m.start()].endswith("我的")])
out.append("api.js 独立 动态.html=%d (expect 0) 动态空间.html=%d (expect 1)" % (standalone_old_a, ta.count("动态空间.html")))

tc = txt(files["chat-local.js"])
out.append("chat-local 动态.html/朋友圈.html=%d (expect 0，B线称未动)" % (tc.count("动态.html") + tc.count("朋友圈.html")))

# ES2017 抽查（活代码，排除注释行）
def es2017_hits(t):
    pats = [r"\?\.", r"\?\?", r"\.replaceAll\(", r"Object\.fromEntries", r"\.at\("]
    hits = 0
    for i, line in enumerate(t.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("/*"):
            continue
        for pat in pats:
            if re.search(pat, line):
                hits += 1
                out.append("  ES2017 hit L%d: %s" % (i, stripped[:60]))
    return hits
for name in ["xt-profile.js", "api.js"]:
    out.append("%s ES2017 hits=%d (expect 0)" % (name, es2017_hits(txt(files[name]))))

# 行尾
for name, p in files.items():
    b = read(p)
    bare = len(b.replace(b"\r\n", b"").split(b"\n")) - 1
    out.append("%s bareLF=%d (expect 0)" % (name, bare))

# css 无 clamp/min/max（新段）
cs = txt(files["xt-profile.css"])
out.append("css clamp(=%d min(=%d max(=%d (expect 0)" % (cs.count("clamp("), len(re.findall(r"[^a-z-]min\(", cs)), len(re.findall(r"[^a-z-]max\(", cs))))

io.open(r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8677e3fc\_r74b_lead_verify.txt", "w", encoding="utf-8").write("\n".join(out))
print("done")
