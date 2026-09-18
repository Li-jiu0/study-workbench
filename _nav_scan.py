# -*- coding: utf-8 -*-
import os, re, io, sys

ROOT = r'D:\下载的文件\学习工作台'
EXCLUDE = {'AI.html', '学习工作台.html', '登录.html'}

files = sorted([f for f in os.listdir(ROOT) if f.endswith('.html') and f not in EXCLUDE])
out = io.StringIO()
out.write('total=%d\n' % len(files))

def nav_block(html):
    # find bottom-nav region: from <nav ... bottom-nav ...> to </nav>
    m = re.search(r'<nav[^>]*bottom-nav[^>]*>', html)
    if not m:
        return None
    start = m.start()
    end = html.find('</nav>', start)
    if end < 0:
        end = len(html)
    return start, end + 6, html[start:end+6]

styleA = []  # <div class="bn-icon" data-icon="X"></div>
styleB = []  # <div class="bn-icon"><span class="nav-icon" ...></span></div>
nonav = []
other = []
for f in files:
    p = os.path.join(ROOT, f)
    s = open(p, encoding='utf-8', errors='replace').read()
    b = nav_block(s)
    if not b:
        nonav.append(f)
        continue
    blk = b[2]
    a = len(re.findall(r'<div\s+class="bn-icon"\s+data-icon="[^"]*"\s*></div>', blk))
    bb = len(re.findall(r'<div\s+class="bn-icon"\s*>\s*<span\s+class="nav-icon"', blk))
    icons = re.findall(r'data-icon="([^"]*)"', blk)
    labels = re.findall(r'bn-label[^>]*>([^<]*)<', blk)
    onclicks = re.findall(r'onclick="([^"]*)"', blk)
    out.write('--- %s | A=%d B=%d | icons=%s | labels=%s\n     onclick=%s\n' % (f, a, bb, icons, labels, onclicks))
    if a and not bb: styleA.append(f)
    elif bb and not a: styleB.append(f)
    elif a and bb: other.append(f)
    else: other.append(f + '(none)')

out.write('\n== styleA(plain data-icon div) %d: %s\n' % (len(styleA), styleA))
out.write('== styleB(span nav-icon) %d: %s\n' % (len(styleB), styleB))
out.write('== mixed/other %d: %s\n' % (len(other), other))
out.write('== no bottom-nav %d: %s\n' % (len(nonav), nonav))

open(r'D:\下载的文件\学习工作台\_navscan.txt','w',encoding='utf-8').write(out.getvalue())
print(out.getvalue())
