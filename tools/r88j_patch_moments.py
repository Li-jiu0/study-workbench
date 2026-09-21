# -*- coding: utf-8 -*-
"""
R88-J 朋友圈两处定位修复 —— 补丁脚本（**待 team-lead 核过后再执行**）。

改法 A：朋友圈发布.html  L154 后插入 xt-region.js 引用（戳值用现有 20260918a）
改法 B：xt-moments.js  L958-981 两个位置按钮统一语义（xtmPickLocation）
改法 C：xt-moments.js  L1105 前注入 window.toast 全局别名（修 _failToast 静默）

约束：二进制读写；CRLF 保持；ES2017；禁原生弹窗。
用法：python tools/r88j_patch_moments.py [--apply]
      不带 --apply 只做 dry-run（打印将改的行号/字节数，不落盘）。
"""
import os
import sys

BASE = r"D:\下载的文件\学习工作台"
APPLY = ("--apply" in sys.argv)

HTML = os.path.join(BASE, r"朋友圈发布.html")
JS = os.path.join(BASE, r"assets\xt-moments.js")

NL = "\r\n"


def read_bytes(p):
    with open(p, "rb") as f:
        return f.read()


def write_bytes(p, b):
    with open(p, "wb") as f:
        f.write(b)


def to_lf(s):
    return s.replace("\r\n", "\n")


def to_nl(s):
    return to_lf(s).replace("\n", NL)


def check_eol(b, tag):
    crlf = b.count(b"\r\n")
    lone_lf = b.count(b"\n") - crlf
    lone_cr = b.count(b"\r") - crlf
    print("  [%s] bytes=%d CRLF=%d loneLF=%d loneCR=%d" % (tag, len(b), crlf, lone_lf, lone_cr))
    return lone_lf == 0 and lone_cr == 0


# ==================== 改法 A：朋友圈发布.html 补引 xt-region.js ====================
def patch_html():
    print("== 改法 A: 朋友圈发布.html 补引 xt-region.js ==")
    raw = read_bytes(HTML)
    txt = to_lf(raw.decode("utf-8"))
    anchor = '<script src="assets/config.js?v=20260916O" defer></script>'
    assert txt.count(anchor) == 1, "anchor config.js 命中 %d 次" % txt.count(anchor)
    ins = anchor + '\n' + '<script src="assets/xt-region.js?v=20260918a" defer></script><!-- R88-J: 位置底座 -->'
    new_txt = txt.replace(anchor, ins, 1)
    out = to_nl(new_txt).encode("utf-8")
    print("  before=%d  after=%d  delta=%+d" % (len(raw), len(out), len(out) - len(raw)))
    if APPLY:
        write_bytes(HTML, out)
        check_eol(read_bytes(HTML), "html-after")


# ==================== 改法 B + C：xt-moments.js ====================
OLD_B = (
    "    var locBtn = $('xtmLocBtn');\n"
    "    if (locBtn) locBtn.onclick = function () { inputSheet('\u6240\u5728\u4f4d\u7f6e', '\u5982\uff1a\u56fe\u4e66\u9986 / \u81ea\u4e60\u5ba4', P.location, function (v) { P.location = v.slice(0, 64); renderChosen(); }); };\n"
    "    var locSelf = $('xtmAtBtn');\n"
    "    if (locSelf) locSelf.onclick = function () {\n"
    "      /* R88-H\uff1a\u4e00\u952e\u5b9a\u4f4d\u8d70\u7edf\u4e00\u5e95\u5ea7 XT_LOC_PICK\uff08\u5b9a\u4f4d \u2192 \u9006\u5730\u7406\u7f16\u7801 \u2192 \u6587\u5b57\u5730\u5740\uff09\uff1b\n"
    "         \u4efb\u4e00\u73af\u8282\u5931\u8d25\u964d\u7ea7\u4e3a\u672c\u9875\u65e2\u6709\u7684 inputSheet \u624b\u52a8\u8f93\u5165\u3002\u5168\u7a0b\u4e0d\u4ea7\u51fa\u5750\u6807\u660e\u6587\uff08\u786c\u89c4\u5219\uff09\u3002 */\n"
    "      var LP = window.XT_LOC_PICK;\n"
    "      if (!LP || typeof LP.pick !== 'function') {\n"
    "        toast('\u5b9a\u4f4d\u670d\u52a1\u4e0d\u53ef\u7528\uff0c\u8bf7\u624b\u52a8\u586b\u5199');\n"
    "        inputSheet('\u6240\u5728\u4f4d\u7f6e', '\u5982\uff1a\u56fe\u4e66\u9986 / \u81ea\u4e60\u5ba4', P.location, function (v) { P.location = String(v || '').slice(0, 64); renderChosen(); });\n"
    "        return;\n"
    "      }\n"
    "      toast('\u6b63\u5728\u5b9a\u4f4d\u2026');\n"
    "      LP.pick({\n"
    "        fallbackTitle: '\u6240\u5728\u4f4d\u7f6e',\n"
    "        onManual: function (title, ph, cb) { inputSheet(title || '\u6240\u5728\u4f4d\u7f6e', ph || '\u5982\uff1a\u56fe\u4e66\u9986 / \u81ea\u4e60\u5ba4', '', cb); }\n"
    "      }, function (r) {\n"
    "        if (r && r.text) {\n"
    "          P.location = String(r.text).slice(0, 64);\n"
    "          renderChosen();\n"
    "          toast('\u5df2\u8bb0\u5f55\u5f53\u524d\u4f4d\u7f6e');\n"
    "        }\n"
    "      });\n"
    "    };\n"
)

NEW_B = (
    "    /* R88-J\uff1a\u4e24\u4e2a\u4f4d\u7f6e\u6309\u94ae\u7edf\u4e00\u8bed\u4e49 \u2014\u2014 \u5148\u5c1d\u8bd5\u5b9a\u4f4d\uff08XT_LOC_PICK\uff09\uff0c\u5931\u8d25\u964d\u7ea7\u672c\u9875 inputSheet \u624b\u52a8\u8f93\u5165\u3002\n"
    "       \u300c\u4f4d\u7f6e\u300d\u4e0e\u300c\u6240\u5728\u4f4d\u7f6e\u300d\u90fd\u8d70\u540c\u4e00 onConfirm(text) \u8bed\u4e49\uff1a\u5199\u5165\u8349\u7a3f P.location + renderChosen\uff08\u4e0d\u53d1\u9001\uff09\u3002\n"
    "       \u5750\u6807\u7edd\u4e0d\u8fdb\u5165\u4efb\u4f55\u5b57\u7b26\u4e32\uff08\u786c\u89c4\u5219\uff09\u3002 */\n"
    "    function xtmPickLocation() {\n"
    "      function applyManual(title, ph) {\n"
    "        inputSheet(title || '\u6240\u5728\u4f4d\u7f6e', ph || '\u5982\uff1a\u56fe\u4e66\u9986 / \u81ea\u4e60\u5ba4', P.location, function (v) {\n"
    "          P.location = String(v || '').slice(0, 64); renderChosen();\n"
    "        });\n"
    "      }\n"
    "      var LP = window.XT_LOC_PICK;\n"
    "      if (!LP || typeof LP.pick !== 'function') {\n"
    "        /* \u5e95\u5ea7\u7f3a\u5931\uff1a\u5408\u7406\u964d\u7ea7\u515c\u5e95\uff08\u4fdd\u7559\uff09 */\n"
    "        toast('\u5b9a\u4f4d\u670d\u52a1\u4e0d\u53ef\u7528\uff0c\u8bf7\u624b\u52a8\u586b\u5199');\n"
    "        applyManual();\n"
    "        return;\n"
    "      }\n"
    "      toast('\u6b63\u5728\u5b9a\u4f4d\u2026');\n"
    "      LP.pick({\n"
    "        fallbackTitle: '\u6240\u5728\u4f4d\u7f6e',\n"
    "        onManual: function (title, ph, cb) { inputSheet(title || '\u6240\u5728\u4f4d\u7f6e', ph || '\u5982\uff1a\u56fe\u4e66\u9986 / \u81ea\u4e60\u5ba4', '', cb); }\n"
    "      }, function (r) {\n"
    "        if (r && r.text) {\n"
    "          P.location = String(r.text).slice(0, 64); renderChosen(); toast('\u5df2\u8bb0\u5f55\u5f53\u524d\u4f4d\u7f6e');\n"
    "        } else {\n"
    "          toast('\u672a\u80fd\u83b7\u53d6\u4f4d\u7f6e\uff0c\u8bf7\u624b\u52a8\u586b\u5199');   /* \u5931\u8d25\u53ef\u89c1\u63d0\u793a\uff08\u4fee\u9759\u9ed8\uff09 */\n"
    "        }\n"
    "      });\n"
    "    }\n"
    "    var locBtn = $('xtmLocBtn');\n"
    "    if (locBtn) locBtn.onclick = xtmPickLocation;\n"
    "    var locSelf = $('xtmAtBtn');\n"
    "    if (locSelf) locSelf.onclick = xtmPickLocation;\n"
)

# 改法 C 锚点：IIFE 内、readyState 分支之前
OLD_C = (
    "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', XTM.boot);\n"
    "  else XTM.boot();\n"
)
NEW_C = (
    "  /* R88-J\uff1a\u5e95\u5ea7 XT_LOC_PICK \u5185\u90e8 _failToast \u53ea\u8ba4 window.XT_TOAST / window.toast\uff1b\n"
    "     \u672c\u9875 toast \u4e3a\u79c1\u6709\u51fd\u6570\uff08\u4e0d\u5728 window\uff09\uff0c\u6545\u5728\u6b64\u6ce8\u5165\u5168\u5c40\u522b\u540d\uff0c\u907f\u514d\u5e95\u5ea7\u5931\u8d25\u9759\u9ed8\u3002\n"
    "     \u4e0d\u52a8 xt-region.js \u65e2\u6709\u5951\u7ea6\u3002 */\n"
    "  if (typeof window.toast !== 'function' && typeof window.showToast === 'function') {\n"
    "    window.toast = window.showToast;\n"
    "  }\n"
    "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', XTM.boot);\n"
    "  else XTM.boot();\n"
)


def patch_js():
    print("== 改法 B + C: xt-moments.js ==")
    raw = read_bytes(JS)
    txt = to_lf(raw.decode("utf-8"))

    # 改法 B
    assert txt.count(OLD_B) == 1, "改法B OLD 命中 %d 次" % txt.count(OLD_B)
    txt2 = txt.replace(OLD_B, NEW_B, 1)

    # 改法 C
    assert txt2.count(OLD_C) == 1, "改法C OLD 命中 %d 次" % txt2.count(OLD_C)
    txt3 = txt2.replace(OLD_C, NEW_C, 1)

    out = to_nl(txt3).encode("utf-8")
    print("  before=%d  after=%d  delta=%+d" % (len(raw), len(out), len(out) - len(raw)))
    if APPLY:
        write_bytes(JS, out)
        check_eol(read_bytes(JS), "js-after")


if __name__ == "__main__":
    print("APPLY=%s" % APPLY)
    patch_html()
    patch_js()
    if not APPLY:
        print("\n(dry-run\u5b8c\u6210\uff0c\u672a\u843d\u76d8\u3002\u52a0 --apply \u6267\u884c)")
