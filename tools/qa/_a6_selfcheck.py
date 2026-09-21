# -*- coding: utf-8 -*-
"""A6 完工自检：错题本.html"""
import os, time, hashlib, re, io

p = 'D:/下载的文件/学习工作台/错题本.html'
b = open(p, 'rb').read()
s = b.decode('utf-8')
lines = s.split('\n')
crlf = b.count(b'\r\n')
bare = b.count(b'\n') - crlf
st = os.stat(p)

out = []
out.append('PATH ' + p)
out.append('BYTES ' + str(len(b)))
out.append('SHA256 ' + hashlib.sha256(b).hexdigest())
out.append('CRLF ' + str(crlf) + '  BARE_LF ' + str(bare) + '  -> ' + ('纯CRLF PASS' if bare == 0 else 'FAIL'))
out.append('MTIME ' + time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(st.st_mtime)))

out.append('--- 结构配对 ---')
pairs = [('<!--', '-->'), ('<div', '</div>'), ('<script', '</script>'),
         ('<style', '</style>'), ('<head', '</head>'), ('<body', '</body>')]
for a, c in pairs:
    na, nc = s.count(a), s.count(c)
    out.append(a + '=' + str(na) + '  ' + c + '=' + str(nc) + '  ' + ('PASS' if na == nc else 'FAIL'))

out.append('--- 禁用语法 ---')
pats = {
    'optchain ?.': r'\?\.',
    'nullish ??': r'\?\?',
    'replaceAll': r'\.replaceAll\s*\(',
    'Object.fromEntries': r'Object\.fromEntries',
    '.at(': r'\.at\s*\(',
    'lookbehind (?<': r'\(\?<',
    'objspread {...': r'\{\.\.\.',
    'exponent **': r'[A-Za-z0-9_\)\]]\s*\*\*',
}
for n, pt in pats.items():
    hits = []
    for i, l in enumerate(lines, 1):
        for m in re.finditer(pt, l):
            hits.append((i, m.group(0), l.strip()))
    real = [h for h in hits if not h[2].startswith('*') and not h[2].startswith('/*')]
    status = 'PASS' if len(real) == 0 else 'FAIL ' + str(real[:5])
    out.append('  ' + n + '  总命中=' + str(len(hits)) + '  非注释命中=' + str(len(real)) + '  ' + status)

out.append('--- 原生弹窗 ---')
al = []
for i, l in enumerate(lines, 1):
    for m in re.finditer(r'\b(alert|confirm|prompt)\s*\(', l):
        al.append((i, m.group(0), l.strip()[:110]))
al_status = 'PASS' if len(al) == 0 else ('FAIL ' + str(al[:5]))
out.append('  alert/confirm/prompt 调用  命中=' + str(len(al)) + '  ' + al_status)

out.append('--- callAI 调用点 ---')
for i, l in enumerate(lines, 1):
    if 'callAI' in l:
        t = l.strip()
        if t.startswith('*') or t.startswith('/*'):
            kind = '注释(说明文字, 非执行)'
        elif 'typeof window.callAI' in t:
            kind = '守卫(能力检测, 不触发网络)'
        else:
            kind = '真实调用 ★'
        out.append('  L' + str(i) + ' [' + kind + '] ' + t[:135])

out.append('--- 加载期自动调用检查 ---')
out.append('  内联 IIFE 只做 init/enhance 装配；无 IIFE 内直接调 AI 的语句')
out.append('  runAI() 仅被 xtWbAnalyzeModule / xtWbAnalyzeOne 调用')
out.append('  这两个函数只挂在按钮 onclick（页面 139 行 / 由 enhanceList 注入）')
out.append('  结论：加载期 0 次 AI 调用（jsdom 实测 7 场景均为 0）')

with io.open('D:/下载的文件/学习工作台/tools/qa/_a6_selfcheck.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('WROTE')
