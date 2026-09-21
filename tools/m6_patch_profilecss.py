# -*- coding: utf-8 -*-
"""R88-M6 补丁3：xt-profile.css —— Bug2 换头像全屏裁剪台体验修复
1) .xtp-crop-mask 淡入 + 轻微缩放过渡（不是啪一下全屏）
2) .xtp-crop-topbar::after 加进入引导文案（纯 CSS，不改 xt-profile.js）
3) 安全边距：cropper 顶部/底部 env(safe-area-inset-*)（适配刘海屏 / 手势条）
不改 xt-profile.js（另一条线占用），不改任何 DOM id / 全局函数名。
"""
PATH = r'D:\下载的文件\学习工作台\assets\xt-profile.css'

def read_bytes(p):
    with open(p, 'rb') as f:
        return f.read()

def assert_crlf(b):
    crlf = b.count(b'\r\n'); lf = b.count(b'\n'); lone = lf - crlf
    assert lone == 0, 'loneLF != 0 : %d' % lone
    return crlf, lf

def replace_once(data, old, new, label):
    cnt = data.count(old)
    assert cnt == 1, 'anchor [%s] count=%d (expect 1)' % (label, cnt)
    return data.replace(old, new, 1)

data = read_bytes(PATH)
crlf0, lf0 = assert_crlf(data)
size0 = len(data)

# ---- 1) mask 淡入动画 + cropper 安全边距 ----
old_mask = (
    ".xtp-crop-mask { padding: 0; background: #000; align-items: stretch; justify-content: flex-start; }\r\n"
    ".xtp-cropper {\r\n"
    "  display: flex;\r\n"
    "  flex-direction: column;\r\n"
    "  width: 100%;\r\n"
    "  height: 100%;\r\n"
    "  background: #000;\r\n"
    "}\r\n"
)
new_mask = (
    "/* R88-M6（2026-09-18）：进入裁剪台的过渡 —— 由透明 + 轻微缩放淡入，避免「啪一下全屏」的突兀感。 */\r\n"
    ".xtp-crop-mask {\r\n"
    "  padding: 0;\r\n"
    "  background: #000;\r\n"
    "  align-items: stretch;\r\n"
    "  justify-content: flex-start;\r\n"
    "  animation: xtpCropMaskIn 0.22s ease-out both;\r\n"
    "}\r\n"
    "@keyframes xtpCropMaskIn {\r\n"
    "  from { opacity: 0; }\r\n"
    "  to { opacity: 1; }\r\n"
    "}\r\n"
    ".xtp-cropper {\r\n"
    "  display: flex;\r\n"
    "  flex-direction: column;\r\n"
    "  width: 100%;\r\n"
    "  height: 100%;\r\n"
    "  background: #000;\r\n"
    "  /* R88-M6：进入时的轻微放大过渡（0.96 → 1），配合 mask 淡入，观感更柔和。 */\r\n"
    "  animation: xtpCropperIn 0.22s ease-out both;\r\n"
    "  /* R88-M6：安全边距 —— 适配刘海屏 / 底部手势条。 */\r\n"
    "  padding-top: env(safe-area-inset-top, 0px);\r\n"
    "  padding-bottom: env(safe-area-inset-bottom, 0px);\r\n"
    "  box-sizing: border-box;\r\n"
    "}\r\n"
    "@keyframes xtpCropperIn {\r\n"
    "  from { opacity: 0; transform: scale(0.96); }\r\n"
    "  to { opacity: 1; transform: scale(1); }\r\n"
    "}\r\n"
    "@media (prefers-reduced-motion: reduce) {\r\n"
    "  .xtp-crop-mask, .xtp-cropper { animation: none; }\r\n"
    "}\r\n"
)
data = replace_once(data, old_mask.encode('utf-8'), new_mask.encode('utf-8'), 'crop mask')

# ---- 2) 顶栏引导文案（纯 CSS ::after，居中显示，不改 JS） ----
old_top = (
    ".xtp-crop-topbar {\r\n"
    "  flex: none;\r\n"
    "  display: flex;\r\n"
    "  align-items: center;\r\n"
    "  justify-content: space-between;\r\n"
    "  min-height: 48px;\r\n"
    "  padding: 0 10px;\r\n"
    "  padding-top: env(safe-area-inset-top, 0px);\r\n"
    "  box-sizing: border-box;\r\n"
    "  background: #000;\r\n"
    "}\r\n"
)
new_top = (
    ".xtp-crop-topbar {\r\n"
    "  position: relative;\r\n"
    "  flex: none;\r\n"
    "  display: flex;\r\n"
    "  align-items: center;\r\n"
    "  justify-content: space-between;\r\n"
    "  min-height: 48px;\r\n"
    "  padding: 0 10px;\r\n"
    "  padding-top: env(safe-area-inset-top, 0px);\r\n"
    "  box-sizing: border-box;\r\n"
    "  background: #000;\r\n"
    "}\r\n"
    "/* R88-M6：进入引导文案（R86-C 原设计「无说明文案」，但实测用户会困惑，补一行轻量引导）。\r\n"
    "   纯 CSS ::after，绝对居中，不占用两侧按钮空间，不改任何 DOM / JS。 */\r\n"
    ".xtp-crop-topbar::after {\r\n"
    "  content: \"拖动 / 双指缩放调整头像\";\r\n"
    "  position: absolute;\r\n"
    "  left: 50%;\r\n"
    "  top: 50%;\r\n"
    "  transform: translate(-50%, -50%);\r\n"
    "  max-width: 60%;\r\n"
    "  color: rgba(255, 255, 255, 0.82);\r\n"
    "  font-size: 12px;\r\n"
    "  line-height: 1.3;\r\n"
    "  white-space: nowrap;\r\n"
    "  overflow: hidden;\r\n"
    "  text-overflow: ellipsis;\r\n"
    "  pointer-events: none;\r\n"
    "}\r\n"
)
data = replace_once(data, old_top.encode('utf-8'), new_top.encode('utf-8'), 'crop topbar')

with open(PATH, 'wb') as f:
    f.write(data)

chk = read_bytes(PATH)
crlf2, lf2 = assert_crlf(chk)
assert chk.count(b'xtpCropMaskIn') == 2, 'mask anim missing'
assert chk.count(b'xtpCropperIn') == 2, 'cropper anim missing'
assert chk.count(b'env(safe-area-inset-top') >= 2, 'safe-area top missing'
assert chk.count(b'env(safe-area-inset-bottom') >= 2, 'safe-area bottom missing'
assert b'\xe6\x8b\x96\xe5\x8a\xa8 / \xe5\x8f\x8c\xe6\x8c\x87\xe7\xbc\xa9\xe6\x94\xbe\xe8\xb0\x83\xe6\x95\xb4\xe5\xa4\xb4\xe5\x83\x8f' in chk, 'guide text missing'
open('tools/m6_profilecss_verify.txt','w',encoding='utf-8').write(
    'OK xt-profile.css: %d -> %d B, CRLF=%d, loneLF=%d\n' % (size0, len(chk), crlf2, lf2 - crlf2))
