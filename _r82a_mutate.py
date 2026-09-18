# -*- coding: utf-8 -*-
"""R82：动态空间页图标优化 —— emoji 图标统一替换为项目 lucide data-icon 体系。
动态空间.html：静态 emoji（‹ 🖼 ↺ 👤 ›）→ <span class="nav-icon" data-icon="...">，并补全内联图标适配 CSS；
xt-moments.js：新增 ico() 助手（走同一套 LUCIDE_ICONS 字典，取不到回落原 emoji），
               替换动态渲染的心形/评论/关闭/可见范围图标；
xt-moments.css：新增 .xtm-ico（动态插入图标的对齐/描边，两页共用所属「动态族」样式文件）。
二进制字节级替换，CRLF 保持。
"""
import os
import shutil

ROOT = r'D:\下载的文件\学习工作台'
BAK = '.bak-pre-r82-20260917'


def P(rel):
    return os.path.join(ROOT, rel)


def rb(p):
    with open(p, 'rb') as f:
        return f.read()


def wb(p, b):
    with open(p, 'wb') as f:
        f.write(b)


def rep(data, old, new, expect):
    cnt = data.count(old)
    assert cnt == expect, 'COUNT MISMATCH %r: got %d expect %d' % (old[:70], cnt, expect)
    return data.replace(old, new)


def crlf_ok(data):
    return data.count(b'\r\n') == data.count(b'\n')


def blk(lines):
    return ('\r\n'.join(lines) + '\r\n').encode('utf-8')


def log(m):
    print(m)


# ---------- 0. 备份 ----------
targets = ['动态空间.html', r'assets\xt-moments.css', r'assets\xt-moments.js']
for t in targets:
    src = P(t)
    assert os.path.exists(src), 'missing ' + t
    shutil.copyfile(src, src + BAK)
log('BACKUP done: %d files -> *%s' % (len(targets), BAK))

SPAN_FMT = '<span class="nav-icon" data-icon="%s"></span>'

# ---------- 1. 动态空间.html ----------
hp = P('动态空间.html')
h = rb(hp)
assert crlf_ok(h), '动态空间.html bareLF'

# 1a. 顶部返回箭头 ‹ → chevron-left
h = rep(h,
        '<button class="xtm-nav-btn" id="xtmBack" type="button" title="返回" aria-label="返回">‹</button>'.encode('utf-8'),
        ('<button class="xtm-nav-btn" id="xtmBack" type="button" title="返回" aria-label="返回">'
         + SPAN_FMT % 'chevron-left' + '</button>').encode('utf-8'), 1)

# 1b. 换背景 🖼 → image
old_bgbtn = '<button class="xtm-hero-btn" id="xtmBgBtn" type="button" title="更换页顶背景" aria-label="换背景">🖼</button>'.encode('utf-8')
new_bgbtn = ('<button class="xtm-hero-btn" id="xtmBgBtn" type="button" title="更换页顶背景" aria-label="换背景">'
             + SPAN_FMT % 'image' + '</button>').encode('utf-8')
h = rep(h, old_bgbtn, new_bgbtn, 1)

# 1c. 恢复默认 ↺ → rotate-ccw
old_reset = '<button class="xtm-hero-btn" id="xtmBgReset" type="button" title="恢复默认背景" aria-label="还原背景" style="display:none">↺</button>'.encode('utf-8')
new_reset = ('<button class="xtm-hero-btn" id="xtmBgReset" type="button" title="恢复默认背景" aria-label="还原背景" style="display:none">'
             + SPAN_FMT % 'rotate-ccw' + '</button>').encode('utf-8')
h = rep(h, old_reset, new_reset, 1)

# 1d. 列表行头像位 👤 → user
h = rep(h, '<div class="xtm-listrow-icon">👤</div>'.encode('utf-8'),
        ('<div class="xtm-listrow-icon">' + SPAN_FMT % 'user' + '</div>').encode('utf-8'), 1)

# 1e. 列表行右箭头 › → chevron-right
h = rep(h, '<div class="xtm-listrow-arrow">›</div>'.encode('utf-8'),
        ('<div class="xtm-listrow-arrow">' + SPAN_FMT % 'chevron-right' + '</div>').encode('utf-8'), 1)

# 1f. 注释内的 emoji 指涉改写成图标名（保持注释可读且不含 emoji）
h = rep(h, '         🖼 换背景（本地图片 ≤2MB，dataURL 存 localStorage study_workbench_moments_bg，逻辑在 assets/xt-moments.js）'.encode('utf-8'),
        '         换背景按钮图标=data-icon「image」：本地图片 ≤2MB，dataURL 存 localStorage study_workbench_moments_bg，逻辑在 assets/xt-moments.js'.encode('utf-8'), 1)
h = rep(h, '         ↺ 一键还原默认（清 localStorage 背景键）；有背景时遮罩层保证文字可读。 -->'.encode('utf-8'),
        '         一键还原默认按钮图标=data-icon「rotate-ccw」（清 localStorage 背景键）；有背景时遮罩层保证文字可读。 -->'.encode('utf-8'), 1)

# 1g. 内联样式块：lucide 图标适配（沿用页面内联样式口径，不动公共 CSS）
old_style_tail = blk([
    '  .xtm-listrow-arrow{color:var(--text-secondary);font-size:20px;flex-shrink:0;padding-left:6px}',
    '</style>',
])
new_style_tail = blk([
    '  .xtm-listrow-arrow{color:var(--text-secondary);font-size:20px;flex-shrink:0;padding-left:6px}',
    '  /* R82：lucide 图标适配（沿用页面内联样式口径；等宽描边随语义取色，不改公共 CSS） */',
    '  .xtm-nav-btn .nav-icon, .xtm-hero-btn .nav-icon, .xtm-listrow-icon .nav-icon{display:flex;align-items:center;justify-content:center}',
    '  .xtm-hero-btn .nav-icon svg{stroke:#fff}',
    '  .xtm-listrow-icon .nav-icon svg{stroke:var(--primary)}',
    '  .xtm-listrow-arrow .nav-icon{display:flex;align-items:center}',
    '  .xtm-listrow-arrow .nav-icon svg{stroke:var(--text-secondary)}',
    '</style>',
])
h = rep(h, old_style_tail, new_style_tail, 1)

for tok in ['‹', '🖼', '↺', '👤', '›']:
    assert tok.encode('utf-8') not in h, 'emoji 残留 ' + tok
for nm in ['chevron-left', 'image', 'rotate-ccw', 'chevron-right']:
    tok = ('<span class="nav-icon" data-icon="' + nm + '"></span>').encode('utf-8')
    assert h.count(tok) == 1, '新增 data-icon 计数异常: ' + nm
# user 图标名在侧栏「个人中心」项已存在同名用法，故按完整上下文断言（列表行内新增 1 处）
assert h.count('<div class="xtm-listrow-icon"><span class="nav-icon" data-icon="user"></span></div>'.encode('utf-8')) == 1
assert crlf_ok(h)
wb(hp, h)
log('UPDATE 动态空间.html bytes=%d' % len(h))

# ---------- 2. assets/xt-moments.js ----------
jp = P(r'assets\xt-moments.js')
j = rb(jp)
assert crlf_ok(j), 'xt-moments.js bareLF'

# 2a. 新增 ico() 助手（IIFE 内私有函数，不产生全局名）
old_pad = '  function pad2(n) { return (n < 10 ? \'0\' : \'\') + n; }\r\n'.encode('utf-8')
new_pad = blk([
    '  function pad2(n) { return (n < 10 ? \'0\' : \'\') + n; }',
    '  /* R82：动态插入的 lucide 图标（与静态 data-icon 共用同一套 LUCIDE_ICONS 字典，通过 window.lucideIcon 取值）；',
    '     字典缺失时回落调用方传入的原 emoji，保证任何环境下都不出现「图标空白」。 */',
    '  function ico(name, size, fallback) {',
    '    var html = (typeof window.lucideIcon === \'function\') ? window.lucideIcon(name, size) : \'\';',
    '    if (!html) return fallback || \'\';',
    '    return \'<span class="xtm-ico">\' + html + \'</span>\';',
    '  }',
])
j = rep(j, old_pad, new_pad, 1)

# 2b. 点赞汇总 ❤ → heart
j = rep(j, 'return \'<div class="xtm-likes">❤ \' + esc(arr.join(\'、\')) + \'</div>\';'.encode('utf-8'),
        'return \'<div class="xtm-likes">\' + ico(\'heart\', 12, \'❤\') + \' \' + esc(arr.join(\'、\')) + \'</div>\';'.encode('utf-8'), 1)

# 2c. 卡片操作行：❤/🤍 → heart，💬 → message-circle
j = rep(j, '\'">\' + (m.likedByMe ? \'❤ 取消\' : \'🤍 赞\') + \'</span>\' +'.encode('utf-8'),
        '\'">\' + (m.likedByMe ? ico(\'heart\', 13, \'❤\') + \' 取消\' : ico(\'heart\', 13, \'🤍\') + \' 赞\') + \'</span>\' +'.encode('utf-8'), 1)
j = rep(j, 'onclick="XTM.panel(\' + m.id + \')">💬 评论</span>\' +'.encode('utf-8'),
        'onclick="XTM.panel(\' + m.id + \')">\' + ico(\'message-circle\', 13, \'💬\') + \' 评论</span>\' +'.encode('utf-8'), 1)

# 2d. 各类弹层/查看器/发布格关闭符 ✕ → close（5 处 sheet-hd + viewer + pub-cell×2）
j = rep(j, '>\xe2\x9c\x95</span></div>\' +'.encode('utf-8'),
        '>\' + ico(\'close\', 18, \'✕\') + \'</span></div>\' +'.encode('utf-8'), 5)
j = rep(j, 'onclick="XTM.closeViewer()">✕</span>\' +'.encode('utf-8'),
        'onclick="XTM.closeViewer()">\' + ico(\'close\', 20, \'✕\') + \'</span>\' +'.encode('utf-8'), 1)
j = rep(j, '>✕</div>\' +'.encode('utf-8'), '>\' + ico(\'close\', 16, \'✕\') + \'</div>\' +'.encode('utf-8'), 1)
j = rep(j, '>✕</div></div>\';'.encode('utf-8'), '>\' + ico(\'close\', 16, \'✕\') + \'</div></div>\';'.encode('utf-8'), 1)

# 2e. 可见范围 👁 → eye
j = rep(j, 'parts.push(\'👁 \' + esc(VIS_TEXT[P.visScope] || \'公开\')'.encode('utf-8'),
        'parts.push(ico(\'eye\', 12, \'👁\') + \' \' + esc(VIS_TEXT[P.visScope] || \'公开\')'.encode('utf-8'), 1)

# 2f. R78 段注释里的 emoji 指涉改写为图标名
j = rep(j, '     #xtmHero 存在时启用：🖼 选本地图片（≤2MB）→ FileReader dataURL → localStorage'.encode('utf-8'),
        '     #xtmHero 存在时启用：两个按钮图标为 lucide image / rotate-ccw；选本地图片（≤2MB）→ FileReader dataURL → localStorage'.encode('utf-8'), 1)
j = rep(j, '     study_workbench_moments_bg；↺ 恢复默认（清 key）。有背景时加半透明遮罩保证可读性。 */'.encode('utf-8'),
        '     study_workbench_moments_bg；恢复默认（清 key）图标 rotate-ccw。有背景时加半透明遮罩保证可读性。 */'.encode('utf-8'), 1)

assert j.count('ico('.encode('utf-8')) >= 9, 'ico() 调用不足'
assert crlf_ok(j)
wb(jp, j)
log('UPDATE assets/xt-moments.js bytes=%d' % len(j))

# ---------- 3. assets/xt-moments.css：动态插入图标容器样式 ----------
cp = P(r'assets\xt-moments.css')
c = rb(cp)
assert crlf_ok(c), 'xt-moments.css bareLF'
anchor = '/* ---------- 响应式（窄屏断点） ---------- */'.encode('utf-8')
new_css = blk([
    '/* ---------- R82：动态插入的 lucide 图标容器（xt-moments.js ico() 使用） ----------',
    '   与静态 data-icon 同一套 LUCIDE_ICONS 字典；stroke 继承 currentColor 随主题变色。',
    '   固定值对齐：vertical-align:-3px 使 12–13px 图标与 13px 正文基线齐平。 */',
    '.xtm-ico { display: inline-flex; align-items: center; line-height: 1; vertical-align: -3px; }',
    '.xtm-ico svg { display: block; }',
    '.xtm-sheet-x .xtm-ico, .xtm-viewer-x .xtm-ico, .xtm-pub-cell-del .xtm-ico { display: flex; align-items: center; justify-content: center; }',
    '',
])
c = rep(c, anchor, new_css + anchor, 1)
assert 'clamp('.encode('utf-8') not in c and 'min('.encode('utf-8') not in c and 'max('.encode('utf-8') not in c
assert crlf_ok(c)
wb(cp, c)
log('UPDATE assets/xt-moments.css bytes=%d' % len(c))

log('ALL MUTATIONS DONE OK')
