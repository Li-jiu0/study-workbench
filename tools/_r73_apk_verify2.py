# -*- coding: utf-8 -*-
import zipfile, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
z = zipfile.ZipFile(r'D:\下载的文件\学习工作台\学习工作台-安卓App.apk')
hits = [n for n in z.namelist() if 'xt-moments' in n or 'net-compat' in n or 'xt-profile' in n or 'xt-settings' in n]
print('matches:', hits if hits else '(none in apk)')
# 对照：已确认在包里的同名目录下的文件
sample = [n for n in z.namelist() if n.startswith('assets/assets/')][:15]
print('assets/assets/ sample:', sample)
print('total entries:', len(z.namelist()))
