# -*- coding: utf-8 -*-
# R67 线1 静态自检：行尾 / ES2017 禁令 / 已删标识符残留 / 全局名扫描
import re
import sys

BASE = r'D:\下载的文件\学习工作台'
FILES = [
    BASE + r'\ai-settings.html',
    BASE + r'\assets\ai-settings.js',
]

fail = 0

# ES2017 禁令（正则）；命中即 FAIL（.../与 ** 单独报告供人工复核注释）
BANS = [
    ('可选链 ?.', r'\?\.'),
    ('空值合并 ??', r'\?\?'),
    ('replaceAll(', r'\.replaceAll\('),
    ('Object.fromEntries', r'Object\.fromEntries'),
    ('数组 .at(', r'\.at\('),
    ('可选 catch 绑定', r'catch\s*\(\s*\)'),
    ('正则后行断言', r'\(\?<[=!]'),
]
# 人工复核项（允许出现在注释里，需打印上下文）
REVIEW = [
    ('对象展开/剩余 ...', r'\.\.\.'),
    ('指数运算符 **', r'\*\*'),
]
# R67 已删标识符（必须 0 命中）
LEFTOVERS = [
    'lastPresetId', 'datalistMap', 'CUSTOM_OPTION', 'startAdd',
    'onNameInput', 'applyPreset', 'applyCustomOption', 'buildNamePresets',
    'setFmNameList', 'setAddCustom',
]

for p in FILES:
    name = p.split('\\')[-1]
    with open(p, 'rb') as f:
        raw = f.read()
    text = raw.decode('utf-8')
    crlf = raw.count(b'\r\n')
    cr = raw.count(b'\r')
    lone_cr = cr - crlf
    print('== %s ==' % name)
    print('  行尾: CRLF=%d loneCR=%d LF行数=%d bytes=%d' % (crlf, lone_cr, raw.count(b'\n'), len(raw)))
    if crlf != 0 or lone_cr != 0:
        print('  [FAIL] 行尾污染（应为 LF 文件）')
        fail += 1
    for label, pat in BANS:
        hits = re.findall(pat, text)
        if hits:
            print('  [FAIL] ES2017禁令 %s 命中 %d 处' % (label, len(hits)))
            fail += 1
        else:
            print('  [PASS] ES2017禁令 %s : 0' % label)
    for label, pat in REVIEW:
        for m in re.finditer(pat, text):
            ln = text.count('\n', 0, m.start()) + 1
            line = text.split('\n')[ln - 1].strip()
            print('  [REVIEW] %s @L%d: %s' % (label, ln, line[:100]))
    for ident in LEFTOVERS:
        n = text.count(ident)
        if n:
            print('  [FAIL] 已删标识符残留 %s : %d 处' % (ident, n))
            fail += 1
    # 全局名：window.xxx = 赋值（应只有 typeof 守卫的 xtAiSettings）
    for m in re.finditer(r'window\.([A-Za-z_$][\w$]*)\s*=', text):
        ln = text.count('\n', 0, m.start()) + 1
        print('  [GLOBAL] window.%s 赋值 @L%d' % (m.group(1), ln))
    # 顶层 function / var（列 0 起始，IIFE 外不应有）
    for i, line in enumerate(text.split('\n')):
        if re.match(r'^(function|var|let|const|class)\s', line):
            print('  [FAIL] 顶层声明 @L%d: %s' % (i + 1, line[:80]))
            fail += 1

print('')
print('STATIC_CHECK %s (fail=%d)' % ('PASS' if fail == 0 else 'FAIL', fail))
sys.exit(0 if fail == 0 else 1)
