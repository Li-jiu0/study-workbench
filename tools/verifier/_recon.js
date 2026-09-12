const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..', '..');
const out = [];
function p(s) { out.push(String(s)); }

const htmls = fs.readdirSync(R).filter(f => /\.html$/i.test(f));
p('HTML count = ' + htmls.length);
p(htmls.join(' | '));

const A = path.join(R, 'assets');
const js = fs.readdirSync(A).filter(f => /\.(js|css)$/i.test(f));
p('ASSETS js/css count = ' + js.length);
p(js.join(' | '));
p('DATA: ' + fs.readdirSync(path.join(A, 'data')).join(' | '));
p('apk script exists: ' + fs.existsSync(path.join(R, 'tools/qa/check_apk_assets_0912.js')));
p('qa dir: ' + fs.readdirSync(path.join(R, 'tools/qa')).join(' | '));
p('verifier dir: ' + fs.readdirSync(path.join(R, 'tools/verifier')).join(' | '));

p('=== app.js 关键词定位 ===');
const app = fs.readFileSync(path.join(A, 'app.js'), 'utf8').split(/\r?\n/);
['未开始', 'function renderModuleProgress', 'function renderWeakPoints', 'function renderRecentLearning',
 'renderModuleProgress(', 'renderWeakPoints(', 'renderRecentLearning(', 'empty-hint', 'loadData()',
 'DOMContentLoaded', 'function renderHome', 'moduleProgress'].forEach(function (k) {
  const hits = [];
  app.forEach(function (l, i) { if (l.indexOf(k) >= 0) hits.push((i + 1) + ': ' + l.trim().slice(0, 130)); });
  p('--- ' + k + ' (' + hits.length + ')');
  hits.slice(0, 8).forEach(function (h) { p('    ' + h); });
});

p('=== check_apk_assets_0912.js 内容 ===');
try { p(fs.readFileSync(path.join(R, 'tools/qa/check_apk_assets_0912.js'), 'utf8')); }
catch (e) { p('(读取失败) ' + e.message); }

fs.writeFileSync(path.join(__dirname, '_recon_out.txt'), out.join('\n'), 'utf8');
console.log('done');
