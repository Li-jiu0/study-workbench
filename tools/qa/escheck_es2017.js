// 用 acorn 按 ES2017(≈Chrome 58/老WebView) 严格解析全部脚本，找解析级致命错误
const fs = require('fs');
const os = require('os');
const path = require('path');
const acorn = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\acorn');

const ROOT = 'D:\\下载的文件\\学习工作台';
const out = [];

function tryParse(code, level) {
  try {
    acorn.parse(code, { ecmaVersion: level, sourceType: 'script', allowReturnOutsideFunction: true });
    return null;
  } catch (e) {
    return e;
  }
}

function check(name, code) {
  const e17 = tryParse(code, 2017);
  const e20 = tryParse(code, 2020);
  if (e17) {
    // 逐级探测需要的版本
    let need = '>2020';
    for (const lv of [2018, 2019, 2020, 2021, 2022]) {
      if (!tryParse(code, lv)) { need = String(lv); break; }
    }
    out.push('*** ' + name + ' :: ES2017 解析失败（老内核会整文件报废）');
    out.push('     需要 ES' + need + '  |  ' + e17.message);
    const m = /\((\d+):(\d+)\)/.exec(e17.message);
    if (m) {
      const ln = parseInt(m[1], 10);
      const lines = code.split('\n');
      out.push('     L' + ln + ': ' + (lines[ln - 1] || '').trim().slice(0, 120));
    }
  } else if (e20) {
    out.push('~ ' + name + ' :: ES2017 OK，但 ES2020 解析失败（可能用到更晚语法）: ' + e20.message);
  }
}

// assets/*.js
const ad = path.join(ROOT, 'assets');
for (const f of fs.readdirSync(ad)) {
  if (!f.endsWith('.js')) continue;
  if (/bak|backup/i.test(f)) continue;
  const code = fs.readFileSync(path.join(ad, f), 'utf8');
  check('assets/' + f, code);
}
// 根 HTML 内联 script
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith('.html') || /bak/i.test(f)) continue;
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, i = 0;
  while ((m = re.exec(s))) {
    const body = m[1];
    if (body.trim().length < 20) continue;
    i++;
    check(f + ' [内联#' + i + ']', body);
  }
}
fs.writeFileSync('C:\\Users\\ATM\\_escheck_out.txt', out.length ? out.join('\n') : '(全部脚本 ES2017 解析通过)', 'utf8');
console.log('DONE ' + out.length);
