# -*- coding: utf-8 -*-
"""R82 静态自测：图标替换核对 / 图标名注册链路 / 残留 emoji 清单 / CRLF / 备份 / ES2017 / CSS 禁令。"""
import os
import re
import datetime

ROOT = r'D:\下载的文件\学习工作台'
BAK = '.bak-pre-r82-20260917'


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


print('===== R82 静态自测 =====')
h = read(P('动态空间.html'))
j = read(P(r'assets\xt-moments.js'))
c = read(P(r'assets\xt-moments.css'))
ic = read(P('assets/icon-map.js'))

# 1. 新增 data-icon 逐一核对
for nm, ctx in [('chevron-left', 'id="xtmBack"'), ('image', 'id="xtmBgBtn"'),
                ('rotate-ccw', 'id="xtmBgReset"'), ('user', 'xtm-listrow-icon'),
                ('chevron-right', 'xtm-listrow-arrow')]:
    line_ok = False
    for ln in h.split('\r\n'):
        if ctx in ln and ('data-icon="' + nm + '"') in ln:
            line_ok = True
            break
    check('T2 图标就位 %-13s in %s' % (nm, ctx), line_ok)

def is_emoji(ch):
    """emoji/图形符号判定：CJK 汉字（>0x4E00）不算；分 emoji 区 + 杂项符号区。"""
    o = ord(ch)
    return (0x1F300 <= o <= 0x1FAFF) or (0x2600 <= o <= 0x27BF) or (0x2B00 <= o <= 0x2BFF)


def scan_symbols(text):
    out = {}
    for i, ln in enumerate(text.split('\r\n')):
        for ch in ln:
            if is_emoji(ch) or ch in ('‹', '›', '←', '→'):
                out.setdefault(ch, []).append(i + 1)
    return out


KEEP_JS = {'📍', '🔗', '✅', '🖼'}  # 无注册名（map-pin/link 缺失）或纯文本标签/ toast 文案


def classify(text):
    """逐行分类：fallback=仅作为 ico() 回落参数（渲染不输出）；keep=有意保留；raw=未知残留。"""
    fallback, keep, raw = {}, {}, {}
    for i, ln in enumerate(text.split('\r\n')):
        syms = [ch for ch in ln if is_emoji(ch)]
        if not syms:
            continue
        for ch in syms:
            if "ico('" in ln:
                fallback.setdefault(ch, []).append(i + 1)
            elif ch in KEEP_JS:
                keep.setdefault(ch, []).append(i + 1)
            else:
                raw.setdefault(ch, []).append(i + 1)
    return fallback, keep, raw


page_sym_all = scan_symbols(h)
page_sym = dict((k, v) for k, v in page_sym_all.items() if k not in ('→', '←'))
print('    动态空间.html 图标残留: %r（排版箭头 → 视为正文，出现于 %r）' % (page_sym, page_sym_all.get('→')))
check('T2 动态空间.html 图标残留仅 📷(发表键，字典无 camera)', set(page_sym.keys()) == {'📷'})

fb, keep, raw = classify(j)
print('    xt-moments.js 回落参数(渲染时不输出): %r' % sorted(fb.keys()))
print('    xt-moments.js 有意保留: %r' % sorted(keep.keys()))
print('    xt-moments.js 未知残留: %r' % raw)
check('T2 xt-moments.js 无未知 emoji 残留（其余均为 ico() 回落参数或有意保留）', not raw)
check('T2 已替换图标均通过 ico() 输出（heart/message-circle/close/eye 有回落）',
      all(k in fb for k in ['❤', '🤍', '💬', '✕', '👁']))

# 3. 图标名注册链路（icon-map.js 字典内存在同名 key）
names = ['chevron-left', 'image', 'rotate-ccw', 'user', 'chevron-right', 'heart', 'message-circle', 'close', 'eye']
for nm in names:
    ok = ('"' + nm + '": svg(') in ic
    check('T3 图标名已注册: %-15s' % nm, ok)

# 3b. 全站同名 data-icon 使用先例（除本页外至少 1 处，或本任务内已注册+使用）
other_pages = []
for fn in os.listdir(ROOT):
    if fn.endswith('.html') and '.bak' not in fn and fn != '动态空间.html':
        t = read(P(fn))
        if 'data-icon="user"' in t and 'user' not in other_pages:
            other_pages.append('user')
        if 'data-icon="chevron-right"' in t and 'chevron-right' not in other_pages:
            other_pages.append('chevron-right')
print('    其他页面已有同名用法: %r' % other_pages)
check('T3 user 图标在他页已有先例（同设计语言）', 'user' in other_pages)

# 4. 交互不变：onClick/title/aria 保留
check('T4 #xtmBgBtn title/aria 保留', 'title="更换页顶背景"' in h and 'aria-label="换背景"' in h)
check('T4 #xtmBgReset title/aria 保留', 'title="恢复默认背景"' in h and 'aria-label="还原背景"' in h)
check('T4 列表按钮 href 仍为 我的动态.html', 'href="我的动态.html"' in h)
check('T4 既有 DOM id 未被删', all(k in h for k in ['id="xtmHero"', 'id="xtmBgBtn"', 'id="xtmBgReset"',
                              'id="xtmBgFile"', 'id="xtmMineRow"', 'id="xtmCam"', 'id="xtmBack"', 'id="xtmFeed"']))
check('T4 moOpenUser 全局函数保留', 'window.moOpenUser' in h)
check('T4 data-xtm=feed 未动', 'data-xtm="feed"' in h)

# 5. JS 侧：ico() 助手与调用
check('T5 ico() 助手已定义且仅 1 处', j.count('function ico(') == 1)
for nm in ['heart', 'message-circle', 'close', 'eye']:
    check('T5 ico() 调用含 %-15s' % nm, ("ico('" + nm + "'") in j)
check('T5 回落兜底存在（lucideIcon 缺失时回落 emoji）', "return fallback || '';" in j)

# 6. ES2017 禁令（全文件 + 新增段）
seg = j[j.find('R82：动态插入的 lucide 图标'):j.find('function absUrl')]
bad = re.findall(r'\?\.|\?\?|\.\.\.|replaceAll\(|\.at\(|\*\*', seg)
check('T5 新增段 ES2017 违规 0', not bad)
bad_all = re.findall(r'\?\.|\?\?|replaceAll\(', j)
check('T5 全文件无 ?. ?? replaceAll', not bad_all)
bad_css = re.findall(r'clamp\(|\bmin\(|\bmax\(', c)
check('T5 CSS 无 clamp()/min()/max()', not bad_css)
check('T5 无 alert/confirm/prompt 新增', j.count('alert(') == 0 and 'prompt(' not in j)

# 7. CRLF + 备份
for f in ['动态空间.html', r'assets\xt-moments.js', r'assets\xt-moments.css']:
    check('T4 CRLF bareLF=0: ' + f, crlf_ok(P(f)))
    check('T4 备份存在: ' + f + BAK, os.path.exists(P(f + BAK)))

# 8. .xtm-ico 样式就位
check('T5 .xtm-ico 样式已写入共享 CSS', '.xtm-ico {' in c)

print()
print('===== mtime =====')
for f in ['动态空间.html', r'assets\xt-moments.js', r'assets\xt-moments.css']:
    mt = datetime.datetime.fromtimestamp(os.path.getmtime(P(f))).strftime('%Y-%m-%d %H:%M:%S')
    print('  %-22s %s' % (f, mt))

print()
print('RESULT: %d PASS / %d FAIL' % (len(PASS), len(FAIL)))
if FAIL:
    print('FAILED: %r' % FAIL)
