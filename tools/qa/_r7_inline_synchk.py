# Extract inline <script> blocks (no src) from problem pages, node --check each.
# Report: _r7_inline_synchk.txt
import re, subprocess, os, sys

ROOT = r"D:\下载的文件\学习工作台"
NODE = r"C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
OUT = os.path.join(ROOT, "_r7_inline_synchk.txt")
TMP = os.path.join(os.environ.get("TEMP", r"C:\Users\ATM\AppData\Local\Temp"), "_r7_inline_chk")
os.makedirs(TMP, exist_ok=True)

PAGES = ["个人中心.html", "设置.html", "AI.html", "ai-settings.html"]
report = []

def check(tag, code, page, start_line):
    p = os.path.join(TMP, "blk.js")
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(code)
    try:
        r = subprocess.run([NODE, "--check", p], capture_output=True, timeout=30)
        if r.returncode == 0:
            return None
        err = (r.stderr or b"").decode("utf-8", "replace").strip().splitlines()
        msg = " | ".join(err[:4]) if err else "rc=%d" % r.returncode
        m = re.search(r":(\d+)\s*$", msg)
        detail = ""
        if m:
            ln = int(m.group(1))
            lines = code.split("\n")
            if 1 <= ln <= len(lines):
                detail = " || rel-line %d: %s" % (ln, repr(lines[ln-1][:160]))
                abs_line = start_line + ln - 1
                detail += " || page-line ~%d" % abs_line
        return msg + detail
    except Exception as e:
        return "EXEC-FAIL " + str(e)[:120]

for page in PAGES:
    fp = os.path.join(ROOT, page)
    with open(fp, "r", encoding="utf-8", errors="replace") as f:
        html = f.read()
    report.append("== %s ==" % page)
    idx = 0
    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", html, re.S | re.I):
        attrs, body = m.group(1), m.group(2)
        idx += 1
        has_src = re.search(r'\bsrc\s*=', attrs, re.I)
        start_line = html[:m.start()].count("\n") + 1
        tag = "block#%d page-line %d len=%d src=%s" % (idx, start_line, len(body), ('Y:' + (re.search(r'src="([^"]+)"', attrs).group(1) if re.search(r'src="([^"]+)"', attrs) else '?')) if has_src else 'N(inline)')
        if not has_src:
            if not body.strip():
                report.append("  %s -> EMPTY" % tag)
                continue
            err = check(tag, body, page, start_line)
            report.append("  %s -> %s" % (tag, err if err else "OK"))
        else:
            report.append("  %s -> (external, skip)" % tag)
    report.append("")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(report))
print("DONE")
