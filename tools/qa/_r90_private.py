# -*- coding: utf-8 -*-
"""R90 item3 - patch A: 私聊.html (CRLF) DOM changes.
动作1: 删 #imPlusMenu 的「定位」项 (L183)
动作2: 在输入栏加独立「定位」按钮（复用 .im-icon + imPlusPickLocation）
"""
import os

P = 'D:/下载的文件/学习工作台/私聊.html'
raw = open(P, 'rb').read()
CRLF = b'\r\n'


def L(*lines):
    body = CRLF.join([l if isinstance(l, bytes) else l.encode('utf-8') for l in lines])
    return body + CRLF


# ---------- 动作1: 删除 L183 定位项 ----------
old_item = (
    '              <div class="im-plus-item" onclick="imPlusPickLocation()">'
    '<span class="im-plus-ico im-plus-ico--i4">'
    '<span class="nav-icon" data-icon="map-pin" data-icon-size="22"></span></span>'
    '<span class="im-plus-txt">定位</span></div>\r\n'
).encode('utf-8')
assert raw.count(old_item) == 1, ('A1 anchor', raw.count(old_item))
out = raw.replace(old_item, b'')

# ---------- 动作1b: 更新上方注释（原写「四项」，删后为三项） ----------
old_cmt = '            <!-- R88-I：底部滑出的加号浮层菜单（遮罩点击 / 再点「+」/ ESC 关闭）；四项均真可用，无假占位 -->\r\n'.encode('utf-8')
new_cmt = (
    '            <!-- R88-I：底部滑出的加号浮层菜单（遮罩点击 / 再点「+」/ ESC 关闭）；各项均真可用，无假占位 -->\r\n'
    '            <!-- R90 item3：原第 4 项「定位」按用户诉求移出加号菜单，改为输入栏独立图标按钮（见 #imLocBtn，'
    '仍走 imPlusPickLocation）。加号菜单现为 3 项。 -->\r\n'
).encode('utf-8')
assert out.count(old_cmt) == 1, ('A1b anchor', out.count(old_cmt))
out = out.replace(old_cmt, new_cmt)

# ---------- 动作1c: 更新配色注释（--i4 已无引用） ----------
old_cmt2 = (
    '            <!-- R88-M6 方案B（2026-09-18）：每项 = 彩色圆角方底色块(.im-plus-ico) + 白色图标 + 文字。\r\n'
    '                 配色由 #imPlusCss 的 .im-plus-ico--i1..--i4 统一管理（成体系，非各写各的）。 -->\r\n'
).encode('utf-8')
new_cmt2 = (
    '            <!-- R88-M6 方案B（2026-09-18）：每项 = 彩色圆角方底色块(.im-plus-ico) + 白色图标 + 文字。\r\n'
    '                 配色由 #imPlusCss 的 .im-plus-ico--i1..--i3 统一管理（成体系，非各写各的）。\r\n'
    '                 R90 item3：--i4 随「定位」项一同停用（DOM 已移除，样式规则保留待复用，见 injectCss 注释）。 -->\r\n'
).encode('utf-8')
assert out.count(old_cmt2) == 1, ('A1c anchor', out.count(old_cmt2))
out = out.replace(old_cmt2, new_cmt2)

# ---------- 动作2: 在 #imPlusBtn 之后加独立定位按钮 ----------
old_plus_btn = (
    '            <button class="im-icon" id="imPlusBtn" title="更多" onclick="imTogglePlusMenu()">'
    '<span class="nav-icon" data-icon="plus" data-icon-size="20"></span></button>\r\n'
).encode('utf-8')
new_plus_btn = (
    '            <button class="im-icon" id="imPlusBtn" title="更多" onclick="imTogglePlusMenu()">'
    '<span class="nav-icon" data-icon="plus" data-icon-size="20"></span></button>\r\n'
    '            <!-- R90 item3：把「定位」从加号菜单移到这里（输入栏图标排），紧邻「所在位置」语义入口。\r\n'
    '                 复用既有 .im-icon 类（不新造样式）；点击仍走 imPlusPickLocation()（XT_LOC_PICK.openPicker）。 -->\r\n'
    '            <button class="im-icon" id="imLocBtn" title="定位" onclick="imPlusPickLocation()">'
    '<span class="nav-icon" data-icon="map-pin" data-icon-size="20"></span></button>\r\n'
).encode('utf-8')
assert out.count(old_plus_btn) == 1, ('A2 anchor', out.count(old_plus_btn))
out = out.replace(old_plus_btn, new_plus_btn)

assert out != raw
open(P, 'wb').write(out)
b = open(P, 'rb').read()
crlf = b.count(b'\r\n'); lf = b.count(b'\n') - crlf; cr = b.count(b'\r') - crlf
print('A ok bytes', len(b), 'crlf', crlf, 'loneLF', lf, 'loneCR', cr)
for probe in [b'id="imLocBtn"', b'im-plus-ico--i4"><span class="nav-icon" data-icon="map-pin"',
              b'im-plus-txt">\xe5\xae\x9a\xe4\xbd\x8d</span>']:
    print(probe[:50], '->', b.count(probe))
