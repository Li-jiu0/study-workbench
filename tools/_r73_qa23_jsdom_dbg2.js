const fs = require('fs');
const jsdomPath = 'D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom';
const { JSDOM, VirtualConsole } = require(jsdomPath);
const ROOT = 'D:/下载的文件/学习工作台/';
const appjsRaw = fs.readFileSync(ROOT + 'assets/app.js', 'utf8');
const appjs = appjsRaw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const html = fs.readFileSync(ROOT + '学习工作台.html', 'utf8');
const re = /<script[^>]*src=["'][^"']*app\.js[^"']*["'][^>]*><\/script>/i;
const html2 = html.replace(re, '<script>\n' + appjs + '\n</script>');
const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { console.log('JSDOMERR: ' + (e.message || e)); });
const dom = new JSDOM(html2, { runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc,
  beforeParse(window){ window.__warn = 0; window.console.warn = function(){ window.__warn++; }; } });
const w = dom.window;
setTimeout(() => {
  console.log('typeofNavigateTo=' + (typeof w.navigateTo));
  console.log('typeofPF=' + (typeof w.PAGE_FILES));
}, 400);
