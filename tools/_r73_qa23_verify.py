# -*- coding: utf-8 -*-
"""
_r73_qa23_verify.py  --  QA verifier for "moments (dynamic space)" global entry.
NOTE: this source is ASCII-only on purpose. All Chinese (page names, root dir)
are loaded from _r73_qa23_pages.json with explicit encoding='utf-8', and ROOT is
derived from __file__, because Chinese string literals in this Python build are
decoded as GBK despite the UTF-8 file/cookie.
Usage:
  python _r73_qa23_verify.py            # formal compare (reads baseline.json)
  python _r73_qa23_verify.py --baseline # record baseline snapshot + report
Outputs:
  tools/_r73_qa23_baseline.json  (route table / dynamic-page snapshot)
  tools/_r73_qa23_baseline.txt   (baseline report, written only with --baseline)
  tools/_r73_qa23_result.txt     (formal report, written without --baseline)
"""
import os, sys, re, json, subprocess, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TOOLS = HERE
APPJS = os.path.join(ROOT, "assets", "app.js")
NODE = r"C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
C_JS = os.path.join(TOOLS, "_r73_qa23_jsdom_check.js")
BASELINE_JSON = os.path.join(TOOLS, "_r73_qa23_baseline.json")
PAGES_JSON = os.path.join(TOOLS, "_r73_qa23_pages.json")

with open(PAGES_JSON, "r", encoding="utf-8") as _f:
    _cfg = json.load(_f)
PAGES_32 = _cfg["pages_32"]
DYNAMIC_4 = _cfg["dynamic_4"]
AI_NO_GRID = _cfg["ai_no_grid"]

REQUIRED_PF_KEYS = ["home", "cet", "speaking-demo", "exam", "exam-demo", "comm",
    "roleplay-demo", "interview", "interview-demo", "files", "ppt", "blog",
    "exam-center", "shenlun", "wrong-book", "cet-vocab", "etiquette", "iv-questions",
    "ppt-layouts", "ppt-cases", "comm-scenes", "comm-quotes", "profile", "settings"]

results = []

def add(rid, expect, actual, status, evidence=""):
    results.append((rid, expect, actual, status, evidence))

def read_bytes(p):
    with open(p, "rb") as f:
        return f.read()

def bom_and_text(raw):
    if raw[:3] == b"\xef\xbb\xbf":
        return True, raw[3:].decode("utf-8")
    return False, raw.decode("utf-8")

def crlf(raw):
    return raw.count(b"\r"), raw.count(b"\n")

def div_find_end(s, start):
    i = s.find("<div", start)
    if i < 0:
        return -1
    depth = 0
    j = i
    n = len(s)
    while j < n:
        nd = s.find("<div", j)
        ed = s.find("</div", j)
        if ed < 0 and nd < 0:
            return -1
        if nd >= 0 and (ed < 0 or nd < ed):
            depth += 1
            j = nd + 4
        else:
            depth -= 1
            j = ed + 6
            if depth == 0:
                return j
    return -1

def extract_block(src, decl):
    i = src.find(decl)
    if i < 0:
        return None
    ob = src.find("{", i)
    if ob < 0:
        return None
    depth = 0
    j = ob
    while j < len(src):
        c = src[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return src[ob:j + 1]
        j += 1
    return None

def main():
    is_baseline = "--baseline" in sys.argv
    lines = []
    def log(s=""):
        lines.append(s)

    log("=" * 70)
    log("moments entry verifier  %s  %s" % (
        "BASELINE" if is_baseline else "FORMAL",
        datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    log("=" * 70)

    # ---- B: line endings / encoding ----
    log("\n--- B. line endings & encoding ---")
    changed_files = [APPJS] + [os.path.join(ROOT, p) for p in PAGES_32]
    bom_snapshot, crlf_snapshot = {}, {}
    for fp in changed_files:
        raw = read_bytes(fp)
        bom, text = bom_and_text(raw)
        cr, lf = crlf(raw)
        bom_snapshot[os.path.basename(fp)] = bom
        crlf_snapshot[os.path.basename(fp)] = [cr, lf]
        pure = (cr == lf and cr > 0)
        bad = ("\ufffd" in text) or ("ï¿½" in text)
        add("B1:" + os.path.basename(fp), "pure CRLF (cr==lf>0)", "cr=%d lf=%d" % (cr, lf),
            "PASS" if pure else "FAIL", "first80=%r" % raw[:80])
        add("B2:" + os.path.basename(fp), "UTF-8 decodable / BOM consistent", "bom=%s" % bom,
            "PASS" if (not bad) else "FAIL", "badchar=%s" % bad)
        add("B3:" + os.path.basename(fp), "no mojibake chars", "bad=%s" % bad,
            "PASS" if (not bad) else "FAIL")

    # ---- A1: app.js static structure ----
    log("\n--- A1. app.js static structure ---")
    _, js_text = bom_and_text(read_bytes(APPJS))
    moments_cnt = js_text.count("moments")
    pt_block = extract_block(js_text, "const pageTitles = {")
    pf_block = extract_block(js_text, "const PAGE_FILES = {")
    pt_ok = bool(pt_block) and ("moments: '动态空间'" in pt_block)
    pf_ok = bool(pf_block) and ("moments: '动态.html'" in pf_block)
    add("A1:moments_count", "2", str(moments_cnt), "PASS" if moments_cnt == 2 else "FAIL",
        "occurrences=%d" % moments_cnt)
    add("A1:pageTitles_has_moments", "contains moments: '动态空间'", str(pt_ok),
        "PASS" if pt_ok else "FAIL", (pt_block[:120] if pt_block else "block not found"))
    add("A1:PAGE_FILES_has_moments", "contains moments: '动态.html'", str(pf_ok),
        "PASS" if pf_ok else "FAIL", (pf_block[:120] if pf_block else "block not found"))

    # ---- A2/A3/A4: per page ----
    log("\n--- A2/A3/A4. 32 pages sidebar / position / mobile panel ---")
    page_snap = {}
    for p in PAGES_32:
        fp = os.path.join(ROOT, p)
        _, html = bom_and_text(read_bytes(fp))
        page_snap[p] = {"mtime": os.path.getmtime(fp)}
        dp_moments = html.count('data-page="moments"')
        dyn_cnt = html.count("动态空间")
        exp_dyn = 1 if p == AI_NO_GRID else 2
        add("A2:%s[data-page=moments]" % p, "1", str(dp_moments), "PASS" if dp_moments == 1 else "FAIL")
        add("A2:%s[动态空间]" % p, str(exp_dyn), str(dyn_cnt), "PASS" if dyn_cnt == exp_dyn else "FAIL")

        blog_tag = '<div class="nav-item" data-page="blog"'
        bi = html.find(blog_tag)
        mi = html.find('<div class="nav-item" data-page="moments"')
        if bi < 0 or mi < 0:
            add("A3:%s[position]" % p, "after blog / before next nav / no boundary cross",
                "blog@%d moments@%d" % (bi, mi), "FAIL", "blog or moments missing")
            continue
        blog_end = div_find_end(html, bi)
        ns = html.find('<div class="nav-section"', blog_end)
        ni = html.find('<div class="nav-item"', blog_end)
        cand = [x for x in [ns, ni] if x >= 0]
        next_nav = min(cand) if cand else len(html)
        more_panel = html.find('id="morePanel"')
        boundary = min(x for x in [html.find("</aside>"), html.find("</nav>"),
                                   html.find("</body>"), more_panel] if x >= 0)
        ok_pos = (blog_end <= mi < next_nav) and (mi < boundary)
        ctx = ""
        if not ok_pos:
            lo = max(0, mi - 150)
            ctx = "ctx300: " + html[lo:lo + 300].replace("\n", " ")
        add("A3:%s[position]" % p, "blog_end<=moments<nextNav & no boundary cross",
            "blog_end=%d moments=%d nextNav=%d boundary=%d" % (blog_end, mi, next_nav, boundary),
            "PASS" if ok_pos else "FAIL", ctx)

        if p != AI_NO_GRID:
            gstart = html.find('<div class="bottom-more-grid"')
            if gstart < 0:
                add("A4:%s[grid]" % p, "grid contains 动态空间=1", "no grid", "FAIL")
            else:
                gend = div_find_end(html, gstart)
                gseg = html[gstart:gend] if gend > 0 else ""
                gcnt = gseg.count("动态空间")
                inside = (gseg.find("动态空间") >= 0)
                add("A4:%s[grid]" % p, "1 (inside grid)", str(gcnt),
                    "PASS" if (gcnt == 1 and inside) else "FAIL", "grid_len=%d" % len(gseg))
        if p == "更多.html":
            mc = html.find('<div class="morepage-card morepage-list-item"')
            if mc < 0:
                add("A4:%s[morecard]" % p, "first card contains 动态空间", "no card", "FAIL")
            else:
                card_contains = 0
                for cm in re.finditer(r'<div class="morepage-card morepage-list-item"', html):
                    ce = div_find_end(html, cm.start())
                    if ce > 0 and "动态空间" in html[cm.start():ce]:
                        card_contains += 1
                first_seg = html[mc:div_find_end(html, mc)] if div_find_end(html, mc) > 0 else ""
                has = "动态空间" in first_seg
                add("A4:%s[morecard]" % p, "first card has it & total 1",
                    "first=%s cards_with= %d" % (has, card_contains),
                    "PASS" if (has and card_contains == 1) else "FAIL")

    # ---- A5: dynamic pages must not change ----
    log("\n--- A5. 4 dynamic pages must NOT change ---")
    dyn_snap = {}
    for p in DYNAMIC_4:
        fp = os.path.join(ROOT, p)
        _, html = bom_and_text(read_bytes(fp))
        dp = html.count('data-page="moments"')
        dy = html.count("动态空间")
        mt = os.path.getmtime(fp)
        dyn_snap[p] = {"dp": dp, "dy": dy, "mtime": mt}
        add("A5:%s[data-page=moments]" % p, "=baseline", str(dp), "BASELINE" if is_baseline else "REC")
        add("A5:%s[动态空间]" % p, "=baseline", str(dy), "BASELINE" if is_baseline else "REC")
        add("A5:%s[mtime]" % p, "=baseline", datetime.datetime.fromtimestamp(mt).strftime("%Y-%m-%d %H:%M:%S"),
            "BASELINE" if is_baseline else "REC")

    # ---- D1: ES2017 compat on moments lines +-5 ----
    log("\n--- D1. ES2017 compat (new lines) ---")
    js_lines = js_text.split("\n")
    forbidden = [r"\?\.", r"\?\?", r"Object\.fromEntries", r"\.at\(", r"catch\s*\{"]
    mom_lines = [i for i, ln in enumerate(js_lines) if "moments" in ln]
    if not mom_lines:
        add("D1:moments_lines", "no ?./??/fromEntries/.at(/catch{", "no moments lines (baseline)", "PASS/NA")
    else:
        bad_hits = []
        for i in mom_lines:
            for j in range(max(0, i - 5), min(len(js_lines), i + 6)):
                for pat in forbidden:
                    if re.search(pat, js_lines[j]):
                        bad_hits.append("L%d:%s" % (j + 1, js_lines[j].strip()[:80]))
        add("D1:moments_lines", "no ES2017 new syntax", "hits:%s" % (bad_hits if bad_hits else "none"),
            "PASS" if not bad_hits else "FAIL")

    # ---- D2: node --check ----
    log("\n--- D2. node --check assets/app.js ---")
    try:
        r = subprocess.run([NODE, "--check", APPJS], capture_output=True, text=True, timeout=120)
        add("D2:node_check", "exit 0", "exit %d" % r.returncode, "PASS" if r.returncode == 0 else "FAIL",
            (r.stderr[:200] if r.stderr else ""))
    except Exception as e:
        add("D2:node_check", "exit 0", "EXC %s" % e, "FAIL")

    # ---- E1/E2: regression guard (route table snapshot) ----
    log("\n--- E1/E2. regression guard (route table snapshot) ---")
    pf_vals = {}
    if pf_block:
        for k in REQUIRED_PF_KEYS:
            m = re.search(r"['\"]?%s['\"]?\s*:\s*['\"]([^'\"]*)['\"]" % re.escape(k), pf_block)
            if m:
                pf_vals[k] = m.group(1)
    pt_keys = re.findall(r"['\"]?([a-zA-Z0-9\-]+)['\"]?\s*:", pt_block) if pt_block else []
    snapshot = {
        "pf_vals": pf_vals, "pt_keys": pt_keys,
        "bom": bom_snapshot, "crlf": crlf_snapshot,
        "dyn": dyn_snap, "page_mtime": {p: page_snap[p]["mtime"] for p in PAGES_32},
        "appjs_mtime": os.path.getmtime(APPJS),
    }
    if is_baseline or not os.path.exists(BASELINE_JSON):
        with open(BASELINE_JSON, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)
        add("E1:required_keys", "all present", "missing:%s" % [k for k in REQUIRED_PF_KEYS if k not in pf_vals], "BASELINE")
        add("E2:pageTitles_keys", "all present", "keys=%d" % len(pt_keys), "BASELINE")
    else:
        with open(BASELINE_JSON, "r", encoding="utf-8") as f:
            base = json.load(f)
        miss = [k for k in REQUIRED_PF_KEYS if base["pf_vals"].get(k) != pf_vals.get(k)]
        add("E1:required_keys", "values unchanged", "missing/changed:%s" % miss, "PASS" if not miss else "FAIL")
        miss_pt = [k for k in base["pt_keys"] if k not in pt_keys]
        add("E2:pageTitles_keys", "original keys kept", "lost:%s" % miss_pt, "PASS" if not miss_pt else "FAIL")
        for p in DYNAMIC_4:
            b = base["dyn"].get(p, {})
            cur = dyn_snap[p]
            changed = (b.get("dp") != cur["dp"]) or (b.get("dy") != cur["dy"]) or (abs(b.get("mtime", 0) - cur["mtime"]) > 1)
            add("A5:%s[compare]" % p, "unchanged", "dp%s->%s dy%s->%s" % (b.get("dp"), cur["dp"], b.get("dy"), cur["dy"]),
                "PASS" if not changed else "FAIL")

    # ---- C: jsdom behavior ----
    log("\n--- C. jsdom behavior ---")
    if os.path.exists(C_JS):
        try:
            r = subprocess.run([NODE, C_JS], capture_output=True, text=True, timeout=120)
            out_line = ""
            for ln in r.stdout.splitlines():
                ln = ln.strip()
                if ln.startswith("{"):
                    out_line = ln
            if out_line:
                cj = json.loads(out_line)
                c1 = cj.get("steps", {}).get("c1", {})
                c3 = cj.get("steps", {}).get("c3", {})
                c4 = cj.get("steps", {}).get("c4", {})
                add("C1:sidebar_node", "exists/visible/contains 动态空间",
                    "exists=%s text=%s disp=%s" % (c1.get("exists"), c1.get("text"), c1.get("display")),
                    "PASS" if c1.get("pass") else "FAIL")
                add("C3:navigateTo_moments", "no warn & ->动态.html",
                    "noWarn=%s target=%s threw=%s" % (c3.get("noWarn"), c3.get("targetViaTable"), c3.get("threw")),
                    "PASS" if c3.get("pass") else "FAIL")
                add("C4:unknown_page_warn", "still hits warn branch", "warned=%s" % c4.get("warned"),
                    "PASS" if c4.get("pass") else "FAIL")
            else:
                add("C:jsdom", "execute", "no JSON out: %s" % r.stderr[:200], "FAIL")
        except Exception as e:
            add("C:jsdom", "execute", "EXC %s" % e, "FAIL")
    else:
        log("C skipped: jsdom check script missing")

    # ---- summary ----
    log("\n" + "=" * 70)
    log("SUMMARY")
    log("=" * 70)
    npass = sum(1 for x in results if x[3] == "PASS")
    nfail = sum(1 for x in results if x[3] == "FAIL")
    nbase = sum(1 for x in results if x[3] in ("BASELINE", "REC", "PASS/NA"))
    log("PASS=%d  FAIL=%d  BASELINE/REC/NA=%d  total=%d" % (npass, nfail, nbase, len(results)))
    log("-" * 70)
    for rid, exp, act, st, ev in results:
        if st == "FAIL" or st.startswith("BASELINE") or st == "REC" or st == "PASS/NA":
            log("[%s] %s | exp=%s act=%s %s" % (st, rid, exp, act, ("| " + ev if ev else "")))
    log("-" * 70)
    log("(full detail in result file)")

    report = "\n".join(lines)
    outp = os.path.join(TOOLS, "_r73_qa23_baseline.txt" if is_baseline else "_r73_qa23_result.txt")
    with open(outp, "w", encoding="utf-8") as f:
        f.write(report)
    with open(outp + ".full", "w", encoding="utf-8") as f:
        for rid, exp, act, st, ev in results:
            f.write("[%s] %s | exp=%s act=%s %s\n" % (st, rid, exp, act, ("| " + ev if ev else "")))
    log("\nreport written: %s" % outp)

if __name__ == "__main__":
    main()
