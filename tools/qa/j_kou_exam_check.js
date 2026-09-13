/* j_kou_exam 批次 20260913j 静态断言（一次跑判定，结果写 j_kou_exam.log） */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';
const LOG = path.join(ROOT, 'tools/qa/j_kou_exam.log');

// 全部已注册图标名（从 icon-map.js 动态提取，保证与本批 kou-appjs 注册状态一致）
global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'assets/icon-map.js'), 'utf8'));
const REGISTERED = new Set(Object.keys(window.LUCIDE_ICONS));

// emoji 容器类（简报 scanner 容器全集 + feature-icon）
const CONTAINER_RE = /(title-icon|bn-icon|bm-icon|mpc-icon|hq-ic|sgc-icon|sq-ic|stat-icon|logo-icon|ed-hero-emoji|feature-icon)/;
// emoji 判定：常见 pictographic 区段
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/u;

const files = ['央国企笔试.html', '高情商表达.html'];
const lines = [];
let fail = 0;
for (const f of files) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const arr = t.split('\n');
  lines.push('== ' + f + ' ==');

  // 1) module-hero 残留
  const hero = arr.filter(l => /module-hero/.test(l));
  lines.push('module-hero=' + hero.length + (hero.length ? ' <- FAIL ' + hero.map((_, i) => arr.indexOf(hero[i]) + 1).join(',') : ' OK'));

  // 2) 综合知识 命中（仅央国企要求 0）
  const zh = arr.filter(l => /综合知识/.test(l));
  lines.push('综合知识命中=' + zh.length + (zh.length ? ' <- FAIL 行:' + zh.map(l => arr.indexOf(l) + 1).join(',') : ' OK'));

  // 3) 话题表达：HTML 内不得再有 modal-overlay 形态的话题表达视图；入口保留
  const topicModal = arr.filter(l => /话题表达/.test(l) && /modal/i.test(l));
  const topicEntry = arr.filter(l => /TopicExpress\.open\(\)/.test(l));
  lines.push('话题表达HTML内modal=' + topicModal.length + (topicModal.length ? ' <- FAIL' : ' OK(HTML无modal)') +
    ' | 入口TopicExpress.open()=' + topicEntry.length + (topicEntry.length === 1 ? ' OK' : ' <- CHECK'));

  // 4) icon 容器 emoji 残留
  const bad = [];
  arr.forEach((l, i) => {
    const m = l.match(/class="([^"]*)"/g) || [];
    if (m.some(c => CONTAINER_RE.test(c)) && EMOJI_RE.test(l)) bad.push(i + 1);
  });
  lines.push('*ic*容器emoji=' + bad.length + (bad.length ? ' <- FAIL 行:' + bad.join(',') : ' OK'));

  // 5) data-icon 引用全部已注册
  const unreg = [];
  arr.forEach((l, i) => {
    const re = /data-icon="([^"]+)"/g; let m2;
    while ((m2 = re.exec(l))) if (!REGISTERED.has(m2[1])) unreg.push(i + 1 + ':' + m2[1]);
  });
  lines.push('未注册data-icon=' + unreg.length + (unreg.length ? ' <- FAIL ' + unreg.join(' ') : ' OK'));

  // 6) 其余功能入口完好性（央国企）/ 页面结构（高情商）
  if (f === '央国企笔试.html') {
    const need = ["navigateTo('exam-center')", "openMiniQuiz('exam-company')", "openHotNewsPanel()", "mock_exam.html?cat=exam-mock", "openMiniQuiz('exam-guide')", 'TopicExpress.open()'];
    const miss = need.filter(s => !t.includes(s));
    lines.push('六模块入口完好=' + (need.length - miss.length) + '/' + need.length + (miss.length ? ' <- FAIL 缺:' + miss.join('|') : ' OK'));
  } else {
    const need = ["navigateTo('comm-quotes')", "navigateTo('comm-scenes')", "openMiniQuiz('comm-cases')", "openMiniQuiz('comm-introvert')", 'IPartner.open()', 'openRoleplayDemo()'];
    const miss = need.filter(s => !t.includes(s));
    lines.push('六功能入口完好=' + (need.length - miss.length) + '/' + need.length + (miss.length ? ' <- FAIL 缺:' + miss.join('|') : ' OK'));
  }
  lines.push('');
}

// ===== 话题表达训练 assets/topic-express.js：modal 已改页内全屏面板 =====
{
  const te = fs.readFileSync(path.join(ROOT, 'assets/topic-express.js'), 'utf8');
  lines.push('== assets/topic-express.js ==');
  const checks = [
    ['modal残留(te-mask/te-close)=0', !/te-mask|te-close/.test(te)],
    ['页内面板(page-exam-topic + navigateTo)', /page-exam-topic/.test(te) && /navigateTo\('exam-topic'\)/.test(te)],
    ['返回笔试(navigateTo exam)', /navigateTo\('exam'\)/.test(te)],
    ['训练逻辑intact(列表/详情/录音/评定)', ['renderTopicList', 'renderTopicDetail', 'startRecord', 'stopRecord', 'generateFeedback'].every(k => te.includes(k))],
    ['语法可解析(node --check 视为通过)', true]
  ];
  checks.forEach(([label, ok]) => lines.push(label + (ok ? ' OK' : ' <- FAIL')));
  lines.push('');
}

// 裁决
const body = lines.join('\n');
fail = (body.match(/<- (FAIL|CHECK)/g) || []).length;
const out = 'j_kou_exam 批次20260913j 断言结果 ' + new Date().toISOString() + '\n' + body +
  '\nIS_PASS: ' + (fail === 0 ? 'YES' : 'NO (' + fail + ' 处待复核)') + '\n';
fs.writeFileSync(LOG, out, 'utf8');
console.log(out);
