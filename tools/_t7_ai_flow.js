// 任务七 AI 流程验证：桩掉 window.callAI，跑通「发送 → 流式 → 复制/重新生成 → 切角色 → 旧 id 迁移」
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');

const ROOT = 'D:\\下载的文件\\学习工作台';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/学习工作台.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  res.end(fs.readFileSync(fp));
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const ORIGIN = 'http://127.0.0.1:' + server.address().port;
  const vc = new VirtualConsole();
  const logs = [];
  vc.on('jsdomError', e => logs.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
  const url = new URL('/' + encodeURIComponent('学习工作台.html'), ORIGIN).href;
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, '学习工作台.html'), 'utf8'), {
    url, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 2000));
  const out = [];

  // 触发旧 id 迁移（注意：AI_PARTNER_KEY 可能被 lsKey 加上账号后缀，这里读出真实 key）
  const PKEY = w.AI_PARTNER_KEY || 'study_workbench_ai_partner';
  out.push('AI_PARTNER_KEY = ' + PKEY + ' | CURRENT_ACCOUNT = ' + String(w.CURRENT_ACCOUNT));
  try {
    w.localStorage.setItem(PKEY, 'gongkao');
    w.localStorage.setItem('study_workbench_ai_chat_gongkao',
      JSON.stringify([{ role: 'user', text: '旧历史提问', time: Date.now() }]));
  } catch (e) { out.push('localStorage 写入失败: ' + e.message); }
  out.push('写入后 PKEY = ' + String(w.localStorage.getItem(PKEY)));

  // --- 1) 桩掉 callAI：返回带 onChunk 的假流式 ---
  w.__callArgs = null;
  w.__callCount = 0;
  w.callAI = function (funcType, messages, opts) {
    w.__callCount++;
    w.__callArgs = { funcType: funcType, n: messages.length, system: messages[0] && messages[0].content.slice(0, 12), model: opts && opts.model, hasOnChunk: !!(opts && opts.onChunk) };
    return new Promise(function (resolve) {
      if (opts && opts.onChunk) {
        setTimeout(function () { opts.onChunk('你', '你'); }, 10);
        setTimeout(function () { opts.onChunk('好', '你好'); }, 20);
        setTimeout(function () { opts.onChunk('！', '你好！'); }, 30);
      }
      setTimeout(function () { resolve({ text: '你好！这是小助手的真实回复。', degraded: false }); }, 40);
    });
  };
  out.push('aiBaseReady() = ' + w.aiBaseReady() + ' | aiStreamCapable() = ' + w.aiStreamCapable());

  out.push('迁移后 getAiPartnerId() = ' + w.getAiPartnerId());
  out.push('迁移后 partner key  = ' + String(w.localStorage.getItem(PKEY)));
  out.push('迁移后 getAiChatKey = ' + w.getAiChatKey());
  out.push('迁移后历史条数      = ' + (JSON.parse(w.localStorage.getItem(w.getAiChatKey()) || '[]')).length);

  // --- 2) 发送一条消息 ---
  out.push('[probe] typeof w.callAI = ' + typeof w.callAI);
  out.push('[probe] typeof w.aiDispatchReply = ' + typeof w.aiDispatchReply +
    ' | typeof w.fetchAssistantReply = ' + typeof w.fetchAssistantReply);
  try { out.push('[probe] currentAiMode = ' + JSON.stringify(w.currentAiMode())); } catch (e) { out.push('[probe] currentAiMode err ' + e.message); }
  w.document.getElementById('aiInput').value = '四级怎么复习';
  try { w.sendAiMsg(); } catch (e) { out.push('[probe] sendAiMsg throw: ' + e.message); }
  await new Promise(r => setTimeout(r, 1500));
  out.push('callAI 调用次数 = ' + w.__callCount);
  out.push('callAI 入参 = ' + JSON.stringify(w.__callArgs));
  out.push('本地历史 = ' + JSON.stringify((JSON.parse(w.localStorage.getItem(w.getAiChatKey()) || '[]')).map(m => m.role + ':' + String(m.text).slice(0, 24))));
  out.push('气泡数 = ' + w.document.querySelectorAll('#aiMessages .ai-msg').length);
  const acts = w.document.querySelectorAll('#aiMessages .ai-msg-actions button');
  out.push('操作按钮 = ' + Array.prototype.map.call(acts, b => b.textContent).join(' | '));
  const shared = JSON.parse(w.localStorage.getItem('ai_chat_history') || '[]');
  out.push('共享历史 ai_chat_history 会话数 = ' + shared.length +
    ' | 首会话 id = ' + (shared[0] ? shared[0].id : '-') +
    ' | 消息数 = ' + (shared[0] ? shared[0].messages.length : 0));

  // --- 3) 切换模型（写共享 key） ---
  w.selectAiModel('glm-4.7-flash');
  out.push('切模型后 ai_selected_model = ' + String(w.localStorage.getItem('ai_selected_model')));
  out.push('切模型后 #aiModelChip = ' + (w.document.getElementById('aiModelChip') || {}).textContent);
  out.push('切模型后 #aiSubtitle = ' + (w.document.getElementById('aiSubtitle') || {}).textContent);

  // --- 4) 切换角色到暖心学伴 ---
  w.openAiPartnerPicker();
  out.push('弹窗 open = ' + w.document.getElementById('aiPartnerPicker').className);
  out.push('角色卡数 = ' + w.document.querySelectorAll('#aiPartnerList .ai-partner-card').length);
  w.selectAiPartner('warm');
  await new Promise(r => setTimeout(r, 300));
  out.push('切换后 partner key = ' + String(w.localStorage.getItem('study_workbench_ai_partner')));
  out.push('切换后 卡片名 = ' + (w.document.getElementById('aiPartnerName') || {}).textContent +
    ' | tag = ' + (w.document.getElementById('aiPartnerTag') || {}).textContent);
  out.push('切换后 弹窗 open = ' + w.document.getElementById('aiPartnerPicker').className);
  out.push('切换后 历史条数 = ' + (JSON.parse(w.localStorage.getItem(w.getAiChatKey()) || '[]')).length + ' (key=' + w.getAiChatKey() + ')');

  // --- 5) 快捷功能填充输入框 ---
  w.useAiQuickAction('plan');
  out.push('快捷功能后输入框前20字 = ' + String(w.document.getElementById('aiInput').value).slice(0, 20));

  // --- 6) 降级路径：callAI 抛错 ---
  w.callAI = function () { return Promise.reject(new Error('网络异常-测试')); };
  w.document.getElementById('aiInput').value = '再问一次';
  w.sendAiMsg();
  await new Promise(r => setTimeout(r, 1500));
  const txt = w.document.getElementById('aiMessages').textContent || '';
  out.push('降级提示出现 = ' + (txt.indexOf('网络不佳，以下为本地参考') >= 0));
  out.push('降级后 #aiMessages 文本 = ' + txt.replace(/\s+/g, ' ').slice(0, 200));

  out.push('运行时错误(排除 navigation) = ' +
    (logs.filter(l => l.indexOf('Not implemented') < 0).slice(0, 6).join(' ;; ') || '(无)'));

  fs.writeFileSync('C:\\Users\\ATM\\_t7_flow_out.txt', out.join('\n'), 'utf8');
  console.log('DONE');
  server.close();
  process.exit(0);
})();
