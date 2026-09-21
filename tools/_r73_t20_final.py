# -*- coding: utf-8 -*-
"""终验：内联 onclick 清零 + safeStore + 行尾/语法"""
import io, os, re, time, subprocess
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t20_final.txt')
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
res = []
for f in ['个人资料.html', r'assets\xt-profile.js', r'assets\xt-profile.css']:
    p = os.path.join(ROOT, f)
    b = io.open(p, 'rb').read()
    res.append('%-22s mtime=%s size=%d CRLF=%d bareLF=%d' % (
        f, time.strftime('%H:%M:%S', time.localtime(os.path.getmtime(p))), len(b),
        b.count(b'\r\n'), b.count(b'\n') - b.count(b'\r\n')))
h = io.open(os.path.join(ROOT, '个人资料.html'), encoding='utf-8').read()
res.append('html 内联 onclick=%d  内联<script>块=%d' % (h.count('onclick='), len(re.findall(r'<script>(?!</script>)', h))))
js = io.open(os.path.join(ROOT, 'assets', 'xt-profile.js'), encoding='utf-8').read()
res.append('js 渲染串内联 onclick=%d' % js.count('onclick='))
res.append('safeStore 出现=%d' % js.count('safeStore'))
res.append('xtpViews:empty 规则: %s' % ('yes' if ':empty' in io.open(os.path.join(ROOT, 'assets', 'xt-profile.css'), encoding='utf-8').read() else 'NO'))
r = subprocess.run([NODE, '--check', os.path.join(ROOT, 'assets', 'xt-profile.js')], capture_output=True)
res.append('node --check rc=%d %s' % (r.returncode, (r.stderr or b'').decode('utf-8', 'replace')[:200]))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
