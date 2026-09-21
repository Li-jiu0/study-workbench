# -*- coding: utf-8 -*-
import subprocess, io
ROOT = r'D:\下载的文件\学习工作台'
def git(args):
    p = subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=false'] + args, capture_output=True)
    b = p.stdout
    try: return b.decode('utf-8')
    except Exception: return b.decode('gbk', errors='replace')

out = []
for f in ['assets/api.js', 'assets/app.js', '更多.html', '私聊.html', '学习工作台.html', 'AI模拟面试.html', 'PPT素材库.html']:
    out.append('########## %s ##########' % f)
    out.append(git(['diff', '-U2', 'HEAD', '--', f]))
    out.append('')
io.open(r'D:\下载的文件\学习工作台\tools\qa\_diff_shared.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('ok')
