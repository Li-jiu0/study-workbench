# -*- coding: utf-8 -*-
"""把前端 API 地址从 localhost:8000 改成服务器公网 IP"""
import io

SERVER_IP = "110.42.134.62"
OLD = "http://localhost:8000"
NEW = f"http://{SERVER_IP}:8000"

FILES = [
    r"D:\下载的文件\学习工作台\assets\api.js",
    r"D:\下载的文件\学习工作台\assets\chat.js",
    r"D:\下载的文件\学习工作台\登录.html",
]

for f in FILES:
    with io.open(f, encoding='utf-8') as fh:
        src = fh.read()
    count = src.count(OLD)
    if count > 0:
        src = src.replace(OLD, NEW)
        with io.open(f, 'w', encoding='utf-8') as fh:
            fh.write(src)
        print(f"FIXED {f}: 替换 {count} 处")
    else:
        print(f"SKIP {f}: 未找到 {OLD}")

print("DONE")
