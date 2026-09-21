# -*- coding: utf-8 -*-
"""合并 (2) 的功能到当前项目：
1. 高情商表达.html：加 i人伙伴团卡片 + i-partner.js
2. 商务礼仪面试.html：加 AI无领导小组讨论卡片 + group-discussion.js
3. 央国企笔试.html：加 话题表达训练卡片 + topic-express.js
4. 私聊.html：chat.js -> chat-local.js
5. 学习工作台.html：3个占位工具替换为 AI模拟面试/PPT素材库/四级经验分享
"""
import io, os, re

A = r'D:\下载的文件\学习工作台'

def patch(path, old, new, label):
    with io.open(path, encoding='utf-8') as f:
        src = f.read()
    if old not in src:
        print('FAIL [%s]: old string not found in %s' % (label, os.path.basename(path)))
        print('  old preview:', old[:120].replace('\n', ' '))
        return False
    src = src.replace(old, new, 1)
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print('OK [%s]' % label)
    return True

# ========== 1. 高情商表达.html ==========
p = os.path.join(A, '高情商表达.html')

# 1a. 在 i人沟通专区卡片后插入 i人伙伴团卡片
old = """          <div class="feature-card" onclick="openMiniQuiz('comm-introvert')">
            <div class="feature-icon">🦋</div>
            <div class="feature-title">i人沟通专区</div>
            <div class="feature-desc">不用变e人！i人专属沟通策略，提前准备、文字辅助</div>
          </div>
          <div class="feature-card" onclick="openRoleplayDemo()">"""
new = """          <div class="feature-card" onclick="openMiniQuiz('comm-introvert')">
            <div class="feature-icon">🦋</div>
            <div class="feature-title">i人沟通专区</div>
            <div class="feature-desc">不用变e人！i人专属沟通策略，提前准备、文字辅助</div>
          </div>
          <div class="feature-card" onclick="IPartner.open()">
            <div class="feature-icon">👥</div>
            <div class="feature-title">i人伙伴团</div>
            <div class="feature-desc">5个不同性格虚拟伙伴，文字聊天练社交，安全不尴尬</div>
            <span class="feature-badge tag-primary">新上线</span>
          </div>
          <div class="feature-card" onclick="openRoleplayDemo()">"""
patch(p, old, new, '高情商表达: i人伙伴团卡片')

# 1b. 加 i-partner.js 引用（在 mini.js 后）
old = '<script src="assets/mini.js"></script>'
new = '<script src="assets/mini.js"></script>\n<script src="assets/i-partner.js"></script>'
patch(p, old, new, '高情商表达: i-partner.js 引用')

# ========== 2. 商务礼仪面试.html ==========
p = os.path.join(A, '商务礼仪面试.html')

# 2a. 在无领导小组讨论卡片后插入 AI无领导小组讨论卡片
old = """          <div class="feature-card" onclick="openMiniQuiz('iv-group')">
            <div class="feature-icon">👥</div>
            <div class="feature-title">无领导小组讨论</div>
            <div class="feature-desc">AI模拟多名组员，角色选择、发言策略、话术模板</div>
          </div>
          <div class="feature-card" onclick="openInterviewDemo()">"""
new = """          <div class="feature-card" onclick="openMiniQuiz('iv-group')">
            <div class="feature-icon">👥</div>
            <div class="feature-title">无领导小组讨论</div>
            <div class="feature-desc">AI模拟多名组员，角色选择、发言策略、话术模板</div>
          </div>
          <div class="feature-card" onclick="GroupDiscussion.open()">
            <div class="feature-icon">🗣️</div>
            <div class="feature-title">AI无领导小组讨论</div>
            <div class="feature-desc">AI模拟4名组员真实对话，你随时参与发言，结束给评定</div>
            <span class="feature-badge tag-primary">新上线</span>
          </div>
          <div class="feature-card" onclick="openInterviewDemo()">"""
patch(p, old, new, '商务礼仪面试: AI无领导小组讨论卡片')

# 2b. 加 group-discussion.js 引用
old = '<script src="assets/mini.js"></script>'
new = '<script src="assets/mini.js"></script>\n<script src="assets/group-discussion.js"></script>'
patch(p, old, new, '商务礼仪面试: group-discussion.js 引用')

# ========== 3. 央国企笔试.html ==========
p = os.path.join(A, '央国企笔试.html')

# 3a. 在真题模考卡片后插入 话题表达训练卡片
old = """          <div class="feature-card" onclick="openMiniQuiz('exam-mock')">
            <div class="feature-icon">📋</div>
            <div class="feature-title">真题模考</div>
            <div class="feature-desc">历年真题套卷，计时模考，各题型正确率分析</div>
          </div>
        </div>"""
new = """          <div class="feature-card" onclick="openMiniQuiz('exam-mock')">
            <div class="feature-icon">📋</div>
            <div class="feature-title">真题模考</div>
            <div class="feature-desc">历年真题套卷，计时模考，各题型正确率分析</div>
          </div>
          <div class="feature-card" onclick="TopicExpress.open()">
            <div class="feature-icon">🎤</div>
            <div class="feature-title">话题表达训练</div>
            <div class="feature-desc">随机话题+深度解读+1分钟语音表达，练综合分析</div>
            <span class="feature-badge tag-primary">新上线</span>
          </div>
        </div>"""
patch(p, old, new, '央国企笔试: 话题表达训练卡片')

# 3b. 加 topic-express.js 引用
old = '<script src="assets/mini.js"></script>'
new = '<script src="assets/mini.js"></script>\n<script src="assets/topic-express.js"></script>'
patch(p, old, new, '央国企笔试: topic-express.js 引用')

# ========== 4. 私聊.html：chat.js -> chat-local.js ==========
p = os.path.join(A, '私聊.html')
old = '<script src="assets/chat.js?v=1"></script>'
new = '<script src="assets/chat-local.js"></script>'
patch(p, old, new, '私聊: chat.js -> chat-local.js')

# ========== 5. 学习工作台.html：3个占位工具替换 ==========
p = os.path.join(A, '学习工作台.html')

# 5a. 工具占位1 -> AI模拟面试
old = """            <div class="tool-placeholder-card" onclick="openTool('tool-1')" data-page-node-id="MuVHmry6EmVMQnEFEfFpR3">
              <div class="tp-icon" data-page-node-id="eSCDUhjygqlNwE6doboG4W">🧩</div>
              <div class="tp-title" data-page-node-id="mjqUDIdvxO1thfOts85k3z">工具占位 1</div>
              <div class="tp-desc" data-page-node-id="s67qPMF3V9DJTyLYKkvRT8">【后续扩展点】替换为你的工具</div>
            </div>"""
new = """            <div class="tool-placeholder-card" onclick="location.href='AI模拟面试.html'" data-page-node-id="MuVHmry6EmVMQnEFEfFpR3">
              <div class="tp-icon" data-page-node-id="eSCDUhjygqlNwE6doboG4W">🎙️</div>
              <div class="tp-title" data-page-node-id="mjqUDIdvxO1thfOts85k3z">AI模拟面试</div>
              <div class="tp-desc" data-page-node-id="s67qPMF3V9DJTyLYKkvRT8">AI面试官提问+追问，结束给总评报告</div>
            </div>"""
patch(p, old, new, '首页: 工具占位1 -> AI模拟面试')

# 5b. 工具占位2 -> PPT素材库
old = """            <div class="tool-placeholder-card" onclick="openTool('tool-2')" data-page-node-id="olc3rH1bQ57G7xYKkCaqDA">
              <div class="tp-icon" data-page-node-id="EAy0D5VI1Cpw0AiwSAsGPN">🔧</div>
              <div class="tp-title" data-page-node-id="orPRpPzqOJnZEd5Gj0anIQ">工具占位 2</div>
              <div class="tp-desc" data-page-node-id="9C4FhRBeLELYvvxsuVRgJf">【后续扩展点】替换为你的工具</div>
            </div>"""
new = """            <div class="tool-placeholder-card" onclick="location.href='PPT素材库.html'" data-page-node-id="olc3rH1bQ57G7xYKkCaqDA">
              <div class="tp-icon" data-page-node-id="EAy0D5VI1Cpw0AiwSAsGPN">📊</div>
              <div class="tp-title" data-page-node-id="orPRpPzqOJnZEd5Gj0anIQ">PPT素材库</div>
              <div class="tp-desc" data-page-node-id="9C4FhRBeLELYvvxsuVRgJf">6套完整模板，每套5页预览，直接参考套用</div>
            </div>"""
patch(p, old, new, '首页: 工具占位2 -> PPT素材库')

# 5c. 工具占位3 -> 四级经验分享
old = """            <div class="tool-placeholder-card" onclick="openTool('tool-3')" data-page-node-id="YDgpBMzwQ8tEx22Q3ZikDz">
              <div class="tp-icon" data-page-node-id="hBxVEpNCTsx7k3sHal5dhI">⚡</div>
              <div class="tp-title" data-page-node-id="NArTkGPAcV3QZXfbXPWRvr">工具占位 3</div>
              <div class="tp-desc" data-page-node-id="xBA1r5jHiVSQRi9pnmSOYp">【后续扩展点】替换为你的工具</div>
            </div>"""
new = """            <div class="tool-placeholder-card" onclick="location.href='四级经验分享.html'" data-page-node-id="YDgpBMzwQ8tEx22Q3ZikDz">
              <div class="tp-icon" data-page-node-id="hBxVEpNCTsx7k3sHal5dhI">📖</div>
              <div class="tp-title" data-page-node-id="NArTkGPAcV3QZXfbXPWRvr">四级经验分享</div>
              <div class="tp-desc" data-page-node-id="xBA1r5jHiVSQRi9pnmSOYp">学霸备考方法+30天计划+听力4遍法</div>
            </div>"""
patch(p, old, new, '首页: 工具占位3 -> 四级经验分享')

print()
print('===== 合并完成 =====')
