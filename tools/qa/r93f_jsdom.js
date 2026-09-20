/* R93-5b 压缩验证：①支持型号才有小开关 ②点开关 localStorage 持久+刷新记忆
 * ③开关开→对话页发送 input.audio===true（关时!==true） ④composer 无残留 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = 'D:/下载的文件/学习工作台';
const OUT = [];
let failed = 0;
function A(n, c) { OUT.push((c ? 'PASS' : 'FAIL') + ' ' + n); if (!c) failed++; }
function strip(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''); }
function mkWin(html) {
  const w = new JSDOM(html, { url: 'http://localhost/x.html', runScripts: 'outside-only', pretendToBeVisual: true }).window;
  w.fetch = function () { return new Promise(function () {}); };
  w.alert = function () {}; w.confirm = function () { return false; }; w.scrollTo = function () {};
  return w;
}

/* ===== 窗口 A：ai-settings.html 模型列表 ===== */
const wa = mkWin(strip('ai-settings.html'));
const da = wa.document;
wa.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-config.js'), 'utf8'));
wa.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-settings.js'), 'utf8'));

/* ===== 窗口 B：AI.html 对话页 ===== */
const wb = mkWin(strip('AI.html'));
const db = wb.document;
const captured = [];
wb.AI_SERVICE = {
  xtRunCapability: function (id, input, o) {
    captured.push(input || {});
    if (o && typeof o.onProgress === 'function') { o.onProgress({ tries: 1, max: 120 }); }
    return Promise.resolve({ result: { url: 'https://tos.example.com/v.mp4?X-Tos-Expires=1' } });
  }
};
wb.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-config.js'), 'utf8'));
wb.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-page.js'), 'utf8'));

setTimeout(function () {
  try {
    /* ① 支持型号才有小开关 */
    const rowPro = da.querySelector('[data-model-id="ark-seedance-1-0-pro"]');
    const rowFast = da.querySelector('[data-model-id="ark-seedance-1-0-pro-fast"]');
    const row3d = da.querySelector('[data-model-id="ark-seed3d-2-0"]');
    const rowTxt = da.querySelector('[data-model-id="glm-4.7"]');
    A('① pro row exists', !!rowPro && !!rowFast && !!row3d && !!rowTxt);
    const swPro = rowPro.querySelector('[data-vidaudio]');
    A('① supported (seedance pro) has small toggle', !!swPro);
    A('① toggle sits next to health box in row-sub',
      !!swPro && !!rowPro.querySelector('.xt-set-row-sub [data-health]') &&
      swPro.parentNode.querySelector('[data-health]') !== null &&
      swPro.style.display === 'inline-flex');
    A('① non-supported (3d/text) have no toggle',
      !row3d.querySelector('[data-vidaudio]') && !rowTxt.querySelector('[data-vidaudio]'));
    A('① fast (supported) also has toggle', !!rowFast.querySelector('[data-vidaudio]'));
    A('① toggle is small (16px pill)', !!swPro && swPro.innerHTML.indexOf('height:16px') !== -1);

    /* ② 点开关 → localStorage 持久 + 刷新记忆 */
    const before = wa.localStorage.getItem('ai_audio_models_v1');
    swPro.click();
    const after = wa.localStorage.getItem('ai_audio_models_v1');
    A('② map persisted on click', after === '{"ark-seedance-1-0-pro":true}' && before !== after);
    wa.eval(fs.readFileSync(path.join(ROOT, 'assets/ai-settings.js'), 'utf8'));   // 模拟刷新
    const swPro2 = da.querySelector('[data-model-id="ark-seedance-1-0-pro"] [data-vidaudio]');
    A('② after reload: ON state remembered (class on)', !!swPro2 && swPro2.className.indexOf('on') !== -1);

    /* ③ 对话页：开关开 → input.audio===true；关 → !==true */
    wb.localStorage.setItem('ai_audio_models_v1', after);           // 同源状态带入
    wb.localStorage.setItem('ai_selected_model', 'ark-seedance-1-0-pro');
    const inp = db.getElementById('aiInput');
    inp.value = '生成一只猫';
    inp.dispatchEvent(new wb.Event('input', { bubbles: true }));
    db.getElementById('aiSendBtn').click();
    setTimeout(function () {
      try {
        A('③ audio model on -> input.audio === true', captured.length >= 1 && captured[0].audio === true);
        // 关：清 map 再发
        wb.localStorage.setItem('ai_audio_models_v1', '{}');
        inp.value = '再来一只';
        inp.dispatchEvent(new wb.Event('input', { bubbles: true }));
        db.getElementById('aiSendBtn').click();
        setTimeout(function () {
          try {
            A('③ map off -> input.audio !== true', captured.length >= 2 && captured[1].audio !== true);

            /* ④ composer 无残留 */
            A('④ no #aiVideoAudioBtn in composer', !db.getElementById('aiVideoAudioBtn'));
            const box = db.getElementById('aiInputBox');
            A('④ composer has no audio-toggle remnants',
              !!box && box.textContent.indexOf('带声音') === -1 && box.querySelectorAll('[data-vidaudio]').length === 0);
            A('④ old global key absent', wb.localStorage.getItem('ai_video_audio_v1') === null);
          } catch (e) { OUT.push('EXC ' + (e && e.stack || e)); failed++; }
          OUT.push('SUMMARY failed=' + failed);
          fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93f_jsdom.txt'), OUT.join('\n'), 'utf8');
        }, 500);
      } catch (e) { OUT.push('EXC ' + (e && e.stack || e)); failed++;
        fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93f_jsdom.txt'), OUT.join('\n'), 'utf8'); }
    }, 500);
  } catch (e) { OUT.push('EXC-OUTER ' + (e && e.stack || e)); failed++;
    fs.writeFileSync(path.join(ROOT, 'tools/qa/_r93f_jsdom.txt'), OUT.join('\n'), 'utf8'); }
}, 400);
