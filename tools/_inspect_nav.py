# -*- coding: utf-8 -*-
import io, re
ROOT = r'D:\下载的文件\学习工作台'
for name in ['blog_wechat.html', '设置.html']:
    p = os.path.join(ROOT, name) if False else r'D:\下载的文件\学习工作台\\' + name
    s = io.open(p, encoding='utf-8-sig', errors='ignore').read()
    m = re.search(r'<nav class="bottom-nav"[\s\S]*?</nav>', s)
    out = []
    out.append('==== ' + name + ' nav block ====')
    if m:
        out.append(m.group(0))
    else:
        out.append('NO NAV')
    out.append('')
    io.open(r'C:\Users\ATM\_inspect_nav_out.txt', 'a', encoding='utf-8').write('\n'.join(out))
print('written')
