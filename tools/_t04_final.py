# -*- coding: utf-8 -*-
import io, os, re
ROOT = r"D:\下载的文件\学习工作台"
out = []
for rel, tag in [(r"assets\ai-page.js", ".bak-pre-r87-20260918"), (r"assets\xt-aiusage.js", ".bak-pre-r87-20260918")]:
    p = os.path.join(ROOT, rel)
    with open(p, "rb") as f:
        b = f.read()
    out.append("%s  bytes=%d  CRLF=%d  LF=%d" % (rel, len(b), b.count(b"\r\n"), b.count(b"\n")))
    bak = p + tag
    out.append("   backup exists: %s (%s)" % (os.path.exists(bak), os.path.basename(bak)))
    txt = b.decode("utf-8")
    # new global assignment check (should be 0): top-level window.X =
    win = re.findall(r"^\s*window\.[A-Za-z_$][\w$]*\s*=", txt, re.M)
    out.append("   top-level window.* assignments: %d" % len(win))
    out.append("   sortRows refs: %d" % txt.count("sortRows"))
    out.append("   fetch refs: %d" % txt.count("fetch"))
out.append("")
out.append("ai-page.js: hideUnavailable refs=%d ; xt:health-changed refs=%d" % (
    open(os.path.join(ROOT, r"assets\ai-page.js"), "rb").read().decode("utf-8").count("hideUnavailable"),
    open(os.path.join(ROOT, r"assets\ai-page.js"), "rb").read().decode("utf-8").count("xt:health-changed")))
with io.open(os.path.join(ROOT, r"tools\_t04_final_out.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("ok")
