# -*- coding: utf-8 -*-
"""详细对比：新页面引用、高情商表达差异、mini-*.js 差异"""
import io, re, os

A = r'D:\下载的文件\学习工作台'
B = r'D:\下载的文件\学习工作台(2)'

# 1) 新页面的所有 script/link（含内联）
print('===== 新页面引用 =====')
for name in ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html']:
    fp = os.path.join(B, name)
    with io.open(fp, encoding='utf-8') as f:
        h = f.read()
    srcs = re.findall(r'src=["\']([^"\']+)["\']', h)
    hrefs = re.findall(r'href=["\']([^"\']+\.(?:css|js))["\']', h)
    print(name, ':')
    print('  script src:', [s for s in srcs if s.endswith('.js')])
    print('  css href:', [h for h in hrefs if h.endswith('.css')])
    # 看是否有 navigateTo 入口或 sidebar 结构
    print('  has sidebar:', 'sidebar' in h, 'has bottom-nav:', 'bottom-nav' in h)
    print()

# 2) 高情商表达.html 差异：找 (2) 有但当前没有的 script 引用和模块
print('===== 高情商表达.html 差异 =====')
with io.open(os.path.join(A, '高情商表达.html'), encoding='utf-8') as f:
    a = f.read()
with io.open(os.path.join(B, '高情商表达.html'), encoding='utf-8') as f:
    b = f.read()
a_srcs = set(re.findall(r'src=["\']([^"\']+\.js)["\']', a))
b_srcs = set(re.findall(r'src=["\']([^"\']+\.js)["\']', b))
print('  当前 scripts:', sorted(a_srcs))
print('  (2) scripts:', sorted(b_srcs))
print('  (2) 多出的 script:', sorted(b_srcs - a_srcs))
# 找 (2) 里的模块入口按钮/卡片
b_modules = re.findall(r'onclick=["\']([^"\']*(?:groupDiscussion|iPartner|topicExpress|openGroup|openPartner|openTopic)[^"\']*)["\']', b)
print('  (2) 新模块入口:', b_modules[:10])

# 3) mini-*.js 差异：函数名对比
print()
print('===== mini-*.js 函数对比 =====')
for name in ['mini-comm.js', 'mini-exam.js', 'mini-interview.js', 'mini-ppt.js', 'mini.js']:
    with io.open(os.path.join(A, 'assets', name), encoding='utf-8') as f:
        aj = f.read()
    with io.open(os.path.join(B, 'assets', name), encoding='utf-8') as f:
        bj = f.read()
    a_fns = set(re.findall(r'function\s+(\w+)', aj))
    b_fns = set(re.findall(r'function\s+(\w+)', bj))
    print(name, 'A=%d B=%d  (2)多出函数:' % (len(aj), len(bj)), sorted(b_fns - a_fns)[:15])

# 4) 私聊.html 当前用的是 chat.js 还是 chat-local
print()
print('===== 私聊.html 引用 =====')
with io.open(os.path.join(A, '私聊.html'), encoding='utf-8') as f:
    p = f.read()
print('  scripts:', re.findall(r'src=["\']([^"\']+\.js)["\']', p))
