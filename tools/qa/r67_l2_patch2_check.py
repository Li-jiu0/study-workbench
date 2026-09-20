# -*- coding: utf-8 -*-
# 验证 r67_l2_patch2.py 是否已落盘 + 重跑补丁幂等检查 + 行尾统计，结果写 r67_l2_patch2_check.txt
import io, os

ROOT = r'D:\下载的文件\学习工作台'
JS   = os.path.join(ROOT, 'assets', 'ai-page.js')
HTML = os.path.join(ROOT, 'AI.html')
OUT  = os.path.join(ROOT, 'tools', 'qa', 'r67_l2_patch2_check.txt')

buf = io.StringIO()
def w(*a):
    buf.write(' '.join(str(x) for x in a) + '\n')

d1 = open(JS, 'rb').read()
d2 = open(HTML, 'rb').read()
s1 = d1.decode('utf-8')
s2 = d2.decode('utf-8')

w('ai-page.js bytes:', len(d1))
w('  CTX_RING_C:', s1.count('CTX_RING_C'), '(期望 3：定义+2 使用)')
w('  plainModeLabel:', s1.count('plainModeLabel'), '(期望 5：定义+4 调用)')
w('  ai-ctx-ring JS:', s1.count('ai-ctx-ring'), '(期望 >=3)')
w('  stroke-dasharray:', s1.count('stroke-dasharray'), '(期望 1)')
w('  旧长文本格式残留:', ("'% · '" in s1) or ('上下文已使用' in s1), '(期望 False)')
w('  escHtml(info.label) 残留:', s1.count('escHtml(info.label)'), '(期望 0)')
w('AI.html bytes:', len(d2))
w('  ai-ctx-ring css:', s2.count('.ai-ctx-ring'), '(期望 >=5)')
w('  ai-ctx-pct css:', s2.count('.ai-ctx-pct'), '(期望 >=5)')
w('  旧 span 文案残留:', ('上下文已使用' in s2) or ('已用 0 / 1k' in s2), '(期望 False)')
w('  新 span 初始:', ('>0%</span></span>' in s2), '(期望 True)')
w('  cursor:help:', ('cursor:help' in s2), '(期望 True)')

for p, name, is_crlf in ((JS, 'ai-page.js', False), (HTML, 'AI.html', True)):
    d = open(p, 'rb').read()
    crlf = d.count(b'\r\n')
    lone_lf = d.count(b'\n') - crlf
    lone_cr = d.count(b'\r') - crlf
    w('EOL', name, 'CRLF=%d loneLF=%d loneCR=%d' % (crlf, lone_lf, lone_cr))

with open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write(buf.getvalue())
print('WROTE', OUT)
