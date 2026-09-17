// 仅追加 friend_remarks DDL 段（二进制安全，保持 CRLF，loneLF=0）
const fs = require('fs');
const d = 'D:/下载的文件/学习工作台/server/';
const bak = d + '建表SQL.sql.bak-pre-r72-20260917';
const tgt = d + '建表SQL.sql';

const backup = fs.readFileSync(bak);
const before = fs.readFileSync(tgt);

// 前置断言：当前文件应与备份完全一致（回退后应成立）
if (Buffer.compare(backup, before) !== 0) { console.log('ABORT: 当前文件与备份不一致（可能已有别人的改动）'); process.exit(2); }

let content = Buffer.from(before);
if (!content.slice(-2).equals(Buffer.from('\r\n'))) content = Buffer.concat([content, Buffer.from('\r\n')]);
content = Buffer.concat([content, Buffer.from('\r\n')]); // 空行分隔

const block = [
  '-- ============================================================',
  '-- R72（2026-09-17）增量：好友备注（Bug3）',
  '-- 好友备注表：owner 对 peer 的私有备注名，仅本人可见；同一对 (owner_id, peer_id) 只存一条。',
  '-- 空串/去空格后为空 = 无备注（路由层删除该行）；备注与好友关系解耦，不改 friends 表结构。',
  '-- ============================================================',
  'CREATE TABLE IF NOT EXISTS friend_remarks (',
  '  id         INTEGER PRIMARY KEY AUTOINCREMENT,',
  '  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 备注归属人',
  '  peer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 被备注的好友',
  "  remark     TEXT    NOT NULL DEFAULT '',                              -- 备注名（≤20 字；空串=无备注，等同清空）",
  "  updated_at TEXT    NOT NULL,                                         -- 'YYYY-MM-DD HH:MM:SS'",
  '  UNIQUE (owner_id, peer_id)',
  ');'
].join('\r\n') + '\r\n';

content = Buffer.concat([content, Buffer.from(block, 'utf8')]);
fs.writeFileSync(tgt, content);

// ---- 自测 ----
const now = fs.readFileSync(tgt);
const nowStr = now.toString('utf8');
function countLoneLF(buf) { let n = 0; for (let i = 0; i < buf.length; i++) { if (buf[i] === 0x0a && (i === 0 || buf[i - 1] !== 0x0d)) n++; } return n; }
const crlf = (nowStr.match(/\r\n/g) || []).length;
const loneLF = countLoneLF(now);
console.log('1) friend_remarks 出现次数 >=1 :', (nowStr.match(/friend_remarks/g) || []).length);
console.log('2) 行尾 loneLF =', loneLF, '(应为 0)；CRLF =', crlf);
const beforeLines = backup.toString('utf8').split('\r\n').length;
const afterLines = nowStr.split('\r\n').length;
console.log('3) 行数 before =', beforeLines, ' after =', afterLines, ' 新增行数 =', afterLines - beforeLines);
const added = nowStr.split('\r\n').slice(beforeLines - 1, afterLines - 1);
console.log('   新增内容（仅末段）:');
added.forEach(function (l, i) { console.log('     +' + (beforeLines + i) + ': ' + l); });
// 前缀必须与备份逐字节一致
console.log('4) 备份前缀逐字节一致 =', Buffer.compare(now.slice(0, backup.length), backup) === 0);
