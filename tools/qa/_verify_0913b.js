// bump 后全站校验：版本取值 / 损坏签名 / script·link 配平
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const files = fs.readdirSync(ROOT).filter(f => /\.html$/i.test(f) && fs.statSync(path.join(ROOT, f)).isFile());

const CORRUPT = /\.js\?v=[0-9A-Za-z._]+"[^>\s]/g;
const CORRUPT_CSS = /\.css\?v=[0-9A-Za-z._]+"[^>\s]/g;
const BROKEN_CLASS = /class="nav-item active data-page=/g;

let corrupt = [], unbalanced = [], dist = {}, filesAtB = 0, filesAtA = 0, other = [];
for (const f of files) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const vs = new Set();
  let m; const re = /assets\/[^"']*?\.(js|css)\?v=([0-9A-Za-z._]+)/g;
  while ((m = re.exec(t))) { vs.add(m[2]); dist[m[2]] = (dist[m[2]] || 0) + 1; }
  const list = [...vs];
  if (list.length === 1 && list[0] === '20260913b') filesAtB++;
  else if (list.length === 1 && list[0] === '20260913a') filesAtA++;
  else other.push(f + ' -> {' + list.join(',') + '}');

  for (const rx of [CORRUPT, CORRUPT_CSS, BROKEN_CLASS]) {
    rx.lastIndex = 0; let mm;
    while ((mm = rx.exec(t))) corrupt.push(f + ': ' + JSON.stringify(t.slice(Math.max(0, mm.index - 40), mm.index + 40)));
  }
  const cnt = (re2) => (t.match(re2) || []).length;
  const so = cnt(/<script(\s|>)/gi), sc = cnt(/<\/script>/gi);
  const lo = cnt(/<link(\s|>)/gi);
  if (so !== sc) unbalanced.push(f + `: script ${so} vs ${sc}`);
  if (so === 0 && lo === 0) unbalanced.push(f + ': 无 script/link（异常）');
  // 注释配对
  if (cnt(/<!--/g) !== cnt(/-->/g)) unbalanced.push(f + ': 注释不配对');
}
console.log('HTML 总数: ' + files.length);
console.log('版本取值分布(按出现次数): ' + JSON.stringify(dist));
console.log('全部资源=20260913b 的页面: ' + filesAtB);
console.log('全部资源=20260913a 的页面: ' + filesAtA);
console.log('其它/混合: ' + (other.length ? '\n  ' + other.join('\n  ') : '无'));
console.log('损坏签名: ' + (corrupt.length ? '\n  ' + corrupt.join('\n  ') : '无 ✅'));
console.log('配平问题: ' + (unbalanced.length ? '\n  ' + unbalanced.join('\n  ') : '无 ✅'));

// 抽查：学习工作台.html 的资源行
const t = fs.readFileSync(path.join(ROOT, '学习工作台.html'), 'utf8');
console.log('---- 学习工作台.html 资源行抽查 ----');
console.log(t.split(/\r?\n/).filter(l => /assets\/.*\.(js|css)\?v=/.test(l)).map(l => l.trim()).join('\n'));
