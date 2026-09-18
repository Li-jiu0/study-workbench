# -*- coding: utf-8 -*-
# R73b APK 步骤1：versionCode 21/1.20 + 白名单补本批资产
import io, shutil, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 1) AndroidManifest 版本号（二进制替换保行尾）
mp = r"D:\下载的文件\学习工作台\android\AndroidManifest.xml"
shutil.copyfile(mp, mp + ".bak-pre-ver21")
with io.open(mp, 'rb') as f:
    d = f.read()
assert b'android:versionCode="20"' in d and b'android:versionName="1.19"' in d, "manifest 版本锚点不匹配"
d = d.replace(b'android:versionCode="20"', b'android:versionCode="21"')
d = d.replace(b'android:versionName="1.19"', b'android:versionName="1.20"')
with io.open(mp, 'wb') as f:
    f.write(d)
print("manifest -> versionCode=21 versionName=1.20")

# 2) build_apk.py 白名单补 R74-R85 批资产（锚点：R70 AI 三件套注释块后追加）
bp = r"D:\下载的文件\学习工作台\android\build_apk.py"
shutil.copyfile(bp, bp + ".bak-pre-wl85")
with io.open(bp, 'rb') as f:
    d = f.read()
anchor = '    "ai-settings.js",\r\n'
if anchor not in d:
    anchor = '    "ai-settings.js",\n'
assert anchor in d, "白名单锚点未找到"
addition = ('    # --- R74-R85 新增：动态空间/TA资料页/代理支持（缺一即新页面静默失效） ---\n'
            '    "xt-moments.js",\n    "xt-moments.css",\n'
            '    "xt-profile.js",\n    "xt-profile.css",\n'
            '    "xt-settings.js",\n    "net-compat.js",\n')
d2 = d.replace(anchor, anchor + addition, 1)
with io.open(bp, 'wb') as f:
    f.write(d2)
print("whitelist +6 assets (xt-moments/xt-profile/xt-settings/net-compat)")

# 3) 自检：语法 + 锚点
import subprocess
p = subprocess.run([r"C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe",
                    "-m", "py_compile", bp], capture_output=True)
print("py_compile rc=%d" % p.returncode, p.stderr.decode('utf-8','replace')[:300])
with io.open(mp, 'rb') as f:
    print("manifest check:", b'versionCode="21"' in f.read())
