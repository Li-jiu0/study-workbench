/* R82 jsdom 冒烟：图标渲染链路 + 交互不变
   ① 页面加载无 page error（jsdomError 无非导航类报错）
   ② 五个新 data-icon 全部渲染出 <svg>（icon-map.js 自动扫描生效）
   ③ 动态 ico() 路径：卡片/面板内图标为 <svg> 而非 emoji（以 XTM 渲染函数直接出串校验）
   ④ 换背景 / 恢复默认 / 我的动态 跳转行为与替换前一致
   运行：node _r82e_jsdom_smoke.js > _r82_out.txt 2>&1 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const KEY = 'study_workbench_moments_bg';
const DATAURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = http.createServer(function (req, res) {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/动态空间.html';
  fs.readFile(path.join(ROOT, p), function (err, data) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

const PASS = [];
const FAIL = [];
function check(name, ok, extra) {
  (ok ? PASS : FAIL).push(name);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  [' + extra + ']' : ''));
}

function waitComplete(dom, ms) {
  return new Promise(function (resolve, reject) {
    const t0 = Date.now();
    (function poll() {
      if (dom.window.document.readyState === 'complete') { setTimeout(resolve, 300); return; }
      if (Date.now() - t0 > ms) { reject(new Error('readyState timeout')); return; }
      setTimeout(poll, 200);
    })();
  });
}

async function loadPage(seed) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', function (e) { errs.push(String((e && e.message) || e)); });
  const url = 'http://127.0.0.1:' + server.address().port + '/' + encodeURIComponent('动态空间.html');
  const dom = await JSDOM.fromURL(url, {
    resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse: function (w) { if (seed) { try { w.localStorage.setItem(KEY, seed); } catch (e) {} } }
  });
  dom._errs = errs;
  await waitComplete(dom, 90000);
  return dom;
}

(async function main() {
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  console.log('server on 127.0.0.1:' + server.address().port);

  const dom = await loadPage(null);
  const w = dom.window;
  const d = w.document;

  // ① 无 page error（排除 jsdom 未实现的导航提示）
  const realErrs = dom._errs.filter(function (m) { return m.indexOf('navigation') === -1; });
  check('S1 页面加载无 page error', realErrs.length === 0, JSON.stringify(realErrs).slice(0, 200));

  // ② 静态 data-icon 渲染成 svg
  const pairs = [['xtmBack', 'chevron-left'], ['xtmBgBtn', 'image'], ['xtmBgReset', 'rotate-ccw']];
  pairs.forEach(function (p) {
    const el = d.getElementById(p[0]);
    const svg = el && el.querySelector('svg');
    check('S2 #' + p[0] + ' 渲染出 svg(' + p[1] + ')', !!svg, svg ? svg.getAttribute('width') + 'x' + svg.getAttribute('height') : 'none');
  });
  const rowIcon = d.querySelector('.xtm-listrow-icon svg');
  check('S2 列表行图标 user 渲染出 svg', !!rowIcon);
  const rowArrow = d.querySelector('.xtm-listrow-arrow svg');
  check('S2 列表行箭头 chevron-right 渲染出 svg', !!rowArrow);
  // 页面内不应再有裸 emoji 图标（除保留的 📷 发表键）
  const bodyText = d.body.textContent || '';
  const emojiHit = ['🖼', '↺', '👤'].filter(function (e) { return bodyText.indexOf(e) !== -1; });
  check('S2 页面文本无残留 🖼/↺/👤', emojiHit.length === 0, JSON.stringify(emojiHit));
  check('S2 📷 发表键按方案保留（字典无 camera）', (d.getElementById('xtmCam').textContent || '').indexOf('📷') !== -1);

  // ③ 动态 ico() 路径：用 window.lucideIcon 直接产出校验（与 ico() 同一取值链路）
  const names = ['heart', 'message-circle', 'close', 'eye'];
  names.forEach(function (n) {
    const svg = w.lucideIcon(n, 13);
    check('S3 动态图标 ' + n + ' 可取值(ico 链路)', typeof svg === 'string' && svg.indexOf('<svg') === 0);
  });

  // ④ 交互不变：换背景入口存在且可点（触发 file input）、恢复默认、列表跳转
  const bgBtn = d.getElementById('xtmBgBtn');
  let fileClicked = false;
  d.getElementById('xtmBgFile').click = function () { fileClicked = true; };
  bgBtn.click();
  check('S4 换背景按钮点击触发文件选择', fileClicked);
  const row = d.getElementById('xtmMineRow');
  check('S4 列表按钮 href 指向 我的动态.html', row.getAttribute('href') === '我的动态.html' && decodeURIComponent(row.href).indexOf('我的动态.html') !== -1);
  const navBefore = dom._errs.filter(function (m) { return m.indexOf('navigation') !== -1; }).length;
  row.click();
  await new Promise(function (r) { setTimeout(r, 300); });
  const navAfter = dom._errs.filter(function (m) { return m.indexOf('navigation') !== -1; }).length;
  check('S4 列表按钮点击触发跳转', navAfter > navBefore);

  // 预置背景 → 恢复默认（R78 行为不被本次图标改动影响）
  const hero = d.getElementById('xtmHero');
  check('S4 默认无背景（回归 R78）', /none|^$/.test(hero.style.backgroundImage || ''));
  const dom2 = await loadPage(DATAURL);
  const hero2 = dom2.window.document.getElementById('xtmHero');
  check('S4 预置背景渲染 dataURL（回归 R78）', hero2.style.backgroundImage.indexOf('data:image/png;base64') !== -1);
  dom2.window.document.getElementById('xtmBgReset').click();
  await new Promise(function (r) { setTimeout(r, 300); });
  check('S4 恢复默认后清空背景（回归 R78）', /none|^$/.test(hero2.style.backgroundImage || ''));
  check('S4 恢复默认清 key（回归 R78）', dom2.window.localStorage.getItem(KEY) === null);

  dom.window.close();
  dom2.window.close();
  server.close();
  console.log('');
  console.log('RESULT: ' + PASS.length + ' PASS / ' + FAIL.length + ' FAIL');
  if (FAIL.length) { console.log('FAILED: ' + JSON.stringify(FAIL)); process.exitCode = 1; }
})().catch(function (e) {
  console.error('FATAL: ' + ((e && e.stack) || e));
  process.exitCode = 2;
  server.close();
});
