/* R11c：Doubao-Seedream-5.0 接入一致性校验（三表 + AI 页兜底表）。
   校验目标：前端 ai-config.js / AI 页 ai-page.js / 服务端 model_registry.json /
             model_quota.json 四处对同一个模型 id 的口径完全一致 —— 这是本项目
             「展示即真可用」的硬要求：任何一处漏改都会让选中的模型落空回退。 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = 'D:/下载的文件/学习工作台';
const ID = 'ark-seedream-5-0';
const UPSTREAM = 'doubao-seedream-5-0-260128';

const logs = [];
const win = {};
const sandbox = { window: win, console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) } };
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
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/model_registry.json'), 'utf8'));
const quota = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/model_quota.json'), 'utf8'));

console.log('=== 1) ai-config.js builtinModels ===');
const m = (cfg.builtinModels || []).filter(x => x.id === ID)[0];
ok('存在模型条目 ' + ID, !!m);
ok('上游模型名一致 = ' + UPSTREAM, !!m && m.model === UPSTREAM, m && m.model);
ok('provider = arkimage（走服务端中转 arkimage 分支）', !!m && m.provider === 'arkimage', m && m.provider);
ok('types 含 imagegen（进「生图」分区）', !!m && (m.types || []).indexOf('imagegen') >= 0,
   m && (m.types || []).join(','));
ok('仅出现一次（无重复 id）',
   (cfg.builtinModels || []).filter(x => x.id === ID).length === 1);

console.log('=== 2) ai-config.js modelDetails ===');
const det = (cfg.modelDetails || {})[ID];
ok('modelDetails 有明细键', !!det);
ok('明细字段齐全（platform/type/stars/speed/advantage/applicable）',
   !!det && !!det.platform && !!det.type && !!det.stars && !!det.speed && !!det.advantage && !!det.applicable);

console.log('=== 3) FUNC_TYPES.imagegen 链 ===');
const ft = cfg.FUNC_TYPES.imagegen;
ok('primary 已升为 ' + ID, ft.primary === ID, String(ft.primary));
const ids = (cfg.builtinModels || []).map(x => x.id);
const chain = [ft.primary].concat(ft.fallback || []).filter(Boolean);
ok('primary + fallback 全部指向存在的模型', chain.every(i => ids.indexOf(i) >= 0), chain.join(' -> '));
ok('imagegen 链上无视频模型（不会误走 chat/completions）',
   chain.every(i => {
     const mm = cfg.builtinModels.filter(x => x.id === i)[0];
     return mm && (mm.types || []).indexOf('imagegen') >= 0;
   }), chain.join(' -> '));

console.log('=== 4) 服务端 model_registry.json ===');
const r = reg[ID];
ok('注册表有条目', !!r);
ok('注册表 model 与前端一致 = ' + UPSTREAM, !!r && r.model === UPSTREAM, r && r.model);
ok('注册表 provider = arkimage', !!r && r.provider === 'arkimage', r && r.provider);
ok('注册表 type = imagegen', !!r && r.type === 'imagegen', r && r.type);

console.log('=== 5) 服务端 model_quota.json ===');
const q = quota[ID];
ok('额度表有条目', !!q);
ok('quotaType = images', !!q && q.quotaType === 'images', q && q.quotaType);
ok('freeQuota = 200', !!q && q.freeQuota === 200, q && String(q.freeQuota));

console.log('=== 6) AI 页 ai-page.js 兜底表 ===');
const rateRe = new RegExp("'" + ID + "':\\s*'([^']+)'");
const rateM = page.match(rateRe);
ok('MODEL_RATES 有倍率键', !!rateM, rateM && rateM[1]);
const detailRe = new RegExp("'" + ID + "':\\s*\\{ platform:");
ok('MODEL_DETAILS 有明细键', detailRe.test(page));
const fbRe = new RegExp("\\{ id: '" + ID + "', name: '[^']+', provider: '([^']+)', model: '([^']+)'");
const fbM = page.match(fbRe);
ok('FALLBACK_MODELS 有条目', !!fbM, fbM && fbM[0].slice(0, 90));
ok('FALLBACK_MODELS provider = arkimage', !!fbM && fbM[1] === 'arkimage', fbM && fbM[1]);
ok('FALLBACK_MODELS model 与前端一致 = ' + UPSTREAM, !!fbM && fbM[2] === UPSTREAM, fbM && fbM[2]);

console.log('=== 7) 反向一致性：三表 id 集合无「只在服务端」的悬挂 ===');
ok('registry / quota 的 ' + ID + ' 都对应前端存在的 id', ids.indexOf(ID) >= 0);

console.log('\nTOTAL_FAIL = ' + fails);
process.exit(fails ? 1 : 0);
