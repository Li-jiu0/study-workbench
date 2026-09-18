# -*- coding: utf-8 -*-
"""核实：动态空间 入口的真实接线情况
1) 各页面侧栏 data-page="moments" 出现情况
2) app.js PAGE_FILES 是否有 moments 键 + navigateTo 对未知键的处理
3) 动态空间.html / 朋友圈.html / 我的动态.html / 动态.html 现状
"""
import io, os, glob
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_moments_wire.txt')
res = []

# 1) html 侧栏
hits = []
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    try:
        s = io.open(p, encoding='utf-8').read()
    except Exception as e:
        res.append('READ_FAIL %s %r' % (os.path.basename(p), e)); continue
    n = s.count('data-page="moments"')
    if n:
        hits.append('%s  x%d' % (os.path.basename(p), n))
res.append('--- html 含 data-page="moments" 的文件 (%d) ---' % len(hits))
res.extend(hits)

# 2) 文件存在性
res.append('--- 关键文件存在性 ---')
for name in ['动态空间.html', '朋友圈.html', '我的动态.html', '我的朋友圈.html', '动态.html', '朋友圈发布.html', '个人资料.html']:
    p = os.path.join(ROOT, name)
    if os.path.exists(p):
        res.append('%s 存在 %d B' % (name, os.path.getsize(p)))
    else:
        res.append('%s 不存在' % name)

# 3) app.js PAGE_FILES + navigateTo
s = io.open(os.path.join(ROOT, 'assets', 'app.js'), encoding='utf-8').read()
res.append('--- app.js ---')
res.append('moments 出现次数=%d' % s.count("moments"))
q = s.find('const PAGE_FILES')
res.append('PAGE_FILES 定义位置=%d' % q)
if q >= 0:
    res.append(s[q:q+1200].replace('\n', '\\n'))
q2 = s.find('function navigateTo')
res.append('navigateTo 定义位置=%d' % q2)
if q2 >= 0:
    res.append(s[q2:q2+1800].replace('\n', '\\n'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
