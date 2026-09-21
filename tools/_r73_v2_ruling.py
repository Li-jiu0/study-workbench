# -*- coding: utf-8 -*-
"""v2 拍板前的三处定点核实：错题本状态源 / 作品集真实落点 / 版本号真实来源"""
import os, re

ROOT = r'D:\下载的文件\学习工作台'
out = []
def log(s=''):
    out.append(str(s))

def rd(rel):
    return open(os.path.join(ROOT, rel), 'rb').read().decode('utf-8', 'ignore')

# ---------- 1) 错题本：是否存在「已掌握/已复习」状态源 ----------
log('== 1) wrongQuestions 状态源核查 ==')
app = rd('assets/app.js')
qb = rd('错题本.html')
for name, t in [('app.js', app), ('错题本.html', qb)]:
    for m in re.finditer(r'wrongQuestions', t):
        ln = t.count('\n', 0, m.start()) + 1
        seg = t[max(0, m.start() - 90): m.start() + 150].replace('\r', '')
        log('  [%s:%d] ...%s...' % (name, ln, seg.replace('\n', ' / ')[:230]))
    log('  --- %s 内「已掌握/mastered/reviewed/已复习」出现次数: mastered=%d reviewed=%d 已掌握=%d 已复习=%d' % (
        name, t.count('mastered'), t.count('reviewed'), t.count('已掌握'), t.count('已复习')))
log('')

# ---------- 2) 作品集真实落点 ----------
log('== 2) 作品集落点核查 ==')
for rel in ['个人中心.html', '我的文件.html']:
    t = rd(rel)
    log('  ── %s（作品集 x%d）' % (rel, t.count('作品集')))
    for m in re.finditer('作品集', t):
        ln = t.count('\n', 0, m.start()) + 1
        seg = t[max(0, m.start() - 120): m.start() + 120].replace('\r', '')
        log('     :%d  %s' % (ln, seg.replace('\n', ' / ')[:230]))
log('')

# ---------- 3) 版本号真实来源 ----------
log('== 3) 版本号来源核查 ==')
for rel in ['关于.html', 'assets/config.js', 'assets/app.js', 'assets/xt-profile.js']:
    if not os.path.exists(os.path.join(ROOT, rel)):
        log('  %s MISSING' % rel); continue
    t = rd(rel)
    hits = []
    for pat in [r'aboutVersion', r'VERSION\s*=', r'版本号', r'v2\.\d', r'v1\.\d', r'version\s*[:=]']:
        for m in re.finditer(pat, t):
            ln = t.count('\n', 0, m.start()) + 1
            seg = t[max(0, m.start() - 70): m.start() + 90].replace('\r', '')
            hits.append(':%d[%s] %s' % (ln, pat, seg.replace('\n', ' ')[:150]))
    log('  ── %s' % rel)
    for h in hits[:8]:
        log('     ' + h)
log('')

# ---------- 4) 关于.html 里版本号到底显示什么 ----------
t = rd('关于.html')
m = re.search(r'id=["\']aboutVersion["\'][^>]*>([^<]{0,40})', t)
log('== 4) 关于.html #aboutVersion 元素初值 ==')
log('  %s' % (m.group(1) if m else 'NOT FOUND'))
for m in re.finditer(r'版本[^<\n]{0,40}', t):
    log('  ...%s' % m.group(0)[:80])
log('')

# ---------- 5) xt-profile.js 的版本回退常量 ----------
t = rd('assets/xt-profile.js')
log('== 5) xt-profile.js 内版本相关 ==')
for m in re.finditer(r'(v2\.\d|VERSION|版本)', t):
    ln = t.count('\n', 0, m.start()) + 1
    seg = t[max(0, m.start() - 90): m.start() + 110].replace('\r', '')
    log('  :%d  %s' % (ln, seg.replace('\n', ' ')[:200]))

open(os.path.join(ROOT, 'tools', '_r73_v2_ruling.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('WROTE tools/_r73_v2_ruling.txt')
