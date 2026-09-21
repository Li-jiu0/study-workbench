const fs = require('fs');
const jsdomPath = 'D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom';
const { JSDOM } = require(jsdomPath);
const ROOT = 'D:/下载的文件/学习工作台/';
let appjs = fs.readFileSync(ROOT + 'assets/app.js', 'utf8');
appjs = appjs.replace(/\r\n/g, '\n').replace(/\r/g, '\n'); // normalize to LF for inline injection
const html = '<!DOCTYPE html><html><body><div id="page-blog">x</div></body></html>';
const html2 = '<script>\n' + appjs + '\n</script>';
const log = [];
try {
  const dom = new JSDOM(html2, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    beforeParse(window) {
      window.__warn = 0;
      window.console.warn = function(){ window.__warn++; };
    }
  });
  const w = dom.window;
  log.push('hasNavigateTo=' + (typeof w.navigateTo));
  log.push('hasPageTitles=' + (typeof w.pageTitles));
  // intercept location.href via assignment to a proxy? jsdom blocks redefine; instead stub navigateTo? skip.
  log.push('PAGE_FILES_type=' + (typeof (w.PAGE_FILES)));
} catch(e) {
  log.push('ERR:' + e.message);
}
console.log(log.join('\n'));
