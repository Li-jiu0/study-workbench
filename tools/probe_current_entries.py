# -*- coding: utf-8 -*-
import io, re, os

A = r'D:\下载的文件\学习工作台'

# 1) 当前项目相关 feature-card 的 onclick
print('===== 当前项目 feature-card onclick =====')
for page, keywords in [
    ('高情商表达.html', ['i人沟通专区', 'i人伙伴团', '角色扮演']),
    ('商务礼仪面试.html', ['无领导小组讨论', '模拟面试']),
    ('央国企笔试.html', ['话题表达', '综合知识']),
]:
    with io.open(os.path.join(A, page), encoding='utf-8') as f:
        h = f.read()
    print('---', page, '---')
    for kw in keywords:
        idx = h.find(kw)
        if idx < 0:
            print('  ', kw, ': NOT FOUND'); continue
        # 向前找最近的 feature-card 开始
        start = h.rfind('<div class="feature-card', 0, idx)
        if start < 0: start = h.rfind('onclick=', 0, idx)
        block = h[start:idx+100]
        # 提取 onclick
        m = re.search(r'onclick="([^"]*)"', block)
        print('  ', kw, ': onclick =', m.group(1) if m else 'NONE')
    print()

# 2) 私聊.html 的 script 引用和结构
print('===== 当前 私聊.html =====')
with io.open(os.path.join(A, '私聊.html'), encoding='utf-8') as f:
    p = f.read()
# 所有 script 标签（含 src）
scripts = re.findall(r'<script[^>]*>', p)
print('  script tags:', scripts)
# 找 chat.js 或 chat-local
print('  has chat.js:', 'chat.js' in p)
print('  has chat-local.js:', 'chat-local.js' in p)
# 找私信功能的初始化函数
inits = re.findall(r'(?:init|boot|render)[A-Za-z]*\s*\(', p)
print('  init calls:', list(set(inits))[:10])

# 3) 当前项目 学习工作台.html 首页有没有 AI模拟面试/PPT素材库/四级经验分享 入口
print()
print('===== 当前 学习工作台.html 首页入口 =====')
with io.open(os.path.join(A, '学习工作台.html'), encoding='utf-8') as f:
    home = f.read()
for kw in ['AI模拟面试', 'PPT素材库', '四级经验分享', 'PPT模板']:
    print('  ', kw, ':', kw in home)
