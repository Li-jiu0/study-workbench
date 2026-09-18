# -*- coding: utf-8 -*-
"""R84 静态自测：删除项归零 / 保留项完好 / 模块保留 / CRLF / 备份 / ES2017 / CSS 禁令。"""
import os
import re
import datetime

ROOT = r'D:\下载的文件\学习工作台'
BAK = '.bak-pre-r84-20260917'


def P(rel):
    return os.path.join(ROOT, rel)


def rb(p):
    with open(p, 'rb') as f:
        return f.read()


def crlf_ok(p):
    d = rb(p)
    return d.count(b'\r\n') == d.count(b'\n')


def read(p):
    return rb(p).decode('utf-8')


PASS = []
FAIL = []


def check(name, ok, extra=None):
    if extra is not None:
        print('    ' + str(extra))
    (PASS if ok else FAIL).append(name)
    print(('PASS ' if ok else 'FAIL ') + name)


print('===== R84 静态自测 =====')
h = read(P('动态空间.html'))
j = read(P(r'assets\xt-moments.js'))
c = read(P(r'assets\xt-moments.css'))

# 1. 删除项 0 命中
dead = ['xtmBgBtn', 'xtmBgReset', 'xtmBgFile', 'xtm-hero-mask', 'xtm-hero-btn', 'has-bg']
for t in dead:
    check('T2 已删令牌 0 命中: %-14s' % t, h.count(t) == 0, h.count(t))
check('T2 无 <input type="file"> 残留', '<input type="file"' not in h)

# 2. 保留项完好
check('T2 列表行保留（class="xtm-listrow" 1 处）', h.count('class="xtm-listrow"') == 1)
check('T2 列表行 href=我的动态.html 保留', h.count('href="我的动态.html"') == 1)
check('T2 列表行文案「我的动态」保留', '<div class="xtm-listrow-t">我的动态</div>' in h)
check('T2 列表行 user 图标保留', '<div class="xtm-listrow-icon"><span class="nav-icon" data-icon="user"></span></div>' in h)
check('T2 列表行 chevron-right 图标保留', '<div class="xtm-listrow-arrow"><span class="nav-icon" data-icon="chevron-right"></span></div>' in h)
check('T2 .xtm-hero 容器保留', 'class="xtm-hero" id="xtmHero"' in h and '.xtm-hero{' in h)
check('T2 .xtm-listrow 系样式保留', all(k in h for k in ['.xtm-listrow{', '.xtm-listrow-icon{', '.xtm-listrow-main{',
                                     '.xtm-listrow-t{', '.xtm-listrow-s{', '.xtm-listrow-arrow{']))
check('T2 既有 DOM id 未动（除删除项）', all(k in h for k in ['id="xtmBack"', 'id="xtmCam"', 'id="xtmFeed"',
                                   'id="xtmRefresh"', 'id="xtmSentinel"', 'id="topbarTitle"', 'id="morePanel"',
                                   'id="countdownModal"', 'id="toast"']))
check('T2 data-xtm="feed" 结构未动', 'data-xtm="feed"' in h)
check('T2 moOpenUser 全局函数保留', 'window.moOpenUser' in h)

# 3. JS 模块保留 + R84 注释
for t in ['BG_KEY', 'heroInit', 'heroApply', 'readAsDataURL', 'study_workbench_moments_bg']:
    check('T3 背景模块保留: %-24s' % t, t in j)
check('T3 feed 页接线处含 R84 说明', 'heroInit(); /* R78' in j and 'R84' in j.split('heroInit();')[1][:200])
check('T3 模块头注释含 R84 休眠说明', 'R84：动态空间（feed 页）的换背景 / 恢复默认入口已按用户要求移除' in j)
check('T3 heroApply 出现数未变(5)', j.count('heroApply') == 5, j.count('heroApply'))
check('T3 heroInit 出现数=3(含R84注释)', j.count('heroInit') == 3, j.count('heroInit'))
check('T3 2MB 上限逻辑保留', 'BG_MAX_BYTES' in j and 'f.size > BG_MAX_BYTES' in j)

# 4. ES2017 / CSS 禁令
bad = re.findall(r'\?\.|\?\?|replaceAll\(|\.at\(', j)
check('T4 ES2017 违规 0', not bad)
css_all = h[h.find('<style>'):h.find('</style>')] + c
check('T4 CSS 无 clamp()/min()/max()', not re.search(r'clamp\(|\bmin\(|\bmax\(', css_all))
check('T4 无 alert/confirm/prompt', 'alert(' not in j and 'prompt(' not in j)

# 5. CRLF + 备份
for f in ['动态空间.html', r'assets\xt-moments.js', r'assets\xt-moments.css']:
    check('T4 CRLF bareLF=0: ' + f, crlf_ok(P(f)))
    check('T4 备份存在: ' + f + BAK, os.path.exists(P(f + BAK)))

print()
print('===== mtime =====')
for f in ['动态空间.html', r'assets\xt-moments.js', r'assets\xt-moments.css']:
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(P(f))).strftime('%Y-%m-%d %H:%M:%S')
    print('  %-22s %s' % (f, mt))

print()
print('RESULT: %d PASS / %d FAIL' % (len(PASS), len(FAIL)))
if FAIL:
    print('FAILED: %r' % FAIL)
