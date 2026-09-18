# -*- coding: utf-8 -*-
"""R90 QA: 定位 xt-moments.js 的 boot / 暴露 / renderChosen / 初始页判定"""
import io, re, os

ROOT = r'D:\下载的文件\学习工作台'
p = os.path.join(ROOT, 'assets', 'xt-moments.js')
s = io.open(p, encoding='utf-8').read()
lines = s.split('\n')

pats = ['function boot', 'XTM = {', 'window.XTM', 'function renderChosen',
        'function xtmSaveDraft', 'DOMContentLoaded', 'data-xtm', 'S.page',
        'function $', 'function inputSheet']

for i, l in enumerate(lines):
    for pt in pats:
        if pt in l:
            print('%5d| %s' % (i + 1, l.strip()[:170]))
            break
