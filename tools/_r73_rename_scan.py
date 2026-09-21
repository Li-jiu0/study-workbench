# -*- coding: utf-8 -*-
"""R73 改名单写者工序 —— 全站引用扫描（只读侦察）"""
import os, re

ROOT = r"D:\下载的文件\学习工作台"
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".workbuddy", ".idea", ".gradle"}
SKIP_SUFFIX = (".bak", ".pyc", ".jpg", ".png", ".jpeg", ".gif", ".webp", ".ico",
               ".apk", ".aar", ".jar", ".keystore", ".ttf", ".woff", ".woff2",
               ".pdf", ".zip", ".gz", ".tar", ".mp3", ".mp4", ".xlsx", ".docx")
TEXT_EXT = {".html", ".htm", ".js", ".css", ".py", ".json", ".md", ".txt", ".xml",
            ".java", ".sql", ".sh", ".ps1", ".env", ".yml", ".yaml", ".cfg", ".ini", ""}

TERMS = ["学习工作台", "私聊", "星图", "星途", "study-workbench", "study.workbench"]
# 硬引用（会断功能的）判定：出现在 href/src/location/路径/import 语境
PATHLIKE = re.compile(r"(href|src|location|\.html|url|path|open|import|\.js\b)", re.I)

results = {t: [] for t in TERMS}
scanned = 0
skipped_binary = 0

for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
    for fn in filenames:
        if fn.lower().endswith(SKIP_SUFFIX):
            skipped_binary += 1
            continue
        p = os.path.join(dirpath, fn)
        rel = os.path.relpath(p, ROOT)
        ext = os.path.splitext(fn)[1].lower()
        if ext not in TEXT_EXT:
            skipped_binary += 1
            continue
        try:
            if os.path.getsize(p) > 12 * 1024 * 1024:
                skipped_binary += 1
                continue
            with open(p, "rb") as f:
                raw = f.read()
        except Exception:
            continue
        # 跳过二进制味很浓的
        if b"\x00" in raw[:4096]:
            skipped_binary += 1
            continue
        scanned += 1
        txt = raw.decode("utf-8", "replace")
        lines = txt.replace("\r\n", "\n").split("\n")
        for t in TERMS:
            if t not in txt:
                continue
            for i, ln in enumerate(lines, 1):
                if t in ln:
                    s = ln.strip()
                    is_comment = s.startswith("//") or s.startswith("*") or s.startswith("/*") \
                                 or s.startswith("#") or s.startswith("<!--") or s.startswith("--")
                    hard = (not is_comment) and bool(PATHLIKE.search(s))
                    results[t].append((rel, i, "HARD" if hard else ("cmt" if is_comment else "txt"), s[:150]))

out = []
out.append("=== R73 改名扫描（只读）===")
out.append("扫描文本文件 %d 个；跳过二进制/大文件 %d 个" % (scanned, skipped_binary))
out.append("")
for t in TERMS:
    hits = results[t]
    hard = [h for h in hits if h[2] == "HARD"]
    byfile = {}
    for rel, ln, kind, s in hits:
        byfile.setdefault(rel, []).append((ln, kind, s))
    out.append("## 「%s」—— 总命中 %d 行 / %d 文件；其中【硬引用】%d 行" % (t, len(hits), len(byfile), len(hard)))
    if hard:
        out.append("  --- 硬引用明细（改名时必须同步）---")
        for rel, ln, kind, s in hard:
            out.append("   [HARD] %s:%d  %s" % (rel, ln, s))
        out.append("  --- 其余命中按文件汇总（注释/正文）---")
        for rel in sorted(byfile):
            n = len(byfile[rel])
            kinds = set(k for _, k, _ in byfile[rel])
            out.append("   %-40s %d 行  (%s)" % (rel, n, "/".join(sorted(kinds))))
    else:
        for rel in sorted(byfile):
            out.append("   %-40s %d 行" % (rel, len(byfile[rel])))
    out.append("")

open(os.path.join(ROOT, "tools", "_r73_rename_scan.txt"), "w", encoding="utf-8").write("\n".join(out))
print("OK  scanned=%d" % scanned)
