# -*- coding: utf-8 -*-
"""复核 任务八 的 ai-settings.html viewport 修改与行尾"""
import io, os
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t8_verify.txt')
res = []
p = os.path.join(ROOT, 'ai-settings.html')
b = io.open(p, 'rb').read()
res.append('ai-settings.html: CRLF=%d bare_LF=%d BOM=%s size=%d' % (
    b.count(b'\r\n'), b.count(b'\n') - b.count(b'\r\n'), b[:3] == b'\xef\xbb\xbf', len(b)))
s = io.open(p, encoding='utf-8').read()
for ln in s.splitlines()[:12]:
    if 'viewport' in ln or 'maximum-scale' in ln or 'user-scalable' in ln:
        res.append('HEAD: ' + ln.strip())
res.append('viewport 行数=%d' % s.count('name="viewport"'))
res.append('user-scalable 出现=%d' % s.count('user-scalable'))
res.append('maximum-scale 出现=%d' % s.count('maximum-scale'))
# 对比其他页面的 viewport 口径（任务八说与个人资料.html 一致）
p2 = os.path.join(ROOT, '个人资料.html')
s2 = io.open(p2, encoding='utf-8').read()
for ln in s2.splitlines():
    if 'viewport' in ln:
        res.append('个人资料.html: ' + ln.strip())
        break
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
