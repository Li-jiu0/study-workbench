# -*- coding: utf-8 -*-
"""R90 item3 - patch B: 私聊.html composer 窄屏不换行 + .im-plus-ico--i4 处置说明."""
import os

P = 'D:/下载的文件/学习工作台/私聊.html'
raw = open(P, 'rb').read()
CRLF = b'\r\n'


def L(*lines):
    return CRLF.join([l if isinstance(l, bytes) else l.encode('utf-8') for l in lines]) + CRLF


# 在 .im-send 规则后追加窄屏适配（输入栏多一个图标后，320~360px 需压缩内边距/尺寸防换行）
old = (
    '  .im-send{height:44px;padding:0 18px;border:none;border-radius:12px;'
    'background:linear-gradient(90deg,var(--primary),var(--accent));color:#fff;cursor:pointer;flex-shrink:0}\r\n'
).encode('utf-8')
new = (
    '  .im-send{height:44px;padding:0 18px;border:none;border-radius:12px;'
    'background:linear-gradient(90deg,var(--primary),var(--accent));color:#fff;cursor:pointer;flex-shrink:0}\r\n'
    '  /* R90 item3：输入栏新增「定位」图标后，窄屏（≤360px）压缩图标与间距，保证整排不换行、不溢出。'
    '固定值 + @media，禁 clamp/min/max。 */\r\n'
    '  @media (max-width:360px){\r\n'
    '    .im-composer{gap:6px;padding:8px 8px}\r\n'
    '    .im-composer .im-icon{width:38px;height:38px}\r\n'
    '    .im-composer .im-send{height:38px;padding:0 12px}\r\n'
    '    .im-composer textarea{height:38px;padding:8px 10px}\r\n'
    '  }\r\n'
).encode('utf-8')
assert raw.count(old) == 1, ('B anchor', raw.count(old))
out = raw.replace(old, new)

# .im-plus-ico--i4 处置：保留规则但加注释说明已无 DOM 引用（避免「删了 DOM 留死样式」的不一致；
# 保留以便后续若恢复定位项直接可用；此处显式标注停用状态。）
old_i4 = (
    "      '.im-plus-ico--i4{background:linear-gradient(135deg,#eb5757,#d13b3b)}' +\r\n"
).encode('utf-8')
new_i4 = (
    "      /* R90 item3：.im-plus-ico--i4 原为「定位」项配色；该项已移出加号菜单（改到输入栏 #imLocBtn），\r\n"
    "         此规则当前无 DOM 引用。按「最小变更 + 可复用」保留规则本体，仅此注释标注停用。 */\r\n"
    "      '.im-plus-ico--i4{background:linear-gradient(135deg,#eb5757,#d13b3b)}' +\r\n"
).encode('utf-8')
assert out.count(old_i4) == 1, ('B2 anchor', out.count(old_i4))
out = out.replace(old_i4, new_i4)

assert out != raw
open(P, 'wb').write(out)
b = open(P, 'rb').read()
crlf = b.count(b'\r\n'); lf = b.count(b'\n') - crlf; cr = b.count(b'\r') - crlf
print('B ok bytes', len(b), 'crlf', crlf, 'loneLF', lf, 'loneCR', cr)
print('media360 ->', b.count(b'@media (max-width:360px){\r\n    .im-composer'))
print('i4 kept ->', b.count(b"'.im-plus-ico--i4{background"))
