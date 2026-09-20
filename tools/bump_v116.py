# -*- coding: utf-8 -*-
import io
p = r'D:\下载的文件\学习工作台\android\AndroidManifest.xml'
with io.open(p, encoding='utf-8') as f:
    s = f.read()
s = s.replace('android:versionCode="15"', 'android:versionCode="17"')
s = s.replace('android:versionName="1.14"', 'android:versionName="1.16"')
with io.open(p, 'w', encoding='utf-8') as f:
    f.write(s)
print('OK: versionCode 17 / versionName 1.16')
