# -*- coding: utf-8 -*-
"""R83b：TIMEOUT_TOTAL 30000 -> 90000（仅此一个值 + 对应注释）
备份另存 .bak-pre-r83b-20260917，不覆盖既有 .bak-pre-r83-20260917
"""
import os
import shutil

p = r"D:\下载的文件\学习工作台\assets\ai-service.js"
bak_r83 = p + ".bak-pre-r83-20260917"
bak_r83b = p + ".bak-pre-r83b-20260917"

# 新备份（不覆盖 R83 那份）
if not os.path.exists(bak_r83b):
    shutil.copyfile(p, bak_r83b)
assert os.path.exists(bak_r83), "R83 原备份缺失"

data = open(p, "rb").read()
assert data.count(b"\r") == 0, "not LF"

old = ("  // 单次请求总时长上限：R83 与正常调用超时对齐为 30 秒，防止流式读到一半永久挂起\n"
       "  var TIMEOUT_TOTAL = 30000;").encode("utf-8")
new = ("  // 单次请求总时长上限：兜底防挂死（不截断正常长回答）；\n"
       "  // R83b：文档 §四的「30 秒」指首响应超时（TIMEOUT_RESPONSE），总时长回归 90 秒，避免长回答被判超时降级\n"
       "  var TIMEOUT_TOTAL = 90000;").encode("utf-8")
n = data.count(old)
assert n == 1, "anchor count=%d" % n
data = data.replace(old, new, 1)
assert data.count(b"\r") == 0

open(p, "wb").write(data)
print("written %d bytes" % len(data))
