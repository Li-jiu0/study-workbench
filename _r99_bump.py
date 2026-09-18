# -*- coding: utf-8 -*-
"""R97+R98+R99 头像改造 —— 版本戳 bump（全站等长替换，保持行尾不变）"""
import os, re, hashlib

ROOT = '.'

# 本轮改动的两个文件与其引用方 -> 新版本戳
TARGETS = {
    'xt-profile.css': '20260919b',
    'xt-profile.js': '20260919b',
}

def fp(p):
    b = open(p, 'rb').read()
    crlf = b.count(b'\r\n'); lf = b.count(b'\n') - crlf
    return len(b), hashlib.md5(b).hexdigest(), crlf, lf

report = []
changed = []
unmatched = []

for root, dirs, files in os.walk(ROOT):
    if any(x in root for x in ['android', 'node_modules', '.git', 'server']):
        continue
    for f in files:
        if not f.endswith('.html'):
            continue
        p = os.path.join(root, f)
        try:
            s = open(p, 'r', encoding='utf-8', newline='').read()
        except Exception:
            continue
        orig = s
        for asset, newv in TARGETS.items():
            # 只替换 <asset>?v=xxx 形式的版本戳；等长替换保证字节数不变
            pat = re.compile(r'(' + re.escape(asset) + r')\?v=([0-9A-Za-z]+)')
            def rep(m):
                old = m.group(2)
                if old == newv:
                    return m.group(0)
                if len(old) != len(newv):
                    unmatched.append('%s %s old=%s len %d != %d' % (p, asset, old, len(old), len(newv)))
                    return m.group(0)
                report.append('  %-30s %-16s %s -> %s' % (p, asset, old, newv))
                return m.group(1) + '?v=' + newv
            s = pat.sub(rep, s)
        if s != orig:
            open(p, 'w', encoding='utf-8', newline='').write(s)
            changed.append(p)

out = []
out.append('=== 版本戳替换明细 ===')
out.extend(report if report else ['  （无变更）'])
out.append('')
out.append('=== 长度不匹配（应为空）===')
out.extend(unmatched if unmatched else ['  无'])
out.append('')
out.append('=== 被改写文件数 = %d ===' % len(changed))
for p in changed:
    out.append('  ' + p)

# 复核：字节数是否不变 + 行尾是否不变
out.append('')
out.append('=== 改写后复核（字节数/行尾）===')
for p in changed:
    n, md5, crlf, lf = fp(p)
    out.append('  %-30s B=%d md5=%s crlf=%d loneLF=%d' % (p, n, md5, crlf, lf))

out.append('')
out.append('=== 最终：仍然引用旧戳的地方（应为空）===')
left = []
for root, dirs, files in os.walk(ROOT):
    if any(x in root for x in ['android', 'node_modules', '.git', 'server']):
        continue
    for f in files:
        if not f.endswith('.html'):
            continue
        p = os.path.join(root, f)
        try:
            s = open(p, 'r', encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        for asset in TARGETS:
            for m in re.finditer(re.escape(asset) + r'\?v=([0-9A-Za-z]+)', s):
                if m.group(1) != TARGETS[asset]:
                    left.append('  %s %s v=%s' % (p, asset, m.group(1)))
out.extend(left if left else ['  无，全部已 bump 到 20260919b'])

open('_r99_bump.txt', 'w', encoding='utf-8').write('\n'.join(out))
