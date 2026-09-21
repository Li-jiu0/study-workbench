# -*- coding: utf-8 -*-
import io, re, os

A = r'D:\下载的文件\学习工作台'
B = r'D:\下载的文件\学习工作台(2)'

# 对比 (2) 和当前项目的 feature-card onclick
print('===== feature-card onclick 对比 =====')
for page in ['高情商表达.html', '商务礼仪面试.html', '央国企笔试.html']:
    with io.open(os.path.join(A, page), encoding='utf-8') as f:
        a = f.read()
    with io.open(os.path.join(B, page), encoding='utf-8') as f:
        b = f.read()
    print('---', page, '---')
    # 提取所有 feature-card 块的 title + onclick
    def extract_cards(html):
        cards = []
        for m in re.finditer(r'<div class="feature-card"[^>]*onclick="([^"]*)"[^>]*>(.*?)</div>\s*</div>', html, re.S):
            onclick = m.group(1)
            body = m.group(2)
            tm = re.search(r'<div class="feature-title">([^<]+)</div>', body)
            title = tm.group(1) if tm else '???'
            cards.append((title, onclick))
        return cards
    a_cards = extract_cards(a)
    b_cards = extract_cards(b)
    print('  当前:', [(t, o) for t, o in a_cards])
    print('  (2) :', [(t, o) for t, o in b_cards])
    print()

# chat.js 是否设置 __IM_LOADED__
print('===== chat.js 防重复标记 =====')
with io.open(os.path.join(A, 'assets', 'chat.js'), encoding='utf-8') as f:
    cj = f.read()
print('  __IM_LOADED__ in chat.js:', '__IM_LOADED__' in cj)
print('  chat.js 前 200:', cj[:200].replace('\n',' '))

# (2) 私聊.html 的 script 引用
print()
print('===== (2) 私聊.html script 引用 =====')
with io.open(os.path.join(B, '私聊.html'), encoding='utf-8') as f:
    bp = f.read()
print('  scripts:', re.findall(r'src="([^"]+\.js)"', bp))
