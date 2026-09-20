// R89-C: jsdom assertions for 更新.html brand icon block + regressions.
// Run: NODE_PATH=C:/Users/ATM/node_modules node tools/qa/r89c_jsdom.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const BASE = 'D:/下载的文件/学习工作台';
let pass = 0, total = 0;
const fails = [];
function ok(name, cond) {
  total++;
  if (cond) { pass++; }
  else { fails.push(name); }
}

// ---- 更新.html ----
const upRaw = fs.readFileSync(path.join(BASE, '更新.html'), 'utf-8');
ok('更新.html raw has .xt-up-brand', upRaw.indexOf('xt-up-brand') !== -1);
ok('更新.html raw has @media (max-width:360px)', upRaw.indexOf('@media (max-width:360px)') !== -1);

const upDom = new JSDOM(upRaw, { runScripts: 'outside-only' });
const up = upDom.window.document;

// brand block exists with book-open icon in title area
const brand = up.querySelector('.xt-up-brand');
ok('更新.html .xt-up-brand block exists', !!brand);

const brandIconSpan = brand ? brand.querySelector('.xt-up-brand-icon [data-icon="book-open"]') : null;
ok('更新.html brand icon is book-open', !!brandIconSpan);

const brandName = brand ? brand.querySelector('.xt-up-brand-name') : null;
ok('更新.html brand name text = 星途', !!brandName && brandName.textContent.trim() === '星途');

const brandSub = brand ? brand.querySelector('.xt-up-brand-sub') : null;
ok('更新.html brand sub text present', !!brandSub && brandSub.textContent.indexOf('致追梦的人') !== -1);

// brand block must be inside page-update and appear before .xt-up-wrap (title area)
const pageUpdate = up.querySelector('#page-update');
ok('更新.html #page-update exists', !!pageUpdate);
const wrap = up.querySelector('.xt-up-wrap');
ok('更新.html .xt-up-wrap exists', !!wrap);
if (brand && wrap) {
  const pos = brand.compareDocumentPosition(wrap);
  ok('更新.html brand appears before .xt-up-wrap', (pos & upDom.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
}
if (brand && pageUpdate) {
  ok('更新.html brand is inside #page-update', pageUpdate.contains(brand));
}

// ---- regression: original title / version area / changelog all present ----
ok('更新.html .morepage-title present', !!up.querySelector('.morepage-title'));
const titleEl = up.querySelector('.morepage-title');
ok('更新.html title text contains 检测更新', !!titleEl && titleEl.textContent.indexOf('检测更新') !== -1);

ok('更新.html #xtUpdateRoot (three-state container) present', !!up.querySelector('#xtUpdateRoot'));
ok('更新.html .xt-up-spin present', !!up.querySelector('.xt-up-spin'));
ok('更新.html #xtUpChangelogCard (changelog) present', !!up.querySelector('#xtUpChangelogCard'));
ok('更新.html #xtUpChangelog present', !!up.querySelector('#xtUpChangelog'));

// version compare classes referenced in CSS still there
ok('更新.html .xt-up-vers CSS class present in style', upRaw.indexOf('.xt-up-vers') !== -1);
ok('更新.html .xt-up-ver-new CSS class present in style', upRaw.indexOf('.xt-up-ver-new') !== -1);
ok('更新.html .xt-up-arrow CSS class present in style', upRaw.indexOf('.xt-up-arrow') !== -1);

// sidebar brand logo area must NOT be touched (still book-open)
const logoIcon = up.querySelector('.logo .logo-icon');
ok('更新.html sidebar .logo .logo-icon preserved', !!logoIcon && logoIcon.getAttribute('data-icon') === 'book-open');
ok('更新.html sidebar .logo-text = 星途', !!up.querySelector('.logo .logo-text') && up.querySelector('.logo .logo-text').textContent.trim() === '星途');

// ---- 更多.html regression ----
const moreRaw = fs.readFileSync(path.join(BASE, '更多.html'), 'utf-8');
const moreDom = new JSDOM(moreRaw, { runScripts: 'outside-only' });
const more = moreDom.window.document;
const card = more.querySelector('#morepageUpdateCard');
ok('更多.html #morepageUpdateCard present', !!card);
ok('更多.html card onclick = XTUpdate.openUpdatePage()', !!card && card.getAttribute('onclick') === 'XTUpdate.openUpdatePage()');
ok('更多.html #xtMoreUpdateVer present', !!more.querySelector('#xtMoreUpdateVer'));
// entry card icon per team-lead ruling: keep download
const cardIcon = card ? card.querySelector('.mpc-icon [data-icon]') : null;
ok('更多.html entry card icon = download (ruling)', !!cardIcon && cardIcon.getAttribute('data-icon') === 'download');

console.log('jsdom assertions: ' + pass + '/' + total + ' passed');
if (fails.length) {
  console.log('FAILED:');
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
} else {
  console.log('ALL PASS');
}
