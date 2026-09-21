/* R11b：在 node vm 里加载 assets/ai-config.js，验证配置仍自洽。
   重点：① 结构自检没被触发（不会被回退成最小默认配置，那是历史事故）；
        ② builtinModels 计数与 3D 模型在位；
        ③ FUNC_TYPES.video 已重新接入（R11d：Seedance-1.0-pro / -fast 回归）；
        ④ 全表 fallback/primary 不指向任何已不存在的模型 id（悬空引用总检）。

   ⚠️ 历史沿革：本脚本原先断言「无视频模型残留 / FUNC_TYPES.video 已清空」，
   那是「视频模型被删」那个阶段的口径。R11d 按用户要求把 Seedance-1.0-pro 系
   重新接回前端（视频能力回归），故该组断言已**反转**为「视频模型应在位」。
   若将来再次下架视频模型，请同步反转回去，否则会出现假红灯。 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = 'D:/下载的文件/学习工作台';
const src = fs.readFileSync(path.join(ROOT, 'assets/ai-config.js'), 'utf8');

const logs = [];
const win = {};
const sandbox = {
  window: win,
  console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'ai-config.js' });

let fails = 0;
function ok(name, cond, extra) {
  console.log((cond ? '  PASS ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
}

const cfg = win.AI_CONFIG;
ok('AI_CONFIG 已挂到 window', !!cfg);
ok('未被回退成最小默认配置（builtinModels > 10）', cfg.builtinModels.length > 10,
   'count=' + cfg.builtinModels.length);
ok('结构自检输出「结构校验通过」', logs.some(l => l.indexOf('结构校验通过') >= 0), logs.join(' | '));

const ids = cfg.builtinModels.map(m => m.id);
const videoIds = cfg.builtinModels.filter(m => (m.types || []).indexOf('video') >= 0).map(m => m.id);
// R11d：视频能力已回归（Seedance-1.0-pro 系重新接入），下面三条为反转后的期望值
ok('视频模型已在位（R11d 回归）', videoIds.length > 0, 'videoIds=' + videoIds.join(','));
ok('视频主/备模型齐备', videoIds.indexOf('ark-seedance-1-0-pro') >= 0
   && videoIds.indexOf('ark-seedance-1-0-pro-fast') >= 0, 'videoIds=' + videoIds.join(','));
ok('3D 模型仍在（seed3d / hitem3d）',
   ids.indexOf('ark-seed3d-2-0') >= 0 && ids.indexOf('ark-hitem3d-2-0') >= 0);
ok('FUNC_TYPES.video.primary 指向存在的视频模型',
   !!cfg.FUNC_TYPES.video.primary && videoIds.indexOf(cfg.FUNC_TYPES.video.primary) >= 0,
   String(cfg.FUNC_TYPES.video.primary));
ok('FUNC_TYPES.video.fallback 非空且均在位',
   Array.isArray(cfg.FUNC_TYPES.video.fallback) && cfg.FUNC_TYPES.video.fallback.length > 0
   && cfg.FUNC_TYPES.video.fallback.every(x => videoIds.indexOf(x) >= 0),
   JSON.stringify(cfg.FUNC_TYPES.video.fallback));
ok('general 链仍指向存在的模型',
   !!cfg.FUNC_TYPES.general.primary && ids.indexOf(cfg.FUNC_TYPES.general.primary) >= 0,
   String(cfg.FUNC_TYPES.general.primary));

// ---- 悬空引用总检：每个模型的 fallback、每个 FUNC_TYPES 的 primary/fallback 都必须存在 ----
const idSet = {};
ids.forEach(i => { idSet[i] = 1; });
const dangling = [];
cfg.builtinModels.forEach(m => {
  if (typeof m.fallback === 'string' && m.fallback && !idSet[m.fallback]) {
    dangling.push('model ' + m.id + '.fallback -> ' + m.fallback);
  }
});
Object.keys(cfg.FUNC_TYPES).forEach(k => {
  const ft = cfg.FUNC_TYPES[k] || {};
  if (ft.primary && !idSet[ft.primary]) dangling.push('FUNC_TYPES.' + k + '.primary -> ' + ft.primary);
  (ft.fallback || []).forEach(x => { if (x && !idSet[x]) dangling.push('FUNC_TYPES.' + k + '.fallback -> ' + x); });
});
ok('全表无悬空模型引用', dangling.length === 0, dangling.join(' ; '));

// 明细表（modelDetails）里的键必须都能在 builtinModels 找到对应模型（无孤儿明细）
if (cfg.modelDetails) {
  const detKeys = Object.keys(cfg.modelDetails);
  const orphan = detKeys.filter(k => !idSet[k]);
  ok('模型明细表无孤儿键（每个明细都有对应模型）', orphan.length === 0, orphan.join(','));
  const detSeeds = detKeys.filter(k => k.indexOf('ark-seedance-') === 0);
  ok('R11d 新接入的视频模型有明细', detSeeds.indexOf('ark-seedance-1-0-pro') >= 0,
     detSeeds.join(','));
} else {
  ok('模型明细表可读（跳过）', true);
}

console.log('\nTOTAL_FAIL = ' + fails);
process.exit(fails ? 1 : 0);
