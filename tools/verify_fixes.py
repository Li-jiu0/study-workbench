# -*- coding: utf-8 -*-
import zipfile, shutil, os, re

apk = r'D:\下载的文件\学习工作台\学习工作台-安卓App.apk'
tmp = os.path.join(os.environ['TEMP'], 'apkverify13')
os.makedirs(tmp, exist_ok=True)
shutil.copy2(apk, os.path.join(tmp, 'app.apk'))

with zipfile.ZipFile(apk) as z:
    # 1. 三个新页面 goBack 语法
    for page in ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html']:
        c = z.read('assets/' + page).decode('utf-8')
        m = re.search(r'function\s+goBack\s*\([^)]*\)\s*\{[^}]*\}', c)
        print(page, 'goBack:', m.group(0) if m else 'BROKEN')

    # 2. exportData / importData
    app = z.read('assets/assets/app.js').decode('utf-8')
    print()
    print('exportData 用 AndroidBridge.saveFile:', 'AndroidBridge.saveFile' in app)
    print('exportData 导出全部 localStorage:', ('localStorage.length' in app and 'allData' in app))
    print('importData 支持新格式(imported.data):', 'imported.data' in app)
    print('importData 支持旧格式合并(Object.assign):', 'Object.assign' in app)
    print('导出包含 version 字段:', "'version'" in app or '"version"' in app)
    print('导出包含 exportedAt 字段:', 'exportedAt' in app)
