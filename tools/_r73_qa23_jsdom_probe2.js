const fs = require('fs');
const jsdomPath = 'D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom';
const { JSDOM } = require(jsdomPath);
const ROOT = 'D:/下载的文件/学习工作台/';
const html = fs.readFileSync(ROOT + '学习工作台.html', 'utf8');
const appjs = fs.readFileSync(ROOT + 'assets/app.js', 'utf8');
// inline app.js
const html2 = html.replace(/<script[^>]*src=["']([^"']*app\.js[^"']*)["'][^>]*><\/script>/i,
  '<script>\n' + appjs + '\n</script>');

const log = [];
const dom = new JSDOM(html2, {
  runScripts: 'dangerously',
  url: 'http://localhost/' + encodeURIComponent('学习工作台.html'),
  beforeParse(window) {
    window.__warnCount = 0;
    const origWarn = window.console.warn.bind(window.console);
    window.console.warn = function(...a){ window.__warnCount++; log.push('WARN:'+a.join(' ')); };
    let hrefVal = window.location.href;
    try {
      Object.defineProperty(window.location, 'href', {
        configurable: true,
        get(){ return hrefVal; },
        set(v){ hrefVal = v; log.push('SET_HREF:'+v); }
      });
    } catch(e){ log.push('DEFINE_FAIL:'+e.message); }
  }
});
const w = dom.window;
setTimeout(() => {
  log.push('hasNavigateTo=' + (typeof w.navigateTo));
  try {
    w.__warnCount = 0;
    w.navigateTo('blog');
    log.push('after blog warnCount=' + w.__warnCount + ' href=' + w.location.href);
  } catch(e){ log.push('blog_ERR:'+e.message); }
  try {
    w.__warnCount = 0;
    w.navigateTo('一个不存在的页面xyz');
    log.push('after xyz warnCount=' + w.__warnCount);
  } catch(e){ log.push('xyz_ERR:'+e.message); }
  console.log(log.join('\n'));
}, 300);
