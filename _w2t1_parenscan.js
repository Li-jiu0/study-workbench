var fs = require('fs');
var js = fs.readFileSync('D:/下载的文件/学习工作台/_w2t1_checkjs.js', 'utf8');
var lines = js.split('\n');
var out = [];
var bal = 0;
for (var i = 0; i < lines.length; i++) {
  var L = lines[i];
  var o = (L.match(/\(/g) || []).length;
  var c = (L.match(/\)/g) || []).length;
  if (o !== c) out.push('line ' + (i + 1) + ' open=' + o + ' close=' + c + ' :: ' + L.substring(0, 160));
}
fs.writeFileSync('D:/下载的文件/学习工作台/_w2t1_paren.txt', out.join('\n') || 'ALL LINES BALANCED', 'utf8');
