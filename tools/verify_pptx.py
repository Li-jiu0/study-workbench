# -*- coding: utf-8 -*-
import io
with io.open(r'D:\下载的文件\学习工作台\assets\importer.js', encoding='utf-8') as f:
    s = f.read()
checks = [
    ('readPptxText 函数', 'readPptxText' in s),
    ('zipList 函数', 'zipList' in s),
    ('.pptx 扩展名处理', "ext === 'pptx'" in s),
    ('accept 含 .pptx', '.pptx,' in s),
    ('.ppt 老格式提示', '.ppt 老格式' in s),
    ('layouts 目标卡片', "k: 'layouts'" in s),
    ('PPT 提示文字', 'PPT(.pptx)' in s),
]
for name, ok in checks:
    print(('OK ' if ok else 'FAIL ') + name)
