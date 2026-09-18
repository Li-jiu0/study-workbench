# -*- coding: utf-8 -*-
"""派 任务二十一（其他用户资料页微信化）前的锚点核实：
1) 个人中心.html ?user= 的渲染入口（viewUid / renderUserHome 调用点、容器、样式）
2) chat-local.js imShowUserProfile 现状（是否已微信风格，避免重复做）
"""
import io, os, re
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_userhome_recon.txt')
res = []

# 1) 个人中心.html
s = io.open(os.path.join(ROOT, '个人中心.html'), encoding='utf-8').read()
res.append('=== 个人中心.html (%d B) ===' % len(s))
for kw in ['viewUid', 'renderUserHome', 'user=', 'userhome', 'userHome', 'TA 的主页']:
    p = 0
    cnt = 0
    while True:
        p = s.find(kw, p)
        if p < 0:
            break
        res.append('[%s]@%d ...%s...' % (kw, p, s[max(0, p-100):p+100].replace('\n', '\\n')))
        p += len(kw)
        cnt += 1
        if cnt > 6:
            break

# 2) api.js renderUserHome 调用点
a = io.open(os.path.join(ROOT, 'assets', 'api.js'), encoding='utf-8').read()
res.append('=== api.js (%d B) ===' % len(a))
for kw in ['renderUserHome', 'renderUserHome(']:
    p = 0
    cnt = 0
    while True:
        p = a.find(kw, p)
        if p < 0:
            break
        res.append('[%s]@%d ...%s...' % (kw, p, a[max(0, p-90):p+90].replace('\n', '\\n')))
        p += len(kw)
        cnt += 1
        if cnt > 8:
            break

# 3) chat-local.js imShowUserProfile 概况
c = io.open(os.path.join(ROOT, 'assets', 'chat-local.js'), encoding='utf-8').read()
res.append('=== chat-local.js (%d B) ===' % len(c))
q = c.find('imShowUserProfile')
res.append('imShowUserProfile 首现=%d' % q)
if q >= 0:
    res.append(c[q:q+900].replace('\n', '\\n'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
