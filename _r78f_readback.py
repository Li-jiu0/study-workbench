# -*- coding: utf-8 -*-
import io
import os
import datetime

ROOT = r'D:\下载的文件\学习工作台'
h = io.open(os.path.join(ROOT, '动态空间.html'), encoding='utf-8', newline='').read().split('\r\n')
print('--- 动态空间.html 关键行 ---')
for i, ln in enumerate(h):
    if ('<style>' in ln or 'R78：页顶背景自定义' in ln or 'xtm-hero{' in ln or 'xtm-hero-mask{' in ln
            or 'xtm-listrow{' in ln or 'id="xtmHero"' in ln or 'id="xtmBgBtn"' in ln
            or 'id="xtmBgReset"' in ln or 'id="xtmBgFile"' in ln or 'xtmMineRow' in ln
            or 'xtm-listrow-t' in ln or '</style>' in ln):
        print('%4d: %s' % (i + 1, ln.strip()[:150]))

j = io.open(os.path.join(ROOT, 'assets', 'xt-moments.js'), encoding='utf-8', newline='').read().split('\r\n')
print('--- assets/xt-moments.js 关键行 ---')
for i, ln in enumerate(j):
    if ('R78：页顶背景自定义' in ln or 'BG_KEY' in ln or 'BG_MAX_BYTES' in ln or 'heroInit' in ln
            or 'heroApply(url)' in ln or 'readAsDataURL' in ln or '背景图不能超过' in ln or '已恢复默认背景' in ln):
        print('%4d: %s' % (i + 1, ln.strip()[:150]))

print('--- mtime ---')
for f in ['动态空间.html', r'assets\xt-moments.js', r'assets\xt-moments.css']:
    p = os.path.join(ROOT, f)
    print('%-22s %s' % (f, datetime.datetime.fromtimestamp(os.path.getmtime(p)).strftime('%Y-%m-%d %H:%M:%S')))
for f in ['动态空间.html', r'assets\xt-moments.js', r'assets\xt-moments.css']:
    p = os.path.join(ROOT, f) + '.bak-pre-r78-20260917'
    print('%-40s %s' % (os.path.basename(p), datetime.datetime.fromtimestamp(os.path.getmtime(p)).strftime('%Y-%m-%d %H:%M:%S')))
