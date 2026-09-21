# -*- coding: utf-8 -*-
import io, glob, re, os
ROOT = r'D:\下载的文件\学习工作台'
RE_V = re.compile(r'\?v=[0-9A-Za-z_\-\.]+')
hits = []
for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
    b = os.path.basename(p)
    if 'bak' in b.lower():
        continue
    s = io.open(p, encoding='utf-8-sig', errors='ignore').read()
    for m in RE_V.finditer(s):
        # 该匹配是否落在 <!-- ... --> 注释内
        start = m.start()
        # 往前找最近的 <!-- 与 -->
        pre = s[:start]
        last_open = pre.rfind('<!--')
        last_close = pre.rfind('-->')
        in_comment = (last_open != -1 and (last_close == -1 or last_open > last_close))
        if in_comment:
            hits.append('%s :: ...%s...' % (b, s[max(0,start-25):start+15].replace('\n',' ')))
io.open(r'C:/Users/ATM/_survey_comment_out.txt', 'w', encoding='utf-8').write('注释内 ?v= 命中数: %d\n%s' % (len(hits), '\n'.join(hits)))
print('written', len(hits))
