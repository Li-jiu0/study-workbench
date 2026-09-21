// QA(Edward) 独立头像 helper 测试 —— 自己写的用例，不复用工程师的
// 直接把 assets/api.js 灌进 jsdom window，逐一断言
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const OUT = 'C:\\Users\\ATM\\_ed_avatar_test.txt';
const API_BASE_SENTINEL = 'http://API.SENTINEL';

const out = [];
const P = s => out.push(s);
let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { pass++; P('  PASS  ' + name); }
  else { fail++; P('  FAIL  ' + name + '\n          expected=' + JSON.stringify(expected) + '\n          actual  =' + JSON.stringify(actual)); }
}
function assertFn(name, actual, pred, desc) {
  const ok = pred(actual);
  if (ok) { pass++; P('  PASS  ' + name + (desc ? '' : '')); }
  else { fail++; P('  FAIL  ' + name + ' -> ' + JSON.stringify(actual) + '  (期望: ' + desc + ')'); }
}

const vc = new VirtualConsole();
const jsdomErrs = [];
vc.on('jsdomError', e => jsdomErrs.push(String(e.message).split('\n')[0]));

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://127.0.0.1/学习工作台.html',
  runScripts: 'dangerously',
  virtualConsole: vc,
  beforeParse(w) {
    w.STUDY_API_BASE = API_BASE_SENTINEL;
    w.fetch = () => Promise.reject(new Error('QA_BLOCKED'));
    w.esc = function (t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); };
  }
});
const w = dom.window;

// 灌入真实 api.js
const apiSrc = fs.readFileSync(path.join(ROOT, 'assets', 'api.js'), 'utf8');
try {
  const s = w.document.createElement('script');
  s.textContent = apiSrc;
  w.document.head.appendChild(s);
} catch (e) { P('!! 注入 api.js 异常: ' + e.message); }

P('=== 0) 装载检查 ===');
P('  window.API_BASE = ' + w.API_BASE);
P('  typeof apiFileUrl        = ' + typeof w.apiFileUrl);
P('  typeof apiAvatarSrcOf    = ' + typeof w.apiAvatarSrcOf);
P('  typeof apiAvatarHtml     = ' + typeof w.apiAvatarHtml);
P('  typeof apiAvatarFallback = ' + typeof w.apiAvatarFallback);
P('  typeof apiAvatarText     = ' + typeof w.apiAvatarText);
P('');

const SrcOf = w.apiAvatarSrcOf, Html = w.apiAvatarHtml, Text = w.apiAvatarText;
const B = API_BASE_SENTINEL;

P('=== 1) apiAvatarSrcOf：相对路径 / 绝对 / data: ===');
assert('1.1 相对路径 /uploads/a.png -> API_BASE 前缀', SrcOf({ avatarUrl: '/uploads/a.png' }), B + '/uploads/a.png');
assert('1.2 相对路径 uploads/b.png（无前导斜杠）', SrcOf({ avatarUrl: 'uploads/b.png' }), B + 'uploads/b.png');
assert('1.3 https 全地址原样', SrcOf({ avatarUrl: 'https://cdn.x.com/a.png' }), 'https://cdn.x.com/a.png');
assert('1.4 http 全地址原样', SrcOf({ avatarUrl: 'http://cdn.x.com/a.png' }), 'http://cdn.x.com/a.png');
const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
assert('1.5 本地 data:image 原样返回（本地模式不回退）', SrcOf({ avatarImg: dataUri }), dataUri);
assert('1.6 data:image/gif 原样', SrcOf({ avatarUrl: 'data:image/gif;base64,R0lGOD' }), 'data:image/gif;base64,R0lGOD');
P('');

P('=== 2) avatarUrl 优先于 avatarImg ===');
assert('2.1 两者都有 -> 取 avatarUrl', SrcOf({ avatarUrl: '/u/1.png', avatarImg: dataUri }), B + '/u/1.png');
assert('2.2 只有 avatarImg -> 取 avatarImg', SrcOf({ avatarImg: dataUri }), dataUri);
assert('2.3 avatarUrl 为空串 -> 回落 avatarImg', SrcOf({ avatarUrl: '', avatarImg: dataUri }), dataUri);
assert('2.4 avatarUrl 非字符串(数字) -> 回落 avatarImg', SrcOf({ avatarUrl: 12345, avatarImg: '/u/2.png' }), B + '/u/2.png');
P('');

P('=== 3) 无头像 / 空 / null ===');
assert('3.1 空对象', SrcOf({}), '');
assert('3.2 null', SrcOf(null), '');
assert('3.3 undefined', SrcOf(undefined), '');
assert('3.4 空串', SrcOf({ avatarUrl: '', avatarImg: '' }), '');
assert('3.5 只 null 值', SrcOf({ avatarUrl: null, avatarImg: null }), '');
assert('3.6 对象类型值', SrcOf({ avatarUrl: { a: 1 } }), '');
P('');

P('=== 4) 恶意协议拦截 ===');
assert('4.1 javascript:alert(1)', SrcOf({ avatarUrl: 'javascript:alert(1)' }), '');
assert('4.2 JavaScript: 大小写混合', SrcOf({ avatarUrl: 'JavaScript:alert(1)' }), '');
assert('4.3 vbscript:msgbox', SrcOf({ avatarUrl: 'vbscript:msgbox("x")' }), '');
assert('4.4 VBSCRIPT: 大写', SrcOf({ avatarUrl: 'VBSCRIPT:x' }), '');
assert('4.5 javascript: 藏在 avatarImg', SrcOf({ avatarImg: 'javascript:alert(1)' }), '');
assert('4.6 data:text/html（非图片 data:，不做拦截但不该当 JS 执行）',
  SrcOf({ avatarUrl: 'data:text/html;base64,PHNjcmlwdD4=' }), 'data:text/html;base64,PHNjcmlwdD4=');
P('');

P('=== 5) apiAvatarHtml：无头像返回首字 ===');
assert('5.1 无头像 + 昵称"张三" -> 张', Html({}, '张'), '张');
assert('5.2 无头像 + 未给 fallback -> 默认「学」', Html({}), '学');
assert('5.3 无头像 + 空串 -> 「学」', Html({}, ''), '学');
assert('5.4 无头像 + null -> 「学」', Html({}, null), '学');
P('');

P('=== 6) apiAvatarHtml：有头像生成 <img> ===');
const h1 = Html({ avatarUrl: '/uploads/a.png' }, '张三');
P('  生成: ' + h1);
assertFn('6.1 是 img 标签', h1, s => /^<img /.test(s), '以 <img 开头');
assertFn('6.2 src 为拼接后地址', h1, s => s.indexOf('src="' + B + '/uploads/a.png"') >= 0, 'src=API_BASE+/uploads/a.png');
assertFn('6.3 带 onerror 兜底', h1, s => /onerror="/.test(s), '含 onerror');
assertFn('6.4 onerror 里引用 apiAvatarFallback', h1, s => /window\.apiAvatarFallback\(this,/.test(s), 'onerror 调用 apiAvatarFallback(this, ...)');
const h2 = Html({ avatarImg: dataUri }, '李四');
assertFn('6.5 本地 data: 也走 img 分支（不再一票否决）', h2, s => s.indexOf('src="' + dataUri + '"') >= 0, 'src 为原 data: URI');
P('');

P('=== 7) XSS / 属性写穿：恶意昵称 ===');
const evil = [
  ['单引号', "O'Brian"],
  ['双引号', 'A"B'],
  ['反斜杠', 'A\\B'],
  ['换行', 'A\nB'],
  ['回车', 'A\rB'],
  ['标签闭合', '"><script>alert(1)</script>'],
  ['img+onerror', "' onerror='alert(1)'"],
  ['混合', "'\"><\\/script>\\"],
  ['尖括号', '<>&']
];
evil.forEach(([tag, nick]) => {
  const h = Html({ avatarUrl: '/uploads/x.png' }, nick);
  // 提取 onerror 属性值
  const m = h.match(/onerror="([^"]*)"/);
  const expr = m ? m[1] : null;
  // a) onerror 属性值里不能出现裸的双引号（会被截断属性）
  const noRawQuote = expr !== null && expr.indexOf('"') < 0;
  // b) onerror 表达式必须能被 JS 解析
  let syntaxOk = false, syntaxErr = '';
  try { new w.Function('return (' + expr + ')'); syntaxOk = true; } catch (e) { syntaxErr = e.message; }
  // c) 整个 html 用 innerHTML 灌进去后，不应产生可执行的新元素（script/带 onerror 的额外元素）
  const box = w.document.createElement('div');
  box.innerHTML = h;
  const imgs = box.querySelectorAll('img');
  const scripts = box.querySelectorAll('script');
  const img = imgs[0];
  const attrCount = img ? img.attributes.length : -1;
  const okAll = noRawQuote && syntaxOk && scripts.length === 0 && imgs.length === 1 && attrCount === 3;
  if (okAll) { pass++; P('  PASS  7 [' + tag + '] 昵称=' + JSON.stringify(nick) + ' -> ' + h.slice(0, 150)); }
  else {
    fail++;
    P('  FAIL  7 [' + tag + '] 昵称=' + JSON.stringify(nick));
    P('        html=' + h);
    P('        onerror表达式=' + JSON.stringify(expr) + '  裸双引号=' + !noRawQuote + '  JS语法=' + syntaxOk + ' ' + syntaxErr);
    P('        script数=' + scripts.length + ' img数=' + imgs.length + ' img属性数=' + attrCount + '(期望3: src/alt/onerror)');
  }
});
P('');

P('=== 8) onerror 兜底真的能触发（模拟 404）===');
{
  const box = w.document.createElement('div');
  box.className = 'profile-avatar-lg';
  box.innerHTML = Html({ avatarUrl: '/definitely-not-exist-404.png' }, '王五');
  P('  触发前: img数=' + box.querySelectorAll('img').length + ' 文本=' + JSON.stringify(box.textContent));
  const img = box.querySelector('img');
  let fired = false;
  img.addEventListener('error', () => { fired = true; });
  // 手动派发 error 事件（jsdom 不会真的去请求图片）
  const ev = new w.Event('error');
  img.dispatchEvent(ev);
  await0();
  function await0() { }
  P('  触发后: img数=' + box.querySelectorAll('img').length + ' 文本=' + JSON.stringify(box.textContent));
  // apiAvatarHtml 对 letter 是「去引号/反斜杠/换行后取前 4 字」，'王五' 即原文，故期望 '王五'
  if (box.querySelectorAll('img').length === 0 && box.textContent === '王五') {
    pass++; P('  PASS  8.1 图片 error 后容器被还原成昵称首字「王五」，且不留残余 img');
  } else {
    fail++; P('  FAIL  8.1 期望 img=0 且 textContent="王五"，实际 img=' + box.querySelectorAll('img').length + ' text=' + JSON.stringify(box.textContent));
  }
  // 单字昵称（真实调用方 slice(0,1) 的写法）
  const box3 = w.document.createElement('div');
  box3.innerHTML = Html({ avatarUrl: '/x.png' }, '王');
  const img3 = box3.querySelector('img');
  if (img3) img3.dispatchEvent(new w.Event('error'));
  if (box3.textContent === '王') { pass++; P('  PASS  8.1b 单字昵称兜底 = "王"'); }
  else { fail++; P('  FAIL  8.1b 实际 ' + JSON.stringify(box3.textContent)); }
  // 空 letter 情况
  const box2 = w.document.createElement('div');
  box2.innerHTML = Html({ avatarUrl: '/x.png' }, '');
  const img2 = box2.querySelector('img');
  if (img2) img2.dispatchEvent(new w.Event('error'));
  P('  空 letter 兜底文本 = ' + JSON.stringify(box2.textContent));
  if (box2.textContent === '学') { pass++; P('  PASS  8.2 letter 为空时兜底为「学」'); }
  else { fail++; P('  FAIL  8.2 期望「学」'); }
  // 容器无父节点时不应抛异常
  let threw = false;
  try { w.apiAvatarFallback(null, 'X'); } catch (e) { threw = true; }
  if (!threw) { pass++; P('  PASS  8.3 apiAvatarFallback(null) 不抛异常'); }
  else { fail++; P('  FAIL  8.3 apiAvatarFallback(null) 抛异常'); }
}
P('');

P('=== 9) apiAvatarText 转义 ===');
assert('9.1 &', Text('a&b'), 'a&amp;b');
assert('9.2 <', Text('a<b'), 'a&lt;b');
assert('9.3 >', Text('a>b'), 'a&gt;b');
assert('9.4 "', Text('a"b'), 'a&quot;b');
assert("9.5 '", Text("a'b"), 'a&#39;b');
assert('9.6 null', Text(null), '');
assert('9.7 undefined', Text(undefined), '');
P('');

P('=== 10) apiFileUrl 边界 ===');
assert('10.1 空串', w.apiFileUrl(''), '');
assert('10.2 null', w.apiFileUrl(null), null);
assert('10.3 undefined', w.apiFileUrl(undefined), undefined);
assert('10.4 https 原样', w.apiFileUrl('https://a.b/c.png'), 'https://a.b/c.png');
assert('10.5 data 原样', w.apiFileUrl('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
assert('10.6 相对路径拼接', w.apiFileUrl('/uploads/x.png'), B + '/uploads/x.png');
P('  10.7 协议相对 //cdn/a.png -> ' + JSON.stringify(w.apiFileUrl('//cdn/a.png')) + '（注意：会被拼成 ' + B + '//cdn/a.png，属已知边界）');
P('');

P('=== 11) api.js 装载期错误 ===');
P('  jsdomError 数 = ' + jsdomErrs.length);
jsdomErrs.slice(0, 5).forEach(e => P('    ' + e));
P('');
P('================ RESULT ================');
P('  PASS = ' + pass + '   FAIL = ' + fail);

fs.writeFileSync(OUT, out.join('\n'), 'utf8');
console.log('DONE PASS=' + pass + ' FAIL=' + fail);
process.exit(0);
