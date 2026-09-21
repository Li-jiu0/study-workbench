# -*- coding: utf-8 -*-
import subprocess, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
REPO = r"D:\下载的文件\学习工作台"
p = subprocess.run(["git", "-C", REPO, "-c", "core.quotepath=false", "status", "--short"],
                   capture_output=True)
lines = p.stdout.decode('utf-8','replace').splitlines()
untracked = [l for l in lines if l.startswith('??')]
print("total untracked:", len(untracked))
# 只打印非 _ 开头、非 tools/_ 开头的（关注真实新增文件）
for l in untracked:
    name = l[3:]
    if not name.startswith('_') and not name.startswith('tools/_'):
        print(l)
print("---- 关键文件状态 ----")
for f in ["动态空间.html","朋友圈.html","动态.html","学习工作台-安卓App.apk"]:
    q = subprocess.run(["git","-C",REPO,"-c","core.quotepath=false","status","--short","--",f],
                       capture_output=True)
    print(repr(f), "->", repr(q.stdout.decode('utf-8','replace').strip()))
