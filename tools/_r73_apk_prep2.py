# -*- coding: utf-8 -*-
# R73b APK 步骤1b：白名单补本批资产（bytes 版）
import io, shutil, subprocess, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

bp = r"D:\下载的文件\学习工作台\android\build_apk.py"
shutil.copyfile(bp, bp + ".bak-pre-wl85")
with io.open(bp, 'rb') as f:
    d = f.read()

anchor = None
for cand in (b'    "ai-settings.js",\r\n', b'    "ai-settings.js",\n'):
    if cand in d:
        anchor = cand
        break
assert anchor, "白名单锚点未找到"
print("anchor EOL:", "CRLF" if b'\r\n' in anchor else "LF")

addition = (b'    # --- R74-R85 \xe6\x96\xb0\xe5\xa2\x9e\xef\xbc\x9a\xe5\x8a\xa8\xe6\x80\x81\xe7\xa9\xba\xe9\x97\xb4/TA\xe8\xb5\x84\xe6\x96\x99\xe9\xa1\xb5/\xe4\xbb\xa3\xe7\x90\x86\xe6\x94\xaf\xe6\x8c\x81\xef\xbc\x88\xe7\xbc\xba\xe4\xb8\x80\xe5\x8d\xb3\xe6\x96\xb0\xe9\xa1\xb5\xe9\x9d\xa2\xe9\x9d\x99\xe9\xbb\x98\xe5\xa4\xb1\xe6\x95\x88\xef\xbc\x89 ---\n'
            b'    "xt-moments.js",\n    "xt-moments.css",\n'
            b'    "xt-profile.js",\n    "xt-profile.css",\n'
            b'    "xt-settings.js",\n    "net-compat.js",\n')
d2 = d.replace(anchor, anchor + addition, 1)
with io.open(bp, 'wb') as f:
    f.write(d2)
print("whitelist +6 assets")

p = subprocess.run([r"C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe",
                    "-m", "py_compile", bp], capture_output=True)
print("py_compile rc=%d" % p.returncode, p.stderr.decode('utf-8','replace')[:300])

with io.open(bp, 'rb') as f:
    d = f.read()
for name in (b'xt-moments.js', b'xt-profile.css', b'net-compat.js'):
    assert name in d, name
print("anchor check OK")
