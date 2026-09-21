# -*- coding: utf-8 -*-
# R67 线2 补丁（第三轮）：
#   需求：#aiCtxUsage 圆环组件移到模型选择按钮（#aiModelBtn）左侧，紧邻显示（有效间距 4~6px）
#   顺手项：ai-page.js plainModeLabel 注释里残留的 ⚡⚖🏆 字样清掉（保持源码零命中）
# 铁律：二进制读写，ai-page.js 保 LF、AI.html 保 CRLF；每处替换必须精确命中。
# 结果写 tools/qa/r67_l2_patch3_check.txt（本机 bash stdout 捕获失效，统一落盘）
import io, os, re, sys

ROOT = r'D:\下载的文件\学习工作台'
JS   = os.path.join(ROOT, 'assets', 'ai-page.js')
HTML = os.path.join(ROOT, 'AI.html')
OUT  = os.path.join(ROOT, 'tools', 'qa', 'r67_l2_patch3_check.txt')

buf = io.StringIO()
def w(*a): buf.write(' '.join(str(x) for x in a) + '\n')
def rep(s, old, new, name, expect=1):
    cnt = s.count(old)
    w('REP', name, 'count=%d expect=%d' % (cnt, expect))
    if cnt != expect:
        w('FAIL ABORT'); flush(); sys.exit(1)
    return s.replace(old, new)
def flush():
    with open(OUT, 'w', encoding='utf-8', newline='') as f: f.write(buf.getvalue())

# ================= ai-page.js（LF） =================
s = open(JS, 'rb').read().decode('utf-8')

# 1) 注释清 Emoji 字样（纯注释，保源码 ⚡⚖🏆 零命中）
s = rep(s, '（⚡⚖🏆 等）', '（图标/Emoji 等）', 'js_comment_emoji_clean')

open(JS, 'wb').write(s.encode('utf-8'))
w('WROTE ai-page.js', len(s.encode('utf-8')), 'bytes')

# ================= AI.html（CRLF） =================
h = open(HTML, 'rb').read().decode('utf-8')

# 1) 提取 #aiCtxUsage 整行（含缩进与行尾 CRLF）
m = re.search(r'[ \t]*<span class="ai-ctx-usage" id="aiCtxUsage"[^\r\n]*\r\n', h)
if not m:
    w('FAIL span line not found'); flush(); sys.exit(1)
span_line = m.group(0)
w('SPAN line captured, len =', len(span_line), 'head =', span_line[:60])

# 2) 从原位置（模型钮之后）移除
h = rep(h, span_line, '', 'html_span_remove_old_pos')

# 3) 插入到模型钮之前（紧邻左侧）
btn = '                  <button type="button" class="ai-model-btn" id="aiModelBtn">'
h = rep(h, btn, span_line + btn, 'html_span_insert_before_model_btn')

# 4) CSS：圆环右缘 -2px 收拢与模型钮的间距（父 gap 8px→有效 6px；≤420px gap 6px→有效 4px，均落在 4~6px 口径）
old_css_rule = '.ai-ctx-usage{display:inline-flex;align-items:center;gap:3px;flex:none;line-height:1;user-select:none;cursor:help;vertical-align:middle;}'
new_css_rule = '.ai-ctx-usage{display:inline-flex;align-items:center;gap:3px;flex:none;line-height:1;user-select:none;cursor:help;vertical-align:middle;margin-right:-2px;}'
h = rep(h, old_css_rule, new_css_rule, 'html_css_margin')

# 5) CSS 块注释同步位置说明
old_css_cmt = '/* R66/N5 + R67/A/B：上下文用量紧凑圆环指示器（SVG dasharray 进度弧，兼容安卓老 WebView；整体 ~44px 内）'
new_css_cmt = '/* R66/N5 + R67/A/B/C：上下文用量紧凑圆环指示器（SVG dasharray 进度弧，兼容安卓老 WebView；整体 ~44px 内；R67/C 置于模型钮左侧紧邻）'
h = rep(h, old_css_cmt, new_css_cmt, 'html_css_comment')

open(HTML, 'wb').write(h.encode('utf-8'))
w('WROTE AI.html', len(h.encode('utf-8')), 'bytes')

# ================= 自检 =================
# DOM 顺序：aiCtxUsage 在 aiModelBtn 之前，且 aiModelBtn 后面是 aiAttachBtn
h2 = open(HTML, 'rb').read().decode('utf-8')
iu = h2.find('id="aiCtxUsage"'); ib = h2.find('id="aiModelBtn"'); ia = h2.find('id="aiAttachBtn"')
w('order check: aiCtxUsage@%d < aiModelBtn@%d < aiAttachBtn@%d' % (iu, ib, ia), '=>', (0 <= iu < ib < ia))
if not (0 <= iu < ib < ia): w('FAIL order'); 

# Emoji 零命中（两交付文件）
s2 = open(JS, 'rb').read().decode('utf-8')
w('emoji in ai-page.js:', any(c in s2 for c in '⚡⚖🏆'), '(期望 False)')
w('emoji in AI.html:', any(c in h2 for c in '⚡⚖🏆'), '(期望 False)')

# 行尾
for p, name, is_crlf in ((JS, 'ai-page.js', False), (HTML, 'AI.html', True)):
    d = open(p, 'rb').read()
    crlf = d.count(b'\r\n')
    lone_lf = d.count(b'\n') - crlf
    lone_cr = d.count(b'\r') - crlf
    w('EOL', name, 'CRLF=%d loneLF=%d loneCR=%d' % (crlf, lone_lf, lone_cr))
    if is_crlf: ok = (lone_lf == 0)
    else: ok = (crlf == 0 and lone_cr == 0)
    w('  EOL OK:', ok)

w('ALL DONE')
flush()
