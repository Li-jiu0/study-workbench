# -*- coding: utf-8 -*-
"""需求 E 变更后的静态自验：行尾字节、静态断言、禁用语法、内联脚本可编译、版本戳未动。"""
import io
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))   # 仓库根（本脚本在 tools/qa/ 下）
OUT = []


def log(s):
    OUT.append(s)


def eol(path):
    with io.open(path, "rb") as fh:
        d = fh.read()
    crlf = d.count(b"\r\n")
    return len(d), crlf, d.count(b"\n") - crlf


log("=== 1) 行尾字节复验 ===")
for p in ["ai-settings.html", "assets/xt-aiusage.js", "assets/ai-service.js"]:
    b, c, l = eol(os.path.join(ROOT, p))
    log("  %-24s bytes=%-7d CRLF=%-3d loneLF=%d" % (p, b, c, l))

log("")
log("=== 2) 静态断言 ===")
html = io.open(os.path.join(ROOT, "ai-settings.html"), "rb").read().decode("utf-8")
js = io.open(os.path.join(ROOT, "assets/xt-aiusage.js"), "rb").read().decode("utf-8")


def cnt(text, needle):
    return text.count(needle)


log("  ai-settings.html 中 setUsageEntry 出现次数 = %d （期望 0）" % cnt(html, "setUsageEntry"))
log("  ai-settings.html 中 setUsageRoot 出现次数 = %d （期望 >=1）" % cnt(html, "setUsageRoot"))
log("  ai-settings.html 中 xt-aiusage.js 引用次数 = %d （期望 1）" % cnt(html, 'src="assets/xt-aiusage.js"'))
# 拆开写：避免「独立页文件名」以字面量残留在仓库里（该独立页已删除）
STANDALONE = "模型" + "用量.html"
log("  独立页是否已删除 = %s （期望 False）"
    % os.path.exists(os.path.join(ROOT, STANDALONE)))

# 全仓搜索指向独立页的链接/路由（排除 .git / 临时与备份目录）
SKIP = (".git", ".tmp_eng", "备份", "node_modules", "_bak-pre-b5-subst", "_w2t1_img", ".qa")
hits = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    rel = os.path.relpath(dirpath, ROOT)
    if rel != "." and any(rel.startswith(s) or (os.sep + s + os.sep) in (os.sep + rel + os.sep) for s in SKIP):
        dirnames[:] = []
        continue
    for fn in filenames:
        fp = os.path.join(dirpath, fn)
        try:
            if os.path.getsize(fp) > 4 * 1024 * 1024:
                continue
            with io.open(fp, "rb") as fh:
                raw = fh.read()
        except Exception:
            continue
        # 只搜「指向独立页的链接/路由」，不搜功能名（功能名出现在注释里属正常）
        if STANDALONE in raw.decode("utf-8", "ignore"):
            hits.append(os.path.relpath(fp, ROOT))
log("  全仓指向独立页的链接/路由文件数 = %d （期望 0）%s"
    % (len(hits), (" -> " + ", ".join(hits[:10])) if hits else ""))

# 模型列表工具条按钮数恢复为 4
m = re.search(r'<div class="xt-set-toolbar-btns">(.*?)</div>', html, re.S)
toolbar = m.group(1) if m else ""
log("  模型列表工具条 button 数 = %d （期望 4）" % len(re.findall(r"<button", toolbar)))

log("")
log("=== 3) 禁用语法 / 原生弹窗扫描 ===")
for p in ["assets/xt-aiusage.js", "ai-settings.html"]:
    s = io.open(os.path.join(ROOT, p), "rb").read().decode("utf-8")
    issues = []
    for mm in re.finditer(r"\?\.[A-Za-z_\[]", s):
        issues.append("optional-chain@%d" % mm.start())
    for mm in re.finditer(r"\?\?", s):
        issues.append("nullish@%d" % mm.start())
    for mm in re.finditer(r"\(\?<[!=]", s):
        issues.append("lookbehind@%d" % mm.start())
    for mm in re.finditer(r"\b(alert|confirm|prompt)\s*\(", s):
        issues.append("dialog:%s@%d" % (mm.group(1), mm.start()))
    log("  %-22s -> %s" % (p, issues if issues else "clean"))

log("")
log("=== 4) ai-settings.html 内联脚本可编译 ===")
handlers = re.findall(r'on(?:click|input|change|submit)="([^"]*)"', html)
log("  内联事件处理器条数 = %d" % len(handlers))
tmp = os.path.join(HERE, "_r86e2_inline.js")
with io.open(tmp, "wb") as fh:
    body = "\n".join(["(function () { %s });" % h for h in handlers])
    fh.write(body.encode("utf-8"))
r = subprocess.run([sys.executable, "-c",
                    "import sys,subprocess;"
                    "p=r'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';"
                    "print(subprocess.run([p,'--check',r'" + tmp.replace("\\", "/") + "'],capture_output=True).returncode)"],
                   capture_output=True)
log("  node --check 内联脚本返回码 = %s （0 即通过）" % (r.stdout.decode().strip() or "?"))

log("")
log("=== 5) 版本戳未被改动 ===")
r2 = subprocess.run(["git", "diff", "-U0", "--", "ai-settings.html", "assets/ai-service.js"],
                    capture_output=True, cwd=ROOT)
diff = r2.stdout.decode("utf-8", "ignore")
changed_v = [ln for ln in diff.split("\n") if ("?v=" in ln) and (ln[:1] in "+-") and not ln.startswith(("+++", "---"))]
log("  改动行中含 ?v= 的行数 = %d （期望 0）" % len(changed_v))
r3 = subprocess.run(["git", "diff", "--stat"], capture_output=True, cwd=ROOT)
log("  git diff --stat:")
for ln in r3.stdout.decode("utf-8", "ignore").strip().split("\n"):
    log("    " + ln)
r4 = subprocess.run(["git", "status", "--porcelain"], capture_output=True, cwd=ROOT)
log("  git status --porcelain:")
for ln in r4.stdout.decode("utf-8", "ignore").strip().split("\n"):
    log("    " + ln)

log("")
log("=== 6) 埋点侧（ai-service.js）是否被动过 ===")
b, c, l = eol(os.path.join(ROOT, "assets/ai-service.js"))
log("  ai-service.js bytes=%d loneLF=%d （上一批交付时报数为 116673 / 2641，一致则说明未动）" % (b, l))

with io.open(os.path.join(HERE, "_r86e2_report.txt"), "wb") as fh:
    fh.write(("\n".join(OUT) + "\n").encode("utf-8"))
