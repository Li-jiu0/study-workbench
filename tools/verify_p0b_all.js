// T05 汇总验收脚本：P0-B 五个任务的自证（jsdom 不依赖，纯 node + 文件扫描）
// 用法：C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe tools\verify_p0b_all.js
//
// 修订记录：
//   - 2026-09-12：T03/T04 由「弹窗版 assets/mock-exam.js」改为对齐当前真实结构
//     （三级独立页 mock_exam.html / mock_exam_run.html / mock_exam_result.html
//      + data/mock-papers.js + assets/mock-engine.js + assets/mock-result.js）。
//     弹窗版已按用户批准废弃并移入 备份/cleanup-20260912/，本脚本不再尝试读取它。
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath; // 复用当前 node 解释器

let pass = 0, fail = 0, skipped = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS  ' + msg); }
  else { fail++; console.log('  FAIL  ' + msg); }
}
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
/** 取数组中唯一值，便于「版本令牌一致」类断言 */
function uniq(arr) { return Array.from(new Set(arr)); }

console.log('=== T01 密码强度 ===');
// 后端：denylist 必须存在
const schemasSrc = read('server/schemas.py');
assert(/test123456/.test(schemasSrc), 'schemas.py 含 test123456 等常见弱密码 denylist');
assert(/check_password_strength/.test(schemasSrc), 'schemas.py 含 check_password_strength 函数');
// 后端正则字面量（需求22 的唯一事实来源）
const BACKEND_RE = '^(?=.*[A-Za-z])(?=.*\\d).{8,64}$';
const reMatch = schemasSrc.match(/_PASSWORD_STRONG_RE\s*=\s*re\.compile\(r"([^"]+)"\)/);
const backendRe = reMatch ? reMatch[1] : '';
assert(backendRe === BACKEND_RE, '后端正则为 ' + BACKEND_RE + '（实际：' + (backendRe || '<未匹配>') + '）');
// 后端黑名单 10 项
const denyMatch = schemasSrc.match(/_WEAK_PASSWORD_DENYLIST\s*=\s*frozenset\(\{([\s\S]*?)\}\)/);
const backendDeny = denyMatch
  ? (denyMatch[1].match(/"([^"]+)"/g) || []).map(function (s) { return s.slice(1, -1); })
  : [];
assert(backendDeny.length === 10, '后端弱密码黑名单 10 项（实际 ' + backendDeny.length + ' 项）');

// 前端：登录.html + 设置.html 都要有强度正则
const loginSrc = read('登录.html');
const settingsSrc = read('设置.html');
assert(/PW_STRONG_RE|pwStrongEnough|test123456/.test(loginSrc), '登录.html 含强度校验');
assert(/pwStrongEnough|test123456/.test(settingsSrc), '设置.html 含强度校验');
// 前后端正则必须字面一致，否则前端放行、后端 422
const jsRe = (settingsSrc.match(/var PW_STRONG_RE\s*=\s*\/(.+)\/;/) || [])[1] || '';
assert(jsRe === backendRe, '设置.html PW_STRONG_RE 与后端正则字面一致（JS=' + (jsRe || '<未匹配>') + ' / PY=' + backendRe + '）');
// 前端必须覆盖后端全部黑名单条目
const missingDeny = backendDeny.filter(function (w) { return settingsSrc.indexOf(w) < 0; });
assert(missingDeny.length === 0, '设置.html 覆盖后端全部弱密码黑名单（缺失：' + (missingDeny.join(',') || '无') + '）');
// 前端不得残留旧的「至少 6 位」规则
assert(!/至少\s*6\s*位/.test(settingsSrc), '设置.html 已无「至少 6 位」过期文案/规则');
assert(settingsSrc.indexOf('stCheckNewPassword(np)') >= 0 && /np\.length\s*<\s*6/.test(settingsSrc) === false,
  '设置.html 新密码校验已由 stCheckNewPassword() 接管（无 length<6 旧规则）');

console.log('\n=== T02 图形推理题干重写 ===');
// 复跑 q21 脚本
try {
  const r = execFileSync(NODE, [path.join(__dirname, 'verify_q21_figures.js')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  // 该脚本输出格式：PASS：扫描 14 题 × 2 来源 = 28 处题干，禁词零命中。或 FAIL：...
  if (/禁词零命中/.test(r) && !/FAIL：/.test(r)) { pass++; console.log('  PASS  verify_q21_figures.js 全 28 项零禁词'); }
  else { fail++; console.log('  FAIL  verify_q21_figures.js 输出异常'); console.log(r.slice(0, 400)); }
} catch (e) {
  fail++; console.log('  FAIL  verify_q21_figures.js 执行异常：' + e.message);
}
// JSON 文件存在
assert(exists('assets/data/exam-bank.json'), 'assets/data/exam-bank.json 已落盘');
// app.js 含 JSON 覆盖 loader
const appSrc = read('assets/app.js');
assert(/assets\/data\/exam-bank\.json/.test(appSrc), 'app.js 含 JSON 题库覆盖加载逻辑');

console.log('\n=== T03 模考引擎（三级独立页结构） ===');
// 弹窗版 assets/mock-exam.js 已废弃（移入 备份/cleanup-20260912/），此处断言的是当前真实结构
const MOCK_TOKEN = '?v=20260912d';
const MOCK_PAGES = ['mock_exam.html', 'mock_exam_run.html', 'mock_exam_result.html'];
const MOCK_ASSETS = ['data/mock-papers.js', 'assets/mock-engine.js', 'assets/mock-result.js'];
MOCK_PAGES.forEach(function (rel) { assert(exists(rel), rel + ' 存在'); });
MOCK_ASSETS.forEach(function (rel) { assert(exists(rel), rel + ' 存在'); });
assert(!exists('assets/mock-exam.js'), '弹窗版 assets/mock-exam.js 确已废弃移除（不应恢复）');

const pageSrc = {};
MOCK_PAGES.forEach(function (rel) { pageSrc[rel] = read(rel); });
// ① 三页对数据/引擎文件的引用路径正确
MOCK_PAGES.forEach(function (rel) {
  assert(/src="data\/mock-papers\.js\?v=/.test(pageSrc[rel]), rel + ' 引用 data/mock-papers.js 且带版本令牌');
  assert(/src="assets\/mock-engine\.js\?v=/.test(pageSrc[rel]), rel + ' 引用 assets/mock-engine.js 且带版本令牌');
});
assert(/src="assets\/mock-result\.js\?v=/.test(pageSrc['mock_exam_result.html']), 'mock_exam_result.html 引用 assets/mock-result.js');
// ② 三页的版本令牌一致
MOCK_PAGES.forEach(function (rel) {
  const tokens = uniq(pageSrc[rel].match(/\?v=[0-9]{8}[a-z]?/g) || []);
  assert(tokens.length === 1 && tokens[0] === MOCK_TOKEN,
    rel + ' 版本令牌唯一且为 ' + MOCK_TOKEN + '（实际：' + (tokens.join(',') || '<无>') + '）');
});
// ③ MockEngine.findPaperCategory 定义且能被 result 页取到
const engineSrc = read('assets/mock-engine.js');
assert(/function findPaperCategory\s*\(/.test(engineSrc), 'mock-engine.js 定义 findPaperCategory()');
assert(/findPaperCategory:\s*findPaperCategory/.test(engineSrc), 'MockEngine 对外导出 findPaperCategory');
assert(/window\.MockEngine\s*=/.test(engineSrc), 'mock-engine.js 暴露 window.MockEngine');
assert(/MockEngine\.findPaperCategory/.test(pageSrc['mock_exam_result.html']), 'result 页调用 MockEngine.findPaperCategory()');
assert(/MockEngine\.findPaperCategory/.test(read('assets/mock-result.js')), 'mock-result.js 调用 MockEngine.findPaperCategory()');
assert(/window\.MOCK_PAPERS_DATA/.test(read('data/mock-papers.js')), 'mock-papers.js 暴露 window.MOCK_PAPERS_DATA');
// ④ 7 套卷：四级 4 套 + 央国企 3 套
const papersSrc = read('data/mock-papers.js');
const cetPapers = (papersSrc.match(/id:\s*'cet-(demo-1|real-[abc])'/g) || []).length;
const examPapers = (papersSrc.match(/id:\s*'exam-(comp-[ab]|real-1)'/g) || []).length;
assert(cetPapers === 4, '四级方向 4 套卷（demo-1 + real-a/b/c），实际 ' + cetPapers + ' 套');
assert(examPapers === 3, '央国企方向 3 套卷（comp-a/b + real-1），实际 ' + examPapers + ' 套');
// ⑤ appData.mockExams
assert(/mockExams:\s*\[\]/.test(appSrc), 'appData 初始结构含 mockExams: []');
assert(/Array\.isArray\(appData\.mockExams\)/.test(appSrc), 'loadData 防御回退：mockExams 缺失时回补 []');

console.log('\n=== T04 页面接入 ===');
const cetSrc = read('四级备考.html');
const examSrc = read('央国企笔试.html');
// 真题模考卡片 desc 必须改为新文案
assert(/套卷模考 \+ 计时判分 \+ 成绩归档/.test(cetSrc), '四级备考.html 真题模考卡片 desc 已更新');
assert(/套卷模考 \+ 计时判分 \+ 成绩归档/.test(examSrc), '央国企笔试.html 真题模考卡片 desc 已更新');
// 考试指南卡片新增
assert(/cet-guide/.test(cetSrc) && /考试指南/.test(cetSrc), '四级备考.html 新增 cet-guide 考试指南卡片');
assert(/exam-guide/.test(examSrc) && /考试指南/.test(examSrc), '央国企笔试.html 新增 exam-guide 考试指南卡片');
// 入口改为跳转三级独立页（不再引用弹窗版 mock-exam.js）
assert(/mock_exam\.html\?cat=cet-mock/.test(cetSrc), '四级备考.html 改跳 mock_exam.html?cat=cet-mock');
assert(/mock_exam\.html\?cat=exam-mock/.test(examSrc), '央国企笔试.html 改跳 mock_exam.html?cat=exam-mock');
assert(!/<script[^>]+src="[^"]*assets\/mock-exam\.js/.test(cetSrc), '四级备考.html 无弹窗版 mock-exam.js 的 script 引入');
assert(!/<script[^>]+src="[^"]*assets\/mock-exam\.js/.test(examSrc), '央国企笔试.html 无弹窗版 mock-exam.js 的 script 引入');
// mini-cet/mini-exam 改名迁移
const miniCetSrc = read('assets/mini-cet.js');
const miniExamSrc = read('assets/mini-exam.js');
assert(!/cet-mock\s*=/.test(miniCetSrc), 'mini-cet.js 已移除 cet-mock 键');
assert(/cet-guide/.test(miniCetSrc), 'mini-cet.js 含 cet-guide 键');
assert(!/exam-mock\s*=/.test(miniExamSrc), 'mini-exam.js 已移除 exam-mock 键');
assert(/exam-guide/.test(miniExamSrc), 'mini-exam.js 含 exam-guide 键');
// mini.js 转发到独立页
const miniSrc = read('assets/mini.js');
assert(/mock_exam\.html\?cat=/.test(miniSrc), 'mini.js begin() 已转发到 mock_exam.html 独立页');
assert(!/openMockExam/.test(miniSrc), 'mini.js 已不再转发到已废弃的 openMockExam');

console.log('\n=== T05 HTTPS 文档 ===');
assert(exists('docs/HTTPS+APP跨端改造方案-2026-09-12.md'), 'HTTPS 文档已落盘');
const doc = read('docs/HTTPS+APP跨端改造方案-2026-09-12.md');
const HTTPS_KW = ['域名', 'Nginx', 'config.js', 'networkSecurityConfig', 'WebSocket', '验收'];
HTTPS_KW.forEach(function (kw) {
  assert(doc.indexOf(kw) >= 0, 'HTTPS 文档含「' + kw + '」关键章节');
});
// Let's Encrypt 含单引号，直接字面量匹配
const hasLE = doc.indexOf('Let') >= 0 && doc.indexOf('Encrypt') >= 0;
assert(hasLE, 'HTTPS 文档含 Let s Encrypt 章节');

console.log('\n=== 语法校验 ===');
['assets/app.js', 'assets/api.js', 'assets/mini.js', 'assets/study-stats.js', 'assets/qbank.js', 'assets/quest.js', 'assets/chat-local.js', 'assets/icon-map.js', 'assets/mini-cet.js', 'assets/mini-exam.js', 'assets/mock-engine.js', 'assets/mock-result.js', 'data/mock-papers.js'].forEach(function (rel) {
  if (!exists(rel)) { skipped++; console.log('  SKIP  ' + rel + ' 不存在'); return; }
  try {
    execFileSync(NODE, ['--check', path.join(ROOT, rel)], { stdio: ['ignore', 'pipe', 'pipe'] });
    pass++; console.log('  PASS  ' + rel);
  } catch (e) {
    fail++; console.log('  FAIL  ' + rel + ' 语法错误');
  }
});

console.log('\n=== 总结 ===');
console.log('PASS=' + pass + ' FAIL=' + fail + ' SKIP=' + skipped);
process.exit(fail === 0 ? 0 : 1);
