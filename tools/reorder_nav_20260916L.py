# -*- coding: utf-8 -*-
"""STAMP=20260916L 交付物 B：底部导航调序 首页→互动→我的→AI→更多
对 27 个页面：在 nav 块内把 AI 项从第 2 位移到第 4 位（更多之前）；
B2：学习工作台→首页项、个人中心→我的项、私聊→互动项 加 active。
断言每个页面 nav 的 bn-label 序列 == [首页,互动,我的,AI,更多]，否则报错退出不写盘。
"""
import io, re, os, sys

ROOT = r'D:\下载的文件\学习工作台'
RE_NAV = re.compile(r'<nav class="bottom-nav"[\s\S]*?</nav>')
RE_LABEL = re.compile(r'class="bn-label"[^>]*>([^<]+)</div>')

# 27 个待改页（AI 当前在第 2 位）
PAGES = [
    'PPT案例拆解.html', 'PPT版式库.html', 'PPT训练.html', 'blog_wechat.html',
    '万能金句库.html', '个人中心.html', '企业定向库.html', '动态.html',
    '商务礼仪.html', '商务礼仪面试.html', '四级备考.html', '四级词汇.html',
    '场景话术库.html', '央国企笔试.html', '学习博客.html', '学习工作台.html',
    '工具.html', '时政热点.html', '更多.html', '申论刷题.html', '私聊.html',
    '管理员.html', '行测刷题.html', '设置.html', '错题本.html', '面试题库.html',
    '高情商表达.html',
]
# B2 active：页 -> 定位关键字
ACTIVE = {
    '学习工作台.html': 'data-page="home"',          # 首页项
    '个人中心.html': 'openBlogProfile()',            # 我的项
    '私聊.html': 'gotoChat()',                       # 互动项
}

EXPECT = ['首页', '互动', '我的', 'AI', '更多']
REPORT = []
fail = False

def add_active_to_line(line, key):
    if 'class="bottom-nav-item active"' in line:
        return line, True  # 已添加，视为完成
    if key in line and 'bottom-nav-item' in line:
        return line.replace('class="bottom-nav-item"', 'class="bottom-nav-item active"', 1), True
    return line, False

for name in PAGES:
    p = os.path.join(ROOT, name)
    if not os.path.exists(p):
        REPORT.append('!! 缺文件 %s' % name); fail = True; continue
    s = io.open(p, encoding='utf-8-sig', errors='ignore').read()
    m = RE_NAV.search(s)
    if not m:
        REPORT.append('!! %s 无 bottom-nav' % name); fail = True; continue
    block = m.group(0)
    lines = block.split('\n')

    # 1) 找 AI 项行
    ai_idx = None
    for i, ln in enumerate(lines):
        if 'bottom-nav-item' in ln and "location.href='AI.html'" in ln:
            ai_idx = i; break
    if ai_idx is None:
        REPORT.append('!! %s 未找到 AI 项' % name); fail = True; continue
    ai_line = lines[ai_idx]

    # 2) 删 AI 项
    rest = lines[:ai_idx] + lines[ai_idx+1:]

    # 3) 找 更多 项起始行 = nav 块内最后一个 bottom-nav-item（更多恒为末项）
    more_candidates = [i for i, ln in enumerate(rest) if 'bottom-nav-item' in ln]
    if not more_candidates:
        REPORT.append('!! %s 未找到 更多 项' % name); fail = True; continue
    more_idx = more_candidates[-1]

    # 4) 插入 AI 行（缩进对齐 更多 起始行）
    indent = re.match(r'\s*', rest[more_idx]).group(0)
    ai_moved = re.sub(r'^\s+', '', ai_line)
    new_ai = indent + ai_moved
    new_lines = rest[:more_idx] + [new_ai] + rest[more_idx:]

    # 5) B2 active
    act_key = ACTIVE.get(name)
    act_done = False
    if act_key:
        for i, ln in enumerate(new_lines):
            new_ln, did = add_active_to_line(ln, act_key)
            if did:
                new_lines[i] = new_ln; act_done = True; break
        if not act_done:
            REPORT.append('!! %s 未找到 active 目标(%s)' % (name, act_key)); fail = True

    new_block = '\n'.join(new_lines)

    # 6) 断言 bn-label 序列
    labels = RE_LABEL.findall(new_block)
    ok = (labels == EXPECT)
    # AI 位置（1-based，在 block 中的 5 项里）
    ai_pos = labels.index('AI') + 1 if 'AI' in labels else -1

    if not ok:
        REPORT.append('!! %s 断言失败 label=%s' % (name, labels)); fail = True; continue

    # 写盘
    s2 = s[:m.start()] + new_block + s[m.end():]
    io.open(p, 'w', encoding='utf-8-sig').write(s2)
    REPORT.append('%s OK label=%s AI位=%d%s' % (name, labels, ai_pos, ' [+active]' if act_done else ''))

if fail:
    REPORT.append('==> 存在失败，已中断，部分文件可能已写盘（失败项未写）')
else:
    REPORT.append('==> 全部 27 页断言 OK')
io.open(r'C:/Users/ATM/_reorder_out.txt', 'w', encoding='utf-8').write('\n'.join(REPORT))
print('reorder done; fail=%s' % fail)
