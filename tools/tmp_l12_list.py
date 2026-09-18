# -*- coding: utf-8 -*-
import os, io

root = 'D:/下载的文件/学习工作台'
out = []
for dirpath, dirnames, filenames in os.walk(root):
    # skip hidden
    dirnames[:] = [d for d in dirnames if not d.startswith('.')]
    rel = os.path.relpath(dirpath, root).replace('\\', '/')
    for f in filenames:
        out.append(rel + '/' + f if rel != '.' else f)

out.sort()
with io.open('D:/下载的文件/学习工作台/tools/tmp_l12_list.txt', 'w', encoding='utf-8') as fp:
    fp.write(u'\n'.join(out))
print('OK', len(out))
