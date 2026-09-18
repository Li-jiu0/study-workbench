/* L7 自检：iv-prep.js —— 语法/禁用语法 + 渲染冒烟 + 既有功能保留 */
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';
const { JSDOM, VirtualConsole } = require(
  'D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom'
);

const out = [];
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) { pass++; out.push('[PASS] ' + n + (d ? ' | ' + d : '')); } else { fail++; out.push('[FAIL] ' + n + (d ? ' | ' + d : '')); } }

const src = fs.readFileSync(path.join(ROOT, 'assets/iv-prep.js'), 'utf8');
if (src.indexOf('<' + '/script>') >= 0) { throw new Error('src contains script close tag'); }

// ---- 禁用语法（含注释字面量）----
const banned = {
  '?.': /\?\./, '??': /\?\?/, 'replaceAll': /replaceAll/, 'Object.fromEntries': /Object\.fromEntries/,
  '.at(': /\.at\(/, '(?<=': /\(\?<=/, '(?<!': /\(\?<!/, '**': /[A-Za-z0-9_$)\]]\s*\*\*\s*[A-Za-z0-9_$(]/,
  'catch{}': /catch\s*\{/, '=>': /=>/, '{...': /\{\s*\.\.\./, 'alert(': /(^|[^\w$.])alert\s*\(/,
  'confirm(': /(^|[^\w$.])confirm\s*\(/, 'prompt(': /(^|[^\w$.])prompt\s*\(/
};
Object.keys(banned).forEach((k) => {
  const m = src.match(new RegExp(banned[k].source, 'g'));
  ok('BAN iv-prep ' + k, !m, m ? 'hits=' + m.length : '');
});

// ---- 既有 DOM id / 全局名 / 存储键 保留 ----
['ipHero', 'ipProgBox', 'ipList', 'ipLegacyQuiz', 'ivPrepBody', 'ivPrepCount'].forEach((id) => {
  ok('KEEP id ' + id, src.indexOf("'" + id + "'") >= 0 || src.indexOf('"' + id + '"') >= 0);
});
['IP_render', 'IP_openV2', 'IP_itemHtml', 'IP_answerInfo', 'IP_gotoAI', 'IP_speak', 'IP_copy',
  'IP_stageLegend', 'IP_shareStages', 'window.ivQuizMount', 'window.IvPrep'].forEach((n) => {
    ok('KEEP name ' + n, src.indexOf(n) >= 0);
  });
['data-act="fold"', 'data-act="speak"', 'data-act="copy"', 'data-act="ai"', 'data-act="saveAns"',
  'data-act="clearAns"', 'data-act="chk"', 'data-act="foldAll"'].forEach((a) => {
    ok('KEEP act ' + a, src.indexOf(a) >= 0);
  });
ok('KEEP LS 前缀 xtc:lib:ip:', src.indexOf("LS_PREFIX = 'xtc:lib:ip:'") >= 0);
ok('KEEP version 升级为 2.1.0', src.indexOf("version: '2.1.0'") >= 0);
ok('NEW stages 出口', src.indexOf('stages: {') >= 0 && src.indexOf('backPaths:') >= 0);

// ---- jsdom 渲染冒烟 ----
const vc = new VirtualConsole();
vc.on('jsdomError', () => {});
vc.on('error', () => {});

const items = [
  { id: 'q1', q: '请做自我介绍', cat: '开场', icon: 'mic',
    framework: { name: 'STAR', abbr: 'S/T/A/R', steps: ['背景', '任务', '行动', '结果'] },
    sample: '示范回答文本', checklist: ['要点1', '要点2'], from: '来源：高频题库' },
  { id: 'q2', q: '为什么选择我们', cat: '动机', icon: 'target',
    framework: { name: '三why', abbr: 'why', steps: ['why公司'] },
    sample: '示范二', checklist: ['要点A'], from: '' }
];

const page = '<!DOCTYPE html><html><head></head><body><div id="ivPrepBody"></div>'
  + '<script>' + src + '</' + 'script></body></html>';
const dom = new JSDOM(page, {
  runScripts: 'dangerously',
  url: 'http://localhost:1/面测.html',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) {
    w.MINI_BANK = { 'iv-prep': { v: 2, t: '面试准备', intro: '说明', credit: 'credit', items: items, guide: { title: '指南', body: '正文', steps: ['步骤1'] } } };
    w.__IV_PREP_LEGACY__ = [];
    w.showToast = function () {};
    w.lucideAutoRender = function () {};
    w.localStorage.setItem('k', '1');
  }
});

setTimeout(() => {
  const w = dom.window, d = w.document;
  ok('R1 IvPrep 句柄存在', !!w.IvPrep && w.IvPrep.version === '2.1.0', w.IvPrep && w.IvPrep.version);
  ok('R2 共享六阶段词汇 window.IV_STAGES', Array.isArray(w.IV_STAGES) && w.IV_STAGES.length === 6,
    JSON.stringify(w.IV_STAGES));
  ok('R3 共享五段词汇 window.IV_BAR_STAGES', Array.isArray(w.IV_BAR_STAGES) && w.IV_BAR_STAGES.length === 5,
    JSON.stringify(w.IV_BAR_STAGES));
  ok('R4 stages 出口字段齐备',
    w.IvPrep.stages.machine.length === 6 && w.IvPrep.stages.bar.length === 5 &&
    w.IvPrep.stages.backPaths.length === 3 && !!w.IvPrep.stages.labels);

  w.IvPrep.render(d.getElementById('ivPrepBody'));
  const host = d.getElementById('ivPrepBody');
  ok('R5 渲染出 ip-root', !!d.querySelector('.ip-root'));
  ok('R6 渲染出 2 个题目卡', d.querySelectorAll('.ip-item').length === 2,
    String(d.querySelectorAll('.ip-item').length));
  ok('R7 折叠态下仅展开题含五段预览', d.querySelectorAll('.ip-flow').length === 1,
    String(d.querySelectorAll('.ip-flow').length));
  const fold2 = d.querySelectorAll('.ip-item[data-id="q2"] .ip-head')[0];
  let threw2 = '';
  try { fold2.dispatchEvent(new w.Event('click', { bubbles: true })); } catch (e) { threw2 = String(e && e.message); }
  ok('R8 展开第二题后五段预览 2 处 / 徽标 10 个',
    threw2 === '' && d.querySelectorAll('.ip-flow').length === 2 &&
    d.querySelectorAll('.ip-flow-seg').length === 10,
    'flow=' + d.querySelectorAll('.ip-flow').length + ' seg=' + d.querySelectorAll('.ip-flow-seg').length);
  ok('R9 ⑤ 段落标题存在', (host.innerHTML || '').indexOf('⑤ 五段流程') >= 0);
  ok('R10 回退说明写入',
    (host.innerHTML || '').indexOf('准备 ⇄ 读题') >= 0 && (host.innerHTML || '').indexOf('点评 ⇄ 回答') >= 0);
  ok('R11 每卡新增「按五段流程练这道题」按钮',
    (host.innerHTML || '').indexOf('按五段流程练这道题') >= 0 &&
    d.querySelectorAll('[data-act="ai"]').length >= 3,
    String(d.querySelectorAll('[data-act="ai"]').length));
  ok('R12 手风琴展开态跨重渲染保留（展开后 2 题同开）',
    d.querySelectorAll('.ip-item[data-open="1"]').length === 2,
    String(d.querySelectorAll('.ip-item[data-open="1"]').length));
  ok('R13 ④ 自查清单章节仍在', (host.innerHTML || '').indexOf('④ 自查清单') >= 0);
  ok('R14 ② 示范回答章节仍在', (host.innerHTML || '').indexOf('② 示范回答') >= 0);
  ok('R15 原题库容器保留', !!d.getElementById('ipLegacyQuiz'));
  ok('R16 指南卡仍渲染', !!d.querySelector('.ip-guide'));
  ok('R17 完成度进度区仍渲染', (d.getElementById('ipProgBox').innerHTML || '').length > 0);

  // 交互：点「按五段流程练这道题」不应抛错
  let threw = '';
  try {
    const btns = d.querySelectorAll('.ip-item [data-act="ai"]');
    if (btns.length) {
      const ev = new w.Event('click', { bubbles: true });
      btns[0].dispatchEvent(ev);
    }
  } catch (e) { threw = String(e && e.message); }
  ok('R18 点击 AI 交接按钮不抛错', threw === '', threw);

  out.push('----');
  out.push((fail === 0 ? 'RESULT: IS_PASS YES' : 'RESULT: IS_PASS NO') + ' (' + pass + ' pass, ' + fail + ' fail)');
  fs.writeFileSync(path.join(ROOT, '_tmp_l7_prepcheck.txt'), out.join('\n'), 'utf8');
  console.log('DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail === 0 ? 0 : 1);
}, 400);
