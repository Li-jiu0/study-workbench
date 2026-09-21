# -*- coding: utf-8 -*-
"""确认本任务是否改动了独占文件（应仅新增 md）"""
import os, datetime

ROOT = r'D:\下载的文件\学习工作台'
out = []
out.append('== 本任务相关文件 mtime（仅用于判断「哪些文件被动过」）==')
pairs = [
    ('AI模拟面试.html', 'D:/下载的文件/学习工作台/AI模拟面试.html'),
    ('AI模拟面试.html.bak-pre-l7-20260916', 'D:/下载的文件/学习工作台/AI模拟面试.html.bak-pre-l7-20260916'),
    ('assets/iv-prep.js', 'D:/下载的文件/学习工作台/assets/iv-prep.js'),
    ('assets/iv-prep.js.bak-pre-l7-20260916', 'D:/下载的文件/学习工作台/assets/iv-prep.js.bak-pre-l7-20260916'),
    ('交互文档-N9-19-...md (本次新增)', 'D:/下载的文件/学习工作台/交互文档-N9-19-模拟面试六阶段状态机-20260916.md'),
]
for tag, p in pairs:
    try:
        st = os.stat(p)
        out.append('  %-44s %8d B  %s' % (tag, st.st_size, datetime.datetime.fromtimestamp(st.st_mtime).strftime('%Y-%m-%d %H:%M:%S')))
    except Exception as e:
        out.append('  %-44s ERR %s' % (tag, e))

out.append('')
out.append('== 备份文件是否存在 a4 备份（本任务未做任何修改，应无）==')
for p in ['AI模拟面试.html.bak-pre-a4-20260916', 'assets/iv-prep.js.bak-pre-a4-20260916']:
    fp = os.path.join(ROOT, p)
    out.append('  %-44s %s' % (p, 'EXISTS' if os.path.exists(fp) else 'not exists（符合预期：本次 0 改动）'))

open(os.path.join(ROOT, 'tools', 'qa', '_a4_mtime_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('OK')
