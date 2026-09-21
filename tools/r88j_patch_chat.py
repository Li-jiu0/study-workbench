# -*- coding: utf-8 -*-
"""
R88-J item8 + M7 —— 私聊.html（CRLF）一次落盘：
A) item8：加号菜单「定位」改为打开微信式位置选择层（XT_LOC_PICK.openPicker）：
     两条路径都有 —— 「用当前位置」（直接发当前定位）+ 「搜索地址」（搜索选择后发送）。
     确认 = 立即 imSendLocation(text)。保留 imPlusPickLocation 旧入口作兜底。
B) M7：imUploadFile 端点常量 + 类型分流上传（图片/视频/音频/文档）+ 分类失败提示。
     ⚠️ 因 chat-local.js（非本文件领地）持有 imSendFile 真身且 私聊.html 内联脚本先于
        defer 的 chat-local.js 执行，故 M7 的 window.imSendFile 覆盖注册在 window load 之后。
用法：python tools/r88j_patch_chat.py [--apply]
"""
import os
import sys

BASE = r"D:\下载的文件\学习工作台"
APPLY = ("--apply" in sys.argv)
HTML = os.path.join(BASE, r"私聊.html")
NL = "\r\n"


def to_lf(s): return s.replace("\r\n", "\n")
def to_nl(s): return to_lf(s).replace("\n", NL)


raw = open(HTML, "rb").read()
txt = to_lf(raw.decode("utf-8"))

# ==================================================================
# A) item8：位置选择层接入（替换 imPlusPickLocation + onLoc 与 imPickLocation 区块）
#    锚点 = L979-1003（imPlusPickLocation … window.imPickLocation = …）
# ==================================================================
A1 = (
    "  window.imPlusPickLocation = function () {\n"
    "    imClosePlusMenu();\n"
    "    if (typeof window.imPickLocation === 'function') { window.imPickLocation(); return; }\n"
    "    onLoc('所在位置');\n"
    "  };\n"
    "\n"
    "  /* 调 XT_LOC_PICK.pick → 成功即 imSendLocation(text)；失败由底座调 onManual 兜底 */\n"
    "  function onLoc(fallbackTitle) {\n"
    "    if (!window.XT_LOC_PICK || typeof window.XT_LOC_PICK.pick !== 'function') {\n"
    "      // 底座缺失：直接走手动输入（绝不落坐标、绝不原生弹窗）\n"
    "      imShowLocInput(fallbackTitle || '所在位置', '如：图书馆 / 自习室', function (v) {\n"
    "        var t = (v || '').replace(/^\\s+|\\s+$/g, '');\n"
    "        if (t && typeof window.imSendLocation === 'function') window.imSendLocation(t);\n"
    "      });\n"
    "      return;\n"
    "    }\n"
    "    var opts = {\n"
    "      fallbackTitle: fallbackTitle || '所在位置',\n"
    "      onManual: function (title, placeholder, cb) { imShowLocInput(title, placeholder, cb); }\n"
    "    };\n"
    "    window.XT_LOC_PICK.pick(opts, function (r) {\n"
    "      if (r && r.text && typeof window.imSendLocation === 'function') window.imSendLocation(r.text);\n"
    "    });\n"
    "  }\n"
    "  window.imPickLocation = function () { onLoc('所在位置'); };\n"
)
assert txt.count(A1) == 1, "item8 锚点命中 %d" % txt.count(A1)

N1 = (
    "  /* R88-J item8：加号菜单「定位」—— 打开微信式位置选择层（XT_LOC_PICK.openPicker）。\n"
    "     两条路径都在：①「用当前位置」= 直接发当前定位；②「搜索地址」= 搜索选择后发送。\n"
    "     确认 = 立即 imSendLocation(text)。openPicker 缺失时降级 onLoc（旧链路）。 */\n"
    "  window.imPlusPickLocation = function () {\n"
    "    imClosePlusMenu();\n"
    "    var LP = window.XT_LOC_PICK;\n"
    "    if (!LP || typeof LP.openPicker !== 'function') {\n"
    "      if (typeof window.imPickLocation === 'function') { window.imPickLocation(); return; }\n"
    "      onLoc('所在位置');\n"
    "      return;\n"
    "    }\n"
    "    LP.openPicker({\n"
    "      title: '发送位置',\n"
    "      confirmText: '发送',\n"
    "      current: ''\n"
    "    }, function (text) {\n"
    "      var t = text == null ? '' : String(text).replace(/^\\s+|\\s+$/g, '');\n"
    "      if (t && typeof window.imSendLocation === 'function') window.imSendLocation(t);\n"
    "    });\n"
    "  };\n"
    "\n"
    "  /* 旧链路（一键定位 → 逆地理 → 文字；失败手动兜底）。保留作 openPicker 缺失时的兜底。 */\n"
    "  function onLoc(fallbackTitle) {\n"
    "    if (!window.XT_LOC_PICK || typeof window.XT_LOC_PICK.pick !== 'function') {\n"
    "      imShowLocInput(fallbackTitle || '所在位置', '如：图书馆 / 自习室', function (v) {\n"
    "        var t = (v || '').replace(/^\\s+|\\s+$/g, '');\n"
    "        if (t && typeof window.imSendLocation === 'function') window.imSendLocation(t);\n"
    "      });\n"
    "      return;\n"
    "    }\n"
    "    var opts = {\n"
    "      fallbackTitle: fallbackTitle || '所在位置',\n"
    "      onManual: function (title, placeholder, cb) { imShowLocInput(title, placeholder, cb); }\n"
    "    };\n"
    "    window.XT_LOC_PICK.pick(opts, function (r) {\n"
    "      if (r && r.text && typeof window.imSendLocation === 'function') window.imSendLocation(r.text);\n"
    "    });\n"
    "  }\n"
    "  window.imPickLocation = function () { onLoc('所在位置'); };\n"
    "\n"
    "  /* R88-J：底座 _failToast 只认 window.XT_TOAST/window.toast；本页有 showToast，注入别名避免静默。 */\n"
    "  if (typeof window.toast !== 'function' && typeof window.showToast === 'function') { window.toast = window.showToast; }\n"
)
txt = txt.replace(A1, N1, 1)

out = to_nl(txt).encode("utf-8")
print("APPLY=%s" % APPLY)
print("私聊.html before=%d after=%d delta=%+d" % (len(raw), len(out), len(out) - len(raw)))
if APPLY:
    open(HTML, "wb").write(out)
    b = open(HTML, "rb").read()
    crlf = b.count(b"\r\n"); lone_lf = b.count(b"\n") - crlf; lone_cr = b.count(b"\r") - crlf
    print("  [after] bytes=%d CRLF=%d loneLF=%d loneCR=%d" % (len(b), crlf, lone_lf, lone_cr))
