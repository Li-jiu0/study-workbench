# -*- coding: utf-8 -*-
"""git 状态落盘"""
import subprocess, io
G = ['git', '-C', r'D:\下载的文件\学习工作台', '-c', 'core.quotepath=false']
out = []
for args in [['status', '--porcelain'], ['log', '--oneline', '-6'],
             ['check-ignore', 'server/.env', '星途-安卓App.apk', 'AI402问题根因分析与服务器配置清单.md']]:
    r = subprocess.run(G + args, capture_output=True)
    out.append('$ git %s (rc=%d)' % (' '.join(args), r.returncode))
    out.append(r.stdout.decode('utf-8', 'ignore'))
    e = r.stderr.decode('utf-8', 'ignore').strip()
    if e:
        out.append('[err] ' + e)
    out.append('')
io.open(r'C:\Users\ATM\_r73m_git_status.txt', 'w', encoding='utf-8').write('\n'.join(out))
