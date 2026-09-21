# -*- coding: utf-8 -*-
import io
p = r'D:\下载的文件\学习工作台\登录.html'
with io.open(p, encoding='utf-8') as f:
    src = f.read()
old = "location.href = '学习工作台.html'"
new = "location.href = '学途.html'"
n = src.count(old)
assert n >= 1, 'login redirect not found'
src = src.replace(old, new)
with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: login redirect -> 学途.html (x%d)' % n)
