var fs = require('fs');
var p = 'D:/下载的文件/学习工作台/AI模拟面试.html';
var s = fs.readFileSync(p, 'utf8');
var out = [];

function count(re, name) {
  var m = s.match(re);
  out.push(name + ': ' + (m ? m.length : 0));
}

count(/\?\./g, 'optional-chain ?.');
count(/\?\?/g, 'nullish ??');
count(/replaceAll/g, 'replaceAll');
count(/Object\.fromEntries/g, 'Object.fromEntries');
count(/\.at\(/g, '.at(');
count(/\(\?<=/g, 'lookbehind (?<=');
count(/\(\?<!/g, 'lookbehind (?<!');
count(/\balert\s*\(/g, 'alert(');
count(/\bconfirm\s*\(/g, 'confirm(');
count(/\bprompt\s*\(/g, 'prompt(');

/* emoji scan */
var emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu;
var em = s.match(emojiRe);
out.push('emoji: ' + (em ? em.length : 0) + (em ? ' -> ' + em.join(' ') : ''));

/* tag balance for style/script/div/button/span/textarea/ul/li */
function tagBalance(tag) {
  var open = (s.match(new RegExp('<' + tag + '(\\s|>)', 'g')) || []).length;
  var close = (s.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  var selfclose = (s.match(new RegExp('<' + tag + '[^>]*/>', 'g')) || []).length;
  return tag + ': open=' + open + ' close=' + close + ' selfclose=' + selfclose + (open - selfclose === close ? ' [OK]' : ' [MISMATCH]');
}
['style', 'script', 'div', 'button', 'span', 'textarea', 'ul', 'li', 'p', 'svg'].forEach(function (t) {
  out.push(tagBalance(t));
});

/* brace/paren balance inside script */
var scripts = s.match(/<script>[\s\S]*?<\/script>/g) || [];
out.push('inline script blocks: ' + scripts.length);
var js = '';
scripts.forEach(function (b) { js += b.replace(/^<script>/, '').replace(/<\/script>$/, '') + '\n'; });
var ob = (js.match(/{/g) || []).length;
var cb = (js.match(/}/g) || []).length;
var op = (js.match(/\(/g) || []).length;
var cp = (js.match(/\)/g) || []).length;
out.push('JS braces {=' + ob + ' }=' + cb + (ob === cb ? ' [OK]' : ' [MISMATCH]'));
out.push('JS parens (=' + op + ' )=' + cp + (op === cp ? ' [OK]' : ' [MISMATCH]'));

fs.writeFileSync('D:/下载的文件/学习工作台/_w2t1_checkjs.js', js, 'utf8');
fs.writeFileSync('D:/下载的文件/学习工作台/_w2t1_check.txt', out.join('\n'), 'utf8');
