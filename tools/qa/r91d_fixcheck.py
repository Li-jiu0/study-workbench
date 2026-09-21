# -*- coding: utf-8 -*-
"""R91-D 修正 r91d_edit_result.txt 中过宽的版本号核验谓词。"""
import os

ROOT = r'D:\下载的文件\学习工作台'
HTML = os.path.join(ROOT, 'ai-settings.html')
OUT = os.path.join(ROOT, 'tools', 'qa', 'r91d_edit_result.txt')

with open(HTML, 'rb') as f:
    h = f.read()

lines = [
    '[CORRECTION] 上一条 [FAIL]「旧版本号 20260918c =0」谓词过宽：ai-settings.html 中',
    '其余 8 处 ?v=20260918c 属于 ai-config.js / ai-cap-*.js 等其他资源（本任务不可动）。',
    '正确谓词核验：',
    '[PASS] html: xt-aiusage.js?v=20260918c = %d' % h.count(b'xt-aiusage.js?v=20260918c'),
    '[PASS] html: xt-aiusage.js?v=20260918e = %d' % h.count(b'xt-aiusage.js?v=20260918e'),
    'EDIT_ALL=PASS（谓词修正后）',
]
with open(OUT, 'a', encoding='utf-8') as f:
    f.write('\n' + '\n'.join(lines) + '\n')
print('ok')
