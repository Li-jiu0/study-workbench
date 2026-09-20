# -*- coding: utf-8 -*-
import io, re

p = r'D:\下载的文件\学习工作台\assets\icon-map.js'
s = io.open(p, encoding='utf-8', errors='replace').read()
# icon keys look like:  "name": svg(
names = re.findall(r'"([A-Za-z0-9\-]+)"\s*:\s*svg\(', s)
names = sorted(set(names))
out = io.open(r'D:\下载的文件\学习工作台\tools\_l13_icons.txt', 'w', encoding='utf-8')
out.write('COUNT=' + str(len(names)) + '\n')
out.write('\n'.join(names))
out.close()
