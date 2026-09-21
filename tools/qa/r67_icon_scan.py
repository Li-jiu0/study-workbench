# -*- coding: utf-8 -*-
# 扫描 ai-settings.html / ai-settings.js 中的 emoji / 符号图标（非中文非 ASCII 可见符号）
import re
import unicodedata

BASE = r'D:\下载的文件\学习工作台'
FILES = [BASE + r'\ai-settings.html', BASE + r'\assets\ai-settings.js']


def is_cjk_or_text(ch):
    o = ord(ch)
    if o < 128:
        return True
    # CJK 统一表意 / 假名 / 谚文 / 全角标点 / 中文标点
    if 0x3000 <= o <= 0x303F or 0x4E00 <= o <= 0x9FFF or 0x3040 <= o <= 0x30FF \
       or 0xAC00 <= o <= 0xD7AF or 0xFF00 <= o <= 0xFFEF or o in (0x2014, 0x00B7, 0x2026, 0x00B7):
        return True
    return False


OUT = []


def emit(s):
    OUT.append(s)


for p in FILES:
    name = p.split('\\')[-1]
    emit('===== %s =====' % name)
    with open(p, 'rb') as f:
        text = f.read().decode('utf-8')
    seen = {}
    for i, line in enumerate(text.split('\n')):
        for ch in line:
            if not is_cjk_or_text(ch) and ch not in ' \t':
                seen.setdefault(ch, []).append(i + 1)
    for ch, lns in sorted(seen.items()):
        try:
            nameOf = unicodedata.name(ch)
        except ValueError:
            nameOf = '?'
        emit('  U+%04X %s %-30s x%d @L%s' % (ord(ch), ch, nameOf[:30], len(lns),
                                             ','.join(str(x) for x in lns[:12]) + ('...' if len(lns) > 12 else '')))

with open(BASE + r'\tools\qa\r67_icon_scan_result.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(OUT))
print('WROTE %d lines' % len(OUT))
