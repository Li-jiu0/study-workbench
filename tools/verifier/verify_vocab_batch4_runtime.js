/**
 * 词库批次四（20260913b）运行时合并独立验证（jsdom）
 * ---------------------------------------------------------------------------
 * 覆盖任务点 D：loadVocabExt() 后 CET_VOCAB = 2702 / 内置 466 未被覆盖 /
 *               saveData 0 次 / 幂等 / 零未捕获异常
 * 结果写盘：tools/verifier/out_vocab_batch4_runtime.txt
 * 用法：node tools/verifier/verify_vocab_batch4_runtime.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = path.join(ROOT, '学习工作台.html');
const OUT = path.join(__dirname, 'out_vocab_batch4_runtime.txt');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) { ({ JSDOM, VirtualConsole } = require('c:\\Users\\ATM\\node_modules\\jsdom')); }

const L = [];
function log(s) { L.push(String(s)); }
const results = [];
function assert(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
  log((cond ? '  [PASS] ' : '  [FAIL] ') + name + (cond ? '' : '   ->   ' + detail));
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// 内联外链脚本
const rawHtml = fs.readFileSync(PAGE, 'utf8');
const SRC_RE = /<script\b[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
const html = rawHtml.replace(SRC_RE, function (m, src) {
  const rel = String(src).split('?')[0];
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return '<!-- 脚本缺失：' + rel + ' -->';
  const code = fs.readFileSync(fp, 'utf8');
  if (/<\/script/i.test(code)) throw new Error('脚本内含 </script 字面量：' + rel);
  return '<script>\n' + code + '\n</script>';
});

const PROBE = [
  '<script>',
  '(function () {',
  '  window.__qaSaveCalls = 0;',
  '  var __origSaveData = (typeof saveData === "function") ? saveData : function () {};',
  '  try { saveData = function () { window.__qaSaveCalls++; return __origSaveData.apply(null, arguments); }; } catch (e) {}',
  '  window.__QV = {',
  '    vocab: function () { return CET_VOCAB; },',
  '    len: function () { return CET_VOCAB.length; },',
  '    loadVocabExt: function () { return loadVocabExt(); },',
  '    saveCalls: function () { return window.__qaSaveCalls; },',
  '    resetSaveCalls: function () { window.__qaSaveCalls = 0; }',
  '  };',
  '})();',
  '</script>'
].join('\n');

function makeRes(obj) {
  return { ok: true, status: 200, json: function () { return Promise.resolve(obj); }, text: function () { return Promise.resolve(JSON.stringify(obj)); } };
}
function boot(mode) {
  const uncaught = [];
  const fetchLog = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { uncaught.push('[jsdomError] ' + (e && e.message ? e.message : String(e))); });
  function fetchStub(u) {
    const url = String(u === undefined || u === null ? '' : u);
    fetchLog.push(url);
    return Promise.resolve().then(function () {
      if (mode === 'offline' && /vocab-cet4-ext/.test(url)) {
        return { ok: false, status: 404, json: function () { return Promise.reject(new Error('404 ' + url)); } };
      }
      const rel = url.replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
      const fp = path.join(ROOT, rel);
      if (fp.indexOf(ROOT) !== 0 || !fs.existsSync(fp)) {
        return { ok: false, status: 404, json: function () { return Promise.reject(new Error('404 ' + rel)); } };
      }
      return makeRes(JSON.parse(fs.readFileSync(fp, 'utf8')));
    });
  }
  const dom = new JSDOM(html.indexOf('</body>') >= 0 ? html.replace(/<\/body>/i, PROBE + '\n</body>') : html + PROBE, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc,
    beforeParse: function (window) {
      window.fetch = fetchStub;
      try { window.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'qa', loginAt: Date.now() })); } catch (e) {}
      window.addEventListener('error', function (e) { uncaught.push('[window.error] ' + ((e && e.message) || 'unknown')); });
      window.addEventListener('unhandledrejection', function (e) { uncaught.push('[unhandledrejection] ' + String(e && e.reason)); });
    }
  });
  return { dom: dom, win: dom.window, uncaught: uncaught, fetchLog: fetchLog };
}

log('====================================================================');
log('词库批次四运行时合并验证（jsdom） · 项目根：' + ROOT);
log('====================================================================');

(async function () {
  // 离线基线
  const off = boot('offline');
  await sleep(800);
  const offQ = off.win.__QV;
  const base = {};
  let baseLen = -1;
  if (offQ) { baseLen = offQ.len(); offQ.vocab().forEach(function (w) { if (w && w.word) base[String(w.word).toLowerCase()] = w.meaning; }); }
  off.dom.window.close();
  assert('D0 离线基线：内置 CET_VOCAB = 466 词', baseLen === 466, '实际 ' + baseLen);

  // 在线合并
  const on = boot('online');
  await sleep(1000);
  const Q = on.win.__QV;
  assert('D1 探针注入成功', !!Q, Q ? '' : 'window.__QV 未定义');
  if (!Q) { finish(on.uncaught); return; }

  assert('D2 合并后 CET_VOCAB = 2702（内置 466 + 增量 2236）', Q.len() === 2702, '实际 ' + Q.len());

  const vocab = Q.vocab();
  const keys = vocab.map(function (w) { return String(w.word || '').toLowerCase().trim(); });
  assert('D3 合并后无重复 word（lower+trim）', new Set(keys).size === keys.length, '唯一 ' + new Set(keys).size + ' / 原始 ' + keys.length);
  const rawKeys = vocab.map(function (w) { return String(w.word || ''); });
  assert('D3b 合并后无重复 word（原始键，运行时真实去重键）', new Set(rawKeys).size === rawKeys.length, '唯一 ' + new Set(rawKeys).size + ' / 原始 ' + rawKeys.length);

  // 内置 466 未被覆盖
  const changed = [];
  Object.keys(base).forEach(function (k) {
    const hit = vocab.filter(function (w) { return String(w.word || '').toLowerCase() === k; })[0];
    if (!hit) { changed.push(k + ' 丢失'); return; }
    if (hit.meaning !== base[k]) changed.push(k + ' 释义被改写');
  });
  assert('D4 内置 ' + Object.keys(base).length + ' 词未被增量覆盖（离线基线 A/B 对照）', changed.length === 0, changed.slice(0, 8).join(' | '));

  // 增量是否全进入（批次五：读索引 + 遍历 8 片）
  const extIdx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/vocab-cet4-ext-index.json'), 'utf8'));
  const ext = { words: [] };
  (extIdx.shards || []).forEach(function (s) {
    const rel = String(s.file).split('?')[0];
    const sj = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    (sj.words || []).forEach(function (w) { ext.words.push(w); });
  });
  const extKeys = ext.words.map(function (w) { return String(w.word).toLowerCase().trim(); });
  const missing = extKeys.filter(function (k) { return keys.indexOf(k) < 0; });
  assert('D5 增量 2236 词全部进入 CET_VOCAB（0 条丢失）', missing.length === 0, '缺 ' + missing.length + '：' + missing.slice(0, 8).join(','));

  // saveData 0 次
  Q.resetSaveCalls();
  Q.loadVocabExt();
  await sleep(600);
  assert('D6 合并路径 saveData 调用 0 次', Q.saveCalls() === 0, '调用 ' + Q.saveCalls() + ' 次');
  assert('D7 再次调用 loadVocabExt 幂等（总数仍 2702）', Q.len() === 2702, '实际 ' + Q.len());

  // ---- 批次五任务B：并发加载 + 缓存版本注入 ----
  const flog = on.fetchLog || [];
  const shardReqs = flog.filter(function (u) { return /vocab-cet4-ext-[a-z]-[a-z]\.json/.test(u); });
  const uniqShards = Array.from(new Set(shardReqs.map(function (u) { return u.split('?')[0]; })));
  assert('E1 8 个词库分片均被真实请求（Promise.all 并发加载）', uniqShards.length === 8,
    '实际请求 ' + uniqShards.length + '：' + uniqShards.join(', '));
  assert('E2 所有分片请求均带缓存版本 ?v=20260913f', shardReqs.length > 0 && shardReqs.every(function (u) { return u.indexOf('?v=20260913f') >= 0; }),
    '样例 ' + shardReqs.slice(0, 2).join(' | '));
  assert('E3 词库索引请求带 ?v=20260913f', flog.some(function (u) { return u.indexOf('vocab-cet4-ext-index.json?v=20260913f') >= 0; }), '');
  const legacyReqs = flog.filter(function (u) { return /exam-bank\.json(\?|$)/.test(u) && !/exam-bank-ext/.test(u); });
  assert('E4 题库覆盖层 legacy(exam-bank.json) 仅被加载 1 次（去重比较已剥离 ?v=）', legacyReqs.length === 1,
    '实际 ' + legacyReqs.length + '：' + legacyReqs.join(', '));
  assert('E5 题库 legacy 请求带 ?v=20260913f', legacyReqs.length === 1 && legacyReqs[0].indexOf('?v=20260913f') >= 0, legacyReqs.join(', '));

  finish(on.uncaught);
})().catch(function (e) { log('verifier 异常：' + (e && e.stack ? e.stack : e)); finish([]); });

let done = false;
function finish(uncaught) {
  if (done) return; done = true;
  assert('D8 页面加载与运行期间零未捕获异常', (uncaught || []).length === 0, (uncaught || []).slice(0, 5).join(' || '));
  const pass = results.filter(function (r) { return r.ok; }).length;
  const failed = results.filter(function (r) { return !r.ok; });
  log('\n====================================================================');
  log('合计 ' + results.length + ' 项：通过 ' + pass + '，失败 ' + failed.length);
  log('结论：' + (failed.length === 0 ? 'PASS' : 'FAIL'));
  log('====================================================================');
  fs.writeFileSync(OUT, L.join('\n'), 'utf8');
  process.exit(failed.length === 0 ? 0 : 1);
}
