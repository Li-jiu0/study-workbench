/* =====================================================================
   voiceplayer.js —— 四级·听说训练（口语跟读 / 听力精听）全屏播放器
   ---------------------------------------------------------------------
   多情景对话（咖啡/机场/餐厅/酒店/购物/问路），可切换“口语跟读”与“听力精听”。
   依赖：app.js（speakUtterance / startEnglishRecognition / evaluateSpeaking）。
   用法：openVoiceTrain('listen') / openVoiceTrain('speak')
   ===================================================================== */
(function () {
  'use strict';
  if (window.__VOICE__) return;
  window.__VOICE__ = 1;

  var SCENES = {
    coffee: {
      t: '☕ 咖啡店点单', lines: [
        { en: 'Hi, what can I get for you today?', zh: '你好，今天想喝点什么？' },
        { en: "I'd like a medium hot latte with less sugar, please.", zh: '我想要一杯中杯热拿铁，少糖。' },
        { en: 'Sure, anything else?', zh: '好的，还要别的吗？' },
        { en: "And I'll also have a chocolate muffin, please.", zh: '再来一个巧克力麦芬，谢谢。' },
        { en: 'Okay, that is a medium latte and a muffin. For here or to go?', zh: '好的，一杯中杯拿铁和麦芬。带走还是堂食？' },
        { en: 'To go, please. How much is that?', zh: '带走，谢谢。多少钱？' }
      ]
    },
    airport: {
      t: '✈️ 机场值机', lines: [
        { en: 'Good morning. May I see your passport, please?', zh: '早上好，请出示您的护照。' },
        { en: 'Here you are. I would like a window seat if possible.', zh: '给你，如果可以我想要靠窗的座位。' },
        { en: 'No problem. Do you have any checked baggage?', zh: '没问题，有需要托运的行李吗？' },
        { en: 'Yes, one suitcase. And is this flight on time?', zh: '有一个行李箱。这班航班准点吗？' },
        { en: 'It is on schedule. Here is your boarding pass, gate 22.', zh: '准点。这是你的登机牌，22 号登机口。' },
        { en: 'Thank you very much. Have a nice trip!', zh: '非常感谢，祝您旅途愉快！' }
      ]
    },
    restaurant: {
      t: '🍽️ 餐厅点餐', lines: [
        { en: 'Welcome! A table for two?', zh: '欢迎光临，两位吗？' },
        { en: 'Yes, please. Could we sit by the window?', zh: '是的，能坐靠窗的位置吗？' },
        { en: 'Of course. Here are the menus.', zh: '当然可以，这是菜单。' },
        { en: 'What do you recommend? I am a little hungry.', zh: '你有什么推荐？我有点饿了。' },
        { en: 'Our grilled salmon is quite popular.', zh: '我们的烤三文鱼很受欢迎。' },
        { en: 'Sounds good. I will have that, with a side salad.', zh: '听起来不错，就要这个，外加一份沙拉。' }
      ]
    },
    hotel: {
      t: '🏨 酒店入住', lines: [
        { en: 'Good evening. How can I help you?', zh: '晚上好，有什么可以帮您？' },
        { en: 'I have a reservation under the name Zhang Wei.', zh: '我用张伟的名字预订了房间。' },
        { en: 'Let me check. Yes, a single room for two nights.', zh: '我查一下，是的，单人间两晚。' },
        { en: 'Great. What time is breakfast served?', zh: '好的，早餐几点供应？' },
        { en: 'From 6:30 to 9:30 on the second floor.', zh: '6:30 到 9:30，在二楼。' },
        { en: 'Perfect. Here is your key card, room 805.', zh: '很好。这是你的房卡，805 房。' }
      ]
    },
    shopping: {
      t: '🛍️ 购物退换', lines: [
        { en: 'Hi, I would like to return this shirt.', zh: '你好，我想退这件衬衫。' },
        { en: 'Do you have the receipt with you?', zh: '您带小票了吗？' },
        { en: 'Yes, here it is. I bought it yesterday.', zh: '带了，在这。我昨天买的。' },
        { en: 'Is there anything wrong with it?', zh: '是有什么问题吗？' },
        { en: 'It is too small for me, actually.', zh: '其实对我来说太小了。' },
        { en: 'No problem. I will refund it to your card.', zh: '没问题，我会退款到您的卡里。' }
      ]
    },
    street: {
      t: '🗺️ 问路', lines: [
        { en: 'Excuse me, how can I get to the subway station?', zh: '打扰一下，去地铁站怎么走？' },
        { en: 'Go straight and turn left at the second crossing.', zh: '直走，在第二个路口左转。' },
        { en: 'Is it far from here?', zh: '离这儿远吗？' },
        { en: 'About a ten-minute walk. You cannot miss it.', zh: '步行大约十分钟，你不会错过的。' },
        { en: 'Great, thank you so much.', zh: '太好了，非常感谢。' },
        { en: 'You are welcome. Have a nice day!', zh: '不客气，祝您愉快！' }
      ]
    },
    // —— 批次三 T11（R3-7）：听力三类题型（内置兜底，ext JSON 增量合并）——
    news: {
      t: '新闻听力', lines: [
        { en: "Good evening, and welcome to today's campus news roundup.", zh: '晚上好，欢迎收看今天的校园新闻速览。' },
        { en: 'The library will extend its opening hours during the final exam week.', zh: '期末考试周期间，图书馆将延长开放时间。' },
        { en: 'It will now stay open until midnight from next Monday.', zh: '从下周一起，它将开放到午夜。' },
        { en: 'A new language exchange program starts this Friday in the student center.', zh: '本周五，学生活动中心将启动一个新的语言互助项目。' },
        { en: 'Students can practice English with native speakers for free.', zh: '学生可以免费与母语者练习英语。' },
        { en: 'The weather forecast says it will be sunny and warm this weekend.', zh: '天气预报显示本周末晴朗温暖。' },
        { en: 'Remember to bring your student card to all campus events.', zh: '参加校园活动时记得携带学生证。' }
      ]
    },
    longconv: {
      t: '长对话', lines: [
        { en: 'Hi Lin, do you have a minute to talk about our group project?', zh: '嗨林，你有空聊一下我们的小组项目吗？' },
        { en: 'Sure, I was just thinking about how to divide the work.', zh: '当然，我正想着怎么分工呢。' },
        { en: 'How about you do the research and I write the report?', zh: '你负责调研、我写报告，怎么样？' },
        { en: 'That works. Should we also prepare a short presentation?', zh: '可以。我们要不要也准备一个简短的展示？' },
        { en: 'Yes, and maybe we can practice it together before class.', zh: '要的，我们可以课前一起演练一下。' },
        { en: 'Let’s meet at the study room on Thursday afternoon.', zh: '我们周四下午在自习室碰面吧。' },
        { en: 'Great, I’ll book the room and send you the slides later.', zh: '好的，我来订房间，稍后把幻灯片发你。' }
      ]
    },
    passage: {
      t: '短文朗读', lines: [
        { en: 'Today I want to share three simple tips for better memory.', zh: '今天我想分享三个提升记忆力的简单技巧。' },
        { en: 'First, review new words within twenty-four hours of learning them.', zh: '第一，在学习新单词后 24 小时内复习。' },
        { en: 'Second, try to use the word in a real sentence, not just read it.', zh: '第二，尝试在真实句子中使用该词，而不只是阅读。' },
        { en: 'Third, teach the idea to a friend; teaching helps you remember.', zh: '第三，把知识点讲给朋友听，教别人有助于记忆。' },
        { en: 'Also, a good night’s sleep makes a big difference.', zh: '此外，睡个好觉效果差别很大。' },
        { en: 'Finally, be patient; building habits takes a few weeks.', zh: '最后，要有耐心，养成习惯需要几周时间。' }
      ]
    }
  };

  // 批次三 T11（R3-7）：听力三类题型增量合并（news / longconv / passage）
  // 内置 9 个场景为离线兜底（coffee/airport/restaurant/hotel/shopping/street 六个情景
  // + news/longconv/passage 三个题型）；ext JSON 按 key 合并，已存在 key 不覆盖（与 T06/T08 同策略）。
  function loadListeningExt() {
    try {
      fetch('assets/data/listening-ext.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!j || !j.scenes || typeof SCENES === 'undefined' || !SCENES) return;
        var added = 0;
        Object.keys(j.scenes).forEach(function (k) {
          if (!j.scenes[k] || !j.scenes[k].lines || SCENES[k]) return; // 已存在 key 不覆盖
          SCENES[k] = { t: j.scenes[k].t || k, lines: j.scenes[k].lines };
          added++;
        });
        if (added > 0 && typeof window.lucideAutoRender === 'function') { try { window.lucideAutoRender(); } catch (e) {} }
      }).catch(function () { /* file:// / 离线：回退内置 9 个场景 */ });
    } catch (e) { /* fetch 不可用：回退 */ }
  }

  var S = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function css() {
    if (document.getElementById('vpStyle')) return;
    var c = '.vp-mask{position:fixed;inset:0;background:linear-gradient(160deg,var(--primary),var(--g2));z-index:2400;display:flex;flex-direction:column;color:#fff;padding:20px 18px 14px;overflow:hidden}.vp-top{display:flex;align-items:center;gap:8px}.vp-top b{flex:1;font-size:16px}.vp-x{background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:10px;width:34px;height:34px;font-size:16px;cursor:pointer}.vp-mode{display:flex;gap:8px;margin:12px 0}.vp-mode .m{flex:1;text-align:center;padding:9px 0;border-radius:12px;background:rgba(255,255,255,.12);font-size:13px;cursor:pointer}.vp-mode .m.on{background:#fff;color:var(--primary);font-weight:700}.vp-scene{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px}.vp-scene .s{white-space:nowrap;background:rgba(255,255,255,.12);border-radius:20px;padding:6px 13px;font-size:13px;cursor:pointer}.vp-scene .s.on{background:#fff;color:var(--primary);font-weight:700}.vp-stage{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0}.vp-count{opacity:.85;font-size:12px;margin-bottom:8px}.vp-card{background:rgba(255,255,255,.95);color:#232536;width:100%;max-width:560px;border-radius:20px;padding:26px 22px;text-align:center;min-height:180px;display:flex;flex-direction:column;justify-content:center;box-shadow:0 18px 40px -14px rgba(0,0,0,.35)}.vp-en{font-size:24px;font-weight:800;line-height:1.5}.vp-en.blur{color:transparent;text-shadow:0 0 12px rgba(0,0,0,.35);user-select:none}.vp-zh{font-size:15px;color:#6b7280;margin-top:14px}.vp-zh.hide{visibility:hidden}.vp-ctl{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap}.vp-cbtn{background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:12px;padding:10px 16px;font-size:13px;cursor:pointer}.vp-cbtn.solid{background:#fff;color:var(--primary);font-weight:700}.vp-eval{background:rgba(255,255,255,.94);color:#232536;max-width:560px;width:100%;margin-top:14px;border-radius:14px;padding:14px;max-height:40vh;overflow:auto;font-size:13px}';
    var st = document.createElement('style'); st.id = 'vpStyle'; st.textContent = c; (document.head || document.documentElement).appendChild(st);
  }

  function render() {
    var sc = SCENES[S.scene], lns = sc.lines, i = S.i, it = lns[i];
    var zh = S.showZh ? '<div class="vp-zh">' + esc(it.zh) + '</div>' : '<div class="vp-zh hide">' + esc(it.zh) + '</div>';
    var showEn = (S.mode === 'speak') || S.showEn;
    var enCls = showEn ? 'vp-en' : 'vp-en blur';
    var box = document.getElementById('vpBody');
    var evalBox = '<div id="vpEval"></div>';
    var rec = (S.mode === 'speak')
      ? '<button class="vp-cbtn solid" id="vpRec" onclick="openVoiceTrain.__rec()">🎤 跟读这一句</button>'
      : '<button class="vp-cbtn" onclick="openVoiceTrain.__zh()">' + (S.showZh ? '🙈 隐藏中文' : '💬 显示中文') + '</button>';
    box.innerHTML =
      '<div class="vp-count">第 ' + (i + 1) + ' / ' + lns.length + ' 句 · ' + sc.t + '</div>' +
      '<div class="vp-card"><div class="' + enCls + '" id="vpEn">' + esc(it.en) + '</div>' + zh + '</div>' +
      (S.mode === 'listen' ? '<div class="vp-ctl">' +
        '<button class="vp-cbtn" onclick="openVoiceTrain.__prev()">⏮ 上一句</button>' +
        '<button class="vp-cbtn solid" onclick="openVoiceTrain.__play()">🔊 播放</button>' +
        '<button class="vp-cbtn" onclick="openVoiceTrain.__slow()">🐢 慢速</button>' +
        '<button class="vp-cbtn" onclick="openVoiceTrain.__en()">' + (S.showEn ? '🙈 隐藏原文' : '📝 显示原文') + '</button>' +
        '<button class="vp-cbtn" onclick="openVoiceTrain.__next()">下一句 ⏭</button>' +
        '</div>'
        : '<div class="vp-ctl">' +
        '<button class="vp-cbtn" onclick="openVoiceTrain.__play()">🔊 播放</button>' +
        '<button class="vp-cbtn" onclick="openVoiceTrain.__slow()">🐢 慢速</button>' +
        '<button class="vp-cbtn" onclick="openVoiceTrain.__prev()">⏮ 上一句</button>' +
        '<button class="vp-cbtn" onclick="openVoiceTrain.__next()">下一句 ⏭</button>' +
        '</div>') +
      rec + evalBox;
    if (S.mode === 'listen' && S.showEn === false && i === 0) { /* 听力模式自动播第一句 */ }
  }

  function openVoice(mode) {
    css();
    S = { mode: mode || 'listen', scene: 'coffee', i: 0, showEn: mode === 'speak', showZh: true, slow: false };
    var m = document.getElementById('vpMask'); if (m) m.remove();
    m = document.createElement('div'); m.id = 'vpMask'; m.className = 'vp-mask';
    var sceneHtml = Object.keys(SCENES).map(function (k) { return '<span class="s' + (k === 'coffee' ? ' on' : '') + '" data-k="' + k + '" onclick="openVoiceTrain.__scene(\'' + k + '\')">' + SCENES[k].t + '</span>'; }).join('');
    m.innerHTML =
      '<div class="vp-top"><b>' + (mode === 'listen' ? '🎧 听力精听' : '🗣️ 口语跟读') + '</b><button class="vp-x" onclick="openVoiceTrain.__close()">✕</button></div>' +
      '<div class="vp-mode">' +
      '<div class="m' + (mode === 'listen' ? ' on' : '') + '" onclick="openVoiceTrain.__mode(\'listen\')">🎧 听力精听</div>' +
      '<div class="m' + (mode === 'speak' ? ' on' : '') + '" onclick="openVoiceTrain.__mode(\'speak\')">🗣️ 口语跟读</div></div>' +
      '<div class="vp-scene">' + sceneHtml + '</div>' +
      '<div class="vp-stage" id="vpBody"></div>';
    document.body.appendChild(m);
    if (window.openAppModal) window.openAppModal('vpMask'); // 批次三 T20：收编到统一弹窗（锁滚动 / ESC / 点遮罩，.vp-x DOM 保留）
    render();
  }
  function play() {
    var it = SCENES[S.scene].lines[S.i];
    if (typeof speakUtterance === 'function') speakUtterance(it.en, 'en-US');
  }
  window.openVoiceTrain = function (mode) { openVoice(mode); };
  window.openVoiceTrain.__close = function () { var m = document.getElementById('vpMask'); if (m) m.remove(); S = null; if (window.closeAppModal) window.closeAppModal('vpMask'); };
  window.openVoiceTrain.__mode = function (mo) { if (!S) return; S.mode = mo; S.showEn = (mo === 'speak'); S.i = 0; render(); };
  window.openVoiceTrain.__scene = function (k) { if (!S || !SCENES[k]) return; S.scene = k; S.i = 0; S.showEn = S.mode === 'speak'; S.showZh = true; render(); };
  window.openVoiceTrain.__prev = function () { if (!S) return; if (S.i > 0) { S.i--; } else { toast('已是第一句'); } render(); };
  window.openVoiceTrain.__next = function () {
    if (!S) return;
    if (S.i < SCENES[S.scene].lines.length - 1) { S.i++; render(); }
    else { toast('🎉 本情景完成！换个情景再练吧'); }
  };
  window.openVoiceTrain.__play = function () { play(); };
  window.openVoiceTrain.__slow = function () {
    if (!S) return;
    S.slow = !S.slow;
    toast(S.slow ? '🐢 慢速播放' : '正常语速');
    var it = SCENES[S.scene].lines[S.i];
    if (typeof netSpeak === 'function' && typeof isNativeApp === 'function' && isNativeApp() && netSpeak(it.en, 'en-US', 0.7, null)) return;  // App 内网络 TTS 慢速（playbackRate）
    if (typeof nativeSpeak === 'function' && nativeSpeak(it.en, 'en-US', 0.7)) return;  // Android App 原生 TTS 慢速
    if (typeof window.speakUtterance === 'function' && typeof window.__speakRate === 'undefined') {
      // 用临时慢速
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(it.en);
        u.lang = 'en-US'; u.rate = 0.7;
        window.speechSynthesis.speak(u);
      } catch (e) { }
    } else if (typeof speakUtterance === 'function') speakUtterance(it.en, 'en-US');
  };
  window.openVoiceTrain.__en = function () { if (!S) return; S.showEn = !S.showEn; render(); };
  window.openVoiceTrain.__zh = function () { if (!S) return; S.showZh = !S.showZh; render(); };
  window.openVoiceTrain.__rec = function () {
    if (!S || typeof startEnglishRecognition !== 'function') { toast('当前浏览器/页面不支持语音识别，请用文本跟读'); return; }
    var it = SCENES[S.scene].lines[S.i];
    var btn = document.getElementById('vpRec');
    toast('🎤 请读出这句英文…');
    startEnglishRecognition(function () { }, function (finalText) {
      var el = document.getElementById('vpEval'); if (!el) return;
      var ev = (typeof evaluateSpeaking === 'function') ? evaluateSpeaking(finalText, it.en) : { score: 0, tips: ['（无评分模块）'] };
      el.innerHTML = '<div style="font-weight:700;color:var(--primary);font-size:18px">综合得分 ' + (ev.score || 0) + '</div>' +
        '<div style="color:var(--text-secondary);margin:6px 0">你说了：' + esc(finalText) + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted)">参考答案：' + esc(it.en) + '</div>';
      if (ev.tips && ev.tips.length) el.innerHTML += '<div style="margin-top:6px;font-size:12px;color:#666">' + ev.tips.map(function (t) { return '• ' + t; }).join('<br>') + '</div>';
    }, function () { });
  };
  // 启动听力三类题型增量合并（失败静默回退内置 3 场景）
  try { loadListeningExt(); } catch (e) {}
})();
