import hashlib, os, re

ROOT = r"D:\下载的文件\学习工作台"
OUT = os.path.join(ROOT, "_r9x_qa_fp.txt")
out = []
def w(s):
    out.append(str(s))

# ---------- fingerprint + F31 ----------
targets = [
    ("assets/xt-profile.js", 134368, "c015910b4ca18b402f2b6e0165fa8ba7", 2639),
    ("assets/xt-profile.css", 40729, "cd0e9c0519bfa715c59ae9443178e29a", 1244),
]
for rel, size_exp, md5_exp, crlf_exp in targets:
    p = os.path.join(ROOT, rel)
    data = open(p, "rb").read()
    size = len(data)
    md5 = hashlib.md5(data).hexdigest()
    crlf = data.count(b"\r\n")
    lf = data.count(b"\n")
    lone_lf = lf - crlf
    cr = data.count(b"\r")
    lone_cr = cr - crlf
    w("[FP] %s size=%d exp=%d match=%s" % (rel, size, size_exp, size == size_exp))
    w("[FP] %s md5=%s exp=%s match=%s" % (rel, md5, md5_exp, md5 == md5_exp))
    w("[FP] %s crlf=%d loneLF=%d loneCR=%d expCRLF=%d ok=%s" % (rel, crlf, lone_lf, lone_cr, crlf_exp, (crlf == crlf_exp and lone_lf == 0)))

# ---------- helpers ----------
def strip_js_comments(src):
    res = []
    i = 0; n = len(src); mode = None
    while i < n:
        c = src[i]; c2 = src[i:i+2]
        if mode is None:
            if c2 == "//": mode = "line"; i += 2; continue
            if c2 == "/*": mode = "block"; i += 2; continue
            if c == "'": mode = "'"; res.append(c); i += 1; continue
            if c == '"': mode = '"'; res.append(c); i += 1; continue
            if c == "`": mode = "`"; res.append(c); i += 1; continue
            res.append(c); i += 1
        elif mode == "line":
            if c == "\n": mode = None; res.append(c)
            i += 1
        elif mode == "block":
            if src[i:i+2] == "*/": mode = None; i += 2; res.append(" ")
            else: i += 1
        else:
            if c == "\\":
                res.append(src[i:i+2]); i += 2; continue
            if (mode == "'" and c == "'") or (mode == '"' and c == '"') or (mode == "`" and c == "`"):
                mode = None
            res.append(c); i += 1
    return "".join(res)

def strip_js_strings(src):
    res = []; i = 0; n = len(src)
    while i < n:
        c = src[i]
        if c == "'":
            i += 1
            while i < n:
                if src[i] == "\\": i += 2; continue
                if src[i] == "'": break
                i += 1
            i += 1; res.append("''")
        elif c == '"':
            i += 1
            while i < n:
                if src[i] == "\\": i += 2; continue
                if src[i] == '"': break
                i += 1
            i += 1; res.append('""')
        elif c == "`":
            i += 1
            while i < n:
                if src[i] == "\\": i += 2; continue
                if src[i] == "`": break
                i += 1
            i += 1; res.append("``")
        else:
            res.append(c); i += 1
    return "".join(res)

def strip_css_comments(src):
    return re.sub(r"/\*.*?\*/", " ", src, flags=re.S)

def find_with_lines(code, pattern):
    hits = []
    for m in re.finditer(pattern, code):
        ln = code.count("\n", 0, m.start()) + 1
        ctx = code[max(0, m.start()-40):m.end()+40].replace("\n", "\\n")
        hits.append("L%d: ...%s..." % (ln, ctx))
    return hits

# ---------- F32 static JS checks ----------
js_path = os.path.join(ROOT, "assets/xt-profile.js")
js = open(js_path, "rb").read().decode("utf-8", errors="replace")
code = strip_js_strings(strip_js_comments(js))

w("")
w("==== F32 static JS checks (comments+strings stripped) ====")
for fn in ["prompt", "alert", "confirm"]:
    hits = find_with_lines(code, r"(?<![\w.$])" + fn + r"\s*\(")
    w("[F32] %s( calls: count=%d %s" % (fn, len(hits), "PASS" if not hits else "FAIL " + " | ".join(hits[:5])))

pat_map = [
    (r"\?\.", "optional-chaining ?."),
    (r"\?\?", "nullish ??"),
    (r"\.\.\.", "spread/rest ..."),
    (r"\.\s*replaceAll\s*\(", ".replaceAll("),
    (r"Object\s*\.\s*fromEntries\s*\(", "Object.fromEntries("),
    (r"\.\s*at\s*\(", ".at("),
    (r"\(\?<[=!]", "lookbehind regex"),
    (r"(?<![\w*])\*\*(?![*/])", "exponent **"),
    (r"catch\s*\{", "optional catch binding"),
    (r"=>", "arrow fn (info)"),
    (r"\basync\s+function\b", "async fn (info)"),
    (r"\blet\s|\bconst\s", "let/const (info)"),
]
for pat, name in pat_map:
    hits = find_with_lines(code, pat)
    judged = "(info)" in name
    tag = "" if judged else ("PASS" if not hits else "FAIL")
    w("[F32] %-26s count=%d %s %s" % (name, len(hits), tag, " | ".join(hits[:3])))

# ---------- CSS checks (A5/A6/B7 + leftovers E29) ----------
css_path = os.path.join(ROOT, "assets/xt-profile.css")
css = strip_css_comments(open(css_path, "rb").read().decode("utf-8", errors="replace"))

def rules_containing(cls):
    found = []
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        sel_text = m.group(1)
        sels = [s.strip() for s in sel_text.split(",")]
        for s in sels:
            if re.search(r"(^|[\s>+~(])" + re.escape(cls) + r"(?![\w-])", s):
                found.append((s, m.group(2)))
                break
    return found

w("")
w("==== CSS checks (comments stripped; all rules mentioning the class) ====")

def get_prop(body, prop):
    m = re.search(prop + r"\s*:\s*([^;]+);", body)
    return m.group(1).strip() if m else None

hole_rules = rules_containing(".xtp-crop-hole")
w("[CSS] rules containing .xtp-crop-hole: %d" % len(hole_rules))
any_br = False
for sel, body in hole_rules:
    br = get_prop(body, "border-radius")
    bs = get_prop(body, "box-shadow")
    w("[CSS]   selector=%s" % sel)
    w("[CSS]     border-radius=%s" % br)
    w("[CSS]     box-shadow=%s" % bs)
    if br: any_br = True
ok_shadow = False
for sel, body in hole_rules:
    bs = get_prop(body, "box-shadow")
    if bs and "9999px" in bs and re.search(r"rgba\(0\s*,\s*0\s*,\s*0\s*,\s*0?\.62\)", bs):
        ok_shadow = True
w("[CSS] A5a .xtp-crop-hole 无 border-radius: %s" % ("PASS" if not any_br else "FAIL"))
w("[CSS] A5b .xtp-crop-hole box-shadow 9999px rgba(0,0,0,.62): %s" % ("PASS" if ok_shadow else "FAIL"))

for cls in [".xtp-hero-avatar", ".xtp-avatar-sm"]:
    rls = rules_containing(cls)
    w("[CSS] rules containing %s: %d" % (cls, len(rls)))
    brs = []
    for sel, body in rls:
        br = get_prop(body, "border-radius")
        w("[CSS]   selector=%s border-radius=%s" % (sel, br))
        if br is not None: brs.append((sel, br))
    ok12 = all(v == "12px" for (s, v) in brs) and len(brs) >= 1
    w("[CSS] A6 %s border-radius 均=12px: %s (%s)" % (cls, "PASS" if ok12 else "FAIL", brs))

frame_rules = rules_containing(".xtp-crop-frame")
w("[CSS] rules containing .xtp-crop-frame: %d" % len(frame_rules))
frame_ok_grad = False
for sel, body in frame_rules:
    bgi = get_prop(body, "background-image")
    w("[CSS]   selector=%s" % sel)
    w("[CSS]     border=%s" % get_prop(body, "border"))
    w("[CSS]     background-image=%s" % (bgi or "ABSENT"))
    if bgi:
        ngrad = bgi.count("linear-gradient")
        has33 = "33.333%" in bgi
        has66 = "66.666%" in bgi
        hascol = "rgba(255, 255, 255, 0.28)" in bgi
        w("[CSS]     B7 gradients=%d(=4:%s) 33.333%%:%s 66.666%%:%s color:%s" % (ngrad, ngrad == 4, has33, has66, hascol))
        if ngrad == 4 and has33 and has66 and hascol:
            frame_ok_grad = True
w("[CSS] B7 .xtp-crop-frame 九宫格: %s" % ("PASS" if frame_ok_grad else "FAIL"))

for cls in [".xtp-crop-zoom", ".xtp-crop-bottom", ".xtp-crop-slider", ".xtp-zoom"]:
    rls = rules_containing(cls)
    raw = css.count(cls)
    w("[CSS] E29 leftover %s: rules=%d (stripped) occurrences=%d (raw incl comments) -> %s" % (cls, len(rls), raw, "PASS(无残留)" if not rls else "FAIL"))

raw_css = open(css_path, "rb").read().decode("utf-8", errors="replace")
w("[CSS] raw '.xtp-crop-frame' occurrences=%d ; comment-stripped=%d" % (raw_css.count(".xtp-crop-frame"), css.count(".xtp-crop-frame")))
w("[CSS] raw '.xtp-crop-hole' occurrences=%d ; comment-stripped=%d" % (raw_css.count(".xtp-crop-hole"), css.count(".xtp-crop-hole")))

# topbar / sheet rules presence (R97)
for cls in [".xtp-crop-topbar", ".xtp-crop-btn", ".xtp-sheet", ".xtp-sheet-item", ".xtp-sheet-cancel"]:
    rls = rules_containing(cls)
    w("[CSS] presence %s: %s" % (cls, "YES(%d rules)" % len(rls) if rls else "NO"))

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("written", OUT)
