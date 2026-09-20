# -*- coding: utf-8 -*-
import io, re, os

A = r'D:\下载的文件\学习工作台'

# 看 3 个页面的 feature-card 区域精确 HTML
for page, keywords in [
    ('高情商表达.html', ['角色扮演训练', 'i人沟通专区']),
    ('商务礼仪面试.html', ['无领导小组讨论', '模拟面试']),
    ('央国企笔试.html', ['真题模考', '时政热点']),
]:
    with io.open(os.path.join(A, page), encoding='utf-8') as f:
        h = f.read()
    print('=====', page, '=====')
    for kw in keywords:
        idx = h.find(kw)
        if idx < 0:
            print('  ', kw, 'NOT FOUND'); continue
        # 向前找 feature-card 开始
        start = h.rfind('<div class="feature-card', 0, idx)
        # 向后找这个卡片结束（</div></div> 或下一个 feature-card）
        next_card = h.find('<div class="feature-card', start + 10)
        end = next_card if next_card > 0 else start + 600
        block = h[start:end]
        print('  ---', kw, '---')
        print('  ', block.strip()[:400].replace('\n', ' '))
        print()
    # 看 script 引用
    scripts = re.findall(r'<script src="([^"]+)"', h)
    print('  scripts:', scripts)
    print()
