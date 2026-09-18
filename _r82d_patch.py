# -*- coding: utf-8 -*-
"""R82 补遗：互动面板分区标题 ❤ 点赞 / 💬 评论 → ico(heart) / ico(message-circle)（漏网两处）。"""
import os

ROOT = r'D:\下载的文件\学习工作台'
jp = os.path.join(ROOT, 'assets', 'xt-moments.js')


def rb(p):
    with open(p, 'rb') as f:
        return f.read()


def wb(p, b):
    with open(p, 'wb') as f:
        f.write(b)


def rep(data, old, new, expect):
    cnt = data.count(old)
    assert cnt == expect, 'COUNT MISMATCH %r: got %d' % (old[:60], cnt)
    return data.replace(old, new)


j = rb(jp)
j = rep(j, "var html = '<div class=\"xtm-sec\"><div class=\"xtm-sec-t\">❤ 点赞（' + likes.length + '）</div>';".encode('utf-8'),
        "var html = '<div class=\"xtm-sec\"><div class=\"xtm-sec-t\">' + ico('heart', 12, '❤') + ' 点赞（' + likes.length + '）</div>';".encode('utf-8'), 1)
j = rep(j, "html += '</div><div class=\"xtm-sec\"><div class=\"xtm-sec-t\">💬 评论（' + cmts.length + '）</div>';".encode('utf-8'),
        "html += '</div><div class=\"xtm-sec\"><div class=\"xtm-sec-t\">' + ico('message-circle', 12, '💬') + ' 评论（' + cmts.length + '）</div>';".encode('utf-8'), 1)
assert j.count(b'\r\n') == j.count(b'\n')
wb(jp, j)
print('OK bytes=%d' % len(j))
