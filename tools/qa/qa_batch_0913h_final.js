/* =====================================================================
 * qa_batch_0913h_final.js —— 本批次「提交前终验」总 runner
 * ---------------------------------------------------------------------
 * 顺序执行各验证器（node 子进程），捕获 exit code + 输出摘要，汇总成表。
 * 额外内建 3 条「防并行覆盖」硬断言（直读盘上源码）：
 *   ① assets/api.js 含 window.lsKey('study_workbench_ai_chat')
 *   ② assets/study-stats.js 前缀化完好（本地前缀助手 + stats/queue/tool_ 键均经前缀）
 *   ③ 个人中心.html 的「穿越英语」为守卫写法 if(window.openQuest)…（无裸调残留）
 * 用法：
 *   node tools/qa/qa_batch_0913h_final.js               # C1 标 PENDING（未收口）
 *   node tools/qa/qa_batch_0913h_final.js --with-c1     # 含 C1（收口后终验）
 * 只读业务文件，不改任何业务代码。
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WITH_C1 = process.argv.includes('--with-c1');
const SUMMARY_JSON = path.join(__dirname, '_qa_batch_summary.json');

const SCRIPTS = [
  { name: 'qa_a2a3a4_final_0913.js', desc: 'A2-A4 验收三连（数据隔离/计数器/个人中心路由）' },
  { name: 'qa_b12_trim_0913h.js', desc: 'B1+B2 删减验证' },
  { name: 'qa_b3_b4_smoke.js', desc: 'B3+B4 删减冒烟' },
  { name: 'qa_c23_0913h.js', desc: 'C2+C3 重构验证' },
  { name: 'qa_e1_icon_smoke.js', desc: 'E1 图标全站冒烟（15 页）', logFile: 'e1_smoke_log.txt' },
  { name: 'qa_blogwechat_quest_0913.js', desc: 'blog_wechat 死链修复' },
  { name: 'qa_c1_0913h.js', desc: 'C1 好友页菜单重排', pendingGate: true }
];

/* ---------- 输出解析 ---------- */
function parseCounts(out) {
  const m1 = out.match(/断言\s*(\d+)\s*\|\s*通过\s*(\d+)\s*\|\s*失败\s*(\d+)/);
  if (m1) return { total: +m1[1], pass: +m1[2], fail: +m1[3], mode: 'assert' };
  const ap = (out.match(/\[PASS\]/g) || []).length;
  const af = (out.match(/\[FAIL\]/g) || []).length;
  if (ap + af > 0) return { total: ap + af, pass: ap, fail: af, mode: 'assert' };
  // 页面级脚本：'--- X : PASS ---' / ': FAIL'
  const pp = (out.match(/:\s*PASS\s*---/g) || []).length;
  const pf = (out.match(/:\s*FAIL\s*---/g) || []).length;
  return { total: pp + pf, pass: pp, fail: pf, mode: 'page' };
}
function verdictOf(out, exit) {
  const lines = out.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/ALL PASS|FAIL\s*=\s*\d+|断言\s*\d+/.test(lines[i])) return lines[i].trim();
  }
  return exit === 0 ? '(no verdict line)' : '(exit ' + exit + ')';
}
function failuresOf(out) {
  const out2 = [];
  for (const l of out.split(/\r?\n/)) {
    if (/\[FAIL\]/.test(l) || /:\s*FAIL\s*---/.test(l) || /\[XX\]/.test(l) || /异常\s+/.test(l)) out2.push(l.trim());
  }
  // 兼容 "1. xxx" 失败明细块
  let inTail = false;
  for (const l of out.split(/\r?\n/)) {
    if (/---\s*失败明细\s*---/.test(l)) { inTail = true; continue; }
    if (inTail && l.trim()) out2.push(l.trim());
  }
  return out2.slice(0, 40);
}

/* ---------- 防覆盖硬断言 ---------- */
function antiOverwrite() {
  const res = [];
  const apiSrc = fs.readFileSync(path.join(ROOT, 'assets', 'api.js'), 'utf8');
  const ssSrc = fs.readFileSync(path.join(ROOT, 'assets', 'study-stats.js'), 'utf8');
  const profSrc = fs.readFileSync(path.join(ROOT, '个人中心.html'), 'utf8');

  // ① api.js: syncAiFromServer 写前缀键
  const apiLine = apiSrc.split(/\r?\n/).findIndex(l => /lsKey\('study_workbench_ai_chat'\)/.test(l));
  res.push({
    id: 'A-①',
    name: "assets/api.js 含 window.lsKey('study_workbench_ai_chat')（同步 AI 历史走前缀键）",
    pass: apiLine >= 0,
    detail: apiLine >= 0 ? 'line ' + (apiLine + 1) : '未找到 lsKey 前缀写点（疑被覆盖回裸键）'
  });

  // ② study-stats.js 前缀化完好（本地助手 + 3 类键）
  const hasHelper = /function\s+(LK|lsKey)\s*\([^)]*\)\s*\{[^}]*window\.lsKey/.test(ssSrc);
  const usedOnKeys = [
    /(?:LK|lsKey)\('study_workbench_stats'\)/.test(ssSrc),
    /(?:LK|lsKey)\('study_workbench_stats_queue'\)/.test(ssSrc),
    /(?:LK|lsKey)\('study_workbench_tool_'/.test(ssSrc)
  ];
  const bareStore = /STORE_KEY\s*=\s*'study_workbench_stats'/.test(ssSrc);
  const bareQueue = /QUEUE_KEY\s*=\s*'study_workbench_stats_queue'/.test(ssSrc);
  const bareTool = /localStorage\.(get|set)Item\('study_workbench_tool_'/.test(ssSrc);
  res.push({
    id: 'A-②',
    name: 'assets/study-stats.js 前缀化完好（本地助手引用 window.lsKey；stats/queue/tool_ 三类键均前缀）',
    pass: hasHelper && usedOnKeys.every(Boolean) && !bareStore && !bareQueue && !bareTool,
    detail: 'helper=' + hasHelper + ' keys=' + JSON.stringify(usedOnKeys) +
      ' bareStore=' + bareStore + ' bareQueue=' + bareQueue + ' bareTool=' + bareTool
  });

  // ③ 个人中心.html 穿越英语守卫写法 + 无裸调残留
  const guardRe = /onclick="if\(window\.openQuest\)\{openQuest\(\)\}else\{location\.href='工具\.html'\};toggleToolsPanel\(\)"/;
  const bareRe = /onclick="openQuest\(\);/;
  const guardLine = profSrc.split(/\r?\n/).findIndex(l => guardRe.test(l));
  res.push({
    id: 'A-③',
    name: "个人中心.html「穿越英语」守卫写法（if(window.openQuest)…）且无裸调残留",
    pass: guardRe.test(profSrc) && !bareRe.test(profSrc),
    detail: guardLine >= 0 ? 'line ' + (guardLine + 1) : '守卫写法未找到'
  });
  return res;
}

/* ---------- C1 菜单顺序硬断言（需求08） ---------- */
function c1MenuChecks() {
  const src = fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8');
  const blockM = src.match(/<div class="im-tabs">([\s\S]*?)<\/div>/);
  const block = blockM ? blockM[1] : '';
  const tabRe = /<button class="im-tab[^"]*"[^>]*onclick="([^"]+)"[^>]*>([^<]+)<\/button>/g;
  const tabs = [];
  let m;
  while ((m = tabRe.exec(block))) tabs.push({ onclick: m[1], label: m[2].trim() });
  const stripEmoji = s => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, '').trim();
  const labels = tabs.map(t => stripEmoji(t.label));
  const onclicks = tabs.map(t => t.onclick);
  const expectLabels = ['会话', '好友', '群聊', '申请', '加好友'];
  const expectOnclicks = [
    "imSwitchTab('chats')", "imSwitchTab('friends')", "imOpenGroupCreator()",
    "imSwitchTab('requests')", "imOpenAddFriendModal()"
  ];
  return [
    {
      id: 'C1-①',
      name: '私聊.html 五个 .im-tab 顺序 = 会话/好友/群聊/申请/加好友（共 ' + tabs.length + ' 个）',
      pass: labels.length === 5 && labels.join('/') === expectLabels.join('/'),
      detail: 'order=' + JSON.stringify(labels)
    },
    {
      id: 'C1-②',
      name: '「加好友」为最后一个 tab',
      pass: labels[labels.length - 1] === '加好友',
      detail: 'last=' + (labels[labels.length - 1] || '(none)')
    },
    {
      id: 'C1-③',
      name: '五个 onclick 目标逐一在位且顺序一致',
      pass: onclicks.join(' | ') === expectOnclicks.join(' | '),
      detail: 'got=' + JSON.stringify(onclicks)
    },
    {
      id: 'C1-④',
      name: '「+好友」「➕ 加好友」字样 0 命中',
      pass: !/\+好友/.test(src) && !/➕\s*加好友/.test(src),
      detail: '+好友=' + /\+好友/.test(src) + ' ➕加好友=' + /➕\s*加好友/.test(src)
    },
    {
      id: 'C1-⑤',
      name: 'im-tab-add 使用设计令牌（var(--primary-...)），无硬编码橙色',
      pass: /\.im-tab-add\{[^}]*var\(--primary/.test(src) && !/\.im-tab-add\{[^}]*#(ff|FF)[0-9a-fA-F]{3,5}/.test(src),
      detail: 'token=' + /\.im-tab-add\{[^}]*var\(--primary/.test(src)
    }
  ];
}

/* ---------- 主流程 ---------- */
function runScript(s) {
  const abs = path.join(ROOT, 'tools', 'qa', s.name);
  if (!fs.existsSync(abs)) {
    return { ...s, status: 'PENDING', exit: null, counts: null, verdict: '脚本不存在（PENDING）', failures: [], out: '' };
  }
  if (s.pendingGate && !WITH_C1) {
    return { ...s, status: 'PENDING', exit: null, counts: null, verdict: 'C1 未收口（--with-c1 启用）', failures: [], out: '' };
  }
  const r = spawnSync(process.execPath, [abs], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
  let out = (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '');
  const exit = r.status == null ? -1 : r.status;
  // 部分脚本把结果写日志文件而非 stdout（如 E1）→ 合并解析
  if (s.logFile) {
    const lp = path.join(ROOT, 'tools', 'qa', s.logFile);
    if (fs.existsSync(lp)) out += '\n[log:' + s.logFile + ']\n' + fs.readFileSync(lp, 'utf8');
  }
  const counts = parseCounts(out);
  const failLines = failuresOf(out);
  const pass = exit === 0 && (!counts || counts.fail === 0);
  return { ...s, status: pass ? 'PASS' : 'FAIL', exit, counts, verdict: verdictOf(out, exit), failures: failLines, out };
}

function main() {
  const t0 = Date.now();
  console.log('================================================================');
  console.log(' 星途 · 批次提交前终验 runner（HEAD=' + (function () {
    try { return require('child_process').execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); }
    catch (e) { return 'n/a'; }
  })() + '，含 C1=' + WITH_C1 + '）');
  console.log('================================================================\n');

  const results = [];
  for (const s of SCRIPTS) {
    const r = runScript(s);
    results.push(r);
    const tag = r.status === 'PASS' ? 'PASS' : (r.status === 'PENDING' ? 'PENDING' : 'FAIL');
    console.log('[RUN] ' + s.name.padEnd(34) + ' -> ' + tag +
      (r.counts ? '  (' + r.counts.mode + ' 总' + r.counts.total + '/过' + r.counts.pass + '/败' + r.counts.fail + ')' : '') +
      '  exit=' + r.exit);
    if (r.status === 'FAIL') {
      console.log('      裁决: ' + r.verdict);
      r.failures.slice(0, 12).forEach(l => console.log('      · ' + l.slice(0, 200)));
      if (r.failures.length > 12) console.log('      · …(' + (r.failures.length - 12) + ' 条更多，见 JSON)');
    }
  }

  const anti = antiOverwrite();
  const c1 = c1MenuChecks();
  console.log('\n---------------- 防并行覆盖硬断言（直读盘上源码） ----------------');
  anti.forEach(a => console.log('  [' + (a.pass ? 'PASS' : 'FAIL') + '] ' + a.id + ' ' + a.name + '  —  ' + a.detail));
  console.log('\n---------------- C1 菜单顺序硬断言（需求08，直读 私聊.html） ----------------');
  c1.forEach(a => console.log('  [' + (a.pass ? 'PASS' : 'FAIL') + '] ' + a.id + ' ' + a.name + '  —  ' + a.detail));

  const bad = results.filter(r => r.status === 'FAIL').length;
  const pending = results.filter(r => r.status === 'PENDING').length;
  const antiBad = anti.filter(a => !a.pass).length + c1.filter(a => !a.pass).length;

  console.log('\n================================================================');
  console.log(' 汇总表');
  console.log('================================================================');
  console.log(' ' + '文件'.padEnd(36) + ' ' + '断言总/过/败'.padEnd(16) + ' exit  结果');
  results.forEach(r => {
    const c = r.counts ? (r.counts.total + '/' + r.counts.pass + '/' + r.counts.fail) : '-/-/-';
    console.log('       ' + r.name.padEnd(34) + ' ' + c.padEnd(16) + ' ' + String(r.exit).padEnd(5) + ' ' + r.status);
  });
  console.log(' ' + '—'.repeat(70));
  results.forEach(r => console.log('       · ' + r.name + ' :: ' + r.verdict));
  console.log('\n 失败脚本 = ' + bad + ' | PENDING = ' + pending + ' | 硬断言（防覆盖+C1菜单）失败 = ' + antiBad +
    ' | 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log(' 总裁决: ' + ((bad === 0 && antiBad === 0) ? (pending ? 'PASS（含 ' + pending + ' 项 PENDING，非终态）' : 'ALL PASS') : 'FAIL'));
  console.log('================================================================');

  try {
    fs.writeFileSync(SUMMARY_JSON, JSON.stringify({
      at: new Date().toISOString(), withC1: WITH_C1,
      results: results.map(r => ({ name: r.name, desc: r.desc, status: r.status, exit: r.exit, counts: r.counts, verdict: r.verdict, failures: r.failures })),
      antiOverwrite: anti,
      c1Menu: c1,
      totalFail: bad, pending: pending, antiFail: antiBad
    }, null, 2), 'utf8');
    console.log('JSON 摘要: ' + SUMMARY_JSON);
  } catch (e) { console.log('JSON 摘要写入失败: ' + e.message); }

  process.exit((bad === 0 && antiBad === 0) ? 0 : 1);
}
main();
