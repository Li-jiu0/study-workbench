/* R93-4 jsdom 双路径验证 v2：视频结果任何渲染路径都内嵌 <video controls>。
 * ① 运行时成功路径（能力直连回调 DOM 插入）→ <video> 在；
 * ② 历史重渲染路径（模拟 reload 后点历史条目 loadChat → renderMarkdown）→
 *    存量纯文本消息（旧格式 '🎬 ...：URL'）也输出 <video> 而非裸 URL；
 * ③ 不误伤：3D .zip、普通网页 URL、失败文案均不产生 <video>，文本保留。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const OUT = [];
let failed = 0;
function A(name, cond) { OUT.push((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) failed++; }
function I(msg) { OUT.push('INFO ' + msg); }

const VID_URL = 'https://ark-content-generation.tos-cn-beijing.volces.com/demo-123.mp4?X-Tos-Expires=86400&X-Tos-Algorithm=TOS-HMAC-SHA256';
const OLD_VID_URL = 'https://ark-content-generation.tos-cn-beijing.volces.com/old-999.mp4?X-Tos-Expires=123';
const ZIP_URL = 'https://ark-content-generation.tos-cn-beijing.volces.com/model-abc.zip?X-Tos-Expires=86400';

let html = fs.readFileSync(path.join(ROOT, 'AI.html'), 'utf8')
  .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/AI.html', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
const doc = w.document;
w.fetch = function () { return new Promise(function () {}); };
w.alert = function () {}; w.confirm = function () { return false; };
w.scrollTo = function () {};

w.AI_SERVICE = {
  xtRunCapability: function (selId, input, o) {
    if (o && typeof o.onProgress === 'function') { o.onProgress({ tries: 1, max: 120 }); }
    return Promise.resolve({ result: { url: VID_URL } });
  }
};

w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-config.js'), 'utf8'));
w.localStorage.setItem('ai_selected_model', 'ark-seedance-1-0-pro');
w.localStorage.setItem('ai_chat_history', JSON.stringify([
  { id: 'legacy-1', title: '旧视频会话', updated: 1, messages: [
    { role: 'user', content: '生成一只跑动的猫' },
    { role: 'ai', content: '🎬 视频已生成（链接约 24 小时内有效，请及时观看 / 保存）：' + OLD_VID_URL }
  ]},
  { id: 'mix-1', title: '混合会话', updated: 2, messages: [
    { role: 'user', content: '做个3d' },
    { role: 'ai', content: '🧊 3D 模型已生成（结果为 .zip 压缩包，内含模型文件）：' + ZIP_URL },
    { role: 'user', content: '这个网站是什么' },
    { role: 'ai', content: '可以看看 https://example.com/page 了解更多。' },
    { role: 'user', content: '再来一个' },
    { role: 'ai', content: '⚠️ 视频生成失败：网络异常' }
  ]}
]));
w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-page.js'), 'utf8'));

function rowByTitle(t) {
  const rows = doc.querySelectorAll('.ai-hist-item-row');
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].textContent.indexOf(t) !== -1) { return rows[i]; }
  }
  return null;
}

setTimeout(function () {
  try {
    /* ---------- ① 运行时成功路径 ---------- */
    const input = doc.getElementById('aiInput');
    const send = doc.getElementById('aiSendBtn');
    A('input & send button exist', !!input && !!send);
    input.value = '生成一只跑动的猫';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));   // 触发 updateSendEnabled 解除禁用
    A('send button enabled after input event', send.disabled === false);
    send.click();

    setTimeout(function () {
      try {
        const msgs = doc.getElementById('aiMessages');
        const runtimeHtml = msgs ? msgs.innerHTML : '';
        const rtVid = msgs ? msgs.querySelector('video') : null;
        A('runtime path: <video> present', !!rtVid);
        A('runtime path: video src == capability URL', !!rtVid && rtVid.getAttribute('src') === VID_URL);
        A('runtime path: video has controls', !!rtVid && rtVid.hasAttribute('controls'));
        A('runtime path: no <a> link for video', runtimeHtml.indexOf('<a ') === -1);

        const hist = JSON.parse(w.localStorage.getItem('ai_chat_history'));
        const newChat = hist.filter(function (c) { return c.messages[0] && c.messages[0].content === '生成一只跑动的猫' && c.id !== 'legacy-1'; })[0];
        A('new chat saved', !!newChat);
        if (newChat) {
          const aiMsg = newChat.messages.filter(function (m) { return m.role === 'ai'; }).pop();
          I('saved ai message = ' + aiMsg.content.slice(0, 140));
          A('saved message keeps plain format (legacy-compatible)',
            aiMsg.content === '🎬 视频已生成（链接约 24 小时内有效，请及时观看 / 保存）：' + VID_URL);
        }

        /* ---------- ② 模拟 reload：重跑 ai-page.js（IIFE 状态重置自 localStorage） ---------- */
        w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-page.js'), 'utf8'));

        /* 2a. 旧存量消息（R92-A 之前保存的同格式纯文本） */
        const legacyRow = rowByTitle('旧视频会话');
        A('legacy history row exists', !!legacyRow);
        if (legacyRow) { legacyRow.click(); }
        const lm = doc.getElementById('aiMessages');
        const legacyVid = lm ? lm.querySelector('video.ai-md-video') : null;
        A('legacy saved message re-renders to <video>', !!legacyVid && legacyVid.getAttribute('src') === OLD_VID_URL);
        A('legacy re-render: controls + preload=metadata',
          !!legacyVid && legacyVid.hasAttribute('controls') && legacyVid.getAttribute('preload') === 'metadata');
        const legacyHtml = lm ? lm.innerHTML : '';
        A('legacy re-render: no <a> fallback', legacyHtml.indexOf('<a ') === -1);
        A('legacy re-render: heading kept', legacyHtml.indexOf('视频已生成') !== -1);
        A('legacy re-render: raw URL not dumped as text', lm.textContent.indexOf(OLD_VID_URL) === -1);

        /* 2b. 新保存的消息重渲染（新会话行） */
        const newRow = rowByTitle('生成一只跑动的猫');
        A('new chat history row exists', !!newRow);
        if (newRow) { newRow.click(); }
        const nm = doc.getElementById('aiMessages');
        const newVid = nm ? nm.querySelector('video.ai-md-video') : null;
        A('newly saved message re-renders to <video>', !!newVid && newVid.getAttribute('src') === VID_URL);

        /* 2c. 混合会话不误伤 */
        const mixRow = rowByTitle('混合会话');
        A('mix history row exists', !!mixRow);
        if (mixRow) { mixRow.click(); }
        const mm = doc.getElementById('aiMessages');
        const mixHtml = mm ? mm.innerHTML : '';
        A('mix chat: zero <video> elements', mm.querySelectorAll('video').length === 0);
        A('mix chat: zip URL text kept', mixHtml.indexOf('model-abc.zip') !== -1);
        A('mix chat: plain web URL text kept', mixHtml.indexOf('https://example.com/page') !== -1);
        A('mix chat: failure message text kept', mixHtml.indexOf('⚠️ 视频生成失败') !== -1);
        A('mix chat: no <a> introduced', mixHtml.indexOf('<a ') === -1);
      } catch (e) {
        OUT.push('EXCEPTION ' + (e && e.stack ? e.stack : String(e)));
        failed++;
      }
      OUT.push('SUMMARY failed=' + failed);
      fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93d_jsdom.txt'), OUT.join('\n'), 'utf8');
    }, 500);
  } catch (e) {
    OUT.push('EXCEPTION-OUTER ' + (e && e.stack ? e.stack : String(e)));
    OUT.push('SUMMARY failed=' + failed);
    fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93d_jsdom.txt'), OUT.join('\n'), 'utf8');
  }
}, 400);
