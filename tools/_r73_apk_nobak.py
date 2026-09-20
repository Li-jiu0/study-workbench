# -*- coding: utf-8 -*-
# R73b APK 步骤2：build_apk.py 排除 .bak 备份文件 + data 目录同样过滤
import io, shutil, subprocess, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
bp = r"D:\下载的文件\学习工作台\android\build_apk.py"
shutil.copyfile(bp, bp + ".bak-pre-nobak")

with io.open(bp, 'rb') as f:
    d = f.read()

# 锚点：assets 复制循环（二进制复制段）
anchor = b'# \xe5\xa4\x8d\xe5\x88\xb6 assets\r\nfor item in os.listdir(os.path.join(ROOT, "assets")):\r\n    src = os.path.join(ROOT, "assets", item)\r\n    dst = os.path.join(STAGE, "assets", item)\r\n'
if anchor not in d:
    anchor = anchor.replace(b'\r\n', b'\n')
assert anchor in d, "assets 复制循环锚点未找到"
patch = anchor + (b'    if ".bak" in item.lower():\r\n'
                  b'        continue  # R73b: \xe5\xa4\x87\xe4\xbb\xbd\xe6\x96\x87\xe4\xbb\xb6\xe4\xb8\x8d\xe5\x85\xa5\xe5\x8c\x85\xef\xbc\x88\xe5\x90\xab\xe5\xaf\x86\xe9\x92\xa5\xe5\xbf\xab\xe7\x85\xa7/\xe5\x87\x8f\xe4\xbd\x93\xe7\xa7\xaf\xef\xbc\x89\r\n')
d = d.replace(anchor, patch, 1)

# data 递归复制：copytree 后再删 .bak（简单稳妥）
anchor2 = b'_data_count = sum(len(files) for _, _, files in os.walk(os.path.join(STAGE, "data")))\r\n'
if anchor2 not in d:
    anchor2 = anchor2.replace(b'\r\n', b'\n')
assert anchor2 in d, "data 计数锚点未找到"
patch2 = (b'for _root, _dirs, _files in os.walk(os.path.join(STAGE, "data")):\r\n'
          b'    for _f in _files:\r\n'
          b'        if ".bak" in _f.lower():\r\n'
          b'            os.remove(os.path.join(_root, _f))\r\n') + anchor2
d = d.replace(anchor2, patch2, 1)

with io.open(bp, 'wb') as f:
    f.write(d)

p = subprocess.run([r"C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe",
                    "-m", "py_compile", bp], capture_output=True)
print("py_compile rc=%d" % p.returncode, p.stderr.decode('utf-8','replace')[:300])
print("patched: assets 跳过 .bak + data 清 .bak")
