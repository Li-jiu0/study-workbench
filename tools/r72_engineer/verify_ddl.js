const fs = require('fs');
const d = 'D:/下载的文件/学习工作台/server/';
const bak = fs.readFileSync(d + '建表SQL.sql.bak-pre-r72-20260917');
const now = fs.readFileSync(d + '建表SQL.sql');
const s = now.toString('utf8');
let lone = 0;
for (let i = 0; i < now.length; i++) { if (now[i] === 0x0a && (i === 0 || now[i - 1] !== 0x0d)) lone++; }
const crlf = (s.match(/\r\n/g) || []).length;
const out = [];
out.push('friend_remarks count: ' + (s.match(/friend_remarks/g) || []).length);
out.push('loneLF: ' + lone + '  CRLF: ' + crlf);
out.push('prefix==backup bytes: ' + (Buffer.compare(now.slice(0, bak.length), bak) === 0));
const bl = bak.toString('utf8').split('\r\n').length;
const al = s.split('\r\n').length;
out.push('lines before: ' + bl + '  after: ' + al + '  added: ' + (al - bl));
const add = s.split('\r\n').slice(bl - 1, al - 1);
add.forEach(function (l, i) { out.push((bl + i) + ': ' + l); });
fs.writeFileSync('D:/下载的文件/学习工作台/tools/r72_engineer/ddl_verify.txt', out.join('\n') + '\n', 'utf8');
console.log('done');
