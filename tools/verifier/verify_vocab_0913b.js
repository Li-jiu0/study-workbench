/**
 * 词库终验（第四批补完后，2236 词）
 * ---------------------------------------------------------------------------
 * V1 紧凑格式数据完整性：JSON 合法 / 2236 条 / 去重后 0 重复 / 与内置 466 词 0 冲突 /
 *                        字段严格 9 个且类型正确 / example 非空率
 * V2 jsdom 真实合并：CET_VOCAB = 2702、内置 466 词未被覆盖（离线基线 A/B 对照）、
 *                    合并路径 saveData 0 次、合并后无重复 word
 * V3 抽样质量：a–f 新补段 + s/t 段共 20 条，人工通读
 *
 * 注（QA 2026-09-13 批次四更新）：批次四新增 663 词后，词数期望值由 1573/2039
 * 同步为 2236/2702（旧值属「期望值过期」，非源码缺陷）。
 *
 * 用法：node tools/verifier/verify_vocab_0913b.js
 * 退出码：0=全部通过，1=存在失败断言
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const PAGE = path.join(ROOT, '学习工作台.html');
const INDEX_REL = 'assets/data/vocab-cet4-ext-index.json';

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) { ({ JSDOM, VirtualConsole } = require('c:\\Users\\ATM\\node_modules\\jsdom')); }

const results = [];
function assert(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// =========================================================================
// V1 静态检查
// =========================================================================
// 批次五：单文件已拆分为「索引 + 8 个按首字母区间分片」，此处读索引 + 遍历所有分片。
let idxObj = null;
let shards = [];
let words = [];
try {
  idxObj = JSON.parse(fs.readFileSync(path.join(ROOT, INDEX_REL), 'utf8'));
  shards = Array.isArray(idxObj.shards) ? idxObj.shards : [];
  shards.forEach(function (s) {
    const rel = String(s.file).split('?')[0];
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    (j.words || []).forEach(function (w) { words.push(w); });
  });
} catch (e) {
  assert('V1-0 分片索引与分片 JSON 合法（紧凑格式可解析）', false, e.message);
  console.log('JSON 解析失败，后续检查中止');
  process.exit(1);
}
assert('V1-0 分片索引与分片 JSON 合法（紧凑格式可解析）', true, '');
assert('V1-0b 索引 version = 20260913c', idxObj.version === '20260913c', String(idxObj.version));
assert('V1-0c 分片数 = 8', shards.length === 8, '实际 ' + shards.length);
assert('V1-1 词库共 2236 条（8 片合计）', words.length === 2236, '实际 ' + words.length);

const seen = {};
const dups = [];
words.forEach(function (w) {
  const k = String(w.word || '').toLowerCase().trim();
  if (!k) { dups.push('(空 word)'); return; }
  if (seen[k]) dups.push(k); else seen[k] = 1;
});
assert('V1-2 按 word.toLowerCase().trim() 去重后 0 重复', dups.length === 0, dups.slice(0, 8).join(', '));

// 字段严格 9 个、类型正确
const WANT = ['word', 'phonetic', 'meaning', 'root', 'collocation', 'synonym', 'antonym', 'example', 'example2'];
const fieldBad = [];
words.forEach(function (w) {
  const keys = Object.keys(w);
  const extra = keys.filter(function (k) { return WANT.indexOf(k) < 0; });
  const missing = WANT.filter(function (k) { return keys.indexOf(k) < 0; });
  const typeBad = [];
  ['word', 'phonetic', 'meaning', 'root', 'example', 'example2'].forEach(function (k) {
    if (w[k] !== undefined && typeof w[k] !== 'string') typeBad.push(k + ' 非字符串');
  });
  ['collocation', 'synonym', 'antonym'].forEach(function (k) {
    if (!Array.isArray(w[k])) typeBad.push(k + ' 非数组');
  });
  if (extra.length || missing.length || typeBad.length) {
    fieldBad.push(w.word + ': ' + [].concat(
      extra.length ? ['多余字段 ' + extra.join('/')] : [],
      missing.length ? ['缺字段 ' + missing.join('/')] : [],
      typeBad
    ).join('; '));
  }
});
assert('V1-3 每条词字段严格 9 个且类型正确（word/phonetic/meaning/root/example/example2 字符串，collocation/synonym/antonym 数组）',
  fieldBad.length === 0, fieldBad.slice(0, 6).join(' | '));

const noExample = words.filter(function (w) { return !String(w.example || '').trim(); });
assert('V1-4 example 非空 2236/2236', noExample.length === 0,
  '空 ' + noExample.length + ' 条：' + noExample.slice(0, 6).map(function (w) { return w.word; }).join(','));
const noMeaning = words.filter(function (w) { return !String(w.meaning || '').trim(); });
assert('V1-5 meaning 非空 2236/2236', noMeaning.length === 0,
  '空 ' + noMeaning.length + ' 条：' + noMeaning.slice(0, 6).map(function (w) { return w.word; }).join(','));

// 字母分布
const dist = {};
words.forEach(function (w) {
  const c = String(w.word || '').trim().toLowerCase().charAt(0);
  dist[c] = (dist[c] || 0) + 1;
});
console.log('字母分布：' + Object.keys(dist).sort().map(function (k) { return k + ':' + dist[k]; }).join(' '));

// =========================================================================
// V2 jsdom 真实合并
// =========================================================================
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
  return {
    ok: true, status: 200,
    json: function () { return Promise.resolve(obj); },
    text: function () { return Promise.resolve(JSON.stringify(obj)); }
  };
}
// mode='offline' 时屏蔽词库增量请求，得到「只含内置词」的基线
function boot(mode) {
  const uncaught = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) { uncaught.push('[jsdomError] ' + (e && e.message ? e.message : String(e))); });
  function fetchStub(u) {
    const url = String(u === undefined || u === null ? '' : u);
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
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
    beforeParse: function (window) {
      window.fetch = fetchStub;
      try {
        window.localStorage.setItem('study_workbench_auth',
          JSON.stringify({ account: 'qa', loginAt: Date.now() }));
      } catch (e) { /* 忽略 */ }
      window.addEventListener('error', function (e) { uncaught.push('[window.error] ' + ((e && e.message) || 'unknown')); });
      window.addEventListener('unhandledrejection', function (e) { uncaught.push('[unhandledrejection] ' + String(e && e.reason)); });
    }
  });
  return { dom: dom, win: dom.window, uncaught: uncaught };
}

(async function () {
  // ---- 离线基线：只有内置词 ----
  const off = boot('offline');
  await sleep(700);
  const offQ = off.win.__QV;
  const base = {};
  let baseLen = -1;
  if (offQ) {
    baseLen = offQ.len();
    offQ.vocab().forEach(function (w) { if (w && w.word) base[String(w.word).toLowerCase()] = w.meaning; });
  }
  off.dom.window.close();
  assert('V2-0 离线基线：内置 CET_VOCAB = 466 词', baseLen === 466, '实际 ' + baseLen);

  // ---- 在线合并 ----
  const on = boot('online');
  await sleep(900);
  const Q = on.win.__QV;
  assert('V2-1 探针注入成功', !!Q, Q ? '' : 'window.__QV 未定义');
  if (!Q) return finalize(on.uncaught, on, base);

  assert('V2-2 合并后 CET_VOCAB = 2702（内置 466 + 增量 2236）', Q.len() === 2702, '实际 ' + Q.len());

  const vocab = Q.vocab();
  const allWords = vocab.map(function (w) { return String(w.word || '').toLowerCase().trim(); });
  assert('V2-3 合并后无重复 word', new Set(allWords).size === allWords.length,
    '去重后 ' + new Set(allWords).size + ' / 原始 ' + allWords.length);

  // 内置词未被覆盖
  const overwritten = [];
  Object.keys(base).forEach(function (k) {
    const hit = vocab.filter(function (w) { return String(w.word || '').toLowerCase() === k; })[0];
    if (!hit) { overwritten.push(k + ' 丢失'); return; }
    if (hit.meaning !== base[k]) overwritten.push(k + ' 释义被改写');
  });
  assert('V2-4 内置 ' + Object.keys(base).length + ' 词未被增量覆盖（离线基线 A/B 对照）',
    overwritten.length === 0, overwritten.slice(0, 6).join(' | '));

  // 增量词确实进来了
  const extSet = {};
  words.forEach(function (w) { extSet[String(w.word).toLowerCase().trim()] = 1; });
  const missing = Object.keys(extSet).filter(function (k) { return allWords.indexOf(k) < 0; });
  assert('V2-5 增量 2236 词全部进入 CET_VOCAB（0 条丢失）', missing.length === 0,
    '缺 ' + missing.length + ' 条：' + missing.slice(0, 8).join(','));

  // saveData
  Q.resetSaveCalls();
  Q.loadVocabExt();
  await sleep(500);
  assert('V2-6 合并路径 saveData 调用 0 次', Q.saveCalls() === 0, '调用 ' + Q.saveCalls() + ' 次');
  assert('V2-7 重复调用 loadVocabExt 后总数仍为 2702（幂等，不重复追加）',
    Q.len() === 2702, '实际 ' + Q.len());

  finalize(on.uncaught, on, base);
})().catch(function (e) {
  console.error('verifier 异常：' + (e && e.stack ? e.stack : e));
  process.exit(1);
});

// =========================================================================
// V3 抽样（20 条：a–f 新补段 + s/t 段）
// =========================================================================
function sample() {
  function pick(letter, n) {
    const pool = words.filter(function (w) { return String(w.word).toLowerCase().charAt(0) === letter; });
    const out = [];
    const step = Math.max(1, Math.floor(pool.length / n));
    for (let i = 0; i < n && i * step < pool.length; i++) out.push(pool[i * step]);
    return out;
  }
  const picks = [].concat(
    pick('a', 3), pick('b', 2), pick('c', 2), pick('d', 2), pick('e', 2), pick('f', 2),
    pick('s', 4), pick('t', 3)
  );
  console.log('\n=== V3 抽样 ' + picks.length + ' 条（a–f 新补段 + s/t 段）===');
  const notUsed = [];
  picks.forEach(function (w) {
    const ex = String(w.example || '');
    const lw = String(w.word).toLowerCase();
    const used = ex.toLowerCase().indexOf(lw) >= 0;
    if (!used) notUsed.push(w.word);
    console.log('---');
    console.log('word: ' + w.word + '  ' + w.phonetic);
    console.log('meaning: ' + w.meaning);
    console.log('root: ' + (w.root || '(空)'));
    console.log('coll: ' + JSON.stringify(w.collocation) + '  syn: ' + JSON.stringify(w.synonym) + '  ant: ' + JSON.stringify(w.antonym));
    console.log('example: ' + ex);
    console.log('example2: ' + (w.example2 || '(空)'));
    console.log('例句中出现该词: ' + (used ? '是' : '否'));
  });
  assert('V3-1 抽样 20 条例句均含该词（词形完全匹配）', notUsed.length === 0,
    '未命中：' + notUsed.join(', ') + '（需人工确认是否为屈折变化）');
}

let finalized = false;
function finalize(uncaught, ctx, base) {
  if (finalized) return;
  finalized = true;
  sample();
  assert('V2-8 页面运行期间零未捕获异常', (uncaught || []).length === 0, (uncaught || []).slice(0, 4).join(' || '));

  const pass = results.filter(function (r) { return r.ok; }).length;
  const failed = results.filter(function (r) { return !r.ok; });
  console.log('');
  console.log('============================================================');
  console.log('词库终验（第四批补完 · 2236 词） · 页面：学习工作台.html');
  console.log('项目根：' + ROOT);
  console.log('============================================================');
  results.forEach(function (r, i) {
    console.log((r.ok ? '  [PASS] ' : '  [FAIL] ') + String(i + 1).padStart(2, '0') + '. ' + r.name +
      (r.ok ? '' : '   →   ' + r.detail));
  });
  console.log('============================================================');
  console.log('合计 ' + results.length + ' 项：通过 ' + pass + '，失败 ' + failed.length);
  console.log('结论：' + (failed.length === 0 ? 'PASS' : 'FAIL'));
  console.log('============================================================');
  if (ctx) { try { ctx.dom.window.close(); } catch (e) {} }
  process.exit(failed.length === 0 ? 0 : 1);
}
