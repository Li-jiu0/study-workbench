# -*- coding: utf-8 -*-
"""主理人独立复核 任务二十 事1-5 落盘结果（只读）"""
import io, os, re, subprocess
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_t20_verify.txt')
PY = r'C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe'
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
res = []

def line_end(p):
    b = io.open(p, 'rb').read()
    crlf = b.count(b'\r\n'); lf = b.count(b'\n')
    return 'CRLF=%d bare_LF=%d BOM=%s size=%d' % (crlf, lf - crlf, b[:3] == b'\xef\xbb\xbf', len(b))

for f in ['个人资料.html', r'assets\xt-profile.js', r'assets\xt-profile.css']:
    p = os.path.join(ROOT, f)
    res.append('%-28s %s' % (f, line_end(p)))

# node --check
for f in [r'assets\xt-profile.js']:
    r = subprocess.run([NODE, '--check', os.path.join(ROOT, f)], capture_output=True)
    res.append('node --check %s rc=%d %s' % (f, r.returncode, (r.stderr or b'').decode('utf-8', 'replace')[:300]))

s = io.open(os.path.join(ROOT, 'assets', 'xt-profile.js'), encoding='utf-8').read()
res.append('--- 删除项核查（应为 0 次「入口」形态） ---')
for kw in ["title: '错题本'", "title: '导入题库'", "title: '成就徽章'", "wrongBadge", "dueReviewCount", "todayStr", "badgesBody", "xtpShowBadge"]:
    res.append('%-24s count=%d' % (kw, s.count(kw)))
res.append('--- 改名核查 ---')
for kw in ["'我的动态'", '我的动态.html', "'我的朋友圈'", '备考目标', "'目标'"]:
    res.append('%-24s count=%d' % (kw, s.count(kw)))
res.append('--- 滚动豁免 ---')
q = s.find('overflow:visible')
res.append('js 内含 overflow:visible: %d' % s.count('overflow:visible'))
css = io.open(os.path.join(ROOT, 'assets', 'xt-profile.css'), encoding='utf-8').read()
res.append('css html,body 覆盖: %s' % ('yes' if re.search(r'html\s*,\s*body\s*\{[^}]*min-height', css) else 'NO'))
res.append('css 含 !important 数=%d' % css.count('!important'))
q2 = css.find('xtp-modal-crop')
res.append('css .xtp-modal-crop @%d ...%s...' % (q2, css[max(0,q2-60):q2+120].replace('\n','\\n') if q2>=0 else 'MISSING'))
res.append('css crop-stage 宽度锚点: %s' % re.findall(r'\.xtp-crop-stage\s*\{[^}]*width:\s*([^;]+);', css))
res.append('css crop-ring 宽度锚点: %s' % re.findall(r'\.xtp-crop-ring\s*\{[^}]*width:\s*([^;]+);', css))
res.append('--- 裁剪参数核查（js）---')
for kw in ['min="100" max="500"', 'MAX=5', 'ZMAX', 'devicePixelRatio', "toDataURL('image/jpeg'", 'image/jpeg', 'zoomAt', 'pointers', 'dblclick', 'wheel']:
    res.append('%-28s count=%d' % (kw, s.count(kw)))
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
