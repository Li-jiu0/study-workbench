# -*- coding: utf-8 -*-
# R73h：APK versionCode 22 / 1.21
import io, shutil, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
mp = r"D:\下载的文件\学习工作台\android\AndroidManifest.xml"
shutil.copyfile(mp, mp + ".bak-pre-ver22")
with io.open(mp, 'rb') as f:
    d = f.read()
assert b'android:versionCode="21"' in d and b'android:versionName="1.20"' in d
d = d.replace(b'android:versionCode="21"', b'android:versionCode="22"')
d = d.replace(b'android:versionName="1.20"', b'android:versionName="1.21"')
with io.open(mp, 'wb') as f:
    f.write(d)
raw = open(mp, 'rb').read()
print('OK versionCode=22 versionName=1.21:', b'versionCode="22"' in raw and b'versionName="1.21"' in raw)
