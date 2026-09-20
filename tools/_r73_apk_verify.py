# -*- coding: utf-8 -*-
import zipfile, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
z = zipfile.ZipFile(r'D:\下载的文件\学习工作台\学习工作台-安卓App.apk')
need = ['assets/xt-moments.js','assets/xt-moments.css','assets/xt-profile.js','assets/xt-profile.css',
        'assets/xt-settings.js','assets/net-compat.js','assets/assets/ai-config.js',
        'assets/assets/ai-service.js','assets/assets/xt-android.js','assets/assets/api.js',
        'assets/动态空间.html','assets/我的动态.html','assets/data/mock-papers.js','classes.dex']
miss = [n for n in need if n not in set(z.namelist())]
print('missing:', miss if miss else '(none) OK')
html = z.read('assets/动态空间.html').decode('utf-8','replace')
print('包内动态空间.html 引用 20260917b 戳:', 'xt-moments.js?v=20260917b' in html)
cfg = z.read('assets/assets/ai-config.js').decode('utf-8','replace')
print('包内含火山模型 ark-turbo-260628:', 'ark-turbo-260628' in cfg)
svc = z.read('assets/assets/ai-service.js').decode('utf-8','replace')
print('包内含代理模块 proxyWrapUrl:', 'proxyWrapUrl' in svc)
m = re.search(r'apiKey:\s*"AQ\.[A-Za-z0-9_\-]{20,}', cfg)
print('包内真实 Key 在位不脱敏:', bool(m))
