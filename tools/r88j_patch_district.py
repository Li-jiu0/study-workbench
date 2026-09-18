# -*- coding: utf-8 -*-
"""
R88-J 地区选择.html —— 补「常用城市」区块（CRLF）。
1) 在「当前位置」区块后、crumb 前插入 <div class="xtr-sec" id="xtrRecentSec">…常用城市容器</div>
2) 脚本内：新增 recentList/recentPush/renderRecent；pick() 成功时 recentPush；boot() 里 renderRecent()
3) 追加 .xtr-recent 样式（复用 .xtr-item 风格）
用法：python tools/r88j_patch_district.py [--apply]
"""
import os
import sys

BASE = r"D:\下载的文件\学习工作台"
APPLY = ("--apply" in sys.argv)
HTML = os.path.join(BASE, r"地区选择.html")
NL = "\r\n"


def to_lf(s): return s.replace("\r\n", "\n")
def to_nl(s): return to_lf(s).replace("\n", NL)


raw = open(HTML, "rb").read()
txt = to_lf(raw.decode("utf-8"))

# --- ① 样式追加：在 .xtr-empty 规则前插入 .xtr-recent 块 ---
A1 = ".xtr-empty { padding: 26px 16px;"
N1 = (".xtr-recent { display: flex; flex-wrap: wrap; gap: 8px; padding: 2px 0 2px; }\n"
      ".xtr-recent .xtr-chip { display: inline-flex; align-items: center; gap: 4px; padding: 7px 12px; border-radius: 999px;\n"
      "  border: 1px solid var(--border, #e6e9f0); background: var(--card, #fff); color: var(--text, #1f2937);\n"
      "  font-size: 13px; cursor: pointer; }\n"
      ".xtr-recent .xtr-chip:active { background: var(--bg, #f5f7fb); }\n"
      + A1)
assert txt.count(A1) == 1, "样式锚点命中 %d" % txt.count(A1)
txt = txt.replace(A1, N1, 1)

# --- ② HTML 区块：在「当前位置」sec 之后插入「常用城市」sec ---
A2 = ("  <div class=\"xtr-sec\">\n"
      "    <div class=\"xtr-sec-t\">当前位置</div>\n"
      "    <div class=\"xtr-loc bad\" id=\"xtrLocBox\">\n"
      "      <div class=\"xtr-loc-t\" id=\"xtrLocText\">定位中…<small>正在获取你的位置</small></div>\n"
      "      <button class=\"xtr-reloc\" type=\"button\" id=\"xtrRelocBtn\" style=\"display:none\" onclick=\"XtrPage.locate()\">重新定位</button>\n"
      "    </div>\n"
      "  </div>\n")
assert txt.count(A2) == 1, "HTML 当前位置块命中 %d" % txt.count(A2)
N2 = A2 + ("\n"
           "  <div class=\"xtr-sec\" id=\"xtrRecentSec\" style=\"display:none\">\n"
           "    <div class=\"xtr-sec-t\">常用城市</div>\n"
           "    <div class=\"xtr-recent\" id=\"xtrRecent\"></div>\n"
           "  </div>\n")
txt = txt.replace(A2, N2, 1)

# --- ③ 脚本：RECENT 工具 + renderRecent（插在 PICK_KEY 定义后） ---
A3 = "  var PICK_KEY = 'xt_region_pick';\n"
assert txt.count(A3) == 1, "PICK_KEY 锚点命中 %d" % txt.count(A3)
N3 = (A3 +
      "  var RECENT_KEY = 'xt_region_recent';\n"
      "  var RECENT_MAX = 8;\n"
      "\n"
      "  /* R88-J：常用城市（LRU ≤8），与 XT_LOC_PICK 共用同一键。 */\n"
      "  function recentList() {\n"
      "    var raw = '';\n"
      "    try { raw = localStorage.getItem(RECENT_KEY) || ''; } catch (e) { return []; }\n"
      "    if (!raw) return [];\n"
      "    var arr = null;\n"
      "    try { arr = JSON.parse(raw); } catch (e2) { arr = null; }\n"
      "    if (Object.prototype.toString.call(arr) !== '[object Array]') return [];\n"
      "    var out = [], i, s;\n"
      "    for (i = 0; i < arr.length; i++) {\n"
      "      s = (arr[i] == null) ? '' : String(arr[i]).replace(/^\\s+|\\s+$/g, '');\n"
      "      if (s && out.indexOf(s) < 0) out.push(s);\n"
      "    }\n"
      "    return out;\n"
      "  }\n"
      "\n"
      "  function recentPush(text) {\n"
      "    var t = (text == null) ? '' : String(text).replace(/^\\s+|\\s+$/g, '');\n"
      "    if (!t) return;\n"
      "    var list = recentList(), out = [t], i;\n"
      "    for (i = 0; i < list.length; i++) { if (list[i] !== t) out.push(list[i]); }\n"
      "    if (out.length > RECENT_MAX) out = out.slice(0, RECENT_MAX);\n"
      "    try { localStorage.setItem(RECENT_KEY, JSON.stringify(out)); } catch (e) {}\n"
      "  }\n"
      "\n"
      "  function renderRecent() {\n"
      "    var sec = $('xtrRecentSec'), box = $('xtrRecent');\n"
      "    if (!sec || !box) return;\n"
      "    var list = recentList();\n"
      "    if (!list.length) { sec.style.display = 'none'; box.innerHTML = ''; return; }\n"
      "    var html = '', i;\n"
      "    for (i = 0; i < list.length; i++) {\n"
      "      html += '<span class=\"xtr-chip\" onclick=\"XtrPage.pick(\\'' + esc(list[i]).replace(/'/g, \"\\\\'\") + '\\')\">' +\n"
      "        esc(list[i]) + '</span>';\n"
      "    }\n"
      "    box.innerHTML = html;\n"
      "    sec.style.display = '';\n"
      "  }\n")
txt = txt.replace(A3, N3, 1)

# --- ④ pick() 成功写常用城市 ---
A4 = ("    toast('已选择：' + text);\n"
      "    setTimeout(function () {\n"
      "      try { location.replace(state.back); } catch (e2) { location.href = state.back; }\n"
      "    }, 260);\n")
assert txt.count(A4) == 1, "pick 锚点命中 %d" % txt.count(A4)
N4 = ("    recentPush(text);   /* R88-J：选中即入常用城市 */\n"
      "    toast('已选择：' + text);\n"
      "    setTimeout(function () {\n"
      "      try { location.replace(state.back); } catch (e2) { location.href = state.back; }\n"
      "    }, 260);\n")
txt = txt.replace(A4, N4, 1)

# --- ⑤ boot() 调 renderRecent ---
A5 = ("    if ($('xtrCurText')) $('xtrCurText').textContent = state.cur ? ('当前：' + state.cur) : '';\n"
      "    render();\n")
assert txt.count(A5) == 1, "boot 锚点命中 %d" % txt.count(A5)
N5 = ("    if ($('xtrCurText')) $('xtrCurText').textContent = state.cur ? ('当前：' + state.cur) : '';\n"
      "    renderRecent();   /* R88-J：常用城市 */\n"
      "    render();\n")
txt = txt.replace(A5, N5, 1)

# --- ⑥ 对外 API 暴露 recent（供测试/复用） ---
A6 = "    pick: pick,\n    locate: locate,\n"
assert txt.count(A6) == 1, "API 锚点命中 %d" % txt.count(A6)
N6 = "    pick: pick,\n    locate: locate,\n    renderRecent: renderRecent,\n    recentList: recentList,\n    recentPush: recentPush,\n"
txt = txt.replace(A6, N6, 1)

out = to_nl(txt).encode("utf-8")
print("APPLY=%s" % APPLY)
print("地区选择.html before=%d after=%d delta=%+d" % (len(raw), len(out), len(out) - len(raw)))
if APPLY:
    open(HTML, "wb").write(out)
    b = open(HTML, "rb").read()
    crlf = b.count(b"\r\n"); lone_lf = b.count(b"\n") - crlf; lone_cr = b.count(b"\r") - crlf
    print("  [after] bytes=%d CRLF=%d loneLF=%d loneCR=%d" % (len(b), crlf, lone_lf, lone_cr))
