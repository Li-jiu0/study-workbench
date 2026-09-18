# -*- coding: utf-8 -*-
import re, io, hashlib

P = 'assets/xt-profile.js'
raw = open(P, 'rb').read()
s = raw.decode('utf-8')

# 1) 这三行处在什么上下文里
lines = s.split('\n')
out = []
out.append('=== 3 处命中的上下文（前后 3 行）===')
for n in (485, 488, 671):
    out.append('--- L%d ---' % n)
    for i in range(max(0, n - 4), min(len(lines), n + 2)):
        out.append('%5d| %s' % (i + 1, lines[i]))

# 2) 找块注释区间，判断这些行是否在注释内
def in_comment(s, pos):
    # 简单扫描 */ /* // 状态机
    i = 0
    mode = None  # None | 'block' | 'line' | 'sq' | 'dq' | 'tpl'
    while i < pos:
        c = s[i]
        if mode is None:
            if s.startswith('/*', i):
                mode = 'block'; i += 2; continue
            if s.startswith('//', i):
                mode = 'line'; i += 2; continue
            if c == "'":
                mode = 'sq'
            elif c == '"':
                mode = 'dq'
            elif c == '`':
                mode = 'tpl'
            i += 1
            continue
        elif mode == 'block':
            if s.startswith('*/', i):
                mode = None; i += 2; continue
            i += 1
        elif mode == 'line':
            if c == '\n':
                mode = None
            i += 1
        else:
            if c == '\\':
                i += 2; continue
            if (mode == 'sq' and c == "'") or (mode == 'dq' and c == '"') or (mode == 'tpl' and c == '`'):
                mode = None
            i += 1
    return mode

out.append('')
out.append('=== 3 行是否处于注释中 ===')
for n in (485, 488, 671):
    pos = sum(len(x) + 1 for x in lines[:n - 1])
    m = in_comment(s, pos)
    out.append('L%d -> mode=%s  => %s' % (n, m, '注释内(误报)' if m in ('block', 'line') else '★代码区(真命中)' if m is None else '字符串内'))

# 3) 独立禁用语法扫描：剔掉注释与字符串后扫
def strip_code(s):
    res = []
    i = 0
    mode = None
    while i < len(s):
        c = s[i]
        if mode is None:
            if s.startswith('/*', i):
                mode = 'block'; i += 2; continue
            if s.startswith('//', i):
                mode = 'line'; i += 2; continue
            if c == "'":
                mode = 'sq'; i += 1; continue
            if c == '"':
                mode = 'dq'; i += 1; continue
            if c == '`':
                mode = 'tpl'; i += 1; continue
            res.append(c); i += 1; continue
        elif mode == 'block':
            if s.startswith('*/', i):
                mode = None; i += 2; continue
            if c == '\n':
                res.append('\n')
            i += 1
        elif mode == 'line':
            if c == '\n':
                mode = None; res.append('\n')
            i += 1
        else:
            if c == '\\':
                i += 2; continue
            if c == '\n' and mode != 'tpl':
                mode = None; res.append('\n'); i += 1; continue
            if (mode == 'sq' and c == "'") or (mode == 'dq' and c == '"') or (mode == 'tpl' and c == '`'):
                mode = None
            i += 1
    return ''.join(res)

code = strip_code(s)
RULES = [
    ('?.', r'\?\.'),
    ('??', r'\?\?'),
    ('arr spread', r'\[\s*\.\.\.'),
    ('obj spread', r'\{\s*\.\.\.'),
    ('.replaceAll(', r'\.replaceAll\s*\('),
    ('Object.fromEntries', r'Object\.fromEntries'),
    ('.at(', r'\.at\s*\('),
    ('lookbehind', r'\(\?<[=!]'),
    ('exponent', r'\*\*'),
    ('optional catch', r'catch\s*\{'),
]
out.append('')
out.append('=== 独立禁用语法扫描（已剔注释+字符串）===')
tot = 0
for name, pat in RULES:
    ms = list(re.finditer(pat, code))
    tot += len(ms)
    out.append('%-20s %d' % (name, len(ms)))
    for m in ms[:3]:
        ln = code[:m.start()].count('\n') + 1
        out.append('     L%d %s' % (ln, code.split('\n')[ln - 1].strip()[:110]))
out.append('TOTAL=%d' % tot)

# 4) R97 关键结构确认
out.append('')
out.append('=== R97 关键结构确认 ===')
for name, pat in [
    ('xtpOpenAvatarSheet 定义', r'function\s+xtpOpenAvatarSheet'),
    ('xtpPickAvatarFile 定义', r'function\s+xtpPickAvatarFile'),
    ('拍照项', r'拍照'),
    ('相册项', r'从手机相册选择'),
    ('取消项', r'取消'),
    ('capture=environment', r'capture\s*=\s*[\x22\x27]environment'),
    ('input type=file', r'createElement\s*\(\s*[\x22\x27]input'),
    ('accept=image', r'accept\s*=\s*[\x22\x27]image'),
]:
    ms = list(re.finditer(pat, s))
    out.append('%-26s %d' % (name, len(ms)))
    for m in ms[:4]:
        ln = s[:m.start()].count('\n') + 1
        out.append('     L%d %s' % (ln, s.split('\n')[ln - 1].strip()[:110]))

# 5) 顶部按钮确认
out.append('')
out.append('=== 顶栏按钮 ===')
i = s.find('xtp-crop-topbar')
if i >= 0:
    out.append(s[i - 200:i + 700])

# 6) 九宫格 CSS 确认
out.append('')
out.append('=== CSS 九宫格 ===')
c = open('assets/xt-profile.css', 'r', encoding='utf-8', newline='').read()
j = c.find('.xtp-crop-frame')
if j >= 0:
    out.append(c[j:j + 1400])

open('_r97_lead_audit2.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('DONE')
