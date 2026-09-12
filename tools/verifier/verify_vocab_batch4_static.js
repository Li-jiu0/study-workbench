/**
 * 词库批次四（20260913b）静态独立验证 —— 新眼睛证伪版
 * ---------------------------------------------------------------------------
 * 覆盖任务点 A（结构完整性）/ B（抽样质量，落盘）/ C（三份疑点定向核查）/ F（性能余量）
 * 不触碰并行代码线的 assets/app.js 与 assets/data/exam-bank*（仅只读解析内置 CET_VOCAB）
 *
 * 用法：node tools/verifier/verify_vocab_batch4_static.js
 * 结果同时写盘：tools/verifier/out_vocab_batch4_static.txt（供 Read 读取，规避 stdout 捕获失效）
 * 退出码：0=全部断言通过，1=存在失败断言
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const EXT = path.join(ROOT, 'assets', 'data', 'vocab-cet4-ext.json');
const APP = path.join(ROOT, 'assets', 'app.js');
const OUT_TXT = path.join(__dirname, 'out_vocab_batch4_static.txt');

const L = [];
function log(s) { L.push(String(s)); }
const results = [];
function assert(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
  log((cond ? '  [PASS] ' : '  [FAIL] ') + name + (cond ? '' : '   ->   ' + detail));
}

// --------------------------- 读取增量文件 ---------------------------
const extRaw = fs.readFileSync(EXT, 'utf8');
const extBytes = Buffer.byteLength(extRaw, 'utf8');
let ext;
try { ext = JSON.parse(extRaw); } catch (e) {
  log('JSON 解析失败：' + e.message); fs.writeFileSync(OUT_TXT, L.join('\n')); process.exit(1);
}
const words = Array.isArray(ext.words) ? ext.words : [];

// word -> 行号（紧凑格式一行一词，用于给出词条级证据）
const rawLines = extRaw.split(/\r?\n/);
const wordLine = {};
rawLines.forEach(function (ln, i) {
  const m = /"word"\s*:\s*"([^"]*)"/.exec(ln);
  if (m && wordLine[m[1]] === undefined) wordLine[m[1]] = i + 1;
});
function LNo(w) { return wordLine[w] ? ('L' + wordLine[w]) : 'L?'; }

// --------------------------- 提取内置 CET_VOCAB ---------------------------
function extractBuiltin(src) {
  const start = src.indexOf('const CET_VOCAB = [');
  if (start < 0) return null;
  const arrStart = src.indexOf('[', start);
  let depth = 0, i = arrStart, inStr = null, esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (c === '\\') { esc = true; }
      else if (c === inStr) { inStr = null; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { i++; break; } }
  }
  const lit = src.slice(arrStart, i);
  // eslint-disable-next-line no-new-func
  return new Function('return ' + lit)();
}
const builtin = extractBuiltin(fs.readFileSync(APP, 'utf8'));

const norm = function (s) { return String(s === undefined || s === null ? '' : s).toLowerCase().trim(); };
const builtinKeys = new Set((builtin || []).map(function (w) { return norm(w.word); }));

log('====================================================================');
log('词库批次四静态独立验证 · 项目根：' + ROOT);
log('增量文件字节数：' + extBytes + ' (' + (extBytes / 1024).toFixed(1) + ' KB)');
log('内置 CET_VOCAB 条数：' + (builtin ? builtin.length : 'null'));
log('增量 words 条数：' + words.length);
log('====================================================================');

// =====================================================================
// A1 条数 / 去重 / 与内置冲突
// =====================================================================
log('\n【A1 条数 / 去重 / 冲突】');
assert('version = 20260913b', ext.version === '20260913b', String(ext.version));
assert('增量条数 = 2236', words.length === 2236, '实际 ' + words.length);

// 规范化（lowercase+trim）去重
const normDupMap = {};
const normDups = [];
words.forEach(function (w) {
  const k = norm(w.word);
  if (!k) { normDups.push('(空)'); return; }
  if (normDupMap[k]) normDups.push(k); else normDupMap[k] = 1;
});
assert('规范化 lower+trim 去重后 0 重复', normDups.length === 0, '重复 ' + normDups.length + '：' + normDups.slice(0, 10).join(','));

// 原始大小写精确去重（运行时真实去重键）
const rawDupMap = {};
const rawDups = [];
words.forEach(function (w) {
  const k = String(w.word);
  if (rawDupMap[k]) rawDups.push(k); else rawDupMap[k] = 1;
});
assert('原始大小写精确去重后 0 重复（运行时真实去重键 w.word）', rawDups.length === 0, '重复 ' + rawDups.length + '：' + rawDups.slice(0, 10).join(','));

// 与内置 466 冲突
const conflicts = [];
words.forEach(function (w) {
  if (builtinKeys.has(norm(w.word))) conflicts.push(w.word);
});
assert('与内置 ' + (builtin ? builtin.length : '?') + ' 词规范化冲突 = 0', conflicts.length === 0, '冲突 ' + conflicts.length + '：' + conflicts.slice(0, 15).join(','));

// 内置词是否有非规范键（大小写/空格）
const builtinAbnormal = (builtin || []).filter(function (w) { return String(w.word) !== norm(w.word); });
log('内置词中非小写/含空格的键个数：' + builtinAbnormal.length + (builtinAbnormal.length ? '（' + builtinAbnormal.slice(0, 5).map(function (w) { return JSON.stringify(w.word); }).join(',') + '）' : ''));
// 内置是否有规范化后重复
const bSetPre = new Set();
const bDup = [];
(builtin || []).forEach(function (w) { const k = norm(w.word); if (bSetPre.has(k)) bDup.push(k); else bSetPre.add(k); });
log('内置词规范化去重后：' + bSetPre.size + ' 个唯一键' + (bDup.length ? '，重复 ' + bDup.join(',') : ''));

// =====================================================================
// A2 字段严格 9 个 + 类型
// =====================================================================
log('\n【A2 字段结构】');
const WANT = ['word', 'phonetic', 'meaning', 'root', 'collocation', 'synonym', 'antonym', 'example', 'example2'];
const STR6 = ['word', 'phonetic', 'meaning', 'root', 'example', 'example2'];
const ARR3 = ['collocation', 'synonym', 'antonym'];
const fieldBad = [];
const extraFieldTally = {};
let hasDetail = 0;
let keyOrderBad = 0;
words.forEach(function (w, idx) {
  const keys = Object.keys(w);
  const extra = keys.filter(function (k) { return WANT.indexOf(k) < 0; });
  const missing = WANT.filter(function (k) { return keys.indexOf(k) < 0; });
  extra.forEach(function (k) { extraFieldTally[k] = (extraFieldTally[k] || 0) + 1; });
  if (extra.indexOf('detail') >= 0) hasDetail++;
  const typeBad = [];
  STR6.forEach(function (k) { if (w[k] !== undefined && typeof w[k] !== 'string') typeBad.push(k + '非字符串'); });
  ARR3.forEach(function (k) { if (!Array.isArray(w[k])) typeBad.push(k + '非数组'); });
  // 键顺序
  const sameOrder = keys.length === WANT.length && WANT.every(function (k, i) { return keys[i] === k; });
  if (!sameOrder) keyOrderBad++;
  if (extra.length || missing.length || typeBad.length) {
    fieldBad.push('#' + idx + ' ' + w.word + ': ' + [].concat(
      extra.length ? ['多余 ' + extra.join('/')] : [],
      missing.length ? ['缺 ' + missing.join('/')] : [],
      typeBad
    ).join(';'));
  }
});
assert('每条严格 9 字段且类型正确（6 字符串 + 3 数组）', fieldBad.length === 0, fieldBad.slice(0, 8).join(' | '));
assert('无任何 detail 字段（历史废弃字段回归）', hasDetail === 0, '含 detail 的条数 ' + hasDetail);
log('多余字段统计：' + JSON.stringify(extraFieldTally));
log('键顺序与规范不一致条数（信息项，非失败）：' + keyOrderBad);

// =====================================================================
// A3 非空率 + example/example2 差异
// =====================================================================
log('\n【A3 非空率 / 例句差异】');
function rate(field) {
  const n = words.filter(function (w) { return String(w[field] === undefined ? '' : w[field]).trim() !== ''; }).length;
  return n;
}
[['word', 1], ['phonetic', 1], ['meaning', 1], ['example', 1], ['example2', 1]].forEach(function (pair) {
  const f = pair[0];
  const n = rate(f);
  const pct = (n / words.length * 100).toFixed(1);
  log('  ' + f + ' 非空：' + n + ' / ' + words.length + '（' + pct + '%）');
});
assert('word 非空 2236/2236', rate('word') === words.length, rate('word') + '');
assert('phonetic 非空 2236/2236', rate('phonetic') === words.length, rate('phonetic') + '');
assert('meaning 非空 2236/2236', rate('meaning') === words.length, rate('meaning') + '');
assert('example 非空 2236/2236', rate('example') === words.length, rate('example') + '');
assert('example2 非空 2236/2236', rate('example2') === words.length, rate('example2') + '');

const sameEx = words.filter(function (w) {
  return String(w.example || '').trim() !== '' &&
    String(w.example || '').trim() === String(w.example2 || '').trim();
});
log('  example === example2 完全相同（凑数）条数：' + sameEx.length);
sameEx.forEach(function (w) {
  log('    ' + LNo(w.word) + '  ' + w.word + '  ->  ' + JSON.stringify(w.example));
});
assert('example 与 example2 完全相同（凑数）条数 = 0', sameEx.length === 0, '相同 ' + sameEx.length + ' 条');

// 近似重复（词元集合 Jaccard ≥ 0.75 且非完全相同）——识别「同义改写」凑数
function toks(s) { return String(s || '').toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean); }
function jac(a, b) {
  const A = new Set(toks(a)), B = new Set(toks(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(function (t) { if (B.has(t)) inter++; });
  return inter / (A.size + B.size - inter);
}
const nearDup = [];
words.forEach(function (w) {
  const a = String(w.example || '').trim(), b = String(w.example2 || '').trim();
  if (!a || !b || a === b) return;
  const j = jac(a, b);
  if (j >= 0.75) nearDup.push({ w: w.word, j: j, a: a, b: b });
});
nearDup.sort(function (x, y) { return y.j - x.j; });
log('  example/example2 词元 Jaccard≥0.75（高度同义改写）条数：' + nearDup.length + '（信息项，非失败）');
nearDup.slice(0, 60).forEach(function (d) {
  log('    ' + LNo(d.w) + '  ' + d.w + '  J=' + d.j.toFixed(2) + '  «' + d.a + '»  /  «' + d.b + '»');
});

// =====================================================================
// A4 字母分布 vs 自报
// =====================================================================
log('\n【A4 字母分布】');
const REPORTED = { "a": 30, "b": 106, "c": 229, "d": 115, "e": 83, "f": 83, "g": 70, "h": 69, "i": 145, "j": 22, "k": 21, "l": 67, "m": 141, "n": 53, "o": 112, "p": 161, "q": 22, "r": 143, "s": 189, "t": 185, "u": 44, "v": 58, "w": 68, "y": 12, "z": 8 };
const dist = {};
words.forEach(function (w) {
  const c = norm(w.word).charAt(0);
  dist[c] = (dist[c] || 0) + 1;
});
const keys = Array.from(new Set(Object.keys(dist).concat(Object.keys(REPORTED)))).sort();
const distDiff = [];
keys.forEach(function (k) {
  const a = dist[k] || 0, b = REPORTED[k] || 0;
  log('  ' + k + ': 实际 ' + a + ' / 自报 ' + b + (a === b ? '' : '  <<< 不符'));
  if (a !== b) distDiff.push(k + '(实际' + a + '/自报' + b + ')');
});
assert('字母分布与工程师自报逐位一致', distDiff.length === 0, distDiff.join(', '));
const sumDist = Object.keys(dist).reduce(function (s, k) { return s + dist[k]; }, 0);
assert('分布求和 = 2236', sumDist === 2236, '实际 ' + sumDist);
log('实际分布对象：' + JSON.stringify(dist));

// =====================================================================
// A5 批次归属推断（文件为「批次追加」结构：words[0:1573] 应等于批次三旧档）
// =====================================================================
log('\n【A5 批次归属 / 新增 663 词定位】');
const BATCH3_DIST = { a: 30, b: 30, c: 55, d: 32, e: 28, f: 24, g: 70, h: 69, i: 94, j: 22, k: 21, l: 67, m: 88, n: 53, o: 71, p: 161, q: 22, r: 143, s: 189, t: 114, u: 44, v: 58, w: 68, y: 12, z: 8 };
const first1573 = words.slice(0, 1573);
const last663 = words.slice(1573);
function distOf(arr) {
  const d = {};
  arr.forEach(function (w) { const c = norm(w.word).charAt(0); d[c] = (d[c] || 0) + 1; });
  return d;
}
const dOld = distOf(first1573);
const dNew = distOf(last663);
const oldMismatch = [];
Object.keys(BATCH3_DIST).forEach(function (k) { if ((dOld[k] || 0) !== BATCH3_DIST[k]) oldMismatch.push(k + '(实际' + (dOld[k] || 0) + '/批次三' + BATCH3_DIST[k] + ')'); });
const oldExtra = Object.keys(dOld).filter(function (k) { return BATCH3_DIST[k] === undefined; }).map(function (k) { return k + '(实际' + dOld[k] + ')'; });
log('  words[0:1573] 首字母分布：' + JSON.stringify(dOld));
log('  words[1573:2236]（新增 663）首字母分布：' + JSON.stringify(dNew));
log('  words[0:1573] 与批次三旧档分布不一致项：' + (oldMismatch.length ? oldMismatch.join(', ') : '无') + (oldExtra.length ? ('；多出 ' + oldExtra.join(',')) : ''));
// 预期 diff（新-旧）
const expDiff = { a: 0, b: 76, c: 174, d: 83, e: 55, f: 59, g: 0, h: 0, i: 51, j: 0, k: 0, l: 0, m: 53, n: 0, o: 41, p: 0, q: 0, r: 0, s: 0, t: 71, u: 0, v: 0, w: 0, y: 0, z: 0 };
const newMismatch = [];
Object.keys(expDiff).forEach(function (k) { if ((dNew[k] || 0) !== expDiff[k]) newMismatch.push(k + '(实际' + (dNew[k] || 0) + '/预期' + expDiff[k] + ')'); });
log('  words[1573:] 与「当前-批次三」预期差集不一致项：' + (newMismatch.length ? newMismatch.join(', ') : '无'));
assert('words[0:1573] 首字母分布 = 批次三旧档（顺序追加结构成立）', oldMismatch.length === 0 && oldExtra.length === 0, oldMismatch.concat(oldExtra).join(', '));
assert('words[1573:2236] 即本批新增 663 词（分布 = 当前-批次三）', newMismatch.length === 0, newMismatch.join(', '));

// =====================================================================
// C1 大小写/空格绕过去重（规范化 vs 原始）
// =====================================================================
log('\n【C1 绕过去重扫描】');
const notLower = words.filter(function (w) { return String(w.word) !== String(w.word).toLowerCase(); });
const notTrimmed = words.filter(function (w) { return String(w.word) !== String(w.word).trim(); });
const hasSpace = words.filter(function (w) { return /\s/.test(String(w.word)); });
const hasNonAscii = words.filter(function (w) { return /[^\x00-\x7F]/.test(String(w.word)); });
log('  非全小写 word 条数：' + notLower.length + (notLower.length ? '：' + notLower.slice(0, 10).map(function (w) { return JSON.stringify(w.word); }).join(',') : ''));
log('  首尾含空白 word 条数：' + notTrimmed.length + (notTrimmed.length ? '：' + notTrimmed.slice(0, 10).map(function (w) { return JSON.stringify(w.word); }).join(',') : ''));
log('  含任意空白 word 条数：' + hasSpace.length + (hasSpace.length ? '：' + hasSpace.slice(0, 10).map(function (w) { return JSON.stringify(w.word); }).join(',') : ''));
log('  含非 ASCII 字符 word 条数：' + hasNonAscii.length + (hasNonAscii.length ? '：' + hasNonAscii.slice(0, 10).map(function (w) { return JSON.stringify(w.word); }).join(',') : ''));
assert('全部 word 均为小写（否则运行时大小写敏感去重可能漏并）', notLower.length === 0, '非小写 ' + notLower.length);
assert('全部 word 均无首尾空白', notTrimmed.length === 0, '含空白 ' + notTrimmed.length);
assert('全部 word 无内嵌空白/非 ASCII（干净词形）', hasSpace.length === 0 && hasNonAscii.length === 0,
  '空白 ' + hasSpace.length + ' / 非ASCII ' + hasNonAscii.length);

// =====================================================================
// C2 与内置冲突（按首字母分段统计）
// =====================================================================
log('\n【C2 与内置冲突分段】');
const confByLetter = {};
conflicts.forEach(function (wd) { const c = norm(wd).charAt(0); confByLetter[c] = (confByLetter[c] || 0) + 1; });
log('  冲突分段：' + (Object.keys(confByLetter).length ? JSON.stringify(confByLetter) : '无'));
log('  冲突词清单：' + (conflicts.length ? conflicts.join(', ') : '无'));
// 内置首字母分布（供判断 c/b/d/e/f 覆盖情况）
const bDist = {};
(builtin || []).forEach(function (w) { const c = norm(w.word).charAt(0); bDist[c] = (bDist[c] || 0) + 1; });
log('  内置首字母分布：' + JSON.stringify(bDist));

// =====================================================================
// C3 生僻/超纲候选（启发式：词长 ≥10 且非内置）
// =====================================================================
log('\n【C3 本批新增 663 词：生僻候选（供人工判断裁剪）】');
log('  新增 663 词按词长降序 top25：');
last663.slice().sort(function (a, b) { return String(b.word).length - String(a.word).length; }).slice(0, 25).forEach(function (w) {
  log('    len=' + String(w.word).length + '  ' + w.word + '  ' + w.meaning + '  [' + LNo(w.word) + ']');
});
log('  新增词中长度 ≤3（短/口语/基础词，可能偏易）：');
last663.filter(function (w) { return String(w.word).length <= 3; }).forEach(function (w) {
  log('    ' + w.word + '  ' + w.meaning + '  [' + LNo(w.word) + ']');
});
const rareEndNew = last663.filter(function (w) { return /(ology|ography|aceous|iferous|esque|itude|ise|ize|fy)$/.test(norm(w.word)); });
log('  新增词含后缀 -ology/-ography/-ise/-ize/-fy/-itude 等：' + rareEndNew.length + (rareEndNew.length ? '：' + rareEndNew.map(function (w) { return w.word; }).join(',') : ''));
// 超纲疑点：拼写含少见连字符/大写/数字
const weird = last663.filter(function (w) { return /[A-Z0-9\-]/.test(String(w.word)); });
log('  新增词拼写含大写/数字/连字符：' + weird.length + (weird.length ? '：' + weird.map(function (w) { return w.word; }).join(',') : ''));

// =====================================================================
// B 抽样 30 条（c/b/d/e/f/i/m/o/t + example2），落盘供人工通读
// =====================================================================
log('\n【B 抽样质量（30 条，c/b/d/e/f/i/m/o/t）】');
function simpleForms(base) {
  const b = base.toLowerCase();
  const forms = [b, b + 's', b + 'es', b + 'ed', b + 'd', b + 'ing', b + 'ly'];
  if (/y$/.test(b)) forms.push(b.slice(0, -1) + 'ies', b.slice(0, -1) + 'ied');
  if (/e$/.test(b)) forms.push(b.slice(0, -1) + 'ing', b.slice(0, -1) + 'ed');
  if (/([^aeiou])$/.test(b)) forms.push(b + b.slice(-1) + 'ing', b + b.slice(-1) + 'ed');
  if (b.length > 3) forms.push(b.slice(0, -1));
  return forms;
}
function usedIn(sentence, base) {
  const s = ' ' + String(sentence || '').toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ') + ' ';
  return simpleForms(base).some(function (f) { return s.indexOf(' ' + f) >= 0 || s.indexOf(f) >= 0; });
}
const SAMPLE_LETTERS = ['c', 'b', 'd', 'e', 'f', 'i', 'm', 'o', 't'];
const perLetter = 3; // 9 * 3 = 27 + 3 随机 example2 = 30
const sampleWords = [];
SAMPLE_LETTERS.forEach(function (letter) {
  const pool = words.filter(function (w) { return norm(w.word).charAt(0) === letter; });
  const step = Math.max(1, Math.floor(pool.length / perLetter));
  for (let i = 0; i < perLetter && i * step < pool.length; i++) sampleWords.push(pool[i * step]);
});
// 追加 3 条随机（用确定性步长避免随机性）
for (let i = 0; i < 3; i++) sampleWords.push(words[(i * 137 + 55) % words.length]);
let useFail = [];
sampleWords.forEach(function (w, i) {
  const ex1 = usedIn(w.example, norm(w.word));
  const ex2 = usedIn(w.example2, norm(w.word));
  if (!ex1 || !ex2) useFail.push(w.word + '(ex' + (ex1 ? '' : '1') + (ex2 ? '' : '2') + ')');
  log('---');
  log('[' + (i + 1) + '] ' + w.word + '  ' + w.phonetic);
  log('    meaning : ' + w.meaning);
  log('    root    : ' + (w.root ? w.root : '(空)'));
  log('    example : ' + w.example + '   [用词 ' + (ex1 ? 'Y' : 'N') + ']');
  log('    example2: ' + w.example2 + '   [用词 ' + (ex2 ? 'Y' : 'N') + ']');
});
assert('抽样 ' + sampleWords.length + ' 条的 example/example2 均命中该词（含简单屈折）', useFail.length === 0,
  '未命中：' + useFail.join(', ') + '（需人工确认是否为不规则屈折）');

// =====================================================================
// F 性能余量
// =====================================================================
log('\n【F 性能余量】');
const merged = (builtin ? builtin.length : 0) + words.length;
log('  合并总词数：' + merged + '（阈值 2500）');
log('  原始文件：' + (extBytes / 1024).toFixed(1) + ' KB（阈值 600KB）');
log('  词数余量：' + (2500 - merged) + ' 词；体积余量：' + ((600 * 1024 - extBytes) / 1024).toFixed(1) + ' KB');

// =====================================================================
// 收尾
// =====================================================================
const pass = results.filter(function (r) { return r.ok; }).length;
const failed = results.filter(function (r) { return !r.ok; });
log('\n====================================================================');
log('合计 ' + results.length + ' 项：通过 ' + pass + '，失败 ' + failed.length);
log('结论：' + (failed.length === 0 ? 'PASS' : 'FAIL'));
log('====================================================================');
fs.writeFileSync(OUT_TXT, L.join('\n'), 'utf8');
process.exit(failed.length === 0 ? 0 : 1);
