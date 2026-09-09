# -*- coding: utf-8 -*-
"""探查 (2) 独有文件的依赖和结构"""
import io, re, os

B = r'D:\下载的文件\学习工作台(2)'

def head(fp):
    with io.open(fp, encoding='utf-8') as f:
        h = f.read()
    # 提取 <head> 内容
    m = re.search(r'<head>(.*?)</head>', h, re.S)
    head = m.group(1) if m else ''
    # 提取 script src 和 link href
    scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', head)
    links = re.findall(r'<link[^>]+href=["\']([^"\']+)["\']', head)
    # 提取 body 里的主要模块标题（h1/h2/h3/卡片标题）
    body = h[h.find('</head>'):] if '</head>' in h else h
    titles = re.findall(r'<(?:h[1-4]|div[^>]*class="[^"]*(?:card-title|module-title|section-title)[^"]*"[^>]*)>([^<]{2,40})', body)
    return scripts, links, titles[:15]

for name in ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html']:
    fp = os.path.join(B, name)
    if not os.path.exists(fp):
        print(name, 'NOT FOUND'); continue
    s, l, t = head(fp)
    print('=====', name, '=====')
    print('  scripts:', s)
    print('  links:', l)
    print('  titles:', t)
    print()

# 4 个新 JS 的功能概览（找函数定义和顶部注释）
for name in ['chat-local.js', 'group-discussion.js', 'i-partner.js', 'topic-express.js']:
    fp = os.path.join(B, 'assets', name)
    with io.open(fp, encoding='utf-8') as f:
        js = f.read()
    fns = re.findall(r'(?:function\s+(\w+)|(?:window\.)?(\w+)\s*=\s*function)', js)
    fns = [a or b for a, b in fns]
    print('===== assets/%s (%d bytes) =====' % (name, len(js)))
    print('  top comment:', js[:200].replace('\n', ' '))
    print('  functions:', fns[:20])
    print()
