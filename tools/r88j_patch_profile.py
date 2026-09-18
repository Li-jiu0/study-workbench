# -*- coding: utf-8 -*-
"""
R88-J item1 —— assets/xt-profile.js（CRLF）地区跳转修复：
1) L2578-2585 key==='region' 分支：通用文本编辑 → 跳 地区选择.html（xtpOpenRegionPicker）
2) 新增 xtpOpenRegionPicker / xtpTakeRegionPick（自建，10 分钟 TTL，复用 xt_region_pick）
3) boot() 进入时消费回写值 → saveProfile({city}) + renderPage()
用法：python tools/r88j_patch_profile.py [--apply]
"""
import os
import sys

BASE = r"D:\下载的文件\学习工作台"
APPLY = ("--apply" in sys.argv)
JS = os.path.join(BASE, r"assets\xt-profile.js")
NL = "\r\n"


def to_lf(s): return s.replace("\r\n", "\n")
def to_nl(s): return to_lf(s).replace("\n", NL)


raw = open(JS, "rb").read()
txt = to_lf(raw.decode("utf-8"))

# ---------- ① region 分支替换 ----------
A1 = (
    "    if (key === 'region') {\n"
    "      openFieldEditor({\n"
    "        title: '地区', value: regionVal(), placeholder: '如：广东 深圳', maxLen: 24,\n"
    "        validate: function (v) { return v.length > 24 ? '地区最多 24 个字' : ''; },\n"
    "        onSave: function (v) { saveProfile({ city: v }); renderPage(); toast(v ? '地区已保存' : '地区已清空'); }\n"
    "      });\n"
    "      return;\n"
    "    }\n"
)
assert txt.count(A1) == 1, "region 分支锚点命中 %d" % txt.count(A1)
N1 = (
    "    if (key === 'region') {\n"
    "      /* R88-J item1：地区改为跳「地区选择.html」选择器（原为通用文本编辑层，无法跳转）。\n"
    "         选中后经 localStorage['xt_region_pick'] 回写，本页 boot 时消费（10 分钟 TTL）。 */\n"
    "      xtpOpenRegionPicker();\n"
    "      return;\n"
    "    }\n"
)
txt = txt.replace(A1, N1, 1)

# ---------- ② 新增两个函数（插在 regionVal 定义之后） ----------
A2 = "  function regionVal() { var p = getProfile(); return (p.city && String(p.city).trim()) || ''; }\n"
assert txt.count(A2) == 1, "regionVal 锚点命中 %d" % txt.count(A2)
N2 = (A2 +
      "\n"
      "  /* R88-J item1：地区选择跳转 + 回写消费（自建，不依赖个人中心.html 作用域）。 */\n"
      "  var XTP_REGION_PICK_KEY = 'xt_region_pick';\n"
      "  var XTP_REGION_TTL = 10 * 60 * 1000;   // 10 分钟 TTL（沿用既有协议）\n"
      "\n"
      "  /** 跳转到「地区选择.html」，current=当前地区，back=本页文件名（供回跳）。 */\n"
      "  function xtpOpenRegionPicker() {\n"
      "    var back = '个人资料.html';\n"
      "    try {\n"
      "      var pn = location.pathname || '';\n"
      "      var k = pn.lastIndexOf('/');\n"
      "      if (k >= 0 && pn.length > k + 1) { back = decodeURIComponent(pn.substring(k + 1)); }\n"
      "    } catch (e) { /* 保持默认 */ }\n"
      "    var cur = regionVal();\n"
      "    try {\n"
      "      location.href = '地区选择.html?cur=' + encodeURIComponent(cur) + '&back=' + encodeURIComponent(back);\n"
      "    } catch (e2) {\n"
      "      toast('无法打开地区选择页', true);\n"
      "    }\n"
      "  }\n"
      "\n"
      "  /** 消费地区选择回写值（一次性 + 10 分钟 TTL），返回地区文本或 ''。 */\n"
      "  function xtpTakeRegionPick() {\n"
      "    var raw = '';\n"
      "    try { raw = localStorage.getItem(XTP_REGION_PICK_KEY) || ''; } catch (e) { return ''; }\n"
      "    if (!raw) return '';\n"
      "    var obj = null;\n"
      "    try { obj = JSON.parse(raw); } catch (e2) { obj = null; }\n"
      "    try { localStorage.removeItem(XTP_REGION_PICK_KEY); } catch (e3) { /* 忽略 */ }\n"
      "    if (!obj || !obj.text) return '';\n"
      "    try { if (obj.ts && (Date.now() - obj.ts > XTP_REGION_TTL)) return ''; } catch (e4) { return ''; }\n"
      "    return String(obj.text).slice(0, 40);\n"
      "  }\n")
txt = txt.replace(A2, N2, 1)

# ---------- ③ boot() 消费回写 ----------
A3 = (
    "  function boot() {\n"
    "    applyThemeClass();\n"
    "    var otherUid = viewUid();\n"
    "    if (otherUid) { renderOtherEntry(otherUid); } else { renderPage(); }\n"
)
assert txt.count(A3) == 1, "boot 锚点命中 %d" % txt.count(A3)
N3 = (
    "  function boot() {\n"
    "    applyThemeClass();\n"
    "    var otherUid = viewUid();\n"
    "    if (otherUid) { renderOtherEntry(otherUid); } else { renderPage(); }\n"
    "    /* R88-J item1：若从「地区选择.html」跳回，消费回写值 → 写入 profile.city。 */\n"
    "    var pendingRegion = xtpTakeRegionPick();\n"
    "    if (pendingRegion) {\n"
    "      saveProfile({ city: pendingRegion });\n"
    "      renderPage();\n"
    "      toast('地区已更新：' + pendingRegion);\n"
    "    }\n"
)
txt = txt.replace(A3, N3, 1)

out = to_nl(txt).encode("utf-8")
print("APPLY=%s" % APPLY)
print("xt-profile.js before=%d after=%d delta=%+d" % (len(raw), len(out), len(out) - len(raw)))
if APPLY:
    open(JS, "wb").write(out)
    b = open(JS, "rb").read()
    crlf = b.count(b"\r\n"); lone_lf = b.count(b"\n") - crlf; lone_cr = b.count(b"\r") - crlf
    print("  [after] bytes=%d CRLF=%d loneLF=%d loneCR=%d" % (len(b), crlf, lone_lf, lone_cr))
