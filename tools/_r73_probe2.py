# -*- coding: utf-8 -*-
import io
OUT = r'D:\下载的文件\学习工作台\tools\_r73_probe2.txt'
src = io.open(r'D:\下载的文件\学习工作台\assets\app.js', encoding='utf-8').read()
res = []
p = 0
while True:
    p = src.find('朋友圈', p)
    if p < 0:
        break
    res.append('POS %d ...%s...' % (p, src[max(0, p-120):p+120].replace('\n', '\\n')))
    p += 3
# 顺便看 PAGES 映射的回退逻辑：找 "data-page" 点击处理
import re
for m in re.finditer(r"data-page", src):
    pass
# 找导航映射定义
for kw in ["home:'", "home: '"]:
    q = src.find(kw)
    if q >= 0:
        res.append('MAP@%d ...%s...' % (q, src[max(0, q-200):q+600].replace('\n', '\\n')))
        break
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
