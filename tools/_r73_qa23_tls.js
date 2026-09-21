const fs = require('fs');
const ROOT = 'D:/下载的文件/学习工作台';
const names = fs.readdirSync(ROOT);
for (const n of names) {
  if (n.indexOf('朋友') >= 0 || n.indexOf('动态') >= 0 || n.indexOf('圈') >= 0) {
    console.log('NAME', n, 'hex', Buffer.from(n, 'utf8').toString('hex'));
  }
}
console.log('--- all containing 我 ---');
for (const n of names) if (n.indexOf('我') >= 0) console.log(n);
