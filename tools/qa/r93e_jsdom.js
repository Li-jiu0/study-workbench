/* R93-5 jsdom 验证：视频「带声音」开关 + audio 参数打通。
 * ①选视频模型 → 开关出现且默认关；②点开关 → 状态切换且 localStorage 持久；
 * ③开关开时发送 → xtRunCapability 收到 input.audio===true；
 * ④关时 audio!==true；⑤选普通模型 → 开关隐藏；⑥重载脚本 → 状态记忆保留。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const OUT = [];
let failed = 0;
function A(name, cond) { OUT.push((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) failed++; }
function I(msg) { OUT.push('INFO ' + msg); }

const VID_URL = 'https://ark-content-generation.tos-cn-beijing.volces.com/demo.mp4?X-Tos-Expires=86400';
const captured = [];

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
    captured.push(input || {});
    if (o && typeof o.onProgress === 'function') { o.onProgress({ tries: 1, max: 120 }); }
    return Promise.resolve({ result: { url: VID_URL } });
  }
};

w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-config.js'), 'utf8'));
w.localStorage.setItem('ai_selected_model', 'ark-seedance-1-0-pro');   // 视频模型
w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-page.js'), 'utf8'));

function send(text) {
  const input = doc.getElementById('aiInput');
  input.value = text;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  doc.getElementById('aiSendBtn').click();
}
function clickModelRow(match) {
  const list = doc.getElementById('aiModelList');
  if (!list) { return false; }
  const rows = list.children;
  for (let i = 0; i < rows.length; i++) {
    if (match.test(rows[i].textContent || '')) { rows[i].click(); return true; }
  }
  return false;
}

setTimeout(function () {
  try {
    /* ---------- ① 视频模型选中 → 开关出现且默认关 ---------- */
    const btn = doc.getElementById('aiVideoAudioBtn');
    A('ladder: audio toggle button injected', !!btn);
    A('① video model selected -> button visible', !!btn && btn.style.display !== 'none');
    A('① default OFF (mute icon)', !!btn && btn.textContent === '\ud83d\udd07');
    A('① default OFF (no stored key)', w.localStorage.getItem('ai_video_audio_v1') === null);

    /* ---------- ② 点开关 → 状态切换 + localStorage 持久 ---------- */
    A('② button exists before click', !!btn);
    if (btn) { btn.click(); }
    A('② toggled ON (sound icon)', !!btn && btn.textContent === '\ud83d\udd0a');
    A('② localStorage persisted (raw "1")', w.localStorage.getItem('ai_video_audio_v1') === '1');

    /* ---------- ③ 开着发送 → input.audio === true ---------- */
    send('生成一只跑动的猫');
    setTimeout(function () {
      try {
        A('③ capability called once (audio on)', captured.length === 1);
        A('③ input.audio === true', captured.length >= 1 && captured[0].audio === true);
        const msgs = doc.getElementById('aiMessages');
        const saved = JSON.parse(w.localStorage.getItem('ai_chat_history'));
        const newChat = saved.filter(function (c) { return c.messages[0] && c.messages[0].content === '生成一只跑动的猫'; })[0];
        const aiMsg = newChat ? newChat.messages.filter(function (m) { return m.role === 'ai'; }).pop() : null;
        I('saved ai message = ' + (aiMsg ? aiMsg.content.slice(0, 100) : 'NONE'));
        A('③ success echo mentions （带声音）', !!aiMsg && aiMsg.content.indexOf('（带声音）') !== -1);
        A('③ video player still rendered (R93-4 intact)', !!msgs && !!msgs.querySelector('video'));

        /* ---------- ④ 关掉发送 → audio !== true ---------- */
        if (btn) { btn.click(); }
        A('④ toggled OFF again', !!btn && btn.textContent === '\ud83d\udd07' && w.localStorage.getItem('ai_video_audio_v1') === '0');
        send('再来一只');
        setTimeout(function () {
          try {
            A('④ capability called twice', captured.length === 2);
            A('④ input.audio !== true (off)', captured.length >= 2 && captured[1].audio !== true);

            /* ---------- ⑤ 选普通模型 → 开关隐藏 ---------- */
            const clickedNormal = clickModelRow(/GLM-4\.7/i);
            I('clicked normal model row (GLM-4.7)=' + clickedNormal);
            A('⑤ normal model selected -> button hidden', !!btn && btn.style.display === 'none');

            /* ---------- ⑥ 重载脚本 → 状态记忆保留（重新选回视频模型，开关仍为关） ---------- */
            w.localStorage.setItem('ai_selected_model', 'ark-seedance-1-0-pro');
            w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-page.js'), 'utf8'));   // 模拟刷新
            const btn2 = doc.getElementById('aiVideoAudioBtn');
            A('⑥ after reload: button re-injected & visible', !!btn2 && btn2.style.display !== 'none');
            A('⑥ after reload: OFF state remembered (mute icon)', !!btn2 && btn2.textContent === '\ud83d\udd07');
            A('⑥ after reload: storage value kept "0"', w.localStorage.getItem('ai_video_audio_v1') === '0');
            // 再点开一次 -> 再重载 -> 仍为开（验证开态也持久）
            if (btn2) { btn2.click(); }
            w.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-page.js'), 'utf8'));
            const btn3 = doc.getElementById('aiVideoAudioBtn');
            A('⑥ after 2nd reload: ON state remembered (sound icon)', !!btn3 && btn3.textContent === '\ud83d\udd0a');
          } catch (e) {
            OUT.push('EXCEPTION ' + (e && e.stack ? e.stack : String(e)));
            failed++;
          }
          OUT.push('SUMMARY failed=' + failed);
          fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93e_jsdom.txt'), OUT.join('\n'), 'utf8');
        }, 500);
      } catch (e) {
        OUT.push('EXCEPTION ' + (e && e.stack ? e.stack : String(e)));
        failed++;
        OUT.push('SUMMARY failed=' + failed);
        fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93e_jsdom.txt'), OUT.join('\n'), 'utf8');
      }
    }, 500);
  } catch (e) {
    OUT.push('EXCEPTION-OUTER ' + (e && e.stack ? e.stack : String(e)));
    OUT.push('SUMMARY failed=' + failed);
    fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93e_jsdom.txt'), OUT.join('\n'), 'utf8');
  }
}, 400);
