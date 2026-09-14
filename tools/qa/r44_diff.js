/* 只读侦查辅助：比对 0914b 部署前备份与当前文件，输出差异块（行号以新文件为准） */
'use strict';
const fs = require('fs');
const path = require('path');

function readLines(p) {
  return fs.readFileSync(p, 'utf8').split(/\r?\n/);
}

function lcs(a, b) {
  const n = a.length, m = b.length;
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: '=', o: i + 1, n: j + 1, s: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: '-', o: i + 1, s: a[i] }); i++; }
    else { ops.push({ t: '+', n: j + 1, s: b[j] }); j++; }
  }
  while (i < n) { ops.push({ t: '-', o: i + 1, s: a[i] }); i++; }
  while (j < m) { ops.push({ t: '+', n: j + 1, s: b[j] }); j++; }
  return ops;
}

function diff(oldPath, newPath, out) {
  const a = readLines(oldPath);
  const b = readLines(newPath);
  const ops = lcs(a, b);
  let buf = [];
  buf.push('=== DIFF (OLD=' + path.basename(oldPath) + ') vs (NEW=' + path.basename(newPath) + ') ===');
  let lastEq = -1;
  ops.forEach(op => {
    if (op.t === '=') { lastEq = op.n; return; }
    if (lastEq > 0) { buf.push('  ...after new line ' + lastEq + '...'); lastEq = -1; }
    const tag = op.t === '-' ? '  - old[' + op.o + ']' : '  + new[' + op.n + ']';
    buf.push(tag + ' ' + op.s);
  });
  buf.push('=== END (old ' + a.length + ' lines, new ' + b.length + ' lines) ===');
  fs.writeFileSync(out, buf.join('\n'), 'utf8');
  console.log('written ' + out + ' (' + buf.length + ' lines)');
}

const root = path.resolve(__dirname, '..', '..');
diff(path.join(root, 'assets', 'chat-local.js.bak-0914b'), path.join(root, 'assets', 'chat-local.js'),
  path.join(root, 'tools', 'qa', 'r44_diff_chat_local_0914b.txt'));
diff(path.join(root, 'assets', 'admin-contact.js.bak-0914b'), path.join(root, 'assets', 'admin-contact.js'),
  path.join(root, 'tools', 'qa', 'r44_diff_admin_contact_0914b.txt'));
