# -*- coding: utf-8 -*-
import zipfile, os, hashlib, shutil
apk = r'D:\下载的文件\学习工作台\学习工作台-安卓App.apk'
tmp = os.path.join(os.environ['TEMP'], 'apkverify9')
os.makedirs(tmp, exist_ok=True)
shutil.copy2(apk, os.path.join(tmp, 'app.apk'))
with open(apk, 'rb') as f:
    print('MD5:', hashlib.md5(f.read()).hexdigest())
with zipfile.ZipFile(apk) as z:
    lg = z.read('assets/登录.html').decode('utf-8', errors='replace')
    print("login redirect 学习工作台.html x:", lg.count("location.href = '学习工作台.html'"))
    print("login redirect 学途.html x:", lg.count("location.href = '学途.html'"))
    # 首页版本
    home = z.read('assets/学习工作台.html').decode('utf-8', errors='replace')
    import re
    m = re.search(r'app\.js\?v=([\w]+)', home)
    print('首页 app.js version:', m.group(1) if m else 'NOT FOUND')
