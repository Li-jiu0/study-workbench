/**
 * tools/verifier/verify_news_0911.js
 * 需求 10：时政新闻弹窗「原文链接」前端 jsdom 断言。
 * 运行：node tools/verifier/verify_news_0911.js
 *
 * 覆盖：
 *   [0] 央国企笔试.html 加载零未捕获异常（项目硬规矩）
 *   [1] mock /api/news/daily 成功（3 条带 url）→ 条目带 data-url 且与响应一致、可点击、
 *       dailyLink 存在时底部出现「📰 今日早报全文」
 *   [2] mock /api/news/daily 502 {"error":"news_unavailable"} → 降级到 60s 直连源、不抛异常
 *   [3] mock 条目 url:null → 渲染不报错、条目不挂 data-url、点击不打开窗口
 *   [4] 旧缓存向后兼容：缓存条目缺 url 字段 → 渲染不报错
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + label + (detail ? '  → ' + detail : '')); }
  else { fail++; console.log('  ✘ ' + label + '  *** 失败 ***' + (detail ? '  → ' + detail : '')); }
}
function sec(t) { console.log('\n========== ' + t + ' =========='); }

function load(page, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('[jsdom] ' + (e && e.message)));
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/' + page,
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.addEventListener('error', e => errors.push('[error] ' + (e && (e.message || e.type))));
  w.addEventListener('unhandledrejection', e => errors.push('[reject] ' + (e && e.reason && e.reason.message)));
  try {
    w.localStorage.setItem('study_workbench_auth', JSON.stringify({ account: 'tester', loginAt: Date.now() }));
  } catch (e) { }
  if (opts.preset) { try { opts.preset(w); } catch (e) { errors.push('[preset] ' + e.message); } }

  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const srcM = attrs.match(/\bsrc="([^"]+)"/);
    try {
      if (srcM) {
        const rel = srcM[1].split('?')[0];
        const fp = path.join(ROOT, rel);
        if (fs.existsSync(fp)) w.eval(fs.readFileSync(fp, 'utf8'));
        else errors.push('[missing src] ' + rel);
      } else if (m[2].trim()) {
        w.eval(m[2]);
      }
    } catch (e) {
      errors.push('[eval ' + (srcM ? srcM[1] : 'inline') + '] ' + e.message);
    }
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.dispatchEvent(new w.Event('load'));
  return { w, d: w.document, errors };
}

// 等待异步渲染完成（loadAndRender 是 async）
async function waitFor(fn, ms) {
  const deadline = Date.now() + (ms || 2000);
  while (Date.now() < deadline) {
    try { if (fn()) return true; } catch (e) { }
    await new Promise(r => setTimeout(r, 25));
  }
  return false;
}

function mockFetchRoute(w, handler, opened) {
  // handler(url) → {ok, status, body(string)}；window.open 一并 mock 记录
  w.window.open = function (url) { opened.push(url); return null; };
  w.fetch = function (url) {
    const r = handler(String(url));
    return Promise.resolve({
      ok: r.ok, status: r.status,
      text: function () { return Promise.resolve(r.body); },
      json: function () { return Promise.resolve(JSON.parse(r.body)); },
    });
  };
}

function closePanel(w) {
  try { if (typeof w.closeHN === 'function') w.closeHN(); } catch (e) { }
  w.document.querySelectorAll('#hnMask').forEach(el => el.remove());
}

(async function () {
  sec('[0] 页面加载零未捕获异常 + hotnews.js 已挂载');
  const { w, d, errors } = load('央国企笔试.html');
  check('央国企笔试.html 打开零未捕获异常', errors.length === 0, errors.length ? errors.join(' | ') : '无');
  check('window.openHotNewsPanel 为函数', typeof w.openHotNewsPanel === 'function');
  check('window.fetchHotNews 为函数', typeof w.fetchHotNews === 'function');

  // ---------- [1] 后端聚合成功 → data-url + 可点击 + 今日早报链接 ----------
  sec('[1] mock /api/news/daily 成功（3 条带 url）');
  const OK_PAYLOAD = {
    ok: true,
    source: '中国新闻网',
    updated: 'Fri, 11 Sep 2026 12:03:53 +0800',
    items: [
      { title: '中美举行经贸磋商', hot: '', url: 'https://www.chinanews.com.cn/gn/2026/09-11/10694528.shtml' },
      { title: '神舟飞船完成对接', hot: '', url: 'https://www.chinanews.com.cn/gn/2026/09-11/10694529.shtml' },
      { title: '全国秋粮收购启动', hot: '', url: 'https://www.chinanews.com.cn/gn/2026/09-11/10694530.shtml' },
    ],
    dailyLink: 'https://mp.weixin.qq.com/s/daily-morning-20260911',
  };
  {
    const t = load('央国企笔试.html', {
      preset: (win) => { win.localStorage.removeItem('study_workbench_hotnews'); },
    });
    const opened = [];
    const hits = [];
    mockFetchRoute(t.w, (url) => {
      if (url.indexOf('/api/news/daily') !== -1) {
        hits.push(url);
        return { ok: true, status: 200, body: JSON.stringify(OK_PAYLOAD) };
      }
      return { ok: false, status: 404, body: '{}' };
    }, opened);
    t.w.openHotNewsPanel();
    const rendered = await waitFor(() => t.d.querySelectorAll('#hnBody .hn-item').length === 3);
    check('渲染出 3 个条目', rendered, 'n=' + t.d.querySelectorAll('#hnBody .hn-item').length);
    const els = Array.from(t.d.querySelectorAll('#hnBody .hn-item'));
    const urls = els.map(el => el.getAttribute('data-url'));
    check('每个条目都带 data-url', els.length === 3 && urls.every(u => !!u), urls.join(' , '));
    check('data-url 与响应一致',
      OK_PAYLOAD.items.every(it => urls.indexOf(it.url) !== -1),
      '响应 ' + OK_PAYLOAD.items.length + ' 条 vs 渲染 ' + urls.length + ' 条');
    check('来源显示「中国新闻网」', /来源：中国新闻网/.test(t.d.getElementById('hnFoot').textContent),
      t.d.getElementById('hnFoot').textContent.slice(0, 40));
    check('dailyLink → 底部出现「今日早报全文」链接',
      !!t.d.querySelector('#hnFoot a.hn-daily') &&
      t.d.querySelector('#hnFoot a.hn-daily').getAttribute('href') === OK_PAYLOAD.dailyLink,
      (t.d.querySelector('#hnFoot a.hn-daily') || {}).getAttribute &&
      t.d.querySelector('#hnFoot a.hn-daily').getAttribute('href'));
    // 可点击：点第 2 条 → window.open 用第 2 条的 url
    opened.length = 0;
    els[1].click();
    check('点击条目 → window.open 打开对应原文', opened.length === 1 && opened[0] === OK_PAYLOAD.items[1].url,
      'opened=' + JSON.stringify(opened));
    check('后端请求走 STUDY_API_BASE 同源相对路径', hits.length === 1 && hits[0].indexOf('/api/news/daily') !== -1,
      hits.join(' | '));
    closePanel(t.w);
    check('用例 [1] 全程零未捕获异常', t.errors.length === 0, t.errors.join(' | '));
  }

  // ---------- [2] 后端 502 → 降级到 60s 源 ----------
  sec('[2] mock /api/news/daily 502 → 降级到 60s 直连源');
  {
    const t = load('央国企笔试.html', {
      preset: (win) => { win.localStorage.removeItem('study_workbench_hotnews'); },
    });
    const opened = [];
    mockFetchRoute(t.w, (url) => {
      if (url.indexOf('/api/news/daily') !== -1) {
        return { ok: false, status: 502, body: JSON.stringify({ error: 'news_unavailable' }) };
      }
      if (url.indexOf('60s-api.viki.moe') !== -1) {
        return {
          ok: true, status: 200,
          body: JSON.stringify({ code: 200, data: { news: ['降级新闻甲', '降级新闻乙', '降级新闻丙'], link: 'https://mp.weixin.qq.com/s/fallback-daily' } }),
        };
      }
      return { ok: false, status: 404, body: '{}' };
    }, opened);
    t.w.openHotNewsPanel();
    const rendered = await waitFor(() => t.d.querySelectorAll('#hnBody .hn-item').length === 3);
    check('降级到 60s 源并渲染出 3 条', rendered, 'n=' + t.d.querySelectorAll('#hnBody .hn-item').length);
    check('来源显示「60秒读懂世界」', /来源：60秒读懂世界/.test(t.d.getElementById('hnFoot').textContent),
      t.d.getElementById('hnFoot').textContent.slice(0, 40));
    check('60s 条目不带 data-url（结构性无链接）',
      Array.from(t.d.querySelectorAll('#hnBody .hn-item')).every(el => !el.getAttribute('data-url')));
    check('降级路径不抛异常（零未捕获异常）', t.errors.length === 0, t.errors.join(' | '));
    closePanel(t.w);
  }

  // ---------- [3] url:null → 渲染不报错、不挂链接 ----------
  sec('[3] mock 条目 url:null → 不挂链接、点击不开窗');
  {
    const t = load('央国企笔试.html', {
      preset: (win) => { win.localStorage.removeItem('study_workbench_hotnews'); },
    });
    const opened = [];
    mockFetchRoute(t.w, (url) => {
      if (url.indexOf('/api/news/daily') !== -1) {
        return {
          ok: true, status: 200,
          body: JSON.stringify({
            ok: true, source: '60秒读懂世界', updated: '',
            items: [
              { title: '无链接条目一', hot: '', url: null },
              { title: '无链接条目二', hot: '', url: null },
            ],
            dailyLink: 'https://mp.weixin.qq.com/s/null-url-case',
          }),
        };
      }
      return { ok: false, status: 404, body: '{}' };
    }, opened);
    t.w.openHotNewsPanel();
    const rendered = await waitFor(() => t.d.querySelectorAll('#hnBody .hn-item').length === 2);
    check('url:null → 正常渲染出 2 条', rendered);
    check('url:null → 无 data-url 属性',
      Array.from(t.d.querySelectorAll('#hnBody .hn-item')).every(el => !el.hasAttribute('data-url')));
    opened.length = 0;
    const first = t.d.querySelector('#hnBody .hn-item');
    if (first) first.click();
    check('url:null → 点击不开窗（window.open 未被调用）', opened.length === 0, 'opened=' + opened.length);
    check('dailyLink 仍出现在底部（与条目链接无关）', !!t.d.querySelector('#hnFoot a.hn-daily'));
    check('用例 [3] 零未捕获异常', t.errors.length === 0, t.errors.join(' | '));
    closePanel(t.w);
  }

  // ---------- [4] 旧缓存向后兼容：条目缺 url 字段 ----------
  sec('[4] 旧缓存（条目缺 url 字段）向后兼容');
  {
    const t = load('央国企笔试.html', {
      preset: (win) => {
        win.localStorage.setItem('study_workbench_hotnews', JSON.stringify({
          time: Date.now() - 5 * 60 * 1000, // 5 分钟前，未过期
          data: [{ title: '旧缓存条目甲', hot: '' }, { title: '旧缓存条目乙' }],
          source: '60秒读懂世界',
        }));
      },
    });
    const opened = [];
    let backendHit = 0;
    mockFetchRoute(t.w, (url) => {
      if (url.indexOf('/api/news/daily') !== -1) { backendHit++; return { ok: true, status: 200, body: '{}' }; }
      return { ok: false, status: 404, body: '{}' };
    }, opened);
    t.w.openHotNewsPanel();
    const rendered = await waitFor(() => t.d.querySelectorAll('#hnBody .hn-item').length === 2);
    check('旧缓存正常渲染 2 条', rendered);
    check('命中缓存不打后端', backendHit === 0, 'backendHit=' + backendHit);
    check('旧缓存条目（无 url 字段）不挂链接、不报错',
      Array.from(t.d.querySelectorAll('#hnBody .hn-item')).every(el => !el.hasAttribute('data-url')) &&
      t.errors.length === 0, t.errors.join(' | '));
    closePanel(t.w);
  }

  console.log('\n========== 汇总 ==========');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项。');
  process.exit(fail ? 1 : 0);
})();
