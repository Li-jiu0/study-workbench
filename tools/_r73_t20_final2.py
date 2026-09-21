# -*- coding: utf-8 -*-
"""终验：个人资料.html 内联 JS 清零落盘"""
import io, os, time, re
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t20_final2.txt')
p = os.path.join(ROOT, '个人资料.html')
st = os.stat(p)
h = io.open(p, encoding='utf-8').read()
res = ['个人资料.html mtime=%s size=%d' % (time.strftime('%H:%M:%S', time.localtime(st.st_mtime)), st.st_size),
       'onclick=%d' % h.count('onclick='),
       'inline_script_blocks=%d' % len(re.findall(r'<script>', h)),
       'data-act="back"=%d' % h.count('data-act="back"'),
       'data-act="theme"=%d' % h.count('data-act="theme"')]
b = io.open(p, 'rb').read()
res.append('CRLF=%d bareLF=%d' % (b.count(b'\r\n'), b.count(b'\n') - b.count(b'\r\n')))
res.append(h[:600].replace('\n', '\\n'))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
