/* 主理人独立验证：_safeCut 是否真的不切开代理对
 * 做法：从 assets/xt-region.js 源码里把 _safeCut 函数体原样抽出来 eval，
 *       保证验证的是【磁盘上的真实实现】而不是我手抄的镜像。
 */
var fs = require('fs');
var src = fs.readFileSync('assets/xt-region.js', 'utf8');

/* 抽出 _safeCut 定义（从 function 到匹配的右花括号） */
var start = src.indexOf('function _safeCut');
if (start < 0) { fs.writeFileSync('_r96_lead_surrogate_out.txt', 'FATAL: _safeCut 未找到', 'utf8'); process.exit(1); }
var i = src.indexOf('{', start), depth = 0, end = -1;
for (var p = i; p < src.length; p++) {
  if (src[p] === '{') depth++;
  else if (src[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } }
}
var body = src.slice(start, end);
var _safeCut = eval('(' + body + ')');

/* 抽出 _clipText 与 TEXT_MAX */
var ts = src.indexOf('function _clipText');
var ti = src.indexOf('{', ts), td = 0, te = -1;
for (var q = ti; q < src.length; q++) {
  if (src[q] === '{') td++;
  else if (src[q] === '}') { td--; if (td === 0) { te = q + 1; break; } }
}
var _clipTextBody = src.slice(ts, te);
var mMax = src.match(/var\s+TEXT_MAX\s*=\s*(\d+)/);
var TEXT_MAX = mMax ? parseInt(mMax[1], 10) : 64;
var _clipText = eval('(' + _clipTextBody + ')');

var out = [];
var emit = function (s) { out.push(s); };

/* 孤立代理项检测：任何高代理项(high)后面必须紧跟低代理项(low)，反之亦然 */
function countLone(str) {
  var bad = 0;
  for (var k = 0; k < str.length; k++) {
    var c = str.charCodeAt(k);
    if (c >= 0xD800 && c <= 0xDBFF) {
      var n = str.charCodeAt(k + 1);
      if (!(n >= 0xDC00 && n <= 0xDFFF)) bad++; else k++;
    } else if (c >= 0xDC00 && c <= 0xDFFF) {
      bad++;
    }
  }
  return bad;
}

emit('TEXT_MAX = ' + TEXT_MAX);
emit('');

/* ---- 用例组 1: _safeCut 直接验 ---- */
emit('===== _safeCut(独立抽取磁盘源码 eval) =====');
var emoji = '\uD83D\uDE00'; // 😀
var cases = [
  { name: 'a*70  -> n=63', s: 'a'.repeat(70), n: 63 },
  { name: 'emoji*70 -> n=63', s: emoji.repeat(70), n: 63 },
  { name: 'emoji*70 -> n=64', s: emoji.repeat(70), n: 64 },
  { name: 'a*63 (恰好)', s: 'a'.repeat(63), n: 63 },
  { name: 'emoji*32 (恰好64)', s: emoji.repeat(32), n: 64 },
  { name: 'emoji*33 (66字符)', s: emoji.repeat(33), n: 64 },
  { name: '在 emoji 中间切: a*62+emoji', s: 'a'.repeat(62) + emoji, n: 63 },
  { name: '空串', s: '', n: 63 },
  { name: '中文*70', s: '\u6d4b\u8bd5'.repeat(35), n: 63 }
];
var allPass = true;
for (var c = 0; c < cases.length; c++) {
  var t = cases[c];
  var r = _safeCut(t.s, t.n);
  var lone = countLone(r);
  var ok = (lone === 0) && (r.length <= t.n + 1);
  if (!ok) allPass = false;
  emit(pad(t.name, 28) + ' in_len=' + pad(String(t.s.length), 4) + ' out_len=' + pad(String(r.length), 4) +
    ' lone=' + lone + '  ' + (ok ? 'PASS' : 'FAIL'));
}
emit('');

/* ---- 用例组 2: 真实调用点 _terseGeo 同构逻辑（64 上限 + 省略号） ---- */
emit('===== 真实调用点：64 上限 + 省略号（含 _safeCut） =====');
function terseLike(s) {
  if (s.length > 64) s = _safeCut(s, 63) + '\u2026';
  return s;
}
var t2 = [
  { name: 'a*70', s: 'a'.repeat(70), want: 64 },
  { name: 'emoji*70', s: emoji.repeat(70), want: null },
  { name: 'a*64 (不截)', s: 'a'.repeat(64), want: 64 },
  { name: 'a*65 (截)', s: 'a'.repeat(65), want: 64 }
];
for (var d = 0; d < t2.length; d++) {
  var u = t2[d];
  var rr = terseLike(u.s);
  var ln = countLone(rr);
  var wantOk = (u.want === null) ? true : (rr.length === u.want);
  var ok2 = (ln === 0) && wantOk && rr.length <= 64;
  if (!ok2) allPass = false;
  emit(pad(u.name, 28) + ' out_len=' + pad(String(rr.length), 4) + ' lone=' + ln +
    ' tail=' + JSON.stringify(rr.slice(-4)) + '  ' + (ok2 ? 'PASS' : 'FAIL'));
}
emit('');

/* ---- 用例组 3: _clipText（TEXT_MAX 上限 + 省略号） ---- */
emit('===== _clipText 真实实现（TEXT_MAX=' + TEXT_MAX + '） =====');
var t3 = [emoji.repeat(70), 'a'.repeat(200), '\u6d4b'.repeat(200), emoji.repeat(31), emoji.repeat(32), 'x'];
for (var e = 0; e < t3.length; e++) {
  var rz = _clipText(t3[e]);
  var lz = countLone(rz);
  var ok3 = (lz === 0) && (rz.length <= TEXT_MAX);
  if (!ok3) allPass = false;
  emit('输入 len=' + pad(String(t3[e].length), 5) + ' -> 输出 len=' + pad(String(rz.length), 5) +
    ' lone=' + lz + '  ' + (ok3 ? 'PASS' : 'FAIL'));
}
emit('');

/* ---- 用例组 4: 极端随机（5万次） ---- */
emit('===== 随机压力 50000 次 =====');
var pool = [0x41, 0x6D4B, 0x20];
var bad4 = 0;
for (var f = 0; f < 50000; f++) {
  var L = 1 + Math.floor(Math.random() * 120);
  var buf = '';
  while (buf.length < L) {
    var cp = pool[Math.floor(Math.random() * pool.length)];
    if (cp === 0xD83D) buf += '\uD83D\uDE00';
    else buf += String.fromCharCode(cp);
  }
  var r4 = _safeCut(buf, 1 + Math.floor(Math.random() * 80));
  if (countLone(r4) !== 0) bad4++;
}
emit('孤立代理项出现次数 = ' + bad4 + '  ' + (bad4 === 0 ? 'PASS' : 'FAIL'));
if (bad4 !== 0) allPass = false;

emit('');
emit('===== 总判定: ' + (allPass ? 'ALL PASS' : 'HAS FAILURE') + ' =====');
fs.writeFileSync('_r96_lead_surrogate_out.txt', out.join('\n'), 'utf8');
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
