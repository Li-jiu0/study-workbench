/* R11d：前端「7 新模型接入 + 额度耗尽自动隐藏」一致性校验。
   在 node vm 里真加载 assets/ai-config.js，并正则抽取 assets/ai-page.js 的三张兜底表。
   断言：
     ① 7 个新 id 都在 builtinModels，且 model 字段与上游模型名一致；
     ② FUNC_TYPES.video.primary === "ark-seedance-1-0-pro"；
     ③ 全表无悬空 fallback / primary（自行重算一遍）；
     ④ 7 个 id 在 ai-page.js 的 MODEL_RATES / MODEL_DETAILS / FALLBACK_MODELS 三处都出现，
        且 FALLBACK_MODELS 里的 model 串与 ai-config 一致。 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = 'D:/下载的文件/学习工作台';

const logs = [];
const win = {};
const sandbox = {
  window: win,
  console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/ai-config.js'), 'utf8'), sandbox, { filename: 'ai-config.js' });

let fails = 0;
function ok(name, cond, extra) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
}

const cfg = win.AI_CONFIG;
const page = fs.readFileSync(path.join(ROOT, 'assets/ai-page.js'), 'utf8');

/* 7 个新模型：id -> 上游 model 串（与 ai-config.js 一致） */
const NEWMODELS = [
  { id: 'ark-seedream-5-0-pro',        model: 'doubao-seedream-5-0-pro-260628' },
  { id: 'ark-seedance-1-0-pro',        model: 'doubao-seedance-1-0-pro-250528' },
  { id: 'ark-seedance-1-0-pro-fast',   model: 'doubao-seedance-1-0-pro-fast-251015' },
  { id: 'ark-hyper3d-gen2',            model: 'hyper3d-gen2-260112' },
  { id: 'ark-seed-2-1-pro-260628',     model: 'doubao-seed-2-1-pro-260628' },
  { id: 'ark-seed-2-0-pro',            model: 'doubao-seed-2-0-pro-260215' },
  { id: 'ark-smart-router',            model: 'doubao-smart-router-250928' }
];

const allIds = (cfg.builtinModels || []).map(x => x.id);
const idSet = {};
allIds.forEach(i => { idSet[i] = 1; });

console.log('=== 1) ai-config.js builtinModels：7 个新模型 ===');
NEWMODELS.forEach(nm => {
  const arr = (cfg.builtinModels || []).filter(x => x.id === nm.id);
  ok('存在且仅一次 ' + nm.id, arr.length === 1);
  ok('model = ' + nm.model, arr.length === 1 && arr[0].model === nm.model,
     arr.length === 1 ? arr[0].model : '');
});
ok('builtinModels 总数 = 69', (cfg.builtinModels || []).length === 69,
   'count=' + (cfg.builtinModels || []).length);

console.log('=== 2) FUNC_TYPES.video 已重新接入 ===');
ok('FUNC_TYPES.video.primary = ark-seedance-1-0-pro',
   cfg.FUNC_TYPES.video && cfg.FUNC_TYPES.video.primary === 'ark-seedance-1-0-pro',
   cfg.FUNC_TYPES.video && String(cfg.FUNC_TYPES.video.primary));
ok('FUNC_TYPES.video.fallback 含 fast 版',
   !!(cfg.FUNC_TYPES.video && (cfg.FUNC_TYPES.video.fallback || []).indexOf('ark-seedance-1-0-pro-fast') >= 0));

console.log('=== 3) 全表悬空引用总检（自行重算）===');
const dangling = [];
(cfg.builtinModels || []).forEach(m => {
  if (typeof m.fallback === 'string' && m.fallback && !idSet[m.fallback]) {
    dangling.push('model ' + m.id + '.fallback -> ' + m.fallback);
  }
});
Object.keys(cfg.FUNC_TYPES || {}).forEach(k => {
  const ft = cfg.FUNC_TYPES[k] || {};
  if (ft.primary && !idSet[ft.primary]) dangling.push('FUNC_TYPES.' + k + '.primary -> ' + ft.primary);
  (ft.fallback || []).forEach(x => { if (x && !idSet[x]) dangling.push('FUNC_TYPES.' + k + '.fallback -> ' + x); });
});
ok('无悬空 fallback / primary', dangling.length === 0, dangling.join(' ; '));

console.log('=== 4) ai-page.js 三张兜底表 ===');
NEWMODELS.forEach(nm => {
  const rateRe = new RegExp("'" + nm.id + "':\\s*'([^']+)'");
  ok('MODEL_RATES 有 ' + nm.id, rateRe.test(page));

  const detailRe = new RegExp("'" + nm.id + "':\\s*\\{ platform:");
  ok('MODEL_DETAILS 有 ' + nm.id, detailRe.test(page));

  const fbRe = new RegExp("\\{ id: '" + nm.id + "', name: '[^']+', provider: '([^']+)', model: '([^']+)'");
  const fbM = page.match(fbRe);
  ok('FALLBACK_MODELS 有 ' + nm.id, !!fbM);
  ok('FALLBACK_MODELS.model 与 ai-config 一致 = ' + nm.model,
     !!fbM && fbM[2] === nm.model, fbM && fbM[2]);
});

console.log('\nTOTAL_FAIL = ' + fails);
process.exit(fails ? 1 : 0);
