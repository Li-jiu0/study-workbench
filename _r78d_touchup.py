# -*- coding: utf-8 -*-
"""R78 微调：HTML 注释/aria 改词，使「恢复默认」字面恰 1 处（title 属性）。二进制替换。"""
import os

ROOT = r'D:\下载的文件\学习工作台'
hp = os.path.join(ROOT, '动态空间.html')


def rb(p):
    with open(p, 'rb') as f:
        return f.read()


def wb(p, b):
    with open(p, 'wb') as f:
        f.write(b)


def rep(data, old, new, expect):
    cnt = data.count(old)
    assert cnt == expect, 'COUNT MISMATCH %r: got %d expect %d' % (old[:60], cnt, expect)
    return data.replace(old, new)


h = rb(hp)
h = rep(h, '         ↺ 恢复默认（清 localStorage 回落默认样式）；有背景时遮罩层保证文字可读。 -->'.encode('utf-8'),
        '         ↺ 一键还原默认（清 localStorage 背景键）；有背景时遮罩层保证文字可读。 -->'.encode('utf-8'), 1)
h = rep(h, 'aria-label="恢复默认"'.encode('utf-8'), 'aria-label="还原背景"'.encode('utf-8'), 1)
assert h.decode('utf-8').count('恢复默认') == 1
assert h.count(b'\r\n') == h.count(b'\n')
wb(hp, h)
print('OK bytes=%d' % len(h))
