# -*- coding: utf-8 -*-
"""R91-B：修复 私聊.html 加号弹窗/定位半屏层被底部 Tab 栏(.bottom-nav z-index:200)遮挡。
只动 #imPlusCss 注入串 3 处 z-index（60->210 / 61->211 / 80->215），字节级替换，不改行尾。
幂等：若新值已存在则跳过并报告。
"""
import io

P = r"D:\下载的文件\学习工作台\私聊.html"
LOG = r"D:\下载的文件\学习工作台\tools\qa\r91b_patch_log.txt"

REPL = [
    # (old, new, label)
    ("transition:opacity .2s ease;z-index:60}",
     "transition:opacity .2s ease;z-index:210}",
     "im-plus-mask 60 -> 210"),
    ("transition:transform .24s ease;z-index:61;max-width:520px",
     "transition:transform .24s ease;z-index:211;max-width:520px",
     "im-plus-menu 61 -> 211"),
    (".im-loc-sheet{position:fixed;inset:0;z-index:80}",
     ".im-loc-sheet{position:fixed;inset:0;z-index:215}",
     "im-loc-sheet 80 -> 215"),
]

with io.open(P, "rb") as f:
    data = f.read()

lines = []
lines.append("R91-B patch log for 私聊.html")
lines.append("file size before=%d" % len(data))
crlf = data.count(b"\r\n")
lf_total = data.count(b"\n")
lines.append("CRLF=%d  LF_total=%d  pure_LF=%d" % (crlf, lf_total, lf_total - crlf))

changed = 0
for old, new, label in REPL:
    ob = old.encode("utf-8")
    nb = new.encode("utf-8")
    cnt = data.count(ob)
    cnt_new = data.count(nb)
    if cnt_new > 0 and cnt == 0:
        lines.append("[SKIP already-patched] %s" % label)
        continue
    if cnt != 1:
        lines.append("[ERROR] %s : old occurrence count=%d (expect 1), abort this pair" % (label, cnt))
        continue
    data = data.replace(ob, nb, 1)
    changed += 1
    lines.append("[OK] %s (old hit=1, replaced)" % label)

with io.open(P, "wb") as f:
    f.write(data)

# ---- verify by re-read ----
with io.open(P, "rb") as f:
    chk = f.read()
lines.append("file size after=%d" % len(chk))
crlf2 = chk.count(b"\r\n")
lf2 = chk.count(b"\n")
lines.append("after: CRLF=%d  LF_total=%d  pure_LF=%d" % (crlf2, lf2, lf2 - crlf2))
ok = True
for old, new, label in REPL:
    nb = new.encode("utf-8")
    ob = old.encode("utf-8")
    hit_new = chk.count(nb)
    hit_old = chk.count(ob)
    lines.append("[VERIFY] %s : new hit=%d  old hit=%d" % (label, hit_new, hit_old))
    if hit_new < 1:
        ok = False
lines.append("RESULT=%s" % ("PASS" if ok and changed >= 1 else "CHECK"))

with io.open(LOG, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
