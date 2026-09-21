# -*- coding: utf-8 -*-
import io

p = r'D:\下载的文件\学习工作台\学习工作台.html'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# 1. 在 tools-grid 里加"穿越英语学习"卡片
old_card = """            <div class="tool-placeholder-card" onclick="location.href='四级经验分享.html'" data-page-node-id="YDgpBMzwQ8tEx22Q3ZikDz">
              <div class="tp-icon" data-page-node-id="hBxVEpNCTsx7k3sHal5dhI">📖</div>
              <div class="tp-title" data-page-node-id="NArTkGPAcV3QZXfbXPWRvr">四级经验分享</div>
              <div class="tp-desc" data-page-node-id="xBA1r5jHiVSQRi9pnmSOYp">学霸备考方法+30天计划+听力4遍法</div>
            </div>
          </div>"""

new_card = """            <div class="tool-placeholder-card" onclick="location.href='四级经验分享.html'" data-page-node-id="YDgpBMzwQ8tEx22Q3ZikDz">
              <div class="tp-icon" data-page-node-id="hBxVEpNCTsx7k3sHal5dhI">📖</div>
              <div class="tp-title" data-page-node-id="NArTkGPAcV3QZXfbXPWRvr">四级经验分享</div>
              <div class="tp-desc" data-page-node-id="xBA1r5jHiVSQRi9pnmSOYp">学霸备考方法+30天计划+听力4遍法</div>
            </div>
            <div class="tool-placeholder-card" onclick="openQuest()">
              <div class="tp-icon">⚡</div>
              <div class="tp-title">穿越英语学习</div>
              <div class="tp-desc">闯关式剧情学英语，6关场景+语音评分</div>
            </div>
          </div>"""

if old_card in src:
    src = src.replace(old_card, new_card, 1)
    print('FIXED: 加穿越英语学习入口卡片')
else:
    print('SKIP: card pattern not found')

# 2. 加 quest.js 引用（在 app.js 后面）
old_script = '<script src="assets/app.js?v=20260913s"></script>'
new_script = '<script src="assets/app.js?v=20260913s"></script>\n<script src="assets/quest.js"></script>'
if old_script in src:
    src = src.replace(old_script, new_script, 1)
    print('FIXED: 加 quest.js 引用')
else:
    print('SKIP: app.js script not found')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print('DONE')
