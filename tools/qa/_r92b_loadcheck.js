/**
 * R92-B verify: load assets/ai-config.js in node, assert:
 *  V1 loads without syntax/runtime error
 *  V2 models array length decreased by exactly 3 (baseline 37 -> 34)
 *  V3 none of the 3 removed ids present anywhere (models/modelDetails/modes/fallbacks)
 *  V4 no dangling fallback: every model.fallback points to an existing id
 *  V5 kept models ark-seedance-1-0-pro / -pro-fast still present
 *  V6 modelModes chains contain no removed id
 * Output redirected to txt (stdout capture broken in this env).
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');
var OUT = path.join(ROOT, 'tools', 'qa', 'r92b_loadcheck.txt');
var lines = [];
var pass = 0, fail = 0;
function ok(n, c, d) {
  if (c) { pass++; lines.push('  PASS  ' + n + (d ? '  :: ' + d : '')); }
  else { fail++; lines.push('  FAIL  ' + n + (d ? '  :: ' + d : '')); }
}

var src = fs.readFileSync(path.join(ROOT, 'assets', 'ai-config.js'), 'utf8');
var sandbox = { window: {}, console: console };
try {
  vm.runInNewContext(src, sandbox, { filename: 'ai-config.js' });
  ok('V1 ai-config.js loads without error', true);
} catch (e) {
  ok('V1 ai-config.js loads without error', false, e.message);
}

var cfg = sandbox.AI_CONFIG || (sandbox.window && sandbox.window.AI_CONFIG);
ok('V1b AI_CONFIG exported', !!cfg);

var REMOVED = ['ark-seedance-1-5-pro', 'ark-seedance-1-0-lite-t2v', 'ark-seedance-1-0-lite-i2v'];
if (cfg) {
  var models = cfg.builtinModels || cfg.models || [];
  var ids = models.map(function (m) { return m.id; });
  lines.push('  [info] builtinModels.length=' + ids.length);
  ok('V2 builtinModels = 47 - 3 = 44 (removed exactly 3)', ids.length === 44, 'len=' + ids.length);

  var allJson = JSON.stringify(cfg);
  var leak = REMOVED.filter(function (id) { return allJson.indexOf(id) >= 0; });
  ok('V3 no removed id anywhere in AI_CONFIG', leak.length === 0, leak.join(',') || 'clean');

  var dangling = models.filter(function (m) {
    return m.fallback && ids.indexOf(m.fallback) < 0;
  }).map(function (m) { return m.id + '->' + m.fallback; });
  ok('V4 no dangling fallback references', dangling.length === 0, dangling.join(',') || 'clean');

  ok('V5a kept ark-seedance-1-0-pro', ids.indexOf('ark-seedance-1-0-pro') >= 0);
  ok('V5b kept ark-seedance-1-0-pro-fast', ids.indexOf('ark-seedance-1-0-pro-fast') >= 0);

  var modeLeak = [];
  Object.keys(cfg.modelModes || {}).forEach(function (k) {
    (cfg.modelModes[k].chain || []).forEach(function (id) {
      if (REMOVED.indexOf(id) >= 0) modeLeak.push(k + ':' + id);
    });
  });
  ok('V6 modelModes chains clean', modeLeak.length === 0, modeLeak.join(',') || 'clean');

  // MODEL_INFO: video keys around deletion point still intact
  var mi = cfg.modelDetails || cfg.MODEL_INFO || {};
  lines.push('  [info] modelDetails keys=' + Object.keys(mi).length);
  ok('V7 modelDetails has kept seedance entries',
     !!mi['ark-seedance-1-0-pro'] && !!mi['ark-seedance-1-0-pro-fast']);
}

lines.push('SUMMARY pass=' + pass + ' fail=' + fail);
lines.push(fail === 0 ? 'R92B_LOAD_PASS' : 'R92B_LOAD_FAIL');
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
process.exit(fail === 0 ? 0 : 1);
