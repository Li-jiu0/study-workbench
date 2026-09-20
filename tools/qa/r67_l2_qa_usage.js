// ===================================================================
// R67 线2 QA（第二轮 · 圆环指示器形态）：AI 页上下文用量紧凑圆环指示器 + 三模式行去 Emoji
// 覆盖：SVG dasharray 进度弧 = 百分比换算（0/45.5/80/81/95/96%、超限封顶满环、8192/1000000 上限）、
//       阈值变色（>80 warn / >95 hot / 边界不变色）、title 完整信息（已用 N（X.X%），上限 Y.YK + 估算口径）、
//       紧凑性（环 16px + 旁侧短标签，无长文本）、模式行纯文字（无 ⚡⚖🏆）、
//       R66/R67 回归（上限三来源动态、模型面板开合/三模式行/auto 行、发送按钮、记忆区块、深度思考 chip）。
// 结果写 tools/qa/r67_l2_qa_usage.txt（本机 stdout 捕获不稳，统一写文件）。
// 运行：NODE_PATH=C:/Users/ATM/node_modules node tools/qa/r67_l2_qa_usage.js
// ===================================================================
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const html = fs.readFileSync(path.join(ROOT, 'AI.html'), 'utf8');
const srcCfg = fs.readFileSync(path.join(ROOT, 'assets/ai-config.js'), 'utf8');
const srcPre = fs.readFileSync(path.join(ROOT, 'assets/ai-presets.js'), 'utf8');
const srcSvc = fs.readFileSync(path.join(ROOT, 'assets/ai-service.js'), 'utf8');
const srcPage = fs.readFileSync(path.join(ROOT, 'assets/ai-page.js'), 'utf8');

const R = [];
let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); R.push('PASS ' + name); pass++; }
  catch (e) { R.push('FAIL ' + name + ' :: ' + (e && e.message)); fail++; }
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(label + ' 实际=' + JSON.stringify(actual) + ' 期望=' + JSON.stringify(expected));
}

// ---------- 与实现同口径的期望值计算 ----------
const C = 2 * Math.PI * 9; // r=9 周长
function fmtK(n) { return (n / 1000).toFixed(1) + 'K'; }
function dashFor(ratio) {
  const clamped = Math.max(0, Math.min(100, ratio * 100)) / 100;
  return (clamped * C).toFixed(2) + ' ' + C.toFixed(2);
}
function titleFor(used, pct, limit) {
  const usedTxt = (used >= 1000) ? (used / 1000).toFixed(1) + 'K' : String(Math.round(used));
  return '已用 ' + Math.round(pct) + '% · ' + usedTxt + ' / ' + fmtK(limit);
}
function stripModeEmoji(label) { return String(label).replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, ''); }

// ---------- 静态源码断言 ----------
check('S1_html_initial_ring', function () {
  if (html.indexOf('id="aiCtxUsage"') < 0) throw new Error('id aiCtxUsage 丢失');
  if (html.indexOf('<svg class="ai-ctx-ring" viewBox="0 0 24 24" width="16" height="16"') < 0) throw new Error('静态圆环结构缺失');
  if (html.indexOf('stroke-dasharray="0.00 56.55"') < 0) throw new Error('初始 0% dasharray 缺失');
  if (html.indexOf('>0%</span></span>') < 0) throw new Error('初始 0% 标签缺失');
  if (html.indexOf('title="已用 0% · 0 / 1.0K"') < 0) throw new Error('静态短 title 缺失');
});
check('S2_html_ring_css', function () {
  if (html.indexOf('.ai-ctx-ring-fg{stroke:var(--ai-blue);') < 0) throw new Error('进度弧正常色规则缺失');
  if (html.indexOf('.ai-ctx-usage.warn .ai-ctx-ring-fg{stroke:#e8890c;}') < 0) throw new Error('warn 弧色规则缺失');
  if (html.indexOf('.ai-ctx-usage.hot .ai-ctx-ring-fg{stroke:#e0504d;}') < 0) throw new Error('hot 弧色规则缺失');
  if (html.indexOf('.ai-ctx-pct{font-size:10px') < 0) throw new Error('百分比标签字号规则缺失');
});
check('S3_html_hover_and_layout', function () {
  if (html.indexOf('cursor:help') < 0) throw new Error('cursor:help 缺失');
  if (html.indexOf('flex-wrap:wrap;justify-content:flex-end') < 0) throw new Error('.ai-foot-right 折行样式缺失');
});
check('S4_js_ring_impl', function () {
  if (srcPage.indexOf('CTX_RING_C') < 0) throw new Error('圆环周长常量缺失');
  if (srcPage.indexOf('fmtCtxLimitK') < 0) throw new Error('fmtCtxLimitK 缺失（要求保留）');
  if (srcPage.indexOf('plainModeLabel') < 0) throw new Error('模式名剥离函数缺失');
  if (srcPage.indexOf('stroke-dasharray') < 0) throw new Error('dasharray 渲染缺失');
  if (srcPage.indexOf('CTX_USAGE_TIP') >= 0) throw new Error('CTX_USAGE_TIP 应已删除');
});
check('S5_old_long_text_gone', function () {
  if (srcPage.indexOf('上下文已使用') >= 0) throw new Error('ai-page.js 残留旧长文本');
  if (html.indexOf('上下文已使用') >= 0) throw new Error('AI.html 残留旧长文本');
  if (srcPage.indexOf('上下文已用 ') >= 0) throw new Error('ai-page.js 残留旧 title 前缀');
  if (srcPage.indexOf("pct.toFixed(1)") >= 0) throw new Error('旧 1 位小数百分比拼接残留');
  ['估算值', '变橙色', '变红色'].forEach(function (k) {
    if (srcPage.indexOf(k) >= 0) throw new Error('ai-page.js 残留旧说明词: ' + k);
    if (html.indexOf(k) >= 0) throw new Error('AI.html 残留旧说明词: ' + k);
  });
});
check('S6_html_ring_left_of_model_btn', function () {
  const iu = html.indexOf('id="aiCtxUsage"'), ib = html.indexOf('id="aiModelBtn"'), ia = html.indexOf('id="aiAttachBtn"');
  if (!(0 <= iu && iu < ib && ib < ia)) throw new Error('静态结构顺序应为 圆环→模型钮→附件钮');
});
check('S7_no_emoji_in_sources', function () {
  if (/[⚡⚖🏆]/.test(srcPage)) throw new Error('ai-page.js 残留 Emoji 字样');
  if (/[⚡⚖🏆]/.test(html)) throw new Error('AI.html 残留 Emoji 字样');
});

// ---------- 启动页面 ----------
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/AI.html', pretendToBeVisual: true });
const w = dom.window;
const doc = w.document;
w.fetch = function () { return Promise.reject(new Error('blocked by qa')); };

let bootErr = '';
try { w.eval(srcCfg); } catch (e) { bootErr += 'ai-config:' + e.message + ';'; }
try { w.eval(srcPre); } catch (e) { bootErr += 'ai-presets:' + e.message + ';'; }
try { w.eval(srcSvc); } catch (e) { bootErr += 'ai-service:' + e.message + ';'; }
try { w.eval(srcPage); } catch (e) { bootErr += 'ai-page:' + e.message + ';'; }
check('B1_boot_no_throw', function () { if (bootErr) throw new Error(bootErr); });
// jsdom outside-only 模式下 readyState 停在 loading、DOMContentLoaded 不会自动触发 → 手动补发驱动 init()
if (!doc.getElementById('setMemoryList')) doc.dispatchEvent(new w.Event('DOMContentLoaded'));
check('B2_init_ran', function () {
  if (!doc.getElementById('setMemoryList')) throw new Error('init 未运行（记忆区块未注入）');
});

// ---------- 工具 ----------
function $(id) { return doc.getElementById(id); }
function setLS(k, v) { if (v === null || v === undefined) w.localStorage.removeItem(k); else w.localStorage.setItem(k, v); }
function resetEnv() {
  ['ai_selected_model', 'ai_model_mode', 'ai_max_mode', 'ai_custom_models', 'ai_chat_history', 'ai_model_settings', 'ai_deep_think'].forEach(function (k) { setLS(k, null); });
}
function cjk(n) { return '中'.repeat(n); }
function fireInput() { $('aiInput').dispatchEvent(new w.Event('input', { bubbles: true })); }
function setDraft(n) { $('aiInput').value = cjk(n); fireInput(); }
function usageEl() { return $('aiCtxUsage'); }
function ringFg() { return usageEl().querySelector('.ai-ctx-ring-fg'); }
function dash() { return ringFg().getAttribute('stroke-dasharray'); }
function pctText() { return usageEl().querySelector('.ai-ctx-pct').textContent; }
function title() { return usageEl().getAttribute('title') || ''; }
function hasCls(c) { return usageEl().classList.contains(c); }
function customModel(id, maxTokens) {
  return JSON.stringify([{ id: id, name: 'QA' + id, apiUrl: 'https://qa.invalid/v1/chat/completions', apiKey: '', apiFormat: 'openai', types: ['text'], maxTokens: maxTokens }]);
}
function builtinMaxTokens(id) {
  const list = (w.AI_CONFIG && w.AI_CONFIG.builtinModels) || [];
  for (let i = 0; i < list.length; i++) { if (list[i].id === id) { const v = parseInt(list[i].maxTokens, 10); return (isFinite(v) && v > 0) ? v : 0; } }
  return 0;
}
function modeLimit(key) {
  const mm = w.AI_CONFIG && w.AI_CONFIG.modelModes && w.AI_CONFIG.modelModes[key];
  if (mm && Array.isArray(mm.chain) && mm.chain.length) { const mt = builtinMaxTokens(mm.chain[0]); if (mt > 0) return mt; }
  return 0;
}

// ---------- R67/C：圆环紧邻模型钮左侧（位置断言） ----------
check('P1_ring_adjacent_left_of_model_btn', function () {
  const btn = $('aiModelBtn');
  if (btn.previousElementSibling !== usageEl()) throw new Error('圆环不是模型钮的前一个兄弟元素');
  if (usageEl().nextElementSibling !== btn) throw new Error('模型钮不是圆环的后一个兄弟元素');
  if (!btn.nextElementSibling || btn.nextElementSibling.id !== 'aiAttachBtn') throw new Error('模型钮右侧应为附件钮');
});

// ---------- 圆环格式断言（默认 auto / 上限 1000） ----------
check('F1_zero_default', function () {
  resetEnv(); $('aiInput').value = ''; fireInput();
  eq(dash(), dashFor(0), '0% 弧长');
  eq(pctText(), '0%', '0% 标签');
  eq(title(), titleFor(0, 0, 1000), '0% title');
  eq(hasCls('warn') || hasCls('hot'), false, '0% 不应变色');
  eq(usageEl().textContent, '0%', '容器内只有短标签');
  eq(ringFg().parentNode.getAttribute('width'), '16', '环尺寸 16px');
});
check('F2_45_5_percent', function () {
  setDraft(455);
  eq(dash(), dashFor(0.455), '45.5% 弧长');
  eq(pctText(), '46%', '45.5% 标签四舍五入');
  eq(title(), titleFor(455, 45.5, 1000), '45.5% 短提示');
  eq(hasCls('warn') || hasCls('hot'), false, '45.5% 不应变色');
});
check('F3_81_percent_warn', function () {
  setDraft(810);
  eq(dash(), dashFor(0.81), '81% 弧长');
  eq(pctText(), '81%', '81% 标签');
  eq(hasCls('warn'), true, '81% 应 warn');
  eq(hasCls('hot'), false, '81% 不应 hot');
});
check('F4_96_percent_hot', function () {
  setDraft(960);
  eq(dash(), dashFor(0.96), '96% 弧长');
  eq(pctText(), '96%', '96% 标签');
  eq(hasCls('hot'), true, '96% 应 hot');
});
check('F5_boundary_80_no_warn', function () {
  setDraft(800);
  eq(dash(), dashFor(0.8), '80% 边界弧长');
  eq(pctText(), '80%', '80% 标签');
  eq(hasCls('warn'), false, '80% 整（>80 才变色）不应 warn');
});
check('F6_boundary_95_warn_not_hot', function () {
  setDraft(950);
  eq(pctText(), '95%', '95% 标签');
  eq(hasCls('warn'), true, '95% 整应 warn');
  eq(hasCls('hot'), false, '95% 整（>95 才红）不应 hot');
});
check('F7_limit_8192', function () {
  resetEnv(); setLS('ai_custom_models', customModel('qa8k', 8192)); setLS('ai_selected_model', 'qa8k');
  $('aiInput').value = ''; fireInput();
  eq(title(), titleFor(0, 0, 8192), '上限 8192 title');
  eq(dash(), dashFor(0), '0% 弧长');
});
check('F8_limit_1000000_half', function () {
  setLS('ai_custom_models', customModel('qa1m', 1000000)); setLS('ai_selected_model', 'qa1m');
  setDraft(500000);
  eq(dash(), dashFor(0.5), '50% 半环弧长');
  eq(pctText(), '50%', '50% 标签');
  eq(title(), titleFor(500000, 50, 1000000), '上限 1000000 title');
});
check('F9_overlimit_full_ring', function () {
  resetEnv(); setDraft(1234);
  eq(dash(), dashFor(1), '超限弧长封顶满环');
  eq(pctText(), '123%', '超限标签显示真实百分比');
  eq(title(), titleFor(1234, 123.4, 1000), '超限 title');
});

// ---------- 上限三来源回归（R66 特性，经 title 的「上限 Y.YK」体现） ----------
check('L1_max_mode_8000', function () {
  resetEnv(); setLS('ai_max_mode', '1');
  $('aiInput').value = ''; fireInput();
  eq(title(), titleFor(0, 0, 8000), 'MAX→8000');
});
check('L2_mode_chain_first_model', function () {
  resetEnv(); setLS('ai_model_mode', 'fast');
  $('aiInput').value = ''; fireInput();
  const expected = modeLimit('fast') || 1000;
  eq(title(), titleFor(0, 0, expected), 'fast 模式链首模型上限');
});
check('L3_mode_priority_over_max', function () {
  setLS('ai_model_mode', 'fast'); setLS('ai_max_mode', '1');
  $('aiInput').value = ''; fireInput();
  const expected = modeLimit('fast') || 8000;
  eq(title(), titleFor(0, 0, expected), '模式优先于 MAX');
});
check('L4_selected_model_dynamic', function () {
  resetEnv(); setLS('ai_custom_models', customModel('qa8k', 8192)); setLS('ai_selected_model', 'qa8k');
  $('aiInput').value = ''; fireInput();
  eq(title(), titleFor(0, 0, 8192), '选中模型上限动态');
});

// ---------- hover 说明 ----------
check('H1_title_progress_only', function () {
  resetEnv(); setDraft(10);
  eq(title(), titleFor(10, 1, 1000), '10/1000 短提示');
  ['估算值', '变橙色', '变红色', '上限随', 'token', '上下文已用'].forEach(function (k) {
    if (title().indexOf(k) >= 0) throw new Error('title 残留旧说明词: ' + k);
  });
});
check('H2_title_kept_after_rerender', function () {
  setDraft(900); setDraft(0);
  eq(title(), titleFor(0, 0, 1000), '重渲染后 title 仍完整');
});

// ---------- 三模式行去 Emoji（R67/B） ----------
check('M1_mode_rows_plain_text', function () {
  resetEnv(); setLS('ai_custom_models', customModel('qa8k', 8192));
  $('aiModelBtn').click();
  const panel = $('aiModelPanel');
  if (!panel.classList.contains('open')) throw new Error('面板未打开');
  const rows = panel.querySelectorAll('[data-mode]');
  const mm = (w.AI_CONFIG && w.AI_CONFIG.modelModes) || {};
  let expectModes = 0; ['fast', 'balanced', 'ultimate'].forEach(function (k) { if (mm[k] && mm[k].label) expectModes++; });
  eq(rows.length, expectModes, '三模式行数');
  if (!panel.querySelector('[data-id="auto"]')) throw new Error('auto 行缺失');
  if (!panel.querySelector('[data-id="qa8k"]')) throw new Error('自定义模型行缺失');
  rows.forEach(function (row) {
    const key = row.getAttribute('data-mode');
    const raw = mm[key] && mm[key].label;
    const nameEl = row.querySelector('.ai-mp-name');
    if (!nameEl) throw new Error(key + ' 行缺名称节点');
    const name = nameEl.textContent;
    eq(name, stripModeEmoji(raw), key + ' 行应为纯文字模式名');
    if (name === raw) throw new Error(key + ' 行 Emoji 未剥离: ' + name);
    if (/[⚡⚖🏆🚀🔥💎]/.test(name)) throw new Error(key + ' 行仍含图标字符: ' + name);
  });
});
check('M2_click_mode_persist_and_label', function () {
  const row = $('aiModelPanel').querySelector('[data-mode="fast"]');
  if (!row) throw new Error('fast 模式行不存在');
  row.click();
  eq(w.localStorage.getItem('ai_model_mode'), 'fast', '点击模式行应写 ai_model_mode');
  if ($('aiModelPanel').classList.contains('open')) throw new Error('选择后面板应关闭');
  const fastLabel = stripModeEmoji(w.AI_CONFIG.modelModes.fast.label);
  eq($('aiModelLabel').textContent, fastLabel, '输入框标签应显示去 Emoji 模式名');
});
check('M3_toast_plain_text', function () {
  const t = $('aiToast');
  const fastLabel = stripModeEmoji(w.AI_CONFIG.modelModes.fast.label);
  if (!t || t.textContent.indexOf('已切到 ' + fastLabel) !== 0) throw new Error('toast 未去 Emoji: ' + (t && t.textContent));
  if (/[⚡⚖🏆]/.test(t.textContent)) throw new Error('toast 仍含 Emoji: ' + t.textContent);
});
check('M4_click_auto_row_back_to_default', function () {
  $('aiModelBtn').click();
  const row = $('aiModelPanel').querySelector('[data-id="auto"]');
  row.click();
  eq(w.localStorage.getItem('ai_model_mode'), '', '手动选模型应清空模式');
  eq(w.localStorage.getItem('ai_selected_model'), 'auto', '选中应为 auto');
  eq($('aiModelLabel').textContent, '自动', '标签应回到自动');
  $('aiInput').value = ''; fireInput();
  eq(title(), titleFor(0, 0, 1000), '回退后上限应回到默认 1000');
});

// ---------- 既有功能回归 ----------
check('R1_ids_preserved', function () {
  ['aiCtxUsage', 'aiModelBtn', 'aiModelPanel', 'aiModelList', 'aiSendBtn', 'aiAttachBtn', 'aiDeepThinkChip', 'aiInput'].forEach(function (id) {
    if (!$(id)) throw new Error('DOM id 丢失: ' + id);
  });
});
check('R2_send_button_state', function () {
  resetEnv(); $('aiInput').value = ''; fireInput();
  eq($('aiSendBtn').disabled, true, '空输入发送钮应禁用');
  $('aiInput').value = '你好'; fireInput();
  eq($('aiSendBtn').disabled, false, '有输入发送钮应可用');
  $('aiInput').value = ''; fireInput();
});
check('R3_memory_section_injected', function () {
  if (!$('settingsPopup')) throw new Error('settingsPopup 缺失');
  if (!$('setMemoryList')) throw new Error('记忆管理区块未注入');
});
check('R4_deep_think_chip_toggle', function () {
  resetEnv();
  const chip = $('aiDeepThinkChip');
  chip.click();
  eq(chip.classList.contains('active'), true, '深度思考点击后应 active');
  eq(w.localStorage.getItem('ai_deep_think'), '1', '深度思考应写 1');
  chip.click();
  eq(chip.classList.contains('active'), false, '再次点击应关闭');
});
check('R5_compact_no_long_text', function () {
  resetEnv(); setDraft(1234);
  const txt = usageEl().textContent;
  if (txt.length > 4) throw new Error('容器文本过长（应仅短百分比标签）: ' + txt);
  if (usageEl().querySelectorAll('circle').length !== 2) throw new Error('圆环应含底环+进度弧两个 circle');
  if (usageEl().querySelector('svg') === null) throw new Error('SVG 环缺失');
});
check('P2_position_survives_rerenders', function () {
  // 经历全部渲染/面板开合后再验位置：renderCtxUsage 只换 innerHTML，节点本身不被移动
  if ($('aiModelBtn').previousElementSibling !== usageEl()) throw new Error('多轮渲染后圆环离开了模型钮左侧');
  if ($('aiModelBtn').nextElementSibling.id !== 'aiAttachBtn') throw new Error('模型钮右侧兄弟错位');
});

// ---------- 输出 ----------
const out = R.join('\n') + '\n\nTOTAL ' + (pass + fail) + ' | PASS ' + pass + ' | FAIL ' + fail + '\n';
fs.writeFileSync(path.join(ROOT, 'tools', 'qa', 'r67_l2_qa_usage.txt'), out, 'utf8');
process.exit(fail === 0 ? 0 : 1);
