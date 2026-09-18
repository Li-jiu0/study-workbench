/* R84 jsdom 冒烟：删除换背景/恢复默认入口后，页面不报错、列表行仍可用、背景模块休眠但可用
   S1 页面加载无 page error
   S2 四个已删节点确实不存在（xtmBgBtn / xtmBgReset / xtmBgFile / xtmHeroMask）
   S3 .xtm-hero 容器 + 我的动态列表行保留，图标仍渲染 svg（user / chevron-right），📷 保留
   S4 列表行点击仍跳转 我的动态.html
   S5 背景模块休眠不报错：无种子时不设背景；有种子时仍能把 dataURL 应用到 #xtmHero（能力保留待 R80）
   S6 页面文本无残留 🖼/↺ 裸 emoji；moOpenUser 全局仍在
   运行：node _r84e_jsdom_smoke.js > _r84_out.txt 2>&1 */
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

  // S1 无 page error（排除 jsdom 未实现的导航提示）
  const realErrs = dom._errs.filter(function (m) { return m.indexOf('navigation') === -1; });
  check('S1 页面加载无 page error', realErrs.length === 0, JSON.stringify(realErrs).slice(0, 200));

  // S2 已删节点确实不存在
  ['xtmBgBtn', 'xtmBgReset', 'xtmBgFile', 'xtmHeroMask'].forEach(function (id) {
    check('S2 #' + id + ' 已不存在', d.getElementById(id) === null);
  });
  check('S2 页面无 .xtm-hero-mask 元素', d.querySelector('.xtm-hero-mask') === null);
  check('S2 页面无 .xtm-hero-btn 元素', d.querySelector('.xtm-hero-btn') === null);
  check('S2 页面无 file input', d.querySelector('input[type="file"]') === null);

  // S3 保留项
  const hero = d.getElementById('xtmHero');
  check('S3 .xtm-hero 容器保留(#xtmHero)', !!hero && hero.className.indexOf('xtm-hero') !== -1);
  const row = d.getElementById('xtmMineRow');
  check('S3 我的动态列表行保留', !!row && row.className.indexOf('xtm-listrow') !== -1);
  const rowIcon = d.querySelector('.xtm-listrow-icon svg');
  check('S3 列表行图标 user 渲染出 svg', !!rowIcon, rowIcon ? rowIcon.getAttribute('width') + 'x' + rowIcon.getAttribute('height') : 'none');
  const rowArrow = d.querySelector('.xtm-listrow-arrow svg');
  check('S3 列表行箭头 chevron-right 渲染出 svg', !!rowArrow);
  const cam = d.getElementById('xtmCam');
  check('S3 📷 发表键保留', !!cam && (cam.textContent || '').indexOf('📷') !== -1);
  const back = d.getElementById('xtmBack');
  check('S3 返回键 chevron-left 渲染出 svg', !!back && !!back.querySelector('svg'));

  // S4 列表行点击仍跳转
  check('S4 列表行 href 指向 我的动态.html', row.getAttribute('href') === '我的动态.html' && decodeURIComponent(row.href).indexOf('我的动态.html') !== -1);
  const navBefore = dom._errs.filter(function (m) { return m.indexOf('navigation') !== -1; }).length;
  row.click();
  await new Promise(function (r) { setTimeout(r, 300); });
  const navAfter = dom._errs.filter(function (m) { return m.indexOf('navigation') !== -1; }).length;
  check('S4 列表行点击触发跳转', navAfter > navBefore, navBefore + '->' + navAfter);

  // S5 背景模块休眠但不报错：无种子 → 无背景
  check('S5 无种子时 hero 无背景图', /none|^$/.test(hero.style.backgroundImage || ''), hero.style.backgroundImage || '(empty)');
  check('S5 无种子时 hero 无 has-bg 类', hero.className.indexOf('has-bg') === -1, hero.className);

  // S6 文本无残留 emoji；全局函数仍在
  const bodyText = d.body.textContent || '';
  const emojiHit = ['🖼', '↺', '👤'].filter(function (e) { return bodyText.indexOf(e) !== -1; });
  check('S6 页面文本无残留 🖼/↺/👤', emojiHit.length === 0, JSON.stringify(emojiHit));
  check('S6 window.moOpenUser 全局函数保留', typeof w.moOpenUser === 'function');

  dom.window.close();

  // S5b 有种子 → 模块能力仍生效（R80 复用前不退化）
  const dom2 = await loadPage(DATAURL);
  const d2 = dom2.window.document;
  const hero2 = d2.getElementById('xtmHero');
  const errs2 = dom2._errs.filter(function (m) { return m.indexOf('navigation') === -1; });
  check('S5b 有种子时页面无 page error', errs2.length === 0, JSON.stringify(errs2).slice(0, 200));
  check('S5b 有种子时 hero 仍应用 dataURL（能力保留）', hero2.style.backgroundImage.indexOf('data:image/png;base64') !== -1, hero2.style.backgroundImage.slice(0, 40));
  check('S5b 有种子时加 has-bg 类', hero2.className.indexOf('has-bg') !== -1, hero2.className);
  check('S5b 无 mask 元素时不报错（heroApply 已做判空）', d2.getElementById('xtmHeroMask') === null);
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
