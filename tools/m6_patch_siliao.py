# -*- coding: utf-8 -*-
"""R88-M6 补丁1：私聊.html #imPlusMenu 4 项 → 方案B「彩色图标+圆角方底」容器
在 .im-plus-ico（色块）内放 nav-icon；每项独立配色类（--i1..--i4）。
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

old_menu = (
    '            <div class="im-plus-menu" id="imPlusMenu">\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickImage()"><span class="nav-icon" data-icon="image" data-icon-size="22"></span><span>相册发图</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickCamera()"><span class="nav-icon" data-icon="camera" data-icon-size="22"></span><span>拍摄</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickFile()"><span class="nav-icon" data-icon="file" data-icon-size="22"></span><span>发送文件</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickLocation()"><span class="nav-icon" data-icon="map-pin" data-icon-size="22"></span><span>定位</span></div>\r\n'
    '            </div>\r\n'
)
new_menu = (
    '            <!-- R88-M6 方案B（2026-09-18）：每项 = 彩色圆角方底色块(.im-plus-ico) + 白色图标 + 文字。\r\n'
    '                 配色由 #imPlusCss 的 .im-plus-ico--i1..--i4 统一管理（成体系，非各写各的）。 -->\r\n'
    '            <div class="im-plus-menu" id="imPlusMenu">\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickImage()"><span class="im-plus-ico im-plus-ico--i1"><span class="nav-icon" data-icon="image" data-icon-size="22"></span></span><span class="im-plus-txt">相册发图</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickCamera()"><span class="im-plus-ico im-plus-ico--i2"><span class="nav-icon" data-icon="camera" data-icon-size="22"></span></span><span class="im-plus-txt">拍摄</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickFile()"><span class="im-plus-ico im-plus-ico--i3"><span class="nav-icon" data-icon="file" data-icon-size="22"></span></span><span class="im-plus-txt">发送文件</span></div>\r\n'
    '              <div class="im-plus-item" onclick="imPlusPickLocation()"><span class="im-plus-ico im-plus-ico--i4"><span class="nav-icon" data-icon="map-pin" data-icon-size="22"></span></span><span class="im-plus-txt">定位</span></div>\r\n'
    '            </div>\r\n'
)
data = replace_once(data, old_menu.encode('utf-8'), new_menu.encode('utf-8'), 'imPlusMenu items')

# 更新 #imPlusCss 里的 .im-plus-item 相关样式 → 加入色块体系
old_css = (
    "      '.im-plus-item{display:flex;align-items:center;gap:12px;padding:14px 22px;font-size:15px;color:var(--text,#1f2328);cursor:pointer}' +\r\n"
    "      '.im-plus-item:active{background:#f2f3f5}' +\r\n"
    "      '.im-plus-item .nav-icon{display:inline-flex;align-items:center;justify-content:center;color:var(--primary,#3b82f6)}' +\r\n"
)
new_css = (
    "      '.im-plus-item{display:flex;align-items:center;gap:12px;padding:12px 22px;font-size:15px;color:var(--text,#1f2328);cursor:pointer}' +\r\n"
    "      '.im-plus-item:active{background:#f2f3f5}' +\r\n"
    "      /* R88-M6 方案B：彩色圆角方底色块 + 白色图标（对齐微信「+」菜单）。 */\r\n"
    "      '.im-plus-ico{flex:0 0 auto;width:44px;height:44px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;color:#fff}' +\r\n"
    "      '.im-plus-ico .nav-icon{display:inline-flex;align-items:center;justify-content:center;color:#fff}' +\r\n"
    "      '.im-plus-ico .nav-icon svg{stroke:#fff}' +\r\n"
    "      '.im-plus-ico--i1{background:linear-gradient(135deg,#22c07a,#12a86a)}' +\r\n"
    "      '.im-plus-ico--i2{background:linear-gradient(135deg,#5b8def,#3f6fd8)}' +\r\n"
    "      '.im-plus-ico--i3{background:linear-gradient(135deg,#f2a93b,#e08a1e)}' +\r\n"
    "      '.im-plus-ico--i4{background:linear-gradient(135deg,#eb5757,#d13b3b)}' +\r\n"
    "      '.im-plus-txt{flex:1;min-width:0}' +\r\n"
    "      '@media (max-width:360px){.im-plus-ico{width:40px;height:40px;border-radius:10px}}' +\r\n"
)
data = replace_once(data, old_css.encode('utf-8'), new_css.encode('utf-8'), 'imPlusCss color block')

with open(PATH, 'wb') as f:
    f.write(data)

chk = read_bytes(PATH)
crlf2, lf2 = assert_crlf(chk)
assert chk.count(b'class="im-plus-ico ') == 4, 'im-plus-ico count != 4 : %d' % chk.count(b'class="im-plus-ico ')
assert chk.count(b'im-plus-ico--i1') == 2 and chk.count(b'im-plus-ico--i4') == 2, 'hue classes missing'
assert chk.count(b'.im-plus-ico--i1{') == 1, 'css hue missing'
open('tools/m6_siliao_verify.txt','w',encoding='utf-8').write(
    'OK 私聊.html: %d -> %d B, CRLF=%d, loneLF=%d\n' % (size0, len(chk), crlf2, lf2 - crlf2))
