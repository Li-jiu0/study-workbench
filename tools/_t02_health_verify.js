// T02 验证：能力分派健康检查（jsdom 加载 ai-config + registry + caps + ai-service）
// 只读被测文件；不修改任何交付文件。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(process.env.NODE_PATH || 'C:/Users/ATM/node_modules', 'jsdom'));

const BASE = 'D:/下载的文件/学习工作台';
const out = [];
let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; out.push('[PASS] ' + name + (info ? '  ' + info : '')); }
  else { fail++; out.push('[FAIL] ' + name + (info ? '  ' + info : '')); }
}
function load(win, f) { win.eval(fs.readFileSync(path.join(BASE, f), 'utf8')); }

(async function () {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const win = dom.window;

  const rec = { recordCallCalls: 0, fetchCalls: 0, fetchUrls: [] };
  const ls = win.localStorage;
  const origSet = ls.setItem.bind(ls);
  ls.setItem = function (k, v) { if (k === 'ai_rate_calls') rec.recordCallCalls++; return origSet(k, v); };

  const fetchStub = function (url, opts) {
    rec.fetchCalls++;
    rec.fetchUrls.push({ url: String(url), body: (opts && opts.body) ? String(opts.body) : '' });
    return Promise.reject(new Error('network disabled in harness'));
  };
  Object.defineProperty(win, 'fetch', { value: fetchStub, configurable: true, writable: true });

  // 加载顺序：ai-service -> registry -> caps（caps 必须在 registry 之后）
  load(win, 'assets/ai-config.js');
  load(win, 'assets/ai-cap-registry.js');
  ['assets/ai-cap-audio.js', 'assets/ai-cap-embed.js', 'assets/ai-cap-image.js', 'assets/ai-cap-vision.js',
    'assets/ai-cap-translate.js', 'assets/ai-cap-video.js', 'assets/ai-cap-3d.js'].forEach(function (f) { load(win, f); });
  load(win, 'assets/ai-service.js');

  ok('接口: window.aiHealthCheck 存在且 2 参', typeof win.aiHealthCheck === 'function' && win.aiHealthCheck.length >= 2,
    'length=' + (win.aiHealthCheck && win.aiHealthCheck.length));
  ok('接口: window.aiHealthCheckBatch 存在（typeof 守卫）', typeof win.aiHealthCheckBatch === 'function');
  ok('接口: AI_SERVICE.healthCheck / healthCheckBatch 暴露',
    !!(win.AI_SERVICE && win.AI_SERVICE.healthCheck && win.AI_SERVICE.healthCheckBatch));
  ok('registry: caps 已登记 audio/video/3d', !!(win.XT_AI_CAPS.byType('audio') && win.XT_AI_CAPS.byType('video') && win.XT_AI_CAPS.byType('3d')));

  const TMP = { apiUrl: 'https://example.com/v1/chat/completions', apiKey: 'sk-x' };

  // -------- 判据1：文本模型零回归（glm-4.7 仍打 chat/completions + max_tokens=1）--------
  rec.fetchUrls = [];
  const rText = await win.aiHealthCheck('glm-4.7', { apiUrl: 'https://example.com/v1/chat/completions', apiKey: 'sk-x' });
  const uT = rec.fetchUrls[0] || { url: '', body: '' };
  ok('判据1: glm-4.7 打到 chat/completions', uT.url.indexOf('/chat/completions') !== -1, 'url=' + uT.url);
  let mt = null; try { mt = JSON.parse(uT.body).max_tokens; } catch (e) {}
  ok('判据1: glm-4.7 请求体 max_tokens=1', mt === 1, 'max_tokens=' + mt);
  ok('判据1: glm-4.7 返回 kind=text', rText && rText.kind === 'text', 'kind=' + (rText && rText.kind));

  // -------- 文本族 vision：无 probe 时回落文本探测（临时移除 T01 已落的 vision.probe）--------
  const visCap = win.XT_AI_CAPS.byType('image');
  const savedVisProbe = visCap.probe;
  try { delete visCap.probe; } catch (e) { visCap.probe = undefined; }
  rec.fetchUrls = [];
  const rVis = await win.aiHealthCheck('glm-4v-flash', { apiUrl: 'https://example.com/v1/chat/completions', apiKey: 'sk-x' });
  ok('vision: 无 probe 时回落文本探测（打 chat/completions）',
    rec.fetchUrls.length === 1 && rec.fetchUrls[0].url.indexOf('/chat/completions') !== -1,
    'fetch=' + rec.fetchUrls.length + ' url=' + (rec.fetchUrls[0] && rec.fetchUrls[0].url));
  ok('vision: 返回 kind=vision', rVis && rVis.kind === 'vision', 'kind=' + (rVis && rVis.kind));
  if (savedVisProbe !== undefined) visCap.probe = savedVisProbe;

  // -------- 判据3：无 probe 的能力返回 unsupported_probe（fetch 不发生）--------
  const cases = [
    ['sf-sensevoice', 'asr', 'audio'],
    ['sf-bge-m3', 'embed', 'embedding'],
    ['sf-bge-reranker', 'rerank', 'rerank'],
    ['ark-seedance-1-0-pro', 'video', 'video'],
    ['ark-seed3d-2-0', 'model3d', '3d']
  ];
  for (let i = 0; i < cases.length; i++) {
    const id = cases[i][0], wantKind = cases[i][1];
    const cap = win.XT_AI_CAPS.byType(cases[i][2]);
    const saved = cap.probe;
    try { delete cap.probe; } catch (e) { cap.probe = undefined; }
    rec.fetchUrls = [];
    const r = await win.aiHealthCheck(id, TMP);
    ok('判据3: ' + wantKind + ' 无 probe -> unsupported_probe（skipped=true，且不发请求）',
      r && r.err === 'unsupported_probe' && r.kind === wantKind && r.skipped === true && rec.fetchUrls.length === 0,
      'err=' + (r && r.err) + ' kind=' + (r && r.kind) + ' skipped=' + (r && r.skipped) + ' fetch=' + rec.fetchUrls.length);
    if (saved !== undefined) cap.probe = saved;
  }

  // -------- 判据：有 probe 走专用探针（不落文本 chat）--------
  const asrCap = win.XT_AI_CAPS.byType('audio');
  const log = [];
  asrCap.probe = function (ctx) { log.push(ctx && ctx.modelCfg ? ctx.modelCfg.id : '?'); return Promise.resolve({ ok: true, err: null }); };
  rec.fetchUrls = [];
  const rAsr = await win.aiHealthCheck('sf-sensevoice', TMP);
  ok('probe: 有 cap.probe -> 走专用探针（fetch 不发生）', log.length === 1 && rec.fetchUrls.length === 0 && rAsr.ok === true && rAsr.kind === 'asr',
    'probe=' + log.length + ' fetch=' + rec.fetchUrls.length + ' ok=' + (rAsr && rAsr.ok));

  // -------- ④ 成本保护：video/3d 探针不进「检测全部」批量，但单模型允许 --------
  const vidCap = win.XT_AI_CAPS.byType('video');
  const d3Cap = win.XT_AI_CAPS.byType('3d');
  const vlog = [], dlog = [];
  vidCap.probe = function () { vlog.push(1); return Promise.resolve({ ok: true, err: null }); };
  d3Cap.probe = function () { dlog.push(1); return Promise.resolve({ ok: true, err: null }); };
  rec.fetchUrls = [];
  const rVsingleRes = await win.aiHealthCheck('ark-seedance-1-0-pro', TMP);     // 单模型：允许提交
  const rVsingle = vlog.length;
  const rVbatch = await win.aiHealthCheckBatch('ark-seedance-1-0-pro', TMP);     // 批量：跳过
  const rDbatch = await win.aiHealthCheckBatch('ark-seed3d-2-0', TMP);           // 批量：跳过
  ok('成本保护: 单模型 video 检测 -> 探针被调用', rVsingle === 1 && rVsingleRes.ok === true, 'probe=' + rVsingle);
  ok('成本保护: 批量 video 检测 -> 探针跳过并返回 {err:unsupported_probe, skipped:true}',
    rVbatch && rVbatch.err === 'unsupported_probe' && rVbatch.kind === 'video' && rVbatch.skipped === true && vlog.length === 1,
    'err=' + (rVbatch && rVbatch.err) + ' skipped=' + (rVbatch && rVbatch.skipped) + ' probes=' + vlog.length);
  ok('成本保护: 批量 3d 检测 -> 探针跳过（skipped=true, dlog=0）',
    rDbatch && rDbatch.err === 'unsupported_probe' && rDbatch.kind === 'model3d' && rDbatch.skipped === true && dlog.length === 0,
    'err=' + (rDbatch && rDbatch.err) + ' skipped=' + (rDbatch && rDbatch.skipped) + ' probes=' + dlog.length);
  ok('成本保护: 单模型 video 检测返回体不带 skipped（skipped=' + (rVsingleRes && rVsingleRes.skipped) + '）',
    rVsingleRes && rVsingleRes.ok === true && rVsingleRes.skipped === undefined);
  // 判据改读 cap.probeNoAuto：显式关掉 video 的 probeNoAuto 后，批量不再跳过（走真探针）
  vidCap.probeNoAuto = false;
  const vlog2 = []; vidCap.probe = function () { vlog2.push(1); return Promise.resolve({ ok: true, err: null }); };
  const rVauto = await win.aiHealthCheckBatch('ark-seedance-1-0-pro', TMP);
  ok('probeNoAuto 判定: video 显式 probeNoAuto=false 时批量不再跳过（探针被调用）',
    rVauto && rVauto.ok === true && vlog2.length === 1, 'probes=' + vlog2.length + ' ok=' + (rVauto && rVauto.ok));
  vidCap.probeNoAuto = true; // 复原

  // -------- 判据2：连续检测 20 个模型，recordCall 调用次数为 0 --------
  rec.recordCallCalls = 0;
  win.localStorage.removeItem('ai_rate_calls');
  const ids20 = ['glm-4.7', 'glm-4v-flash', 'glm-4.6v-flash', 'ark-v4-flash', 'ark-doubao-mini',
    'ark-v4-1-flash', 'ark-v4-pro', 'ark-doubao-pro', 'ark-glm-flash', 'ark-turbo-260628',
    'ark-lite-260428', 'ark-evolving', 'ark-glm-5.2', 'qf-ernie-32k', 'or-auto',
    'gm-flash', 'gm-flash-lite', 'deepseek-chat', 'qwen-plus', 'kimi-k2-0905-preview'];
  for (let i = 0; i < ids20.length; i++) {
    await win.aiHealthCheck(ids20[i], { apiUrl: 'https://example.com/v1/chat/completions', apiKey: 'sk-x' });
  }
  ok('判据2: 连续检测 20 个模型 recordCall 调用次数为 0', rec.recordCallCalls === 0, 'recordCall=' + rec.recordCallCalls);
  ok('判据2: localStorage 无 ai_rate_calls 写入', win.localStorage.getItem('ai_rate_calls') === null,
    'ai_rate_calls=' + win.localStorage.getItem('ai_rate_calls'));

  // -------- 常量表形态 --------
  const src = fs.readFileSync(path.join(BASE, 'assets/ai-service.js'), 'utf8');
  ok('常量: XT_NON_CHAT_TYPES 含 video/3d', /XT_NON_CHAT_TYPES\s*=\s*\[[^\]]*"video"[^\]]*"3d"\]/.test(src));
  ok('常量: XT_KIND_LIST 含 video/model3d', /XT_KIND_LIST\s*=\s*\[[^\]]*"video"[^\]]*"model3d"\]/.test(src));
  ok('常量: XT_KIND_BY_TYPE 含 translate/video/"3d"', /translate:\s*"text"/.test(src) && /video:\s*"video"/.test(src) && /"3d":\s*"model3d"/.test(src));

  out.push('');
  out.push('===== T02 验证汇总: PASS=' + pass + ' FAIL=' + fail + ' =====');
  fs.writeFileSync(path.join(BASE, 'tools/_t02_health_verify_result.txt'), out.join('\n'), 'utf8');
  console.log(out.join('\n'));
  console.log('EXIT ' + (fail === 0 ? 0 : 1));
})().catch(function (e) {
  out.push('[ERROR] ' + (e && e.stack ? e.stack : e));
  fs.writeFileSync(path.join(BASE, 'tools/_t02_health_verify_result.txt'), out.join('\n'), 'utf8');
  console.log(out.join('\n'));
  console.log('EXIT 2');
});
