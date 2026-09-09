# -*- coding: utf-8 -*-
import zipfile, shutil, os, hashlib, re
apk = r'D:\下载的文件\学习工作台\学习工作台-安卓App.apk'
tmp = os.path.join(os.environ['TEMP'], 'apkverify6')
os.makedirs(tmp, exist_ok=True)
shutil.copy2(apk, os.path.join(tmp, 'app.apk'))
with open(apk, 'rb') as f:
    print('MD5:', hashlib.md5(f.read()).hexdigest())
with zipfile.ZipFile(apk) as z:
    appjs = [n for n in z.namelist() if n.endswith('app.js')][0]
    js = z.read(appjs).decode('utf-8', errors='replace')
    for sym in ['pp-profile', 'pp-account-btn', 'pp-row', 'toggleProfilePanel', '账号管理', '笔记统计', '本机学习数据']:
        print('app.js %-20s: %s' % (sym, js.count(sym)))
    css = [n for n in z.namelist() if n.endswith('common.css')][0]
    csss = z.read(css).decode('utf-8', errors='replace')
    for sym in ['.pp-profile', '.pp-avatar', '.pp-row', '.pp-panel', '.pp-account-btn']:
        print('common.css %-20s: %s' % (sym, csss.count(sym)))
    html = z.read('assets/个人中心.html').decode('utf-8', errors='replace')
    m = re.search(r'app\.js\?v=([\w]+)', html)
    print('个人中心.html version:', m.group(1) if m else 'NOT FOUND')
    print('display:none count:', html.count('display:none'))
