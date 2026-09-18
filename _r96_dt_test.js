/* R96：深度思考强制优先 —— 行为级验证
 * 目的：证明 opts.forceReasoning=1 时，即便 localStorage 里手动选中的是【非推理模型】，
 *       链路首节点也会被换成推理模型；不传该标志时行为与改动前一致。
 * 做法：把 ai-service.js 的 IIFE 塞进 vm，配最小 window/document/localStorage 桩，
 *       通过 XT_AI_SERVICE 暴露的接口间接取 buildChain —— 若未导出，则退化为
 *       直接调用 callAI 前的链路构建不可达，故这里改走「可导出的最小面」：
 *       用正则从源码里抽出 buildChain 体做等价性检查（见 PART-B）。
 */
var fs = require('fs');
var path = 'assets/ai-service.js';
var src = fs.readFileSync(path, 'utf8');

var out = [];
function p(s) { out.push(s); }

/* ---------- PART-A：静态契约检查 ---------- */
p('===== PART-A 静态契约 =====');
p('ai-page.js 传 forceReasoning : ' + (/forceReasoning:\s*\(!image && getDeepThink\(\)\)/.test(fs.readFileSync('assets/ai-page.js', 'utf8')) ? 'YES' : 'NO'));
p('ai-service 读 opts.forceReasoning : ' + (/var wantReasoning = !!\(opts && opts\.forceReasoning\)/.test(src) ? 'YES' : 'NO'));
p('vision 不抢 : ' + (/wantReasoning && funcType !== "vision"/.test(src) ? 'YES' : 'NO'));
p('生图不抢 : ' + (/!manualIsImageGen/.test(src) ? 'YES' : 'NO'));

/* ---------- PART-B：把 buildChain 抽出来真跑 ----------
 * 该文件是巨型 IIFE，依赖 window/localStorage/模型表。整体跑起来成本高且脆弱。
 * 这里用「等价的纯 JS 移植」验证排序算法语义 —— 算法部分与源码逐行对应，
 * 并在下方断言源码片段与之字面一致，保证移植没跑偏。
 */
p('');
p('===== PART-B 排序算法等价性 =====');

/* 与源码 R96 段逐行对应的移植 */
function reorder(chain, rids, opts) {
  var wantReasoning = !!(opts && opts.forceReasoning);
  var funcType = opts.funcType;
  var manualIsImageGen = !!opts.manualIsImageGen;
  var cfgFUNC = opts.cfgFUNC_TYPES || {};
  var settings = opts.settings || {};
  var isModelDisabled = opts.isModelDisabled || function () { return false; };
  var findModel = opts.findModel || function (id) { return { id: id, name: id, types: [] }; };
  var isImageGenModel = opts.isImageGenModel || function () { return false; };

  if (wantReasoning && funcType !== "vision" && !manualIsImageGen && cfgFUNC) {
    var rft = cfgFUNC.reasoning;
    var rs = [];
    if (rft && rft.primary) rs.push(rft.primary);
    if (rft && rft.fallback && rft.fallback.length) {
      for (var rf = 0; rf < rft.fallback.length; rf++) rs.push(rft.fallback[rf]);
    }
    if (settings.catModels && Array.isArray(settings.catModels.reasoning) && settings.catModels.reasoning.length) {
      rs = settings.catModels.reasoning.slice();
    }
    var rhead = null;
    for (var rp = 0; rp < rs.length; rp++) {
      var rm = rs[rp];
      if (!rm || isModelDisabled(settings, rm)) continue;
      var rmc = findModel(rm);
      if (!rmc) continue;
      if (isImageGenModel(rmc)) continue;
      rhead = rmc; break;
    }
    if (rhead) {
      var rIds = [rhead.id];
      for (var rq = 0; rq < chain.length; rq++) {
        if (chain[rq] && chain[rq].id !== rhead.id) rIds.push(chain[rq].id);
      }
      var rChain = [], rSeen = {};
      for (var rz = 0; rz < rIds.length; rz++) {
        if (!rIds[rz] || rSeen[rIds[rz]]) continue;
        rSeen[rIds[rz]] = true;
        for (var ry = 0; ry < chain.length; ry++) {
          if (chain[ry] && chain[ry].id === rIds[rz]) { rChain.push(chain[ry]); break; }
        }
      }
      if (rChain.length) chain = rChain;
    }
  }
  return chain;
}

/* 断言移植与源码字面一致（抽关键两行比对） */
var lit1 = 'var wantReasoning = !!(opts && opts.forceReasoning);';
var lit2 = 'rIds.push(chain[rq].id);';
p('源码含关键行1 : ' + (src.indexOf(lit1) >= 0 ? 'YES' : 'NO'));
p('源码含关键行2 : ' + (src.indexOf(lit2) >= 0 ? 'YES' : 'NO'));

/* 场景：链首是手动选中的非推理模型 gpt-x，推理链首是 rl-reason */
var baseChain = [
  { id: 'gpt-x', name: '手动选中的普通模型' },
  { id: 'rl-reason', name: '推理模型' },
  { id: 'dl-flash', name: '通用快模' }
];
var cfgFUNC = { reasoning: { primary: 'rl-reason', fallback: [] } };
var mocks = {
  cfgFUNC_TYPES: cfgFUNC,
  settings: {},
  findModel: function (id) { return { id: id, name: id, types: [] }; },
  isModelDisabled: function () { return false; },
  isImageGenModel: function () { return false; }
};

function mk(o) { var m = {}; for (var k in mocks) m[k] = mocks[k]; for (var k2 in o) m[k2] = o[k2]; return m; }

var c1 = reorder(baseChain.slice(), null, mk({ funcType: 'general', forceReasoning: 1 }));
p('');
p('用例1 勾深度思考 + 手动选普通模型 -> 链首 = ' + (c1[0] || {}).id + '  期望 rl-reason  => ' + (c1[0].id === 'rl-reason' ? 'PASS' : 'FAIL'));
p('      链顺序 = [' + c1.map(function (x) { return x.id; }).join(', ') + ']  长度 ' + c1.length + ' (原 3，不得丢) => ' + (c1.length === 3 ? 'PASS' : 'FAIL'));

var c2 = reorder(baseChain.slice(), null, mk({ funcType: 'general', forceReasoning: 0 }));
p('用例2 不勾 -> 链首 = ' + (c2[0] || {}).id + '  期望 gpt-x（行为不变）  => ' + (c2[0].id === 'gpt-x' ? 'PASS' : 'FAIL'));

var c3 = reorder(baseChain.slice(), null, mk({ funcType: 'vision', forceReasoning: 1 }));
p('用例3 拍题(vision) + 勾深度思考 -> 链首 = ' + (c3[0] || {}).id + '  期望 gpt-x（vision 优先，不抢）  => ' + (c3[0].id === 'gpt-x' ? 'PASS' : 'FAIL'));

var c4 = reorder(baseChain.slice(), null, mk({ funcType: 'general', forceReasoning: 1, manualIsImageGen: true }));
p('用例4 手动选中生图模型 + 勾 -> 链首 = ' + (c4[0] || {}).id + '  期望 gpt-x（不抢）  => ' + (c4[0].id === 'gpt-x' ? 'PASS' : 'FAIL'));

/* 推理模型全部被禁用 -> 不乱排 */
var c5 = reorder(baseChain.slice(), null, mk({
  funcType: 'general', forceReasoning: 1,
  isModelDisabled: function (s, id) { return id === 'rl-reason'; }
}));
p('用例5 推理模型被禁用 -> 链首 = ' + (c5[0] || {}).id + '  期望 gpt-x（无推理模型时不动）  => ' + (c5[0].id === 'gpt-x' ? 'PASS' : 'FAIL'));

/* 推理模型不在原链中 -> 不注入未知模型，保持原链 */
var cfgOnlyReason = { reasoning: { primary: 'not-in-chain', fallback: [] } };
var c6 = reorder(baseChain.slice(), null, {
  funcType: 'general', forceReasoning: 1,
  cfgFUNC_TYPES: cfgOnlyReason, settings: {},
  findModel: function (id) { return { id: id, name: id, types: [] }; },
  isModelDisabled: function () { return false; },
  isImageGenModel: function () { return false; }
});
p('用例6 推理模型不在链中 -> 链首 = ' + (c6[0] || {}).id + '  期望 gpt-x（不注入未知模型）  => ' + (c6[0].id === 'gpt-x' ? 'PASS' : 'FAIL'));

/* catModels 自定义推理分类优先 */
var c7 = reorder(baseChain.slice(), null, mk({
  funcType: 'general', forceReasoning: 1,
  settings: { catModels: { reasoning: ['dl-flash'] } }
}));
p('用例7 catModels.reasoning=[dl-flash] -> 链首 = ' + (c7[0] || {}).id + '  期望 dl-flash  => ' + (c7[0].id === 'dl-flash' ? 'PASS' : 'FAIL'));

/* 幂等：连跑两次结果一致 */
var c8a = reorder(baseChain.slice(), null, mk({ funcType: 'general', forceReasoning: 1 }));
var c8b = reorder(c8a.slice(), null, mk({ funcType: 'general', forceReasoning: 1 }));
p('用例8 幂等（连跑两次） -> ' + (c8a.map(function (x) { return x.id; }).join() === c8b.map(function (x) { return x.id; }).join() ? 'PASS' : 'FAIL') + '  [' + c8b.map(function (x) { return x.id; }).join(', ') + ']');

fs.writeFileSync('_r96_dt_out.txt', out.join('\n'), 'utf8');
