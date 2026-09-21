/* ==================== 【批次 20260913m】kou-l-cet 静态自检 ====================
   范围：四级备考.html / 央国企笔试.html / mock_exam.html
   内容：考试指南入口卡删除 + 指南并入 mock_exam 双 tab 的正则断言
   运行：node tools/qa/_l_cet_check.js > tools/qa/_l_cet_check.log 2>&1 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let passCount = 0, failCount = 0;
const lines = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function check(name, cond) {
  if (cond) { passCount++; lines.push('[PASS] ' + name); }
  else { failCount++; lines.push('[FAIL] ' + name); }
}

/* ---------- 1. 四级备考.html ---------- */
const cet = read('四级备考.html');
check('cet: 「考试指南」feature-card 已删除（无 feature-title>考试指南）', !/feature-title">考试指南</.test(cet));
check('cet: 保留合并说明注释（【批次 20260913m】考试指南入口已并入真题模拟）', /【批次 20260913m】考试指南入口已并入真题模拟（用户拍板）/.test(cet));
check('cet: 不再引用 openMiniQuiz(\'cet-guide\')', !/openMiniQuiz\('cet-guide'\)/.test(cet));
check('cet: 真题模考入口仍在（mock_exam.html?cat=cet-mock）', /mock_exam\.html\?cat=cet-mock/.test(cet));
check('cet: 真题模考卡片标题仍在（feature-title>真题模考）', /feature-title">真题模考</.test(cet));
check('cet: 无残留 cet-guide 字样', !/cet-guide/.test(cet));

/* ---------- 2. 央国企笔试.html ---------- */
const exam = read('央国企笔试.html');
check('exam: 「考试指南」feature-card 已删除（无 feature-title>考试指南）', !/feature-title">考试指南</.test(exam));
check('exam: 保留合并说明注释（【批次 20260913m】考试指南入口已并入真题模拟）', /【批次 20260913m】考试指南入口已并入真题模拟（用户拍板）/.test(exam));
check('exam: 不再引用 openMiniQuiz(\'exam-guide\')', !/openMiniQuiz\('exam-guide'\)/.test(exam));
check('exam: 真题模考入口仍在（mock_exam.html?cat=exam-mock）', /mock_exam\.html\?cat=exam-mock/.test(exam));
check('exam: 话题表达训练入口未受影响（TopicExpress.open()）', /TopicExpress\.open\(\)/.test(exam));
check('exam: 无残留 exam-guide 字样', !/exam-guide/.test(exam));

/* ---------- 3. mock_exam.html：tab 结构 ---------- */
const mock = read('mock_exam.html');
check('mock: tab 容器存在（mock-merge-tabs × mockTabBtnMock / mockTabBtnGuide）', /mock-merge-tabs/.test(mock) && /mockTabBtnMock/.test(mock) && /mockTabBtnGuide/.test(mock));
check('mock: 两个 tab 面板存在（mockTabMock / mockTabGuide）', /id="mockTabMock"/.test(mock) && /id="mockTabGuide"/.test(mock));
check('mock: 面板初始态正确（tab1 open，tab2 未 open）', /id="mockTabMock" class="mock-merge-panel open"/.test(mock) && /id="mockTabGuide" class="mock-merge-panel"/.test(mock));
check('mock: tab 切换函数 switchMockTab 存在且含选中态同步（classList add/remove on）', /window\.switchMockTab = function \(t\)/.test(mock) && /classList\[isGuide \? 'add' : 'remove'\]\('on'\)/.test(mock));
check('mock: tab 按钮绑定 onclick=switchMockTab', /onclick="switchMockTab\('mock'\)"/.test(mock) && /onclick="switchMockTab\('guide'\)"/.test(mock));

/* ---------- 4. mock_exam.html：指南内容并入（内容零删减） ---------- */
check('mock: 引入指南数据源 mini-cet.js', /assets\/mini-cet\.js/.test(mock));
check('mock: 引入指南数据源 mini-exam.js', /assets\/mini-exam\.js/.test(mock));
check('mock: renderGuideTab 存在且读取 MINI_BANK', /function renderGuideTab/.test(mock) && /MINI_BANK/.test(mock));
check('mock: renderGuideTab 按 cat 分流 cet-guide / exam-guide', /cat === 'exam-mock'\) \? 'exam-guide' : 'cet-guide'/.test(mock));
check('mock: 指南 tab 渲染 items 内容（title/body 全量输出）', /escHtml\(it\.title\)/.test(mock) && /escHtml\(it\.body\)/.test(mock));
check('mock: 底部指南链接改为页内 tab 切换（不再依赖未加载的 openMiniQuiz）', /switchMockTab\('guide'\)"/.test(mock) && !/openMiniQuiz\(/.test(mock));

/* ---------- 5. 数据源内容保留（铁律：合并=内容搬家保留） ---------- */
const miniCet = read('assets/mini-cet.js');
const miniExam = read('assets/mini-exam.js');
check('mini-cet: CET[\'cet-guide\'] info 数据保留（5 条 items）', /CET\['cet-guide'\]/.test(miniCet) && (miniCet.match(/title: '/g) || []).length >= 5);
check('mini-exam: EXAM[\'exam-guide\'] info 数据保留（4 条 items）', /EXAM\['exam-guide'\]/.test(miniExam) && /t: '央国企 · 真题模考导引'/.test(miniExam));
check('mini-cet: 指南关键词仍在（试卷结构与时间分配/临场策略）', /试卷结构与时间分配/.test(miniCet) && /临场策略/.test(miniCet));
check('mini-exam: 指南关键词仍在（题型结构/时间分配/复盘方法）', /题型结构/.test(miniExam) && /时间分配/.test(miniExam) && /复盘方法/.test(miniExam));

/* ---------- 汇总 ---------- */
lines.push('');
lines.push('TOTAL: ' + (passCount + failCount) + ' | PASS: ' + passCount + ' | FAIL: ' + failCount);
lines.push(failCount === 0 ? 'IS_PASS: YES' : 'IS_PASS: NO');
const out = lines.join('\n') + '\n';
fs.writeFileSync(path.join(__dirname, '_l_cet_check.log'), out, 'utf8');
process.stdout.write(out);
process.exitCode = failCount === 0 ? 0 : 1;
