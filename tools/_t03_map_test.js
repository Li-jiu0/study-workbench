// tools/_t03_map_test.js — mapToAiList 收窄为 usableIds（只写 name 子字段）
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('C:/Users/ATM/node_modules/jsdom');
const BASE = 'D:/下载的文件/学习工作台';
const JS = fs.readFileSync(path.join(BASE, 'assets/ai-settings.js'), 'utf8');

const builtinModels = [
  { id: 'glm-4.7', name: 'GLM-4.7', provider: 'zhipu', model: 'glm-4.7', types: ['general'], tag: '免费' },
  { id: 'ark-x', name: 'Ark X', provider: 'ark', model: 'arkx', types: ['general'], tag: '免费' }
];

const now = Date.now();
const seed = {
  disabled: { 'ark-x': true },
  order: ['ark-x', 'glm-4.7'],
  overrides: {
    'glm-4.7': { apiKey: 'KEEP', apiUrl: 'u1', name: 'oldname' },
    'ark-x': { apiKey: 'KEEP2', apiUrl: 'u2', name: 'oldnamex' }
  },
  catModels: {}, categories: [], stars: {},
  health: {
    'glm-4.7': { ok: true, ms: 3, err: null, at: now },
    'ark-x': { ok: false, ms: 0, err: 'http_500', at: now }
  }
};

const html = '<!DOCTYPE html><html><body>' +
  '<div id="setModelList"></div>' +
  '<div id="setSortModal"><button data-sort-act="map" id="mapBtn"></button>' +
  '<select id="setSortCatInner"></select><input type="checkbox" id="setHideUnavail"></div>' +
  '</body></html>';

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
const w = dom.window;
w.AI_CONFIG = { builtinModels: builtinModels, providers: {}, FUNC_TYPES: {}, modelDetails: {}, providerGroups: [] };
w.localStorage.setItem('ai_model_settings', JSON.stringify(seed));
w.aiHealthCheck = function () { return Promise.resolve({ ok: true, ms: 1 }); };

const errs = [];
w.addEventListener('error', function (e) { errs.push(String(e.message || e.error)); });
try { w.eval(JS); } catch (e) { errs.push('EVAL:' + e.message); }

setTimeout(function () {
  w.document.getElementById('mapBtn').click();
  const s = w.xtAiSettings.getState();
  const out = {
    errs: errs,
    ov_glm_name: s.overrides['glm-4.7'] && s.overrides['glm-4.7'].name,
    ov_glm_apikey: s.overrides['glm-4.7'] && s.overrides['glm-4.7'].apiKey,
    ov_glm_apiurl: s.overrides['glm-4.7'] && s.overrides['glm-4.7'].apiUrl,
    ov_arkx_exists: !!(s.overrides && s.overrides['ark-x']),
    ov_arkx_name: s.overrides['ark-x'] && s.overrides['ark-x'].name,
    ov_arkx_apikey: s.overrides['ark-x'] && s.overrides['ark-x'].apiKey,
    disabled_arkx_still: s.disabled['ark-x'] === true,
    disabled_glm_absent: !s.disabled['glm-4.7'],
    order0: s.order[0],
    order_has_both: s.order.indexOf('glm-4.7') >= 0 && s.order.indexOf('ark-x') >= 0,
    usable: w.xtAiSettings.usableIds ? w.xtAiSettings.usableIds() : null
  };
  fs.writeFileSync(path.join(BASE, 'tools', '_t03_map_out.json'), JSON.stringify(out, null, 1), 'utf8');
  console.log(JSON.stringify(out, null, 1));
}, 150);
