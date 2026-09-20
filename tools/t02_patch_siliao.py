# -*- coding: utf-8 -*-
"""T02 线A 补丁：私聊.html（CRLF 二进制读写）
1) L167 发图按钮 -> 「+」按钮 #imPlusBtn（data-icon=plus, onclick=imTogglePlusMenu()）
2) .im-composer 内新增隐藏拍摄 input #imCameraInput
3) 新增浮层菜单 #imPlusMenu（相册发图 / 拍摄 / 位置定位）
4) 补引入 xt-region.js（放在 config.js 之后）
5) 页尾新增 imTogglePlusMenu / imPickLocation / 手动输入弹层 脚本
"""
import sys

PATH = r'D:\下载的文件\学习工作台\私聊.html'

def read_bytes(p):
    with open(p, 'rb') as f:
        return f.read()

def write_bytes(p, b):
    with open(p, 'wb') as f:
        f.write(b)

def assert_crlf(b):
    crlf = b.count(b'\r\n')
    lf = b.count(b'\n')
    lone = lf - crlf
    assert lone == 0, 'loneLF != 0 : %d' % lone
    return crlf, lf

def replace_once(data, old, new, label):
    cnt = data.count(old)
    assert cnt == 1, 'anchor [%s] count=%d (expect 1)' % (label, cnt)
    return data.replace(old, new, 1)

data = read_bytes(PATH)
crlf0, lf0 = assert_crlf(data)
size0 = len(data)

# ---------- 1) 发图按钮 -> 「+」按钮 + 隐藏拍摄 input ----------
old_btn = (
    '            <button class="im-icon" title="发送图片" onclick="imPickImage()">'
    '<span class="nav-icon" data-icon="image" data-icon-size="20"></span></button>\r\n'
    '            <input type="file" id="imImgInput" accept="image/*" style="display:none" onchange="imSendImage(this)">\r\n'
)
new_btn = (
    '            <!-- R88-I（2026-09-18）：发图按钮改「+」浮层菜单入口（相册发图 / 拍摄 / 位置定位）。\r\n'
    '                 原 #imImgInput 与 onchange=\"imSendImage(this)\" 原样保留，菜单「相册发图」仍走同一条链路。 -->\r\n'
    '            <button class="im-icon" id="imPlusBtn" title="更多" onclick="imTogglePlusMenu()">'
    '<span class="nav-icon" data-icon="plus" data-icon-size="20"></span></button>\r\n'
    '            <input type="file" id="imImgInput" accept="image/*" style="display:none" onchange="imSendImage(this)">\r\n'
    '            <!-- R88-I：拍摄入口（capture 移动端直调相机；桌面退化为文件选择，同走 imSendImage 链路；不用 getUserMedia） -->\r\n'
    '            <input type="file" id="imCameraInput" accept="image/*" capture="environment" style="display:none" onchange="imSendImage(this)">\r\n'
    '            <!-- R88-I：底部滑出的加号浮层菜单（遮罩点击 / 再点「+」/ ESC 关闭）；三项均真可用，无假占位 -->\r\n'
    '            <div class="im-plus-mask" id="imPlusMask" onclick="imClosePlusMenu()"></div>\r\n'
    '            <div class="im-plus-menu" id="imPlusMenu">\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickImage()"><span class="nav-icon" data-icon="image" data-icon-size="22"></span><span>相册发图</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickCamera()"><span class="nav-icon" data-icon="camera" data-icon-size="22"></span><span>拍摄</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickLocation()"><span class="nav-icon" data-icon="map-pin" data-icon-size="22"></span><span>位置定位</span></div>\r\n'
    '            </div>\r\n'
)
data = replace_once(data, old_btn.encode('utf-8'), new_btn.encode('utf-8'), 'composer button')

# ---------- 2) 补引入 xt-region.js（config.js 之后） ----------
old_script = '<script src="assets/config.js?v=20260916O" defer></script>\r\n'
new_script = (
    '<script src="assets/config.js?v=20260916O" defer></script>\r\n'
    '<!-- R88-H（2026-09-18）：位置能力底座 XT_LOC_PICK（跟 config.js，先于 chat-local.js，确保调用前就绪） -->\r\n'
    '<script src="assets/xt-region.js?v=20260918a" defer></script>\r\n'
)
data = replace_once(data, old_script.encode('utf-8'), new_script.encode('utf-8'), 'config script')

# ---------- 3) 页尾新增脚本（插在 AI 脚本之前） ----------
old_tail = '<script src="assets/ai-config.js?v=20260918c"></script>\r\n'
new_tail = (
    '<script>\r\n'
    '/* =====================================================================\r\n'
    '   R88-I（2026-09-18）：私聊输入栏「+」浮层菜单（相册发图 / 拍摄 / 位置定位）\r\n'
    '   - 菜单开关：imTogglePlusMenu / imOpenPlusMenu / imClosePlusMenu（点遮罩、再点「+」、ESC 关闭）\r\n'
    '   - 相册发图 → imPickImage()（既有链路，不改）；拍摄 → #imCameraInput；位置 → imPickLocation()\r\n'
    '   - 位置定位复用 window.XT_LOC_PICK.pick，手动兜底用本页自建轻量输入弹层（❗禁用 window.prompt）\r\n'
    '   ES2017 上限：仅 var + function，无 ?. / ?? / 模板串 / 箭头函数。\r\n'
    '   ===================================================================== */\r\n'
    '(function () {\r\n'
    '  \'use strict\';\r\n'
    '  function $id(x) { return document.getElementById(x); }\r\n'
    '\r\n'
    '  /* ---------- 菜单开关 ---------- */\r\n'
    '  function imOpenPlusMenu() {\r\n'
    '    var m = $id(\'imPlusMenu\');\r\n'
    '    var mask = $id(\'imPlusMask\');\r\n'
    '    if (!m) return;\r\n'
    '    m.classList.add(\'open\');\r\n'
    '    if (mask) mask.classList.add(\'open\');\r\n'
    '  }\r\n'
    '  function imClosePlusMenu() {\r\n'
    '    var m = $id(\'imPlusMenu\');\r\n'
    '    var mask = $id(\'imPlusMask\');\r\n'
    '    if (m) m.classList.remove(\'open\');\r\n'
    '    if (mask) mask.classList.remove(\'open\');\r\n'
    '  }\r\n'
    '  window.imOpenPlusMenu = imOpenPlusMenu;\r\n'
    '  window.imClosePlusMenu = imClosePlusMenu;\r\n'
    '  window.imTogglePlusMenu = function () {\r\n'
    '    var m = $id(\'imPlusMenu\');\r\n'
    '    if (!m) return;\r\n'
    '    if (m.classList.contains(\'open\')) imClosePlusMenu();\r\n'
    '    else imOpenPlusMenu();\r\n'
    '  };\r\n'
    '\r\n'
    '  /* ---------- 分支1：相册发图（走既有 imPickImage 链路，不回归） ---------- */\r\n'
    '  window.imPlusPickImage = function () {\r\n'
    '    imClosePlusMenu();\r\n'
    '    if (typeof window.imPickImage === \'function\') window.imPickImage();\r\n'
    '  };\r\n'
    '\r\n'
    '  /* ---------- 分支2：拍摄（capture 输入，桌面退化为文件选择，同走 imSendImage） ---------- */\r\n'
    '  window.imPlusPickCamera = function () {\r\n'
    '    imClosePlusMenu();\r\n'
    '    var inp = $id(\'imCameraInput\');\r\n'
    '    if (!inp) {\r\n'
    '      // 无输入控件时回落相册链路（保证永不假按钮）\r\n'
    '      if (typeof window.imPickImage === \'function\') window.imPickImage();\r\n'
    '      return;\r\n'
    '    }\r\n'
    '    try { inp.value = \'\'; } catch (e) { /* 老 WebView 重置失败不影响发送 */ }\r\n'
    '    inp.click();\r\n'
    '  };\r\n'
    '\r\n'
    '  /* ---------- 手动输入弹层（❗禁用 window.prompt；本页轻量 sheet，随 .im- 风格） ---------- */\r\n'
    '  function imShowLocInput(title, placeholder, cb) {\r\n'
    '    var wrap = document.createElement(\'div\');\r\n'
    '    wrap.className = \'im-loc-sheet\'\r\n'
    '    var t = (title || \'所在位置\');\r\n'
    '    var ph = (placeholder || \'如：图书馆 / 自习室\');\r\n'
    '    var html = \'\';\r\n'
    '    html += \'<div class="im-loc-sheet-mask"></div>\';\r\n'
    '    html += \'<div class="im-loc-sheet-body" role="dialog" aria-modal="true">\';\r\n'
    '    html += \'<div class="im-loc-sheet-title">\' + t + \'</div>\';\r\n'
    '    html += \'<input class="im-loc-sheet-input" type="text" maxlength="64" placeholder="\' + ph + \'">\';\r\n'
    '    html += \'<div class="im-loc-sheet-acts">\';\r\n'
    '    html += \'<button type="button" class="im-loc-sheet-btn cancel">取消</button>\';\r\n'
    '    html += \'<button type="button" class="im-loc-sheet-btn ok">确定</button>\';\r\n'
    '    html += \'</div></div>\';\r\n'
    '    wrap.innerHTML = html;\r\n'
    '    document.body.appendChild(wrap);\r\n'
    '    var input = wrap.querySelector(\'.im-loc-sheet-input\');\r\n'
    '    var done = false;\r\n'
    '    function close() {\r\n'
    '      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);\r\n'
    '      document.removeEventListener(\'keydown\', onKey);\r\n'
    '    }\r\n'
    '    function finish(v) {\r\n'
    '      if (done) return;\r\n'
    '      done = true;\r\n'
    '      close();\r\n'
    '      if (typeof cb === \'function\') cb(v);\r\n'
    '    }\r\n'
    '    function onKey(e) {\r\n'
    '      var k = e && e.key;\r\n'
    '      if (k === \'Escape\' || k === \'Esc\') finish(\'\');\r\n'
    '      else if (k === \'Enter\') finish((input.value || \'\').trim());\r\n'
    '    }\r\n'
    '    wrap.querySelector(\'.im-loc-sheet-mask\').addEventListener(\'click\', function () { finish(\'\'); });\r\n'
    '    wrap.querySelector(\'.im-loc-sheet-btn.cancel\').addEventListener(\'click\', function () { finish(\'\'); });\r\n'
    '    wrap.querySelector(\'.im-loc-sheet-btn.ok\').addEventListener(\'click\', function () { finish((input.value || \'\').trim()); });\r\n'
    '    input.addEventListener(\'keydown\', function (e) { if (e && e.key === \'Enter\') { try { e.preventDefault(); } catch (_e) {} finish((input.value || \'\').trim()); } });\r\n'
    '    document.addEventListener(\'keydown\', onKey);\r\n'
    '    setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);\r\n'
    '    // 暴露关闭入口（外链调用可复用）\r\n'
    '    wrap.__imClose = function () { finish(\'\'); };\r\n'
    '  }\r\n'
    '  window.imShowLocInput = imShowLocInput;\r\n'
    '\r\n'
    '  /* ---------- 分支3：位置定位（XT_LOC_PICK 主入口 + 手动兜底） ---------- */\r\n'
    '  window.imPlusPickLocation = function () {\r\n'
    '    imClosePlusMenu();\r\n'
    '    if (typeof window.imPickLocation === \'function\') { window.imPickLocation(); return; }\r\n'
    '    onLoc(\'所在位置\');\r\n'
    '  };\r\n'
    '\r\n'
    '  /* 调 XT_LOC_PICK.pick → 成功即 imSendLocation(text)；失败由底座调 onManual 兜底 */\r\n'
    '  function onLoc(fallbackTitle) {\r\n'
    '    if (!window.XT_LOC_PICK || typeof window.XT_LOC_PICK.pick !== \'function\') {\r\n'
    '      // 底座缺失：直接走手动输入（绝不落坐标、绝不原生弹窗）\r\n'
    '      imShowLocInput(fallbackTitle || \'所在位置\', \'如：图书馆 / 自习室\', function (v) {\r\n'
    '        var t = (v || \'\').replace(/^\\s+|\\s+$/g, \'\');\r\n'
    '        if (t && typeof window.imSendLocation === \'function\') window.imSendLocation(t);\r\n'
    '      });\r\n'
    '      return;\r\n'
    '    }\r\n'
    '    var opts = {\r\n'
    '      fallbackTitle: fallbackTitle || \'所在位置\',\r\n'
    '      onManual: function (title, placeholder, cb) { imShowLocInput(title, placeholder, cb); }\r\n'
    '    };\r\n'
    '    window.XT_LOC_PICK.pick(opts, function (r) {\r\n'
    '      if (r && r.text && typeof window.imSendLocation === \'function\') window.imSendLocation(r.text);\r\n'
    '    });\r\n'
    '  }\r\n'
    '  window.imPickLocation = function () { onLoc(\'所在位置\'); };\r\n'
    '\r\n'
    '  /* ---------- 样式注入（.im- 前缀，随本页风格；只用固定值 + @media，禁 clamp/min/max） ---------- */\r\n'
    '  function injectCss() {\r\n'
    '    if ($id(\'imPlusCss\')) return;\r\n'
    '    var st = document.createElement(\'style\');\r\n'
    '    st.id = \'imPlusCss\';\r\n'
    '    st.textContent =\r\n'
    '      \'.im-plus-mask{position:fixed;inset:0;background:rgba(0,0,0,.35);opacity:0;visibility:hidden;transition:opacity .2s ease;z-index:60}\' +\r\n'
    '      \'.im-plus-mask.open{opacity:1;visibility:visible}\' +\r\n'
    '      \'.im-plus-menu{position:fixed;left:0;right:0;bottom:0;background:#fff;border-radius:16px 16px 0 0;padding:10px 0 16px;box-shadow:0 -6px 24px rgba(0,0,0,.12);transform:translateY(110%);transition:transform .24s ease;z-index:61;max-width:520px;margin:0 auto}\' +\r\n'
    '      \'.im-plus-menu.open{transform:translateY(0)}\' +\r\n'
    '      \'.im-plus-item{display:flex;align-items:center;gap:12px;padding:14px 22px;font-size:15px;color:var(--text,#1f2328);cursor:pointer}\' +\r\n'
    '      \'.im-plus-item:active{background:#f2f3f5}\' +\r\n'
    '      \'.im-plus-item .nav-icon{display:inline-flex;align-items:center;justify-content:center;color:var(--primary,#3b82f6)}\' +\r\n'
    '      \'.im-loc-sheet{position:fixed;inset:0;z-index:80}\' +\r\n'
    '      \'.im-loc-sheet-mask{position:absolute;inset:0;background:rgba(0,0,0,.35)}\' +\r\n'
    '      \'.im-loc-sheet-body{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:86%;max-width:360px;background:#fff;border-radius:14px;padding:18px 18px 14px;box-shadow:0 8px 30px rgba(0,0,0,.2)}\' +\r\n'
    '      \'.im-loc-sheet-title{font-size:15px;font-weight:700;color:var(--text,#1f2328);margin-bottom:12px}\' +\r\n'
    '      \'.im-loc-sheet-input{width:100%;box-sizing:border-box;height:42px;padding:0 12px;border:1px solid #dcdfe6;border-radius:10px;font-size:14px;outline:none;color:var(--text,#1f2328)}\' +\r\n'
    '      \'.im-loc-sheet-input:focus{border-color:var(--primary,#3b82f6)}\' +\r\n'
    '      \'.im-loc-sheet-acts{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}\' +\r\n'
    '      \'.im-loc-sheet-btn{height:38px;padding:0 18px;border:none;border-radius:10px;font-size:14px;cursor:pointer}\' +\r\n'
    '      \'.im-loc-sheet-btn.cancel{background:#f2f3f5;color:#666}\' +\r\n'
    '      \'.im-loc-sheet-btn.ok{background:var(--primary,#3b82f6);color:#fff}\';\r\n'
    '    document.head.appendChild(st);\r\n'
    '  }\r\n'
    '\r\n'
    '  function boot() {\r\n'
    '    injectCss();\r\n'
    '    // ESC 关闭 + 点击消息区外收起\r\n'
    '    document.addEventListener(\'keydown\', function (e) {\r\n'
    '      var k = e && e.key;\r\n'
    '      if (k === \'Escape\' || k === \'Esc\') imClosePlusMenu();\r\n'
    '    });\r\n'
    '    // 图片图标水合（菜单内 nav-icon 由 icon-map.js autoRender 处理；此处兜底手动水合一次）\r\n'
    '    if (typeof window.lucideAutoRender === \'function\') {\r\n'
    '      try { window.lucideAutoRender(); } catch (e) { /* 忽略 */ }\r\n'
    '    }\r\n'
    '  }\r\n'
    '  if (document.readyState === \'loading\') document.addEventListener(\'DOMContentLoaded\', boot);\r\n'
    '  else boot();\r\n'
    '})();\r\n'
    '</script>\r\n'
    '<script src="assets/ai-config.js?v=20260918c"></script>\r\n'
)
data = replace_once(data, old_tail.encode('utf-8'), new_tail.encode('utf-8'), 'tail script')

# ---------- 复验 ----------
crlf1, lf1 = assert_crlf(data)
assert crlf1 > crlf0, 'no new lines?'
write_bytes(PATH, data)

# 复读复验
chk = read_bytes(PATH)
crlf2, lf2 = assert_crlf(chk)
assert crlf2 == crlf1, 'CRLF count changed after write'
assert len(chk) == len(data), 'size mismatch'
assert chk.count(b'id="imPlusBtn"') == 1, 'imPlusBtn missing'
assert chk.count(b'id="imPlusMenu"') == 1, 'imPlusMenu missing'
assert chk.count(b'id="imImgInput"') == 1, 'imImgInput missing'
assert chk.count(b'id="imCameraInput"') == 1, 'imCameraInput missing'
assert chk.count(b'onchange="imSendImage(this)"') == 2, 'imSendImage onchange != 2'
assert chk.count(b'xt-region.js?v=20260918a') == 1, 'xt-region not added'
assert b'imPickLocation' in chk and b'imTogglePlusMenu' in chk
print('OK 私聊.html: %d -> %d B, CRLF=%d, loneLF=%d' % (size0, len(chk), crlf2, lf2 - crlf2))
