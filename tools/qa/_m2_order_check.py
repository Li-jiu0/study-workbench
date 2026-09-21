# -*- coding: utf-8 -*-
"""断言 设置.html / 更多.html / 更新.html 中 <script src="assets/config.js..."> 位于
   <script src="assets/xt-update.js..."> 之前（按字节位置，只匹配 script 标签）。"""
import os
os.chdir(r"D:/下载的文件/学习工作台")

def order(path):
    b = open(path, "rb").read()
    i_cfg = b.find(b'<script src="assets/config.js')
    i_upd = b.find(b'<script src="assets/xt-update.js')
    ok = (i_cfg >= 0 and i_upd > i_cfg)
    print("%s: script config@%d update@%d -> %s" % (
        path, i_cfg, i_upd, "OK" if ok else "FAIL"))
    return ok

ok1 = order("设置.html")
ok2 = order("更多.html")
ok3 = order("更新.html")
print("ALL_OK:", ok1 and ok2 and ok3)
