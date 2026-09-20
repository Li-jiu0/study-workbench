# -*- coding: utf-8 -*-
import io, re, os

A = r'D:\下载的文件\学习工作台'
B = r'D:\下载的文件\学习工作台(2)'

# 1) 商务礼仪面试.html 里 GroupDiscussion 入口
print('===== (2) 商务礼仪面试 GroupDiscussion 入口 =====')
with io.open(os.path.join(B, '商务礼仪面试.html'), encoding='utf-8') as f:
    h = f.read()
idx = h.find('GroupDiscussion')
if idx >= 0:
    print(h[max(0,idx-400):idx+200])
else:
    # 找"无领导小组"
    idx = h.find('无领导小组')
    print('无领导小组 @', idx)
    print(h[max(0,idx-300):idx+300])

# 2) 当前项目 3 个页面的 feature 区结构（找 feature-card 列表和结束位置）
print()
print('===== 当前项目 feature 区结构 =====')
for page in ['高情商表达.html', '商务礼仪面试.html', '央国企笔试.html']:
    with io.open(os.path.join(A, page), encoding='utf-8') as f:
        h = f.read()
    # 找所有 feature-card 的 title
    titles = re.findall(r'<div class="feature-title">([^<]+)</div>', h)
    print(page, 'feature titles:', titles)
    # 找 feature 区的开始和结束（feature-grid 或 feature-list）
    fg = h.find('feature-grid')
    if fg < 0: fg = h.find('feature-list')
    if fg < 0: fg = h.find('class="feature')
    print('  feature 区开始 @', fg)
    # 找 feature 区结束（</section> 或 </div> 后接新 section）
    # 简单：找最后一个 feature-card 结束
    last_card = h.rfind('feature-card')
    print('  最后 feature-card @', last_card)
    # 找最后一个 feature-card 后的 </div>
    if last_card > 0:
        end_div = h.find('</div>', last_card + 200)
        print('  插入点(最后card后) @', end_div, ':', h[end_div:end_div+80].replace('\n',' '))
    print()
