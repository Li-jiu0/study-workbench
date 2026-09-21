// R66 QA：行为级断言（jsdom 真实加载 ai-config.js + ai-service.js，驱动已暴露接口）
// 测试对象 4 文件：只读，本脚本仅读取与运行，绝不修改。
// 覆盖：① 密钥专项（幂等清洗 + localStorage 无明文） ② 部分逻辑（settings 契约）
//       ③ R66 新功能（aiHealthCheck 第 2 参临时配置 + no_endpoint/no_key 错误码）
//       ④ 跨文件集成（buildChain 消费 disabled/overrides/catModels/selected）
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(require('path').join(process.env.NODE_PATH || 'C:/Users/ATM/node_modules', 'jsdom'));

const BASE = 'D:/下载的文件/学习工作台';
const AI_CONFIG = path.join(BASE, 'assets/ai-config.js');
const AI_SERVICE = path.join(BASE, 'assets/ai-service.js');

const out = [];
let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; out.push('[PASS] ' + name + (info ? '  ' + info : '')); }
  else { fail++; out.push('[FAIL] ' + name + (info ? '  ' + info : '')); }
}

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
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const win = dom.window;
  // fetch 置空：绝不真正发起 AI 请求（限频 10/分钟）；错误路径由 classifyHealthErr 处理
  Object.defineProperty(win, 'fetch', { value: undefined, configurable: true });
  win.localStorage.clear();

  // 顺序加载：先 AI_CONFIG（提供 window.AI_CONFIG），再 ai-service.js（需 AI_CONFIG 做自检）
  win.eval(fs.readFileSync(AI_CONFIG, 'utf8'));
  win.eval(fs.readFileSync(AI_SERVICE, 'utf8'));

  const aiGet = win.aiGetModelSettings;
  const aiService = win.AI_SERVICE;
  ok('① 接口暴露: aiGetModelSettings', typeof aiGet === 'function');
  ok('④ 接口暴露: AI_SERVICE.buildChain/findModel/applyOverrides',
     !!(aiService && aiService.buildChain && aiService.findModel && aiService.applyOverrides));
  ok('③ 接口暴露: aiHealthCheck（2 参签名）',
     typeof win.aiHealthCheck === 'function' && win.aiHealthCheck.length >= 2,
     'length=' + (win.aiHealthCheck ? win.aiHealthCheck.length : 'n/a'));

  // ===== ① 密钥专项：幂等清洗 =====
  // glm-4.7-flash -> provider zhipu -> 平台密钥 = PLATFORM_KEYS[0]
  const ZHIPU_KEY = PLATFORM_KEYS[0];
  const USER_KEY = 'USER-OWN-KEY-abc123';
  const dirty = {
    disabled: {}, order: [],
    overrides: {
      'glm-4.7-flash': {
        apiKey: ZHIPU_KEY,                 // 与平台密钥严格相等 -> 应被删除
        model: 'glm-4.7-flash', apiUrl: 'https://x', apiFormat: 'openai',
        extraHeaders: {}, temperature: 0.5, maxTokens: 1500, name: 'X', provider: 'zhipu', tag: 't'
      },
      'glm-4.5-flash': { apiKey: USER_KEY, model: 'glm-4.5-flash' }  // 用户自填 -> 应保留
    },
    catModels: {}, categories: [], health: {}, stars: {}
  };
  win.localStorage.setItem('ai_model_settings', JSON.stringify(dirty));
  const s1 = aiGet();
  // 平台相等 apiKey 被删除
  const e1 = s1.overrides['glm-4.7-flash'];
  ok('① 清洗: 平台相等 apiKey 已从 overrides[glm-4.7-flash] 删除',
     !(e1 && typeof e1.apiKey === 'string' && e1.apiKey === ZHIPU_KEY),
     'entry=' + JSON.stringify(e1));
  // 8 个其他字段无损
  const otherKeys = ['model','apiUrl','apiFormat','extraHeaders','temperature','maxTokens','name','provider','tag'];
  const lost = otherKeys.filter(function (k) { return !(e1 && e1.hasOwnProperty(k)); });
  ok('① 清洗: 其余 ' + otherKeys.length + ' 字段无损（glm-4.7-flash）', lost.length === 0,
     lost.length ? '缺失: ' + lost.join(',') : '');
  // 用户自填 key 保留
  ok('① 清洗: 用户自填 key 保留（glm-4.5-flash）',
     !!(s1.overrides['glm-4.5-flash'] && s1.overrides['glm-4.5-flash'].apiKey === USER_KEY));
  // 写回 localStorage 后无平台密钥明文
  const written = win.localStorage.getItem('ai_model_settings');
  const leaked = PLATFORM_KEYS.filter(function (k) { return written.indexOf(k) !== -1; });
  ok('① 写回: localStorage ai_model_settings 不含任何平台密钥明文', leaked.length === 0,
     leaked.length ? '泄漏: ' + leaked.join('|') : '');
  // 幂等：再次调用，无新增改动、仍无明文
  const s2 = aiGet();
  const written2 = win.localStorage.getItem('ai_model_settings');
  const leaked2 = PLATFORM_KEYS.filter(function (k) { return written2.indexOf(k) !== -1; });
  ok('① 幂等: 二次调用后仍无平台密钥明文', leaked2.length === 0);
  ok('① 幂等: 二次读取结构稳定（glm-4.5-flash 仍保留用户 key）',
     !!(s2.overrides['glm-4.5-flash'] && s2.overrides['glm-4.5-flash'].apiKey === USER_KEY));

  // localStorage 全量 dump 无明文（逐 key 逐值）
  let dumpLeak = [];
  for (let i = 0; i < win.localStorage.length; i++) {
    const k = win.localStorage.key(i);
    const v = win.localStorage.getItem(k);
    PLATFORM_KEYS.forEach(function (pk) { if (v && v.indexOf(pk) !== -1) dumpLeak.push(k); });
  }
  ok('① 全量 dump: 所有 localStorage key 值均不含 6 平台密钥明文', dumpLeak.length === 0,
     dumpLeak.length ? '命中 key: ' + dumpLeak.join(',') : '');

  // ===== ② settings 契约（7 字段）=====
  const sKeys = ['disabled','order','overrides','catModels','categories','health','stars'];
  const missing = sKeys.filter(function (k) { return !s1.hasOwnProperty(k); });
  ok('② 契约: aiGetModelSettings 返回 7 字段对象', missing.length === 0,
     missing.length ? '缺: ' + missing.join(',') : 'disabled/order/overrides/catModels/categories/health/stars 齐全');

  // ===== ③ aiHealthCheck 第 2 参临时配置 + no_endpoint/no_key =====
  // 无端点 -> no_endpoint（模型不在库 + cfgOverride 不带 apiUrl）
  const rNoEp = await win.aiHealthCheck('custom.null.id', {});
  ok('③ 健康: 缺端点返回 err=no_endpoint', rNoEp && rNoEp.err === 'no_endpoint',
     'err=' + (rNoEp && rNoEp.err));
  // 有端点无 key -> no_key
  const rNoKey = await win.aiHealthCheck('custom.null.id', { apiUrl: 'https://example.com/v1' });
  ok('③ 健康: 缺密钥返回 err=no_key', rNoKey && rNoKey.err === 'no_key',
     'err=' + (rNoKey && rNoKey.err));
  // 第 2 参临时配置：带 apiUrl+apiKey 时不读取 overrides（用库内 zhipu 模型 + 临时 key）
  // fetch=undefined -> 走 network 错误，但证明“未因缺 key 直接 no_key”，且未触碰 overrides
  const rTmp = await win.aiHealthCheck('glm-4.7-flash', { apiUrl: 'https://example.com/v1', apiKey: 'sk-temp-xyz' });
  ok('③ 健康: 临时配置（带 apiUrl+apiKey）未返回 no_key/no_endpoint（走真实请求路径）',
     rTmp && rTmp.err !== 'no_key' && rTmp.err !== 'no_endpoint',
     'err=' + (rTmp && rTmp.err));
  // 验证临时配置未落盘到 overrides（AI_SERVICE.healthCheck 不读不写 overrides）
  const afterHealth = JSON.parse(win.localStorage.getItem('ai_model_settings') || '{}');
  const ovEntry = afterHealth.overrides && afterHealth.overrides['glm-4.7-flash'];
  ok('③ 健康: 临时配置未写入 overrides（无持久化）',
     !(ovEntry && ovEntry.apiKey === 'sk-temp-xyz'),
     'overrides[glm-4.7-flash].apiKey=' + (ovEntry && ovEntry.apiKey));

  // ===== ④ 跨文件集成：buildChain 消费 settings =====
  win.localStorage.clear();
  // (a) 禁用模型不进链：general 默认 primary=glm-flash
  win.localStorage.setItem('ai_model_settings', JSON.stringify({
    disabled: { 'glm-flash': true }, order: [], overrides: {},
    catModels: {}, categories: [], health: {}, stars: {}
  }));
  const chainDisabled = aiService.buildChain('general', {});
  const idsDisabled = chainDisabled.map(function (m) { return m.id; });
  ok('④ 集成: 禁用模型（glm-flash）不进入 buildChain 链', idsDisabled.indexOf('glm-flash') === -1,
     'chain=' + idsDisabled.join('>'));

  // (b) overrides 合并生效（温度/上限）
  win.localStorage.setItem('ai_model_settings', JSON.stringify({
    disabled: {}, order: [],
    overrides: { 'glm-4.7-flash': { temperature: 0.25, maxTokens: 2222 } },
    catModels: {}, categories: [], health: {}, stars: {}
  }));
  const merged = aiService.applyOverrides(aiService.findModel('glm-4.7-flash'));
  ok('④ 集成: applyOverrides 合并 override 温度', merged.temperature === 0.25, 't=' + merged.temperature);
  ok('④ 集成: applyOverrides 合并 override 上限', merged.maxTokens === 2222, 'mt=' + merged.maxTokens);
  ok('④ 集成: override 标记 ownTemp/ownMaxT', merged.ownTemp === true && merged.ownMaxT === true);

  // (c) catModels 自定义链优先（用已验证的内置 id）
  win.localStorage.setItem('ai_model_settings', JSON.stringify({
    disabled: {}, order: [], overrides: {},
    catModels: { general: ['glm-4.5-flash', 'glm-4.7-flash'] },
    categories: [], health: {}, stars: {}
  }));
  const chainCat = aiService.buildChain('general', {});
  const idsCat = chainCat.map(function (m) { return m.id; });
  ok('④ 集成: catModels 自定义链置顶（首模型 glm-4.5-flash）',
     idsCat[0] === 'glm-4.5-flash', 'head=' + idsCat[0]);

  // (d) 手动选中模型置链首
  win.localStorage.setItem('ai_model_settings', JSON.stringify({
    disabled: {}, order: [], overrides: {},
    catModels: {}, categories: [], health: {}, stars: {}
  }));
  win.localStorage.setItem('ai_selected_model', 'glm-4.7-flash');
  const chainSel = aiService.buildChain('general', {});
  const idsSel = chainSel.map(function (m) { return m.id; });
  ok('④ 集成: 选中模型（glm-4.7-flash）置 buildChain 链首', idsSel[0] === 'glm-4.7-flash',
     'head=' + idsSel[0]);

  // (e) order：ai-page.js render 消费（此处仅验证 settings.order 被 aiGetModelSettings 正确回显）
  win.localStorage.setItem('ai_model_settings', JSON.stringify({
    disabled: {}, order: ['glm-4.5-flash','glm-4.7-flash'], overrides: {},
    catModels: {}, categories: [], health: {}, stars: {}
  }));
  const sOrder = aiGet();
  ok('④ 集成: settings.order 经 aiGetModelSettings 正确回显',
     Array.isArray(sOrder.order) && sOrder.order.length === 2 && sOrder.order[0] === 'glm-4.5-flash');

  out.push('');
  out.push('===== 行为测试汇总: PASS=' + pass + ' FAIL=' + fail + ' =====');
  fs.writeFileSync(path.join(BASE, 'tools/qa/r66_qa_behavior_result.txt'), out.join('\n'), 'utf8');
  console.log(out.join('\n'));
  console.log('EXIT ' + (fail === 0 ? 0 : 1));
})().catch(function (e) {
  fs.writeFileSync(path.join(BASE, 'tools/qa/r66_qa_behavior_result.txt'),
    out.join('\n') + '\n[ERROR] ' + (e && e.stack ? e.stack : e), 'utf8');
  console.log(out.join('\n'));
  console.log('[ERROR] ' + (e && e.stack ? e.stack : e));
  console.log('EXIT 2');
});
