# -*- coding: utf-8 -*-
# R67 线2 补丁（第二轮）：
#   需求一：上下文用量改紧凑 SVG 圆环指示器（dasharray 进度弧 + 旁侧超短百分比标签，~44px 内）
#   需求二：三模式行去行首图标/Emoji（label 自带 ⚡⚖🏆，ai-config.js 只读 → 渲染层剥离）
# 铁律：二进制读写，ai-page.js 保 LF、AI.html 保 CRLF；每处替换必须精确命中 1 次。
# 备份沿用第一轮的 .bak-pre-r67-20260916（真·R67 改动前原样，不覆盖）。
import os, sys

ROOT = r'D:\下载的文件\学习工作台'
JS   = os.path.join(ROOT, 'assets', 'ai-page.js')
HTML = os.path.join(ROOT, 'AI.html')

def rep(s, old, new, name, expect=1):
    cnt = s.count(old)
    if cnt != expect:
        print('FAIL %s: count=%d expect=%d' % (name, cnt, expect))
        sys.exit(1)
    print('OK %s x%d' % (name, cnt))
    return s.replace(old, new)

# ================= ai-page.js（LF） =================
s = open(JS, 'rb').read().decode('utf-8')

# 1) 区块头注释
old_hdr = "  /* ---------- R66/N5 + R67/A：上下文用量显示（X.X% · N / Y.YK 上下文已使用） ---------- */"
new_hdr = "  /* ---------- R66/N5 + R67/A/B：上下文用量显示（紧凑圆环指示器 + 悬浮完整说明） ---------- */"

# 2) CTX_USAGE_TIP 升级 + renderCtxUsage 改圆环渲染
old_fn = (
"  /* R67/A hover 悬浮说明：估算口径 + 上限动态来源 + 阈值变色含义（原生 title，与本页既有 tooltip 风格一致） */\n"
"  var CTX_USAGE_TIP = '上下文用量为估算值（中文约 1 字≈1 token、英文约 4 字符≈1 token），非精确统计；' +\n"
"    '上限随当前模式/模型动态变化；用量超过 80% 变橙色提醒，超过 95% 变红色预警';\n"
"  /* 渲染用量（R67/A 新格式：X.X% · N / Y.YK 上下文已使用；N=已用 token 整数、上限 K 一位小数）。\n"
"     阈值沿用 R66：>80% 橙（warn）、>95% 红（hot），CSS class 切换，不写内联 style。 */\n"
"  function renderCtxUsage() {\n"
"    var el = $('aiCtxUsage');\n"
"    if (!el) return;\n"
"    var used = ctxUsedTokens();\n"
"    if (!isFinite(used) || used < 0) used = 0;\n"
"    var limit = getCtxLimit();\n"
"    var ratio = (limit > 0) ? (used / limit) : 0;\n"
"    var pct = used * 100 / (limit > 0 ? limit : 1);\n"
"    el.textContent = pct.toFixed(1) + '% · ' + Math.round(used) + ' / ' + fmtCtxLimitK(limit) + ' 上下文已使用';\n"
"    el.className = 'ai-ctx-usage' + (ratio > 0.95 ? ' hot' : (ratio > 0.8 ? ' warn' : ''));\n"
"    el.title = CTX_USAGE_TIP;\n"
"  }\n"
)
new_fn = (
"  /* R67/B hover 悬浮说明（升级）：估算口径 + 阈值变色含义；具体数值（已用/百分比/上限）由 renderCtxUsage 动态拼接 */\n"
"  var CTX_USAGE_TIP = '估算值：中文约 1 字≈1 token、非中文约 4 字符≈1 token；上限随当前模式/模型动态变化；' +\n"
"    '用量超过 80% 变橙色提醒，超过 95% 变红色预警';\n"
"  /* R67/B 圆环几何常量：viewBox 24、r=9、stroke-width 2.5（SVG dasharray 方案，兼容安卓老 WebView，不用 conic-gradient） */\n"
"  var CTX_RING_C = 2 * Math.PI * 9;\n"
"  /* 渲染用量（R67/B：紧凑圆环指示器 = SVG 进度环 + 旁侧超短百分比标签，整体 ~44px 内，不再占长条文本空间）。\n"
"     完整信息（上下文已用 N（X.X%），上限 Y.YK）放 title 悬浮；阈值沿用 R66：>80% 橙（warn）、>95% 红（hot）。 */\n"
"  function renderCtxUsage() {\n"
"    var el = $('aiCtxUsage');\n"
"    if (!el) return;\n"
"    var used = ctxUsedTokens();\n"
"    if (!isFinite(used) || used < 0) used = 0;\n"
"    var limit = getCtxLimit();\n"
"    var ratio = (limit > 0) ? (used / limit) : 0;\n"
"    var pct = used * 100 / (limit > 0 ? limit : 1);\n"
"    var pctTxt = pct.toFixed(1) + '%';\n"
"    /* 进度弧长 = 百分比 × 周长；超限封顶 100% 满环（标签仍显示真实百分比，可 >100%） */\n"
"    var arc = Math.max(0, Math.min(100, ratio * 100)) / 100 * CTX_RING_C;\n"
"    el.innerHTML =\n"
"      '<svg class=\"ai-ctx-ring\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" aria-hidden=\"true\">' +\n"
"        '<circle class=\"ai-ctx-ring-bg\" cx=\"12\" cy=\"12\" r=\"9\" fill=\"none\" stroke-width=\"2.5\"></circle>' +\n"
"        '<circle class=\"ai-ctx-ring-fg\" cx=\"12\" cy=\"12\" r=\"9\" fill=\"none\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-dasharray=\"' + arc.toFixed(2) + ' ' + CTX_RING_C.toFixed(2) + '\" transform=\"rotate(-90 12 12)\"></circle>' +\n"
"      '</svg><span class=\"ai-ctx-pct\">' + Math.round(pct) + '%</span>';\n"
"    el.className = 'ai-ctx-usage' + (ratio > 0.95 ? ' hot' : (ratio > 0.8 ? ' warn' : ''));\n"
"    el.title = '上下文已用 ' + Math.round(used) + '（' + pctTxt + '），上限 ' + fmtCtxLimitK(limit) + '；' + CTX_USAGE_TIP;\n"
"  }\n"
)

# 3) 输入框标签：模式名去 Emoji
old_label = "    if (modeInfo) return modeInfo.label;   // R65：模式生效时优先显示模式名"
new_label = "    if (modeInfo) return plainModeLabel(modeInfo);   // R65：模式生效时优先显示模式名（R67/B 去图标/Emoji）"

# 4a) 三模式行：注释更新 + 新增 plainModeLabel 剥离函数
old_mode_hdr = (
"  /* ---------- R65/R66：三模式行（面板顶部；R66 已瘦身：只留标题，删掉副标题小字） ---------- */\n"
"  var MODE_ORDER = ['fast', 'balanced', 'ultimate'];\n"
)
new_mode_hdr = (
"  /* ---------- R65/R66/R67：三模式行（面板顶部；R66 删副标题小字；R67/B 删行首图标/Emoji，只留纯文字模式名） ---------- */\n"
"  var MODE_ORDER = ['fast', 'balanced', 'ultimate'];\n"
"  /* R67/B：模式名显示剥离行首装饰符号/Emoji（⚡⚖🏆 等）。ai-config.js 只读 → 剥离统一放渲染层；\n"
"     面板行（modeRow）、输入框标签（currentModelName）、切换 toast 三处共用，保证口径一致。 */\n"
"  function plainModeLabel(info) {\n"
"    var s = (info && info.label) ? String(info.label) : '';\n"
"    return s.replace(/^[^\\u4e00-\\u9fa5A-Za-z0-9]+/, '');\n"
"  }\n"
)

# 4b) modeRow 行内名称改用剥离后的纯文字
old_mode_name = "      '<div class=\"ai-mp-row-main\"><div class=\"ai-mp-name\">' + escHtml(info.label) + '</div></div>' +"
new_mode_name = "      '<div class=\"ai-mp-row-main\"><div class=\"ai-mp-name\">' + escHtml(plainModeLabel(info)) + '</div></div>' +"

# 5) 切换模式 toast 去 Emoji
old_toast = "    toast('已切到 ' + info.label);"
new_toast = "    toast('已切到 ' + plainModeLabel(info));   // R67/B：toast 同步去 Emoji，与面板/标签口径一致"

s = rep(s, old_hdr, new_hdr, 'js_hdr')
s = rep(s, old_fn, new_fn, 'js_renderCtxUsage_ring')
s = rep(s, old_label, new_label, 'js_currentModelName')
s = rep(s, old_mode_hdr, new_mode_hdr, 'js_mode_hdr')
s = rep(s, old_mode_name, new_mode_name, 'js_modeRow_name')
s = rep(s, old_toast, new_toast, 'js_selectMode_toast')
open(JS, 'wb').write(s.encode('utf-8'))
print('WROTE ai-page.js', len(s.encode('utf-8')), 'bytes')

# ================= AI.html（CRLF） =================
h = open(HTML, 'rb').read().decode('utf-8')

# 1) 用量 CSS：整块替换为圆环指示器样式（多行，\r\n 连接）
old_css = (
"/* R66/N5 + R67/A：上下文用量（灰字小字；格式 X.X% · N / Y.YK；>80% 橙、>95% 红，CSS class 切换；title 悬浮说明 + cursor:help） */\r\n"
".ai-ctx-usage{font-size:12px;color:var(--ai-muted);white-space:nowrap;flex-shrink:0;line-height:1.3;user-select:none;cursor:help;}\r\n"
".ai-ctx-usage.warn{color:#e8890c;}\r\n"
".ai-ctx-usage.hot{color:#e0504d;font-weight:600;}"
)
new_css = (
"/* R66/N5 + R67/A/B：上下文用量紧凑圆环指示器（SVG dasharray 进度弧，兼容安卓老 WebView；整体 ~44px 内）\r\n"
"   正常态主题蓝；>80% 橙（warn）、>95% 红（hot）沿 CSS class 切换；完整信息在 title 悬浮 + cursor:help */\r\n"
".ai-ctx-usage{display:inline-flex;align-items:center;gap:3px;flex:none;line-height:1;user-select:none;cursor:help;vertical-align:middle;}\r\n"
".ai-ctx-ring{display:block;flex:none;}\r\n"
".ai-ctx-ring-bg{stroke:var(--ai-border);}\r\n"
".ai-ctx-ring-fg{stroke:var(--ai-blue);transition:stroke .15s;}\r\n"
".ai-ctx-pct{font-size:10px;color:var(--ai-muted);white-space:nowrap;flex:none;}\r\n"
".ai-ctx-usage.warn .ai-ctx-ring-fg{stroke:#e8890c;}\r\n"
".ai-ctx-usage.warn .ai-ctx-pct{color:#e8890c;}\r\n"
".ai-ctx-usage.hot .ai-ctx-ring-fg{stroke:#e0504d;}\r\n"
".ai-ctx-usage.hot .ai-ctx-pct{color:#e0504d;font-weight:600;}"
)

# 2) ≤420px 窄屏：间距/字号收紧
old_media_usage = "  .ai-ctx-usage{font-size:11px;}"
new_media_usage = "  .ai-ctx-usage{gap:2px;}\r\n  .ai-ctx-pct{font-size:9px;}"

# 3) 媒体查询注释同步
old_media_cmt = "/* R66/N4-N5 + R67/A：窄屏输入区与模型面板防溢出（≤420px 收紧按钮宽度与用量字号、右侧组间距；折行时发送按钮仍右对齐可见） */"
new_media_cmt = "/* R66/N4-N5 + R67/A/B：窄屏输入区与模型面板防溢出（≤420px 收紧按钮宽度、圆环间距与百分比字号、右侧组间距；折行时发送按钮仍右对齐可见） */"

# 4) 用量 span：静态初始改为圆环结构（与 JS 渲染 0%/上限 1.0K 的输出一致）
old_span = ('<span class="ai-ctx-usage" id="aiCtxUsage" title="上下文用量为估算值（中文约 1 字≈1 token、英文约 4 字符≈1 token），'
            '非精确统计；上限随当前模式/模型动态变化；用量超过 80% 变橙色提醒，超过 95% 变红色预警。">0.0% · 0 / 1.0K 上下文已使用</span>')
new_span = ('<span class="ai-ctx-usage" id="aiCtxUsage" title="上下文已用 0（0.0%），上限 1.0K；'
            '估算值：中文约 1 字≈1 token、非中文约 4 字符≈1 token；上限随当前模式/模型动态变化；'
            '用量超过 80% 变橙色提醒，超过 95% 变红色预警">'
            '<svg class="ai-ctx-ring" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">'
            '<circle class="ai-ctx-ring-bg" cx="12" cy="12" r="9" fill="none" stroke-width="2.5"></circle>'
            '<circle class="ai-ctx-ring-fg" cx="12" cy="12" r="9" fill="none" stroke-width="2.5" stroke-linecap="round" '
            'stroke-dasharray="0.00 56.55" transform="rotate(-90 12 12)"></circle></svg>'
            '<span class="ai-ctx-pct">0%</span></span>')

h = rep(h, old_css, new_css, 'html_css_ring_block')
h = rep(h, old_media_usage, new_media_usage, 'html_media_usage')
h = rep(h, old_media_cmt, new_media_cmt, 'html_media_cmt')
h = rep(h, old_span, new_span, 'html_span_ring')
open(HTML, 'wb').write(h.encode('utf-8'))
print('WROTE AI.html', len(h.encode('utf-8')), 'bytes')

# ================= 行尾自检 =================
for p, name, is_crlf in ((JS, 'ai-page.js', False), (HTML, 'AI.html', True)):
    d = open(p, 'rb').read()
    crlf = d.count(b'\r\n')
    lone_lf = d.count(b'\n') - crlf
    lone_cr = d.count(b'\r') - crlf
    print('EOL %s: CRLF=%d loneLF=%d loneCR=%d' % (name, crlf, lone_lf, lone_cr))
    if is_crlf:
        assert lone_lf == 0, name + ' 出现裸 LF'
    else:
        assert crlf == 0 and lone_cr == 0, name + ' 出现 CR'
print('ALL DONE')
