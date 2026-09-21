/* R11g（2026-09-21）：验证 gemini 走「服务端中转」而不是「拿 providers.gemini.apiKey 前端直连」。

背景：ai-service.js 的 xtResolveChannel() 是通道判定的唯一真源，其中
    var provKey = provider.apiKey ...; if (provKey) return { relay:false, key:provKey, from:"provider" };
只要 providers.<平台>.apiKey 是任意非空字符串，就会强制走前端直连。
R131 去掉明文 key 时，其余 6 家把 apiKey 字段整行删除，gemini 只把值换成作废占位串，
于是 gemini 一直绕过服务端中转、拿作废串直连 Google → 401/403。

本脚本直接抽取真实源码里的 xtResolveChannel 求值（不是重写一遍），用真 AI_CONFIG 喂它。
*/
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = 'D:/下载的文件/学习工作台';
const cfgSrc = fs.readFileSync(path.join(ROOT, 'assets/ai-config.js'), 'utf8');
const svcSrc = fs.readFileSync(path.join(ROOT, 'assets/ai-service.js'), 'utf8');

let fails = 0;
function ok(name, cond, extra) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (extra !== undefined ? '  ' + extra : ''));
  if (!cond) fails++;
}

// ---------- 1) 真 AI_CONFIG ----------
const logs = [];
const win = {};
const sb = { window: win, console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) } };
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(cfgSrc, sb, { filename: 'ai-config.js' });
const AI_CONFIG = win.AI_CONFIG;
ok('AI_CONFIG 已加载', !!AI_CONFIG);
ok('结构自检「结构校验通过」（没被回退成最小默认配置）',
   logs.some(l => l.indexOf('结构校验通过') >= 0),
   'builtinModels=' + (AI_CONFIG.builtinModels || []).length);

// ---------- 2) 抽取真实源码片段 ----------
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('未找到函数 ' + name);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}
function grabVar(src, name) {
  const i = src.indexOf('var ' + name + ' =');
  if (i < 0) throw new Error('未找到变量 ' + name);
  const j = src.indexOf(';', i);
  return src.slice(i, j + 1);
}

const pieces = [
  grabVar(svcSrc, 'XT_BUILTIN_PROVIDERS'),
  grabVar(svcSrc, 'XT_BYOK_PROVIDERS'),
  'function inList(arr, v) { for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true; return false; }',
  grabFn(svcSrc, 'xtIsBuiltinProvider'),
  grabFn(svcSrc, 'xtUserOwnKey'),
  grabFn(svcSrc, 'xtResolveChannel'),
  'return { xtResolveChannel: xtResolveChannel, XT_BYOK_PROVIDERS: XT_BYOK_PROVIDERS };'
].join('\n');
ok('成功从 ai-service.js 抽取真实判定逻辑', pieces.indexOf('xtResolveChannel') >= 0);

// ---------- 3) 用不同 localStorage 状态跑 ----------
function run(localKeys, cfgOverride) {
  const store = localKeys || {};
  const sandbox = {
    getConfig: function () { return cfgOverride || AI_CONFIG; },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return vm.runInContext('(function(){' + pieces + '})()', sandbox, { filename: 'xtResolveChannel-extract.js' });
}

const gm = { id: 'gm-flash-lite', provider: 'gemini', model: 'gemini-3.5-flash-lite', types: ['general'] };

console.log('\n=== A) 所有内置平台的 providers[].apiKey 必须都不存在（R131 口径） ===');
const provNames = Object.keys(AI_CONFIG.providers || {});
provNames.forEach(function (p) {
  const pv = AI_CONFIG.providers[p] || {};
  const has = Object.prototype.hasOwnProperty.call(pv, 'apiKey') && pv.apiKey !== null && pv.apiKey !== undefined && String(pv.apiKey) !== '';
  ok('providers.' + p + '.apiKey 不存在/为空（无前端直连后门）', !has,
     has ? '★ 仍是非空值 → 会强制前端直连' : '');
});

console.log('\n=== B) 无自备 Key：gemini 必须走服务端中转 ===');
let ch = run(null).xtResolveChannel(gm);
ok('relay = true（走 /api/ai/* 服务端中转）', ch.relay === true, JSON.stringify(ch));
ok('key = 空串（前端零 key）', ch.key === '', JSON.stringify(ch.key));
ok('from = "builtin"', ch.from === 'builtin', ch.from);
ok('★ 不再出现 from="provider"（修复前就是它导致拿作废串直连 Google）',
   ch.from !== 'provider', ch.from);

console.log('\n=== C) 有自备 Key（BYOK）：仍先中转，附 byokKey 供一次性直连回退 ===');
ch = run({ ai_user_key_gemini: 'USER-OWN-KEY' }).xtResolveChannel(gm);
ok('relay = true（先中转）', ch.relay === true, JSON.stringify(ch));
ok('byokKey 透传 = USER-OWN-KEY', ch.byokKey === 'USER-OWN-KEY', String(ch.byokKey));
ok('byokProvider = gemini', ch.byokProvider === 'gemini', String(ch.byokProvider));
ok('key 仍为空串（自备 Key 不进 key 字段直连）', ch.key === '', JSON.stringify(ch.key));

console.log('\n=== D) 对照：国内平台（ark）不受影响 ===');
ch = run({ ai_user_key_ark: 'SHOULD-BE-IGNORED' }).xtResolveChannel({ id: 'ark-v4-flash', provider: 'ark' });
ok('ark relay = true / key 空', ch.relay === true && ch.key === '', JSON.stringify(ch));
ok('ark 不因自备 Key 改走直连（内置 5 家禁令未破坏）', ch.relay === true, JSON.stringify(ch));

console.log('\n=== E) 模型级 apiKey（设置页自备 Key 组）仍应允许前端直连 ===');
ch = run(null).xtResolveChannel({ id: 'my-custom', provider: 'gemini', apiKey: 'MODEL-LEVEL-KEY' });
ok('模型自带 apiKey → relay=false / from="model"（该能力未被误伤）',
   ch.relay === false && ch.from === 'model' && ch.key === 'MODEL-LEVEL-KEY', JSON.stringify(ch));

console.log('\n=== F) 反事实复现：修复前「内置占位串」如何顶掉用户自己填的 Key ===');
// 构造修复前的状态：providers.gemini.apiKey 是一个非空占位串
const CfgPre = JSON.parse(JSON.stringify(AI_CONFIG));
CfgPre.providers.gemini.apiKey = 'AQ.***REDACTED-已泄露作废-需换新KEY***';
const USER_KEY = 'USER-OWN-GEMINI-KEY';
ch = run({ ai_user_key_gemini: USER_KEY }, CfgPre).xtResolveChannel(gm);
ok('修复前：provider.apiKey 非空 → from="provider"（抢先返回）', ch.from === 'provider', JSON.stringify(ch));
ok('★ 修复前：实际发出的 key 是内置占位串，不是用户的 Key',
   ch.key !== USER_KEY && String(ch.key).indexOf('REDACTED') >= 0, 'key=' + JSON.stringify(ch.key));
ok('★ 修复前：用户自备 Key 被完全忽略（byokKey 未透传 → BYOK 回退分支永不触发）',
   ch.byokKey === undefined, String(ch.byokKey));
ok('★ 修复前：relay=false，绕过服务端中转（作废串直连 Google → 401）', ch.relay === false, String(ch.relay));

// 同一份用户 Key，换成修复后的真配置
const chAfter = run({ ai_user_key_gemini: USER_KEY }).xtResolveChannel(gm);
ok('修复后：同一份用户 Key 被正确带出（byokKey 透传，可走 BYOK 直连回退）',
   chAfter.byokKey === USER_KEY && chAfter.relay === true, JSON.stringify(chAfter));

console.log('\nTOTAL_FAIL = ' + fails);
process.exit(fails ? 1 : 0);
