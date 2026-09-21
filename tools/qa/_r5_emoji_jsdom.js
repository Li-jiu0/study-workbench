/* R5 表情面板重做 —— jsdom 行为自测。
   覆盖：
     A. 点表情按钮 → 面板为微信式布局流形态（R6：flex:0 0 100% / order:10 / height 0→300px / open 类）；
     B. 长按表情(500ms) → study_workbench_emoji_fav 写入 + 收藏 tab 出现；
     C. 自定义：imAddSticker 等价路径（压缩回调注入）→ study_workbench_emoji_custom 写入 + 自定义 tab 出现「+」或 sticker；
     D. e001-e024 渲染不变 + renderContent 对 [emoji:e001] 替换不变；
     E. 遮罩点击 / 收起 可关闭面板。
   ASCII-only source; Chinese via \uXXXX escapes. Report: _r5_emoji_report.txt */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('C:/Users/ATM/node_modules/jsdom');

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const PAGE = '\u79c1\u804a.html'; // 私聊.html
const OUT = path.join(ROOT, 'tools', 'qa', '_r5_emoji_report.txt');
const report = [];
function w(s) { report.push(String(s)); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const PRELUDE =
  'window.__qaErrors=[];' +
  'window.addEventListener("error",function(e){window.__qaErrors.push(String(e.message||e))});' +
  'window.addEventListener("unhandledrejection",function(e){window.__qaErrors.push("unhandledrejection:"+String((e.reason&&e.reason.message)||e.reason))});' +
  'window.fetch=function(){return Promise.resolve({ok:true,status:200,text:function(){return Promise.resolve("{}")},json:function(){return Promise.resolve({})}})};' +
  'try{localStorage.setItem("study_workbench_token","qa-token")}catch(e){};';

function fetchLocal(rel) {
  return fs.readFileSync(path.join(ROOT, rel.replace(/\//g, path.sep)), 'utf8');
}
function inlineScripts(html) {
  const headIdx = html.search(/<head[^>]*>/i);
  if (headIdx >= 0) {
    const headEnd = html.indexOf('>', headIdx) + 1;
    html = html.slice(0, headEnd) + '<script>' + PRELUDE + '</script>' + html.slice(headEnd);
  }
  const re = /<script\s+src="([^"]+)"[^>]*>\s*<\/script>/g;
  let out = '';
  let last = 0, m;
  while ((m = re.exec(html)) !== null) {
    out += html.slice(last, m.index);
    const src = m[1].split('?')[0];
    let code;
    try { code = fetchLocal(src); }
    catch (e) { code = '/* QA: failed to inline ' + src + ' */'; }
    out += '<script>\n' + code + '\n</script>';
    last = m.index + m[0].length;
  }
  out += html.slice(last);
  return out;
}

(async function main() {
  const box = { jsdomErrors: [], consoleErrors: [] };
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/navigation/i.test(String(e && e.message))) box.jsdomErrors.push(String(e && e.message)); });
  vc.on('console.error', (...a) => box.consoleErrors.push(a.join(' ').slice(0, 150)));

  const dom = new JSDOM(inlineScripts(fetchLocal(PAGE)), {
    url: 'http://127.0.0.1:1/' + PAGE,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window;
  await new Promise(r => { if (win.document.readyState === 'complete') r(); else win.addEventListener('load', r); setTimeout(r, 8000); });
  await wait(600);
  const doc = win.document;

  // D0: manifest 完整性（e001-e024 不变 + 总数）
  const man = win.eval('JSON.stringify({n:window.STUDY_EMOJI.list.length, e1:window.STUDY_EMOJI.map.e001.char, e24:window.STUDY_EMOJI.map.e024.char, e13:window.STUDY_EMOJI.map.e013.char, e20:window.STUDY_EMOJI.map.e020.char})');
  w('[D0] manifest=' + man);
  const M = JSON.parse(man);
  const d0 = M.n >= 96 && M.e1 === '\uD83D\uDE0A' && M.e24 === '\uD83C\uDF1F' && M.e13 === '\u270D\uFE0F' && M.e20 === '\u2764\uFE0F';
  w('[D0] e001-e024 chars unchanged & count>=96 => ' + (d0 ? 'PASS' : 'FAIL'));

  // A: 点表情按钮 → 打开面板
  const btn = doc.querySelector('.im-composer button[onclick="imToggleEmoji()"]');
  if (!btn) { w('[A] emoji button NOT FOUND'); }
  else btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const panel = doc.querySelector('#imEmojiPanel');
  const mask = doc.querySelector('#imEmojiMask');
  const openA = !!panel && panel.classList.contains('open');
  const tabsTxt = panel ? Array.prototype.map.call(panel.querySelectorAll('.im-emoji-tab'), t => t.textContent).join('|') : '';
  // jsdom 不级联外部 <link> 的 common.css（getComputedStyle 只回内联/UA 值）→
  // 断言方式（R6 新契约）：① 面板类契约（open 类 / 结构）；② 直接解析 common.css 文本确认
  //   .im-emoji-panel 为布局流换行子项（flex:0 0 100% + order:10 + height 0→300px 过渡）、
  //   .im-composer 带 flex-wrap、遮罩 display:none；③ 旧 fixed/58vh/absolute 小浮层形态全部不再存在。
  const cssText = fs.readFileSync(path.join(ROOT, 'assets', 'common.css'), 'utf8');
  const inflowRule = /\.im-emoji-panel\{[^}]*flex:0 0 100%[^}]*order:10[^}]*\}/.test(cssText);
  const heightAnim = /\.im-emoji-panel\{[^}]*height:0;overflow:hidden;transition:height/.test(cssText) &&
    /\.im-emoji-panel\.open\{height:300px\}/.test(cssText);
  const composerWrap = /\.im-composer\{[^}]*flex-wrap:wrap[^}]*\}/.test(cssText);
  const maskGone = /\.im-emoji-mask\{display:none\}/.test(cssText);
  const noOldFloat = !/\.im-emoji-panel\{[^}]*position:absolute/.test(cssText) &&
    !/\.im-emoji-panel\{[^}]*position:fixed/.test(cssText) &&
    !/\.im-emoji-panel\{[^}]*width:300px/.test(cssText) &&
    cssText.indexOf('height:58vh') < 0 && cssText.indexOf('58dvh') < 0;
  w('[A] open=' + openA + ' maskOpen=' + (!!mask && mask.classList.contains('open')) +
    ' tabs=' + tabsTxt);
  w('[A] css: inflow=' + inflowRule + ' heightAnim=' + heightAnim + ' composerWrap=' + composerWrap +
    ' maskGone=' + maskGone + ' noOldFloat=' + noOldFloat);
  const aPass = openA && (!!mask && mask.classList.contains('open')) && inflowRule && heightAnim && composerWrap && maskGone && noOldFloat;
  w('[A] panel is in-flow wechat-style sheet => ' + (aPass ? 'PASS' : 'FAIL'));

  // A2: 面板在 DOM 内、且输入栏/发送键仍在（未被覆盖移除）
  const sendBtn = doc.querySelector('.im-composer .im-send');
  w('[A2] send button exists=' + !!sendBtn + ' emoji panel exists=' + !!panel);

  // B: 长按收藏（直接调用 toggle 函数 imFavEmoji(code, true) 等价路径）
  const b1 = win.eval('(function(){try{localStorage.removeItem("study_workbench_emoji_fav")}catch(e){};window.imFavEmoji("e009",true);return localStorage.getItem("study_workbench_emoji_fav")})()');
  w('[B] after fav e009 -> fav=' + b1);
  // 切到收藏 tab
  win.eval('window.imEmojiTab("fav")');
  const favGridTxt = doc.querySelector('#imEmojiPanel .im-emoji-grid').innerHTML;
  const favHasE009 = favGridTxt.indexOf('data-code="e009"') >= 0;
  w('[B] fav tab contains e009=' + favHasE009);
  // 再点一次取消收藏
  const b2 = win.eval('(function(){window.imFavEmoji("e009",true);return localStorage.getItem("study_workbench_emoji_fav")})()');
  w('[B] after 2nd toggle -> fav=' + b2);
  const bPass = b1 === '["e009"]' && favHasE009 && b2 === '[]';
  w('[B] long-press fav toggle => ' + (bPass ? 'PASS' : 'FAIL'));

  // B2: 长按触发（走事件路径）：模拟 touchstart + 500ms 定时器
  win.eval('window.imEmojiTab("all")');
  const grid = doc.querySelector('#imEmojiPanel .im-emoji-grid');
  const firstItem = grid.querySelector('.im-emoji-item[data-code]');
  const firstCode = firstItem ? firstItem.getAttribute('data-code') : null;
  // 走 mousedown + 550ms 定时器（与 touchstart 共用 begin() 逻辑；jsdom 计时器可用）。
  // 直接对 item 派发，事件冒泡到 grid 的委托处理器。
  if (firstItem) {
    firstItem.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await wait(600);
    firstItem.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  }
  const favAfterLong = win.eval('JSON.parse(localStorage.getItem("study_workbench_emoji_fav")||"[]").indexOf(' + JSON.stringify(firstCode) + ')>=0');
  w('[B2] mousedown long-press first item code=' + firstCode + ' faved=' + favAfterLong);
  // 长按后立即 mouseup 不应触发插入（longFired 屏蔽 click/插入）
  const inputVal = doc.querySelector('#imInput') ? doc.querySelector('#imInput').value : '';
  w('[B2] input after long-press (should NOT contain new token) = ' + JSON.stringify(inputVal));
  const b2Pass = favAfterLong && inputVal.indexOf('[emoji:' + firstCode + ']') < 0;
  w('[B2] long-press fav via event delegation => ' + (b2Pass ? 'PASS' : 'FAIL'));
  // 清理
  win.eval('localStorage.setItem("study_workbench_emoji_fav","[]")');

  // C: 自定义表情 —— 注入压缩回调等价路径（绕过 canvas，直接喂小 dataURL）
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
  const c1 = win.eval('(function(){try{localStorage.removeItem("study_workbench_emoji_custom")}catch(e){};' +
    'var arr=[].concat(JSON.parse(localStorage.getItem("study_workbench_emoji_custom")||"[]"));' +
    'arr.push(' + JSON.stringify(tiny) + ');' +
    'localStorage.setItem("study_workbench_emoji_custom", JSON.stringify(arr));' +
    'window.imEmojiTab("custom");' +
    'var g=document.querySelector("#imEmojiPanel .im-emoji-grid");' +
    'return JSON.stringify({stored:JSON.parse(localStorage.getItem("study_workbench_emoji_custom")).length, hasImg:g.innerHTML.indexOf("im-emoji-item")>=0, hasAdd:!!document.getElementById("imEmojiAdd")})' +
    '})()');
  w('[C] custom add -> ' + c1);
  const C = JSON.parse(c1);
  const cPass = C.stored === 1 && C.hasImg && C.hasAdd;
  w('[C] custom sticker stored & custom tab renders img + add cell => ' + (cPass ? 'PASS' : 'FAIL'));

  // C2: imSendSticker 走图片链路（spy imSendImageFile）
  win.eval('window.__sendImgCalls=[];var __orig=window.imSendImageFile;window.imSendImageFile=function(f){window.__sendImgCalls.push({name:(f&&f.name)||"",size:(f&&f.size)||0,type:(f&&f.type)||""});};');
  const c2 = win.eval('(function(){try{window.imSendSticker(0);}catch(e){return "ERR:"+e.message}return JSON.stringify(window.__sendImgCalls)})()');
  w('[C2] imSendSticker -> imSendImageFile calls=' + c2);
  let c2Pass = false;
  try { const arr = JSON.parse(c2); c2Pass = Array.isArray(arr) && arr.length === 1 && arr[0].size > 0; } catch (e) { c2Pass = false; }
  w('[C2] sticker routes to image chain => ' + (c2Pass ? 'PASS' : 'FAIL'));

  // C3: 上限拒绝（塞满 24 张后再加）
  const c3 = win.eval('(function(){var arr=[];for(var i=0;i<24;i++)arr.push(' + JSON.stringify(tiny) + ');localStorage.setItem("study_workbench_emoji_custom",JSON.stringify(arr));' +
    'window.imEmojiTab("custom");var g=document.querySelector("#imEmojiPanel .im-emoji-grid");' +
    'return JSON.stringify({n:JSON.parse(localStorage.getItem("study_workbench_emoji_custom")).length, hasAdd:!!document.getElementById("imEmojiAdd")})})()');
  w('[C3] at max(24) -> ' + c3);
  const C3 = JSON.parse(c3);
  w('[C3] add cell hidden at max => ' + ((C3.n === 24 && !C3.hasAdd) ? 'PASS' : 'FAIL'));
  win.eval('localStorage.removeItem("study_workbench_emoji_custom")');

  // D: renderContent 对 [emoji:e001] 替换不变
  const d1 = win.eval('(function(){ var rc=(window.__IM_TEST__&&window.__IM_TEST__.renderContent)||window.renderContent; if(typeof rc!=="function") return "NO_FN"; return rc("[emoji:e001]hi"); })()');
  w('[D] renderContent("[emoji:e001]hi") = ' + JSON.stringify(d1));
  const dPass = typeof d1 === 'string' && d1.indexOf('\uD83D\uDE0A') >= 0 && d1.indexOf('hi') >= 0 && d1.indexOf('[emoji:') < 0;
  w('[D] renderContent emoji replace unchanged => ' + (dPass ? 'PASS' : 'FAIL'));

  // E: 遮罩点击关闭
  win.eval('window.imOpenEmojiPanel("all")');
  const openBefore = doc.querySelector('#imEmojiPanel').classList.contains('open');
  if (mask) mask.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const openAfterMask = doc.querySelector('#imEmojiPanel').classList.contains('open');
  w('[E] before=' + openBefore + ' after mask click open=' + openAfterMask);
  // 收起按钮
  win.eval('window.imOpenEmojiPanel("all")');
  const closeTab = Array.prototype.filter.call(doc.querySelectorAll('#imEmojiPanel .im-emoji-tab'), t => t.textContent === '\u6536\u8d77')[0];
  if (closeTab) closeTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const openAfterCloseTab = doc.querySelector('#imEmojiPanel').classList.contains('open');
  w('[E] after close-tab open=' + openAfterCloseTab);
  const ePass = openBefore && !openAfterMask && !openAfterCloseTab;
  w('[E] mask + close button dismiss => ' + (ePass ? 'PASS' : 'FAIL'));

  w('[errors] qa=' + JSON.stringify((win.__qaErrors || []).slice(0, 5)) +
    ' jsdom=' + JSON.stringify(box.jsdomErrors.slice(0, 5)));

  const allPass = d0 && aPass && bPass && b2Pass && cPass && c2Pass && C3.n === 24 && !C3.hasAdd && dPass && ePass;
  w('JSDOM_ALL => ' + (allPass ? 'PASS' : 'FAIL'));
  win.close();
  fs.writeFileSync(OUT, report.join('\n'), 'utf8');
  console.log('done ' + (allPass ? 'PASS' : 'FAIL'));
})().catch(e => {
  report.push('FATAL ' + (e && e.stack || e));
  try { fs.writeFileSync(OUT, report.join('\n'), 'utf8'); } catch (e2) {}
  console.log('fatal');
});
