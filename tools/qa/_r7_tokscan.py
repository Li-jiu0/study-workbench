# Scan inline <script> blocks for HTML-tokenizer swallowing hazards:
#  1) block contains <!-- followed later by <script (without --> between) -> the
#     closing </script> may NOT close the element (double-escaped state)
#  2) block contains literal </script (inside a JS string) -> block actually ends
#     earlier than a naive regex split thinks
# Report: _r7_tokscan.txt
import re, os

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "_r7_tokscan.txt")
PAGES = ["个人中心.html", "设置.html", "AI.html", "ai-settings.html"]
report = []

for page in PAGES:
    with open(os.path.join(ROOT, page), "r", encoding="utf-8", errors="replace") as f:
        html = f.read()
    report.append("== %s ==" % page)
    # find all script open tags
    opens = [m for m in re.finditer(r"<script\b[^>]*>", html, re.I)]
    for i, om in enumerate(opens):
        start = om.end()
        nxt = opens[i + 1].start() if i + 1 < len(opens) else len(html)
        close = html.find("</script", start)
        if close < 0 or close > nxt and False:
            pass
        body = html[start:close if close >= 0 else len(html)]
        src = re.search(r'src\s*=\s*"([^"]+)"', om.group(0))
        if src:
            continue
        line = html[:om.start()].count("\n") + 1
        # hazard 1: <!-- ... <script without -->
        haz = []
        for cm in re.finditer(r"<!--", body):
            after = body[cm.end():]
            arrow = after.find("-->")
            scr = re.search(r"<script", after[:arrow] if arrow >= 0 else after, re.I)
            if scr:
                pos = cm.start()
                haz.append("H1(<!--@%d + <script@%d, no --> between)" % (pos, pos + cm.end() - cm.start() + (scr.start() if arrow < 0 else scr.start())))
                break
        # hazard 2: literal </script inside body (means my naive close actually
        # ends the block there and the REST till real close is not JS)
        if re.search(r"</script", body, re.I):
            pos = re.search(r"</script", body, re.I).start()
            haz.append("H2(literal </script @%d in JS body)" % pos)
        if haz:
            report.append("  inline block @page-line %d len=%d: %s" % (line, len(body), "; ".join(haz)))
            # show context around first hazard
            m = re.search(r"@\d+", haz[0])
            if m:
                p = int(m.group(0)[1:])
                ctx = body[max(0, p - 60):p + 120].replace("\n", "\\n")
                report.append("    ctx: %s" % ctx)
    report.append("")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(report))
print("DONE")
