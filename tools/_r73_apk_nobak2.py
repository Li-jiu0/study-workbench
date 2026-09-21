# -*- coding: utf-8 -*-
# R73b APK 步骤3：所有 copytree 增加 ignore *.bak*
import io, shutil, subprocess, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
bp = r"D:\下载的文件\学习工作台\android\build_apk.py"
shutil.copyfile(bp, bp + ".bak-pre-nobak2")
with io.open(bp, 'rb') as f:
    d = f.read()

n = d.count(b'shutil.copytree(')
# 三处 copytree：assets 子目录、data、res —— 统一加 ignore
old_variants = [
    (b'shutil.copytree(src, dst, dirs_exist_ok=True)', b'shutil.copytree(src, dst, dirs_exist_ok=True, ignore=shutil.ignore_patterns("*.bak*"))'),
    (b'shutil.copytree(_data_dir, os.path.join(STAGE, "data"), dirs_exist_ok=True)', b'shutil.copytree(_data_dir, os.path.join(STAGE, "data"), dirs_exist_ok=True, ignore=shutil.ignore_patterns("*.bak*"))'),
    (b'shutil.copytree(os.path.join(ROOT, "android", "res"), RES, dirs_exist_ok=True)', b'shutil.copytree(os.path.join(ROOT, "android", "res"), RES, dirs_exist_ok=True, ignore=shutil.ignore_patterns("*.bak*"))'),
]
cnt = 0
for old, new in old_variants:
    if old in d:
        d = d.replace(old, new, 1)
        cnt += 1
print('copytree total=%d, patched=%d' % (n, cnt))
assert cnt == 3, "未全部命中"
with io.open(bp, 'wb') as f:
    f.write(d)
p = subprocess.run([r"C:\Users\ATM\.workbuddy\binaries\python\versions\3.13.12\python.exe",
                    "-m", "py_compile", bp], capture_output=True)
print("py_compile rc=%d" % p.returncode, p.stderr.decode('utf-8','replace')[:300])
