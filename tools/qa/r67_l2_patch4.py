# -*- coding: utf-8 -*-
# R67 线2 补丁（第四轮）：
#   需求：#aiCtxUsage 圆环 hover title 缩减为只留进度信息「已用 N% · X / Y.YK」
#   （CTX_USAGE_TIP 常量及拼接删除；渲染/dasharray/阈值/位置一律不动；AI.html 静态 title 同步）
# 铁律：二进制读写，ai-page.js 保 LF、AI.html 保 CRLF；每处替换必须精确命中 1 次。
# 结果写 tools/qa/r67_l2_patch4_check.txt
import io, os, sys

ROOT = r'D:\下载的文件\学习工作台'
JS   = os.path.join(ROOT, 'assets', 'ai-page.js')
HTML = os.path.join(ROOT, 'AI.html')
OUT  = os.path.join(ROOT, 'tools', 'qa', 'r67_l2_patch4_check.txt')

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

# 1) 删除 CTX_USAGE_TIP 常量块，替换为一行 R67/D 注释
old_tip = (
"  /* R67/B hover 悬浮说明（升级）：估算口径 + 阈值变色含义；具体数值（已用/百分比/上限）由 renderCtxUsage 动态拼接 */\n"
"  var CTX_USAGE_TIP = '估算值：中文约 1 字≈1 token、非中文约 4 字符≈1 token；上限随当前模式/模型动态变化；' +\n"
"    '用量超过 80% 变橙色提醒，超过 95% 变红色预警';\n"
)
new_tip = (
"  /* R67/D：hover 提示只留进度信息（已用 N% · X / Y.YK）；估算与阈值说明按用户要求移除（原 CTX_USAGE_TIP 常量已删） */\n"
)

# 2) renderCtxUsage 头注释第二行同步
old_cmt = "     完整信息（上下文已用 N（X.X%），上限 Y.YK）放 title 悬浮；阈值沿用 R66：>80% 橙（warn）、>95% 红（hot）。 */"
new_cmt = "     title 悬浮只留进度（R67/D）；阈值沿用 R66：>80% 橙（warn）、>95% 红（hot）。 */"

# 3) 删除 pctTxt（新 title 用整数百分比，不再需要 1 位小数串）
old_pct = (
"    var pct = used * 100 / (limit > 0 ? limit : 1);\n"
"    var pctTxt = pct.toFixed(1) + '%';\n"
)
new_pct = (
"    var pct = used * 100 / (limit > 0 ? limit : 1);\n"
)

# 4) title 行改短格式
old_title = "    el.title = '上下文已用 ' + Math.round(used) + '（' + pctTxt + '），上限 ' + fmtCtxLimitK(limit) + '；' + CTX_USAGE_TIP;"
new_title = (
"    /* R67/D 短提示：整数百分比 + 已用（<1000 原数 / ≥1000 K 一位小数）+ 上限 K */\n"
"    var usedTxt = (used >= 1000) ? (used / 1000).toFixed(1) + 'K' : String(Math.round(used));\n"
"    el.title = '已用 ' + Math.round(pct) + '% · ' + usedTxt + ' / ' + fmtCtxLimitK(limit);"
)

s = rep(s, old_tip, new_tip, 'js_tip_removed')
s = rep(s, old_cmt, new_cmt, 'js_render_comment')
s = rep(s, old_pct, new_pct, 'js_pctTxt_removed')
s = rep(s, old_title, new_title, 'js_title_short')
open(JS, 'wb').write(s.encode('utf-8'))
w('WROTE ai-page.js', len(s.encode('utf-8')), 'bytes')

# ================= AI.html（CRLF） =================
h = open(HTML, 'rb').read().decode('utf-8')

# 静态 span title 同步为短格式（与 JS 渲染 0%/上限 1000 的输出一致）
old_title_attr = ('title="上下文已用 0（0.0%），上限 1.0K；估算值：中文约 1 字≈1 token、非中文约 4 字符≈1 token；'
                  '上限随当前模式/模型动态变化；用量超过 80% 变橙色提醒，超过 95% 变红色预警"')
new_title_attr = 'title="已用 0% · 0 / 1.0K"'

h = rep(h, old_title_attr, new_title_attr, 'html_span_title')
open(HTML, 'wb').write(h.encode('utf-8'))
w('WROTE AI.html', len(h.encode('utf-8')), 'bytes')

# ================= 自检 =================
s2 = open(JS, 'rb').read().decode('utf-8')
h2 = open(HTML, 'rb').read().decode('utf-8')
w('CTX_USAGE_TIP in js:', 'CTX_USAGE_TIP' in s2, '(期望 False)')
w('pctTxt in js:', 'pctTxt' in s2, '(期望 False)')
w('短 title 逻辑 in js:', ("el.title = '已用 '" in s2), '(期望 True)')
for k in ['估算值', '变橙色', '变红色']:
    w("关键词'%s' in js:" % k, (k in s2), '(期望 False)')
    w("关键词'%s' in html:" % k, (k in h2), '(期望 False)')
w('html 静态短 title:', ('title="已用 0% · 0 / 1.0K"' in h2), '(期望 True)')
# 位置未动：aiCtxUsage 仍在 aiModelBtn 之前
iu = h2.find('id="aiCtxUsage"'); ib = h2.find('id="aiModelBtn"')
w('位置保持（圆环在模型钮左侧）:', (0 <= iu < ib), '(期望 True)')
# 渲染要素未动
for k in ['CTX_RING_C', 'stroke-dasharray', 'fmtCtxLimitK', 'plainModeLabel']:
    w("保留 '%s':" % k, (k in s2), '(期望 True)')

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
