# -*- coding: utf-8 -*-
"""终验 任务八 批次：viewport/全启全停/断点/xt-set-used/flex/row-right"""
import io, os, time, re
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t8_final.txt')
now = time.time()
for f in ['ai-settings.html', r'assets\ai-settings.js']:
    p = os.path.join(ROOT, f)
    st = os.stat(p)
    res_f = '%s mtime=%s age_min=%.1f size=%d' % (f, time.strftime('%H:%M:%S', time.localtime(st.st_mtime)), (now - st.st_mtime) / 60, st.st_size)
    OUT_app = None
    globals().setdefault('res', []).append(res_f)
res = globals()['res']
h = io.open(os.path.join(ROOT, 'ai-settings.html'), encoding='utf-8').read()
j = io.open(os.path.join(ROOT, 'assets', 'ai-settings.js'), encoding='utf-8').read()
res.append('viewport maximum-scale=%d user-scalable=%d' % (h.count('maximum-scale'), h.count('user-scalable')))
res.append('全启=%d 全停=%d 全部启用=%d 全部停用=%d' % (h.count('全启'), h.count('全停'), h.count('全部启用'), h.count('全部停用')))
for kw in ['max-width: 400px', 'max-width: 360px', 'flex: 1 1 0', 'justify-content: flex-end', '.xt-set-row .xt-set-used', 'max-width: 640px']:
    res.append('%-28s count=%d' % (kw, h.count(kw)))
res.append('js: 当前使用=%d title=当前使用=%d' % (j.count('当前使用'), j.count('title="当前使用"')))
res.append('html: 当前使用 字样=%d' % h.count('当前使用'))
m = re.search(r'\.xt-set-row-main\{[^}]*\}', h)
res.append('row-main 规则: %s' % (m.group(0) if m else 'MISSING'))
b = io.open(os.path.join(ROOT, 'ai-settings.html'), 'rb').read()
res.append('html CR=%d LF_only=%d' % (b.count(b'\r'), b.count(b'\n') - b.count(b'\r\n')))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
