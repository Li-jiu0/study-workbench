// tools/qa/qa_t02_figures.js — P0-B T02 图形推理题干 QA 复测
//
// 用法：
//   node tools/qa/qa_t02_figures.js
//   node tools/qa/qa_t02_figures.js > tools/qa/_qa_t02_report.txt 2>&1
//
// 覆盖 PRD §3.3 共 5 项 AC（AC-2.1 ~ AC-2.5）。
//
// 设计：
//   - 零 npm 依赖；纯 node 内置 fs/path
//   - AC-2.1/2.2 禁词扫描（与 verify_q21_figures.js 口径一致）
//   - AC-2.3 解析字段允许出现规律描述（说明性检查）
//   - AC-2.4 grep app.js 的 JSON 覆盖 loader（fetch + catch + 回退内置 EXAM_BANK）
//   - AC-2.5 题库字段结构稳定（id/type/q/o/a/x 缺一即 FAIL）
//
// 输出格式（统一）：
//   === AC-2.x | <name> | PASS/FAIL | <note> ===
//
// 退出码：0 = 全 PASS；非 0 = 至少一项 FAIL

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP_JS = path.join(ROOT, 'assets', 'app.js');
const EXAM_JSON = path.join(ROOT, 'assets', 'data', 'exam-bank.json');

// ---------- 报告收集 ----------
const results = [];
let pass = 0;
let fail = 0;
function record(acId, name, ok, note) {
  const tag = ok ? 'PASS' : 'FAIL';
  results.push({ acId, name, tag, note });
  console.log(`=== ${acId} | ${name} | ${tag} | ${note} ===`);
  if (ok) pass += 1; else fail += 1;
}

// ---------- 工具 ----------
function read(file) {
  if (!fs.existsSync(file)) {
    throw new Error('文件不存在: ' + file);
  }
  return fs.readFileSync(file, 'utf8');
}

// 禁词表（与 verify_q21_figures.js 严格一致）
// PRD §3.3 AC-2.1 列举：依次在左/右/上/下、逆时针、对称轴、一笔画 等显式规律词
// verify_q21_figures.js 实际使用：依次|顺时针|逆时针|位置|方向|规律|对称
const FORBIDDEN = ['依次', '顺时针', '逆时针', '位置', '方向', '规律', '对称'];
// 与 verify_q21_figures.js 一致：1..10 + 41..44 共 14 题
const TARGET_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 41, 42, 43, 44];

function scanField(text) {
  const hits = [];
  if (typeof text !== 'string') return hits;
  FORBIDDEN.forEach((w) => {
    let idx = 0;
    while ((idx = text.indexOf(w, idx)) !== -1) {
      hits.push({
        word: w,
        index: idx,
        snippet: text.substr(Math.max(0, idx - 6), 24),
      });
      idx += w.length;
    }
  });
  return hits;
}

// 从 app.js 抽出 EXAM_BANK 数组
function loadAppJsQuestions() {
  const src = read(APP_JS);
  const start = src.indexOf('const EXAM_BANK = [');
  if (start < 0) throw new Error('未在 app.js 中找到 const EXAM_BANK');
  const end = src.indexOf('];', start);
  if (end < 0) throw new Error('未在 app.js 中找到 EXAM_BANK 结束 ]');
  let block = src.slice(start, end + 2);
  block = block.replace(/^const\s+EXAM_BANK\s*=\s*/, '').replace(/;\s*$/, '');
  // eslint-disable-next-line no-new-func
  const arr = (new Function('return ' + block + ';'))();
  return Array.from(arr);
}

function loadExamJsonQuestions() {
  const j = JSON.parse(read(EXAM_JSON));
  if (!j || !Array.isArray(j.questions)) throw new Error('exam-bank.json questions 字段缺失或非数组');
  return j.questions;
}

// ============================================================
// AC-2.1 · 加载 exam-bank.json + app.js EXAM_BANK 后，遍历 14 道图推题题干，
//        禁词表命中数 = 0（与 verify_q21_figures.js 口径一致）
// ============================================================
function checkAC_2_1() {
  const checks = [];
  // JSON 14 题题干
  const jsonQs = loadExamJsonQuestions();
  const jsonFigQs = jsonQs.filter((q) => q && TARGET_IDS.indexOf(q.id) !== -1);
  const jsonHits = [];
  jsonFigQs.forEach((q) => {
    const hits = scanField(q.q);
    if (hits.length) jsonHits.push({ id: q.id, hits });
  });
  checks.push({
    ok: jsonHits.length === 0,
    note: 'exam-bank.json ' + jsonFigQs.length + ' 题题干禁词命中数=' + jsonHits.length +
      (jsonHits.length ? ('；首条：' + JSON.stringify(jsonHits[0])) : ''),
  });

  // app.js 14 题题干
  let appHits = [];
  try {
    const bank = loadAppJsQuestions();
    const appFigQs = bank.filter((q) => q && TARGET_IDS.indexOf(q.id) !== -1);
    appFigQs.forEach((q) => {
      const hits = scanField(q.q);
      if (hits.length) appHits.push({ id: q.id, hits });
    });
    checks.push({
      ok: appHits.length === 0,
      note: 'app.js EXAM_BANK ' + appFigQs.length + ' 题题干禁词命中数=' + appHits.length +
        (appHits.length ? ('；首条：' + JSON.stringify(appHits[0])) : ''),
    });
  } catch (e) {
    checks.push({ ok: false, note: 'app.js EXAM_BANK 解析失败：' + e.message });
  }

  // 题数 = 14
  checks.push({
    ok: jsonFigQs.length === 14,
    note: 'exam-bank.json 14 道图推题齐全（实际=' + jsonFigQs.length + '）',
  });

  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-2.1', '14 道图推题题干禁词零命中（双源验证）', allOk, summary);
}

// ============================================================
// AC-2.2 · 任意图推题题干只描述图形，不含答案路径
//        实现：题干字段扫描禁词 = 0（与 AC-2.1 同口径，独立 AC 拆分）
// ============================================================
function checkAC_2_2() {
  const checks = [];
  const jsonQs = loadExamJsonQuestions();
  const jsonFigQs = jsonQs.filter((q) => q && TARGET_IDS.indexOf(q.id) !== -1);
  const leakIds = [];
  jsonFigQs.forEach((q) => {
    // 题干含禁词（规则/方向/规律词）= 泄题
    if (scanField(q.q).length) leakIds.push(q.id);
  });
  checks.push({
    ok: leakIds.length === 0,
    note: '题干不含答案路径/规律词；泄题 id=' + JSON.stringify(leakIds),
  });

  // 题干长度合理性：太短可能是被改了，太长可能是塞了答案
  const lengths = jsonFigQs.map((q) => (q.q || '').length);
  const minLen = Math.min.apply(null, lengths);
  const maxLen = Math.max.apply(null, lengths);
  // 题干长度 20 ~ 500 之间为合理范围（图形描述+选项陈述）
  const lenOk = minLen >= 20 && maxLen <= 500;
  checks.push({
    ok: lenOk,
    note: '题干长度区间 [' + minLen + ', ' + maxLen + '] 字符（合理范围 20~500）',
  });

  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-2.2', '题干只描述图形，不含答案路径/规律词', allOk, summary);
}

// ============================================================
// AC-2.3 · 解析字段（x）允许出现规律描述
//        实现：x 字段应至少在部分题目中出现规律词（这是规律描述"该出现的位置"）
//   备注：P0-B 修复后字段已重命名 exp → x（PRD §3.3 命名）
// ============================================================
function checkAC_2_3() {
  const checks = [];
  const jsonQs = loadExamJsonQuestions();
  const jsonFigQs = jsonQs.filter((q) => q && TARGET_IDS.indexOf(q.id) !== -1);

  // x 字段存在性
  const allHaveX = jsonFigQs.every((q) => typeof q.x === 'string' && q.x.length > 0);
  checks.push({
    ok: allHaveX,
    note: '14 题 x 字段齐全',
  });

  // x 字段含规律词至少 ≥ 50%（说明这是"该出现的位置"）
  let xWithRule = 0;
  jsonFigQs.forEach((q) => {
    if (scanField(q.x || '').length) xWithRule += 1;
  });
  const xRatio = xWithRule / jsonFigQs.length;
  checks.push({
    ok: xRatio >= 0.5,
    note: 'x 含规律词题目比例=' + (xRatio * 100).toFixed(0) + '%（' + xWithRule + '/' + jsonFigQs.length + '，期望 ≥50%）',
  });

  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-2.3', '解析字段允许出现规律描述（exp 含规律词）', allOk, summary);
}

// ============================================================
// AC-2.4 · app.js JSON 覆盖 loader：fetch 失败时回退兜底数据 + warn，不崩
//        实现：grep app.js 含 try/catch + 内置 EXAM_BANK 兜底（手册第十三章）
// ============================================================
function checkAC_2_4() {
  const src = read(APP_JS);
  const checks = [];

  // 1) 存在 fetch('assets/data/exam-bank.json') 加载逻辑
  checks.push({
    ok: /fetch\s*\(\s*['"]assets\/data\/exam-bank\.json['"]\s*\)/.test(src),
    note: 'app.js 含 fetch("assets/data/exam-bank.json") 覆盖加载逻辑',
  });

  // 2) 含 .catch() 兜底（fetch 失败回退）
  const loaderBlock = src.match(/fetch\s*\(\s*['"]assets\/data\/exam-bank\.json['"][\s\S]{0,1200}?\}\)\.catch/);
  checks.push({
    ok: !!loaderBlock,
    note: 'loader 含 .catch() 兜底分支（fetch 失败回退内置 EXAM_BANK）',
  });

  // 3) 外层 try/catch（fetch 本身不可用场景）
  const outerTryCatch = /try\s*\{[\s\S]{0,1200}?fetch\s*\(\s*['"]assets\/data\/exam-bank\.json['"][\s\S]{0,1200}?\}\s*catch\s*\(\s*\w*\s*\)\s*\{/.test(src);
  checks.push({
    ok: outerTryCatch,
    note: 'loader 外层有 try/catch（fetch 不可用时回退内置数组）',
  });

  // 4) 兜底数据：内置 EXAM_BANK 必须存在
  const hasFallback = /const\s+EXAM_BANK\s*=\s*\[/.test(src);
  checks.push({
    ok: hasFallback,
    note: '内置 EXAM_BANK 兜底数据存在',
  });

  // 5) console.warn 提示（手册第十三章「不静默吞错」）
  const hasWarn = /console\.warn/.test(src);
  checks.push({
    ok: hasWarn,
    note: 'app.js 存在 console.warn 调用（不静默吞错，warn 即可）',
  });

  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-2.4', 'JSON loader 失败回退兜底数据 + warn，不崩', allOk, summary);
}

// ============================================================
// AC-2.5 · 题库字段结构稳定（id/type/q/o/a/x 齐全，缺字段不静默吞错）
//   备注：P0-B 修复后字段已严格对齐 PRD §3.3 命名（o/a/x，不再有 options/answer/exp 别名）。
// ============================================================
function checkAC_2_5() {
  const checks = [];
  const jsonQs = loadExamJsonQuestions();
  const jsonFigQs = jsonQs.filter((q) => q && TARGET_IDS.indexOf(q.id) !== -1);

  // 严格匹配 PRD 命名
  const REQUIRED = ['id', 'type', 'q', 'o', 'a', 'x'];
  const missingReport = [];
  jsonFigQs.forEach((q) => {
    REQUIRED.forEach((field) => {
      if (q[field] === undefined || q[field] === null) {
        missingReport.push({ id: q.id, field });
      } else if (field === 'q' && typeof q[field] !== 'string') {
        missingReport.push({ id: q.id, field: 'q (not string)' });
      } else if (field === 'o' && !Array.isArray(q[field])) {
        missingReport.push({ id: q.id, field: 'o (not array)' });
      } else if (field === 'x' && typeof q[field] !== 'string') {
        missingReport.push({ id: q.id, field: 'x (not string)' });
      }
    });
  });
  checks.push({
    ok: missingReport.length === 0,
    note: '14 题必需字段 id/type/q/o/a/x 齐全（P0-B 修复后严格匹配 PRD 命名），缺字段数=' + missingReport.length +
      (missingReport.length ? ('；首条：' + JSON.stringify(missingReport[0])) : ''),
  });

  // options 长度合理：3~5
  const badOptLens = [];
  jsonFigQs.forEach((q) => {
    if (Array.isArray(q.o) && (q.o.length < 3 || q.o.length > 5)) {
      badOptLens.push({ id: q.id, len: q.o.length });
    }
  });
  checks.push({
    ok: badOptLens.length === 0,
    note: '14 题 o 长度在 [3,5] 区间；不合规=' + JSON.stringify(badOptLens),
  });

  // answer 索引在 options 范围内
  const badAnswer = [];
  jsonFigQs.forEach((q) => {
    if (typeof q.a !== 'number' || q.a < 0 || (Array.isArray(q.o) && q.a >= q.o.length)) {
      badAnswer.push({ id: q.id, answer: q.a });
    }
  });
  checks.push({
    ok: badAnswer.length === 0,
    note: '14 题 a 索引在 o 范围内；不合规=' + JSON.stringify(badAnswer),
  });

  // id 唯一
  const ids = jsonFigQs.map((q) => q.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  checks.push({
    ok: dupIds.length === 0,
    note: '14 题 id 唯一；重复=' + JSON.stringify(dupIds),
  });

  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => (c.ok ? '✓' : '✗') + c.note).join('；');
  record('AC-2.5', '题库字段结构稳定（id/type/q/o/a/x 齐全，严格匹配 PRD）', allOk, summary);
}

// ============================================================
// 主流程
// ============================================================
function main() {
  console.log('=== T02 · 图形推理题干 QA · P0-B 重建 ===');
  console.log('仓库根:', ROOT);
  console.log('禁词表:', JSON.stringify(FORBIDDEN));
  console.log('目标 id:', JSON.stringify(TARGET_IDS));
  console.log('---');

  checkAC_2_1();
  checkAC_2_2();
  checkAC_2_3();
  checkAC_2_4();
  checkAC_2_5();

  console.log('---');
  console.log('SUMMARY: PASS=' + pass + '  FAIL=' + fail);
  process.exit(fail === 0 ? 0 : 1);
}

main();
