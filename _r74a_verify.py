# -*- coding: utf-8 -*-
"""R74-A 收工自测：存在性 / 死链归零（区分我的动态.html 存活链接）/ 计数 / CRLF / mtime / 关键行回读。"""
import os
import datetime

ROOT = r'D:\下载的文件\学习工作台'


def P(*rel):
    return os.path.join(ROOT, *rel)


def rb(p):
    with open(p, 'rb') as f:
        return f.read()


def crlf_ok(p):
    d = rb(p)
    return d.count(b'\r\n') == d.count(b'\n')


PASS = []
FAIL = []


def check(name, ok):
    (PASS if ok else FAIL).append(name)
    print(('PASS ' if ok else 'FAIL ') + name)


print('===== R74-A 自测 =====')

# 1. 文件存在性
check('T1 动态空间.html 存在', os.path.exists(P('动态空间.html')))
check('T1 朋友圈.html 已不存在', not os.path.exists(P('朋友圈.html')))
check('T1 动态.html 已不存在', not os.path.exists(P('动态.html')))
check('T1 我的动态.html 保留', os.path.exists(P('我的动态.html')))
check('T1 朋友圈发布.html 保留', os.path.exists(P('朋友圈发布.html')))

# 2. 死链归零（活文件 = 根 *.html 排除 备份\ 与 *.bak*；assets/*.js 排除 *.bak*；排除 tools\ 与 _r* 临时脚本）
DEAD_PATS = ['朋友圈.html', '动态.html']
LIVE_OK = '我的动态.html'  # 存活链接，含 动动态.html 子串属误报口径


def dead_hits(data):
    hits = []
    for pat in DEAD_PATS:
        live_sub = (LIVE_OK if pat == '动态.html' else None)
        cnt = data.count(pat.encode('utf-8'))
        if live_sub:
            cnt -= data.count(live_sub.encode('utf-8')) if pat in live_sub else 0
        if cnt > 0:
            hits.append((pat, cnt))
    return hits


scope_dead = []
out_scope_dead = []
for fn in sorted(os.listdir(ROOT)):
    fp = P(fn)
    if not os.path.isfile(fp):
        continue
    if fn.endswith('.html') and '.bak' not in fn:
        h = dead_hits(rb(fp))
        if h:
            scope_dead.append((fn, h))
for fn in sorted(os.listdir(P('assets'))):
    fp = P('assets', fn)
    if fn.endswith('.js') and '.bak' not in fn:
        h = dead_hits(rb(fp))
        if h:
            (scope_dead if fn in ('app.js', 'xt-moments.js') else out_scope_dead).append(('assets/' + fn, h))
check('T2 本任务独占文件死链归零', not scope_dead)
print('    本任务范围残留: %r' % (scope_dead,))
print('    非本任务范围残留(归 R74-B/api.js、xt-profile.js 线): %r' % (out_scope_dead,))

# 3. node --check 已由外部命令验证（RC=0），此处不重复

# 4. app.js 细项
app = rb(P(r'assets\app.js'))
check('T4 app.js moments: 动态空间.html 恰 1 处', app.count("moments: '动态空间.html',".encode('utf-8')) == 1)
check('T4 app.js PAGE_FILES 其余键未动(动态空间.html 总数=1)', app.count('动态空间.html'.encode('utf-8')) == 1)
l665 = len(app.split(b'\n')[664].rstrip(b'\r'))
check('T4 app.js L665 超长行未触碰(len=%d, 基线=1839947)' % l665, l665 == 1839947)
check('T4 app.js CRLF bareLF=0', crlf_ok(P(r'assets\app.js')))

# 5. data-page="moments" 计数（基线 36 页含动态族 4 页：朋友圈/动态/我的动态/朋友圈发布）
cnt_files = 0
cnt_occ = 0
multi = []
for fn in os.listdir(ROOT):
    fp = P(fn)
    if not fn.endswith('.html') or '.bak' in fn or not os.path.isfile(fp):
        continue
    c = rb(fp).count(b'data-page="moments"')
    if c:
        cnt_files += 1
        cnt_occ += c
        if c != 1:
            multi.append((fn, c))
print('    data-page="moments": files=%d occ=%d multi=%r (基线 36/36；动态.html 删除后 35/35)' % (cnt_files, cnt_occ, multi))
check('T5 每页 data-page="moments" 恰 1 处', not multi)
check('T5 动态族存量页(动态空间/我的动态/朋友圈发布)均含侧栏项', all(
    rb(P(f)).count(b'data-page="moments"') == 1 for f in ['动态空间.html', '我的动态.html', '朋友圈发布.html']))

# 6. 个人中心.html
pc = rb(P('个人中心.html'))
check('T6 个人中心 菜单入口 我的动态(sgc-title) 0 处', pc.count('<div class="sgc-title">我的动态</div>'.encode('utf-8')) == 0)
cnt_sp = pc.count("location.href='动态空间.html'".encode('utf-8'))
check('T6 个人中心 动态空间入口 >=1 处(实际 %d)' % cnt_sp, cnt_sp >= 1)
check('T6 个人中心 入口样式与相邻菜单项同构(subpage-group-card)',
      pc.count('<div class="subpage-group-card" onclick="location.href=\'动态空间.html\'">'.encode('utf-8')) == 1)

# 7. 新 动态空间.html
np_ = rb(P('动态空间.html'))
check('T7 title 含 动态空间', '<title>动态空间 · 星途</title>'.encode('utf-8') in np_)
check('T7 topbar/导航标题统一动态空间口径', '<div class="xtm-nav-title">动态空间</div>'.encode('utf-8') in np_ and '>动态空间</div>'.encode('utf-8') in np_)
check('T7 卡片区含我的动态卡(mo-entry-card href=我的动态.html)', '<a class="mo-entry-card" href="我的动态.html">'.encode('utf-8') in np_)
check('T7 moOpenUser 函数在(typeof 守卫)', b"window.moOpenUser = function (uid)" in np_ and b"typeof window.moOpenUser !== 'function'" in np_)
dead_np = dead_hits(np_)
check('T7 无 动态.html/朋友圈.html 死链字面引用', not dead_np)
check('T7 CRLF 完好 bareLF=0', crlf_ok(P('动态空间.html')))
check('T7 保留 data-xtm=feed 信息流主体', b'<body class="theme-home" data-xtm="feed">' in np_)

# 8. 所有被改文件行尾 bareLF=0
changed = ['动态空间.html', '我的动态.html', '朋友圈发布.html', '更多.html', '个人中心.html', r'assets\app.js', r'assets\xt-moments.js']
allcrlf = all(crlf_ok(P(f)) for f in changed)
check('T8 被改文件 bareLF=0 (7 文件)', allcrlf)

print()
print('===== mtime（本地时间）=====')
for f in changed + ['动态空间.html']:
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(P(f))).strftime('%Y-%m-%d %H:%M:%S')
    print('  %-24s %s' % (f, mt))

print()
print('===== 关键行回读 =====')


def show(path, needle, ctx=0, label=''):
    d = rb(P(path)).decode('utf-8')
    lines = d.split('\r\n')
    for i, ln in enumerate(lines):
        if needle in ln:
            for j in range(max(0, i - ctx), min(len(lines), i + ctx + 1)):
                print('  %s:%d: %s' % (label or path, j + 1, lines[j].strip()[:160]))
            print('  ---')
            return
    print('  %s: NOT FOUND %r' % (label or path, needle))


show('动态空间.html', '<title>')
show('动态空间.html', 'xtm-nav-title')
show('动态空间.html', 'mo-entry-card')
show('动态空间.html', 'moOpenUser')
show('动态空间.html', 'xtm-refresh')
show(r'assets\app.js', "moments: '动态空间.html',", label='assets/app.js')
show(r'assets\xt-moments.js', "location.href = '动态空间.html';", label='assets/xt-moments.js')
show('更多.html', "location.href='动态空间.html'")
show('我的动态.html', "location.href='动态空间.html'")
show('朋友圈发布.html', "location.href='动态空间.html'")
show('个人中心.html', '动态空间直达')
show('个人中心.html', "location.href='动态空间.html'\">去发布")
show('个人中心.html', "gotoUserMoments")

print()
print('RESULT: %d PASS / %d FAIL' % (len(PASS), len(FAIL)))
if FAIL:
    print('FAILED ITEMS: %r' % FAIL)
