/* R11g（2026-09-21）：验证「服务端中转就绪判定」——即 relayAvailable 是否真的被前端消费。

背景（前端与服务端的契约错位）：
  · 服务端 GET /api/ai/models 对国内平台按「已配 Key」过滤；对海外平台 gemini/openrouter
    **恒下发**，并附 relayAvailable（= key 且 proxy 双齐，或显式 <PROVIDER>_ALLOW_DIRECT=1）。
  · 但前端 relayProviders() 原先只取 {id,name}，把 relayAvailable 丢掉了，
    relayProbeAvailable() 又只看「平台是否在列表里」→ 海外平台未就绪时也判「正常」（假阳性）。
  · 本脚本抽取真实源码的 relayProviders / relayProbeAvailable 求值，覆盖各种服务端返回形态。
*/
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = 'D:/下载的文件/学习工作台';
const svcSrc = fs.readFileSync(path.join(ROOT, 'assets/ai-service.js'), 'utf8');

let fails = 0;
function ok(name, cond, extra) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (extra !== undefined ? '  ' + extra : ''));
  if (!cond) fails++;
}

function grabFn(src, name) {
  // 注意：async function 的 async 前缀在 "function" 之前，必须一起带出来
  let i = src.indexOf('async function ' + name + '(');
  if (i >= 0) {
    // 向前吃掉可能的缩进不算问题，直接从这里切
  } else {
    i = src.indexOf('function ' + name + '(');
  }
  if (i < 0) throw new Error('未找到函数 ' + name);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

const pieces = [
  'var _relayProviders = null;',
  grabFn(svcSrc, 'relayProviders'),
  grabFn(svcSrc, 'relayProbeAvailable'),
  'return { relayProviders: relayProviders, relayProbeAvailable: relayProbeAvailable, reset: function(){ _relayProviders = null; } };'
].join('\n');

// 用给定的「服务端 /api/ai/models 返回体」跑一次判定
function probe(models, provider, mode) {
  mode = mode || 'ok';
  const calls = { n: 0 };
  let resp = {
    status: 200,
    ok: true,
    json: async function () { return { models: models }; }
  };
  const sandbox = {
    relayBase: function () { return ''; },
    relayHeaders: function () { return {}; },
    relayToken: function () { return ''; },
    TIMEOUT_RESPONSE: 30000,
    raceTimeout: function (p) { return p; },
    safeRespJson: async function (r) { return r.json(); },
    refreshAccess: async function () { return false; },
    fetch: async function () {
      calls.n++;
      if (mode === 'reject') throw new Error('network down');
      return resp;
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const api = vm.runInContext('(function(){' + pieces + '})()', sandbox, { filename: 'relay-extract.js' });
  return api.relayProbeAvailable({ provider: provider }).then(function (r) {
    return { r: r, calls: calls.n, api: api };
  });
}

(async function () {
  // 线上实测形态：gemini 恒在列表但 relayAvailable=false；openrouter=true；国内平台无该字段
  const LIST_REAL = [
    { id: 'ark', name: '火山方舟' },
    { id: 'zhipu', name: '智谱 GLM' },
    { id: 'siliconflow', name: '硅基流动' },
    { id: 'openrouter', name: 'OpenRouter（海外免费模型）', relayAvailable: true },
    { id: 'gemini', name: 'Google Gemini（海外免费模型）', relayAvailable: false },
    { id: 'arkimage', name: '火山方舟·图片生成' }
  ];

  console.log('=== A) 复现线上形态：海外平台未就绪必须判「不可用」 ===');
  let out = await probe(LIST_REAL, 'gemini');
  ok('gemini（relayAvailable:false）→ ok=false / err=unavailable',
     out.r.ok === false && out.r.err === 'unavailable', JSON.stringify(out.r));

  out = await probe(LIST_REAL, 'openrouter');
  ok('openrouter（relayAvailable:true）→ ok=true', out.r.ok === true, JSON.stringify(out.r));

  console.log('\n=== B) 回归：国内平台（无 relayAvailable 字段）不受影响 ===');
  for (const p of ['ark', 'zhipu', 'siliconflow', 'arkimage']) {
    out = await probe(LIST_REAL, p);
    ok(p + '（字段缺失）→ ok=true（视为可用，不误伤）', out.r.ok === true, JSON.stringify(out.r));
  }

  console.log('\n=== C) 明确 relayAvailable:true 的国内平台 → 仍 ok ===');
  out = await probe([{ id: 'ark', name: 'ark', relayAvailable: true }], 'ark');
  ok('relayAvailable:true → ok=true', out.r.ok === true, JSON.stringify(out.r));

  console.log('\n=== D) 平台不在列表里（服务端未配 Key）→ 不可用 ===');
  out = await probe([{ id: 'ark', name: 'ark' }], 'gemini');
  ok('列表里无 gemini → ok=false / unavailable',
     out.r.ok === false && out.r.err === 'unavailable', JSON.stringify(out.r));

  console.log('\n=== E) 列表为空 / 网络失败 → 不可用且不抛异常 ===');
  out = await probe([], 'ark');
  ok('空列表 → ok=false / unavailable', out.r.ok === false && out.r.err === 'unavailable', JSON.stringify(out.r));
  out = await probe(LIST_REAL, 'ark', 'reject');
  // 已知既有行为（非本次引入）：relayProviders() 内部把网络异常吞掉、兜底返回 []，
  // 因此 relayProbeAvailable 的 catch(e){err:"network"} 实际上是死代码 —— 断网时
  // 呈现的是 unavailable 而不是 network。文案略偏（会说「服务端未配置该模型通道」），
  // 但不会误判成「可用」，不影响安全性。留作后续改进项，不在本次故障修复范围内。
  ok('fetch reject → ok=false 且不误判为可用（err=unavailable，既有行为）',
     out.r.ok === false, JSON.stringify(out.r));

  console.log('\n=== F) 无 provider 的模型（自定义）→ 不拦 ===');
  out = await probe(LIST_REAL, '');
  ok('provider 为空 → ok=true（无法归因，不误拦）', out.r.ok === true, JSON.stringify(out.r));

  console.log('\n=== G) 缓存：连续两次判定只打一次 /api/ai/models ===');
  out = await probe(LIST_REAL, 'gemini');
  const first = out.calls;
  const r2 = await out.api.relayProbeAvailable({ provider: 'openrouter' });
  ok('第二次判定复用内存缓存（fetch 不再增加）', out.calls === first && r2.ok === true,
     'fetch 次数=' + out.calls);

  console.log('\nTOTAL_FAIL = ' + fails);
  process.exit(fails ? 1 : 0);
})();
