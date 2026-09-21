// 在 jsdom 里加载线上真实 AI.html，模拟「输入 -> 点发送」，验证页面级可用性
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');

const ORIGIN = 'http://110.42.134.62';
const HTML = fs.readFileSync('C:\\Users\\ATM\\_srv\\AI.html', 'utf8');

const vc = new VirtualConsole();
const logs = [];
vc.on('jsdomError', e => logs.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => logs.push('ERR: ' + a.join(' ')));
vc.on('warn', (...a) => logs.push('WARN: ' + String(a[0]).slice(0, 120)));

const dom = new JSDOM(HTML, {
  url: ORIGIN + '/AI.html',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.fetch = function (u, o) {
      const url = typeof u === 'string' ? new URL(u, ORIGIN).href : u;
      return fetch(url, o);
    };
    window.Headers = Headers;
    window.Request = Request;
    window.Response = Response;
    window.TextDecoder = TextDecoder;
    window.TextEncoder = TextEncoder;
    window.AbortController = AbortController;
    if (!window.crypto) window.crypto = {};
    if (!window.crypto.randomUUID) window.crypto.randomUUID = () => require('crypto').randomUUID();
  }
});

const w = dom.window;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function txt(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '(null)'; }

(async () => {
  await sleep(20000); // 等 app.js(7MB) + ai-*.js 加载
  const out = [];
  out.push('location.href = ' + w.location.href);
  out.push('scripts loaded = ' + w.document.querySelectorAll('script[src]').length);
  out.push('== 全局能力 ==');
  out.push('typeof callAI      = ' + typeof w.callAI);
  out.push('typeof AIConfig    = ' + typeof w.AIConfig);
  out.push('typeof sendMessage = ' + typeof w.sendMessage);
  out.push('typeof AIPage      = ' + typeof w.AIPage);

  const input = w.document.getElementById('aiInput');
  const btn = w.document.getElementById('aiSendBtn');
  out.push('');
  out.push('== DOM ==');
  out.push('#aiInput  = ' + (input ? input.tagName : 'MISSING'));
  out.push('#aiSendBtn= ' + (btn ? btn.tagName : 'MISSING'));

  if (!input || !btn) {
    out.push('!! 关键元素缺失，无法模拟发送');
    out.push(logs.slice(0, 15).join('\n'));
    fs.writeFileSync('C:\\Users\\ATM\\_ai_jsdom_out.txt', out.join('\n'), 'utf8');
    process.exit(0);
  }

  // 输入
  input.focus();
  if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
    input.value = '你好，请回一句话证明你可用';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
  } else {
    input.textContent = '你好，请回一句话证明你可用';
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
  }

  out.push('');
  out.push('== 点击发送 ==');
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

  // 等待回复
  // 固定等待 35s，等模型真正返回（不再用脆弱的文本命中判定）
  for (let i = 0; i < 35; i++) {
    await sleep(1000);
    const bubbles = w.document.querySelectorAll('.ai-bubble-ai');
    const lastB = bubbles.length ? (bubbles[bubbles.length - 1].textContent || '').trim() : '';
    if (lastB.length > 20 && !/本地参考/.test(lastB)) break;
  }
  await sleep(2000);

  // 抓最后一条助手消息
  const cands = [];
  const nodes = w.document.querySelectorAll('[class*="msg"],[class*="message"],[class*="bubble"],[class*="reply"],[class*="answer"]');
  for (let i = Math.max(0, nodes.length - 6); i < nodes.length; i++) {
    cands.push('[' + (nodes[i].className || '') + '] ' + txt(nodes[i]).slice(0, 300));
  }
  out.push('== 末尾消息节点 ==');
  out.push(cands.join('\n'));
  out.push('');
  out.push('== 页面尾部文本(800字) ==');
  out.push(txt(w.document.body).slice(-800));
  out.push('');
  out.push('== 控制台异常(前15) ==');
  out.push(logs.slice(0, 15).join('\n') || '(无)');

  fs.writeFileSync('C:\\Users\\ATM\\_ai_jsdom_out.txt', out.join('\n'), 'utf8');
  console.log('DONE');
  process.exit(0);
})();
