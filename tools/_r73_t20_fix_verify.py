# -*- coding: utf-8 -*-
"""抽验 任务二十 的「全页不可点」修复落盘"""
import io, os, re, time, subprocess
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t20_fix_verify.txt')
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
res = []
for f in ['个人资料.html', r'assets\xt-profile.js', r'assets\xt-profile.css']:
    p = os.path.join(ROOT, f)
    res.append('%-24s mtime=%s size=%d' % (f, time.strftime('%H:%M:%S', time.localtime(os.path.getmtime(p))), os.path.getsize(p)))
css = io.open(os.path.join(ROOT, 'assets', 'xt-profile.css'), encoding='utf-8').read()
js = io.open(os.path.join(ROOT, 'assets', 'xt-profile.js'), encoding='utf-8').read()
res.append('--- CSS 宿主层规则 ---')
for sel in ['#xtpViews', '#xtpModalHost', '#xtpToast', 'pointer-events']:
    for m in re.finditer(re.escape(sel), css):
        seg = css[max(0, m.start()-80):m.start()+200].replace('\n', '\\n')
        res.append('[%s]@%d ...%s...' % (sel, m.start(), seg))
res.append('--- JS 关键点 ---')
for kw in ['pointer-events', 'visibility', 'display:none', 'closeModal', 'xtp-modal-on']:
    res.append('%-16s count=%d' % (kw, js.count(kw)))
r = subprocess.run([NODE, '--check', os.path.join(ROOT, 'assets', 'xt-profile.js')], capture_output=True)
res.append('node --check rc=%d %s' % (r.returncode, (r.stderr or b'').decode('utf-8', 'replace')[:200]))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
