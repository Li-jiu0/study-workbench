# -*- coding: utf-8 -*-
"""R88-M6 补丁2（WebView-safe 重写）：common.css 全局「更多/工具面板」方案B 彩色圆角方底色块
—— 不用 :has()（老 WebView 不支持）。改为让 .bm-icon 内的 .nav-icon[data-icon] 自身成为色块，
   属性选择器直接命中 data-icon 分组，兼容性极好。
"""
PATH = r'D:\下载的文件\学习工作台\assets\common.css'

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

old = (
    ".bottom-more-item .bm-icon { font-size: 24px; }\r\n"
    ".bottom-more-item .bm-label { font-size: 11px; color: var(--text-secondary); font-weight: 500; }\r\n"
)
new = (
    ".bottom-more-item .bm-icon { font-size: 24px; }\r\n"
    ".bottom-more-item .bm-label { font-size: 11px; color: var(--text-secondary); font-weight: 500; }\r\n"
    "/* ============================================================\r\n"
    "   R88-M6 方案B（2026-09-18）：图标「彩色圆角方底」容器（微信「+」菜单风格）。\r\n"
    "   一处定义、全树生效（#morePanel / #toolsPanel 40+ 页复用同一 .bm-icon>.nav-icon 结构）。\r\n"
    "   实现：让 .nav-icon[data-icon] 自身成为色块（属性选择器分组配色）。\r\n"
    "   兼容性：仅用属性选择器 + flex + 渐变，无 :has() / clamp()，老 WebView 安全。\r\n"
    "   ------------------------------------------------ */\r\n"
    ".bottom-more-item .bm-icon > .nav-icon {\r\n"
    "  width: 44px;\r\n"
    "  height: 44px;\r\n"
    "  border-radius: 12px;\r\n"
    "  display: inline-flex;\r\n"
    "  align-items: center;\r\n"
    "  justify-content: center;\r\n"
    "  color: #fff;\r\n"
    "  background: linear-gradient(135deg, #5b8def, #3f6fd8); /* 默认蓝（未分组图标） */\r\n"
    "}\r\n"
    ".bottom-more-item .bm-icon > .nav-icon > svg { stroke: #fff; width: 22px; height: 22px; }\r\n"
    "/* 绿色系：学习 / 成长 / 内容 */\r\n"
    ".bm-icon > .nav-icon[data-icon=\"rss\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"book\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"book-open\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"bookmark\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"target\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"chart-bar\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"trophy\"] { background: linear-gradient(135deg, #22c07a, #12a86a); }\r\n"
    "/* 蓝色系：工具 / 媒体 / AI */\r\n"
    ".bm-icon > .nav-icon[data-icon=\"mic\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"image\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"file\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"bot\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"upload\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"clipboard\"] { background: linear-gradient(135deg, #5b8def, #3f6fd8); }\r\n"
    "/* 橙 / 琥珀系：设置 / 资料 / 录入 */\r\n"
    ".bm-icon > .nav-icon[data-icon=\"settings\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"user\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"users\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"info\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"package\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"inbox\"] { background: linear-gradient(135deg, #f2a93b, #e08a1e); }\r\n"
    "/* 红 / 珊瑚系：提醒 / 反馈 */\r\n"
    ".bm-icon > .nav-icon[data-icon=\"bell\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"sparkles\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"help-circle\"],\r\n"
    ".bm-icon > .nav-icon[data-icon=\"headphones\"] { background: linear-gradient(135deg, #eb5757, #d13b3b); }\r\n"
    "@media (max-width: 360px) {\r\n"
    "  .bottom-more-item .bm-icon > .nav-icon { width: 40px; height: 40px; border-radius: 10px; }\r\n"
    "}\r\n"
)
data = replace_once(data, old.encode('utf-8'), new.encode('utf-8'), 'bm-icon block')

with open(PATH, 'wb') as f:
    f.write(data)

chk = read_bytes(PATH)
crlf2, lf2 = assert_crlf(chk)
assert chk.count(b'R88-M6 ') == 1, 'marker missing'
assert chk.count(b'.bm-icon > .nav-icon[data-icon=') >= 20, 'palette groups missing: %d' % chk.count(b'.bm-icon > .nav-icon[data-icon=')
assert b':has(' not in chk, 'banned :has() present'
open('tools/m6_commoncss_verify.txt','w',encoding='utf-8').write(
    'OK common.css: %d -> %d B, CRLF=%d, loneLF=%d, groups=%d\n' % (
        size0, len(chk), crlf2, lf2 - crlf2, chk.count(b'.bm-icon > .nav-icon[data-icon=')))
