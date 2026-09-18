# -*- coding: utf-8 -*-
"""R84：删除 动态空间.html 页顶 hero 区的换背景 / 恢复默认按钮（含隐藏 file input、遮罩层及其样式）。
保留：.xtm-hero 容器 + .xtm-listrow 列表行（user 图标/文案/chevron-right/href=我的动态.html）；
保留：xt-moments.js 背景功能模块（BG_KEY / heroInit / heroApply / FileReader）并补 R84 休眠说明注释，
      待 R80 迁移到 我的动态.html 直接复用。
二进制字节级替换，CRLF 保持。
"""
import os
import shutil

ROOT = r'D:\下载的文件\学习工作台'
BAK = '.bak-pre-r84-20260917'


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


# ---------- 0. 备份（三个授权文件） ----------
targets = ['动态空间.html', r'assets\xt-moments.js', r'assets\xt-moments.css']
for t in targets:
    src = P(t)
    assert os.path.exists(src), 'missing ' + t
    shutil.copyfile(src, src + BAK)
log('BACKUP done: %d files -> *%s' % (len(targets), BAK))

# ---------- 1. 动态空间.html ----------
hp = P('动态空间.html')
h = rb(hp)
assert crlf_ok(h), '动态空间.html bareLF'

# 1a. 清空 hero 内联样式中的按钮/遮罩规则（保留 .xtm-hero 容器与 .xtm-listrow 系）
old_style = blk([
    '  /* R78：页顶背景自定义 hero +「我的动态」列表按钮（替换原 R74 入口卡及其样式）。',
    '     视觉口径与页内 .xtm-card / .xtm-avatar 一致；长度全部固定值，窄屏由页面既有断点接管。 */',
    '  .xtm-hero{position:relative;margin:12px 0 14px;padding:6px 46px 6px 0;background-size:cover;background-position:center;border-radius:16px}',
    '  .xtm-hero.has-bg{background-color:#1b2432}',
    '  .xtm-hero-mask{position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.45);border-radius:16px;display:none}',
    '  .xtm-hero.has-bg .xtm-hero-mask{display:block}',
    '  .xtm-hero-btn{position:absolute;top:8px;width:30px;height:30px;border:none;border-radius:50%;background:rgba(0,0,0,.35);color:#fff;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
    '  .xtm-hero-btn:active{background:rgba(0,0,0,.55)}',
    '  #xtmBgBtn{right:8px}',
    '  #xtmBgReset{right:44px}',
    '  .xtm-listrow{display:flex;align-items:center;background:var(--card);border-radius:16px;padding:12px 14px;box-shadow:var(--shadow);text-decoration:none;color:var(--text);box-sizing:border-box}',
])
new_style = blk([
    '  /* R78：「我的动态」列表按钮（替换原 R74 入口卡）；.xtm-hero 为其外层容器。',
    '     R84：原「换背景 / 恢复默认」两个悬浮按钮、隐藏 file input、遮罩层及其样式已按用户要求删除；',
    '     背景功能逻辑仍保留在 assets/xt-moments.js，待 R80 迁移到 我的动态.html 复用。',
    '     视觉口径与页内 .xtm-card / .xtm-avatar 一致；长度全部固定值，窄屏由页面既有断点接管。 */',
    '  .xtm-hero{position:relative;margin:12px 0 14px;background-size:cover;background-position:center;border-radius:16px}',
    '  .xtm-listrow{display:flex;align-items:center;background:var(--card);border-radius:16px;padding:12px 14px;box-shadow:var(--shadow);text-decoration:none;color:var(--text);box-sizing:border-box}',
])
h = rep(h, old_style, new_style, 1)

# 1b. R82 图标适配规则：移除 .xtm-hero-btn 相关（按钮已删），保留 nav-btn / listrow 规则
old_icon = blk([
    '  .xtm-nav-btn .nav-icon, .xtm-hero-btn .nav-icon, .xtm-listrow-icon .nav-icon{display:flex;align-items:center;justify-content:center}',
    '  .xtm-hero-btn .nav-icon svg{stroke:#fff}',
    '  .xtm-listrow-icon .nav-icon svg{stroke:var(--primary)}',
])
new_icon = blk([
    '  .xtm-nav-btn .nav-icon, .xtm-listrow-icon .nav-icon{display:flex;align-items:center;justify-content:center}',
    '  .xtm-listrow-icon .nav-icon svg{stroke:var(--primary)}',
])
h = rep(h, old_icon, new_icon, 1)

# 1c. 删除 hero 内三个按钮节点 + 遮罩层 + 隐藏 file input，保留列表行
old_dom = blk([
    '    <!-- R78：页顶背景自定义 hero +「我的动态」列表按钮（替换原 R74 入口卡）。',
    '         换背景按钮图标=data-icon「image」：本地图片 ≤2MB，dataURL 存 localStorage study_workbench_moments_bg，逻辑在 assets/xt-moments.js',
    '         一键还原默认按钮图标=data-icon「rotate-ccw」（清 localStorage 背景键）；有背景时遮罩层保证文字可读。 -->',
    '    <div class="xtm-hero" id="xtmHero">',
    '      <div class="xtm-hero-mask" id="xtmHeroMask"></div>',
    '      <button class="xtm-hero-btn" id="xtmBgBtn" type="button" title="更换页顶背景" aria-label="换背景"><span class="nav-icon" data-icon="image"></span></button>',
    '      <button class="xtm-hero-btn" id="xtmBgReset" type="button" title="恢复默认背景" aria-label="还原背景" style="display:none"><span class="nav-icon" data-icon="rotate-ccw"></span></button>',
    '      <input type="file" id="xtmBgFile" accept="image/*" style="display:none">',
    '      <a class="xtm-listrow" id="xtmMineRow" href="我的动态.html">',
])
new_dom = blk([
    '    <!-- R78：「我的动态」列表按钮（替换原 R74 入口卡）；.xtm-hero 为其外层容器。',
    '         R84：原「换背景 / 恢复默认」悬浮按钮与隐藏 file input、遮罩层已按用户要求删除；',
    '         背景能力逻辑保留在 assets/xt-moments.js（BG_KEY / heroInit / heroApply），待 R80 迁到 我的动态.html 复用。 -->',
    '    <div class="xtm-hero" id="xtmHero">',
    '      <a class="xtm-listrow" id="xtmMineRow" href="我的动态.html">',
])
h = rep(h, old_dom, new_dom, 1)

for tok in ['xtmBgBtn', 'xtmBgReset', 'xtmBgFile', 'xtm-hero-mask', 'xtm-hero-btn', 'has-bg']:
    assert tok.encode('utf-8') not in h, '残留 ' + tok
assert h.count('class="xtm-listrow"'.encode('utf-8')) == 1
assert h.count('href="我的动态.html"'.encode('utf-8')) == 1
assert h.count('id="xtmHero"'.encode('utf-8')) == 1
# user 图标名在侧栏/底栏另有同名用法，按完整上下文断言（列表行内 1 处）
assert h.count('<div class="xtm-listrow-icon"><span class="nav-icon" data-icon="user"></span></div>'.encode('utf-8')) == 1
assert h.count('data-icon="chevron-right"'.encode('utf-8')) == 1
assert h.count('data-icon="chevron-left"'.encode('utf-8')) == 1
assert crlf_ok(h)
wb(hp, h)
log('UPDATE 动态空间.html bytes=%d' % len(h))

# ---------- 2. assets/xt-moments.js：模块保留 + R84 休眠注释 ----------
jp = P(r'assets\xt-moments.js')
j = rb(jp)
assert crlf_ok(j), 'xt-moments.js bareLF'

old_call = '    heroInit(); /* R78：页顶背景自定义（无 #xtmHero 的页面自动跳过） */'.encode('utf-8')
new_call = ('    heroInit(); /* R78：页顶背景自定义；R84：动态空间页的换背景/恢复默认入口已移除，'
            '模块保留待 R80 迁移到 我的动态.html 复用（feed 页无 #xtmHero 时自动跳过） */').encode('utf-8')
j = rep(j, old_call, new_call, 1)

old_head = '     #xtmHero 存在时启用：两按钮图标为 lucide image / rotate-ccw；选本地图片（≤2MB）→ FileReader dataURL → localStorage'.encode('utf-8')
new_head = '     #xtmHero 存在时启用（R84 后 feed 页已无入口，仅保留能力）：选本地图片（≤2MB）→ FileReader dataURL → localStorage'.encode('utf-8')
j = rep(j, old_head, new_head, 1)

old_tail = '     study_workbench_moments_bg；恢复默认（清 key）图标 rotate-ccw。有背景时加半透明遮罩保证可读性。 */'.encode('utf-8')
new_tail = ('     study_workbench_moments_bg；恢复默认（清 key）图标 rotate-ccw。有背景时加半透明遮罩保证可读性。\r\n'
            '     R84：动态空间（feed 页）的换背景 / 恢复默认入口已按用户要求移除，本模块进入休眠状态\r\n'
            '     （heroInit 在无 #xtmHero 时自动跳过）；函数与 localStorage 键逻辑完整保留，\r\n'
            '     待 R80 迁移到 我的动态.html 时直接复用，勿删。 */').encode('utf-8')
j = rep(j, old_tail, new_tail, 1)

assert 'BG_KEY'.encode('utf-8') in j and 'heroInit'.encode('utf-8') in j and 'heroApply'.encode('utf-8') in j
assert 'R84'.encode('utf-8') in j
assert crlf_ok(j)
wb(jp, j)
log('UPDATE assets/xt-moments.js bytes=%d（模块未删，仅补注释）' % len(j))

log('ALL MUTATIONS DONE OK')
