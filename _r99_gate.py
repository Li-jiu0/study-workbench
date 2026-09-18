# -*- coding: utf-8 -*-
"""R99 上线前静态门禁综合检查"""
import hashlib, re

out = []

for p in ['assets/xt-profile.js', 'assets/xt-profile.css']:
    b = open(p, 'rb').read()
    crlf = b.count(b'\r\n'); lf = b.count(b'\n') - crlf
    out.append('%-24s B=%d md5=%s crlf=%d loneLF=%d' % (p, len(b), hashlib.md5(b).hexdigest(), crlf, lf))
out.append('')

s = open('assets/xt-profile.js', 'r', encoding='utf-8', newline='').read()
c = open('assets/xt-profile.css', 'r', encoding='utf-8', newline='').read()

NL = chr(10)
SQ = chr(39)
DQ = chr(34)
BT = chr(96)
BS = chr(92)


def strip_code(src):
    """剔除注释与字符串字面量，保留换行以便报行号"""
    res = []
    i = 0
    mode = None
    n = len(src)
    while i < n:
        ch = src[i]
        if mode is None:
            if src.startswith('/*', i):
                mode = 'block'; i += 2; continue
            if src.startswith('//', i):
                mode = 'line'; i += 2; continue
            if ch == SQ:
                mode = 'sq'; i += 1; continue
            if ch == DQ:
                mode = 'dq'; i += 1; continue
            if ch == BT:
                mode = 'tpl'; i += 1; continue
            res.append(ch); i += 1; continue
        if mode == 'block':
            if src.startswith('*/', i):
                mode = None; i += 2; continue
            if ch == NL:
                res.append(NL)
            i += 1
        elif mode == 'line':
            if ch == NL:
                mode = None; res.append(NL)
            i += 1
        else:
            if ch == BS:
                i += 2; continue
            if ch == NL and mode != 'tpl':
                mode = None; res.append(NL); i += 1; continue
            if (mode == 'sq' and ch == SQ) or (mode == 'dq' and ch == DQ) or (mode == 'tpl' and ch == BT):
                mode = None
            i += 1
    return ''.join(res)


def lineof(src, pos):
    return src[:pos].count(NL) + 1


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
    ('prompt(', r'(?<![.\w])prompt\s*\('),
    ('alert(', r'(?<![.\w])alert\s*\('),
    ('confirm(', r'(?<![.\w])confirm\s*\('),
]
out.append('=== JS 禁用语法（已剔注释+字符串）===')
tot = 0
for name, pat in RULES:
    ms = list(re.finditer(pat, code))
    tot += len(ms)
    out.append('  %-20s %d' % (name, len(ms)))
    for m in ms[:2]:
        ln = lineof(code, m.start())
        out.append('      L%d %s' % (ln, code.split(NL)[ln - 1].strip()[:100]))
out.append('  TOTAL=%d' % tot)

codec = strip_code(c)
out.append('')
out.append('=== CSS 禁用函数（已剔注释）===')
for name, pat in [('clamp(', r'(?<![-\w])clamp\s*\('), ('min(', r'(?<![-\w])min\s*\('), ('max(', r'(?<![-\w])max\s*\(')]:
    ms = list(re.finditer(pat, codec))
    out.append('  %-10s %d' % (name, len(ms)))
    for m in ms[:3]:
        ln = lineof(codec, m.start())
        out.append('      L%d %s' % (ln, codec.split(NL)[ln - 1].strip()[:110]))
out.append('  （calc() 允许，不计入）')

out.append('')
out.append('=== 关键结构确认 ===')
for name, pat in [
    ('ZMIN=0.4', r'ZMIN\s*=\s*0\.4'),
    ('ZMAX=5', r'ZMAX\s*=\s*5'),
    ('baseScale 定义', r'function\s+baseScale'),
    ('退化防御 maxX<minX', r'maxX\s*<\s*minX'),
    ('退化防御 maxY<minY', r'maxY\s*<\s*minY'),
    ('夹紧 var nw', r'var\s+nw\s*=\s*STATE\.natW'),
    ('夹紧 var nh', r'var\s+nh\s*=\s*STATE\.natH'),
    ('ActionSheet 定义', r'function\s+xtpOpenAvatarSheet'),
    ('PickFile 定义', r'function\s+xtpPickAvatarFile'),
    ('capture 属性', r'setAttribute\(\s*.capture.'),
    ('完成无 arc', r'ctx\.arc'),
    ('完成有 drawImage', r'ctx\.drawImage'),
]:
    out.append('  %-22s %d' % (name, len(re.findall(pat, s))))

out.append('')
out.append('=== 九宫格 / 已移除项 ===')
i = c.find('.xtp-crop-frame {')
out.append('  .xtp-crop-frame{ 内 linear-gradient = %d' % c[i:c.find('}', i)].count('linear-gradient'))
for name, pat in [('#xtpCropZoom', r'xtpCropZoom'), ('.xtp-crop-bottom', r'\.xtp-crop-bottom'), ('.xtp-crop-zi', r'\.xtp-crop-zi')]:
    out.append('  已移除项 %-18s JS=%d CSS=%d' % (name, len(re.findall(pat, s)), len(re.findall(pat, c))))

out.append('')
out.append('=== 头像圆角 ===')
for sel in ['.xtp-hero-avatar', '.xtp-avatar-row .xtp-avatar-sm']:
    i = c.find(sel + ' {')
    blk = c[i:c.find('}', i)] if i >= 0 else ''
    m = re.search(r'border-radius:\s*([^;]+);', blk)
    out.append('  %-34s border-radius: %s' % (sel, m.group(1).strip() if m else '??'))

out.append('')
out.append('=== 版本戳 ===')
for name, pat in [('xt-profile.css', r'xt-profile\.css\?v=([0-9A-Za-z]+)'), ('xt-profile.js', r'xt-profile\.js\?v=([0-9A-Za-z]+)')]:
    seen = {}
    import os
    for root, dirs, files in os.walk('.'):
        if any(x in root for x in ['android', 'node_modules', '.git', 'server']):
            continue
        for f in files:
            if not f.endswith('.html'):
                continue
            fp = os.path.join(root, f)
            try:
                txt = open(fp, 'r', encoding='utf-8', errors='ignore').read()
            except Exception:
                continue
            for m in re.finditer(pat, txt):
                seen.setdefault(m.group(1), []).append(fp)
    for v in sorted(seen):
        out.append('  %-16s v=%-12s 页面数=%d  %s' % (name, v, len(seen[v]), ', '.join(seen[v])))

open('_r99_gate.txt', 'w', encoding='utf-8').write(NL.join(out))
