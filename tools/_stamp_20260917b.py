# -*- coding: utf-8 -*-
# 版本戳 20260917b：只 bump 本批真改过的 18 个资产；锚定 src=/href=；二进制读写保行尾
import os, re, io, shutil, datetime

P = r"D:\下载的文件\学习工作台"
NEW = "20260917b"
ASSETS = ["admin-contact.js","ai-config.js","ai-page.js","ai-service.js","ai-settings.js",
          "api.js","app.js","chat-local.js","common.css","importer.js","notify.js",
          "subpage-router.js","voiceplayer.js","xt-android.js","xt-moments.css",
          "xt-moments.js","xt-profile.css","xt-profile.js"]
OLD_STAMPS = ["20260916O","20260916R","20260916S","20260917","20260917a"]

out = []
# 1. 备份目录外整体快照（不污染仓库）：直接逐文件就地 .bak-pre-stamp-20260917b
bak_tag = ".bak-pre-stamp-20260917b"

changed_files = {}
total_repl = 0
for fn in sorted(os.listdir(P)):
    if not fn.endswith(".html") or fn.startswith("_") or ".bak" in fn:
        continue
    fp = os.path.join(P, fn)
    raw = open(fp, "rb").read()
    text = raw.decode("utf-8", errors="strict")
    n_repl = 0
    for a in ASSETS:
        # 锚定 src=/href=，捕获组只含路径前缀与引号，文件名整段匹配（防 xxx.js.js）
        pat = re.compile(r'((?:src|href)="(?:assets/)?%s)\?v=(?:%s)(")' % (re.escape(a), "|".join(OLD_STAMPS)))
        text2, n = pat.subn(lambda m: m.group(1) + "?v=" + NEW + m.group(2), text)
        if n:
            n_repl += n
            text = text2
    if n_repl:
        bak = fp + bak_tag
        if not os.path.exists(bak):
            shutil.copyfile(fp, bak)
        open(fp, "wb").write(text.encode("utf-8"))
        changed_files[fn] = n_repl
        total_repl += n_repl

out.append("modified HTML files: %d, total replacements: %d" % (len(changed_files), total_repl))

# 2. 终态复验（独立 pattern）
new_raw_counts = {}
old_resid = {}
for a in ASSETS:
    c_new = 0
    c_old = 0
    for fn in sorted(os.listdir(P)):
        if not fn.endswith(".html") or fn.startswith("_") or ".bak" in fn:
            continue
        t = open(os.path.join(P, fn), "rb").read().decode("utf-8", errors="replace")
        c_new += t.count(a + "?v=" + NEW)
        for s in OLD_STAMPS:
            c_old += t.count(a + "?v=" + s)
    new_raw_counts[a] = c_new
    old_resid[a] = c_old

bad = [(a, new_raw_counts[a], old_resid[a]) for a in ASSETS if new_raw_counts[a] == 0 or old_resid[a] != 0]
out.append("assets with new stamp: " + ", ".join("%s=%d" % (a, new_raw_counts[a]) for a in ASSETS))
out.append("old-stamp residue on changed assets: " + (", ".join("%s=%d" % (a, old_resid[a]) for a in ASSETS) or "all 0"))
out.append("problems: %s" % (bad or "none"))

# 3. .js.js 复验 + 全站旧戳残留统计（只统计 18 资产）
jsjs = 0
for fn in sorted(os.listdir(P)):
    if fn.endswith(".html") and not fn.startswith("_") and ".bak" not in fn:
        jsjs += open(os.path.join(P, fn), "rb").read().decode("utf-8", errors="replace").count(".js.js?v=") + \
                open(os.path.join(P, fn), "rb").read().decode("utf-8", errors="replace").count(".css.css?v=")
out.append(".js.js/.css.css?v= count: %d (must 0)" % jsjs)

# 4. 行尾复验（抽改过的文件）
bad_eol = []
for fn in list(changed_files.keys()):
    b = open(os.path.join(P, fn), "rb").read()
    if fn == "ai-settings.html":
        continue  # LF 例外
    bare = len(b.replace(b"\r\n", b"").split(b"\n")) - 1
    if bare != 0:
        bad_eol.append((fn, bare))
out.append("EOL violations: %s" % (bad_eol or "none"))

io.open(r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-8677e3fc\_stamp_report.txt", "w", encoding="utf-8").write("\n".join(out))
print("done")
