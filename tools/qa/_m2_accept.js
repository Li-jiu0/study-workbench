// R88-M2 验收（行为级，jsdom）：用真实文件与真实 script 顺序执行。
// 不联网：拦截 fetch 返回固定 version JSON。
//
// 覆盖：
//   T1 设置.html：config.js 先于 xt-update.js；DOMContentLoaded 后 desc 有 v1.24；fetch 打到正确 URL
//   T2 更多.html：存在 #morepageUpdateCard；版本号写回；xt-update.js 在 config.js 之后
//   T3 配置缺失：仅 eval xt-update.js（无 config.js），file: 协议 + readyState='interactive'
//      -> 断言给出明确错误（config_missing / 文案），且不再静默发相对路径请求
//   T4 更多.html 既有 DOM/函数未破坏
const { JSDOM } = require('jsdom');
const fs = require('fs');
const ROOT = 'D:/下载的文件/学习工作台/';

function extractScripts(html) {
  // 极简抽取：<script src="..."> 与内联 <script>...</script>（按文档顺序）
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    const srcM = /src\s*=\s*"([^"]+)"/i.exec(attrs);
    if (srcM) out.push({ src: srcM[1] });
    else out.push({ inline: body });
  }
  return out;
}

function runPage(htmlPath, opts) {
  return new Promise(function (resolve) {
    opts = opts || {};
    const html = fs.readFileSync(htmlPath, 'utf8');
    const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/gi, ''), {
      url: opts.url || 'file:///D:/x/page.html',
      runScripts: 'outside-only'
    });
    const w = dom.window;
    const calls = [];
    w.localStorage = { _d: {}, getItem(k){ return k in this._d ? this._d[k] : null; }, setItem(k,v){ this._d[k]=String(v); }, removeItem(k){ delete this._d[k]; } };
    w.fetch = function (u) {
      calls.push({ url: String(u), base: (w.STUDY_API_BASE === undefined ? 'undefined' : w.STUDY_API_BASE) });
      return Promise.resolve({ ok: true, status: 200, json: function(){ return Promise.resolve({ version: '1.24', versionCode: 124, apkUrl: '', apkReady: false, notes: ['x'], changelog: [] }); } });
    };
    w.XMLHttpRequest = function(){ this.open=function(){}; this.send=function(){}; this.setRequestHeader=function(){}; this.abort=function(){}; this.addEventListener=function(){}; };
    if (opts.forceReadyState) {
      Object.defineProperty(w.document, 'readyState', { get: function(){ return opts.forceReadyState; }, configurable: true });
    }
    process.on('unhandledRejection', function(){});

    const scripts = extractScripts(html);
    // 只 eval 本地存在的 src；内联脚本跳过（避免题库等重脚本干扰）
    for (const s of scripts) {
      if (!s.src) continue;
      let p = s.src.split('?')[0].replace(/^\.?\//, '');
      const abs = ROOT + p;
      if (fs.existsSync(abs)) {
        try { w.eval(fs.readFileSync(abs, 'utf8') + '\n//# sourceURL=' + p); }
        catch (e) { calls.push({ evalError: p + ': ' + e.message }); }
      }
    }
    setTimeout(function () {
      try { w.document.dispatchEvent(new w.Event('DOMContentLoaded')); } catch (e) {}
      setTimeout(function () {
        resolve({ w: w, calls: calls });
      }, 400);
    }, 30);
  });
}

(async function () {
  const report = {};

  // ---- T1 设置.html（正常，readyState 默认 loading 语义：defer 执行时 loading）----
  {
    const r = await runPage(ROOT + '设置.html');
    const w = r.w;
    report.T1_settings = {
      desc: (function(){ const e = w.document.getElementById('xtUpdateDesc'); return e ? e.textContent : null; })(),
      fetch_calls: r.calls.filter(function(c){ return c.url; }),
      CURRENT_VERSION: w.XTUpdate ? w.XTUpdate.CURRENT_VERSION : null
    };
  }

  // ---- T1b 设置.html（readyState=interactive：旧内核语义，验证顺序已修好）----
  {
    const r = await runPage(ROOT + '设置.html', { forceReadyState: 'interactive' });
    const w = r.w;
    report.T1b_settings_interactive = {
      desc: (function(){ const e = w.document.getElementById('xtUpdateDesc'); return e ? e.textContent : null; })(),
      fetch_calls: r.calls.filter(function(c){ return c.url; }),
      CURRENT_VERSION: w.XTUpdate ? w.XTUpdate.CURRENT_VERSION : null
    };
  }

  // ---- T2 更多.html ----
  {
    const r = await runPage(ROOT + '更多.html');
    const w = r.w;
    const doc = w.document;
    const srcs = Array.from(doc.querySelectorAll('script[src]')).map(function(n){ return n.getAttribute('src'); });
    const iCfg = srcs.findIndex(function(s){ return /config\.js/.test(s); });
    const iUpd = srcs.findIndex(function(s){ return /xt-update\.js/.test(s); });
    report.T2_more = {
      card_exists: !!doc.getElementById('morepageUpdateCard'),
      ver_text: (function(){ const e = doc.getElementById('xtMoreUpdateVer'); return e ? e.textContent : null; })(),
      xt_update_after_config: (iCfg >= 0 && iUpd >= 0 && iUpd > iCfg),
      idx_config: iCfg, idx_update: iUpd,
      has_XTUpdate: typeof w.XTUpdate,
      CURRENT_VERSION: w.XTUpdate ? w.XTUpdate.CURRENT_VERSION : null
    };
  }

  // ---- T3 配置缺失：只 eval xt-update.js，无 config.js，file: + interactive ----
  await new Promise(function (resolve) {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="xtUpdateDesc"></div><div id="xtUpdateBtn"></div></body></html>',
      { url: 'file:///D:/x/设置.html', runScripts: 'outside-only' });
    const w = dom.window;
    const calls = [];
    w.localStorage = { _d:{}, getItem(){return null;}, setItem(){}, removeItem(){} };
    w.fetch = function (u) { calls.push(String(u)); return Promise.resolve({ ok:true, status:200, json: () => Promise.resolve({}) }); };
    w.XMLHttpRequest = function(){ this.open=function(){}; this.send=function(){}; this.setRequestHeader=function(){}; this.abort=function(){}; };
    Object.defineProperty(w.document, 'readyState', { get: function(){ return 'interactive'; }, configurable: true });
    process.on('unhandledRejection', function(){});
    // 只 eval xt-update.js（无 config.js）
    w.eval(fs.readFileSync(ROOT + 'assets/xt-update.js', 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    setTimeout(function () {
      report.T3_config_missing = {
        STUDY_API_BASE: (w.STUDY_API_BASE === undefined ? 'undefined' : w.STUDY_API_BASE),
        fetch_calls: calls,
        desc: (function(){ const e = w.document.getElementById('xtUpdateDesc'); return e ? e.textContent : null; })(),
        lastState: (w.XTUpdate && w.XTUpdate.getLastState) ? w.XTUpdate.getLastState() : null
      };
      resolve();
    }, 400);
  });

  // ---- T4 更多.html 既有 DOM/函数 ----
  {
    const r = await runPage(ROOT + '更多.html');
    const doc = r.w.document;
    report.T4_more_intact = {
      morepage_list: !!doc.querySelector('.morepage-list'),
      morePanel: !!doc.getElementById('morePanel'),
      toolsPanel: !!doc.getElementById('toolsPanel'),
      card_count: doc.querySelectorAll('.morepage-list .morepage-list-item').length,
      has_toggleMorePanel_typeof: typeof r.w.toggleMorePanel,
      has_toggleToolsPanel_typeof: typeof r.w.toggleToolsPanel
    };
  }

  fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
  process.exit(0);
})();
