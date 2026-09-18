const fs = require('fs'), vm = require('vm');
const out = [];
// chat-local.js + icon-map.js parse
['assets/chat-local.js', 'assets/icon-map.js'].forEach(function (f) {
  try { new vm.Script(fs.readFileSync(f, 'utf8')); out.push(f + ' PARSE OK'); }
  catch (e) { out.push(f + ' PARSE FAIL ' + e.message); }
});
// 私聊.html inline scripts parse + forbidden checks
let h = fs.readFileSync('私聊.html', 'utf8');
let re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, m, i = 0, ok = 0, fail = 0;
while ((m = re.exec(h))) { i++; try { new vm.Script(m[1]); ok++; } catch (e) { fail++; out.push('inline#' + i + ' FAIL ' + e.message); } }
out.push('私聊.html inline total=' + i + ' ok=' + ok + ' fail=' + fail);
out.push('私聊.html real prompt call: ' + /(^|[^.\w])prompt\s*\(/.test(h));
out.push('私聊.html alert call: ' + /\balert\s*\(/.test(h));
out.push('私聊.html confirm call: ' + /\bconfirm\s*\(/.test(h));
out.push('私聊.html items: ' + (h.match(/class="im-plus-item"/g) || []).length);
// menu labels
let labels = [];
let lre = /class="im-plus-item"[^>]*>.*?<span>([^<]+)<\/span>/g, lm;
while ((lm = lre.exec(h))) labels.push(lm[1]);
out.push('menu labels: ' + labels.join(' | '));
fs.writeFileSync('tools/t02b_parse.txt', out.join('\n') + '\n', 'utf8');
