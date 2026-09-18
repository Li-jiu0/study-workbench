# -*- coding: utf-8 -*-
# R85 静态自测：副标题删除 + 保留项 + 铁律回归 + 版本号戳未被 bump
import os
import re
import time

BASE = os.path.dirname(os.path.abspath(__file__))
HTML = '动态空间.html'
BAK85 = '动态空间.html.bak-pre-r85-20260917'
BAK84 = '动态空间.html.bak-pre-r84-20260917'

PASS = []
FAIL = []


def check(name, ok, extra=None):
    (PASS if ok else FAIL).append(name)
    print((('    %s' % extra) if extra is not None else '') + ('PASS ' if ok else 'FAIL ') + name)


def rb(p):
    with open(os.path.join(BASE, p), 'rb') as f:
        return f.read()


print('===== R85 静态自测 =====')
h = rb(HTML).decode('utf-8')
b85 = rb(BAK85).decode('utf-8') if os.path.exists(os.path.join(BASE, BAK85)) else ''

# 1. 删除项
SUB = '我 → 头像 → 动态'
check('T1 副标题文案 0 命中', h.count(SUB) == 0, h.count(SUB))
check('T1 DOM 上不再使用 xtm-listrow-s 类名', h.count('class="xtm-listrow-s"') == 0)
check('T1 CSS 规则 .xtm-listrow-s 已清除', h.count('.xtm-listrow-s{') == 0)
check('T1 列表行内只剩 1 个文本节点（主标题）', h.count('<div class="xtm-listrow-main">') == 1
      and h.count('xtm-listrow-t') == 1)

# 2. 保留项
check('T2 主标题「我的动态」保留', h.count('<div class="xtm-listrow-t">我的动态</div>') == 1)
check('T2 href=我的动态.html 保留', h.count('id="xtmMineRow" href="我的动态.html"') == 1)
check('T2 user 图标保留', h.count('<div class="xtm-listrow-icon"><span class="nav-icon" data-icon="user"></span></div>') == 1)
check('T2 chevron-right 箭头保留', h.count('<div class="xtm-listrow-arrow"><span class="nav-icon" data-icon="chevron-right"></span></div>') == 1)
check('T2 .xtm-hero 容器保留', h.count('<div class="xtm-hero" id="xtmHero">') == 1)
check('T2 .xtm-listrow 基础样式保留', '.xtm-listrow{display:flex;align-items:center' in h)
check('T2 .xtm-listrow-main 保留', '.xtm-listrow-main{flex:1;min-width:0}' in h)
check('T2 .xtm-listrow-t 样式保留', '.xtm-listrow-t{font-size:14px;font-weight:700' in h)
check('T2 返回键 / 相机键保留', 'id="xtmBack"' in h and 'id="xtmCam"' in h)
check('T2 data-xtm="feed" 未动', h.count('data-xtm="feed"') == 1)
check('T2 window.moOpenUser 保留', 'window.moOpenUser' in h)

# 3. R85 注释在位
check('T3 样式块含 R85 说明', 'R85：列表行副标题（原为引导去个人中心头像入口的说明文字）已按用户要求删除' in h)
check('T3 DOM 块含 R85 说明', 'R85：列表行副标题（原为引导去个人中心头像入口的说明文字）已按用户要求删除；' in h)

# 4. 铁律
hb = rb(HTML)
bare = hb.replace(b'\r\n', b'').count(b'\n')
check('T4 bareLF=0（CRLF 完好）', bare == 0, bare)
check('T4 备份存在: %s' % BAK85, os.path.exists(os.path.join(BASE, BAK85)))
check('T4 备份存在: %s（R84 备份未被覆盖）' % BAK84, os.path.exists(os.path.join(BASE, BAK84)))
es = [t for t in ['?.', '??', '.replaceAll(', '.at(', '**'] if t in h]
check('T4 ES2017 违规 0', len(es) == 0, es)
bad_css = [t for t in ['clamp(', 'min(', 'max('] if t in h]
check('T4 CSS 无 clamp()/min()/max()', len(bad_css) == 0, bad_css)
pop = [t for t in ['alert(', 'confirm(', 'prompt('] if t in h]
check('T4 无原生 alert/confirm/prompt', len(pop) == 0, pop)

# 5. 版本号戳未被 bump（与 R85 备份逐条比对）
if b85:
    v_new = re.findall(r'\?v=([0-9A-Za-z]+)', h)
    v_old = re.findall(r'\?v=([0-9A-Za-z]+)', b85)
    check('T5 版本号戳未 bump（共 %d 处）' % len(v_new), v_new == v_old, 'DIFF' if v_new != v_old else 'same')
else:
    check('T5 版本号戳未 bump', False, '无 R85 备份可比对')

# 6. 我的动态.html 只读确认（未改动、且本来就没有该副标题）
MINE = os.path.join(BASE, '我的动态.html')
if os.path.exists(MINE):
    m = rb('我的动态.html').decode('utf-8')
    check('T6 我的动态.html 未改动（无 R85 备份=未写盘）', not os.path.exists(os.path.join(BASE, '我的动态.html.bak-pre-r85-20260917')))
    check('T6 我的动态.html 本就不含该副标题文案', SUB not in m)
    check('T6 我的动态.html 本就不含 .xtm-listrow-s', 'xtm-listrow-s' not in m)
else:
    check('T6 我的动态.html 存在', False)

print()
print('===== mtime / size =====')
for p in [HTML, BAK85, BAK84, '我的动态.html']:
    fp = os.path.join(BASE, p)
    if os.path.exists(fp):
        st = os.stat(fp)
        print('  %-34s %s  %d B' % (p, time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(st.st_mtime)), st.st_size))

print()
print('RESULT: %d PASS / %d FAIL' % (len(PASS), len(FAIL)))
if FAIL:
    print('FAILED: %s' % FAIL)
