// tools/_t03_migrate_test.js — 迁移幂等 + 契约实测（jsdom）
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('C:/Users/ATM/node_modules/jsdom');

const BASE = 'D:/下载的文件/学习工作台';
const JS = fs.readFileSync(path.join(BASE, 'assets/ai-settings.js'), 'utf8');
const LS_KEY = 'ai_model_settings';

const builtinModels = [
  { id: 'glm-4.7', name: 'GLM-4.7', provider: 'zhipu', model: 'glm-4.7', types: ['general'], tag: '免费' },
  { id: 'sf-hunyuan-mt-7b', name: 'Hunyuan-MT-7B', provider: 'siliconflow', model: 'tencent/Hunyuan-MT-7B', types: ['general', 'translate'], tag: '免费', fallback: 'ark-v4-flash' },
  { id: 'sf-bge-m3', name: 'BGE-M3', provider: 'siliconflow', model: 'BAAI/bge-m3', types: ['embedding'], tag: '免费' },
  { id: 'ark-seedance-1-0-pro', name: 'Seedance 1.0 pro', provider: 'ark', model: 'doubao-seedance-1-0-pro-250528', types: ['video'], tag: '免费', fallback: 'ark-seedance-1-0-pro-fast' },
  { id: 'ark-seedance-1-5-pro', name: 'Seedance 1.5 pro', provider: 'ark', model: 'doubao-seedance-1-5-pro-251215', types: ['video'], tag: '即将下线' },
  { id: 'ark-seed3d-2-0', name: 'Seed3D 2.0', provider: 'ark', model: 'doubao-seed3d-2-0-260328', types: ['3d'], tag: '免费' },
  { id: 'glm-4v-flash', name: 'GLM-4V-Flash', provider: 'zhipu', model: 'glm-4v-flash', types: ['image'], tag: '免费' },
  { id: 'ark-seedream-4-0828', name: 'Seedream', provider: 'ark', model: 'doubao-seedream-4-0828', types: ['imagegen'], tag: '免费' }
];

const SEED = {
  disabled: {}, order: [], overrides: {}, categories: [], health: {}, stars: {},
  catModels: {
    general: ['glm-4.7', 'sf-hunyuan-mt-7b', 'sf-bge-m3', 'ark-seedance-1-0-pro', 'glm-4v-flash', 'ark-seedance-1-5-pro'],
    // 用户已存在的 translate 桶（R72-15 曾被清洗；R87 恢复，不应再被删）
    translate: ['sf-hunyuan-mt-7b']
  }
};

function runOnce(seedJSON) {
  const html = '<!DOCTYPE html><html><body>' +
    '<div id="setSortModal" style="display:none"><button data-sort-act="cat"></button>' +
    '<div id="setSortCat"><select id="setSortCatInner"></select></div>' +
    '<input type="checkbox" id="setHideUnavail"></div>' +
    '<div id="setModelList"></div><div id="setFuncList"></div><div id="setIntroList"></div>' +
    '<div id="setAboutList"></div><div id="setUsageRoot"></div>' +
    '</body></html>';
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
  const w = dom.window;
  w.AI_CONFIG = {
    builtinModels: builtinModels,
    providers: {}, FUNC_TYPES: {}, modelDetails: {}, providerGroups: []
  };
  if (seedJSON) { w.localStorage.setItem(LS_KEY, seedJSON); }
  const errs = [];
  w.addEventListener('error', function (e) { errs.push(String(e.message || e.error)); });
  try { w.eval(JS); } catch (e) { errs.push('EVAL: ' + e.message); }
  const store = w.localStorage.getItem(LS_KEY);
  let state = null;
  try { state = w.xtAiSettings.getState(); } catch (e) { errs.push('getState: ' + e.message); }
  return { stored: store, state: state, errs: errs, w: w };
}

const seedStr = JSON.stringify(SEED);
const r1 = runOnce(seedStr);
const r2 = runOnce(r1.stored);
const r3 = runOnce(r2.stored);

const out = {
  errs_r1: r1.errs, errs_r2: r2.errs, errs_r3: r3.errs,
  r1_catModels: r1.state ? r1.state.catModels : null,
  r1_catSchema: r1.state ? r1.state.catSchema : null,
  r2_eq_r3_stored: r2.stored === r3.stored,
  r1_eq_r2_stored: r1.stored === r2.stored,
  r2_stored: r2.stored,
  r3_stored: r3.stored,
  // 契约字段
  hideUnavailable_r1: r1.state ? r1.state.hideUnavailable : null,
  has_lastSort: !!(r1.state && r1.state.lastSort),
  usageRoot_first: (function () {
    var p = r1.w.document.getElementById('setPanelAbout');
    return false; // 本 mock 未含 setPanelAbout
  })()
};
fs.writeFileSync(path.join(BASE, 'tools', '_t03_migrate_out.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('run1 catSchema=', out.r1_catSchema);
console.log('catModels=', JSON.stringify(out.r1_catModels));
console.log('idempotent r2==r3 stored:', out.r2_eq_r3_stored, ' r1==r2 stored:', out.r1_eq_r2_stored);
console.log('errs:', JSON.stringify(out.errs_r1.concat(out.errs_r2, out.errs_r3)));
