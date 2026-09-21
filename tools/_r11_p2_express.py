# -*- coding: utf-8 -*-
"""R11 问题2：表达.html 删除「i人心法 · 沟通专区」双 Tab 与内容，沟通区改全高。
只做 DOM / CSS 手术，不动 assets/i-partner.js。EOL 原样保留。"""
import io, os, sys

P = r'D:\下载的文件\学习工作台\表达.html'

with open(P, 'rb') as f:
    raw = f.read()
eol = b'\r\n' if b'\r\n' in raw[:4000] else b'\n'
s = raw.decode('utf-8')
print('EOL =', 'CRLF' if eol == b'\r\n' else 'LF', '| size =', len(raw))

def idx(hay, needle, label):
    try:
        return hay.index(needle)
    except ValueError:
        print('!! ANCHOR NOT FOUND:', label, '->', needle[:70].replace('\n', '\\n'))
        sys.exit(2)

orig = s

# ---------- Op1：删除 .gq-ip-tabs 双 Tab 块，并把 #gqIpTabPartner 改成 .gq-ip-fill ----------
t_anchor = '      <div class="gq-ip-tabs"'
p_anchor = '        <div class="gq-ip-slot" id="gqIpartnerSlot"></div>'
a = idx(s, t_anchor, 'tabs start')
b = idx(s, p_anchor, 'slot line')
new_prefix = (
    '      <!-- R11（2026-09-21 用户要求）：原「i人伙伴团 / i人心法 · 沟通专区」双 Tab 已删除，\n'
    '           标签移除；#gqIpTabPartner 改为 .gq-ip-fill，由 .gq-view-scroll 的 flex 链撑满整个\n'
    '           面板高度，呈现私聊式全屏会话。i-partner.js 仍把 #ipMask 挂进 #gqIpartnerSlot。 -->\n'
    '      <div id="gqIpTabPartner" class="gq-ip-fill" role="tabpanel">\n'
)
s = s[:a] + new_prefix + s[b:]
print('Op1 ok: tabs block removed, partner pane -> .gq-ip-fill')

# ---------- Op2：删除 #gqIpTabMind 整个 panel ----------
m_anchor = '      <div id="gqIpTabMind" class="gq-ip-panel" role="tabpanel">'
m = idx(s, m_anchor, 'mind panel start')
end_seq = '    </div>\n  </div>\n'
if eol == b'\r\n':
    end_seq = end_seq.replace('\n', '\r\n')
e = idx(s[m:], end_seq, 'mind panel end(4sp/2sp)') + m
removed = s[m:e]
assert 'gq-mindset' in removed and 'i人心法' in removed, 'removed block sanity failed'
assert 'openGqCasesView' not in removed and 'gqCasesSlot' not in removed, 'removed too much!'
s = s[:m] + s[e:]
print('Op2 ok: #gqIpTabMind panel removed (%d chars, %d lines)' % (len(removed), removed.count('\n')))

# ---------- Op3：CSS ----------
reps = [
    # sticky 规则（.gq-ip-tabs）整组删除
    ("""  /* 【2026-09-21 用户反馈】②双 Tab 吸顶：切到「i人心法 · 沟通专区」后内容很长（7 张卡），
     Tab 条原来跟着内容一起滚走，看起来像被内容页"压住"。改为 sticky 常驻滚动容器顶部。 */
  .gq-ip-tabs{position:sticky;top:0;z-index:12;background:var(--bg);padding:8px 0}

  /* i人心法（原「i人专区」内容并入）：图标+标题+正文的卡宫格 */
  .gq-mindset{margin-bottom:20px}
  .gq-mindset-head{display:flex;align-items:center;gap:8px;margin:0 0 4px;font-size:16px;font-weight:800;color:var(--text)}
  .gq-mindset-head .nav-icon{color:var(--primary)}
  .gq-mindset-sub{font-size:var(--xt-font-sm);color:var(--text-secondary);margin:0 0 12px}
  .gq-mindset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
  .gq-mindset-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px;transition:border-color .15s,transform .15s}
  .gq-mindset-card:hover{border-color:var(--primary);transform:translateY(-2px)}
  .gq-mindset-ic{width:34px;height:34px;border-radius:10px;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;margin-bottom:10px}
  .gq-mindset-t{font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px}
  .gq-mindset-b{font-size:13px;line-height:1.7;color:var(--text-secondary)}
""",
     """  /* R11：原「i人心法 · 沟通专区」Tab 及其卡宫格 CSS 已随内容一并删除（2026-09-21）。 */
"""),
    # .gq-ip-slot 首处定义：去掉盒中盒限高
    ("""  .gq-ip-slot{position:relative;height:min(640px,72vh);min-height:480px;margin:0 0 20px;border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--card);box-shadow:0 6px 18px -8px rgba(0,0,0,.12)}""",
     """  /* R11：i人伙伴团沟通区改全高铺满（原盒中盒限高 min(640px,72vh) 已去掉），链路：
     .gq-view(固定全屏) > .gq-view-scroll(flex列/100%) > .gq-ip-fill(flex:1) > .gq-ip-slot(flex:1)
     > #ipMask(absolute inset:0) > .ip-panel(100%)。 */
  .gq-ip-fill{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
  .gq-ip-slot{position:relative;flex:1 1 auto;min-height:0;margin:0;border:none;border-radius:0;overflow:hidden;background:transparent;box-shadow:none}"""),
    # .gq-view-scroll 占满高度
    ("""  .gq-view-scroll{padding:16px;display:flex;flex-direction:column;gap:16px}
  .gq-ip-slot{flex:none;margin:0}
  .gq-mindset{margin-bottom:0}
  .gq-mindset-head{margin:0 0 8px}
  .gq-mindset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
  .gq-mindset-card{display:flex;flex-direction:column;height:100%;padding:16px;box-sizing:border-box}
  .gq-mindset-ic{flex:none;margin:0 0 12px}
  .gq-mindset-t{margin:0 0 8px;line-height:1.4}
  .gq-mindset-b{flex:1 1 auto;margin:0}

  /* 【R104 项2】i人伙伴团 · 页内双 Tab（参照 mock_exam.html 合并页范式：同款类名 + .open 显隐语义） */
  .gq-ip-tabs{display:flex;gap:6px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:4px;width:fit-content;max-width:100%}
  .gq-ip-tab{border:none;background:transparent;padding:8px 14px;border-radius:9px;font-size:13px;font-weight:600;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;gap:6px;line-height:1.4}
  .gq-ip-tab.on{background:var(--primary);color:#fff}
  .gq-ip-tab:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
  .gq-ip-panel{display:none}
  .gq-ip-panel.open{display:block}
""",
     """  /* R11：滚动容器改为占满面板剩余高度（原 padding:16px + gap:16px 的卡列表布局随 Tab 一并去掉）。 */
  .gq-view-scroll{height:100%;min-height:0;padding:0;gap:0;overflow:hidden;display:flex;flex-direction:column}
"""),
]

for old, new in reps:
    if eol == b'\r\n':
        old = old.replace('\n', '\r\n'); new = new.replace('\n', '\r\n')
    if old not in s:
        print('!! CSS REPL NOT FOUND (first 90 chars):', old[:90].replace('\n', '\\n'))
        sys.exit(3)
    s = s.replace(old, new, 1)
print('Op3 ok: CSS blocks replaced')

# ---------- Op4：≤560px 媒体查询里的 .gq-ip-slot / tabs 规则 ----------
old_mq = """    /* 【2026-09-21 用户反馈】手机端伙伴团槽位从 72vh 盒中盒改为几乎占满面板（减去顶栏+Tab条），
       对话/选择区可用高度显著增加；选择页头部文案压缩，把空间还给内容。 */
    .gq-ip-slot{height:calc(100vh - 180px);height:calc(100dvh - 180px);min-height:420px;border-radius:12px}"""
new_mq = """    /* R11：手机端沟通区不再用固定高度（Tab 已删，改由 flex 链撑满面板），仅保留头部文案压缩。 */
    .gq-ip-slot{height:auto;flex:1 1 auto;min-height:0;border-radius:0}"""
old_mq2 = """    .gq-ip-tabs{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
    .gq-ip-tab{white-space:nowrap}
"""
for old, new in [(old_mq, new_mq), (old_mq2, '')]:
    if eol == b'\r\n':
        old = old.replace('\n', '\r\n'); new = new.replace('\n', '\r\n')
    if old not in s:
        print('!! MQ REPL NOT FOUND:', old[:80].replace('\n', '\\n'))
        sys.exit(4)
    s = s.replace(old, new, 1)
print('Op4 ok: mobile media-query rules updated')

# ---------- Op5：删除 switchGqIpTab 函数 ----------
f_start = idx(s, '  /* ---------- ③ i人伙伴团 · 页内双 Tab（R104 项2；参照 mock_exam.html switchMockTab） ----------', 'switch fn comment')
f_end_anchor = '  function setup() {'
f_end = idx(s, f_end_anchor, 'setup() start')
assert 'switchGqIpTab' in s[f_start:f_end] and 'setup' not in s[f_start:f_end], 'switch fn span sanity failed'
s = s[:f_start] + '  /* R11：switchGqIpTab 已删除——「i人心法 · 沟通专区」Tab 与内容按用户要求移除（2026-09-21），\n     沟通区改为全高常显，不再需要 Tab 切换。 */\n\n' + s[f_end:]
print('Op5 ok: switchGqIpTab removed')

assert len(s) < len(orig), 'no shrink?!'
with open(P, 'wb') as f:
    f.write(s.encode('utf-8'))
print('WROTE', P, '| %d -> %d bytes' % (len(orig.encode('utf-8')), len(s.encode('utf-8'))))
