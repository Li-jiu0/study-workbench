// T04 smoke · api.js 链路：payload 含 location（PUT/POST 共用）+ blogLocChipHtml 渲染
const fs = require('fs');
const { JSDOM } = require('D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom');

const APP = fs.readFileSync('D:/下载的文件/学习工作台/assets/app.js', 'utf8');
const API = fs.readFileSync('D:/下载的文件/学习工作台/assets/api.js', 'utf8');

const html = `<!DOCTYPE html><body>
  <input id="beTitle" value="T">
  <textarea id="blogEditorInput">C</textarea>
  <select id="beCat"><option value="cet" selected>cet</option></select>
  <select id="bePrivacy"><option value="public" selected>public</option></select>
  <input id="beCover" value="">
  <input id="beTags" value="a">
  <span id="blogLocChip" data-loc=""></span>
  <span id="blogEditStatus"></span>
  <div id="blogEditorPreview"></div>
  <div id="blogGrid"></div>
  <div id="blogMineGrid"></div>
  <div id="blogMineTabs"></div>
  <div id="blogListEmpty"></div>
  <div id="blogFilterChips"></div>
  <input id="blogSearchInput">
  <div id="toast"></div>
</body>`;

const TEST = `
;(function(){
  var out = [];
  function assert(c, m){ out.push((c?'ok ':'FAIL ')+m); }
  var calls = [];
  // 拦截 api()
  window.api = function(path, opt){ calls.push({ path: path, opt: opt }); return Promise.resolve({ id: 1 }); };
  try {
    editingNoteId = null;
    document.getElementById('blogLocChip').setAttribute('data-loc','图书馆');
    // 新建态 → POST
    saveBlogNote('published');
    assert(calls.length === 1, 'api 被调用一次');
    assert(calls[0] && calls[0].path === '/api/notes', '新建态 path=/api/notes POST (got='+(calls[0]&&calls[0].path)+')');
    assert(calls[0] && calls[0].opt && calls[0].opt.body && calls[0].opt.body.location === '图书馆', 'payload.location=图书馆 (got='+(calls[0]&&calls[0].opt&&calls[0].opt.body&&calls[0].opt.body.location)+')');
    // 编辑态 → PUT（需补回表单，clearEditorFields 已清空）
    calls = [];
    document.getElementById('beTitle').value='T'; document.getElementById('blogEditorInput').value='C';
    editingNoteId = 123;
    document.getElementById('blogLocChip').setAttribute('data-loc','自习室');
    saveBlogNote('draft');
    assert(calls.length === 1, 'api 被调用一次(编辑)');
    assert(calls[0] && calls[0].path === '/api/notes/123', '编辑态 path=/api/notes/123 PUT (got='+(calls[0]&&calls[0].path)+')');
    assert(calls[0] && calls[0].opt && calls[0].opt.body && calls[0].opt.body.location === '自习室', 'PUT payload.location=自习室 (got='+(calls[0]&&calls[0].opt&&calls[0].opt.body&&calls[0].opt.body.location)+')');
    // 渲染助手
    assert(blogLocChipHtml({location:''}) === '', 'api 空 location → chip html 空');
    var ch = blogLocChipHtml({location:'武汉市·洪山区'});
    assert(ch.indexOf('map-pin')>=0 && ch.indexOf('武汉市·洪山区')>=0, 'api chip html 含图标+文字');
    assert(!/\\d+\\.\\d{3},/.test(ch), 'api chip html 无坐标');
  } catch(e){ out.push('FAIL runtime: '+e.message+' @'+(e.stack||'').split('\\n')[1]); }
  window.__T04OUT = out.join('\\n');
})();
`;

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.local/' });
dom.window.eval(APP);
dom.window.eval(API);   // api.js 后加载 → 覆盖 saveBlogNote（模拟真实运行时链路）
setTimeout(() => {
  dom.window.eval(TEST);
  console.log(dom.window.__T04OUT);
  const fails = (dom.window.__T04OUT || '').split('\n').filter(l => l.indexOf('FAIL') === 0);
  console.log('\n=== ' + (fails.length ? ('FAILED ' + fails.length) : 'SMOKE PASS') + ' ===');
  process.exit(fails.length ? 1 : 0);
}, 50);
