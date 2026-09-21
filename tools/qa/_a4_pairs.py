# -*- coding: utf-8 -*-
import os, re, json

ROOT = r'D:\下载的文件\学习工作台'
HTML = os.path.join(ROOT, 'AI模拟面试.html')
IVP = os.path.join(ROOT, 'assets', 'iv-prep.js')
out = []

h = open(HTML, 'r', encoding='utf-8').read()
j = open(IVP, 'r', encoding='utf-8').read()

out.append('== AI模拟面试.html 配对检查 ==')
pairs = [
    ('<!--', '-->'),
    ('<div', '</div>'),
    ('<script', '</script>'),
    ('<style', '</style>'),
]
for a, b in pairs:
    ca = h.count(a); cb = h.count(b)
    out.append('  %-10s = %d  |  %-10s = %d  -> %s' % (a, ca, b, cb, 'OK' if ca == cb else 'MISMATCH'))

out.append('')
out.append('== AI模拟面试.html 顶层 var/const/let 声明 ==')
# 只取内联 script 块
blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', h)
inline = '\n'.join(blocks)
tops = re.findall(r'^\s*(var|const|let)\s+([A-Za-z_$][\w$]*)\s*(=|;|,)', inline, re.M)
seen = {}
for k, n, _tail in tops:
    seen.setdefault(n, []).append(k)
for n in sorted(seen):
    out.append('  %-26s %s' % (n, ','.join(seen[n])))
out.append('  (共 %d 个顶层名)' % len(seen))

out.append('')
out.append('== 风险名冲突检查 ==')
for rn in ['INTERVIEW_QUESTIONS', 'toastTimer', 'STAGES', 'IV_STAGES', 'IV_BAR_STAGES', 'IV_TERMINAL', 'IV_STAGE_LABEL']:
    out.append('  AI模拟面试.html 顶层: %-22s -> %s' % (rn, seen.get(rn, 'NONE')))
    # iv-prep.js 是否为顶层（非 IIFE 内）
    if re.search(r'^\s*(var|const|let)\s+' + rn + r'\b', j, re.M):
        out.append('     iv-prep.js 顶层声明 -> YES')
    else:
        out.append('     iv-prep.js 顶层声明 -> no (IIFE 内 / window.xxx 挂载)')

out.append('')
out.append('== iv-prep.js 顶层声明清单（应为空 / 仅 IIFE 外无声明）==')
jt = re.findall(r'^\s*(var|const|let)\s+([A-Za-z_$][\w$]*)\s*(=|;|,)', j, re.M)
out.append('  顶层声明数 = %d' % len(jt))
for k, n, _tail in jt:
    out.append('    %s %s' % (k, n))

out.append('')
out.append('== window.xxx 挂载点 ==')
for m in re.finditer(r'window\.([A-Za-z_$][\w$]*)\s*=', j):
    out.append('  ' + m.group(0))

out.append('')
out.append('== 对象展开 {... 检出 ==')
# 检查 "{ ..." 与 "...spread inside object literal:  e.g. ({...a})  / {..., x}
hits = []
for i, ln in enumerate(j.split('\n'), 1):
    for m in re.finditer(r'\{\s*\.\.\.', ln):
        hits.append('  iv-prep.js:%d: %s' % (i, ln.strip()[:120]))
for i, ln in enumerate(h.split('\n'), 1):
    for m in re.finditer(r'\{\s*\.\.\.', ln):
        hits.append('  AI模拟面试.html:%d: %s' % (i, ln.strip()[:120]))
out.append('\n'.join(hits) if hits else '  (无对象展开)')

out.append('')
out.append('== 原生 alert/confirm/prompt ==')
for nm, txt in [('AI模拟面试.html', h), ('assets/iv-prep.js', j)]:
    found = []
    for i, ln in enumerate(txt.split('\n'), 1):
        # 去掉字符串字面量中的内容做粗判
        for m in re.finditer(r'(?:^|[^.\w$])(alert|confirm|prompt)\s*\(', ln):
            seg = ln[max(0, m.start()-1):]
            found.append('  %s:%d: %s' % (nm, i, ln.strip()[:140]))
    out.append('\n'.join(found) if found else '  %s: 0 命中' % nm)

open(os.path.join(ROOT, 'tools', 'qa', '_a4_pairs_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('OK')
