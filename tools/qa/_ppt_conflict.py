# -*- coding: utf-8 -*-
"""N9-14 双线冲突：核实现场状态（谁改了什么）"""
import io, os, time, re
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', '_ppt_conflict.txt')
L = []

FILES = ['assets/data-ppt-tips.js', 'assets/ppt-tips.js', 'assets/data-ppt-class.js',
         'assets/design-class.js', 'PPT训练.html']

def info(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return '%s :: 不存在' % rel
    s = io.open(p, encoding='utf-8', errors='replace').read()
    hits = {
        'cases:': len(re.findall(r'\bcases\s*:', s)),
        'casesArt:': len(re.findall(r'casesArt\s*:', s)),
        'PT_caseSvg': len(re.findall(r'PT_caseSvg', s)),
        'PT_renderCaseArt': len(re.findall(r'PT_renderCaseArt', s)),
        'notify Parents': len(re.findall(r'进度条|progress', s)),
    }
    return '%-28s size=%-8d mtime=%s  %s' % (
        rel, len(s.encode('utf-8')),
        time.strftime('%m-%d %H:%M:%S', time.localtime(os.path.getmtime(p))),
        ' '.join('%s=%d' % (k, v) for k, v in hits.items() if v))

L.append('== 目标文件现状 ==')
for f in FILES:
    L.append('  ' + info(f))

L.append('')
L.append('== .bak-20260915w2 备份清单（谁备份=谁动过） ==')
for d in [ROOT, os.path.join(ROOT, 'assets')]:
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.bak-20260915w2') or '.bak-20260915w2' in fn:
            p = os.path.join(d, fn)
            L.append('  %-46s size=%-8d %s' % (fn, os.path.getsize(p),
                     time.strftime('%m-%d %H:%M:%S', time.localtime(os.path.getmtime(p)))))

L.append('')
L.append('== cases / casesArt 归属抽样 ==')
p = os.path.join(ROOT, 'assets/data-ppt-tips.js')
if os.path.exists(p):
    s = io.open(p, encoding='utf-8', errors='replace').read()
    for m in re.finditer(r'(cases|casesArt)\s*:', s):
        seg = s[max(0, m.start()-160):m.start()+80].replace('\n', ' | ')
        L.append('  ...' + seg[-220:])
        if len(L) > 40:
            break

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('CONFLICT_AUDIT_DONE')
