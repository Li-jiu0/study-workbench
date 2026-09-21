# -*- coding: utf-8 -*-
"""合并步骤1：复制 7 个新文件 + 改 goBack + 提取 (2) feature 卡片代码"""
import io, os, shutil, re

A = r'D:\下载的文件\学习工作台'
B = r'D:\下载的文件\学习工作台(2)'

# 1) 复制 3 个新 HTML
for name in ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html']:
    shutil.copy2(os.path.join(B, name), os.path.join(A, name))
    print('copied:', name)

# 2) 复制 4 个新 JS
for name in ['chat-local.js', 'group-discussion.js', 'i-partner.js', 'topic-express.js']:
    shutil.copy2(os.path.join(B, 'assets', name), os.path.join(A, 'assets', name))
    print('copied: assets/' + name)

# 3) 改新页面的 goBack() 返回学习工作台.html
for name in ['AI模拟面试.html', 'PPT素材库.html', '四级经验分享.html']:
    fp = os.path.join(A, name)
    with io.open(fp, encoding='utf-8') as f:
        h = f.read()
    # 找 goBack 函数
    m = re.search(r'function\s+goBack\s*\([^)]*\)\s*\{[^}]*\}', h)
    if m:
        old_fn = m.group(0)
        new_fn = "function goBack() { location.href='学习工作台.html'; }"
        h = h.replace(old_fn, new_fn, 1)
        print('goBack patched:', name)
    else:
        print('goBack NOT FOUND in', name)
    # 标题里的"星途学习工作台"改成"学习工作台"
    h = h.replace('星途学习工作台', '学习工作台')
    with io.open(fp, 'w', encoding='utf-8') as f:
        f.write(h)

# 4) 提取 (2) 里新 feature 卡片的完整代码（从 feature-card 开始到下一个 feature-card 或 section 结束）
print()
print('===== 提取 (2) feature 卡片 =====')
for page, keyword, mod_fn in [
    ('高情商表达.html', 'i人伙伴团', 'IPartner'),
    ('商务礼仪面试.html', '无领导小组讨论', 'GroupDiscussion'),
    ('央国企笔试.html', '话题表达训练', 'TopicExpress'),
]:
    fp = os.path.join(B, page)
    with io.open(fp, encoding='utf-8') as f:
        h = f.read()
    # 找包含关键词的 feature-card 完整块
    # 先找关键词位置，向前找最近的 <div class="feature-card" 或 feature 容器开始
    idx = h.find(keyword)
    if idx < 0:
        print(page, keyword, 'NOT FOUND'); continue
    # 向前找 feature-card 开始
    start = h.rfind('<div class="feature-card', 0, idx)
    if start < 0:
        start = h.rfind('<div class="feature', 0, idx)
    # 向后找这个 div 的结束（匹配嵌套）
    # 简单：找下一个 </div> 序列，或者下一个 feature-card 开始
    next_card = h.find('<div class="feature-card', start + 10)
    if next_card < 0:
        next_card = h.find('</section>', start)
    block = h[start:next_card] if next_card > 0 else h[start:start+800]
    print('---', page, '/', keyword, '---')
    print(block.strip()[:600])
    print()
