# -*- coding: utf-8 -*-
"""地面真相：在真实目录 D:\下载的文件\学习工作台 逐项核查 任务八 声称的活1-4 是否在位"""
import io, os, subprocess
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', '_r73_groundtruth.txt')
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
res = []

def rd(p):
    return io.open(os.path.join(ROOT, p), encoding='utf-8', errors='replace').read()

def le(p):
    b = io.open(os.path.join(ROOT, p), 'rb').read()
    return 'CRLF=%d bareLF=%d size=%d' % (b.count(b'\r\n'), b.count(b'\n') - b.count(b'\r\n'), len(b))

res.append('=== 1) common.css 活1 六处根治 ===')
c = rd('assets/common.css')
res.append('文件: ' + le('assets/common.css'))
for kw in ['bn-label', 'ai-mode-badge', 'study-stats-bar b', 'nc-actions', 'overflow-wrap:anywhere', 'morepage-card']:
    res.append('  %-22s count=%d' % (kw, c.count(kw)))
# 定位 768/480 媒体块内这几条规则
import re
for m in re.finditer(r'@media\s*\(max-width:\s*(768|480)px\)', c):
    seg = c[m.start():m.start()+700]
    if 'bn-label' in seg or 'morepage-card' in seg or 'nc-actions' in seg:
        res.append('  HIT @media(%spx) @offset %d:' % (m.group(1), m.start()))
        res.append('    ' + seg.replace('\n', '\\n')[:640])
res.append('  bak 文件: %s' % [f for f in os.listdir(os.path.join(ROOT, 'assets')) if 'common.css.bak' in f])

res.append('=== 2) 学途.html 活2 文案修正 ===')
x = rd('学途.html')
res.append('文件: ' + le('学途.html'))
for kw in ['道待复习', '道错题', 'getReviewQuestions']:
    res.append('  %-22s count=%d' % (kw, x.count(kw)))
for m in re.finditer(r'道(错题|待复习)', x):
    res.append('  @%d ...%s...' % (m.start(), x[max(0, m.start()-160):m.start()+120].replace('\n', '\\n')))

res.append('=== 3) ai-settings.html viewport + 移动端 row-right ===')
a = rd('ai-settings.html')
res.append('文件: ' + le('ai-settings.html'))
for ln in a.splitlines():
    if 'viewport' in ln:
        res.append('  ' + ln.strip())
q = a.find('.xt-set-row-right{flex-shrink:1;flex-basis:100%')
res.append('  移动端 flex-start 规则存在: %s @%d' % (q >= 0, q))
q2 = a.find('@media (max-width:640px)')
res.append('  @media640 @%d' % q2)
res.append('  user-scalable count=%d maximum-scale count=%d' % (a.count('user-scalable'), a.count('maximum-scale')))

res.append('=== 4) voiceplayer.js 320 溢出相关 ===')
vp = os.path.join(ROOT, 'assets', 'voiceplayer.js')
if os.path.exists(vp):
    v = rd('assets/voiceplayer.js')
    res.append('文件: ' + le('assets/voiceplayer.js'))
    for kw in ['flex-wrap:nowrap', '.vp-ctl', '.vp-nav', '.vp-play', 'max-width:380px']:
        res.append('  %-22s count=%d' % (kw, v.count(kw)))
else:
    res.append('  voiceplayer.js 不存在（可能路径不同）')
res.append('  assets 下 vp/voice 相关文件: %s' % [f for f in os.listdir(os.path.join(ROOT, 'assets')) if 'voice' in f.lower()])

res.append('=== 5) 真实目录最近改动文件（按 mtime 降序前 20）===')
allf = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    if any(s in dirpath for s in ['备份', '.git', 'tools', 'node_modules', '.tmp_eng', 'android\\build']):
        continue
    for fn in filenames:
        if fn.lower().endswith(('.html', '.js', '.css', '.py', '.md', '.json')):
            p = os.path.join(dirpath, fn)
            try:
                allf.append((os.path.getmtime(p), os.path.relpath(p, ROOT)))
            except Exception:
                pass
allf.sort(reverse=True)
import time
for t, p in allf[:20]:
    res.append('  %s  %s' % (time.strftime('%m-%d %H:%M:%S', time.localtime(t)), p))

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(res))
