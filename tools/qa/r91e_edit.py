# -*- coding: utf-8 -*-
"""R91-E 编辑脚本：
A) xt-aiusage.js：R91-D 收放壳推倒 → 模型级排序改 #UsageQuotaSortSel 下拉（LF）
B) ai-settings.html：xt-aiusage.js 版本号 e -> f（LF）
C) 朋友圈发布.html：删 #xtmLocBtn「位置」按钮（CRLF）
D) assets/xt-moments.js：同步清理 locBtn 死引用（CRLF）
二进制读写、逐条唯一命中断言、写后回读校验纯行尾。结果 → tools/qa/r91e_edit_result.txt
"""
import os

ROOT = r'D:\下载的文件\学习工作台'
JS = os.path.join(ROOT, 'assets', 'xt-aiusage.js')
HTML_SET = os.path.join(ROOT, 'ai-settings.html')
HTML_PUB = os.path.join(ROOT, '朋友圈发布.html')
JS_MOM = os.path.join(ROOT, 'assets', 'xt-moments.js')
OUT = os.path.join(ROOT, 'tools', 'qa', 'r91e_edit_result.txt')

log = []
def w(s):
    log.append(str(s))

def eol_stats(data):
    crlf = data.count(b'\r\n')
    lone_cr = 0
    idx = 0
    while True:
        i = data.find(b'\r', idx)
        if i < 0:
            break
        if data[i+1:i+2] != b'\n':
            lone_cr += 1
        idx = i + 1
    return crlf, lone_cr

def rep(data, old, new, name):
    cnt = data.count(old)
    if cnt != 1:
        raise SystemExit('ABORT: %s count=%d' % (name, cnt))
    nd = data.replace(old, new, 1)
    w('[OK] %s (old %d B -> new %d B)' % (name, len(old), len(new)))
    return nd

def J(*lines, nl=b'\n'):
    out = b''
    for x in lines:
        out += (x.encode('utf-8') if isinstance(x, str) else x) + nl
    return out

def JC(*lines):  # CRLF join, no trailing guarantee helper
    return b'\r\n'.join((x.encode('utf-8') if isinstance(x, str) else x) for x in lines)

# ================= A) xt-aiusage.js（LF） =================
with open(JS, 'rb') as f:
    j0 = f.read()
c0, r0 = eol_stats(j0)
w('xt-aiusage.js BEFORE: size=%d crlf=%d loneCR=%d (expect 0/0 pure LF)' % (len(j0), c0, r0))
if c0 or r0:
    raise SystemExit('ABORT: xt-aiusage.js 行尾非纯 LF')

# A1：收放壳 + chips -> select 下拉（option 与原 5 chips 逐字一致）
a1_old = J(
"""          '<button type="button" class="xt-us-foldrow" id="UsageQuotaSortToggle" aria-expanded="false">' +""",
"""            '<span>排序方式</span>' +""",
"""            '<span class="xt-us-foldrow-cur" id="UsageQuotaSortCur"></span>' +""",
"""            '<svg class="xt-us-arrow" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>' +""",
"""          "</button>" +""",
"""          '<div class="xt-us-foldbody" id="UsageQuotaSortFold">' +""",
"""          '<div class="xt-us-chips" id="UsageQuotaSortBar">' +""",
"""            '<button type="button" class="xt-us-chip active" data-quota-sort="remaining">剩余可用量（少 → 多）</button>' +""",
"""            '<button type="button" class="xt-us-chip" data-quota-sort="remainingDesc">剩余可用量（多 → 少）</button>' +""",
"""            '<button type="button" class="xt-us-chip" data-quota-sort="used">已使用量（多 → 少）</button>' +""",
"""            '<button type="button" class="xt-us-chip" data-quota-sort="quota">资源配额（大 → 小）</button>' +""",
"""            '<button type="button" class="xt-us-chip" data-quota-sort="name">模型名称</button>' +""",
"""          "</div>" +""",
"""          "</div>" +""",
).rstrip(b'\n')
a1_new = J(
"""          '<div class="xt-us-selectrow">' +""",
"""            '<select class="xt-us-select" id="UsageQuotaSortSel" aria-label="模型排序方式">' +""",
"""              '<option value="remaining">剩余可用量（少 → 多）</option>' +""",
"""              '<option value="remainingDesc">剩余可用量（多 → 少）</option>' +""",
"""              '<option value="used">已使用量（多 → 少）</option>' +""",
"""              '<option value="quota">资源配额（大 → 小）</option>' +""",
"""              '<option value="name">模型名称</option>' +""",
"""            '</select>' +""",
"""          "</div>" +""",
).rstrip(b'\n')

# A2：删 R91-D 的 QUOTA_SORT_LABEL / syncQuotaSortLabel 块
a2_old = J(
"""  }""",
"",
"""  /* R91-D：模型排序收放行行尾的当前值展示（与 QUOTA_FILTER_LABEL 同一口径） */""",
"""  var QUOTA_SORT_LABEL = {""",
"""    remaining: "剩余可用量（少 → 多）",""",
"""    remainingDesc: "剩余可用量（多 → 少）",""",
"""    used: "已使用量（多 → 少）",""",
"""    quota: "资源配额（大 → 小）",""",
"""    name: "模型名称\"""",
"""  };""",
"""  function syncQuotaSortLabel() {""",
"""    setText("UsageQuotaSortCur", QUOTA_SORT_LABEL[state.quotaSort] || QUOTA_SORT_LABEL.remaining);""",
"""  }""",
"",
"""  function bindFold() {""",
)
a2_new = J(
"""  }""",
"",
"""  function bindFold() {""",
)

# A3：renderAll 里 R91-D 同步行 -> select 回填（与 el.sortSel 同款）
a3_old = '    syncQuotaSortLabel();   /* R91-D：行尾同步显示当前模型排序值 */\n'.encode('utf-8')
a3_new = b'    if (el.quotaSortSel) { el.quotaSortSel.value = state.quotaSort; }\n'

# A4：删 bindQuotaSortFold 函数块
a4_old = J(
"",
"""  /* R91-D：模型排序方式收放行 —— 默认收起，点行展开 chips，交互与「筛选」收放行完全一致。""",
"""     chips 的选中逻辑 / state.quotaSort 不变，仅加壳；行内 #UsageQuotaSortCur 由""",
"""     syncQuotaSortLabel() 在每次 renderAll 后同步为当前排序值。 */""",
"""  function bindQuotaSortFold() {""",
"""    var tog = byId("UsageQuotaSortToggle");""",
"""    var fold = byId("UsageQuotaSortFold");""",
"""    if (!tog || !fold || !tog.addEventListener) return;""",
"""    tog.addEventListener("click", function () {""",
"""      var open = String(tog.className).indexOf("open") !== -1;""",
"""      if (open) {""",
"""        tog.className = "xt-us-foldrow";""",
"""        fold.className = "xt-us-foldbody";""",
"""        tog.setAttribute("aria-expanded", "false");""",
"""      } else {""",
"""        tog.className = "xt-us-foldrow open";""",
"""        fold.className = "xt-us-foldbody open";""",
"""        tog.setAttribute("aria-expanded", "true");""",
"""      }""",
"""    });""",
"""  }""",
"",
"""  function bindMore() {""",
)
a4_new = J(
"",
"""  function bindMore() {""",
)

# A5：bind() 里 chips 绑定 -> select change 监听；并删 bindQuotaSortFold() 调用
a5_old = J(
"""    // R88-A：A 口径排序 / 筛选（只影响「按模型单独列出」区块，与本机「按能力」区块互不干扰）""",
"""    bindChips("UsageQuotaSortBar", "data-quota-sort", function (v) {""",
"""      state.quotaSort = v;""",
"""      renderAll();""",
"""    });""",
)
a5_new = J(
"""    // R88-A：A 口径排序 / 筛选（只影响「按模型单独列出」区块，与本机「按能力」区块互不干扰）""",
"""    // R91-E：模型级排序改 select 下拉（与上方「排序方式」同款接线），state.quotaSort 取值集合不变""",
"""    if (el.quotaSortSel && el.quotaSortSel.addEventListener) {""",
"""      el.quotaSortSel.addEventListener("change", function () {""",
"""        state.quotaSort = el.quotaSortSel.value;""",
"""        renderAll();""",
"""      });""",
"""    }""",
)
a6_old = b'    bindQuotaFilterFold();\n    bindQuotaSortFold();\n'
a6_new = b'    bindQuotaFilterFold();\n'

# A7：cache() 引用切换
a7_old = b'    el.quotaSortBar = byId("UsageQuotaSortBar");\n'
a7_new = b'    el.quotaSortSel = byId("UsageQuotaSortSel");\n'

j = j0
j = rep(j, a1_old, a1_new, 'A1 skeleton: fold shell -> select')
j = rep(j, a2_old, a2_new, 'A2 remove QUOTA_SORT_LABEL block')
j = rep(j, a3_old, a3_new, 'A3 renderAll: sync -> select refill')
j = rep(j, a4_old, a4_new, 'A4 remove bindQuotaSortFold fn')
j = rep(j, a5_old, a5_new, 'A5 bind: chips -> select change')
j = rep(j, a6_old, a6_new, 'A6 bind: drop bindQuotaSortFold call')
j = rep(j, a7_old, a7_new, 'A7 cache: quotaSortBar -> quotaSortSel')

with open(JS, 'wb') as f:
    f.write(j)
with open(JS, 'rb') as f:
    j1 = f.read()
c1, r1 = eol_stats(j1)
w('xt-aiusage.js AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(j1), c1, r1, len(j1)-len(j0)))
if c1 or r1 or j1 != j:
    raise SystemExit('ABORT: xt-aiusage.js 写后校验失败')
w('[OK] xt-aiusage.js 回读一致，纯 LF')

# ================= B) ai-settings.html 版本号（LF） =================
with open(HTML_SET, 'rb') as f:
    h0 = f.read()
hc0, hr0 = eol_stats(h0)
w('ai-settings.html BEFORE: size=%d crlf=%d loneCR=%d (expect 0/0 pure LF)' % (len(h0), hc0, hr0))
if hc0 or hr0:
    raise SystemExit('ABORT: ai-settings.html 行尾非纯 LF')
b1_old = b'assets/xt-aiusage.js?v=20260918e'
b1_new = b'assets/xt-aiusage.js?v=20260918f'
h = rep(h0, b1_old, b1_new, 'B1 version bump e -> f')
with open(HTML_SET, 'wb') as f:
    f.write(h)
with open(HTML_SET, 'rb') as f:
    h1 = f.read()
hc1, hr1 = eol_stats(h1)
w('ai-settings.html AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(h1), hc1, hr1, len(h1)-len(h0)))
if hc1 or hr1 or h1 != h:
    raise SystemExit('ABORT: ai-settings.html 写后校验失败')
w('[OK] ai-settings.html 回读一致，纯 LF')

# ================= C) 朋友圈发布.html 删位置按钮（CRLF） =================
with open(HTML_PUB, 'rb') as f:
    p0 = f.read()
pc0, pr0 = eol_stats(p0)
w('\u670b\u53cb\u5708\u53d1\u5e03.html BEFORE: size=%d crlf=%d loneCR=%d (expect loneCR=0 pure CRLF)' % (len(p0), pc0, pr0))
if pr0:
    raise SystemExit('ABORT: 朋友圈发布.html 行尾异常')

c1_old = JC(
"""      <!-- 底部功能栏：位置 / 谁可以看 / 提醒谁看 / 所在位置（+ 视频 / 链接卡片） -->""",
"""      <div class="xtm-funcbar" id="xtmFuncbar">""",
"""        <span class="xtm-fn" id="xtmLocBtn" role="button" tabindex="0"><span class="nav-icon" data-icon="map-pin" data-icon-size="14"></span> 位置</span>""",
"""        <span class="xtm-fn" id="xtmVisBtn" role="button" tabindex="0"><span class="nav-icon" data-icon="eye" data-icon-size="14"></span> 谁可以看</span>""",
)
c1_new = JC(
"""      <!-- 底部功能栏：谁可以看 / 提醒谁看 / 所在位置（+ 视频 / 链接卡片）。R91-E：删「位置」按钮（与「所在位置」重复），保留 #xtmAtBtn -->""",
"""      <div class="xtm-funcbar" id="xtmFuncbar">""",
"""        <span class="xtm-fn" id="xtmVisBtn" role="button" tabindex="0"><span class="nav-icon" data-icon="eye" data-icon-size="14"></span> 谁可以看</span>""",
)
p = rep(p0, c1_old, c1_new, 'C1 remove xtmLocBtn node + comment update')
with open(HTML_PUB, 'wb') as f:
    f.write(p)
with open(HTML_PUB, 'rb') as f:
    p1 = f.read()
pc1, pr1 = eol_stats(p1)
w('\u670b\u53cb\u5708\u53d1\u5e03.html AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(p1), pc1, pr1, len(p1)-len(p0)))
if pr1 or p1 != p:
    raise SystemExit('ABORT: 朋友圈发布.html 写后校验失败')
w('[OK] 朋友圈发布.html 回读一致，纯 CRLF')

# ================= D) xt-moments.js 清理死引用（CRLF） =================
with open(JS_MOM, 'rb') as f:
    m0 = f.read()
mc0, mr0 = eol_stats(m0)
w('xt-moments.js BEFORE: size=%d crlf=%d loneCR=%d (expect loneCR=0 pure CRLF)' % (len(m0), mc0, mr0))
if mr0:
    raise SystemExit('ABORT: xt-moments.js 行尾异常')

d1_old = b"    var fl = $('xtmLocBtn'); if (fl) fl.className = 'xtm-fn' + (P.location ? ' on' : '');\r\n"
d1_new = b''
d2_old = JC(
"""    var locBtn = $('xtmLocBtn');""",
"""    if (locBtn) locBtn.onclick = xtmPickLocation;""",
"""    var locSelf = $('xtmAtBtn');""",
) + b'\r\n'
d2_new = JC(
"""    var locSelf = $('xtmAtBtn');""",
) + b'\r\n'

m = m0
m = rep(m, d1_old, d1_new, 'D1 remove xtmLocBtn on-class sync (dead ref)')
m = rep(m, d2_old, d2_new, 'D2 remove locBtn binding (dead ref, keep xtmPickLocation for xtmAtBtn)')

with open(JS_MOM, 'wb') as f:
    f.write(m)
with open(JS_MOM, 'rb') as f:
    m1 = f.read()
mc1, mr1 = eol_stats(m1)
w('xt-moments.js AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(m1), mc1, mr1, len(m1)-len(m0)))
if mr1 or m1 != m:
    raise SystemExit('ABORT: xt-moments.js 写后校验失败')
w('[OK] xt-moments.js 回读一致，纯 CRLF')

# ================= 命中核验 =================
checks = [
    ('js-aiusage: UsageQuotaSortSel >=1', j1.count(b'UsageQuotaSortSel') >= 1),
    ('js-aiusage: 5 个 option 逐字保留', j1.count(b'\u5269\u4f59\u53ef\u7528\u91cf\uff08\u5c11 \u2192 \u591a\uff09'.encode('utf-8')) == 1 and j1.count(b'\u6a21\u578b\u540d\u79f0'.encode('utf-8')) == 1),
    ('js-aiusage: 旧收放结构全清 0', j1.count(b'UsageQuotaSortToggle') == 0 and j1.count(b'UsageQuotaSortFold') == 0 and j1.count(b'UsageQuotaSortCur') == 0),
    ('js-aiusage: 旧裸 chips bar 清 0', j1.count(b'UsageQuotaSortBar') == 0),
    ('js-aiusage: bindQuotaSortFold 残留 0', j1.count(b'bindQuotaSortFold') == 0),
    ('js-aiusage: QUOTA_SORT_LABEL 残留 0', j1.count(b'QUOTA_SORT_LABEL') == 0),
    ('js-aiusage: data-quota-sort 残留 0', j1.count(b'data-quota-sort') == 0),
    ('js-aiusage: bindQuotaFilterFold 未受影响', j1.count(b'bindQuotaFilterFold') == 2),
    ('js-aiusage: state.quotaSort 数据链路保留', j1.count(b'state.quotaSort') >= 3),
    ('html-set: v=20260918f =1 / v=20260918e(xt-aiusage) =0', h1.count(b'xt-aiusage.js?v=20260918f') == 1 and h1.count(b'xt-aiusage.js?v=20260918e') == 0),
    ('html-pub: id="xtmLocBtn" =0', p1.count(b'id="xtmLocBtn"') == 0),
    ('html-pub: id="xtmAtBtn" 仍在', p1.count(b'id="xtmAtBtn"') == 1),
    ('html-pub: 其余功能按钮 4 个仍在', all(p1.count(('id="%s"' % x).encode('utf-8')) == 1 for x in ['xtmVisBtn', 'xtmMentionBtn', 'xtmVidBtn', 'xtmLinkBtn'])),
    ('js-mom: xtmLocBtn 引用清 0', m1.count(b'xtmLocBtn') == 0),
    ('js-mom: xtmPickLocation 保留（xtmAtBtn 仍用）', m1.count(b'function xtmPickLocation') == 1 and m1.count(b'xtmPickLocation;') >= 1),
]
allpass = True
for name, ok in checks:
    w('[%s] %s' % ('PASS' if ok else 'FAIL', name))
    if not ok:
        allpass = False
w('EDIT_ALL=%s' % ('PASS' if allpass else 'FAIL'))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(log))
print('edit-done')
