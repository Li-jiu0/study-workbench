# -*- coding: utf-8 -*-
"""
merge_apk.py —— 把 base.apk（aapt2 link 产物，含 manifest+res）+ classes.dex + assets/ 合并成完整 APK。
- assets 站点文件含中文文件名，用 zipfile 写入并自动设置 UTF-8 标志（Android AssetManager 才能正确读取）。
- 用法：python merge_apk.py <base.apk> <classes.dex> <assets_dir> <out.apk>
"""
import sys, os, zipfile

base, dex, stage, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    # 1) 复制 base.apk 全部条目（manifest / resources / classes? 目前无 dex）
    with zipfile.ZipFile(base) as bz:
        for name in bz.namelist():
            if name.endswith('/'):
                continue
            data = bz.read(name)
            # 关键：Android 11+（Targeting R+）要求 resources.arsc 以「未压缩 + 4字节对齐」存储，
            # 否则小米/Android 11+ 报 -124「安装包与系统不兼容」。这里强制 STORED，交给 zipalign -f 4 对齐。
            if name == 'resources.arsc':
                z.writestr(name, data, compress_type=zipfile.ZIP_STORED)
            else:
                z.writestr(name, data)
    # 2) classes.dex
    z.write(dex, 'classes.dex')
    # 3) assets（保留原目录结构，相对 stage 根）
    for root, dirs, files in os.walk(stage):
        for f in sorted(files):
            p = os.path.join(root, f)
            arc = 'assets/' + os.path.relpath(p, stage).replace('\\', '/')
            z.write(p, arc)

print('merged:', out)
