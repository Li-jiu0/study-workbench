# -*- coding: utf-8 -*-
"""精确扫描：只看「零缩进的顶层声明」= 真正挂在 window 上的全局名"""
import os, re

ROOT = r'D:\下载的文件\学习工作台'
HTML = os.path.join(ROOT, 'AI模拟面试.html')
IVP = os.path.join(ROOT, 'assets', 'iv-prep.js')

h = open(HTML, 'r', encoding='utf-8').read()
j = open(IVP, 'r', encoding='utf-8').read()
out = []

# 提取内联 script
blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', h)
out.append('内联 script 块数 = %d' % len(blocks))

# 拼接所有内联块，但保留行号映射：逐块扫「^var/const/let」（零缩进）
TOP = re.compile(r'^(var|const|let)\s+([A-Za-z_$][\w$]*)', re.M)
html_tops = {}
for bi, b in enumerate(blocks, 1):
    for m in TOP.finditer(b):
        html_tops.setdefault(m.group(2), []).append('blk%d:%s' % (bi, m.group(1)))

out.append('')
out.append('== HTML 内联脚本「零缩进顶层声明」(%d 个) ==' % len(html_tops))
for n in sorted(html_tops):
    out.append('  %-24s %s' % (n, ','.join(html_tops[n])))

# iv-prep.js 是 IIFE，零缩进顶层声明应为 0
ivp_tops = {}
for m in TOP.finditer(j):
    ivp_tops.setdefault(m.group(2), []).append(m.group(1))
out.append('')
out.append('== iv-prep.js「零缩进顶层声明」数 = %d ==' % len(ivp_tops))
for n in sorted(ivp_tops):
    out.append('  ' + n)

# 冲突
RISK = ['INTERVIEW_QUESTIONS', 'toastTimer', 'STAGES', 'IV_STAGES', 'IV_BAR_STAGES',
        'IV_TERMINAL', 'IV_STAGE_LABEL', 'currentStage', 'stages', 'stage']
out.append('')
out.append('== 风险名交叉 ==')
for rn in RISK:
    a = 'HTML-top' if rn in html_tops else '-'
    b = 'IVP-top' if rn in ivp_tops else '-'
    out.append('  %-22s HTML=%-9s IVP=%s' % (rn, a, b))

# iv-prep.js 里写 window.X 的完整清单
out.append('')
out.append('== iv-prep.js 写入的 window.* 名 ==')
for m in sorted(set(re.findall(r'window\.([A-Za-z_$][\w$]*)\s*=', j))):
    out.append('  ' + m)

# 在 IVP 的 IIFE 里 IV_MACHINE_CLIENT 等是 var（局部），确认无泄漏
out.append('')
out.append('== iv-prep.js 顶层（缩进 0）全部行 ==')
for i, ln in enumerate(j.split('\n'), 1):
    if re.match(r'^(var|const|let|function)\s', ln):
        out.append('  L%d: %s' % (i, ln.strip()[:110]))

open(os.path.join(ROOT, 'tools', 'qa', '_a4_tops_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('OK')
