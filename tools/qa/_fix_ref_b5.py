# -*- coding: utf-8 -*-
"""修复批次五 worktree 的 ref「假成功」：把分支 ref 直接写盘。"""
import io
import os

d = r'D:\下载的文件\学习工作台\.git\refs\heads\workbuddy'
os.makedirs(d, exist_ok=True)
p = os.path.join(d, 'main-8d0a1649')
io.open(p, 'w', encoding='ascii').write('edc0f8a1fd4c308856d902411aad49752f0c306f\n')
print('written:', p)
print('exists:', os.path.exists(p))
