# -*- coding: utf-8 -*-
import io, glob, re, os
ROOT = r'D:\下载的文件\学习工作台'
RE_BARE = re.compile(r'(?<![\w-])(?:src|href)=["\'](assets/[^"\'\?]+)["\']')
out = []
total_bare = 0
files_bare = 0
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    b = os.path.basename(p)
    if 'bak' in b.lower():
        continue
    s = io.open(p, encoding='utf-8-sig', errors='ignore').read()
    nb = len(RE_BARE.findall(s))
    if nb:
        files_bare += 1
        total_bare += nb
        out.append('%s: %d 处裸引用' % (b, nb))
out.insert(0, '=== 修完后仍裸的 assets 引用: %d 处 / %d 文件 ===' % (total_bare, files_bare))
# 注释/div 平衡复核
bad = []
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    b = os.path.basename(p)
    if 'bak' in b.lower(): continue
    s = io.open(p, encoding='utf-8-sig', errors='ignore').read()
    if s.count('<!--') != s.count('-->'):
        bad.append('%s 注释 %d/%d' % (b, s.count('<!--'), s.count('-->')))
    if len(re.findall(r'<div[\s>]', s)) != s.count('</div>'):
        bad.append('%s div 不平衡' % b)
if bad:
    out.append('!! 平衡异常: ' + ' | '.join(bad))
else:
    out.append('注释/div 平衡: 全部 OK')
io.open(r'C:/Users/ATM/_verify_stamp_out.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('written')
