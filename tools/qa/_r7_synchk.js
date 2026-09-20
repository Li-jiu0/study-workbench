/* node --check every script referenced by the two problem pages + control pages.
   Finds which asset file has the SyntaxError. Report: _r7_synchk.txt */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const NODE = process.execPath;
const OUT = path.join(ROOT, '_r7_synchk.txt');
const report = [];
function w(s) { report.push(String(s)); }

function refsOf(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const re = /<script\s+src="([^"]+)"[^>]*>/g;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1].split('?')[0]);
  return out;
}

function checkFile(rel) {
  const abs = path.join(ROOT, rel.replace(/\//g, path.sep));
  if (!fs.existsSync(abs)) return 'MISSING-FILE';
  const buf = fs.readFileSync(abs);
  // write to ascii temp for node --check (path with Chinese is fine for node, but keep it simple)
  const tmp = path.join(process.env.TEMP || 'C:/Users/ATM/AppData/Local/Temp', '_r7chk_' + Date.now() + '.js');
  fs.writeFileSync(tmp, buf);
  let res = 'OK';
  try {
    execFileSync(NODE, ['--check', tmp], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
  } catch (e) {
    const err = String((e.stderr && e.stderr.toString()) || e.message);
    const line = (err.match(/:\s*(\d+)\s*$/) || [])[1];
    res = 'SYNTAX-ERROR ' + err.split('\n').filter(Boolean).slice(0, 3).join(' | ');
    if (line) {
      const lines = buf.toString('utf8').split(/\r?\n/);
      const bad = lines[parseInt(line, 10) - 1];
      if (bad !== undefined) res += ' || LINE ' + line + ': ' + JSON.stringify(bad.slice(0, 160));
    }
  }
  try { fs.unlinkSync(tmp); } catch (e2) {}
  return res;
}

const pages = [
  '\u4e2a\u4eba\u4e2d\u5fc3.html',      // 个人中心
  '\u8bbe\u7f6e.html',                  // 设置
  'AI.html',                            // control
  '\u66f4\u591a.html'                   // 更多 (control)
];
const seen = {};
for (const p of pages) {
  w('== ' + p + ' ==');
  for (const rel of refsOf(p)) {
    if (!/\.js$/.test(rel)) { w('  ' + rel + ' -> SKIP(non-js)'); continue; }
    if (!seen[rel]) seen[rel] = checkFile(rel);
    w('  ' + rel + ' -> ' + seen[rel]);
  }
  w('');
}
fs.writeFileSync(OUT, report.join('\n'), 'utf8');
console.log('DONE');
