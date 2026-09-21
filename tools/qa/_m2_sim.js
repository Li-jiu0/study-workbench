// 精确模拟 设置.html 的 defer 执行语义：
//   - 所有 defer 脚本在 readyState==='loading' 时按文档顺序执行
//   - 全部执行完 -> readyState='interactive' -> 触发 DOMContentLoaded
// 观察 xt-update.js 的 boot() 在 DOMContentLoaded 时看到的 STUDY_API_BASE 与 fetch URL。
const { JSDOM } = require('jsdom');
const fs = require('fs');

function run(htmlPath, outPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html, { url: 'file:///D:/x/设置.html', runScripts: 'outside-only' });
  const w = dom.window;

  // 收集 <script src>（defer）与内联脚本，按顺序
  const nodes = Array.from(w.document.querySelectorAll('script'));
  const calls = [];

  // 拦截 fetch / XHR / localStorage
  w.localStorage = { _d:{}, getItem(k){return k in this._d?this._d[k]:null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
  w.fetch = function (u) {
    var base = (typeof w.STUDY_API_BASE === 'unknown' ? 'undef' : JSON.stringify(w.STUDY_API_BASE));
    var ga = (typeof w.getApiBase === 'function') ? w.getApiBase() : 'no-fn';
    calls.push({ url: String(u), STUDY_API_BASE: (w.STUDY_API_BASE === undefined ? 'undefined' : w.STUDY_API_BASE), getApiBase: ga });
    return Promise.resolve({ ok:true, status:200, json:function(){ return Promise.resolve({version:'1.24',versionCode:1,apkUrl:'',apkReady:false,notes:[]}); } });
  };
  w.XMLHttpRequest = function(){ this.open=function(){}; this.send=function(){}; this.setRequestHeader=function(){}; this.abort=function(){}; };

  // 手动按文档顺序执行脚本（模拟 defer：此时 readyState 仍为 loading）
  const fs2 = require('fs');
  for (const n of nodes) {
    if (n.src) {
      let p = n.getAttribute('src').split('?')[0];
      p = p.replace(/^\.?\//, '');
      const abs = 'D:/下载的文件/学习工作台/' + p;
      if (fs2.existsSync(abs)) {
        try { w.eval(fs2.readFileSync(abs, 'utf8') + '\n//# sourceURL=' + p); }
        catch (e) { calls.push({ evalError: p + ': ' + e.message }); }
      } else {
        calls.push({ missing: p });
      }
    } else if (n.textContent && n.textContent.trim()) {
      try { w.eval(n.textContent); } catch (e) {}
    }
  }

  // defer 执行完毕，模拟 DCL
  setTimeout(function () {
    try { w.document.dispatchEvent(new w.Event('DOMContentLoaded')); } catch (e) {}
    setTimeout(function () {
      const out = {
        STUDY_API_BASE: w.STUDY_API_BASE,
        STUDY_API_SERVER: w.STUDY_API_SERVER,
        has_XTUpdate: typeof w.XTUpdate,
        CURRENT_VERSION: w.XTUpdate ? w.XTUpdate.CURRENT_VERSION : null,
        calls: calls
      };
      fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
      process.exit(0);
    }, 300);
  }, 50);
}
run(process.argv[2], process.argv[3]);
