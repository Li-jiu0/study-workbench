# -*- coding: utf-8 -*-
"""R73o：APK versionCode 23/1.22 提交"""
import subprocess, io
ROOT = r'D:\下载的文件\学习工作台'
G = ['git', '-C', ROOT, '-c', 'core.quotepath=false']
out = []
for args in [['add', 'android/AndroidManifest.xml'],
             ['commit', '-m', 'chore(APK): versionCode 23/1.22 —— 同步 R73n 检测超时修复与 R73k/m 402 修复'],
             ['log', '--oneline', '-1']]:
    r = subprocess.run(G + args, capture_output=True, timeout=60)
    out.append('$ git %s rc=%d\n%s\n%s' % (' '.join(args), r.returncode,
                                           r.stdout.decode('utf-8', 'ignore').strip(),
                                           r.stderr.decode('utf-8', 'ignore').strip()))
io.open(r'C:\Users\ATM\_r73o_commit.txt', 'w', encoding='utf-8').write('\n'.join(out))
print(out[-1][:200])
