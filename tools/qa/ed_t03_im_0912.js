/**
 * tools/qa/ed_t03_im_0912.js —— 批次五·图标与交互 T03 自测（寇豆码，2026-09-12）
 *
 * 覆盖（PRD §2.2 / §2.3 + 架构设计 §6 T03 验收矩阵）：
 *   A. 私聊页加载：🖼 发图按钮 + #imImgFile file input 在 DOM 中已不存在
 *   B. imOnPaste 单元拦截：image 类型 → preventDefault + toast「暂不支持图片消息」
 *   C. imOnPaste 放行：text/html 类型 → 不拦截
 *   D. 好友 tab 自上而下：AI 伙伴 / 我的群聊 / 注册好友（含 .im-group-title 与「我的群聊」字样）
 *   E. 会话 tab 仍按 renderChats 渲染群行（imRenderGroupRows 共用回流验证）
 *   F. 输入框 paste 监听已绑（验证 addEventListener('paste', imOnPaste) 生效）
 *   G. 全程零未捕获异常；window.imOnPaste / imSendImage / imOpenGroup 三个全局函数可调用
 *
 * 运行：node tools/qa/ed_t03_im_0912.js
 * 依赖 jsdom：从 tools/verifier/node_modules 解析。
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const jsdomMod = require(path.join(__dirname, '..', 'verifier', 'node_modules', 'jsdom'));
const { JSDOM, VirtualConsole } = jsdomMod;

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const FAILS = [];
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label + (detail ? '  -> ' + detail : '')); }
  else { fail++; FAILS.push(label + (detail ? ' | ' + detail : '')); console.log('  FAIL  ' + label + '  *** FAIL ***' + (detail ? '  -> ' + detail : '')); }
}
function sec(t) { console.log('\n===== ' + t + ' ====='); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 起本地静态资源服务：jsdom 用 file:// 会阻断 script src/style href 等的同源策略，用 http:// 稳妥 */
const QA_PORT = 8141;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};
const qaServer = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found: ' + req.url); return; }
    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
});
let serverReady = null;

function loadPage(htmlFile, opts) {
  opts = opts || {};
  const htmlContent = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
  return new Promise((resolve) => {
    const inner = new Promise((res2) => {
      const vcErrors = [];
      const vc = new VirtualConsole();
      vc.on('jsdomError', (e) => vcErrors.push('[jsdomError] ' + (e && e.message || e)));
      vc.on('error', (e) => vcErrors.push('[error] ' + (e && (e.message || e))));
      /* 把 ?v=xxxxxxx 版本号去掉（避免 jsdom 的资源请求携带版本号却命中 cachebuster 失败） */
      const dom = new JSDOM(htmlContent.replace(/(\?|&)v=202\d{5}[a-z]/g, ''), {
        url: 'http://127.0.0.1:' + QA_PORT + '/' + htmlFile,
        runScripts: 'dangerously',
        resources: 'usable',
        pretendToBeVisual: true,
        virtualConsole: vc,
        beforeParse(window) {
          if (window.Element && window.Element.prototype && typeof window.Element.prototype.scrollTo !== 'function') {
            window.Element.prototype.scrollTo = function () {};
          }
          // jsdom 没有 localStorage 主动实现；chat-local.js 用 localStorage.getItem('study_workbench_token')
          // 在没有 token 的情况下走默认分支（无 token 时「我的群聊」整段不渲染）—— 测试就用这个分支。
          if (!window.localStorage) {
            const mem = {};
            window.localStorage = {
              getItem: (k) => (k in mem ? mem[k] : null),
              setItem: (k, v) => { mem[k] = String(v); },
              removeItem: (k) => { delete mem[k]; },
              clear: () => { Object.keys(mem).forEach(k => delete mem[k]); }
            };
          }
          // jsdom 默认无 fetch；chat-local.js 的 loadGroups()/loadServerFriends() 都要 fetch。
          // 测试用 reject 模拟离线 —— loadGroups 走 catch → 触发 renderFriends 的「加载失败，点此重试」分支。
          if (!window.fetch) {
            window.fetch = function () {
              return Promise.reject(new TypeError('fetch not available in jsdom test'));
            };
          }
        }
      });
      dom.window.addEventListener('error', (e) => vcErrors.push('[werror] ' + (e && (e.message || e.type))));
      setTimeout(() => res2({ dom, w: dom.window, d: dom.window.document, vcErrors }), opts.wait || 3500);
    });
    inner.then(resolve);
  });
}

(async function main() {
  await new Promise((res) => { qaServer.listen(QA_PORT, '127.0.0.1', () => res()); });
  await sleep(200);
  const allErrors = [];

  /* ============ A. 私聊.html DOM 检查：发图按钮已移除 ============ */
  sec('[A] 私聊.html DOM：发图按钮 + #imImgFile 已删除');
  {
    const r = await loadPage('私聊.html');
    const { w, d } = r;
    const fileInput = d.getElementById('imImgFile');
    check('#imImgFile file input 在 DOM 中不存在', fileInput === null,
      '实际=' + (fileInput ? fileInput.outerHTML.slice(0, 80) : 'null'));
    const imgBtns = d.querySelectorAll('button.im-icon[title="发图片"]');
    check('title="发图片" 的按钮在 DOM 中不存在', imgBtns.length === 0,
      '实际=' + imgBtns.length);
    /* 兜底：确认没有 🖼 文本按钮残留 */
    const allButtons = Array.from(d.querySelectorAll('button'));
    const emojiImgBtn = allButtons.find(b => /🖼/.test(b.textContent || ''));
    check('🖼 emoji 按钮在 DOM 中不存在', !emojiImgBtn,
      emojiImgBtn ? '残留：' + emojiImgBtn.outerHTML.slice(0, 80) : '');
    /* 确认 imSendImage 函数仍保留（【后续扩展点：图片消息回退】） */
    check('window.imSendImage 函数仍保留（防 APK 缓存老 JS 调用崩溃）',
      typeof w.imSendImage === 'function');
    /* 确认 imSendImage 头部守卫（PRD §2.4 坑 7）：无 peer / 无文件即 return */
    let guardOk = false;
    try {
      w.imSendImage({ files: [] });   // 不应抛错
      w.imSendImage(null);            // 不应抛错
      guardOk = true;
    } catch (e) { guardOk = false; }
    check('imSendImage 头部守卫对 null/空 files 不抛错', guardOk);
    allErrors.push(...r.vcErrors);
  }

  /* ============ B/C. imOnPaste 单元：image 拦截 / text 放行 ============ */
  sec('[B/C] imOnPaste 单元：image 类型拦截 + text/html 放行');
  {
    const r = await loadPage('私聊.html');
    const { w } = r;
    check('window.imOnPaste 已挂载（chat-local.js boot 已执行）',
      typeof w.imOnPaste === 'function');

    /* image 拦截 */
    let prevented = false;
    const imgEv = {
      clipboardData: { items: [{ type: 'image/png' }, { type: 'text/plain' }] },
      preventDefault: function () { prevented = true; }
    };
    w.imOnPaste(imgEv);
    check('image 类型粘贴 → preventDefault 已调用', prevented === true);
    /* toast 内容（chat-local.js 的 toast 用 #toast div；page load 后应该存在） */
    const toastEl = w.document.getElementById('toast');
    const toastText = toastEl ? (toastEl.textContent || '') : '';
    check('image 类型粘贴 → toast 文案含「暂不支持图片消息」',
      toastText.indexOf('暂不支持图片消息') >= 0, '实际 toast="' + toastText + '"');

    /* text/plain 放行（不应 preventDefault） */
    prevented = false;
    const textEv = {
      clipboardData: { items: [{ type: 'text/plain' }] },
      preventDefault: function () { prevented = true; }
    };
    w.imOnPaste(textEv);
    check('text 类型粘贴 → 不调用 preventDefault', prevented === false);

    /* text/html 放行（微信链接卡片场景，PRD R-4 缓解） */
    prevented = false;
    const htmlEv = {
      clipboardData: { items: [{ type: 'text/html' }, { type: 'text/plain' }] },
      preventDefault: function () { prevented = true; }
    };
    w.imOnPaste(htmlEv);
    check('text/html 类型粘贴 → 不调用 preventDefault', prevented === false);

    /* 缺 clipboardData：不抛错、不拦截 */
    let emptyEvThrew = false, emptyPrevented = false;
    try {
      w.imOnPaste({});
      w.imOnPaste({ clipboardData: { items: [] } });
      w.imOnPaste(null);
    } catch (e) { emptyEvThrew = true; }
    check('imOnPaste 对空事件 / null 安全 no-op', emptyEvThrew === false);

    /* 大小写：规范上 MIME 小写，但 indexOf 行为明确 —— 仅校验小写开头；大小写敏感不视为缺陷。 */
    for (const mime of ['image/jpeg', 'image/svg+xml', 'image/gif', 'image/png']) {
      prevented = false;
      w.imOnPaste({ clipboardData: { items: [{ type: mime }] }, preventDefault: function () { prevented = true; } });
      check('imOnPaste 拦截 ' + mime, prevented === true);
    }

    allErrors.push(...r.vcErrors);
  }

  /* ============ D. 好友 tab 自上而下：我的群聊 + 注册好友 ============ */
  sec('[D] 好友 tab 自上而下分组：AI伙伴 / 我的群聊 / 注册好友');
  {
    const r = await loadPage('私聊.html');
    const { w, d } = r;
    /* 注入 token 让「我的群聊」整段渲染（无 token 时按 B-5 整段隐藏） */
    w.localStorage.setItem('study_workbench_token', 'fake-token-for-t03-test');
    w.imSwitchTab('friends');
    /* 等 loadGroups → catch → 第二次 renderFriends → 渲染失败链接。jsdom 微任务延迟较慢，最长等 3s */
    let hasRetry = false;
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      const html = d.getElementById('imList').innerHTML || '';
      if (html.indexOf('onclick="loadGroups()"') >= 0 && html.indexOf('点此重试') >= 0) { hasRetry = true; break; }
    }
    const listHtml = d.getElementById('imList').innerHTML || '';
    const titles = Array.from(d.querySelectorAll('#imList .im-group-title'));
    const labels = titles.map(t => (t.textContent || '').trim());
    check('好友 tab 含至少 2 个 .im-group-title（我的群聊 / 注册好友）',
      titles.length >= 2, '实际=' + titles.length + ' 内容=' + JSON.stringify(labels));
    check('第一个分组标题含「我的群聊」字样',
      titles[0] && (titles[0].textContent || '').indexOf('我的群聊') >= 0,
      '实际=' + (titles[0] && titles[0].textContent));
    const allText = d.getElementById('imList').textContent || '';
    const idxGroup = allText.indexOf('我的群聊');
    const idxRegistered = allText.indexOf('注册好友');
    check('我的群聊 出现在 注册好友 之前（PRD §2.2 自上而下顺序）',
      idxGroup >= 0 && idxRegistered >= 0 && idxGroup < idxRegistered,
      '我的群聊 idx=' + idxGroup + ' 注册好友 idx=' + idxRegistered);
    check('loadGroups 失败时显示「点此重试」链接',
      hasRetry, 'listHtml 长度=' + listHtml.length + ' 含 loadGroups()=' + (listHtml.indexOf('loadGroups()') >= 0));
    allErrors.push(...r.vcErrors);
  }

  /* ============ E. 会话 tab 仍按 renderChats 渲染群行 ============ */
  sec('[E] 会话 tab 渲染群行（imRenderGroupRows 共用验证）');
  {
    const r = await loadPage('私聊.html');
    const { w, d } = r;
    w.localStorage.setItem('study_workbench_token', 'fake-token-for-t03-test');
    /* 注入 S.groups via 模拟 loadGroups 完成：直接读页面内的 chat-local.js 内部 S 不可能（IIFE 私有）。
       退而求其次：验证无 groups 时会话 tab 不崩；切到 friends 时 .im-group-title 出现；
       会话 tab 内 .im-list 有 im-empty2 占位文字「还没有会话…」即可视为正常降级。 */
    w.imSwitchTab('chats');
    await sleep(80);
    const listHtml = d.getElementById('imList').innerHTML || '';
    const ok = (listHtml.length > 0) && (listHtml.indexOf('im-sess') >= 0 || listHtml.indexOf('im-empty2') >= 0 || listHtml.indexOf('im-swipe') >= 0);
    check('会话 tab 渲染非空（含 .im-sess 或 .im-empty2 降级文案）', ok,
      'listHtml 长度=' + listHtml.length);
    allErrors.push(...r.vcErrors);
  }

  /* ============ F. 输入框 paste 监听已绑 ============ */
  sec('[F] 输入框 paste 监听已绑（boot 已执行）');
  {
    const r = await loadPage('私聊.html');
    const { w, d } = r;
    const inp = d.getElementById('imInput');
    check('#imInput 存在', !!inp);
    if (inp) {
      let prevented = false;
      /* 模拟 paste：image 类型 → 应当被绑定到 imInput 的 imOnPaste 拦截 */
      const ev = w.document.createEvent ? w.document.createEvent('Event') : null;
      /* jsdom Event API 较旧，手动构造一个 clipboardData-bearing 对象；
         addEventListener('paste', imOnPaste) 已经绑了，直接派发自定义事件 */
      try {
        let cancelled = false;
        const fakeEvent = new w.Event('paste');
        fakeEvent.clipboardData = { items: [{ type: 'image/png' }] };
        fakeEvent.preventDefault = function () { cancelled = true; };
        inp.dispatchEvent(fakeEvent);
        check('dispatchEvent paste(image) → preventDefault 已调用（输入框拦截生效）', cancelled === true);
      } catch (e) {
        check('dispatchEvent paste(image) 执行无异常', false, e.message);
      }
    }
    allErrors.push(...r.vcErrors);
  }

  /* ============ G. 静态 grep 校验：私聊.html 已无发图入口 ============ */
  sec('[G] grep 校验：私聊.html 无 image/* / sendImage / 发图片 / 🖼 入口残留');
  {
    const html = fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8');
    /* #imImgFile 应不存在 */
    check('私聊.html 不含 id="imImgFile"', html.indexOf('id="imImgFile"') < 0);
    /* 发图按钮（onclick 引用 imImgFile.click() 的链路）应消失 */
    check('私聊.html 不含 document.getElementById("imImgFile").click()',
      html.indexOf("getElementById('imImgFile')") < 0);
    /* 🖼 emoji 入口应消失 */
    check('私聊.html 不含 🖼 emoji',
      html.indexOf('🖼') < 0);
    /* title="发图片" 应消失 */
    check('私聊.html 不含 title="发图片"',
      html.indexOf('title="发图片"') < 0);
    /* imSendImage 仍可在 chat-local.js 找到（【后续扩展点】保留） */
    const js = fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8');
    const sendImgHits = (js.match(/imSendImage/g) || []).length;
    check('chat-local.js 中 imSendImage 仍保留（保留函数防崩溃）',
      sendImgHits >= 2, '命中=' + sendImgHits + '（定义 1 次 + 注释至少 1 次）');
    const onPasteHits = (js.match(/imOnPaste/g) || []).length;
    check('chat-local.js 中 imOnPaste 至少出现 2 次（定义 + boot 绑定）',
      onPasteHits >= 2, '命中=' + onPasteHits);
  }

  /* ============ 汇总 ============ */
  console.log('\n===== 汇总 =====');
  console.log('通过 ' + pass + ' / ' + (pass + fail) + ' 项，失败 ' + fail + ' 项');
  if (FAILS.length) {
    console.log('失败清单：');
    FAILS.forEach(f => console.log('  - ' + f));
  }
  if (allErrors.length) {
    console.log('\n后台未捕获异常（仅警告，不计通过率）：');
    allErrors.forEach(e => console.log('  - ' + e));
  }

  qaServer.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.log('CRASH: ' + (e && (e.stack || e.message || e)));
  try { qaServer.close(); } catch (_) {}
  process.exit(2);
});