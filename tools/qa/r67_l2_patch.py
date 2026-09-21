# -*- coding: utf-8 -*-
# R67 线2补丁：AI 页上下文用量新格式（X.X% · N / Y.YK 上下文已使用）+ hover 说明 + 紧凑排版
# 铁律：二进制读写，ai-page.js 保 LF、AI.html 保 CRLF；每处替换必须精确命中 1 次。
import os, sys

ROOT = r'D:\下载的文件\学习工作台'
JS   = os.path.join(ROOT, 'assets', 'ai-page.js')
HTML = os.path.join(ROOT, 'AI.html')
JS_BAK   = JS   + '.bak-pre-r67-20260916'
HTML_BAK = HTML + '.bak-pre-r67-20260916'

def backup(p, bak):
    if os.path.exists(bak):
        print('SKIP-BAK(exists):', os.path.basename(bak))
        return
    with open(p, 'rb') as f: data = f.read()
    with open(bak, 'wb') as f: f.write(data)
    print('BAK:', os.path.basename(bak), len(data), 'bytes')

def rep(s, old, new, name, expect=1):
    cnt = s.count(old)
    if cnt != expect:
        print('FAIL %s: count=%d expect=%d' % (name, cnt, expect))
        sys.exit(1)
    print('OK %s x%d' % (name, cnt))
    return s.replace(old, new)

backup(JS, JS_BAK)
backup(HTML, HTML_BAK)

# ================= ai-page.js（LF） =================
s = open(JS, 'rb').read().decode('utf-8')

old_hdr = "  /* ---------- R66/N5：上下文用量显示（已用 X / 上限） ---------- */"
new_hdr = "  /* ---------- R66/N5 + R67/A：上下文用量显示（X.X% · N / Y.YK 上下文已使用） ---------- */"

old_fn = (
"  /* 渲染用量；阈值用 CSS class 切换（warn >80% 橙 / hot >95% 红），不写内联 style */\n"
"  function renderCtxUsage() {\n"
"    var el = $('aiCtxUsage');\n"
"    if (!el) return;\n"
"    var used = ctxUsedTokens();\n"
"    var limit = getCtxLimit();\n"
"    el.textContent = '已用 ' + fmtTokenCount(used) + ' / ' + fmtTokenCount(limit);\n"
"    var ratio = (limit > 0) ? (used / limit) : 0;\n"
"    el.className = 'ai-ctx-usage' + (ratio > 0.95 ? ' hot' : (ratio > 0.8 ? ' warn' : ''));\n"
"  }\n"
)
new_fn = (
"  /* R67/A：上限恒用 K 单位、保留 1 位小数（1000→1.0K、8192→8.2K、1000000→1000.0K） */\n"
"  function fmtCtxLimitK(n) {\n"
"    n = Number(n);\n"
"    if (!isFinite(n) || n <= 0) n = 1000;\n"
"    return (n / 1000).toFixed(1) + 'K';\n"
"  }\n"
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

s = rep(s, old_hdr, new_hdr, 'js_hdr')
s = rep(s, old_fn, new_fn, 'js_renderCtxUsage')
open(JS, 'wb').write(s.encode('utf-8'))
print('WROTE ai-page.js', len(s.encode('utf-8')), 'bytes')

# ================= AI.html（CRLF） =================
h = open(HTML, 'rb').read().decode('utf-8')

# 1) 用量 span：新初始文案 + 新 hover 说明（逐行替换，规避换行假设）
old_span = '<span class="ai-ctx-usage" id="aiCtxUsage" title="当前会话上下文用量估算">已用 0 / 1k</span>'
new_span = ('<span class="ai-ctx-usage" id="aiCtxUsage" title="上下文用量为估算值（中文约 1 字≈1 token、'
            '英文约 4 字符≈1 token），非精确统计；上限随当前模式/模型动态变化；'
            '用量超过 80% 变橙色提醒，超过 95% 变红色预警。">0.0% · 0 / 1.0K 上下文已使用</span>')

# 2) 用量 CSS：line-height 放宽（允许自身占位更稳）+ cursor:help 悬浮可感知
old_css_usage_cmt = "/* R66/N5：上下文用量（灰字小字，不显眼；>80% 橙、>95% 红，用 CSS class 切换，不写内联 style） */"
new_css_usage_cmt = "/* R66/N5 + R67/A：上下文用量（灰字小字；格式 X.X% · N / Y.YK；>80% 橙、>95% 红，CSS class 切换；title 悬浮说明 + cursor:help） */"
old_css_usage = ".ai-ctx-usage{font-size:12px;color:var(--ai-muted);white-space:nowrap;flex-shrink:0;line-height:1;user-select:none;}"
new_css_usage = ".ai-ctx-usage{font-size:12px;color:var(--ai-muted);white-space:nowrap;flex-shrink:0;line-height:1.3;user-select:none;cursor:help;}"

# 3) 右侧按钮组：允许折行+收缩（R67 文案变长，窄屏不溢出、不遮挡发送按钮；折行后仍右对齐）
old_css_right = ".ai-foot-right{display:flex;align-items:center;gap:8px;flex-shrink:0;}"
new_css_right = ("/* R67/A：用量文案变长 → 右侧组允许折行+收缩（窄屏不溢出、不遮挡发送按钮；折行后仍右对齐） */\r\n"
                 ".ai-foot-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;min-width:0;flex-shrink:1;}")

# 4) ≤420px 窄屏：注释更新 + 右侧组间距收紧
old_media_cmt = "/* R66/N4-N5：窄屏输入区与模型面板防溢出（≤420px 收紧模型按钮宽度与用量字号） */"
new_media_cmt = "/* R66/N4-N5 + R67/A：窄屏输入区与模型面板防溢出（≤420px 收紧按钮宽度与用量字号、右侧组间距；折行时发送按钮仍右对齐可见） */"
old_media_usage = "  .ai-ctx-usage{font-size:11px;}"
new_media_usage = "  .ai-ctx-usage{font-size:11px;}\r\n  .ai-foot-right{gap:6px;}"

h = rep(h, old_span, new_span, 'html_span')
h = rep(h, old_css_usage_cmt, new_css_usage_cmt, 'html_css_usage_cmt')
h = rep(h, old_css_usage, new_css_usage, 'html_css_usage')
h = rep(h, old_css_right, new_css_right, 'html_css_right')
h = rep(h, old_media_cmt, new_media_cmt, 'html_media_cmt')
h = rep(h, old_media_usage, new_media_usage, 'html_media_gap')
open(HTML, 'wb').write(h.encode('utf-8'))
print('WROTE AI.html', len(h.encode('utf-8')), 'bytes')

# ================= 行尾自检 =================
for p, name, is_crlf in ((JS, 'ai-page.js', False), (HTML, 'AI.html', True)):
    d = open(p, 'rb').read()
    crlf = d.count(b'\r\n')
    lf = d.count(b'\n')
    lone_lf = lf - crlf
    lone_cr = d.count(b'\r') - crlf
    print('EOL %s: CRLF=%d loneLF=%d loneCR=%d' % (name, crlf, lone_lf, lone_cr))
    if is_crlf:
        assert lone_lf == 0, name + ' 出现裸 LF'
    else:
        assert crlf == 0 and lone_cr == 0, name + ' 出现 CR'
print('ALL DONE')
