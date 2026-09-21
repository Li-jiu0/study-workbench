# -*- coding: utf-8 -*-
import zipfile, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
z = zipfile.ZipFile(r'D:\下载的文件\学习工作台\学习工作台-安卓App.apk')
names = z.namelist()
need = ['assets/assets/xt-moments.js','assets/assets/xt-moments.css','assets/assets/xt-profile.js',
        'assets/assets/xt-profile.css','assets/assets/xt-settings.js','assets/assets/net-compat.js',
        'assets/assets/ai-config.js','assets/assets/ai-service.js','assets/assets/xt-android.js',
        'assets/assets/api.js','assets/动态空间.html','assets/我的动态.html','assets/data/mock-papers.js','classes.dex']
miss = [n for n in need if n not in set(names)]
print('本批+核心资产缺失:', miss if miss else '(无) 全部在包内 OK')
baks = [n for n in names if '.bak' in n.lower()]
print('包内 .bak 残留:', len(baks), ('例: '+', '.join(baks[:3]) if baks else '(0) OK'))
print('总条目数:', len(names), '（上一版 2156）')
