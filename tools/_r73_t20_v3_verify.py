# -*- coding: utf-8 -*-
"""抽验 任务二十：A1-补/内联清零/safeStore/视觉断点 落盘情况"""
import io, os, time, subprocess, re
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t20_v3_verify.txt')
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
res = []
now = time.time()
for f in ['个人资料.html', r'assets\xt-profile.js', r'assets\xt-profile.css']:
    p = os.path.join(ROOT, f)
    st = os.stat(p)
    res.append('%-22s mtime=%s age_min=%.1f size=%d' % (
        f, time.strftime('%H:%M:%S', time.localtime(st.st_mtime)), (now - st.st_mtime) / 60, st.st_size))
h = io.open(os.path.join(ROOT, '个人资料.html'), encoding='utf-8').read()
res.append('html: onclick=%d inline_script_blocks=%d' % (h.count('onclick='), len(re.findall(r'<script>', h))))
js = io.open(os.path.join(ROOT, 'assets', 'xt-profile.js'), encoding='utf-8').read()
res.append('js: onclick=%d safeStore=%d' % (js.count('onclick='), js.count('safeStore')))
css = io.open(os.path.join(ROOT, 'assets', 'xt-profile.css'), encoding='utf-8').read()
for kw in ['max-width:400px', 'max-width:360px', 'max-width:412', ':empty', 'xtp-modal-crop']:
    res.append('css: %-18s count=%d' % (kw, css.count(kw)))
r = subprocess.run([NODE, '--check', os.path.join(ROOT, 'assets', 'xt-profile.js')], capture_output=True)
res.append('node --check rc=%d' % r.returncode)
b = io.open(os.path.join(ROOT, '个人资料.html'), 'rb').read()
res.append('个人资料.html CRLF=%d bareLF=%d' % (b.count(b'\r\n'), b.count(b'\n') - b.count(b'\r\n')))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
