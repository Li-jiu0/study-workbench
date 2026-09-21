/* R88-M1 jsdom 行为级验证
 * 文件: assets/ai-page.js（需求1 R88-C 分类联动过滤）+ assets/ai-service.js（需求2 真实模型名）
 *
 * 运行: NODE_PATH=C:/Users/ATM/node_modules node tools/r88m1_jsdom_test.js
 *
 * A. 需求1（R88-C 分类联动过滤）：
 *    - 设置 ai_model_settings.lastSort.catKey='video' → 打开模型面板 → 仅剩支持视频生成的可见模型
 *    - 切回 catKey='' → 行数恢复为「全部」；且 ai_model_settings 中 catModels/overrides 键未被删（数据未删）
 *    - 叠加 health（hideUnavailable=true + health[id].ok=false）→ 分类与健康取【交集】
 * B. 需求2（真实模型名）：
 *    - 命中 /api/ai/chat 请求体，断言含 modelId（= 用户选中模型 id）
 *    - 服务端回 X-Ai-Model-Used → 本机账本 xt_ai_usage_v1 记录的 model == 真实模型名
 *    - 无 header 时 → 回落到选中模型的真实 model 串（ai-config.model），不伪造「平台名（默认模型串）」
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const PAGE_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'ai-page.js'), 'utf8');
const SVC_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'ai-service.js'), 'utf8');

const results = [];
function ok(cond, name, extra) {
  results.push((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? ('  :: ' + extra) : ''));
}

/* ============================ A. 需求1 ============================ */
function partA() {
  // 内置模型（含 video / imagegen / general 等分类）——覆盖 ai-config.builtinModels 的关键字段
  const AI_CONFIG = {
    builtinModels: [
      { id: 'auto', name: '自动（推荐）', provider: null, model: null, types: ['general', 'math', 'image', 'translate'], fallback: null },
      { id: 'ark-v4-flash', name: 'DeepSeek-V4-Flash', provider: 'ark', model: 'deepseek-v4-flash-ga-260731', types: ['general'], fallback: 'ark-doubao-mini' },
      { id: 'ark-doubao-pro', name: 'Doubao-Pro', provider: 'ark', model: 'doubao-seed-2-1-pro-260915', types: ['general', 'creative', 'longtext'], fallback: 'ark-v4-flash' },
      { id: 'sf-bge-m3', name: 'bge-m3', provider: 'siliconflow', model: 'BAAI/bge-m3', types: ['embedding'], fallback: null },
      // 视频生成（分类 key = video）
      { id: 'ark-seedance-video', name: 'Seedance-Video', provider: 'arkvideo', model: 'doubao-seedance-1-0-pro', types: ['video'], fallback: null },
      { id: 'ark-seedance-lite', name: 'Seedance-Lite', provider: 'arkvideo', model: 'doubao-seedance-1-0-lite', types: ['video'], fallback: null },
      // 图像生成（分类 key = imagegen）
      { id: 'ark-seedream-4-0415', name: 'Seedream-4.0', provider: 'arkimage', model: 'doubao-seedream-4-0-20260415', types: ['imagegen'], fallback: null },
      // 语音识别（分类 key = audio）
      { id: 'sf-sensevoice', name: 'SenseVoice', provider: 'siliconflow', model: 'FunAudioLLM/SenseVoiceSmall', types: ['audio'], fallback: null }
    ]
  };

  const html = `<!DOCTYPE html><html><body>
    <div id="aiModelBtn"></div>
    <div id="aiModelLabel"></div>
    <div id="aiModelPanel"><div id="aiModelList"></div></div>
    <input id="aiInput"><button id="aiSendBtn"></button>
    <div id="aiChat"><div id="aiMessages"></div></div>
    <div id="aiWelcome"></div>
    <div id="aiUserAvatar"></div><div id="aiUserName"></div>
  </body></html>`;

  const dom = new JSDOM(html, { url: 'https://example.com/', runScripts: 'outside-only' });
  const { window } = dom;
  const doc = window.document;

  window.AI_CONFIG = AI_CONFIG;
  window.lucideAutoRender = function () {};
  window.studyState = null;

  // 预置：分类筛选=视频生成（lastSort.catKey='video'）；保留一份 catModels/overrides 以便验证「未删数据」
  const settings = {
    disabled: {},
    order: [],
    overrides: { 'ark-v4-flash': { name: 'V4Flash改名' } },
    catModels: { video: ['ark-seedance-video', 'ark-seedance-lite'], general: ['ark-v4-flash'] },
    categories: [],
    health: {},
    stars: {},
    catSchema: {},
    hideUnavailable: false,
    lastSort: { mode: 'category', catKey: 'video', innerMode: '' }
  };
  window.localStorage.setItem('ai_model_settings', JSON.stringify(settings));

  // 执行 ai-page.js（IIFE；因 jsdom 此时 readyState='loading'，init 会挂到 DOMContentLoaded）
  window.eval(PAGE_SRC);
  // 触发 init()（jsdom outside-only 不会自动派发 DOMContentLoaded）
  doc.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

  const list = doc.getElementById('aiModelList');
  const btn = doc.getElementById('aiModelBtn');

  // 后续：直接派发 xt:health-changed（init 里绑定 onHealthChanged → renderModelList），
  // 规避 toggle 语义（重复点同一按钮会「关→开」交替）导致的空列表假象。
  function openPanel() { doc.dispatchEvent(new window.Event('xt:health-changed', { bubbles: true })); }
  function visibleIds() {
    const rows = list.querySelectorAll('.ai-mp-row[data-id]');
    return Array.prototype.map.call(rows, function (r) { return r.getAttribute('data-id'); })
      // 剔除常驻的「自动（推荐）」行：它不是具体模型，不受分类/健康过滤影响（设计如此）
      .filter(function (id) { return id !== 'auto'; });
  }

  // ---- 未筛选（catKey=''）基线 ----
  window.localStorage.setItem('ai_model_settings', JSON.stringify(Object.assign({}, settings, { lastSort: { mode: '', catKey: '', innerMode: '' } })));
  openPanel();
  const baseIds = visibleIds();
  ok(baseIds.length === 7, 'A1 无筛选：显示全部 7 个非 auto 模型', '实际 ' + baseIds.length + ' -> ' + JSON.stringify(baseIds));
  ok(baseIds.indexOf('ark-seedance-video') !== -1 && baseIds.indexOf('sf-bge-m3') !== -1 && baseIds.indexOf('ark-seedream-4-0415') !== -1,
     'A1b 无筛选：视频/嵌入/生图模型均在列（无遗漏）');

  // ---- 切到 catKey='video' ----
  window.localStorage.setItem('ai_model_settings', JSON.stringify(Object.assign({}, settings, { lastSort: { mode: 'category', catKey: 'video', innerMode: '' } })));
  openPanel();
  const videoIds = visibleIds();
  const videoOnly = videoIds.length === 2 && videoIds.indexOf('ark-seedance-video') !== -1 && videoIds.indexOf('ark-seedance-lite') !== -1;
  ok(videoOnly, 'A2 选「视频生成」：仅剩支持视频生成的 2 个模型（自动隐藏不匹配）', JSON.stringify(videoIds));

  // ---- 切到 catKey='imagegen' ----
  window.localStorage.setItem('ai_model_settings', JSON.stringify(Object.assign({}, settings, { lastSort: { mode: 'category', catKey: 'imagegen', innerMode: '' } })));
  openPanel();
  const imgIds = visibleIds();
  ok(imgIds.length === 1 && imgIds[0] === 'ark-seedream-4-0415', 'A3 切「图像生成」：仅剩 Seedream（列表实时更新）', JSON.stringify(imgIds));

  // ---- 切到 catKey='audio' ----
  window.localStorage.setItem('ai_model_settings', JSON.stringify(Object.assign({}, settings, { lastSort: { mode: 'category', catKey: 'audio', innerMode: '' } })));
  openPanel();
  const audIds = visibleIds();
  ok(audIds.length === 1 && audIds[0] === 'sf-sensevoice', 'A4 切「语音识别」：仅剩 SenseVoice', JSON.stringify(audIds));

  // ---- 切回 catKey='' → 恢复（数据未删）----
  window.localStorage.setItem('ai_model_settings', JSON.stringify(Object.assign({}, settings, { lastSort: { mode: '', catKey: '', innerMode: '' } })));
  openPanel();
  const restoredIds = visibleIds();
  ok(restoredIds.length === baseIds.length, 'A5 切回「无筛选」：行数立即恢复（可逆）', '恢复 ' + restoredIds.length + ' / 基线 ' + baseIds.length);

  // 数据未删：catModels / overrides 仍在 localStorage
  const after = JSON.parse(window.localStorage.getItem('ai_model_settings'));
  ok(after.catModels && after.catModels.video && after.catModels.video.length === 2, 'A6 隐藏期间未删 catModels.video（配置数据保留）');
  ok(after.overrides && after.overrides['ark-v4-flash'] && after.overrides['ark-v4-flash'].name === 'V4Flash改名', 'A7 隐藏期间未删 overrides（配置数据保留）');

  // ---- 叠加 health：交集语义 ----
  const healthOn = Object.assign({}, settings, {
    hideUnavailable: true,
    health: { 'ark-seedance-lite': { ok: false, err: 'network' } },
    lastSort: { mode: 'category', catKey: 'video', innerMode: '' }
  });
  window.localStorage.setItem('ai_model_settings', JSON.stringify(healthOn));
  openPanel();
  const interIds = visibleIds();
  // 视频分类有 2 个，其中一个健康检查失败 → 交集后只剩 1 个（ark-seedance-video）
  ok(interIds.length === 1 && interIds[0] === 'ark-seedance-video',
     'A8 分类×健康取交集：视频分类 2 个 ∩ 健康可用 1 个 = 1 个', JSON.stringify(interIds));

  // 健康过滤单独生效（分类取消时）——验证 R87 行为未被破坏
  const healthOnly = Object.assign({}, settings, {
    hideUnavailable: true,
    health: { 'ark-seedance-lite': { ok: false, err: 'network' } },
    lastSort: { mode: '', catKey: '', innerMode: '' }
  });
  window.localStorage.setItem('ai_model_settings', JSON.stringify(healthOnly));
  openPanel();
  const healthOnlyIds = visibleIds();
  ok(healthOnlyIds.indexOf('ark-seedance-lite') === -1 && healthOnlyIds.length === baseIds.length - 1,
     'A9 R87 健康过滤独立生效（未选分类时仍隐藏不可用模型）', JSON.stringify(healthOnlyIds));
}

/* ============================ B. 需求2 ============================ */
function partB() {
  const html = `<!DOCTYPE html><html><body></body></html>`;
  const dom = new JSDOM(html, { url: 'https://example.com/', runScripts: 'outside-only' });
  const { window } = dom;

  // ai-service.js 的 getConfig() 读全局 AI_CONFIG（builtinModels 用于 findModel；FUNC_TYPES 供直连链兜底）
  const SVC_CFG = {
    providers: {},
    systemPrompt: '',
    modelModes: {},
    maxMode: {},
    rateLimit: { maxCalls: 100, perSeconds: 60 },
    FUNC_TYPES: {
      general: { desc: '文本对话', primary: 'ark-v4-flash', fallback: ['ark-v4-flash'], temperature: 0.7, maxTokens: 1000 }
    },
    builtinModels: [
      { id: 'auto', name: '自动（推荐）', provider: null, model: null, types: ['general'], fallback: null },
      { id: 'ark-v4-flash', name: 'DeepSeek-V4-Flash', provider: 'ark', model: 'deepseek-v4-flash-ga-260731', types: ['general'], fallback: null }
    ]
  };
  window.AI_CONFIG = SVC_CFG;

  // 用户选中 ark-v4-flash（真实 model 串 = deepseek-v4-flash-ga-260731）
  window.localStorage.setItem('ai_selected_model', 'ark-v4-flash');
  window.STUDY_API_BASE = null;                 // relayBase() -> ''
  window.localStorage.setItem('study_workbench_token', 'test-token');

  let chatBody = null;                          // 捕获 /api/ai/chat 请求体
  let usedHeader = '';                          // 服务端回传的真实模型名

  window.fetch = function (url, opt) {
    const u = String(url);
    if (u.indexOf('/api/ai/models') !== -1) {
      const modelsJson = JSON.stringify({ models: [{ id: 'ark', name: '火山方舟' }] });
      return Promise.resolve({
        ok: true, status: 200,
        text: function () { return Promise.resolve(modelsJson); },
        json: function () { return Promise.resolve(JSON.parse(modelsJson)); }
      });
    }
    if (u.indexOf('/api/ai/chat') !== -1) {
      try { chatBody = JSON.parse((opt && opt.body) || '{}'); } catch (e) { chatBody = {}; }
      // 模拟服务端纯文本流式响应 + 真实模型名响应头
      return Promise.resolve({
        ok: true, status: 200,
        headers: { get: function (k) { return (String(k).toLowerCase() === 'x-ai-model-used') ? usedHeader : null; } },
        text: function () { return Promise.resolve('你好，我是模型回答。'); },
        body: null
      });
    }
    return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });
  };

  window.eval(SVC_SRC);
  const svc = window.AI_SERVICE;
  ok(svc && typeof svc.callAI === 'function', 'B0 AI_SERVICE.callAI 挂载存在');

  const p1 = svc.callAI('general', [{ role: 'user', content: '你好' }], {});
  return p1.then(function (res) {
    ok(!!chatBody, 'B1 命中 /api/ai/chat 请求');
    ok(chatBody && chatBody.modelId === 'ark-v4-flash',
       'B2 请求体含 modelId = 用户选中模型 id', 'body.modelId=' + (chatBody && chatBody.modelId));
    ok(chatBody && typeof chatBody.provider !== 'undefined' && Array.isArray(chatBody.messages),
       'B3 请求体旧字段 provider/messages 保持（向后兼容）');

    // 场景1：服务端回 X-Ai-Model-Used → 账本 model = 真实模型名
    usedHeader = 'deepseek-v4-flash-ga-260731';
    return svc.callAI('general', [{ role: 'user', content: '再来一次' }], {});
  }).then(function () {
    const raw = window.localStorage.getItem('xt_ai_usage_v1');
    const rows = JSON.parse(raw || '[]');
    const last = rows[rows.length - 1] || {};
    ok(last.model === 'deepseek-v4-flash-ga-260731',
       'B4 服务端回 X-Ai-Model-Used → 账本记录真实模型名', 'model=' + last.model);
  }).then(function () {
    // 场景2：服务端不回 header（跨域未暴露）→ 回落到选中模型真实 model 串，不伪造
    usedHeader = '';
    const dom2 = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.com/', runScripts: 'outside-only' });
    const w2 = dom2.window;
    w2.AI_CONFIG = SVC_CFG;
    w2.localStorage.setItem('ai_selected_model', 'ark-v4-flash');
    w2.STUDY_API_BASE = null;
    w2.localStorage.setItem('study_workbench_token', 'test-token');
    w2.fetch = function (url, opt) {
      const u = String(url);
      if (u.indexOf('/api/ai/models') !== -1) {
        const mj = JSON.stringify({ models: [{ id: 'ark', name: '火山方舟' }] });
        return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(mj); }, json: function () { return Promise.resolve(JSON.parse(mj)); } });
      }
      if (u.indexOf('/api/ai/chat') !== -1) {
        return Promise.resolve({
          ok: true, status: 200,
          headers: { get: function () { return null; } },      // 读不到 header
          text: function () { return Promise.resolve('回答'); },
          body: null
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });
    };
    w2.eval(SVC_SRC);
    return w2.AI_SERVICE.callAI('general', [{ role: 'user', content: 'hi' }], {}).then(function () {
      const rows = JSON.parse(w2.localStorage.getItem('xt_ai_usage_v1') || '[]');
      const last = rows[rows.length - 1] || {};
      // 选中 ark-v4-flash，其真实 model 串 = deepseek-v4-flash-ga-260731
      ok(last.model === 'deepseek-v4-flash-ga-260731',
         'B5 无 header 时回落到选中模型真实 model 串（不伪造平台名）', 'model=' + last.model);
      ok(last.model !== '火山方舟', 'B6 绝不显示为「平台名」（此前 Bug 的根因）');
    });
  });
}

partA();
partB().then(function () {
  const text = results.join('\n');
  fs.writeFileSync(path.join(ROOT, 'tools', 'r88m1_jsdom_out.txt'), text + '\n', 'utf8');
  console.log(text);
  const fails = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  console.log('\nRESULT: ' + (fails ? (fails + ' FAILED') : 'ALL PASS'));
}).catch(function (e) {
  fs.writeFileSync(path.join(ROOT, 'tools', 'r88m1_jsdom_out.txt'), results.join('\n') + '\nEXCEPTION: ' + (e && e.stack || e) + '\n', 'utf8');
  console.log(results.join('\n'));
  console.log('EXCEPTION: ' + (e && e.stack || e));
});
