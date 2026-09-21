const fs = require('fs');
const jsdomPath = 'D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom';
const { JSDOM, VirtualConsole } = require(jsdomPath);
const ROOT = 'D:/下载的文件/学习工作台/';
const appjsRaw = fs.readFileSync(ROOT + 'assets/app.js', 'utf8');
let appjs = appjsRaw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const ptIdx = appjs.indexOf('const pageTitles = {');
const open = appjs.indexOf('{', ptIdx); let depth = 0, k = open;
for (; k < appjs.length; k++) { const c = appjs[k]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
appjs = appjs.slice(0, k + 1) + '\n;try{window.__PF=PAGE_FILES;window.__PT=pageTitles;}catch(e){window.__EXPERR=String(e);}\n' + appjs.slice(k + 1);
const html = fs.readFileSync(ROOT + '学习工作台.html', 'utf8');
const re = /<script[^>]*src=["'][^"']*app\.js[^"']*["'][^>]*><\/script>/i;
const matched = re.test(html);
const html2 = html.replace(re, '<script>\n' + appjs + '\n</script>');
const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
const dom = new JSDOM(html2, { runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc,
  beforeParse(window){ window.__warn = 0; window.console.warn = function(){ window.__warn++; }; } });
const w = dom.window;
setTimeout(() => {
  console.log('matched=' + matched);
  console.log('typeofNavigateTo=' + (typeof w.navigateTo));
  console.log('__EXPERR=' + (w.__EXPERR || 'none'));
  console.log('hasPF=' + (typeof w.__PF));
  console.log('html2_has_PAGEFILES=' + (html2.indexOf('const PAGE_FILES') >= 0));
}, 400);
