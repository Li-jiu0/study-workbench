// 扫描：哪些 HTML 引用了 app.js / voiceplayer.js / exam-bank.json
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
console.log('ROOT=' + ROOT);
const files = fs.readdirSync(ROOT).filter(f => /\.html$/i.test(f) && fs.statSync(path.join(ROOT, f)).isFile());
const rows = [];
for (const f of files) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const appjs = /src\s*=\s*"assets\/app\.js/.test(t);
  const vp = /src\s*=\s*"assets\/voiceplayer\.js/.test(t);
  const bank = /exam-bank\.json/.test(t);
  const vers = new Set();
  const re = /assets\/(app\.js|voiceplayer\.js)[^"']*?\?v=([0-9A-Za-z._]+)/g;
  let m;
  while ((m = re.exec(t))) vers.add(m[1] + '=' + m[2]);
  // 统计 script/link 行里出现的版本
  const allV = new Set();
  const re2 = /assets\/[^"']*?\.(js|css)\?v=([0-9A-Za-z._]+)/g;
  while ((m = re2.exec(t))) allV.add(m[2]);
  rows.push({ f, appjs, vp, bank, vers: [...vers].join(','), allV: [...allV].join(',') });
}
const hit = rows.filter(r => r.appjs || r.vp || r.bank);
console.log('HTML 总数: ' + files.length);
console.log('引用 app.js/voiceplayer.js/exam-bank.json 的页面: ' + hit.length);
for (const r of hit) console.log([r.f, r.appjs ? 'app.js' : '-', r.vp ? 'voiceplayer' : '-', r.bank ? 'bank' : '-', '[' + r.vers + ']', '{' + r.allV + '}'].join(' | '));
console.log('---- 全部页面版本取值分布 ----');
const dist = {};
for (const r of rows) for (const v of r.allV.split(',')) if (v) dist[v] = (dist[v] || 0) + 1;
console.log(JSON.stringify(dist, null, 2));
