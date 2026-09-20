# -*- coding: utf-8 -*-
# R67 线2 两轮累计 diff（对照 .bak-pre-r67-20260916 原始备份）+ 最终行号定位，结果写 r67_l2_final_diff.txt
import difflib, io, os

ROOT = r'D:\下载的文件\学习工作台'
pairs = [(ROOT + r'\assets\ai-page.js', ROOT + r'\assets\ai-page.js.bak-pre-r67-20260916'),
         (ROOT + r'\AI.html', ROOT + r'\AI.html.bak-pre-r67-20260916')]
buf = io.StringIO()
for new, bak in pairs:
    a = open(bak, 'rb').read().decode('utf-8').replace('\r\n', '\n').split('\n')
    b = open(new, 'rb').read().decode('utf-8').replace('\r\n', '\n').split('\n')
    d = list(difflib.unified_diff(a, b, lineterm='', n=0))
    hunks = [l for l in d if l.startswith('@@')]
    name = new.split('\\')[-1]
    buf.write('=== %s : %d hunks, %d -> %d lines\n' % (name, len(hunks), len(a), len(b)))
    for l in hunks:
        buf.write('  ' + l + '\n')

# 关键交付点行号
js = open(ROOT + r'\assets\ai-page.js', 'rb').read().decode('utf-8').split('\n')
html = open(ROOT + r'\AI.html', 'rb').read().decode('utf-8').split('\n')
def find(lines, key):
    return [i + 1 for i, l in enumerate(lines) if key in l]
buf.write('--- ai-page.js 交付行号 ---\n')
for k in ['R66/N5 + R67/A/B', 'function fmtCtxLimitK', 'var CTX_USAGE_TIP', 'var CTX_RING_C', 'function renderCtxUsage', 'function plainModeLabel', 'plainModeLabel(modeInfo)', 'escHtml(plainModeLabel(info))', 'toast(\'已切到 \' + plainModeLabel']:
    buf.write('  %s -> %s\n' % (k, find(js, k)))
buf.write('--- AI.html 交付行号 ---\n')
for k in ['.ai-foot-right{display:flex', '.ai-ctx-usage{display:inline-flex', '.ai-ctx-ring-fg{stroke:var(--ai-blue)', '.ai-ctx-usage.hot .ai-ctx-pct', '@media (max-width:420px)', 'id="aiCtxUsage"']:
    buf.write('  %s -> %s\n' % (k, find(html, k)))

with open(ROOT + r'\tools\qa\r67_l2_final_diff.txt', 'w', encoding='utf-8', newline='') as f:
    f.write(buf.getvalue())
print('WROTE')
