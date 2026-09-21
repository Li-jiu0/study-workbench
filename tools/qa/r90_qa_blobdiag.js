/* eslint-disable */
/** R90 QA: 诊断 blob-URL 资源加载是否触发了 xt-moments.js */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = 'D:\\下载的文件\\学习工作台';
const pubPageSrc = fs.readFileSync(path.join(ROOT, '朋友圈发布.html'), 'utf8');

const asked = [], served = [];
const vc = new VirtualConsole();
vc.on('jsdomError', function (e) { console.log('[jsdomError] ' + String(e && e.message || e).slice(0, 200)); });

const html = pubPageSrc.replace('</body>', '<script>window.__R90_NAV=[];</script></body>');
const dom = new JSDOM(html, {
  url: 'blob:https://r90.local/' + 'a'.repeat(36),
  runScripts: 'dangerously',
  resources: {
    fetch(url) {
      asked.push(String(url).slice(0, 120));
      try {
        if (String(url).indexOf('blob:') === 0) { served.push('SELF'); return Promise.resolve(Buffer.from(html, 'utf8')); }
        const name = decodeURIComponent(String(url).split('/').pop().split('?')[0]);
        const fp = path.join(ROOT, name);
        if (fs.existsSync(fp)) { served.push(name); return Promise.resolve(fs.readFileSync(fp)); }
      } catch (e) {}
      served.push('REFUSE:' + name);
      return Promise.reject(new Error('refuse'));
    }
  },
  VirtualConsole: vc,
  pretendToBeVisual: true,
  beforeParse(w) {
    w.__R90_NAV = [];
    w.xtmNavHook = function (u) { w.__R90_NAV.push(u); return true; };
    w.console.log = function () {};
  }
});
setTimeout(function () {
  console.log('--- asked (' + asked.length + ') ---');
  asked.forEach(function (u) { console.log('  ASK ' + u); });
  console.log('--- served (' + served.length + ') ---');
  served.forEach(function (u) { console.log('  GOT ' + u); });
  console.log('typeof dom.window.XTM = ' + typeof dom.window.XTM);
  console.log('typeof dom.window.XT_LOC_PICK = ' + typeof dom.window.XT_LOC_PICK);
  console.log('document.scripts = ' + dom.window.document.scripts.length);
  for (let i = 0; i < dom.window.document.scripts.length; i++) {
    const s = dom.window.document.scripts[i];
    console.log('  script[' + i + '] src=' + JSON.stringify(s.src) + ' inlineLen=' + (s.textContent || '').length);
  }
  const b = dom.window.document.getElementById('xtmLocBtn');
  console.log('locBtn.onclick type = ' + typeof (b && b.onclick));
}, 800);
