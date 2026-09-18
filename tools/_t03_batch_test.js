// tools/_t03_batch_test.js — 批量排除 probeNoAuto + 单模型二次确认（jsdom）
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('C:/Users/ATM/node_modules/jsdom');
const BASE = 'D:/下载的文件/学习工作台';
const JS = fs.readFileSync(path.join(BASE, 'assets/ai-settings.js'), 'utf8');

const builtinModels = [
  { id: 'glm-4.7', name: 'GLM-4.7', provider: 'zhipu', model: 'glm-4.7', types: ['general'], tag: '免费' },
  { id: 'ark-seedance-1-0-pro', name: 'Seedance 1.0 pro', provider: 'ark', model: 'dq', types: ['video'], tag: '免费' },
  { id: 'ark-seed3d-2-0', name: 'Seed3D 2.0', provider: 'ark', model: 'dq', types: ['3d'], tag: '免费' }
];

const html = '<!DOCTYPE html><html><body>' +
  '<button id="setBatchHealth"></button><span id="setBatchHealthTxt"></span>' +
  '<div id="setModelList"></div><div id="setSortModal"><select id="setSortCatInner"></select>' +
  '<input type="checkbox" id="setHideUnavail"></div>' +
  '</body></html>';

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
const w = dom.window;
w.AI_CONFIG = { builtinModels: builtinModels, providers: {}, FUNC_TYPES: {}, modelDetails: {}, providerGroups: [] };

// mock 能力注册表：video / 3d 的 cap 置 probeNoAuto
const capsByType = {
  video: { key: 'video', types: ['video'], probeNoAuto: true },
  '3d': { key: 'model3d', types: ['3d'], probeNoAuto: true },
  general: null
};
w.XT_AI_CAPS = { byType: function (t) { return capsByType[t] || null; } };

const batchCalls = [];
const healthCalls = [];
w.aiHealthCheck = function (id) { healthCalls.push(id); return Promise.resolve({ ok: true, ms: 5 }); };
w.aiHealthCheckBatch = function (id) { batchCalls.push(id); return Promise.resolve({ ok: true, ms: 5 }); };

let confirmMsg = null;
w.uiConfirm = function (msg) { confirmMsg = msg; return Promise.resolve(false); };  // 拒绝

const bootErrs = [];
w.addEventListener('error', function (e) { bootErrs.push(String(e.message || e.error)); });
try { w.eval(JS); } catch (e) { bootErrs.push('EVAL:' + e.message); }

setTimeout(function () {
  // 1) 批量检测（boot 完成后）
  w.document.getElementById('setBatchHealth').click();

  // 2) 单模型检测 video（点「检测」按钮）
  const listHost = w.document.getElementById('setModelList');
  const btns = listHost.querySelectorAll ? listHost.querySelectorAll('[data-test]') : [];
  let videoBtn = null;
  for (let i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute('data-test') === 'ark-seedance-1-0-pro') { videoBtn = btns[i]; }
  }
  if (videoBtn) { videoBtn.click(); }

  setTimeout(function () {
    const out = {
      boot_errors: bootErrs,
      has_xtAiSettings: !!(w.xtAiSettings),
      batch_calls: batchCalls,
      health_calls: healthCalls,
      video_in_batch: batchCalls.indexOf('ark-seedance-1-0-pro') >= 0,
      d3_in_batch: batchCalls.indexOf('ark-seed3d-2-0') >= 0,
      text_in_batch: batchCalls.indexOf('glm-4.7') >= 0,
      video_row_found: !!videoBtn,
      uiConfirm_called: !!confirmMsg,
      confirm_msg_has_cost: !!(confirmMsg && confirmMsg.indexOf('103,818') >= 0 && confirmMsg.indexOf('19') >= 0),
      video_health_called_after_reject: healthCalls.indexOf('ark-seedance-1-0-pro') >= 0
    };
    fs.writeFileSync(path.join(BASE, 'tools', '_t03_batch_out.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out, null, 1));
  }, 40);
}, 120);
