// 变体：模拟「defer 脚本执行时 readyState !== 'loading'」的引擎语义
// （部分老内核/WebView 在 defer 执行时已是 interactive）—— 此时 xt-update.js 会在 eval 时立即 boot()。
const { JSDOM } = require('jsdom');
const fs = require('fs');
const ROOT = 'D:/下载的文件/学习工作台/';

function scenario(order, label, forceReadyState) {
  return new Promise(function (resolve) {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="xtUpdateDesc"></div><div id="xtUpdateBtn"></div></body></html>',
      { url: 'file:///D:/x/设置.html', runScripts: 'outside-only' });
    const w = dom.window;
    const calls = [];
    w.localStorage = { _d:{}, getItem(k){return k in this._d?this._d[k]:null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
    w.fetch = function (u) {
      calls.push({ url: String(u), STUDY_API_BASE: (w.STUDY_API_BASE === undefined ? 'undefined' : w.STUDY_API_BASE), getApiBase: (typeof w.getApiBase === 'function' ? w.getApiBase() : 'no-fn') });
      return Promise.resolve({ ok:true, status:200, json:function(){ return Promise.resolve({version:'1.24',versionCode:1,apkUrl:'',apkReady:false,notes:[]}); } });
    };
    w.XMLHttpRequest = function(){ this.open=function(){}; this.send=function(){}; this.setRequestHeader=function(){}; this.abort=function(){}; };
    process.on('unhandledRejection', function(){});

    if (forceReadyState) {
      Object.defineProperty(w.document, 'readyState', { get: function(){ return forceReadyState; }, configurable: true });
    }
    for (const f of order) {
      try { w.eval(fs.readFileSync(ROOT + f, 'utf8')); }
      catch (e) { calls.push({ evalError: f + ': ' + e.message }); }
    }
    setTimeout(function () {
      resolve({
        label: label, forcedReadyState: forceReadyState,
        STUDY_API_BASE_at_end: (w.STUDY_API_BASE === undefined ? 'undefined' : w.STUDY_API_BASE),
        calls: calls,
        descText: (function(){ const e = w.document.getElementById('xtUpdateDesc'); return e ? e.textContent : null; })()
      });
    }, 400);
  });
}

(async function () {
  const a = await scenario(['assets/xt-update.js', 'assets/config.js'], 'A: xt-update 先 + readyState=interactive', 'interactive');
  const b = await scenario(['assets/config.js', 'assets/xt-update.js'], 'B: config 先 + readyState=interactive', 'interactive');
  fs.writeFileSync(process.argv[2], JSON.stringify({ A: a, B: b }, null, 2));
  process.exit(0);
})();
