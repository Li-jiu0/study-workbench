# -*- coding: utf-8 -*-
"""R91-D 编辑脚本：xt-aiusage.js 模型排序 chips 组加收放壳 + ai-settings.html 版本号。
LF 行尾，二进制读写，逐条唯一命中断言，写后回读校验。结果 → tools/qa/r91d_edit_result.txt
"""
import os

ROOT = r'D:\下载的文件\学习工作台'
JS = os.path.join(ROOT, 'assets', 'xt-aiusage.js')
HTML = os.path.join(ROOT, 'ai-settings.html')
OUT = os.path.join(ROOT, 'tools', 'qa', 'r91d_edit_result.txt')

log = []
def w(s):
    log.append(str(s))

def lf_stats(data):
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
    return crlf, lone_cr  # 剩余 \n 均视为 lone LF（纯 LF 时 = 总行数）

def rep(data, old, new, name):
    cnt = data.count(old)
    if cnt != 1:
        raise SystemExit('ABORT: %s count=%d' % (name, cnt))
    nd = data.replace(old, new, 1)
    w('[OK] %s (old %d B -> new %d B)' % (name, len(old), len(new)))
    return nd

def J(*lines):
    return ('\n'.join(lines) + '\n').encode('utf-8')

# ================= xt-aiusage.js =================
with open(JS, 'rb') as f:
    j0 = f.read()
c0, r0 = lf_stats(j0)
w('xt-aiusage.js BEFORE: size=%d crlf=%d loneCR=%d (expect 0/0 => pure LF)' % (len(j0), c0, r0))
if c0 or r0:
    raise SystemExit('ABORT: xt-aiusage.js 行尾非纯 LF，拒绝编辑')

# E1 skeleton：排序 chips 包进 foldrow + foldbody（默认收起；chips 原样保留）
e1_old = J(
"""          '<div class="xt-us-sublabel"><span>按模型单独列出</span></div>' +""",
"""          '<div class="xt-us-sublabel"><span>排序方式</span></div>' +""",
"""          '<div class="xt-us-chips" id="UsageQuotaSortBar">' +""",
"""            '<button type="button" class="xt-us-chip active" data-quota-sort="remaining">剩余可用量（少 → 多）</button>' +""",
"""            '<button type="button" class="xt-us-chip" data-quota-sort="remainingDesc">剩余可用量（多 → 少）</button>' +""",
"""            '<button type="button" class="xt-us-chip" data-quota-sort="used">已使用量（多 → 少）</button>' +""",
"""            '<button type="button" class="xt-us-chip" data-quota-sort="quota">资源配额（大 → 小）</button>' +""",
"""            '<button type="button" class="xt-us-chip" data-quota-sort="name">模型名称</button>' +""",
"""          "</div>" +""",
).rstrip(b'\n')
e1_new = J(
"""          '<div class="xt-us-sublabel"><span>按模型单独列出</span></div>' +""",
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

# E2 标签映射 + 同步函数（紧随 QUOTA_FILTER_LABEL / syncQuotaFilterLabel 之后）
e2_old = J(
"""  var QUOTA_FILTER_LABEL = { all: "全部", exhausted: "已耗尽", low: "剩余不足 10%", unknown: "额度未知" };""",
"""  function syncQuotaFilterLabel() {""",
"""    setText("UsageQuotaFilterCur", QUOTA_FILTER_LABEL[state.quotaFilter] || "全部");""",
"""  }""",
).rstrip(b'\n')
e2_new = J(
"""  var QUOTA_FILTER_LABEL = { all: "全部", exhausted: "已耗尽", low: "剩余不足 10%", unknown: "额度未知" };""",
"""  function syncQuotaFilterLabel() {""",
"""    setText("UsageQuotaFilterCur", QUOTA_FILTER_LABEL[state.quotaFilter] || "全部");""",
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
).rstrip(b'\n')

# E3 renderAll 里同步当前排序值
e3_old = b'    syncQuotaFilterLabel();\n'
e3_new = J(
"""    syncQuotaFilterLabel();""",
"""    syncQuotaSortLabel();   /* R91-D：行尾同步显示当前模型排序值 */""",
)

# E4 新增 bindQuotaSortFold（照 bindQuotaFilterFold 范式，局部 var 捕获 DOM）
e4_old = b'  function bindMore() {\n'
e4_new = J(
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

# E5 bind() 里挂上新绑定
e5_old = b'    bindQuotaFilterFold();\n'
e5_new = J(
"""    bindQuotaFilterFold();""",
"""    bindQuotaSortFold();""",
)

j = j0
j = rep(j, e1_old, e1_new, 'E1 skeleton foldrow shell')
j = rep(j, e2_old, e2_new, 'E2 QUOTA_SORT_LABEL + syncQuotaSortLabel')
j = rep(j, e3_old, e3_new, 'E3 renderAll sync call')
j = rep(j, e4_old, e4_new, 'E4 bindQuotaSortFold fn')
j = rep(j, e5_old, e5_new, 'E5 bind() hook')

with open(JS, 'wb') as f:
    f.write(j)
with open(JS, 'rb') as f:
    j1 = f.read()
c1, r1 = lf_stats(j1)
w('xt-aiusage.js AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(j1), c1, r1, len(j1)-len(j0)))
if c1 or r1 or j1 != j:
    raise SystemExit('ABORT: xt-aiusage.js 写后校验失败')
w('[OK] xt-aiusage.js 回读一致，纯 LF')

# ================= ai-settings.html =================
with open(HTML, 'rb') as f:
    h0 = f.read()
hc0, hr0 = lf_stats(h0)
w('ai-settings.html BEFORE: size=%d crlf=%d loneCR=%d (expect 0/0 => pure LF)' % (len(h0), hc0, hr0))
if hc0 or hr0:
    raise SystemExit('ABORT: ai-settings.html 行尾非纯 LF，拒绝编辑')

h6_old = b'<script src="assets/xt-aiusage.js?v=20260918c" defer></script>'
h6_new = b'<script src="assets/xt-aiusage.js?v=20260918e" defer></script>'
h = rep(h0, h6_old, h6_new, 'E6 version bump 20260918c -> 20260918e')

with open(HTML, 'wb') as f:
    f.write(h)
with open(HTML, 'rb') as f:
    h1 = f.read()
hc1, hr1 = lf_stats(h1)
w('ai-settings.html AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(h1), hc1, hr1, len(h1)-len(h0)))
if hc1 or hr1 or h1 != h:
    raise SystemExit('ABORT: ai-settings.html 写后校验失败')
w('[OK] ai-settings.html 回读一致，纯 LF')

# ================= 命中核验 =================
checks = [
    ('js: UsageQuotaSortToggle >=1', j1.count(b'UsageQuotaSortToggle') >= 1),
    ('js: UsageQuotaSortFold >=1', j1.count(b'UsageQuotaSortFold') >= 1),
    ('js: UsageQuotaSortCur >=1', j1.count(b'UsageQuotaSortCur') >= 1),
    ('js: bindQuotaSortFold def+call =2', j1.count(b'bindQuotaSortFold') == 2),
    ('js: UsageQuotaSortBar 保留 =1', j1.count(b'id="UsageQuotaSortBar"') == 1),
    ('js: 5 个 data-quota-sort chips 保留 =5', j1.count(b'data-quota-sort=') == 5),
    ('js: bindQuotaFilterFold 未受影响', j1.count(b'bindQuotaFilterFold') == 2),
    ('html: 旧版本号 20260918c =0', h1.count(b'20260918c') == 0),
    ('html: 新版本号 20260918e =1', h1.count(b'?v=20260918e') == 1),
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
