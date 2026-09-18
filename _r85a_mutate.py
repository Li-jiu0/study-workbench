# -*- coding: utf-8 -*-
# R85：删除 动态空间.html 中「我的动态」列表行的副标题「我 → 头像 → 动态」
#   铁律：二进制读写保 CRLF；备份 .bak-pre-r85-20260917（已存在则复用，不覆盖 R84 备份）；不 bump 戳
import os
import time

BASE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(BASE, '动态空间.html')
BAK = os.path.join(BASE, '动态空间.html.bak-pre-r85-20260917')


def rb(p):
    with open(p, 'rb') as f:
        return f.read()


def wb(p, b):
    with open(p, 'wb') as f:
        f.write(b)


def e(s):
    return s.encode('utf-8')


raw = rb(HTML)

# ---------- 备份（同名备份已存在则复用，绝不覆盖） ----------
if os.path.exists(BAK):
    print('BACKUP 复用已存在的同名备份：%s（%d B）' % (os.path.basename(BAK), os.path.getsize(BAK)))
else:
    wb(BAK, raw)
    print('BACKUP 新建：%s（%d B）' % (os.path.basename(BAK), os.path.getsize(BAK)))

# ---------- 改前断言 ----------
DOM_SUB = '          <div class="xtm-listrow-s">我 → 头像 → 动态</div>\r\n'
CSS_SUB = '  .xtm-listrow-s{font-size:12px;color:var(--text-secondary);margin-top:2px}\r\n'
assert raw.count(e(DOM_SUB)) == 1, 'DOM 副标题行未唯一命中: %d' % raw.count(e(DOM_SUB))
assert raw.count(e(CSS_SUB)) == 1, 'CSS .xtm-listrow-s 规则未唯一命中: %d' % raw.count(e(CSS_SUB))
assert raw.count(e('<div class="xtm-listrow-t">我的动态</div>')) == 1
assert raw.count(e('id="xtmMineRow" href="我的动态.html"')) == 1
print('PRE-CHECK OK：副标题 DOM 1 处 / .xtm-listrow-s 规则 1 处 / 主标题与 href 各 1 处')

# ---------- 1) 删 DOM 副标题行 ----------
raw = raw.replace(e(DOM_SUB), e(''), 1)
assert raw.count(e('我 → 头像 → 动态')) == 0, '副标题文案仍有残留'
assert raw.count(e('class="xtm-listrow-s"')) == 0, 'DOM 上的 xtm-listrow-s 类名仍有残留'
assert raw.count(e('.xtm-listrow-s{')) == 1, 'CSS 规则应仍在（下一步才删）'
print('STEP1 已删 DOM 副标题行')

# ---------- 2) 顺带清掉唯一使用者即被删元素的 .xtm-listrow-s 规则（全仓已确认无其它引用） ----------
# （CSS_SUB 里的类名已在上一步一并消失，此处只需删除该规则行）
# 说明：改前 CSS_SUB 已不存在于 raw（类名碎片已被断言清空），改用完整规则串做替换前的二次确认
assert raw.count(e('.xtm-listrow-s{')) == 1, 'CSS 规则行未定位到'
raw = raw.replace(e(CSS_SUB), e(''), 1)
assert raw.count(e('.xtm-listrow-s')) == 0, 'CSS 规则仍有残留'
print('STEP2 已删孤儿 CSS 规则 .xtm-listrow-s')

# ---------- 3) 注释补 R85 说明（样式块 + DOM 块各一处） ----------
OLD_CSS_CMT = ('     背景功能逻辑仍保留在 assets/xt-moments.js，待 R80 迁移到 我的动态.html 复用。\r\n'
               '     视觉口径与页内 .xtm-card / .xtm-avatar 一致；长度全部固定值，窄屏由页面既有断点接管。 */')
NEW_CSS_CMT = ('     背景功能逻辑仍保留在 assets/xt-moments.js，待 R80 迁移到 我的动态.html 复用。\r\n'
               '     R85：列表行副标题（原为引导去个人中心头像入口的说明文字）已按用户要求删除，\r\n'
               '     其专属规则 .xtm-listrow-s 无其它使用者，一并清除；\r\n'
               '     行内垂直居中由 .xtm-listrow 的 align-items:center 保证（图标 38px 主导行高），无需额外微调。\r\n'
               '     视觉口径与页内 .xtm-card / .xtm-avatar 一致；长度全部固定值，窄屏由页面既有断点接管。 */')
assert raw.count(e(OLD_CSS_CMT)) == 1, 'CSS 注释块未命中'
raw = raw.replace(e(OLD_CSS_CMT), e(NEW_CSS_CMT), 1)

OLD_DOM_CMT = ('         R84：原「换背景 / 恢复默认」悬浮按钮与隐藏 file input、遮罩层已按用户要求删除；\r\n'
               '         背景能力逻辑保留在 assets/xt-moments.js（BG_KEY / heroInit / heroApply），待 R80 迁到 我的动态.html 复用。 -->')
NEW_DOM_CMT = ('         R84：原「换背景 / 恢复默认」悬浮按钮与隐藏 file input、遮罩层已按用户要求删除；\r\n'
               '         背景能力逻辑保留在 assets/xt-moments.js（BG_KEY / heroInit / heroApply），待 R80 迁到 我的动态.html 复用。\r\n'
               '         R85：列表行副标题（原为引导去个人中心头像入口的说明文字）已按用户要求删除；\r\n'
               '         主标题「我的动态」、user 图标、chevron-right 箭头、href=我的动态.html 与点击跳转行为全部保留不变。 -->')
assert raw.count(e(OLD_DOM_CMT)) == 1, 'DOM 注释块未命中'
raw = raw.replace(e(OLD_DOM_CMT), e(NEW_DOM_CMT), 1)
print('STEP3 已补 R85 注释（样式块 + DOM 块）')

# ---------- 改后断言 ----------
assert raw.count(e('我 → 头像 → 动态')) == 0
# 类名仅允许出现在 R85 说明注释里：规则本身与 DOM 使用必须为 0
assert raw.count(e('.xtm-listrow-s{')) == 0, 'CSS 规则未清干净'
assert raw.count(e('class="xtm-listrow-s"')) == 0, 'DOM 仍在使用该类名'
assert raw.count(e('xtm-listrow-s')) == 1, 'xtm-listrow-s 出现处应仅剩 CSS 注释 1 处，实际 %d' % raw.count(e('xtm-listrow-s'))
assert raw.count(e('<div class="xtm-listrow-t">我的动态</div>')) == 1
assert raw.count(e('id="xtmMineRow" href="我的动态.html"')) == 1
assert raw.count(e('<div class="xtm-listrow-icon"><span class="nav-icon" data-icon="user"></span></div>')) == 1
assert raw.count(e('<div class="xtm-listrow-arrow"><span class="nav-icon" data-icon="chevron-right"></span></div>')) == 1
assert raw.count(e('<div class="xtm-hero" id="xtmHero">')) == 1
assert raw.count(e('data-xtm="feed"')) == 1
assert raw.count(e('window.moOpenUser')) >= 1
# CRLF：裸 LF 必须为 0
bare_lf = raw.replace(e('\r\n'), e('')).count(e('\n'))
assert bare_lf == 0, 'bareLF=%d' % bare_lf
# 不得引入现代语法（本轮只动 HTML，兜底检查）
for bad in [b'?.', b'??', b'.replaceAll(', b'.at(', b'**']:
    assert bad not in raw, 'ES2017 违规: %r' % bad
# 不得出现原生弹窗
for bad in ['alert(', 'confirm(', 'prompt(']:
    assert e(bad) not in raw, '原生弹窗: %s' % bad
print('POST-CHECK OK：副标题 0 命中 / .xtm-listrow-s 0 命中 / 主标题·href·图标·箭头·容器齐全 / bareLF=0')

wb(HTML, raw)
print('UPDATE 动态空间.html bytes=%d' % len(raw))
print('ALL MUTATIONS DONE OK  mtime=%s' % time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(os.path.getmtime(HTML))))
