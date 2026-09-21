# -*- coding: utf-8 -*-
"""R72 工程师任务一：改前备份（二进制复制，保留行尾）。"""
import os
import shutil

ROOT = r"D:\下载的文件\学习工作台"
TARGETS = [
    r"assets\chat-local.js",
    r"assets\api.js",
    r"server\database.py",
    r"server\schemas.py",
    r"server\routers\chat.py",
    r"server\routers\friends.py",
    r"server\routers\groups.py",
    r"server\建表SQL.sql",
]

for rel in TARGETS:
    src = os.path.join(ROOT, rel)
    dst = os.path.join(ROOT, rel + ".bak-pre-r72-20260917")
    if not os.path.exists(dst):
        shutil.copyfile(src, dst)
    print("backup ok:", rel, os.path.getsize(dst))
