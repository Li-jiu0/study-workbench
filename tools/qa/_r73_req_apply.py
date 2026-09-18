# -*- coding: utf-8 -*-
"""R73 需求5/7/8/10/21 逐文件精确替换（字节级保留原生行尾）。"""
import io, os, re, sys

BASE = r'D:\下载的文件\学习工作台'


def read(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write(p, s):
    with io.open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)


def apply(p, pairs, regex=None):
    s = read(p)
    orig = s
    for old, new in pairs:
        n = s.count(old)
        assert n == 1, 'COUNT=%d for %r in %s' % (n, old[:40], p)
        s = s.replace(old, new)
    if regex:
        for pat, rep in regex:
            s, cnt = re.subn(pat, rep, s)
            assert cnt == 1, 'REGEX COUNT=%d for %r in %s' % (cnt, pat, p)
    assert s != orig
    write(p, s)
    return len(orig), len(s)


# ============ 需求5：社区.html ============
p = os.path.join(BASE, '社区.html')
a, b = apply(p, [
    # 删除 AI 辅助写发贴按钮整行
    ('                <button class="btn btn-outline" onclick="editorAiAssist()">'
     '<span class="nav-icon" data-icon="bot" data-icon-size="16"></span> AI 辅助写发贴</button>\r\n', ''),
], regex=[
    # 写帖子输入框占位文案 -> 请编辑.....
    (r'placeholder="写下[^"]*"', 'placeholder="请编辑....."'),
])
print('REQ5 社区.html %d -> %d bytes' % (a, b))

# ============ 需求8：学习工作台.html ============
p = os.path.join(BASE, '学习工作台.html')
old_ring = (
    '                <div class="home-goal-ring" style="flex-shrink:0;position:relative">\r\n'
    '                  <svg viewBox="0 0 70 70" width="100%" height="100%" style="display:block">\r\n'
    '                    <circle cx="35" cy="35" r="28" fill="none" stroke="var(--border)" stroke-width="7"/>\r\n'
    '                    <circle id="goalRing" cx="35" cy="35" r="28" fill="none" stroke="url(#goalGradient)" stroke-width="7" stroke-linecap="round" stroke-dasharray="176" stroke-dashoffset="176" transform="rotate(-90 35 35)"/>\r\n'
    '                    <defs>\r\n'
    '                      <linearGradient id="goalGradient" x1="0%" y1="0%" x2="100%" y2="100%">\r\n'
    '                        <stop offset="0%" stop-color="var(--primary)"/>\r\n'
    '                        <stop offset="100%" stop-color="var(--accent)"/>\r\n'
    '                      </linearGradient>\r\n'
    '                    </defs>\r\n'
    '                  </svg>\r\n'
    '                  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">\r\n'
    '                    <div id="goalPercent" style="font-size:var(--xt-font-base);font-weight:800;color:var(--primary)">0%</div>\r\n'
    '                  </div>\r\n'
    '                </div>\r\n'
)
old_title = (
    '                  <div style="font-size:var(--xt-font-base);font-weight:600;color:var(--text);margin-bottom:4px">今日目标完成率</div>\r\n'
    '                  <div style="font-size:var(--xt-font-xs);color:var(--text-muted);margin-bottom:8px" id="goalText">已完成 0/5 个任务</div>\r\n'
)
a, b = apply(p, [(old_ring, ''), (old_title, '')])
print('REQ8 学习工作台.html %d -> %d bytes' % (a, b))

# ============ 需求10：关于.html ============
p = os.path.join(BASE, '关于.html')
a, b = apply(p, [
    ('<div class="ab-desc">白天上班、晚上备考，最怕的是工具散、计划断、没人答疑。星途把这一路要用的东西收在一处：'
     '能刷题背词、能写申论做 PPT，还有一个随叫随到的 AI —— 不会就问，问完就能接着学。</div>',
     '<div class="ab-desc">人的一生，大多数的时候，见的都是没必要的人，说的也是没必要的话!'
     '譬如昨日死 譬如今日生,人生很长记得开心！</div>'),
    ('<div class="ab-hero-sub">给上班族的备考搭子 · 学得下去、问得明白</div>',
     '<div class="ab-hero-sub">思多乱其智，实干出真知-->修身</div>'),
    ('<div class="ab-sign">—— 小叶子</div>',
     '<div class="ab-sign">——树枝子</div>'),
    # 「AI 怎么用」卡片正文重写（用途 / 使用步骤 / 适用场景 三段式）
    ('            <div class="ab-text">\r\n'
     '              <b>AI 问答</b>：底部导航点「AI」进入。默认「自动（推荐）」会按题型挑模型——数学推理走 DeepSeek-R1、英语翻译走混元、发图提问走视觉模型；也能手动指定模型（首页小助手与 AI 页共用同一份模型选择）。开 <b>MAX 模式</b>输出更长（适合申论批改、长文讲解），开 <b>深度思考</b>会先推导再给结论。\r\n'
     '            </div>\r\n'
     '            <div class="ab-text" style="margin-top:8px">\r\n'
     '              <b>AI 伙伴</b>：两位常驻——<b>小助手</b>覆盖行测、申论、四级、面试、PPT、备考规划，给的是结论 + 可执行动作；<b>暖心学伴</b>学不动的时候先稳住你，再拆一个「现在就能开始」的小任务。首页右下角悬浮球打开即可聊，也可以在「AI」页展开完整对话。\r\n'
     '            </div>',
     '            <div class="ab-text">\r\n'
     '              <b>用途</b>：这张卡片说明 AI 功能能帮你做什么、该怎么用。它是全站的学习搭子——不会的题可以问，写不出的申论可以改，学不动的时候还能陪你聊两句，把「不会就问、问完接着学」落到每一次学习里。\r\n'
     '            </div>\r\n'
     '            <div class="ab-text" style="margin-top:8px">\r\n'
     '              <b>使用步骤</b>：① 从底部导航点「AI」进入 AI 页，或点首页右下角的悬浮球快速打开对话；② 在输入框里直接描述你的问题（题目、作文、知识点都可以，也能发图片提问）；③ 想让回答更长更细就打开 <b>MAX 模式</b>，想让它一步步推理就打开 <b>深度思考</b>，模型默认「自动（推荐）」会按题型帮你挑，也能手动指定；④ 看完答复继续追问或换话题即可，对话历史会自动保存。\r\n'
     '            </div>\r\n'
     '            <div class="ab-text" style="margin-top:8px">\r\n'
     '              <b>适用场景</b>：行测 / 申论解题讲解、四级词汇与翻译、面试模拟与答题思路、PPT 大纲与文案、备考计划拆解，以及学不动时找人帮你稳住节奏——这些都可以交给 AI。涉及报考条件、政策条款等关键信息时，仍请以官方文件为准。\r\n'
     '            </div>'),
])
print('REQ10 关于.html %d -> %d bytes' % (a, b))

# ============ 需求21：更多.html 加入口 ============
p = os.path.join(BASE, '更多.html')
old_about = (
    '          <div class="morepage-card morepage-list-item" onclick="showAbout()">\r\n'
    '            <div class="mpc-icon"><span class="nav-icon" data-icon="info" data-icon-size="20"></span></div>\r\n'
    '            <div class="mpc-title">关于</div>\r\n'
    '            <div class="mpc-desc">版本 · 功能清单与说明</div>\r\n'
    '          </div>\r\n'
)
new_about = old_about + (
    '          <div class="morepage-card morepage-list-item" onclick="location.href=\'赞助.html\'">\r\n'
    '            <div class="mpc-icon"><span class="nav-icon" data-icon="heart" data-icon-size="20"></span></div>\r\n'
    '            <div class="mpc-title">赞助</div>\r\n'
    '            <div class="mpc-desc">支持星途 · 扫码请作者喝杯咖啡</div>\r\n'
    '          </div>\r\n'
)
a, b = apply(p, [(old_about, new_about)])
print('REQ21 更多.html %d -> %d bytes' % (a, b))

print('ALL EDITS DONE')
