// tools/verify_q21_figures.js — P0-B T02 图形推理题干禁词扫描
//
// 用法：
//   node tools/verify_q21_figures.js
//
// 扫描目标：
//   - assets/app.js 内置 EXAM_BANK 中 id ∈ {1..10, 41..44} 共 14 题的 `q` 字段
//   - assets/data/exam-bank.json 全部 14 题的 `q` 字段
//
// 禁词表：依次|顺时针|逆时针|位置|方向|规律|对称
// 验收标准：14+14=28 处题干字段零命中（exp/tip 不限）
//
// 退出码：0=PASS（零命中），1=FAIL（至少一处命中）

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_JS = path.join(ROOT, 'assets', 'app.js');
const EXAM_JSON = path.join(ROOT, 'assets', 'data', 'exam-bank.json');

const FORBIDDEN = ['依次', '顺时针', '逆时针', '位置', '方向', '规律', '对称'];
const TARGET_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 41, 42, 43, 44];

function scanQuestion(q, id, source) {
  const text = q || '';
  const hits = [];
  FORBIDDEN.forEach((w) => {
    let idx = 0;
    while ((idx = text.indexOf(w, idx)) !== -1) {
      hits.push({ word: w, index: idx, snippet: text.substr(Math.max(0, idx - 6), 24) });
      idx += w.length;
    }
  });
  return { id, source, q: text, hits };
}

function loadAppJsQuestions() {
  const src = fs.readFileSync(APP_JS, 'utf8');
  // 提取 EXAM_BANK = [ ... ]; 整段
  const start = src.indexOf('const EXAM_BANK = [');
  if (start < 0) throw new Error('未在 app.js 中找到 const EXAM_BANK');
  const end = src.indexOf('];', start);
  if (end < 0) throw new Error('未在 app.js 中找到 EXAM_BANK 结束 ]');
  let block = src.slice(start, end + 2);  // 包含 ];
  block = block.replace(/^const\s+EXAM_BANK\s*=\s*/, '').replace(/;\s*$/, '');
  // 改用 Function 构造避免污染全局；用 Array.from 转回普通数组（保持顺序）
  const arr = (new Function('return ' + block + ';'))();
  return Array.from(arr);
}

function loadExamJsonQuestions() {
  const j = JSON.parse(fs.readFileSync(EXAM_JSON, 'utf8'));
  if (!j || !Array.isArray(j.questions)) throw new Error('exam-bank.json questions 字段缺失或非数组');
  return j.questions;
}

function run() {
  const failures = [];
  const allReports = [];

  // 1. app.js 内置 14 题
  try {
    const bank = loadAppJsQuestions();
    TARGET_IDS.forEach((id) => {
      const q = bank.find((x) => x && x.id === id);
      if (!q) {
        failures.push(`app.js 中未找到 id=${id} 的题目`);
        return;
      }
      const rep = scanQuestion(q.q, id, 'app.js');
      allReports.push(rep);
      if (rep.hits.length) failures.push(`app.js id=${id} 题干命中禁词: ${JSON.stringify(rep.hits)}`);
    });
  } catch (e) {
    failures.push('解析 app.js EXAM_BANK 失败：' + e.message);
  }

  // 2. exam-bank.json 14 题
  try {
    const list = loadExamJsonQuestions();
    if (list.length !== 14) failures.push(`exam-bank.json 题目数=${list.length}，期望 14`);
    list.forEach((q) => {
      if (!TARGET_IDS.includes(q.id)) {
        failures.push(`exam-bank.json 中存在非法 id=${q.id}（期望 ${TARGET_IDS.join(',')}）`);
        return;
      }
      const rep = scanQuestion(q.q, q.id, 'exam-bank.json');
      allReports.push(rep);
      if (rep.hits.length) failures.push(`exam-bank.json id=${q.id} 题干命中禁词: ${JSON.stringify(rep.hits)}`);
    });
  } catch (e) {
    failures.push('解析 exam-bank.json 失败：' + e.message);
  }

  // 3. 输出一致性：每个 id 在 app.js 与 JSON 中 q 字段应一致
  try {
    const bank = loadAppJsQuestions();
    const list = loadExamJsonQuestions();
    TARGET_IDS.forEach((id) => {
      const a = bank.find((x) => x && x.id === id);
      const b = list.find((x) => x && x.id === id);
      if (a && b && a.q !== b.q) failures.push(`id=${id} q 字段 app.js 与 JSON 不一致`);
    });
  } catch (e) {
    // 上游已报
  }

  if (failures.length === 0) {
    console.log(`PASS：扫描 14 题 × 2 来源 = 28 处题干，禁词零命中。`);
    process.exit(0);
  } else {
    console.log('FAIL：');
    failures.forEach((m) => console.log('  - ' + m));
    process.exit(1);
  }
}

run();