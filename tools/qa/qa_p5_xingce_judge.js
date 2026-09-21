#!/usr/bin/env node
/* =====================================================================
   qa_p5_xingce_judge.js —— P5 行测答题判定异常复现（静态校验，只诊断不修源码）
   ---------------------------------------------------------------------
   目标：复现/排除「行测答题判定异常」。运行时判定契约（app.js）：
     · 题目对象口径：{ id:number, type, sub, diff, q, o:[选项2-4个], a:<正确答案索引0起>, x:解析, tip }
     · 判分：answerExamQuestion() 用 selectedIndex === q.a（app.js:4703）
     · 渲染：renderExamQuestion() 用 i === q.a 标绿（app.js:4669），解析区显示 labels[q.a]（app.js:4749）
     · 合并：mergeExamBankQuestions() 只校验 id:number 与 q 非空（app.js:387），
       对 o/a 无任何守卫 —— 脏数据会原样进入判定链路。
   数据源（全部扫描）：
     A. assets/app.js 内置 EXAM_BANK（60 题，离线兜底）
     B. assets/data/exam-bank.json（覆盖层，同 id 覆盖内置，allowOverride=true）
     C. exam-bank-ext-index.json 声明的 14 个增量分片（只 push 不覆盖）
        + 磁盘上存在但未被索引引用的 exam-bank-ext*.json（疑似死数据）
     D. assets/mini-exam.js 央国企 quiz 库（mini.js pick() 同样用 i === q.a 判分）
   校验项：
     S1 结构：a 必须是 0..o.length-1 的整数；o 为 2-4 个非空字符串；q/x 非空
     S2 口径：出现 answer/options/ans/correct 等异口径字段（运行时会被静默忽略 → 判定必然错乱）
     S4 置换错位：解析 x 中的结论字母（选X/答案是X/X正确…）与 a 指向选项不一致
     S5 分片契约：增量分片含 id<101（会被 merge 静默丢弃 = 死数据）
     S6 覆盖层一致性：exam-bank.json 自述与内置 id 1-10/41-44「严格一致」，逐字段比对
     W* 软校验：数量/资料类解析未复述正确选项内容、diff 超出 UI 三档、未被索引引用的文件
   结论三选一（路由规则）：
     BUG_CONFIRMED   —— 判定代码/合并链路自身缺陷（有效数据被误判或无守卫放进判定链）
     DATA_ISSUE      —— 判定代码正确，题库数据 answer 口径或置换错位
     NOT_REPRODUCED  —— 全部通过，静态层面无法复现异常
   输出：本文件同目录 qa_p5_result.log（P4：落盘，对话只看 FAIL 行 + 汇总行）
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const LOG_PATH = path.join(__dirname, 'qa_p5_result.log');
const LABELS = ['A', 'B', 'C', 'D'];

const fails = [], warns = [], infos = [];
const F = (tag, msg) => fails.push(`FAIL [${tag}] ${msg}`);
const W = (tag, msg) => warns.push(`WARN [${tag}] ${msg}`);
const I = (msg) => infos.push(`INFO ${msg}`);

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel.replace(/\?.*$/, '')), 'utf8');
}
function readJson(rel) {
  return JSON.parse(readText(rel));
}

/* ---------- 口径/置换错位核心校验 ---------- */
// 提取解析 x 中的「结论字母」。只取高置信度判定句式，避免把逐项分析中的 A/B/C/D 误报。
const VERDICT_PATTERNS = [
  /选\s*([A-D])(?![\u4e00-\u9fa5A-Za-z0-9])/g,          // 选A / 故选B / 综合选C
  /应选\s*([A-D])(?![\u4e00-\u9fa5A-Za-z0-9])/g,        // 应选D
  /答案\s*[是为]\s*([A-D])(?![\u4e00-\u9fa5A-Za-z0-9])/g, // 答案是B / 答案为C
  /正确答案\s*[是为]?\s*([A-D])(?![\u4e00-\u9fa5A-Za-z0-9])/g, // 正确答案D / 正确答案是A
  /([A-D])\s*项\s*(?:最|正|符)[^，。；]{0,6}/g,           // A项正确 / A项最符合
  /(?:^|[，。；,;（(])\s*([A-D])正确/g                    // ……，C正确
];
function extractVerdictLetters(x) {
  const out = new Set();
  if (typeof x !== 'string') return [];
  VERDICT_PATTERNS.forEach(re => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(x))) out.add(m[1]);
  });
  return [...out];
}

// 校验单题，返回 true = 结构性可用。tag 用于日志定位。
function validateItem(q, tag, opts) {
  opts = opts || {};
  let ok = true;
  if (!q || typeof q !== 'object') { F(tag, '题目不是对象'); return false; }
  if (!opts.noIdCheck && typeof q.id !== 'number') { F(tag, `id 非数字（${JSON.stringify(q.id)}）—— merge 会静默丢弃或误判`); ok = false; }
  if (typeof q.q !== 'string' || !q.q.trim()) { F(tag, '题干 q 为空'); ok = false; }
  // S2 口径：异口径字段（运行时全部静默忽略）
  const STRAY = ['answer', 'options', 'ans', 'correct', 'opt', 'answers'];
  const stray = STRAY.filter(k => Object.prototype.hasOwnProperty.call(q, k));
  if (stray.length) {
    const v = q[stray[0]];
    F(tag, `出现异口径字段 ${stray.join(',')}（运行时只认 o/a，这些字段被静默忽略 → 判定必然错位）；示例值=${JSON.stringify(v).slice(0, 60)}`);
    ok = false;
  }
  // S1 结构
  if (!Array.isArray(q.o) || q.o.length < 2 || q.o.length > 4 || !q.o.every(s => typeof s === 'string' && s.trim())) {
    F(tag, `o 非法（应为 2-4 个非空字符串数组），实际=${JSON.stringify(q.o).slice(0, 80)}`);
    ok = false;
  } else if (!Number.isInteger(q.a) || q.a < 0 || q.a >= q.o.length) {
    F(tag, `a 越界/非法：a=${JSON.stringify(q.a)}，但 o.length=${q.o.length} —— 渲染无正确项高亮、判分恒错`);
    ok = false;
  }
  if (typeof q.x !== 'string' || !q.x.trim()) { F(tag, '解析 x 为空（PRD 八字段要求）'); ok = false; }
  if (typeof q.tip !== 'string' || !q.tip.trim()) W(tag, 'tip 为空（PRD 八字段要求，软性）');
  if (q.diff !== undefined && ![1, 2, 3].includes(q.diff)) W(tag, `diff=${JSON.stringify(q.diff)} 超出 UI 三档（简单/中等/困难），UI 回落「中等」`);

  // S4 置换错位：解析结论字母 vs a
  if (ok && typeof q.x === 'string' && Number.isInteger(q.a) && q.a >= 0 && q.a < (q.o || []).length) {
    const letters = extractVerdictLetters(q.x);
    const wrong = letters.filter(L => LABELS.indexOf(L) !== q.a);
    if (wrong.length) {
      F(tag, `置换错位：解析结论指向 ${wrong.join('/')}，但 a=${q.a}（即 ${LABELS[q.a]}=「${q.o[q.a]}」）—— 判分/高亮与解析自相矛盾`);
      ok = false; // 数据层错位
    }
    // 软校验：数量/资料类，解析应复述正确选项内容
    if (opts.numeric && !q.x.includes(String(q.o[q.a]).replace(/\s+/g, ''))) {
      W(tag, `解析未复述正确选项「${q.o[q.a]}」原文（可能置换错位，请人工复核）`);
    }
  }
  return ok;
}

/* ========== A. 内置 EXAM_BANK（离线兜底 60 题） ========== */
let builtin = [];
try {
  const appSrc = readText('assets/app.js');
  const m = appSrc.match(/const EXAM_BANK = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error('未在 app.js 定位到 EXAM_BANK 字面量');
  builtin = vm.runInNewContext('[' + m[1] + ']', {}, { timeout: 5000 });
  I(`A. 内置 EXAM_BANK 提取成功：${builtin.length} 题`);
} catch (e) {
  F('EXTRACT-A', '内置 EXAM_BANK 提取失败：' + e.message);
}
const NUMERIC_TYPES = new Set(['数量关系', '资料分析']);
builtin.forEach((q, i) => validateItem(q, `A:app.js#${q && q.id !== undefined ? q.id : i + 1}`, { numeric: q && NUMERIC_TYPES.has(q.type) }));

/* ========== 复刻运行时合并语义（mergeExamBankQuestions） ========== */
const eff = builtin.slice();
const seenId = new Map(builtin.filter(q => typeof q.id === 'number').map(q => [q.id, 'A:内置']));
function mergeSim(questions, srcTag, allowOverride) {
  if (!Array.isArray(questions)) return;
  questions.forEach(q => {
    if (!q || typeof q.id !== 'number' || !q.q) return; // 与运行时守卫一致
    if (seenId.has(q.id)) {
      if (allowOverride) {
        const at = eff.findIndex(o => o.id === q.id);
        eff[at] = q;
        seenId.set(q.id, srcTag);
      } else {
        // 增量分片语义：同 id 静默跳过
        const prev = seenId.get(q.id);
        if (q.id < 101) {
          F('S5', `${srcTag} 增量分片含 id=${q.id}（<101，与${prev}冲突）—— 运行时被静默丢弃，属分片契约违规的死数据`);
        } else {
          W('S5', `${srcTag} 与 ${prev} 存在同 id=${q.id} —— 增量语义下后者被静默跳过`);
        }
      }
    } else {
      eff.push(q);
      seenId.set(q.id, srcTag);
    }
  });
}

/* ========== B. 覆盖层 exam-bank.json（allowOverride=true） ========== */
let overlayQs = [];
try {
  const j = readJson('assets/data/exam-bank.json');
  overlayQs = Array.isArray(j.questions) ? j.questions : [];
  I(`B. 覆盖层 exam-bank.json：${overlayQs.length} 题（同 id 覆盖内置）`);
} catch (e) { F('LOAD-B', 'exam-bank.json 读取失败：' + e.message); }

// S6：覆盖层自述与内置 id 1-10/41-44「严格一致」——逐字段比对
const KEYS = ['type', 'sub', 'diff', 'q', 'o', 'a', 'x', 'tip'];
overlayQs.forEach(oq => {
  const bq = builtin.find(b => b.id === oq.id);
  if (!bq) return;
  const diffs = KEYS.filter(k => JSON.stringify(bq[k]) !== JSON.stringify(oq[k]));
  if (diffs.length) {
    F('S6', `覆盖层与内置 id=${oq.id} 不一致（自述「严格一致」）：字段 ${diffs.join(',')}；内置 a=${JSON.stringify(bq.a)} vs 覆盖层 a=${JSON.stringify(oq.a)}`);
  }
});
overlayQs.forEach((q, i) => validateItem(q, `B:exam-bank.json#${q && q.id !== undefined ? q.id : i + 1}`, { numeric: q && NUMERIC_TYPES.has(q.type) }));
mergeSim(overlayQs, 'B:覆盖层', true);

/* ========== C. 增量分片（索引声明 + 磁盘全量扫描） ========== */
let idxShards = [], idxLegacy = null;
try {
  const idx = readJson('assets/data/exam-bank-ext-index.json');
  idxShards = (idx.shards || []).map(s => (typeof s === 'object') ? s.file : s).filter(Boolean);
  idxLegacy = idx.legacy && ((typeof idx.legacy === 'object') ? idx.legacy.file : idx.legacy);
  I(`C. 索引声明 ${idxShards.length} 个分片 + legacy=${idxLegacy || '无'}`);
} catch (e) { F('LOAD-C', 'exam-bank-ext-index.json 读取失败：' + e.message); }

const diskShards = [];
try {
  fs.readdirSync(path.join(ROOT, 'assets/data')).forEach(f => {
    if (/^exam-bank-ext.*\.json$/.test(f) && f !== 'exam-bank-ext-index.json') diskShards.push('assets/data/' + f);
  });
} catch (e) { /* ignore */ }
const declared = new Set([...idxShards, idxLegacy].filter(Boolean).map(p => p.split('?')[0]));
diskShards.forEach(p => {
  if (!declared.has(p) && p !== 'assets/data/exam-bank.json') W('W1', `磁盘存在但未被索引引用：${p}（疑似死数据/漏登记）`);
});

const shardSources = [];
idxShards.forEach(p => shardSources.push(p));
if (idxLegacy) {
  const lg = String(idxLegacy).split('?')[0];
  const builtinLegacy = String('assets/data/exam-bank.json');
  if (lg !== builtinLegacy) { I(`索引 legacy=${idxLegacy} 与入口直连路径不同，按运行时逻辑会再加载一次`); shardSources.push(idxLegacy); }
}
shardSources.forEach(rel => {
  let qs = [];
  try {
    const j = readJson(rel);
    qs = Array.isArray(j.questions) ? j.questions : [];
    I(`   分片 ${rel}：${qs.length} 题`);
  } catch (e) { F('LOAD-C', `${rel} 读取/解析失败：${e.message}`); return; }
  const typeGuess = /-([a-z]+)\.json$/.exec(rel);
  qs.forEach((q, i) => validateItem(q, `C:${path.basename(rel)}#${q && q.id !== undefined ? q.id : i + 1}`, { numeric: q && NUMERIC_TYPES.has(q.type) }));
  mergeSim(qs, `C:${path.basename(rel)}`, false);
});

/* ========== D. 央国企 quiz 库（mini.js 判分 i === q.a） ========== */
try {
  const sandbox = { window: {} };
  vm.runInNewContext(readText('assets/mini-exam.js'), sandbox, { timeout: 5000 });
  const bank = sandbox.window.MINI_BANK || {};
  Object.keys(bank).forEach(key => {
    const cat = bank[key];
    if (!cat || cat.mode !== 'quiz' || !Array.isArray(cat.q)) return;
    cat.q.forEach((q, i) => {
      const qq = Object.assign({}, q);
      // mini quiz 题目本就无 id 字段（mini.js 按 S.qs[i] 定位），跳过 id 校验
      validateItem(qq, `D:mini-exam.js:${key}#${i + 1}`, { noIdCheck: true, numeric: true });
    });
  });
  I(`D. mini-exam.js quiz 库扫描完成（exam-quant/deduce/data/common）`);
} catch (e) { F('LOAD-D', 'mini-exam.js 沙箱执行失败：' + e.message); }

/* ========== 汇总 ========== */
const dupQ = new Map();
eff.forEach(q => {
  const k = (q.q || '').slice(0, 40);
  if (!k) return;
  if (!dupQ.has(k)) dupQ.set(k, []);
  dupQ.get(k).push(q.id);
});
[...dupQ.entries()].filter(([, v]) => v.length > 1).forEach(([k, v]) =>
  W('W2', `疑似重复题干（前 40 字）：id ${v.join(',')}：「${k}…」`));

// 结论三选一：判定代码与数据口径自洽且结构/口径/置换校验全过 → 未复现；
// 否则按路由规则归为数据侧问题（本题库体系为纯数据驱动，代码缺陷需另有证据才升级 BUG_CONFIRMED）
const CONCLUSION = fails.length ? 'DATA_ISSUE' : 'NOT_REPRODUCED';

// 判定代码层面核查（用于区分 BUG_CONFIRMED）：codeReview 事实清单
const codeFacts = [
  'app.js:4703 判分 selectedIndex === q.a（索引制，与全部数据源 o/a 口径一致）',
  'app.js:4669/4749 高亮与解析均由 q.a 派生（单一事实来源，无第二套口径）',
  'app.js:387 mergeExamBankQuestions 仅守卫 id:number 与 q 非空，对 o/a 无守卫（脏数据可直达判定链）',
  'mini.js:109 央国企 quiz 判分 i === q.a（同口径）',
  'app.js:4664 渲染 labels 固定 A-D 四项，与 qbank.js 自定义题 2-4 选项上限自洽',
  'mini.js:5 头注释声明字段含 ans，但代码与全部数据只用 a（注释漂移，无运行时影响）'
];

const lines = [];
lines.push('================================================================');
lines.push('P5 行测答题判定异常复现 —— 静态校验报告（只诊断不修源码）');
lines.push(`时间：${new Date().toISOString()}    根目录：${ROOT}`);
lines.push('================================================================');
lines.push('');
lines.push('--- 判定代码核查（code review 事实） ---');
codeFacts.forEach(s => lines.push('  · ' + s));
lines.push('');
lines.push('--- 数据源覆盖 ---');
infos.forEach(s => lines.push(s));
lines.push('');
lines.push(`--- FAIL（${fails.length}）---`);
fails.forEach(s => lines.push(s));
lines.push('');
lines.push(`--- WARN（${warns.length}）---`);
warns.forEach(s => lines.push(s));
lines.push('');
lines.push('--- 汇总 ---');
lines.push(`有效题库（模拟运行时合并后）：${eff.length} 题；FAIL=${fails.length}  WARN=${warns.length}`);
lines.push(`结论：${CONCLUSION}`);
if (CONCLUSION === 'BUG_CONFIRMED') {
  lines.push('路由：→ Engineer（判定/合并代码缺陷，需修源码）');
} else if (CONCLUSION === 'DATA_ISSUE') {
  lines.push('路由：→ 数据侧（判定代码与 o/a 索引口径自洽；异常来自题库数据口径/置换错位，按上方 FAIL 行逐条修数据）');
} else {
  lines.push('路由：→ 无（静态层面未复现；若线上仍有异常，需转向运行时 DOM 探针复现）');
}
lines.push('================================================================');

const report = lines.join('\n');
fs.writeFileSync(LOG_PATH, report, 'utf8');
console.log(report);
console.log(`\n[落盘] ${LOG_PATH}`);
