# -*- coding: utf-8 -*-
# 版本戳 20260918a：只 bump R73n 改过的 2 个资产（ai-service.js / ai-settings.js）
import os, re, io

P = r"D:\下载的文件\学习工作台"
NEW = "20260918a"
ASSETS = ["ai-service.js", "ai-settings.js"]
OLD_STAMPS = ["20260917b"]

out = []
bak_tag = ".bak-pre-stamp-20260918a"
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
        pat = re.compile(r'((?:src|href)="(?:assets/)?%s)\?v=(?:%s)(")' % (re.escape(a), "|".join(OLD_STAMPS)))
        text2, n = pat.subn(lambda m: m.group(1) + "?v=" + NEW + m.group(2), text)
        if n:
            n_repl += n
            text = text2
    if n_repl:
        bak = fp + bak_tag
        if not os.path.exists(bak):
            import shutil
            shutil.copyfile(fp, bak)
        open(fp, "wb").write(text.encode("utf-8"))
        changed_files[fn] = n_repl
        total_repl += n_repl
out.append("modified HTML files: %d, total replacements: %d" % (len(changed_files), total_repl))

# 终态复验
new_cnt = {a: 0 for a in ASSETS}
old_resid = {a: 0 for a in ASSETS}
bad_eol = []
for fn in sorted(os.listdir(P)):
    if not fn.endswith(".html") or fn.startswith("_") or ".bak" in fn:
        continue
    t = open(os.path.join(P, fn), "rb").read()
    for a in ASSETS:
        new_cnt[a] += t.count((a + "?v=" + NEW).encode())
        old_resid[a] += t.count((a + "?v=" + OLD_STAMPS[0]).encode())
    if fn in changed_files and fn != "ai-settings.html":  # LF 例外豁免
        bare = len(t.replace(b"\r\n", b"").split(b"\n")) - 1
        if bare != 0:
            bad_eol.append((fn, bare))
for a in ASSETS:
    out.append("%s: new=%d old_resid=%d %s" % (a, new_cnt[a], old_resid[a],
              "OK" if new_cnt[a] > 0 and old_resid[a] == 0 else "!!!"))
out.append("EOL violations: %s" % (bad_eol or "none"))
ok = all(new_cnt[a] > 0 and old_resid[a] == 0 for a in ASSETS) and not bad_eol
out.append("RESULT: " + ("PASS" if ok else "FAIL"))
io.open(r"C:\Users\ATM\_r73n_stamp.txt", "w", encoding="utf-8").write("\n".join(out) + "\nfiles: " + ", ".join(sorted(changed_files)))
print(out[-1])
