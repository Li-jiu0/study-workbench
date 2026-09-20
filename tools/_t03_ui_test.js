// tools/_t03_ui_test.js — 排序下拉/hideUnavailable/lastSort/退役角标/五段式
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('C:/Users/ATM/node_modules/jsdom');
const BASE = 'D:/下载的文件/学习工作台';
const JS = fs.readFileSync(path.join(BASE, 'assets/ai-settings.js'), 'utf8');

const builtinModels = [
  { id: 'glm-4.7', name: 'GLM-4.7', provider: 'zhipu', model: 'glm-4.7', types: ['general'], tag: '免费', fallback: 'ark-v4-flash' },
  { id: 'ark-seedance-1-5-pro', name: 'Seedance 1.5 pro', provider: 'ark', model: 'dq', types: ['video'], tag: '即将下线' },
  { id: 'sf-bge-m3', name: 'BGE-M3', provider: 'siliconflow', model: 'bge', types: ['embedding'], tag: '免费' }
];
const now = Date.now();
const seed = {
  disabled: {}, order: [], overrides: {}, catModels: {}, categories: [], stars: {},
  health: { 'glm-4.7': { ok: true, ms: 42, err: null, at: now } }
};

const html = '<!DOCTYPE html><html><body>' +
  '<button id="setRestoreDefault"></button>' +
  '<div id="setModelList"></div><div id="setIntroList"></div>' +
  '<div id="setSortModal" style="display:none">' +
  '  <button data-sort-act="avail" id="aBtn"></button>' +
  '  <button data-sort-act="cat" id="cBtn"></button>' +
  '  <div id="setSortCat"><select id="setSortCatInner"></select></div>' +
  '  <input type="checkbox" id="setHideUnavail">' +
  '  <div id="setSortPreview"></div>' +
  '</div>' +
  '</body></html>';

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
const w = dom.window;
w.AI_CONFIG = {
  builtinModels: builtinModels,
  providers: {}, FUNC_TYPES: {}, providerGroups: [],
  modelDetails: {
    'glm-4.7': { platform: '智谱AI', params: '30B', type: '通用文本', stars: 5, speed: '中', recommend: '日常问答首选', advantage: '中文理解强', applicable: '学习问答' },
    'ark-seedance-1-5-pro': { platform: '火山方舟', params: '', type: '视频生成（即将下线）', stars: 4, speed: '慢', advantage: '文生视频；约 10 万 tokens/次', applicable: '文生视频（过渡型号）' }
  }
};
w.localStorage.setItem('ai_model_settings', JSON.stringify(seed));
w.aiHealthCheck = function () { return Promise.resolve({ ok: true, ms: 1 }); };

const errs = [];
w.addEventListener('error', function (e) { errs.push(String(e.message || e.error)); });
try { w.eval(JS); } catch (e) { errs.push('EVAL:' + e.message); }

setTimeout(function () {
  const doc = w.document;
  // 打开排序弹窗 -> 填充分类下拉
  doc.getElementById('setRestoreDefault').click();
  const sel = doc.getElementById('setSortCatInner');
  const optCount = sel ? sel.querySelectorAll('option').length : -1;
  const optgroupCount = sel ? sel.querySelectorAll('optgroup').length : -1;

  // 选择「视频生成」并应用按分类排序
  if (sel) { sel.value = 'video'; }
  doc.getElementById('cBtn').click();

  // 打开 hideUnavailable
  const cb = doc.getElementById('setHideUnavail');
  cb.checked = true;
  cb.dispatchEvent(new w.Event('change', { bubbles: true }));

  const s = w.xtAiSettings.getState();

  // 渲染说明卡 + 模型列表，检查退役角标与五段式
  const introHost = doc.getElementById('setIntroList');
  const listHost = doc.getElementById('setModelList');
  const introHtml = introHost ? introHost.innerHTML : '';
  const listHtml = listHost ? listHost.innerHTML : '';
  const switches = doc.getElementById('setSortPreview');

  const out = {
    errs: errs,
    sortCat_options: optCount,
    sortCat_optgroups: optgroupCount,
    lastSort: s.lastSort,
    hideUnavailable: s.hideUnavailable,
    order: s.order,
    retire_badge_in_list: listHtml.indexOf('xt-set-badge-retire') >= 0,
    retire_badge_in_intro: introHtml.indexOf('xt-set-badge-retire') >= 0,
    intro_has_sec_what: introHtml.indexOf('这是什么') >= 0,
    intro_has_sec_ability: introHtml.indexOf('能做什么') >= 0,
    intro_has_sec_how: introHtml.indexOf('怎么用') >= 0,
    intro_has_sec_cost: introHtml.indexOf('耗时与计费') >= 0,
    intro_has_sec_advice: introHtml.indexOf('建议与替代') >= 0,
    intro_sec_count: (introHtml.match(/xt-set-intro-sec-t/g) || []).length,
    sortpreview_has_badge: switches ? switches.innerHTML.indexOf('xt-set-badge-retire') >= 0 : false
  };
  fs.writeFileSync(path.join(BASE, 'tools', '_t03_ui_out.json'), JSON.stringify(out, null, 1), 'utf8');
  console.log(JSON.stringify(out, null, 1));
}, 150);
