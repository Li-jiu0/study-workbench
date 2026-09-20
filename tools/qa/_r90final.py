# -*- coding: utf-8 -*-
"""R90 item3 final self-check: structural pairing + line endings + byte counts."""
import os, re

ROOT = 'D:/下载的文件/学习工作台'
out = []
out.append('=== 行尾 / 体积复核 ===')
for rel in ['私聊.html', 'assets/xt-region.js', '朋友圈发布.html']:
    b = open(os.path.join(ROOT, rel), 'rb').read()
    crlf = b.count(b'\r\n'); lf = b.count(b'\n') - crlf; cr = b.count(b'\r') - crlf
    out.append('%-24s bytes=%-7d crlf=%-5d loneLF=%-4d loneCR=%d' % (rel, len(b), crlf, lf, cr))

out.append('')
out.append('=== HTML 结构配对自检 ===')
s = open(os.path.join(ROOT, '私聊.html'), 'rb').read().decode('utf-8')
checks = [('<!--', s.count('<!--'), '-->', s.count('-->')),
          ('<div', len(re.findall(r'<div\b', s)), '</div', s.count('</div')),
          ('<style', len(re.findall(r'<style\b', s)), '</style', s.count('</style')),
          ('<script', len(re.findall(r'<script\b', s)), '</script', s.count('</script')),
          ('<button', len(re.findall(r'<button\b', s)), '</button', s.count('</button'))]
for a, va, b2, vb in checks:
    out.append('   %-10s %-4d  %-10s %-4d   %s' % (a, va, b2, vb, 'OK' if va == vb else '!!! MISMATCH'))

out.append('')
out.append('=== 禁用语法扫描（xt-region.js） ===')
reg = open(os.path.join(ROOT, 'assets/xt-region.js'), 'rb').read().decode('utf-8')
banned = [r'\?\.', r'\?\?', r'\.replaceAll\(', r'Object\.fromEntries', r'\.at\(', r'catch\s*\{']
for pat in banned:
    out.append('   %-22s hits=%d' % (pat, len(re.findall(pat, reg))))
out.append('   CSS clamp/min/max hits=%d' % len(re.findall(r'\b(?:clamp|min|max)\s*\(', reg)))

out.append('')
out.append('=== 原生弹窗扫描 ===')
for rel in ['私聊.html', 'assets/xt-region.js']:
    t = open(os.path.join(ROOT, rel), 'rb').read().decode('utf-8')
    out.append('   %-22s prompt/alert=%s' % (rel, re.findall(r'\b(?:window\.)?(prompt|alert)\s*\(', t)))

out.append('')
out.append('=== 定位入口计数 ===')
out.append('   私聊.html #imLocBtn = %d' % s.count('id="imLocBtn"'))
out.append('   私聊.html imPlusPickLocation 调用点 = %d' % s.count('imPlusPickLocation()'))
out.append('   私聊.html window.imPlusPickLocation 定义 = %d' % s.count('window.imPlusPickLocation = function'))
out.append('   私聊.html im-plus-item 总数 = %d' % len(re.findall(r'class="im-plus-item"', s)))

open(os.path.join(ROOT, 'tools/qa/r90_item3_selfcheck.txt'), 'wb').write('\n'.join(out).encode('utf-8'))
