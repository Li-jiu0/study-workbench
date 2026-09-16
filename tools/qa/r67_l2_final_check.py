# -*- coding: utf-8 -*-
# R67 线2 第四轮最终校验（幂等，只读不改文件）+ 行号定位 → r67_l2_final_check.txt
import io, os

ROOT = r'D:\下载的文件\学习工作台'
JS   = os.path.join(ROOT, 'assets', 'ai-page.js')
HTML = os.path.join(ROOT, 'AI.html')
OUT  = os.path.join(ROOT, 'tools', 'qa', 'r67_l2_final_check.txt')

buf = io.StringIO()
def w(*a): buf.write(' '.join(str(x) for x in a) + '\n')

s = open(JS, 'rb').read().decode('utf-8')
h = open(HTML, 'rb').read().decode('utf-8')

w('== ai-page.js (%d bytes) ==' % len(s.encode('utf-8')))
checks_js = [
    ('CTX_USAGE_TIP 已删', 'CTX_USAGE_TIP' not in s),
    ('pctTxt 已删', 'pctTxt' not in s),
    ('短 title 逻辑存在', ("el.title = '已用 '" in s)),
    ('usedTxt K 换算存在', ("var usedTxt = (used >= 1000)" in s)),
    ('旧 title 前缀已删', ('上下文已用 ' not in s)),
    ('关键词「估算值」0 命中', ('估算值' not in s)),
    ('关键词「变橙色」0 命中', ('变橙色' not in s)),
    ('关键词「变红色」0 命中', ('变红色' not in s)),
    ('CTX_RING_C 保留', ('CTX_RING_C' in s)),
    ('fmtCtxLimitK 保留', ('fmtCtxLimitK' in s)),
    ('dasharray 保留', ('stroke-dasharray' in s)),
    ('阈值 class 保留', ("ratio > 0.95 ? ' hot' : (ratio > 0.8 ? ' warn'" in s)),
    ('plainModeLabel 保留', ('plainModeLabel' in s)),
]
for name, ok in checks_js: w(' ', name, '=>', ok)

w('== AI.html (%d bytes) ==' % len(h.encode('utf-8')))
checks_html = [
    ('静态短 title', ('title="已用 0% · 0 / 1.0K"' in h)),
    ('旧长 title 已删', ('上下文已用 0（0.0%）' not in h)),
    ('关键词「估算值」0 命中', ('估算值' not in h)),
    ('关键词「变橙色」0 命中', ('变橙色' not in h)),
    ('圆环在模型钮左侧', (h.find('id="aiCtxUsage"') < h.find('id="aiModelBtn"'))),
    ('margin-right:-2px 紧邻', ('margin-right:-2px' in h)),
    ('圆环 CSS 保留', ('.ai-ctx-ring-fg{stroke:var(--ai-blue)' in h)),
]
for name, ok in checks_html: w(' ', name, '=>', ok)

for p, name, is_crlf in ((JS, 'ai-page.js', False), (HTML, 'AI.html', True)):
    d = open(p, 'rb').read()
    crlf = d.count(b'\r\n')
    lone_lf = d.count(b'\n') - crlf
    lone_cr = d.count(b'\r') - crlf
    ok = (lone_lf == 0) if is_crlf else (crlf == 0 and lone_cr == 0)
    w('EOL', name, 'CRLF=%d loneLF=%d loneCR=%d OK=%s' % (crlf, lone_lf, lone_cr, ok))

w('== 交付行号 ==')
jsl = s.split('\n'); htmll = h.split('\n')
def find(lines, key):
    hits = [i + 1 for i, l in enumerate(lines) if key in l]
    return hits[0] if hits else None
w('  ai-page.js R67/D 提示注释:', find(jsl, 'R67/D：hover 提示只留进度信息'))
w('  ai-page.js renderCtxUsage:', find(jsl, 'function renderCtxUsage'))
w('  ai-page.js usedTxt 行:', find(jsl, 'var usedTxt = (used >= 1000)'))
w('  ai-page.js 短 title 行:', find(jsl, "el.title = '已用 '"))
w('  AI.html 圆环 span:', find(htmll, 'id="aiCtxUsage"'))
w('  AI.html .ai-ctx-usage CSS:', find(htmll, '.ai-ctx-usage{display:inline-flex'))
w('  ai-page.js 总行数:', len(jsl), ' AI.html 总行数:', len(htmll))

w('ALL DONE')
with open(OUT, 'w', encoding='utf-8', newline='') as f: f.write(buf.getvalue())
print('WROTE')
