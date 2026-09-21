# -*- coding: utf-8 -*-
"""核实：是否存在真实的「错题未复习/待复习」状态源（间隔重复系统）"""
import os, re

ROOT = r'D:\下载的文件\学习工作台'
out = []
def log(s=''):
    out.append(str(s))

def rd(rel):
    return open(os.path.join(ROOT, rel), 'rb').read().decode('utf-8', 'ignore')

app = rd('assets/app.js')

log('== A) recordExamQuestion 及间隔重复系统 ==')
for m in re.finditer(r'recordExamQuestion|间隔重复|spaced|reviewAt|nextReview|dueAt|复习到期|待复习|未复习', app):
    ln = app.count('\n', 0, m.start()) + 1
    seg = app[max(0, m.start() - 140): m.start() + 260].replace('\r', '')
    log('  :%d  %s' % (ln, seg.replace('\n', ' / ')[:330]))
log('')

log('== B) 相关 localStorage 键（app.js 内全部 setItem/getItem）==')
keys = set()
for k in re.findall(r"localStorage\.(?:getItem|setItem)\(\s*['\"]([^'\"]{2,60})['\"]", app):
    keys.add(k)
for k in re.findall(r"(?:LS_KEY|LSK|KEY_[A-Z0-9_]+|STORAGE_KEY)\s*=\s*['\"]([^'\"]{2,60})['\"]", app):
    keys.add(k)
for k in sorted(keys):
    log('  ' + k)
log('')

log('== C) 错题原因 / 复习相关键（grep wrong / review / sr 前缀）==')
for k in sorted(keys):
    if re.search(r'wrong|review|sr|exam', k, re.I):
        log('  ** %s' % k)
log('')

log('== D) 全站 grep「未复习」「待复习」「复习」在加载文件内的命中 ==')
FILES = ['assets/app.js', 'assets/api.js', 'assets/quest.js', 'assets/study-stats.js',
         '错题本.html', '学习概括.html', '学习工作台.html', '学途.html', 'assets/xt-profile.js']
for rel in FILES:
    fp = os.path.join(ROOT, rel)
    if not os.path.exists(fp):
        continue
    t = rd(rel)
    n1, n2, n3 = t.count('未复习'), t.count('待复习'), t.count('复习')
    if n1 or n2 or n3:
        log('  %-22s 未复习=%d 待复习=%d 复习=%d' % (rel, n1, n2, n3))
        for pat in ['未复习', '待复习']:
            for m in re.finditer(pat, t):
                ln = t.count('\n', 0, m.start()) + 1
                seg = t[max(0, m.start() - 110): m.start() + 150].replace('\r', '')
                log('       :%d %s' % (ln, seg.replace('\n', ' / ')[:230]))

open(os.path.join(ROOT, 'tools', '_r73_wrongbadge.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('WROTE tools/_r73_wrongbadge.txt')
