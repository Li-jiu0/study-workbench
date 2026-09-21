const fs = require('fs');
const lit = '我的朋友圈.html';
const txt = fs.readFileSync('D:/下载的文件/学习工作台/tools/_r73_qa23_cfg.json', 'utf8');
const correct = txt.indexOf(lit) >= 0;
console.log('match', correct, 'lit_len', lit.length, 'utf8_bytes', Buffer.from(lit, 'utf8').length);
console.log('char0', lit.charCodeAt(0).toString(16));
