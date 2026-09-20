// R72 登录页 jsdom 独立测试（项15：需求16/17/18 安卓壳配套登录页）。
// 真实加载 登录.html，注入 fetch mock 走「在线模式」，验证按钮文案 / #lgSub /
// #loginNotice 不泄露 JWT / 盐哈希 / 静态续期；并验证 switchMode 文案。
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const results = [];
function C(name, ok, detail) { results.push([ok ? 'PASS' : 'FAIL', name, detail || '']); }

const html = fs.readFileSync(path.join(ROOT, '登录.html'), 'utf8');
const vc = new VirtualConsole();
let pageError = null;
vc.on('jsdomError', (e) => { pageError = e.message; });

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // 在线模式：/api/health 返回 ok
    window.fetch = function (url, opts) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'ok' }) });
    };
    // 阻止自动跳转，便于断言
    window.location.replace = function () {};
    window.__replaced = [];
    const origReplace = window.location.replace;
    try { Object.defineProperty(window.location, 'replace', { configurable: true, value: function (u) { window.__replaced.push(u); } }); } catch (e) {}
  }
});
const win = dom.window;

// 等微任务/定时器 flush（在线探测 + applyModeNotice）
setTimeout(() => {
  try {
    const btn = win.document.getElementById('loginSubmitBtn');
    const lgSub = win.document.getElementById('lgSub');
    const notice = win.document.getElementById('loginNotice');

    C('15a-登录按钮初始文案=登录', !!btn && btn.textContent.trim() === '登录', 'btn=' + (btn ? btn.textContent : ''));
    C('15b-#lgSub=祝君一切安好 · 诸事顺宜', !!lgSub && lgSub.textContent === '祝君一切安好 · 诸事顺宜', 'lgSub=' + (lgSub ? lgSub.textContent : ''));

    // 在线模式 notice 不得泄露 JWT / 盐哈希 / 静态续期 等敏感或实现细节
    const n = notice ? notice.innerHTML : '';
    const leak = /JWT|token|盐|哈希|hash|续期|refresh|明文密码/i.test(n);
    C('15c-#loginNotice在线模式无JWT/盐哈希/静态续期泄露', !leak, 'notice=' + n.slice(0, 90));

    // 切换模式文案
    if (typeof win.switchMode === 'function') {
      win.switchMode('login');
      C('15d-switchMode(login)按钮=登录', win.document.getElementById('loginSubmitBtn').textContent.trim() === '登录',
        'btn=' + win.document.getElementById('loginSubmitBtn').textContent);
      win.switchMode('register');
      const rt = win.document.getElementById('loginSubmitBtn').textContent;
      C('15e-switchMode(register)按钮含注册', /注\s*册/.test(rt), 'btn=' + rt);
      // 回到 login，确认 #lgSub 仍为在线祝福语
      win.switchMode('login');
      C('15f-切回login后#lgSub不变', win.document.getElementById('lgSub').textContent === '祝君一切安好 · 诸事顺宜');
    } else {
      C('15d-switchMode函数存在', false, 'switchMode 未导出');
    }

    // 页面脚本运行无致命错误
    C('15g-页面脚本运行无jsdomError', pageError === null, 'err=' + (pageError || 'none'));
  } catch (e) {
    C('15-运行异常', false, e.message);
  }

  let np = 0, nf = 0;
  const lines = ['R72 登录页 jsdom 独立测试（项15）', '='.repeat(60)];
  for (const [st, name, detail] of results) {
    lines.push('[' + st + '] ' + name + '  ' + detail);
    if (st === 'PASS') np++; else nf++;
  }
  lines.push('='.repeat(60));
  lines.push('登录页用例 PASS=' + np + ' FAIL=' + nf);
  fs.writeFileSync(path.join(ROOT, 'tools/qa/r72/r72_login.txt'), lines.join('\n') + '\n', 'utf8');
  console.log(lines.join('\n'));
  process.exit(0);
}, 300);
