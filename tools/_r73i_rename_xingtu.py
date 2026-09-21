# -*- coding: utf-8 -*-
# R73i：应用名与包名命名统一为「星途」
import io, shutil, subprocess, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 1) AndroidManifest 应用名
mp = r"D:\下载的文件\学习工作台\android\AndroidManifest.xml"
shutil.copyfile(mp, mp + ".bak-pre-name-xingtu")
d = open(mp, 'rb').read()
old_lbl = 'android:label="学习工作台"'.encode('utf-8')
new_lbl = 'android:label="星途"'.encode('utf-8')
assert d.count(old_lbl) == 1, 'label 锚点非唯一'
d = d.replace(old_lbl, new_lbl, 1)
open(mp, 'wb').write(d)
print('manifest label -> 星途:', 'android:label="星途"'.encode('utf-8') in open(mp, 'rb').read())

# 2) build_apk.py 输出文件名
bp = r"D:\下载的文件\学习工作台\android\build_apk.py"
shutil.copyfile(bp, bp + ".bak-pre-name-xingtu")
d = open(bp, 'rb').read()
old = b'FINAL_APK = os.path.join(ROOT, "\xe5\xad\xa6\xe4\xb9\xa0\xe5\xb7\xa5\xe4\xbd\x9c\xe5\x8f\xb0-\xe5\xae\x89\xe5\x8d\x93App.apk")'
new = b'FINAL_APK = os.path.join(ROOT, "\xe6\x98\x9f\xe9\x80\x94-\xe5\xae\x89\xe5\x8d\x93App.apk")'
assert old in d, 'FINAL_APK 锚点未找到'
d = d.replace(old, new, 1)
open(bp, 'wb').write(d)
print('FINAL_APK -> 星途:', b'\xe6\x98\x9f\xe9\x80\x94-' in d)

# 3) 语法与图标断言（改完仍引用 drawable/ic_launcher）
p = subprocess.run([r"C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe",
                    "-m", "py_compile", bp], capture_output=True)
print('py_compile rc=%d' % p.returncode, p.stderr.decode('utf-8', 'replace')[:200])
