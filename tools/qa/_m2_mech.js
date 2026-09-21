// 直接测机制：在 file:// 语义下：
//   (A) 先 eval xt-update.js 再 eval config.js （设置.html 现状）
//   (B) 先 eval config.js 再 eval xt-update.js （更新.html / 修复后）
// 各自在 DOMContentLoaded 时观察 fetch URL 与 getApiBase 返回。
const { JSDOM } = require('jsdom');
const fs = require('fs');
const ROOT = 'D:/下载的文件/学习工作台/';

function scenario(order, label) {
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

    for (const f of order) {
      try { w.eval(fs.readFileSync(ROOT + f, 'utf8')); }
      catch (e) { calls.push({ evalError: f + ': ' + e.message }); }
    }
    // 触发 DOMContentLoaded（xt-update 的 boot 挂在这里）
    try { w.document.dispatchEvent(new w.Event('DOMContentLoaded')); } catch (e) {}
    setTimeout(function () {
      resolve({
        label: label,
        STUDY_API_BASE_at_end: (w.STUDY_API_BASE === undefined ? 'undefined' : w.STUDY_API_BASE),
        CURRENT_VERSION: w.XTUpdate ? w.XTUpdate.CURRENT_VERSION : null,
        calls: calls,
        descText: (function(){ const e = w.document.getElementById('xtUpdateDesc'); return e ? e.textContent : null; })()
      });
    }, 400);
  });
}

(async function () {
  const a = await scenario(['assets/xt-update.js', 'assets/config.js'], 'A: 设置.html 现状(xt-update 先)');
  const b = await scenario(['assets/config.js', 'assets/xt-update.js'], 'B: 修复后(config 先)');
  const out = { A_current_order: a, B_fixed_order: b };
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
  process.exit(0);
})();
