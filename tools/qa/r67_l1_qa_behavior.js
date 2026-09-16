// R67 线1 QA：行为级断言（jsdom 真实加载 ai-settings.html DOM + ai-config.js + ai-settings.js）
// 测试对象只读，本脚本仅读取与运行，绝不修改被测文件、绝不发起真实 AI 请求。
// 覆盖：B组删重复入口 / C组服务商分组表单 / R66缺陷 no_endpoint&no_key 中文映射 /
//       R64~R66 核心特性回归抽样（选中/禁用/编辑/删除/排序/恢复默认/星级/分类/健康队列/密钥/记忆/检测第二参数）
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(process.env.NODE_PATH || 'C:/Users/ATM/node_modules', 'jsdom'));

const BASE = 'D:/下载的文件/学习工作台';
const out = [];
let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; out.push('[PASS] ' + name + (info ? '  ' + info : '')); }
  else { fail++; out.push('[FAIL] ' + name + (info ? '  ' + info : '')); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// 6 个平台密钥（运行时从 assets/ai-config.js 提取，不在仓库硬编码）
const PLATFORM_KEYS = (function () {
  const src = fs.readFileSync(path.join(BASE, 'assets/ai-config.js'), 'utf8');
  const arr = [];
  const re = /apiKey:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) arr.push(m[1]);
  return arr;
})();

(async function () {
  const htmlSrc = fs.readFileSync(path.join(BASE, 'ai-settings.html'), 'utf8');
  const dom = new JSDOM(htmlSrc, {
    url: 'http://localhost/ai-settings.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const win = dom.window;
  const doc = win.document;
  win.localStorage.clear();

  // 预置数据（在 ai-settings.js 加载前写入，boot 时读取）
  const now = Date.now();
  win.localStorage.setItem('ai_model_settings', JSON.stringify({
    disabled: {}, order: [], overrides: {
      'glm-4.7-flash': { apiKey: 'USERKEY-keep', name: '我的GLM', apiUrl: 'https://my.proxy/v1' }
    },
    catModels: {}, categories: [], stars: {},
    health: {
      'glm-4.7-flash': { ok: false, ms: 0, err: 'no_endpoint', at: now },
      'glm-4.5-flash': { ok: false, ms: 0, err: 'no_key', at: now }
    }
  }));

  // 桩：aiHealthCheck（绝不发真实请求；后台队列调用不决议，避免写 health 污染断言）
  const hcCalls = [];
  win.aiHealthCheck = function (id, cfg) {
    hcCalls.push({ id: id, cfg: cfg });
    if (cfg) { return Promise.resolve({ ok: true, ms: 42, err: null }); }
    return new Promise(function () {});
  };
  // 桩：确认框一律同意（驱动删除/恢复默认流程）
  win.uiConfirm = function () { return Promise.resolve(true); };

  win.eval(fs.readFileSync(path.join(BASE, 'assets/ai-config.js'), 'utf8'));
  win.eval(fs.readFileSync(path.join(BASE, 'assets/ai-settings.js'), 'utf8'));
  await sleep(120);

  const $ = function (id) { return doc.getElementById(id); };
  const S = function () { return JSON.parse(win.localStorage.getItem('ai_model_settings') || '{}'); };
  const CM = function () { return JSON.parse(win.localStorage.getItem('ai_custom_models') || '[]'); };
  function setSel(id, v) {
    const el = $(id);
    el.value = v;
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  }
  function rows() { return Array.from(doc.querySelectorAll('#setModelList [data-model-id]')); }
  function rowIds() { return rows().map(function (r) { return r.getAttribute('data-model-id'); }); }

  // ===== 启动 =====
  ok('启动: window.xtAiSettings 暴露（getState/refresh/switchTab）',
     !!(win.xtAiSettings && typeof win.xtAiSettings.getState === 'function' &&
        typeof win.xtAiSettings.refresh === 'function' && typeof win.xtAiSettings.switchTab === 'function'));
  ok('启动: 模型列表已渲染', rows().length >= 24, 'rows=' + rows().length);

  // ===== B组：删重复入口 =====
  ok('B组: #setAddCustom 按钮已删除', $('setAddCustom') === null);
  const savedCfg = win.AI_CONFIG;
  win.AI_CONFIG = { providers: {}, builtinModels: [], FUNC_TYPES: {}, modelDetails: {}, providerGroups: [] };
  win.localStorage.removeItem('ai_custom_models');
  win.xtAiSettings.refresh();
  const emptyHtml = $('setModelList').innerHTML;
  ok('B组: 空态文案不再指向已删按钮', emptyHtml.indexOf('添加自定义模型') === -1 && emptyHtml.indexOf('添加模型') !== -1);
  win.AI_CONFIG = savedCfg;
  win.xtAiSettings.refresh();
  ok('B组: 恢复配置后列表还原', rows().length >= 24);

  // ===== R66 缺陷修复：no_endpoint / no_key 中文映射 =====
  const rowEp = doc.querySelector('[data-model-id="glm-4.7-flash"]');
  ok('缺陷: healthReason(no_endpoint) -> 未配置接口地址',
     !!(rowEp && rowEp.querySelector('[data-health]') &&
        rowEp.querySelector('[data-health]').getAttribute('title').indexOf('未配置接口地址') !== -1),
     'title=' + (rowEp ? rowEp.querySelector('[data-health]').getAttribute('title') : 'n/a'));
  const rowNk = doc.querySelector('[data-model-id="glm-4.5-flash"]');
  ok('缺陷: healthReason(no_key) -> 未配置密钥',
     !!(rowNk && rowNk.querySelector('[data-health]') &&
        rowNk.querySelector('[data-health]').getAttribute('title').indexOf('未配置密钥') !== -1),
     'title=' + (rowNk ? rowNk.querySelector('[data-health]').getAttribute('title') : 'n/a'));

  // ===== C组：服务商分组下拉 =====
  const prov = $('setFmProvider');
  ok('C组: 服务商下拉存在（#setFmProvider）', !!prov);
  ok('C组: 13 组服务商 + 1 占位项', !!prov && prov.options.length === 14, 'options=' + (prov ? prov.options.length : 0));
  ok('C组: 三层 optgroup（内置Key/需自备Key/手动）', !!prov && prov.querySelectorAll('optgroup').length === 3);

  setSel('setFmProvider', 'zhipu');
  ok('C组: 选智谱AI -> API 端点自动回填',
     $('setFmUrl').value === 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
  ok('C组: 智谱组 -> 模型 ID 切为下拉（输入框隐藏）',
     $('setFmModelIdSel').style.display !== 'none' && $('setFmModelId').style.display === 'none');
  ok('C组: 智谱组候选 5 个模型', $('setFmModelIdSel').options.length === 6,
     'options=' + $('setFmModelIdSel').options.length);
  ok('C组: 内置组无 needKey 标注', $('setFmProviderNote').style.display === 'none');

  setSel('setFmModelIdSel', 'glm-4.6v-flash');
  ok('C组: 切模型 ID -> 隐藏输入框同步', $('setFmModelId').value === 'glm-4.6v-flash');
  ok('C组: 切模型 ID -> 名称自动预填', $('setFmName').value === 'GLM-4.6V-Flash');
  const onTypes = Array.from($('setFmTypes').querySelectorAll('.on'))
    .map(function (b) { return b.getAttribute('data-type-check'); }).sort();
  ok('C组: 切模型 ID -> 能力标签预填 image+general', onTypes.join(',') === 'general,image',
     'on=' + onTypes.join(','));

  setSel('setFmProvider', 'custom');
  ok('C组: 自定义组 -> 模型 ID 切回文本输入框',
     $('setFmModelIdSel').style.display === 'none' && $('setFmModelId').style.display !== 'none');
  ok('C组: 自定义组 -> 端点清空', $('setFmUrl').value === '');
  ok('C组: 自定义组 -> note 提示可见', $('setFmProviderNote').style.display !== 'none');

  // 高级设置默认隐藏
  $('setTabAdd').click();
  ok('C组: API 格式默认隐藏（高级设置折叠）', $('setFmAdv').style.display === 'none');
  ok('C组: 格式选择器仍在 DOM（可展开）', !!$('setFmFormat'));
  ok('C组(R67设计): 旧名称 datalist 已移除', $('setFmNameList') === null);

  setSel('setFmProvider', 'deepseek');
  ok('C组: needKey 组显示标注「需自备 Key」',
     $('setFmProviderNote').style.display !== 'none' && $('setFmProviderNote').textContent.indexOf('需自备 Key') !== -1,
     'note=' + $('setFmProviderNote').textContent);
  ok('C组: DeepSeek 端点回填', $('setFmUrl').value === 'https://api.deepseek.com/v1/chat/completions');
  ok('C组: needKey 组候选模型可选（deepseek 2 个）', $('setFmModelIdSel').options.length === 3);

  setSel('setFmProvider', 'claude');
  ok('C组: Claude apiUrl 为空 -> 端点清空不冒充', $('setFmUrl').value === '');
  ok('C组: Claude 协议不兼容标注',
     $('setFmProviderNote').textContent.indexOf('协议') !== -1 &&
     $('setFmProviderNote').textContent.indexOf('OpenAI 兼容') !== -1,
     'note=' + $('setFmProviderNote').textContent);
  ok('C组: Claude(custom 协议) -> 高级设置自动展开 + 格式 custom',
     $('setFmAdv').style.display !== 'none' && $('setFmFormat').value === 'custom');

  setSel('setFmProvider', 'gemini');
  ok('C组: Gemini -> 高级设置自动展开 + 格式 gemini',
     $('setFmAdv').style.display !== 'none' && $('setFmFormat').value === 'gemini');
  ok('C组: Gemini 端点回填（{model} 模板保留）',
     $('setFmUrl').value.indexOf('generativelanguage.googleapis.com') !== -1);

  // 折叠态提交一律 openai
  $('setTabAdd').click();
  setSel('setFmProvider', 'deepseek');
  setSel('setFmModelIdSel', 'deepseek-chat');
  $('setFmKey').value = 'sk-user-ds';
  $('setFmSave').click();
  let dsEntry = CM().filter(function (m) { return m.id === 'deepseek-chat'; })[0];
  ok('C组: 隐藏态提交按 openai', !!(dsEntry && dsEntry.apiFormat === 'openai'),
     'apiFormat=' + (dsEntry ? dsEntry.apiFormat : 'n/a'));
  ok('C组: 端点/名称/能力随保存落地',
     !!(dsEntry && dsEntry.apiUrl === 'https://api.deepseek.com/v1/chat/completions' &&
        dsEntry.name === 'DeepSeek-V3' && dsEntry.types.join(',') === 'general'));

  // 展开态保留协议；展开后选 gemini 再折叠 -> 强制 openai
  $('setTabAdd').click();
  setSel('setFmProvider', 'deepseek');
  setSel('setFmModelIdSel', 'deepseek-reasoner');
  $('setFmKey').value = 'sk-user-ds2';
  $('setFmAdvToggle').click();
  ok('C组: 高级设置可展开', $('setFmAdv').style.display !== 'none');
  setSel('setFmFormat', 'gemini');
  $('setFmSave').click();
  let r1Entry = CM().filter(function (m) { return m.id === 'deepseek-reasoner'; })[0];
  ok('C组: 展开态提交保留所选协议（gemini）', !!(r1Entry && r1Entry.apiFormat === 'gemini'),
     'apiFormat=' + (r1Entry ? r1Entry.apiFormat : 'n/a'));

  $('setTabAdd').click();
  setSel('setFmProvider', 'tongyi');
  setSel('setFmModelIdSel', 'qwen-plus');
  $('setFmKey').value = 'sk-user-tongyi';
  $('setFmAdvToggle').click();
  setSel('setFmFormat', 'gemini');
  $('setFmAdvToggle').click();
  ok('C组: 高级设置可再折叠', $('setFmAdv').style.display === 'none');
  $('setFmSave').click();
  let qEntry = CM().filter(function (m) { return m.id === 'qwen-plus'; })[0];
  ok('C组: 折叠态提交强制 openai（展开时选过 gemini 也不冒充）',
     !!(qEntry && qEntry.apiFormat === 'openai'), 'apiFormat=' + (qEntry ? qEntry.apiFormat : 'n/a'));

  // ===== 回归：R64~R66 核心特性抽样 =====
  // 选中
  win.localStorage.setItem('ai_selected_model', '');
  $('setTabModels').click();
  const rowSel = doc.querySelector('[data-model-id="qwen2.5-7b"]');
  rowSel.click();
  ok('回归: 点行选中写 ai_selected_model', win.localStorage.getItem('ai_selected_model') === 'qwen2.5-7b');
  ok('回归: 当前行橙框高亮 cur',
     doc.querySelector('[data-model-id="qwen2.5-7b"]').className.indexOf('cur') !== -1);

  // 禁用
  doc.querySelector('[data-model-id="qwen2.5-7b"] [data-toggle]').click();
  ok('回归: 启停开关写 disabled', S().disabled['qwen2.5-7b'] === true);

  // 星级
  doc.querySelector('[data-model-id="qwen2.5-7b"] [data-star-n="4"]').click();
  ok('回归: 星级点击写 stars', S().stars['qwen2.5-7b'] === 4);

  // 排序（上移）
  const ids0 = rowIds();
  rows()[1].querySelector('[data-up]').click();
  const ids1 = rowIds();
  ok('回归: 上移排序生效', ids1[0] === ids0[1] && ids1[1] === ids0[0],
     ids0[0] + '>' + ids0[1] + ' => ' + ids1[0] + '>' + ids1[1]);
  ok('回归: order 已持久化', Array.isArray(S().order) && S().order.length >= 2);

  // 编辑内置：密钥不回填 + 空保存保持原 key
  doc.querySelector('[data-model-id="glm-4.7-flash"] [data-edit]').click();
  ok('回归: 编辑内置打开表单', $('setFmTitle').textContent.indexOf('编辑模型') === 0);
  ok('回归: 密钥不回填（内置）', $('setFmKey').value === '');
  ok('回归: Key 状态提示「已自定义密钥」', $('setFmKeyState').textContent.indexOf('已自定义密钥') !== -1);
  ok('回归: 内置编辑隐藏模型 ID 行', $('setFmIdRow').style.display === 'none');
  ok('回归: 编辑内置回填服务商分组=智谱AI', $('setFmProvider').value === 'zhipu');
  ok('回归: 编辑回填覆盖端点', $('setFmUrl').value === 'https://my.proxy/v1');
  $('setFmSave').click();
  const ovAfter = S().overrides['glm-4.7-flash'];
  ok('回归: 空保存保持原 key（空=保持原值）', !!(ovAfter && ovAfter.apiKey === 'USERKEY-keep'));

  // 编辑自定义
  doc.querySelector('[data-model-id="deepseek-chat"] [data-edit]').click();
  ok('回归: 编辑自定义 -> 模型 ID 行可见', $('setFmIdRow').style.display !== 'none');
  ok('回归: 编辑自定义 -> 按 apiUrl+ID 匹配到 deepseek 分组', $('setFmProvider').value === 'deepseek');
  ok('回归: 编辑自定义 -> 模型 ID 下拉选中当前值', $('setFmModelIdSel').value === 'deepseek-chat');
  ok('回归: 密钥不回填（自定义）', $('setFmKey').value === '');
  $('setFmCancel').click();

  // 删除自定义
  doc.querySelector('[data-model-id="deepseek-reasoner"] [data-del]').click();
  await sleep(30);
  ok('回归: 删除自定义模型生效',
     CM().filter(function (m) { return m.id === 'deepseek-reasoner'; }).length === 0);

  // 恢复默认
  $('setRestoreDefault').click();
  await sleep(30);
  const st8 = S();
  ok('回归: 恢复默认清空 disabled/order/overrides/stars',
     Object.keys(st8.disabled || {}).length === 0 && (st8.order || []).length === 0 &&
     Object.keys(st8.overrides || {}).length === 0 && Object.keys(st8.stars || {}).length === 0);

  // 分类管理
  $('setTabFunc').click();
  ok('回归: 功能分类渲染内置 4 类', doc.querySelectorAll('#setFuncList [data-cat]').length >= 4);
  $('setAddTypeBtn').click();
  $('setNewTypeName').value = '代码';
  $('setNewTypeOk').click();
  ok('回归: 新建分类写入 categories',
     (S().categories || []).filter(function (c) { return c.label === '代码'; }).length === 1);

  // 记忆管理
  win.localStorage.setItem('ai_memory', JSON.stringify(['记忆A', '记忆B']));
  $('setTabAbout').click();
  ok('回归: 记忆条数展示', $('setMemCount').textContent === '2');
  doc.querySelector('[data-mem-del="0"]').click();
  ok('回归: 逐条删除记忆', JSON.parse(win.localStorage.getItem('ai_memory')).length === 1);

  // Key 眼睛按钮
  $('setTabAdd').click();
  ok('回归: Key 默认密文', $('setFmKey').type === 'password');
  $('setFmKeyEye').click();
  ok('回归: 眼睛按钮切换明文', $('setFmKey').type === 'text');

  // ===== 健康队列 + 检测连接第二参数（等待首个后台检测窗口过去，避免与断言竞争） =====
  await sleep(1800);
  const bgCalls = hcCalls.filter(function (c) { return !c.cfg; });
  ok('回归: 健康队列后台自动启动（~1.5s 延迟、串行不烧限频）', bgCalls.length >= 1,
     'bgCalls=' + bgCalls.length + ' 首个=' + (bgCalls[0] ? bgCalls[0].id : 'n/a'));

  // 检测连接：用表单当前未保存值，第二参数契约，不读不写不落盘
  $('setTabAdd').click();
  setSel('setFmProvider', 'zhipu');
  setSel('setFmModelIdSel', 'glm-4-flash');
  $('setFmKey').value = 'sk-form-tmp';
  const beforeSettings = win.localStorage.getItem('ai_model_settings');
  const beforeCustom = win.localStorage.getItem('ai_custom_models');
  hcCalls.length = 0;
  $('setFmTest').click();
  await sleep(60);
  ok('C组: 「检测连接」按钮触发一次检测', hcCalls.length === 1, 'calls=' + hcCalls.length);
  const call0 = hcCalls[0];
  ok('C组: 第二参数=表单当前未保存值（url/key/format/modelId）',
     !!(call0 && call0.id === 'glm-4-flash' && call0.cfg &&
        call0.cfg.apiUrl === 'https://open.bigmodel.cn/api/paas/v4/chat/completions' &&
        call0.cfg.apiKey === 'sk-form-tmp' && call0.cfg.apiFormat === 'openai' &&
        call0.cfg.modelId === 'glm-4-flash'),
     'cfg=' + (call0 && call0.cfg ? JSON.stringify(call0.cfg) : 'n/a'));
  ok('C组: 检测不落盘（已存 settings / 自定义模型均未变）',
     win.localStorage.getItem('ai_model_settings') === beforeSettings &&
     win.localStorage.getItem('ai_custom_models') === beforeCustom);

  // ===== 密钥专项：localStorage 全量 dump 不含平台密钥明文 =====
  let dumpLeak = [];
  for (let i = 0; i < win.localStorage.length; i++) {
    const k = win.localStorage.key(i);
    const v = win.localStorage.getItem(k);
    PLATFORM_KEYS.forEach(function (pk) { if (v && v.indexOf(pk) !== -1) dumpLeak.push(k); });
  }
  ok('密钥: localStorage 全量 dump 不含 6 平台密钥明文', dumpLeak.length === 0,
     dumpLeak.length ? '命中: ' + dumpLeak.join(',') : '');

  out.push('');
  out.push('===== R67 线1 行为测试汇总: PASS=' + pass + ' FAIL=' + fail + ' =====');
  fs.writeFileSync(path.join(BASE, 'tools/qa/r67_l1_qa_behavior_result.txt'), out.join('\n'), 'utf8');
  console.log(out.join('\n'));
  console.log('EXIT ' + (fail === 0 ? 0 : 1));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  fs.writeFileSync(path.join(BASE, 'tools/qa/r67_l1_qa_behavior_result.txt'),
    out.join('\n') + '\n[ERROR] ' + (e && e.stack ? e.stack : e), 'utf8');
  console.log(out.join('\n'));
  console.log('[ERROR] ' + (e && e.stack ? e.stack : e));
  console.log('EXIT 2');
  process.exit(2);
});
