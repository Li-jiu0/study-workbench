# -*- coding: utf-8 -*-
"""R11 结构配对闸：对本次上传的全部页面做 注释/div/script/style 配对 + 损坏签名扫描。"""
import io, os, re, json, subprocess

ROOT = r'D:\下载的文件\学习工作台'
os.chdir(ROOT)
m = json.load(open('tools/_r11_upload_manifest.json', encoding='utf-8'))
pages = sorted(f for f in m['files'] if f.endswith('.html'))

SIGS = [
    ('.js.js?v=', '双后缀脚本'),
    ('assets/assets/', '双 assets 路径'),
    ('?v=20260925a?', '双查询串'),
    ('</script>\n</script>', '连续闭合'),
]
out, bad = [], 0
for pg in pages:
    t = io.open(pg, encoding='utf-8', errors='ignore').read()
    # 先剥注释：HTML <!-- --> 与 JS /* */ —— 注释里出现的 <style> 字样会造成假 FAIL（沿用 R9 教训）
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    checks = {
        '注释': (t.count('<!--'), t.count('-->')),
        'div': (len(re.findall(r'<div\b', t, re.I)), len(re.findall(r'</div\s*>', t, re.I))),
        'script': (len(re.findall(r'<script\b', t, re.I)), len(re.findall(r'</script\s*>', t, re.I))),
        'style': (len(re.findall(r'<style\b', t, re.I)), len(re.findall(r'</style\s*>', t, re.I))),
    }
    issues = ['%s %d/%d' % (k, a, b) for k, (a, b) in checks.items() if a != b]
    for sig, desc in SIGS:
        if sig in t:
            issues.append(desc)
    if issues:
        bad += 1
        out.append('[FAIL] %-22s %s' % (pg, ' | '.join(issues)))
out.insert(0, '页面数=%d  不配对/损坏=%d' % (len(pages), bad))
io.open('tools/_r11_struct_out.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('\n'.join(out[:60]))
print('TOTAL_FAIL =', bad)
