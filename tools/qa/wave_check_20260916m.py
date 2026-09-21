# -*- coding: utf-8 -*-
"""
wave_check_20260916m.py  —— 星途「一波多线」统一验收脚本（Python 版，主版本）
================================================================================
【为什么要有这个脚本】
  本波 13 条工程线并行施工，每条线独占不同文件。交付后需要一个"一次跑完、
  逐文件出 PASS/FAIL 表"的总闸，避免每条线自己各写一套、口径不一致。

【覆盖的检查项】
  1. 老内核解析级体检  : 调 tools/qa/escheck_es2017.js（acorn ES2017 解析），期望 DONE 0
  2. HTML 结构配对     : <!-- / -->、div 开闭、script 开闭、head/body 各 1、损坏特征正则
  3. 禁用语法 Grep     : ?. ?? .replaceAll( Object.fromEntries .at( 顶层await
                         (?<= (?<! {...obj} 对象剩余 ** catch {}
  4. 原生弹窗扫描      : alert( / confirm( / prompt( （排除 x.alert( / xt-alert 等自定义前缀）
  5. 版本戳现状        : ?v= 分布（本波中段看到 20260916L 属正常，只报 INFO 不报 FAIL）
  6. 换行符校验        : CRLF / 裸 LF 计数，按白名单判定

【用法】
  "C:/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python.exe" \
      tools/qa/wave_check_20260916m.py "更多.html,工具.html,assets/app.js"

  不带参数 = 全站默认扫描（全部根 HTML + assets/*.js，自动跳过 *.bak/backup）
  可选参数：
    --out <路径>          指定结果文件（默认 tools/qa/_wave_check_out.txt）
    --no-escheck          跳过第 1 项（快扫时用）
    --expect-stamp XXXX   期望的版本戳（给了才会把版本戳不符判 FAIL，默认只 INFO）
    --quiet               结果文件里省略 PASS 行

【注意】
  结果写 UTF-8 文件后用 Read 看；控制台只输出 ASCII（bash 环境 GBK，print 中文会崩）。
================================================================================
"""
import os
import re
import io
import sys
import subprocess

ROOT = r"D:\下载的文件\学习工作台"
QA_DIR = os.path.join(ROOT, "tools", "qa")
DEFAULT_OUT = os.path.join(QA_DIR, "_wave_check_out.txt")

NODE_CANDIDATES = [
    r"C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe",
    "node",
]

# ---------------------------------------------------------------- 换行符白名单
# 键用相对路径（正斜杠）。命中才判定 PASS/FAIL，未命中只报 INFO。
EOL_EXPECT = {
    "assets/app.js": "CRLF",
    "assets/api.js": "CRLF",
    "assets/common.css": "CRLF",
    "assets/ai-service.js": "LF",
    "assets/ai-page.js": "LF",
    "assets/ppt-works.js": "LF",
}

# ---------------------------------------------------------------- 禁用语法规则
# (规则ID, 正则, 人话说明, raw)
#   raw=True  -> 在「未剥离注释/字符串/正则」的原文上跑
#   raw=False -> 在剥离后的代码骨架上跑（避免把 "你要??吗"、/a\?\.b/ 误判成违规）
BANNED_RULES = [
    ("optional-chain", r"\?\.", "可选链 ?.", False),
    ("optional-chain-bracket", r"\?\[", "可选链 ?[", False),
    ("optional-call", r"\?\(", "可选调用 ?(", False),
    ("nullish", r"\?\?", "空值合并 ??", False),
    ("replaceAll", r"\.replaceAll\s*\(", "String.prototype.replaceAll", False),
    ("fromEntries", r"Object\s*\.\s*fromEntries", "Object.fromEntries", False),
    ("array-at", r"\.at\s*\(", "Array.prototype.at", False),
    # (?<= 只可能出现在正则字面量或字符串里；若先被噪声剥离器抹掉就永远抓不到，
    # 所以这条必须在原文上跑。
    ("lookbehind", r"\(\?<[=!]", "正则后行断言 (?<= / (?<!", True),
    ("object-spread", r"\{\s*\.\.\.", "对象展开 {...obj}", False),
    ("object-rest", r",\s*\.\.\.\s*[A-Za-z_$][\w$]*\s*\}", "对象剩余解构 ...rest}", False),
    ("exponent", r"(?<![/*])\*\*(?!\/)", "指数运算符 **", False),
    ("optional-catch", r"catch\s*\{", "可选 catch 绑定 catch {", False),
]
TOP_AWAIT_RE = re.compile(r"^await\s")

REGEX_PREV_OK = set("([{}=:;,!&|?+-*%~^<>")
REGEX_PREV_KW = set(
    "return typeof case in of new delete void instanceof do else yield await".split()
)


# ================================================================ JS 噪声剥离
def strip_js_noise(code):
    """把注释 / 字符串 / 模板串 / 正则字面量替换成空格，保留代码骨架与行号。
    目的：避免把 "你要??吗" 这种中文字符串里的 ? ? 误判成空值合并。"""
    out = []
    i = 0
    n = len(code)
    prev_sig = ""      # 上一个有效（非空白）字符
    last_word = ""     # 紧跟在前的标识符

    def regex_allowed():
        if prev_sig == "":
            return True
        if prev_sig in REGEX_PREV_OK:
            return True
        if last_word in REGEX_PREV_KW:
            return True
        return False

    while i < n:
        c = code[i]
        nxt = code[i + 1] if i + 1 < n else ""

        # 行注释
        if c == "/" and nxt == "/":
            j = code.find("\n", i)
            if j < 0:
                j = n
            out.append(" ")
            i = j
            continue

        # 块注释
        if c == "/" and nxt == "*":
            j = code.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(" ")
            i = j
            continue

        # 普通字符串 / 模板串
        if c == '"' or c == "'" or c == "`":
            q = c
            i += 1
            while i < n:
                ch = code[i]
                if ch == "\\":
                    out.append(" ")
                    i += 2
                    continue
                if q != "`" and ch == "\n":
                    break
                if ch == q:
                    i += 1
                    break
                # 模板串里的 ${ ... } 是真实代码，保留
                if q == "`" and ch == "$" and i + 1 < n and code[i + 1] == "{":
                    out.append(" ")
                    i += 2
                    depth = 1
                    while i < n and depth > 0:
                        c2 = code[i]
                        if c2 == "{":
                            depth += 1
                        elif c2 == "}":
                            depth -= 1
                            if depth == 0:
                                i += 1
                                out.append(" ")
                                break
                        out.append(c2)
                        i += 1
                    continue
                out.append(" ")
                i += 1
            out.append(" ")
            continue

        # 正则字面量
        if c == "/" and regex_allowed():
            j = i + 1
            inclass = False
            closed = False
            while j < n:
                ch = code[j]
                if ch == "\\":
                    j += 2
                    continue
                if ch == "[":
                    inclass = True
                elif ch == "]":
                    inclass = False
                elif ch == "/" and not inclass:
                    j += 1
                    while j < n and code[j].isalpha():
                        j += 1
                    closed = True
                    break
                elif ch == "\n":
                    break
                j += 1
            if closed:
                out.append(" ")
                i = j
                continue

        out.append(c)
        if not c.isspace():
            prev_sig = c
            if c.isalnum() or c == "_" or c == "$":
                last_word += c
            else:
                last_word = ""
        i += 1

    return "".join(out)


# ================================================================ 结果收集
class Report(object):
    def __init__(self):
        self.rows = []   # (file, item, status, detail)

    def add(self, f, item, status, detail=""):
        self.rows.append((f, item, status, str(detail)))

    @property
    def fails(self):
        return [r for r in self.rows if r[2] == "FAIL"]

    @property
    def warns(self):
        return [r for r in self.rows if r[2] == "WARN"]


def line_of(text, idx):
    return text.count("\n", 0, idx) + 1


def snippet(text, idx, width=90, line_offset=0):
    ln = line_of(text, idx)
    lines = text.split("\n")
    return "L%d: %s" % (ln + line_offset,
                        (lines[ln - 1] if ln - 1 < len(lines) else "").strip()[:width])


# ================================================================ 检查 1: escheck
def run_escheck(rep):
    node = None
    for cand in NODE_CANDIDATES:
        try:
            p = subprocess.run([cand, "-e", "console.log(1)"],
                               capture_output=True, timeout=60)
            if p.returncode == 0:
                node = cand
                break
        except Exception:
            continue
    if not node:
        rep.add("(全局)", "es2017解析总闸", "FAIL", "找不到可用 node，跳过（请检查 NODE_CANDIDATES）")
        return
    script = os.path.join(QA_DIR, "escheck_es2017.js")
    if not os.path.exists(script):
        rep.add("(全局)", "es2017解析总闸", "FAIL", "缺少 tools/qa/escheck_es2017.js")
        return
    try:
        p = subprocess.run([node, script], capture_output=True, timeout=300, cwd=ROOT)
    except Exception as e:
        rep.add("(全局)", "es2017解析总闸", "FAIL", "运行异常: %s" % e)
        return

    stdout = (p.stdout or b"").decode("utf-8", "replace").strip()
    stderr = (p.stderr or b"").decode("utf-8", "replace").strip()
    m = re.search(r"DONE\s+(\d+)", stdout)
    if not m:
        rep.add("(全局)", "es2017解析总闸", "FAIL",
                "未拿到 DONE 计数。stdout=%r stderr=%r" % (stdout[:200], stderr[:200]))
        return
    cnt = int(m.group(1))
    if cnt == 0:
        rep.add("(全局)", "es2017解析总闸", "PASS",
                "DONE 0 —— 全部 assets/*.js 与根 HTML 内联脚本均可被 ES2017(acorn) 解析")
    else:
        detail = "DONE %d —— 有脚本老内核解析失败，明细见 C:\\Users\\ATM\\_escheck_out.txt" % cnt
        try:
            with io.open(r"C:\Users\ATM\_escheck_out.txt", "r", encoding="utf-8",
                         errors="replace") as fh:
                detail += "\n" + "\n".join(fh.read().split("\n")[:25])
        except Exception:
            pass
        rep.add("(全局)", "es2017解析总闸", "FAIL", detail)


# ================================================================ 检查 2: HTML 结构
def strip_blocks(html):
    """剔除 <script>...</script> 与 <style>...</style> 内容，保留长度以便定位。"""
    s = re.sub(r"<script\b[^>]*>[\s\S]*?</script\s*>",
               lambda m: " " * len(m.group(0)), html, flags=re.I)
    s = re.sub(r"<style\b[^>]*>[\s\S]*?</style\s*>",
               lambda m: " " * len(m.group(0)), s, flags=re.I)
    return s


def check_html_structure(rep, rel, html):
    a = len(re.findall(r"<!--", html))
    b = len(re.findall(r"-->", html))
    rep.add(rel, "注释配对 <!--/-->", "PASS" if a == b else "FAIL", "%d / %d" % (a, b))

    core = strip_blocks(html)
    o = len(re.findall(r"<div(?=[\s>/])", core))
    c = len(re.findall(r"</div\s*>", core))
    rep.add(rel, "div 开闭配对", "PASS" if o == c else "FAIL", "开 %d / 闭 %d" % (o, c))

    so = len(re.findall(r"<script(?=[\s>/])", html))
    sc = len(re.findall(r"</script\s*>", html))
    rep.add(rel, "script 开闭配对", "PASS" if so == sc else "FAIL", "开 %d / 闭 %d" % (so, sc))

    pairs = [("<head>", r"<head\s*>", 1), ("</head>", r"</head\s*>", 1),
             ("<body", r"<body(?=[\s>])", 1), ("</body>", r"</body\s*>", 1)]
    for name, pat, exp in pairs:
        got = len(re.findall(pat, html, flags=re.I))
        rep.add(rel, "%s 数量=%d" % (name, exp), "PASS" if got == exp else "FAIL",
                "实际 %d" % got)

    bad = re.findall(r"\.js\?v=[\w\.]*\"[^>\s]", html)
    rep.add(rel, "版本戳损坏特征", "PASS" if not bad else "FAIL",
            "命中 %d 处" % len(bad))


# ================================================================ 检查 3: 禁用语法
def check_banned(rep, rel, code, where, line_offset=0):
    stripped = strip_js_noise(code)
    total = 0
    msgs = []
    for rid, pat, desc, is_raw in BANNED_RULES:
        hay = code if is_raw else stripped
        rx = re.compile(pat)
        hits = []
        for m in rx.finditer(hay):
            hits.append(snippet(hay, m.start(), 90, line_offset))
        if hits:
            total += len(hits)
            msgs.append("  [%s] %s x%d  例: %s" % (rid, desc, len(hits), hits[0]))
    # 顶层 await（行首，不带缩进）
    for i, ln in enumerate(stripped.split("\n")):
        if TOP_AWAIT_RE.match(ln):
            total += 1
            msgs.append("  [top-await] 顶层 await x1  例: L%d: %s"
                        % (i + 1 + line_offset, ln.strip()[:90]))
    if total:
        rep.add(rel, "禁用语法<%s>" % where, "FAIL",
                "命中 %d 处\n%s" % (total, "\n".join(msgs[:12])))
    else:
        rep.add(rel, "禁用语法<%s>" % where, "PASS", "0 命中")


# ================================================================ 检查 4: 原生弹窗
POPUP_RX = re.compile(r"(alert|confirm|prompt)\s*\(")
SAFE_ROOTS = set(["window", "globalThis", "self", "top", "parent", "document"])


def _owner_chain(text, start):
    """向左取 `xxx.yyy.` 链的根名；返回 (root, 是否有点号前缀)"""
    j = start - 1
    while j >= 0 and text[j] in " \t":
        j -= 1
    if j < 0 or text[j] != ".":
        return None, False
    j -= 1
    end = j + 1
    while j >= 0 and (text[j].isalnum() or text[j] in "_$"):
        j -= 1
    return text[j + 1:end], True


def check_popup(rep, rel, text, where):
    hits = []
    for m in POPUP_RX.finditer(text):
        before = m.start() - 1
        if before >= 0:
            ch = text[before]
            if ch.isalnum() or ch in "_$":      # showAlert( / myprompt(  -> 自定义
                continue
            if ch == "-":                        # xt-alert(  -> 自定义
                continue
            if ch == ".":
                root, _ = _owner_chain(text, m.start())
                if root and root.lower() not in SAFE_ROOTS:
                    continue                     # xtToast.alert( 之类合规
                hits.append("window.%s(" % m.group(1))
                continue
        hits.append("%s(" % m.group(1))
    if hits:
        rep.add(rel, "原生弹窗<%s>" % where, "FAIL",
                "命中 %d 处: %s" % (len(hits), ", ".join(sorted(set(hits))[:8])))
    else:
        rep.add(rel, "原生弹窗<%s>" % where, "PASS", "0 命中")


# ================================================================ 检查 5: 版本戳
def check_stamp(rep, rel, text, expect):
    stamps = re.findall(r"\?v=([A-Za-z0-9_\.\-]+)", text)
    dist = {}
    for s in stamps:
        dist[s] = dist.get(s, 0) + 1
    if not stamps:
        rep.add(rel, "版本戳分布", "INFO", "本文件无 ?v= 引用")
        return
    txt = ", ".join("%s x%d" % (k, v) for k, v in sorted(dist.items()))
    if expect:
        ok = (set(dist.keys()) == set([expect]))
        rep.add(rel, "版本戳分布", "PASS" if ok else "FAIL",
                "%s（期望统一为 %s）" % (txt, expect))
    else:
        status = "INFO"
        note = ""
        if len(dist) > 1:
            note = " —— 本文件内戳不统一，波末 bump 时需一起改"
        rep.add(rel, "版本戳分布", status, txt + note)


# ================================================================ 检查 6: 换行符
def check_eol(rep, rel, raw):
    crlf = raw.count(b"\r\n")
    lf = raw.count(b"\n")
    bare = lf - crlf
    exp = EOL_EXPECT.get(rel.replace("\\", "/"))
    if exp is None and rel.endswith(".html") and ("\\" not in rel and "/" not in rel):
        exp = "CRLF"
    if exp is None:
        rep.add(rel, "换行符", "INFO", "CRLF=%d 裸LF=%d（白名单外，未判定）" % (crlf, bare))
        return
    if exp == "CRLF":
        ok = (bare == 0 and crlf > 0)
        rep.add(rel, "换行符", "PASS" if ok else "FAIL",
                "期望纯CRLF：CRLF=%d 裸LF=%d" % (crlf, bare))
    else:
        ok = (crlf == 0 and lf > 0)
        rep.add(rel, "换行符", "PASS" if ok else "FAIL",
                "期望纯LF：CRLF=%d 裸LF=%d" % (crlf, bare))


# ================================================================ 单文件主流程
INLINE_SCRIPT_RX = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script\s*>", re.I)


def check_file(rep, rel, expect_stamp):
    abspath = rel if os.path.isabs(rel) else os.path.join(ROOT, rel)
    if not os.path.exists(abspath):
        rep.add(rel, "文件存在性", "FAIL", "找不到 %s" % abspath)
        return
    with open(abspath, "rb") as fh:
        raw = fh.read()
    if len(raw) == 0:
        rep.add(rel, "文件存在性", "FAIL", "文件为 0 字节")
        return
    rep.add(rel, "文件存在性", "PASS", "%d bytes" % len(raw))
    text = raw.decode("utf-8", "replace")

    check_eol(rep, rel, raw)
    check_stamp(rep, rel, text, expect_stamp)

    if rel.lower().endswith(".html") or rel.lower().endswith(".htm"):
        check_html_structure(rep, rel, text)
        # 原生弹窗：先去掉 HTML 注释再扫全文（含 onclick="alert()" 这类内联写法）
        no_comment = re.sub(r"<!--[\s\S]*?-->", lambda m: " " * len(m.group(0)), text)
        check_popup(rep, rel, no_comment, "HTML全文")
        # 禁用语法：只扫内联脚本
        idx = 0
        for m in INLINE_SCRIPT_RX.finditer(text):
            idx += 1
            body = m.group(1)
            if len(body.strip()) < 20:
                continue
            check_banned(rep, rel, body, "内联#%d" % idx)
        if idx == 0:
            rep.add(rel, "禁用语法<内联>", "PASS", "无内联脚本")
    elif rel.lower().endswith(".js"):
        check_banned(rep, rel, text, "文件")
        check_popup(rep, rel, strip_js_noise(text), "文件")
    elif rel.lower().endswith(".css"):
        rep.add(rel, "禁用语法", "INFO", "CSS 不参与 JS 语法检查")
    else:
        rep.add(rel, "类型", "INFO", "未识别的扩展名，仅做换行符/版本戳检查")


# ================================================================ 输出
def render(rep, files, quiet):
    lines = []
    lines.append("=" * 96)
    lines.append("星途 一波多线统一验收报告   wave_check_20260916m.py")
    lines.append("工作区 ROOT = " + ROOT)
    lines.append("本次被测文件 = " + ", ".join(files))
    lines.append("=" * 96)
    lines.append("")
    lines.append("%-34s %-24s %-6s %s" % ("文件", "检查项", "结果", "详情"))
    lines.append("-" * 96)
    for f, item, status, detail in rep.rows:
        if quiet and status == "PASS":
            continue
        head = "%-34s %-24s %-6s %s" % (f, item, status, detail.split("\n")[0])
        lines.append(head)
        rest = detail.split("\n")[1:]
        for r in rest:
            lines.append(" " * 66 + r)
    lines.append("-" * 96)
    total = len(rep.rows)
    nf = len(rep.fails)
    nw = len(rep.warns)
    lines.append("检查项总数 = %d    FAIL = %d    WARN = %d    (INFO 不计入判定)" % (total, nf, nw))
    lines.append("")
    if nf:
        lines.append("---- FAIL 明细 ----")
        for f, item, status, detail in rep.fails:
            lines.append("[FAIL] %s :: %s" % (f, item))
            for r in detail.split("\n"):
                lines.append("      " + r)
        lines.append("")
    lines.append("===== 总结: " + ("ALL PASS =====" if nf == 0 else "%d 项 FAIL =====" % nf))
    return "\n".join(lines)


# ================================================================ 默认清单
def default_files():
    fs = []
    for f in sorted(os.listdir(ROOT)):
        if f.lower().endswith(".html") and not re.search(r"bak|backup", f, re.I):
            fs.append(f)
    ad = os.path.join(ROOT, "assets")
    if os.path.isdir(ad):
        for f in sorted(os.listdir(ad)):
            if f.lower().endswith(".js") and not re.search(r"bak|backup", f, re.I):
                fs.append("assets/" + f)
    cd = os.path.join(ROOT, "assets")
    if os.path.isdir(cd):
        for f in sorted(os.listdir(cd)):
            if f.lower().endswith(".css") and not re.search(r"bak|backup", f, re.I):
                fs.append("assets/" + f)
    return fs


def main(argv):
    files = []
    out_path = DEFAULT_OUT
    do_escheck = True
    expect_stamp = None
    quiet = False

    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--no-escheck":
            do_escheck = False
        elif a == "--quiet":
            quiet = True
        elif a == "--out":
            i += 1
            if i < len(argv):
                out_path = argv[i]
        elif a.startswith("--out="):
            out_path = a[len("--out="):]
        elif a.startswith("--expect-stamp="):
            expect_stamp = a[len("--expect-stamp="):]
        elif a.startswith("--"):
            pass
        else:
            files.extend([x.strip() for x in a.split(",") if x.strip()])
        i += 1

    if out_path is None:
        out_path = DEFAULT_OUT
    if not os.path.isabs(out_path):
        out_path = os.path.join(ROOT, out_path.replace("/", os.sep))

    if not files:
        files = default_files()

    rep = Report()
    if do_escheck:
        run_escheck(rep)
    for f in files:
        check_file(rep, f.replace("/", os.sep), expect_stamp)

    body = render(rep, files, quiet)
    d = os.path.dirname(out_path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with io.open(out_path, "w", encoding="utf-8") as fh:
        fh.write(body)
    print("WROTE " + out_path)
    print("TOTAL=%d FAIL=%d WARN=%d" % (len(rep.rows), len(rep.fails), len(rep.warns)))
    print("SUMMARY: " + ("ALL PASS" if not rep.fails else "%d FAIL" % len(rep.fails)))
    return 0 if not rep.fails else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
