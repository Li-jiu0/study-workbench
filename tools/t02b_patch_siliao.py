# -*- coding: utf-8 -*-
"""T02 增量：私聊.html 菜单 3 项 → 4 项（相册发图/拍摄/发送文件/定位）
1) 新增 #imFileInput（无 accept 限制，change→imSendFile(this)）
2) 菜单加「发送文件」项（data-icon="file"）
3) 「位置定位」文案统一为「定位」（用户口径）
4) 页尾脚本加 imPlusPickFile
"""
PATH = r'D:\下载的文件\学习工作台\私聊.html'

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

# ---- 1) 新增 #imFileInput（插在 #imCameraInput 之后） ----
old_cam = (
    '            <!-- R88-I：拍摄入口（capture 移动端直调相机；桌面退化为文件选择，同走 imSendImage 链路；不用 getUserMedia） -->\r\n'
    '            <input type="file" id="imCameraInput" accept="image/*" capture="environment" style="display:none" onchange="imSendImage(this)">\r\n'
)
new_cam = (
    '            <!-- R88-I：拍摄入口（capture 移动端直调相机；桌面退化为文件选择，同走 imSendImage 链路；不用 getUserMedia） -->\r\n'
    '            <input type="file" id="imCameraInput" accept="image/*" capture="environment" style="display:none" onchange="imSendImage(this)">\r\n'
    '            <!-- R88-I 增量：发送文件入口（不限 accept，允许常见文档/压缩包；change→imSendFile(this)） -->\r\n'
    '            <input type="file" id="imFileInput" style="display:none" onchange="imSendFile(this)">\r\n'
)
data = replace_once(data, old_cam.encode('utf-8'), new_cam.encode('utf-8'), 'imFileInput')

# ---- 2) 菜单：加「发送文件」项 + 「位置定位」→「定位」 ----
old_menu = (
    '            <!-- R88-I：底部滑出的加号浮层菜单（遮罩点击 / 再点「+」/ ESC 关闭）；三项均真可用，无假占位 -->\r\n'
    '            <div class="im-plus-mask" id="imPlusMask" onclick="imClosePlusMenu()"></div>\r\n'
    '            <div class="im-plus-menu" id="imPlusMenu">\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickImage()"><span class="nav-icon" data-icon="image" data-icon-size="22"></span><span>相册发图</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickCamera()"><span class="nav-icon" data-icon="camera" data-icon-size="22"></span><span>拍摄</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickLocation()"><span class="nav-icon" data-icon="map-pin" data-icon-size="22"></span><span>位置定位</span></div>\r\n'
    '            </div>\r\n'
)
new_menu = (
    '            <!-- R88-I：底部滑出的加号浮层菜单（遮罩点击 / 再点「+」/ ESC 关闭）；四项均真可用，无假占位 -->\r\n'
    '            <div class="im-plus-mask" id="imPlusMask" onclick="imClosePlusMenu()"></div>\r\n'
    '            <div class="im-plus-menu" id="imPlusMenu">\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickImage()"><span class="nav-icon" data-icon="image" data-icon-size="22"></span><span>相册发图</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickCamera()"><span class="nav-icon" data-icon="camera" data-icon-size="22"></span><span>拍摄</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickFile()"><span class="nav-icon" data-icon="file" data-icon-size="22"></span><span>发送文件</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickLocation()"><span class="nav-icon" data-icon="map-pin" data-icon-size="22"></span><span>定位</span></div>\r\n'
    '            </div>\r\n'
)
data = replace_once(data, old_menu.encode('utf-8'), new_menu.encode('utf-8'), 'menu items')

# ---- 3) 页尾脚本加 imPlusPickFile（插在 imPlusPickImage 之后） ----
old_fn = (
    "  /* ---------- 分支2：拍摄（capture 输入，桌面退化为文件选择，同走 imSendImage） ---------- */\r\n"
)
new_fn = (
    "  /* ---------- 分支1b：发送文件（不限类型，change→imSendFile(this)） ---------- */\r\n"
    "  window.imPlusPickFile = function () {\r\n"
    "    imClosePlusMenu();\r\n"
    "    var inp = $id('imFileInput');\r\n"
    "    if (!inp) { return; }\r\n"
    "    try { inp.value = ''; } catch (e) { /* 老 WebView 重置失败不影响发送 */ }\r\n"
    "    inp.click();\r\n"
    "  };\r\n"
    "\r\n"
    "  /* ---------- 分支2：拍摄（capture 输入，桌面退化为文件选择，同走 imSendImage） ---------- */\r\n"
)
data = replace_once(data, old_fn.encode('utf-8'), new_fn.encode('utf-8'), 'imPlusPickFile')

with open(PATH, 'wb') as f:
    f.write(data)

chk = read_bytes(PATH)
crlf2, lf2 = assert_crlf(chk)
assert chk.count(b'id="imFileInput"') == 1, 'imFileInput missing'
assert chk.count(b'imPlusPickFile') == 2, 'imPlusPickFile refs != 2'
assert chk.count(b'onchange="imSendFile(this)"') == 1, 'imSendFile onchange missing'
assert chk.count(b'<span>\xe5\x8f\x91\xe9\x80\x81\xe6\x96\x87\xe4\xbb\xb6</span>') == 1, 'send-file label missing'
assert chk.count(b'data-icon="file"') == 1, 'file icon ref missing'
assert chk.count(b'<span>\xe5\xae\x9a\xe4\xbd\x8d</span>') == 1, 'dingwei label missing'
open('tools/t02b_siliao_verify.txt','w',encoding='utf-8').write(
    'OK 私聊.html: %d -> %d B, CRLF=%d, loneLF=%d, items=%d\n' % (
        size0, len(chk), crlf2, lf2 - crlf2, chk.count(b'class="im-plus-item"')))
