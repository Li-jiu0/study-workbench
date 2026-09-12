/**
 * fix_answer_distribution_0913b.js —— 答案位置均衡化（QA 发现的 P1 数据缺陷修复）
 * ---------------------------------------------------------------------------
 * 缺陷：第二批 100 题（id 301–400）的正确答案索引 a 全部为 0，即渲染时正确答案
 *       恒为「A」。assets/app.js::renderExamQuestion() 按 q.o 原顺序渲染、以
 *       `i === q.a` 判定对错，且不做选项乱序，因此用户侧可见「永远选 A 即全对」，
 *       题库丧失训练价值，同时污染正确率/薄弱点统计。
 *
 * 修复：对每题按确定性规则重排选项（把正确项换到目标位置 t），同步把解析 x 与
 *       tip 中的选项字母引用 A/B/C/D 做一次置换，保证解析与新的答案位置自洽。
 *
 * 安全约束（脚本自带校验，任一不满足即整题跳过并计数）：
 *   1. 只匹配「独立出现的 A/B/C/D」——前后不得紧邻 [A-Za-z0-9]，且后面不得紧跟 '('
 *      （避免误伤 "C(5,3)" 组合数写法、"DNA" 等）。
 *   2. 往返校验：字母置换为对合映射，remap(remap(x)) 必须还原成原文，否则说明
 *      误伤了非选项字母，该题跳过。
 *   3. 正确项文本校验：新 o[新a] 必须等于旧 o[旧a]。
 *   4. 结构校验：o 仍为 4 项且无重复，a 仍在 0–3。
 *
 * 用法：
 *   node tools/verifier/fix_answer_distribution_0913b.js            # 试运行（默认第二批 7 个分片）
 *   node tools/verifier/fix_answer_distribution_0913b.js --apply     # 落盘（先自动备份到 _backup_0913b/）
 *   node tools/verifier/fix_answer_distribution_0913b.js --all       # 连第一批一起处理
 *
 * 退出码：0=成功（无论是否 --apply），1=出现被跳过的题或写盘失败
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'assets', 'data');
const BACKUP = path.join(__dirname, '_backup_0913b');

const APPLY = process.argv.indexOf('--apply') >= 0;
const ALL = process.argv.indexOf('--all') >= 0;
const VERBOSE = process.argv.indexOf('--verbose') >= 0 || !APPLY;

const LETTERS = ['A', 'B', 'C', 'D'];

// 独立出现的选项字母：前后不接 [A-Za-z0-9]，后面不接 '('
const OPT_LETTER_RE = /(?<![A-Za-z0-9])([ABCD])(?![A-Za-z0-9(])/g;

function targetIndex(id) {
  // 确定性、可在 0–3 上均匀分布的映射；id 连续时四个位置各占约 1/4
  return (id * 3 + 1) % 4;
}

function remapText(text, map) {
  return String(text).replace(OPT_LETTER_RE, function (m, L) { return map[L]; });
}

function collectLetters(text) {
  const out = [];
  const re = new RegExp(OPT_LETTER_RE.source, 'g');
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const s = Math.max(0, m.index - 10);
    out.push({ letter: m[1], ctx: String(text).slice(s, m.index + 12).replace(/\n/g, ' ') });
  }
  return out;
}

function main() {
  const indexPath = path.join(DATA, 'exam-bank-ext-index.json');
  const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  let shards = idx.shards.slice();
  if (!ALL) shards = shards.filter(function (s) { return /exam-bank-ext-2-/.test(s.file); });

  console.log('模式：' + (APPLY ? '落盘(--apply)' : '试运行(dry-run)') + ' | 范围：' + (ALL ? '全部 14 分片' : '第二批 7 分片'));
  console.log('仓库根：' + ROOT);
  console.log('');

  if (APPLY && !fs.existsSync(BACKUP)) fs.mkdirSync(BACKUP, { recursive: true });

  let totalQ = 0, changed = 0, skipped = 0, letterRemapped = 0;
  const before = [0, 0, 0, 0], after = [0, 0, 0, 0];
  const problems = [];
  const samples = [];

  shards.forEach(function (s) {
    const fp = path.join(ROOT, s.file);
    const raw = fs.readFileSync(fp, 'utf8');
    const j = JSON.parse(raw);
    const qs = j.questions;

    qs.forEach(function (q) {
      totalQ++;
      const oldA = q.a;
      if (!Number.isInteger(oldA) || oldA < 0 || oldA > 3 || !Array.isArray(q.o) || q.o.length !== 4) {
        skipped++; problems.push('id=' + q.id + ' 结构异常，跳过'); return;
      }
      before[oldA]++;

      const t = targetIndex(q.id);
      // 构造置换：把 oldA 位置的项换到 t 位置
      const newO = q.o.slice();
      const tmp = newO[t]; newO[t] = newO[oldA]; newO[oldA] = tmp;
      const newA = t;
      const correctTextOld = q.o[oldA];
      const correctTextNew = newO[newA];

      // 字母映射：旧位置 i 的项现在在 map 位置
      // oldIndex -> newIndex
      const idxToNew = [0, 1, 2, 3];
      idxToNew[oldA] = t; idxToNew[t] = oldA;
      const map = {}; // 旧字母 -> 新字母
      for (let i = 0; i < 4; i++) map[LETTERS[i]] = LETTERS[idxToNew[i]];

      const oldX = String(q.x);
      // tip 一律不参与字母置换：tip 是通用知识点，其中的 A/B 多是占位符或集合名
      // （如「种属关系：A是B的一种」「容斥原理：|A∪B|…」），与选项位置无关，
      // 一旦置换就是内容损坏。历史教训：id=227 / id=384 曾被误改，已回退。
      const newX = remapText(oldX, map);

      // --- 安全校验 1：往返一致（字母置换是对合的，再置换一次必须还原）---
      if (remapText(newX, map) !== oldX) {
        skipped++; problems.push('id=' + q.id + ' 解析字母往返校验失败，跳过（疑似误伤非选项字母）'); return;
      }
      // --- 安全校验 2：正确项文本不变 ---
      if (correctTextNew !== correctTextOld) {
        skipped++; problems.push('id=' + q.id + ' 正确项文本在重排后不一致，跳过'); return;
      }
      // --- 安全校验 3：结构 ---
      if (newO.length !== 4 || new Set(newO).size !== 4 || newA < 0 || newA > 3) {
        skipped++; problems.push('id=' + q.id + ' 重排后结构不合法，跳过'); return;
      }

      if (newX !== oldX) letterRemapped++;
      if (VERBOSE && newX !== oldX) {
        const occ = collectLetters(oldX);
        if (occ.length) samples.push({ id: q.id, occ: occ, oldA: oldA, newA: newA, oldX: oldX.slice(0, 70), newX: newX.slice(0, 70) });
      }

      q.o = newO; q.a = newA; q.x = newX;
      after[newA]++;
      changed++;
    });

    if (APPLY) {
      // 备份不覆盖：已存在同名备份说明该文件此前已被本脚本处理过，
      // 保留最早的原始版本，保证任何时候都能回到「第一批修复前」的状态。
      const bakName = path.basename(s.file);
      const bakPath = path.join(BACKUP, bakName);
      if (!fs.existsSync(bakPath)) fs.writeFileSync(bakPath, raw, 'utf8');
      else fs.appendFileSync(path.join(BACKUP, '_no_overwrite.log'), s.file + ' 已存在备份，保留原始版本\n');
      // 保持原有 2 空格缩进、LF、非 ASCII 原样输出
      fs.writeFileSync(fp, JSON.stringify(j, null, 2) + '\n', 'utf8');
    }
  });

  console.log('处理题数：' + totalQ + ' | 重排成功：' + changed + ' | 跳过：' + skipped +
    ' | 其中同步改写解析字母：' + letterRemapped);
  console.log('答案位置分布  修复前 A/B/C/D = ' + before.join('/') +
    '   修复后 = ' + after.join('/'));

  if (problems.length) {
    console.log('\n【跳过明细】');
    problems.forEach(function (p) { console.log('  - ' + p); });
  }

  if (VERBOSE && samples.length) {
    console.log('\n【解析字母引用改写样例（前 12 条 + 全部命中上下文）】');
    samples.slice(0, 12).forEach(function (s) {
      console.log('  id=' + s.id + '  a: ' + LETTERS[s.oldA] + '→' + LETTERS[s.newA]);
      console.log('     旧: ' + s.oldX);
      console.log('     新: ' + s.newX);
    });
    console.log('\n【全部被改写的字母出现位置（含上下文，供人工核对）】');
    samples.forEach(function (s) {
      s.occ.forEach(function (o) { console.log('  id=' + s.id + '  "' + o.letter + '"   …' + o.ctx + '…'); });
    });
  }

  console.log('\n结论：' + (skipped === 0 ? 'OK — 全部题目安全重排完成' : '存在 ' + skipped + ' 题被跳过，需人工介入'));
  console.log(APPLY ? '已落盘，原始文件备份于 ' + path.relative(ROOT, BACKUP) + '/' : '（试运行，未写盘）');
  process.exit(skipped === 0 ? 0 : 1);
}

main();
