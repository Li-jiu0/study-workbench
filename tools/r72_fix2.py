# -*- coding: utf-8 -*-
# 修正 演示.html 注释中出现的 "data-ppt-" 字面（避免静态自测误判为引用）
import io, os
p = os.path.join(r'D:\下载的文件\学习工作台', '演示.html')
raw = open(p, 'rb').read()
bom = raw.startswith(b'\xef\xbb\xbf')
t = io.open(p, 'r', encoding='utf-8-sig', newline='').read().replace('\r\n', '\n').replace('\r', '\n')
old = '也不再引用演示专用 JS（ppt-works / ppt-tips / tpl-preview / design-class / mini-ppt / data-ppt-* / xt-content / mini）。 */'
new = '也不再引用演示专用 JS（ppt-works / ppt-tips / tpl-preview / design-class / mini-ppt / data-ppt 系列 / xt-content / mini）。 */'
assert t.count(old) == 1, t.count(old)
t = t.replace(old, new)
out = t.replace('\n', '\r\n').encode('utf-8')
if bom:
    out = b'\xef\xbb\xbf' + out
open(p, 'wb').write(out)
print('演示.html fixed; data-ppt- count=%d loneLF=%d' % (out.decode('utf-8').count('data-ppt-'), out.count(b'\n') - out.count(b'\r\n')))
