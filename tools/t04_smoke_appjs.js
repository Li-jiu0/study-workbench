// T04 smoke v3: 本地链路 saveBlogNote(location) + blogLocChipHtml 渲染 + 无坐标
// app.js 顶层用 `let appData`，跨 w.eval 不可见 → 与 app.js 同一次 eval 执行断言。
const fs = require('fs');
const { JSDOM } = require('D:/下载的文件/学习工作台/tools/verifier/node_modules/jsdom');

const APP = fs.readFileSync('D:/下载的文件/学习工作台/assets/app.js', 'utf8');

const html = `<!DOCTYPE html><html><body>
  <input id="beTitle" value="测试标题">
  <textarea id="blogEditorInput">正文内容</textarea>
  <select id="beCat"><option value="cet" selected>cet</option></select>
  <select id="bePrivacy"><option value="public" selected>public</option></select>
  <input id="beCover" value="">
  <input id="beTags" value="a,b">
  <span id="blogLocChip" data-loc=""></span>
  <span id="blogEditStatus"></span>
  <div id="blogEditorPreview"></div>
  <div id="blogGrid"></div>
  <div id="blogMineGrid"></div>
  <div id="blogMineTabs"></div>
  <div id="blogListEmpty"></div>
  <div id="blogFilterChips"></div>
  <input id="blogSearchInput" value="">
  <div id="blogDetailBox"></div>
  <div id="toast"></div>
</body></html>`;

const TEST = `
;(function(){
  var out = [];
  function assert(cond, msg){ out.push((cond?'ok ':'FAIL ')+msg); }
  function fillForm(){ document.getElementById('beTitle').value='测试标题'; document.getElementById('blogEditorInput').value='正文内容'; }
  try {
    appData.notes = []; appData.favoriteNotes = []; editingNoteId = null;
    fillForm();
    // 1) 新建态
    document.getElementById('blogLocChip').setAttribute('data-loc','武汉市·洪山区');
    saveBlogNote('published');
    assert(appData.notes.length === 1, '新建态 push 1 篇 (len='+appData.notes.length+')');
    assert(appData.notes[0] && appData.notes[0].location === '武汉市·洪山区', '新建态 location=文字地址 (got='+(appData.notes[0]&&appData.notes[0].location)+')');
    assert(!/\\d+\\.\\d{3},/.test(JSON.stringify(appData.notes[0])), '新建态无坐标明文');
    // 2) 编辑态（先补回表单，因 clearEditorFields 已清空）
    var id = appData.notes[0].id;
    fillForm();
    document.getElementById('blogLocChip').setAttribute('data-loc','图书馆');
    editingNoteId = id; saveBlogNote('draft');
    assert(appData.notes.length === 1, '编辑态不新增 (len='+appData.notes.length+')');
    assert(appData.notes[0].location === '图书馆', '编辑态 location 更新 (got='+appData.notes[0].location+')');
    // 3) 空位置 chip 不渲染
    assert(blogLocChipHtml({location:''}) === '', '空 location → chip html 空');
    assert(blogLocChipHtml({}) === '', 'undefined location → chip html 空');
    // 4) 有位置 chip 含图标+文字，无坐标
    var ch = blogLocChipHtml({location:'武汉市·洪山区'});
    assert(ch.indexOf('map-pin')>=0, 'chip html 含 map-pin');
    assert(ch.indexOf('武汉市·洪山区')>=0, 'chip html 含文字');
    assert(!/\\d+\\.\\d{3},/.test(ch), 'chip html 无坐标');
    // 5) renderBlogList 卡片含 chip
    renderBlogList();
    var grid = document.getElementById('blogGrid').innerHTML;
    assert(grid.indexOf('图书馆')>=0, 'renderBlogList 卡片含位置 chip');
    // 6) 详情渲染含 chip
    currentNoteId = id; renderBlogDetail();
    var det = document.getElementById('blogDetailBox').innerHTML;
    assert(det.indexOf('图书馆')>=0, 'renderBlogDetail 含位置 chip');
    assert(!/\\d+\\.\\d{3},/.test(det), 'renderBlogDetail 无坐标');
  } catch(e){ out.push('FAIL runtime: '+e.message+' @'+(e.stack||'').split('\\n')[1]); }
  window.__T04OUT = out.join('\\n');
})();
`;

const dom2 = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.local/' });
dom2.window.eval(APP + TEST);
console.log(dom2.window.__T04OUT);
const lines = (dom2.window.__T04OUT || '').split('\n');
const fails = lines.filter(l => l.indexOf('FAIL') === 0);
console.log('\n=== ' + (fails.length ? ('FAILED ' + fails.length) : 'SMOKE PASS') + ' ===');
process.exit(fails.length ? 1 : 0);
