# -*- coding: utf-8 -*-
import os, shutil
root = r'D:\下载的文件\学习工作台'
for name in ['更多.html', '工具.html']:
    src = os.path.join(root, name)
    dst = os.path.join(root, name + '.bak-pre-cfix-20260916')
    shutil.copyfile(src, dst)
    print(name, '->', os.path.basename(dst), os.path.getsize(dst))
