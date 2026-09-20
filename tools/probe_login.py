# -*- coding: utf-8 -*-
import io, re
with io.open(r'D:\下载的文件\学习工作台\登录.html', encoding='utf-8') as f:
    h = f.read()
for mm in re.finditer(r"location\.(href|replace)\s*=\s*['\"]([^'\"]+)['\"]", h):
    print('login redirect:', mm.group(0))
for kw in ['function doLogin', 'loginSuccess', '成功']:
    i = h.find(kw)
    if i >= 0:
        print(kw, ':', h[max(0, i - 80):i + 200].replace('\n', ' ')[:280])
