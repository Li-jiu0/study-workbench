# -*- coding: utf-8 -*-
"""STAMP=20260916L 交付物 C：更多页卡片迁移（更多.html / 工具.html）
更多.html：
 1) 删 3 卡（AI问答/工具箱/动态）含上方注释；尾加 3 卡（导入题库/AI面试/穿越英语，span 嵌套图标）
 2) 搬运 importer 依赖：<style> 进 head；importer.js 进 defer 队列；#impLibs 放 morepage-list 后；
    #importerView + 内联脚本（包 IIFE，仅 4 函数挂 window）放页面末尾区域
工具.html：
 1) 删 3 卡（导入题库/AI面试/穿越英语），保留全部导入依赖
 2) 更新顶部注释（本页变为无入口保留页）
"""
import io, re, os

ROOT = r'D:\下载的文件/学习工作台'
TOOLS = os.path.join(ROOT, '工具.html')
MORE = os.path.join(ROOT, '更多.html')
REPORT = []

def read(p):
    return io.open(p, encoding='utf-8-sig', errors='ignore').read()

def balanced_close(lines, start):
    """从含 <div 的 start 行起，扫描到匹配闭合的 </div> 行（返回该行索引）。"""
    depth = 0
    for j in range(start, len(lines)):
        depth += lines[j].count('<div') - lines[j].count('</div>')
        if depth <= 0 and j > start:
            return j
    return -1

def delete_card(lines, onclick_sub):
    """删除 morepage-card（含 onclick_sub）整块，返回 (新lines, 是否删除)。"""
    for i, l in enumerate(lines):
        if 'morepage-card' in l and 'morepage-list-item' in l and onclick_sub in l:
            end = balanced_close(lines, i)
            if end == -1:
                return lines, False
            del lines[i:end + 1]
            return lines, True
    return lines, False

def delete_comment_lines(lines, *subs):
    """删除包含任一 sub 的注释行（<!-- ... -->）。"""
    kept = []
    removed = 0
    for l in lines:
        if l.strip().startswith('<!--') and any(s in l for s in subs):
            removed += 1
            continue
        kept.append(l)
    return kept, removed

# ---------- 从 工具.html 抽取依赖 ----------
t = read(TOOLS)
tl = t.split('\n')

# style 块（唯一 <style>）
m_style = re.search(r'<style>.*?</style>', t, re.S)
style_block = m_style.group(0) if m_style else ''

# #importerView 块
iv_start = next(i for i, l in enumerate(tl) if 'id="importerView"' in l)
iv_end = balanced_close(tl, iv_start)
importer_view_block = '\n'.join(tl[iv_start:iv_end + 1])

# 内联脚本块（含 openImporterView 的那个 <script>）
scr_start = None
scr_end = None
for i, l in enumerate(tl):
    if l.strip().startswith('<script>'):
        # 找到该 <script> 对应的 </script>
        for k in range(i + 1, len(tl)):
            if tl[k].strip() == '</script>':
                blk = '\n'.join(tl[i:k])
                if 'openImporterView' in blk:
                    scr_start, scr_end = i, k
                break
        if scr_start is not None:
            break
inline_body = '\n'.join(tl[scr_start + 1:scr_end])  # 不含外层 <script></script>
inline_iife = '<script>\n(function(){\n' + inline_body + '\n})();\n</script>'

# importer.js 脚本标签（取当前 ?v= 值）
imp_js_line = next(l for l in tl if 'assets/importer.js' in l)
REPORT.append('抽取: style=%d字符, #importerView L%d-%d, 内联脚本 L%d-%d, importer.js 标签=%s'
              % (len(style_block), iv_start + 1, iv_end + 1, scr_start + 1, scr_end + 1, imp_js_line.strip()))

# ---------- 改 更多.html ----------
m = read(MORE)
ml = m.split('\n')

# 删 3 卡
for sub in ["location.href='AI.html'", "location.href='工具.html'", "location.href='动态.html'"]:
    ml, ok = delete_card(ml, sub)
    REPORT.append('更多.html 删卡 %s: %s' % (sub, 'OK' if ok else '!!未找到'))

# 删相关注释
ml, rc = delete_comment_lines(ml, 'AI 问答页入口', 'W3-T1', '内容直达仅保留学习动态', '学习动态 改名')
REPORT.append('更多.html 删注释行: %d' % rc)

# 尾加 3 卡（放在 morepage-list 闭合 </div> 之前）
list_open = next(i for i, l in enumerate(ml) if 'class="morepage-list"' in l)
list_close = balanced_close(ml, list_open)
new_cards = '''          <div class="morepage-card morepage-list-item" onclick="openImporterView()">
            <div class="mpc-icon"><span class="nav-icon" data-icon="inbox" data-icon-size="20"></span></div>
            <div class="mpc-title">导入题库</div>
            <div class="mpc-desc">Excel/CSV 一键导入</div>
          </div>
          <div class="morepage-card morepage-list-item" onclick="location.href='AI模拟面试.html'">
            <div class="mpc-icon"><span class="nav-icon" data-icon="mic" data-icon-size="20"></span></div>
            <div class="mpc-title">AI面试</div>
            <div class="mpc-desc">多轮追问模拟面试</div>
          </div>
          <div class="morepage-card morepage-list-item" onclick="if(window.openQuest){openQuest()}else{location.href='学习工作台.html'}">
            <div class="mpc-icon"><span class="nav-icon" data-icon="zap" data-icon-size="20"></span></div>
            <div class="mpc-title">穿越英语</div>
            <div class="mpc-desc">闯关式剧情学英语</div>
          </div>'''
ml.insert(list_close, new_cards)
REPORT.append('更多.html 尾加 3 卡（导入题库/AI面试/穿越英语，span 嵌套图标）')

# #impLibs 放 morepage-list 闭合之后（list_close 因插入已+1，重新定位）
# 重新找 list 闭合
list_close2 = balanced_close(ml, list_open)
ml.insert(list_close2 + 1, '        <div class="imp-libs" id="impLibs"></div>')
REPORT.append('更多.html 插入 #impLibs（morepage-list 之后）')

# <style> 进 head（</head> 之前）
for i, l in enumerate(ml):
    if l.strip() == '</head>':
        ml.insert(i, style_block)
        break
REPORT.append('更多.html <style> 进 head')

# importer.js 进 defer 队列（study-stats.js 之后）
for i, l in enumerate(ml):
    if 'assets/study-stats.js' in l:
        ml.insert(i + 1, imp_js_line.rstrip())
        break
REPORT.append('更多.html importer.js 进 defer 队列')

# #importerView + 内联脚本 放页面末尾区域（<!-- 底部导航 之前）
for i, l in enumerate(ml):
    if '<!-- 底部导航' in l:
        ml.insert(i, importer_view_block + '\n\n' + inline_iife)
        break
REPORT.append('更多.html 插入 #importerView + 内联脚本(IIFE)')

io.open(MORE, 'w', encoding='utf-8-sig').write('\n'.join(ml))
REPORT.append('更多.html 写盘完成')

# ---------- 改 工具.html ----------
tl2 = t.split('\n')
for sub in ['openImporterView()', "location.href='AI模拟面试.html'", 'if(window.openQuest)']:
    tl2, ok = delete_card(tl2, sub)
    REPORT.append('工具.html 删卡 %s: %s' % (sub, 'OK' if ok else '!!未找到'))

# 删穿越英语上方那条“必须保留”注释（现已删卡，注释失真）
tl2, rc2 = delete_comment_lines(tl2, '穿越英语')
REPORT.append('工具.html 删失效注释(穿越英语): %d' % rc2)

# 更新顶部注释（L124-126 区域）：把“工具卡片纵向列表”那段说明改为“无入口保留页”
new_head_comment = '''        <!-- 【20260916L】工具页已变为「无入口保留页」：导入题库 / AI面试 / 穿越英语 三张入口卡已迁移至「更多」页，
             本页仅保留导入向导依赖（<style> / #importerView / #impLibs / importer.js / 内联脚本），
             保证 assets/importer.js 的宿主契约与导入功能不报错；卡片入口统一在更多页管理。 -->'''
for i, l in enumerate(tl2):
    if '工具卡片纵向列表' in l:
        # 该注释跨多行（到含 "面试题库 / 四级词汇两张直达卡整块删除" 的行结束）
        j = i
        while j < len(tl2) and '整块删除' not in tl2[j]:
            j += 1
        del tl2[i:j + 1]
        tl2.insert(i, new_head_comment)
        REPORT.append('工具.html 更新顶部注释为「无入口保留页」')
        break

io.open(TOOLS, 'w', encoding='utf-8-sig').write('\n'.join(tl2))
REPORT.append('工具.html 写盘完成')

io.open(r'C:\Users\ATM\_migrate_out.txt', 'w', encoding='utf-8').write('\n'.join(REPORT))
print('migrate done')
