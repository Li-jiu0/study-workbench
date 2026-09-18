# -*- coding: utf-8 -*-
"""L7-2 应用改造：assets/iv-prep.js（与 AI模拟面试.html 同口径的六阶段 / 五段词汇）
文件为 LF + 无 BOM，保持原样写回。
"""
P = r'D:\下载的文件\学习工作台\assets\iv-prep.js'
raw = open(P, 'rb').read()
assert raw[:3] != b'\xef\xbb\xbf', 'unexpected BOM'
assert raw.count(b'\r\n') == 0, 'unexpected CRLF'
s = raw.decode('utf-8')
N = 0


def rep(old, new, count=1):
    global s
    global N
    got = s.count(old)
    assert got == count, 'EDIT#%d expect %d got %d :: %r' % (N, count, got, old[:70])
    s = s.replace(old, new)
    N += 1


# ---------------------------------------------------------------- 1. 头部说明
rep(
    """   iv-prep.js · A4「面试 · 面试准备」渲染器（v2）
   批次：2026-09-14 / R48「做真内容」第 3 批 / 版本戳 20260914e
""",
    """   iv-prep.js · A4「面试 · 面试准备」渲染器（v2）
   批次：2026-09-14 / R48「做真内容」第 3 批 / 版本戳 20260914e
   N9-19（20260916w3）追加：与 AI模拟面试.html 对齐「六阶段状态机 + 五段状态条」口径——
     · 每个题目卡尾部新增「⑤ 五段流程」预览（读题→准备→回答→提交→点评）；
     · 交接载荷沿用 ?q=<题干>，由 AI模拟面试.html 作为第 1 题载入并进入 reading 阶段；
     · 六阶段词汇经 window.IV_STAGES / window.IV_BAR_STAGES / window.IV_STAGE_LABEL
       共享（仅在未定义时写入，绝不覆盖宿主页已有的同名定义）。本文件不含状态条本身。
""")

# ---------------------------------------------------------------- 2. 常量 + 函数
rep(
    """  var MIN_ANSWER = 20;         // 计入「已练」的最少字数
  var OPEN_MAP = {};           // 手风琴展开态（会话内）
""",
    """  var MIN_ANSWER = 20;         // 计入「已练」的最少字数
  var OPEN_MAP = {};           // 手风琴展开态（会话内）

  /* ---------- 六阶段状态机 / 五段状态条（与 AI模拟面试.html 同一套口径） ----------
     六阶段：setup → reading → preparing → answering → submitting → reviewing（+ 终态 eval）
     五段状态条：读题 / 准备 / 回答 / 提交 / 点评 —— 逐题走一遍
     本文件只做「词汇统一 + 交接载荷 + 流程预览」，状态条与推进逻辑在 AI模拟面试.html 内。
     页面若同时加载本文件与 AI模拟面试.html，两边共享 window.IV_* 词汇。 */
  var IV_MACHINE_CLIENT = ['setup', 'reading', 'preparing', 'answering', 'submitting', 'reviewing'];
  var IV_BAR_STAGES_CLIENT = ['reading', 'preparing', 'answering', 'submitting', 'reviewing'];
  var IV_TERMINAL_CLIENT = 'eval';
  var IV_STAGE_LABELS_CLIENT = {
    'setup': '面试准备',
    'reading': '读题',
    'preparing': '准备',
    'answering': '回答',
    'submitting': '提交',
    'reviewing': '点评',
    'eval': '评定报告'
  };
  /* 三条可回退路径（其余阶段不可跳过；与 AI模拟面试.html 的 IV_TRANSITIONS 一致） */
  var IV_BACK_PATHS_CLIENT = [
    'preparing->reading',
    'answering->preparing',
    'reviewing->answering'
  ];

  /** 把六阶段词汇共享给同域脚本；已存在则不改（防覆盖宿主页的定义）。 */
  function IP_shareStages() {
    if (typeof window.IV_STAGES === 'undefined') window.IV_STAGES = IV_MACHINE_CLIENT.slice(0);
    if (typeof window.IV_BAR_STAGES === 'undefined') window.IV_BAR_STAGES = IV_BAR_STAGES_CLIENT.slice(0);
    if (typeof window.IV_STAGE_LABEL === 'undefined') window.IV_STAGE_LABEL = IV_STAGE_LABELS_CLIENT;
    if (typeof window.IV_TERMINAL === 'undefined') window.IV_TERMINAL = IV_TERMINAL_CLIENT;
  }

  /** 五段状态条预览（纯展示，与 AI模拟面试.html 的 .stage-bar 同序同色）。 */
  function IP_stageLegend() {
    var h = '<div class="ip-flow">';
    var i;
    for (i = 0; i < IV_BAR_STAGES_CLIENT.length; i++) {
      h += '<span class="ip-flow-seg"><span class="ip-flow-n">' + (i + 1) + '</span>' +
        IP_esc(IV_STAGE_LABELS_CLIENT[IV_BAR_STAGES_CLIENT[i]]) + '</span>';
      if (i < IV_BAR_STAGES_CLIENT.length - 1) h += '<span class="ip-flow-line"></span>';
    }
    h += '</div>';
    return h;
  }
""")

# ---------------------------------------------------------------- 3. 样式
rep(
    """    '.ip-legacy{border-top:1px dashed var(--border,#E8ECF0);padding-top:12px}',
""",
    """    '.ip-flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:2px 0 10px}',
    '.ip-flow-seg{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary,#6B7280);padding:3px 9px;border-radius:999px;background:var(--bg,#F5F7FA);border:1px solid var(--border,#E8ECF0)}',
    '.ip-flow-n{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:var(--primary,#5B8DEF);color:#fff;font-size:10px;font-weight:700}',
    '.ip-flow-line{width:12px;height:1px;background:var(--border,#E8ECF0)}',
    '.ip-legacy{border-top:1px dashed var(--border,#E8ECF0);padding-top:12px}',
""")

# ---------------------------------------------------------------- 4. ② 的 AI 按钮文案
rep(
    """        IP_icon('bot', 14) + '<em>去 AI 模拟面试练这道题</em></button>';
""",
    """        IP_icon('bot', 14) + '<em>去 AI 模拟面试练这道题（五段流程）</em></button>';
""")

# ---------------------------------------------------------------- 5. ④ 去掉 margin-bottom:0
rep(
    """      h += '<div class="ip-sec" style="margin-bottom:0">';
      h += '<div class="ip-sec-h">' + IP_icon('clipboard-list', 15) + '④ 自查清单（<span data-chkcount="' + IP_esc(it.id) + '">' + chkDone + '/' + list.length + '</span>）</div>';
""",
    """      h += '<div class="ip-sec">';
      h += '<div class="ip-sec-h">' + IP_icon('clipboard-list', 15) + '④ 自查清单（<span data-chkcount="' + IP_esc(it.id) + '">' + chkDone + '/' + list.length + '</span>）</div>';
""")

# ---------------------------------------------------------------- 6. 新增 ⑤ 五段流程
rep(
    """      h += '<div class="ip-from">' + IP_esc(it.from || '') + '</div>';
      h += '</div>';

      h += '</div>';
""",
    """      h += '<div class="ip-from">' + IP_esc(it.from || '') + '</div>';
      h += '</div>';

      /* ⑤ 五段流程预览（与 AI模拟面试.html 的六阶段状态机同口径） */
      h += '<div class="ip-sec" style="margin-bottom:0">';
      h += '<div class="ip-sec-h">' + IP_icon('clipboard-list', 15) + '⑤ 五段流程（去 AI 模拟面试按此推进）</div>';
      h += IP_stageLegend();
      h += '<div class="ip-hint">推进顺序：读题 → 准备 → 回答 → 提交 → 点评。其中「准备 ⇄ 读题」「回答 ⇄ 准备」「点评 ⇄ 回答」可回退，其余阶段不可跳过。</div>';
      h += '<div class="ip-acts">' +
        '<button type="button" class="ip-btn" data-act="ai" data-id="' + IP_esc(it.id) + '">' +
        IP_icon('bot', 14) + '<em>按五段流程练这道题</em></button></div>';
      h += '</div>';

      h += '</div>';
""")

# ---------------------------------------------------------------- 7. 头部主按钮文案
rep(
    """        IP_icon('bot', 14) + '<em>去 AI 模拟面试，把这 8 题连着练一遍</em></button>' +
""",
    """        IP_icon('bot', 14) + '<em>去 AI 模拟面试（读题→准备→回答→提交→点评），把这 8 题连着练一遍</em></button>' +
""")

# ---------------------------------------------------------------- 8. 注册时共享词汇
rep(
    """  IP_register();

  function IP_openV2(bodyEl) {
""",
    """  IP_register();
  IP_shareStages();

  function IP_openV2(bodyEl) {
""")

# ---------------------------------------------------------------- 9. 对外句柄
rep(
    """  window.IvPrep = {
    version: '2.0.0',
    render: IP_render,
    open: IP_openV2,
    keys: { prefix: LS_PREFIX, reg: REG_NAME, view: VIEW_ID }
  };
""",
    """  window.IvPrep = {
    version: '2.1.0',
    render: IP_render,
    open: IP_openV2,
    stages: {
      machine: IV_MACHINE_CLIENT.slice(0),
      bar: IV_BAR_STAGES_CLIENT.slice(0),
      labels: IV_STAGE_LABELS_CLIENT,
      terminal: IV_TERMINAL_CLIENT,
      backPaths: IV_BACK_PATHS_CLIENT.slice(0)
    },
    keys: { prefix: LS_PREFIX, reg: REG_NAME, view: VIEW_ID }
  };
""")

open(P, 'wb').write(s.encode('utf-8'))
print('EDITS=%d bytes=%d' % (N, len(s.encode('utf-8'))))
