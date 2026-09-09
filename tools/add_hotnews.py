# -*- coding: utf-8 -*-
import io, os

p = r'D:\下载的文件\学习工作台\央国企笔试.html'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# 1. 修改时政热点卡片
old_card = """          <div class="feature-card" onclick="openMiniQuiz('exam-politics')">
            <div class="feature-icon">📰</div>
            <div class="feature-title">时政热点</div>
            <div class="feature-desc">近一年时政、经济政策、行业热点，按月整理</div>
          </div>"""
new_card = """          <div class="feature-card" onclick="openHotNewsPanel()">
            <div class="feature-icon">🔥</div>
            <div class="feature-title">时政热点</div>
            <div class="feature-desc">自动获取最新网络热点议题，实时更新（可切换题库模式）</div>
          </div>"""
if old_card in src:
    src = src.replace(old_card, new_card, 1)
    print('FIXED: 时政热点卡片 onclick 改为 openHotNewsPanel')
else:
    print('SKIP: 时政热点卡片 pattern not found')
    # 尝试只替换 onclick
    if "openMiniQuiz('exam-politics')" in src:
        src = src.replace("openMiniQuiz('exam-politics')", "openHotNewsPanel()", 1)
        print('FIXED: 仅替换 onclick')

# 2. 加 hotnews.js 引用（在 qbank.js 后面）
old_script = '<script src="assets/qbank.js?v=6"></script>'
new_script = '<script src="assets/qbank.js?v=6"></script>\n<script src="assets/hotnews.js"></script>'
if old_script in src:
    src = src.replace(old_script, new_script, 1)
    print('FIXED: 加 hotnews.js 引用')
else:
    print('SKIP: qbank.js script not found')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print()
print('DONE: 央国企笔试.html saved')
