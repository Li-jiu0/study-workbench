# -*- coding: utf-8 -*-
import zipfile, os, hashlib, shutil
apk = r'D:\下载的文件\学习工作台\学习工作台-安卓App.apk'
tmp = os.path.join(os.environ['TEMP'], 'apkverify8')
os.makedirs(tmp, exist_ok=True)
shutil.copy2(apk, os.path.join(tmp, 'app.apk'))
with open(apk, 'rb') as f:
    print('MD5:', hashlib.md5(f.read()).hexdigest())
with zipfile.ZipFile(apk) as z:
    names = z.namelist()
    print('学途.html:', 'assets/学途.html' in names)
    print('20 pages:', sum(1 for n in names if n.endswith('.html') and n.startswith('assets/')))
    lg = z.read('assets/登录.html').decode('utf-8', errors='replace')
    print("login redirect 学途.html x:", lg.count("location.href = '学途.html'"))
    xt = z.read('assets/学途.html').decode('utf-8', errors='replace')
    print('学途 version tag:', 'app.js?v=20260913t' in xt)
    js = z.read('assets/assets/app.js').decode('utf-8', errors='replace')
    print('app.js v tag check: n/a (js has no tag)')
    print('goStudy in app.js:', js.count('function goStudy'))
    vp = z.read('assets/assets/voiceplayer.js').decode('utf-8', errors='replace')
    print('voiceplayer openVoiceTrain:', vp.count('function openVoiceTrain'))
