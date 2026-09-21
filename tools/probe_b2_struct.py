# -*- coding: utf-8 -*-
import io, re, os

A = r'D:\下载的文件\学习工作台'
B = r'D:\下载的文件\学习工作台(2)'

# 1) 新页面结构：看前 30 行 + 是否有内联 style/script + 页面标题
print('===== 新页面结构 =====')
for name in ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html']:
    fp = os.path.join(B, name)
    with io.open(fp, encoding='utf-8') as f:
        h = f.read()
    title = re.search(r'<title>(.*?)</title>', h)
    has_inline_style = '<style>' in h or '<style ' in h
    has_inline_script = '<script>' in h or re.search(r'<script[^>]*>', h) is not None and 'src=' not in h[:h.find('<script')+50] if '<script' in h else False
    inline_script_count = len(re.findall(r'<script(?![^>]*src=)', h))
    print(name, ':')
    print('  title:', title.group(1) if title else 'NONE')
    print('  inline <style>:', has_inline_style, ' inline <script>(无src):', inline_script_count)
    print('  总 <script> 标签:', h.count('<script'))
    print('  body 前 200 字:', re.search(r'<body[^>]*>(.*?)</body>', h, re.S).group(1)[:200].replace('\n',' ') if '<body' in h else 'no body')
    print()

# 2) group-discussion.js / topic-express.js 在 (2) 哪些页面引用
print('===== group-discussion / topic-express 引用页面 =====')
for js in ['group-discussion.js', 'topic-express.js', 'chat-local.js']:
    pages = []
    for fn in os.listdir(B):
        if fn.endswith('.html'):
            with io.open(os.path.join(B, fn), encoding='utf-8') as f:
                c = f.read()
            if js in c:
                pages.append(fn)
    print(js, '->', pages)

# 3) mini-*.js 数据差异：看 (2) 比当前多了什么（前 200 字对比）
print()
print('===== mini-comm.js 头部对比 =====')
with io.open(os.path.join(A, 'assets', 'mini-comm.js'), encoding='utf-8') as f:
    a = f.read()
with io.open(os.path.join(B, 'assets', 'mini-comm.js'), encoding='utf-8') as f:
    b = f.read()
print('当前前 150:', a[:150].replace('\n',' '))
print('(2)  前 150:', b[:150].replace('\n',' '))
print('当前数据数组长度(commData):', a.count('{'))
print('(2)  数据数组长度(commData):', b.count('{'))

# 4) 当前私聊.html 的 JS 结构
print()
print('===== 当前 私聊.html 结构 =====')
with io.open(os.path.join(A, '私聊.html'), encoding='utf-8') as f:
    p = f.read()
print('  <script> 标签数:', p.count('<script'))
print('  内联 script(无src):', len(re.findall(r'<script(?![^>]*src=)', p)))
print('  引用 js:', re.findall(r'src=["\']([^"\']+\.js)["\']', p))
print('  title:', re.search(r'<title>(.*?)</title>', p).group(1) if re.search(r'<title>', p) else 'NONE')
