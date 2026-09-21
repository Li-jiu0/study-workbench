# -*- coding: utf-8 -*-
"""L1 自检：检查所有含 #aiPanel 的线上页面是否具备 .ai-panel-header 与输入行，
否则 ensureAiPartnerUI / ensureAiQuickBar 会提前 return，卡片头部与快捷条不会注入。
结果写入 UTF-8 文件。
"""
import os
import re

ROOT = r'D:\下载的文件\学习工作台'
EXCLUDE_DIRS = {'备份', 'tools', 'node_modules', '.git', 'ai-server'}

out = []
bad = 0
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
    for fn in filenames:
        if not fn.endswith('.html'):
            continue
        if '.bak' in fn or '.backup' in fn:
            continue
        p = os.path.join(dirpath, fn)
        with open(p, 'r', encoding='utf-8', errors='ignore') as f:
            src = f.read()
        if 'id="aiPanel"' not in src:
            continue
        has_header = 'ai-panel-header' in src
        has_input = ('ai-input-row' in src) or ('ai-input-area' in src)
        has_msgs = 'id="aiMessages"' in src
        flag = 'OK '
        if not (has_header and has_input and has_msgs):
            flag = 'BAD'
            bad += 1
        out.append('%s %-24s header=%d input=%d msgs=%d' % (
            flag, fn, 1 if has_header else 0, 1 if has_input else 0, 1 if has_msgs else 0))

out.append('')
out.append('BAD_COUNT=%d' % bad)
with open(os.path.join(ROOT, 'tools', 'qa', '_l1_panelcheck.out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
