# -*- coding: utf-8 -*-
import io

d = io.open(r'个人中心.html', encoding='utf-8', newline='').read().split('\r\n')
for i in range(155, 163):
    print('个人中心:%d: %s' % (i + 1, d[i]))
print('---')
n = io.open(r'动态空间.html', encoding='utf-8', newline='').read().split('\r\n')
for i in range(50, 61):
    print('动态空间:%d: %s' % (i + 1, n[i]))
print('---')
for i in range(156, 166):
    print('动态空间:%d: %s' % (i + 1, n[i]))
