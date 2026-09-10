/* =====================================================================
   quest.js —— 穿越！英语强制学习系统（闯关模式）
   ---------------------------------------------------------------------
   基于现有场景数据，做沉浸式关卡学习：剧情→逐句跟读→语音评分→通关解锁。
   发音：AndroidTTS.netTts（有道/百度）；评分：系统 SpeechRecognizer 文本对比。
   进度：localStorage study_workbench_quest_progress
   用法：openQuest()
   ===================================================================== */
(function () {
  'use strict';
  if (window.__QUEST__) return;
  window.__QUEST__ = 1;

  // ===== 关卡数据（复用 voiceplayer.js 的场景，加剧情包装） =====
  var LEVELS = [
    {
      id: 'coffee', title: '第1关 · 咖啡店点单', scene: '☕',
      story: '你穿越到了一个平行世界。在这里，只会中文会被系统惩罚。第一关：在咖啡店点单。如果你不能用英文完成点单，系统将强制你重复 100 遍。',
      lines: [
        { en: 'Hi, what can I get for you today?', zh: '你好，今天想喝点什么？' },
        { en: "I'd like a medium hot latte with less sugar, please.", zh: '我想要一杯中杯热拿铁，少糖。' },
        { en: 'Sure, anything else?', zh: '好的，还要别的吗？' },
        { en: "And I'll also have a chocolate muffin, please.", zh: '再来一个巧克力麦芬，谢谢。' },
        { en: 'Okay, that is a medium latte and a muffin. For here or to go?', zh: '好的，一杯中杯拿铁和麦芬。带走还是堂食？' },
        { en: 'To go, please. How much is that?', zh: '带走，谢谢。多少钱？' }
      ]
    },
    {
      id: 'airport', title: '第2关 · 机场值机', scene: '✈️',
      story: '系统提示：检测到你即将出国旅行。第二关：机场值机。用英文办理登机手续，否则你将被留在机场。',
      lines: [
        { en: 'Good morning. May I see your passport, please?', zh: '早上好，请出示您的护照。' },
        { en: 'Here you are. I would like a window seat if possible.', zh: '给你，如果可以我想要靠窗的座位。' },
        { en: 'No problem. Do you have any checked baggage?', zh: '没问题，有需要托运的行李吗？' },
        { en: 'Yes, one suitcase. And is this flight on time?', zh: '有一个行李箱。这班航班准点吗？' },
        { en: 'It is on schedule. Here is your boarding pass, gate 22.', zh: '准点。这是你的登机牌，22 号登机口。' },
        { en: 'Thank you very much. Have a nice trip!', zh: '非常感谢，祝您旅途愉快！' }
      ]
    },
    {
      id: 'restaurant', title: '第3关 · 餐厅点餐', scene: '🍽️',
      story: '系统提示：你饿了。第三关：餐厅点餐。如果你不能用英文点餐，系统将剥夺你的晚餐。',
      lines: [
        { en: 'Welcome! A table for two?', zh: '欢迎光临，两位吗？' },
        { en: 'Yes, please. Could we sit by the window?', zh: '是的，能坐靠窗的位置吗？' },
        { en: 'Of course. Here are the menus.', zh: '当然可以，这是菜单。' },
        { en: 'What do you recommend? I am a little hungry.', zh: '你有什么推荐？我有点饿了。' },
        { en: 'Our grilled salmon is quite popular.', zh: '我们的烤三文鱼很受欢迎。' },
        { en: 'Sounds good. I will have that, with a side salad.', zh: '听起来不错，就要这个，外加一份沙拉。' }
      ]
    },
    {
      id: 'hotel', title: '第4关 · 酒店入住', scene: '🏨',
      story: '系统提示：深夜，你需要一个房间。第四关：酒店入住。用英文办理入住，否则今晚睡大街。',
      lines: [
        { en: 'Good evening. How can I help you?', zh: '晚上好，有什么可以帮您？' },
        { en: 'I have a reservation under the name Zhang Wei.', zh: '我用张伟的名字预订了房间。' },
        { en: 'Let me check. Yes, a single room for two nights.', zh: '我查一下，是的，单人间两晚。' },
        { en: 'Great. What time is breakfast served?', zh: '好的，早餐几点供应？' },
        { en: 'From 6:30 to 9:30 on the second floor.', zh: '6:30 到 9:30，在二楼。' },
        { en: 'Perfect. Here is your key card, room 805.', zh: '很好。这是你的房卡，805 房。' }
      ]
    },
    {
      id: 'shopping', title: '第5关 · 购物退换', scene: '🛍️',
      story: '系统提示：你买了件不合适的衣服。第五关：购物退换。用英文完成退货流程，否则损失全额。',
      lines: [
        { en: 'Hi, I would like to return this shirt.', zh: '你好，我想退这件衬衫。' },
        { en: 'Do you have the receipt with you?', zh: '您带小票了吗？' },
        { en: 'Yes, here it is. I bought it yesterday.', zh: '带了，在这。我昨天买的。' },
        { en: 'Is there anything wrong with it?', zh: '是有什么问题吗？' },
        { en: 'It is too small for me, actually.', zh: '其实对我来说太小了。' },
        { en: 'No problem. I will refund it to your card.', zh: '没问题，我会退款到您的卡里。' }
      ]
    },
    {
      id: 'street', title: '第6关 · 问路', scene: '🗺️',
      story: '系统提示：你迷路了。第六关：问路。用英文找到地铁站，否则系统将永久删除你的导航。',
      lines: [
        { en: 'Excuse me, how can I get to the subway station?', zh: '打扰一下，去地铁站怎么走？' },
        { en: 'Go straight and turn left at the second crossing.', zh: '直走，在第二个路口左转。' },
        { en: 'Is it far from here?', zh: '离这儿远吗？' },
        { en: 'About a ten-minute walk. You cannot miss it.', zh: '步行大约十分钟，你不会错过的。' },
        { en: 'Great, thank you so much.', zh: '太好了，非常感谢。' },
        { en: "You are welcome. Have a nice day!", zh: '不客气，祝您愉快！' }
      ]
    }
  ];

  var S = null;
  var PROGRESS_KEY = 'study_workbench_quest_progress';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }

  function getProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { }
  }
  function isUnlocked(levelIdx) {
    if (levelIdx === 0) return true;
    var p = getProgress();
    return !!p[LEVELS[levelIdx - 1].id];
  }
  function isCompleted(levelIdx) {
    var p = getProgress();
    return !!p[LEVELS[levelIdx].id];
  }

  // ===== 评分：语音识别文本与标准文本的相似度 =====
  function scoreSpeaking(recognized, standard) {
    if (!recognized) return 0;
    var r = recognized.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    var s = standard.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (!r || !s) return 0;
    // 简单词级匹配：标准文本中的词在识别文本中出现的比例
    var sWords = s.split(/\s+/).filter(Boolean);
    var rWords = r.split(/\s+/).filter(Boolean);
    var hit = 0;
    rWords.forEach(function (w) {
      if (sWords.indexOf(w) >= 0) hit++;
    });
    return Math.round((hit / sWords.length) * 100);
  }

  // ===== CSS =====
  function css() {
    if (document.getElementById('questStyle')) return;
    var c = '.qst-mask{position:fixed;inset:0;background:#0a0a1a;z-index:2500;display:flex;flex-direction:column;color:#e0e0ff;padding:20px 16px 10px;overflow:hidden;font-family:\'Segoe UI\',\'PingFang SC\',sans-serif}'
      +'.qst-grid{position:absolute;inset:0;opacity:.08;background-image:linear-gradient(rgba(0,255,255,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,255,.3) 1px,transparent 1px);background-size:30px 30px}'
      +'.qst-top{display:flex;align-items:center;gap:8px;position:relative;z-index:1}.qst-top b{flex:1;font-size:16px;color:#0ff;text-shadow:0 0 10px rgba(0,255,255,.5)}'
      +'.qst-x{background:rgba(255,255,255,.1);border:1px solid rgba(0,255,255,.3);color:#0ff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:14px}'
      +'.qst-body{flex:1;overflow-y:auto;position:relative;z-index:1;padding:10px 0}'
      // 关卡选择
      +'.qst-stats{display:flex;gap:10px;margin-bottom:14px}.qst-stat{flex:1;background:rgba(0,255,255,.08);border:1px solid rgba(0,255,255,.2);border-radius:10px;padding:10px;text-align:center}'
      +'.qst-stat .num{font-size:22px;font-weight:800;color:#0ff}.qst-stat .lbl{font-size:11px;color:#8899aa;margin-top:2px}'
      +'.qst-level{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.05);border:1px solid rgba(0,255,255,.15);border-radius:14px;padding:14px;margin-bottom:10px;cursor:pointer;transition:all .2s}'
      +'.qst-level:active{transform:scale(.98)}.qst-level.locked{opacity:.4;cursor:not-allowed}.qst-level.done{border-color:rgba(0,255,136,.5)}'
      +'.qst-licon{width:48px;height:48px;border-radius:12px;background:rgba(0,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0}'
      +'.qst-linfo{flex:1;min-width:0}.qst-ltitle{font-size:15px;font-weight:700;color:#e0e0ff}.qst-ldesc{font-size:12px;color:#8899aa;margin-top:3px}'
      +'.qst-lbadge{font-size:11px;padding:3px 8px;border-radius:6px;flex-shrink:0}'
      +'.qst-badge-done{background:rgba(0,255,136,.15);color:#0f8}.qst-badge-lock{background:rgba(255,255,255,.1);color:#667}'
      // 关卡内
      +'.qst-story{background:rgba(0,255,255,.06);border-left:3px solid #0ff;border-radius:0 10px 10px 0;padding:12px 14px;margin-bottom:14px;font-size:13px;line-height:1.7;color:#cce}'
      +'.qst-progress{height:6px;background:rgba(255,255,255,.1);border-radius:3px;margin-bottom:14px;overflow:hidden}.qst-progress .bar{height:100%;background:linear-gradient(90deg,#0ff,#0f8);border-radius:3px;transition:width .3s}'
      +'.qst-line-card{background:rgba(255,255,255,.06);border:1px solid rgba(0,255,255,.2);border-radius:16px;padding:20px;margin-bottom:14px;text-align:center}'
      +'.qst-en{font-size:20px;font-weight:700;color:#fff;line-height:1.5}.qst-en.hide{color:transparent;text-shadow:0 0 10px rgba(0,255,255,.4)}'
      +'.qst-zh{font-size:13px;color:#8899aa;margin-top:10px}.qst-zh.hide{display:none}'
      +'.qst-score{font-size:36px;font-weight:800;margin:10px 0}.qst-score.good{color:#0f8}.qst-score.ok{color:#ff0}.qst-score.bad{color:#f44}'
      +'.qst-controls{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px}'
      +'.qst-btn{padding:10px 16px;border-radius:10px;border:1px solid rgba(0,255,255,.4);background:rgba(0,255,255,.1);color:#0ff;font-size:13px;cursor:pointer}'
      +'.qst-btn.solid{background:#0ff;color:#000;font-weight:700}.qst-btn.green{background:#0f8;color:#000;border-color:#0f8;font-weight:700}'
      +'.qst-rec{font-size:12px;color:#8899aa;margin-top:8px}'
      // 通关
      +'.qst-clear{text-align:center;padding:40px 20px}.qst-clear .big{font-size:48px;margin-bottom:10px}.qst-clear .title{font-size:24px;font-weight:800;color:#0ff;text-shadow:0 0 20px rgba(0,255,255,.6);margin-bottom:8px}'
      +'.qst-clear .sub{font-size:14px;color:#8899aa;margin-bottom:20px}'
    ;
    var st = document.createElement('style'); st.id = 'questStyle'; st.textContent = c; (document.head || document.documentElement).appendChild(st);
  }

  function closeQ() { var m = document.getElementById('qstMask'); if (m) m.remove(); S = null; }

  // ===== 渲染关卡选择 =====
  function renderLevelSelect() {
    var done = Object.keys(getProgress()).filter(function (k) { return getProgress()[k]; }).length;
    var html = '<div class="qst-stats">'
      + '<div class="qst-stat"><div class="num">' + LEVELS.length + '</div><div class="lbl">总关卡</div></div>'
      + '<div class="qst-stat"><div class="num">' + done + '</div><div class="lbl">已通关</div></div>'
      + '<div class="qst-stat"><div class="num">' + Math.round(done / LEVELS.length * 100) + '%</div><div class="lbl">完成度</div></div>'
      + '</div>';
    html += '<div style="font-size:13px;color:#8899aa;margin-bottom:12px">💡 每关 6 句对话，逐句跟读，语音识别评分 ≥60 分即通关。</div>';
    LEVELS.forEach(function (lv, i) {
      var unlocked = isUnlocked(i), completed = isCompleted(i);
      html += '<div class="qst-level' + (unlocked ? '' : ' locked') + (completed ? ' done' : '') + '"' + (unlocked ? ' onclick="openQuest.__enter(' + i + ')"' : '') + '>'
        + '<div class="qst-licon">' + lv.scene + '</div>'
        + '<div class="qst-linfo"><div class="qst-ltitle">' + esc(lv.title) + '</div>'
        + '<div class="qst-ldesc">' + lv.lines.length + ' 句对话' + (completed ? ' · 已通关' : '') + '</div></div>'
        + (completed ? '<div class="qst-lbadge qst-badge-done">✓ 已通关</div>' : unlocked ? '<div class="qst-lbadge" style="background:rgba(0,255,255,.15);color:#0ff">▶ 开始</div>' : '<div class="qst-lbadge qst-badge-lock">🔒 未解锁</div>')
        + '</div>';
    });
    document.getElementById('qstBody').innerHTML = html;
  }

  // ===== 进入关卡 =====
  function enterLevel(idx) {
    S = { levelIdx: idx, lineIdx: 0, scores: [], mode: 'learn' };
    renderLevel();
  }

  // ===== 渲染关卡内学习 =====
  function renderLevel() {
    var lv = LEVELS[S.levelIdx], line = lv.lines[S.lineIdx];
    var progress = Math.round(S.lineIdx / lv.lines.length * 100);
    var scoreHtml = '';
    if (S.lastScore != null) {
      var cls = S.lastScore >= 80 ? 'good' : (S.lastScore >= 60 ? 'ok' : 'bad');
      scoreHtml = '<div class="qst-score ' + cls + '">' + S.lastScore + ' 分</div>';
    }
    var html = '<div style="font-size:12px;color:#0ff;margin-bottom:8px">' + esc(lv.title) + '</div>'
      + '<div class="qst-progress"><div class="bar" style="width:' + progress + '%"></div></div>'
      + '<div style="font-size:12px;color:#8899aa;margin-bottom:12px">第 ' + (S.lineIdx + 1) + ' / ' + lv.lines.length + ' 句</div>'
      + '<div class="qst-story">📖 ' + esc(lv.story) + '</div>'
      + '<div class="qst-line-card">'
      + '<div class="qst-en" id="qstEn">' + esc(line.en) + '</div>'
      + '<div class="qst-zh">' + esc(line.zh) + '</div>'
      + scoreHtml
      + '</div>'
      + '<div class="qst-controls">'
      + '<button class="qst-btn" onclick="openQuest.__prev()">⏮ 上一句</button>'
      + '<button class="qst-btn solid" onclick="openQuest.__play()">🔊 播放</button>'
      + '<button class="qst-btn green" onclick="openQuest.__rec()">🎤 跟读评分</button>'
      + '<button class="qst-btn" onclick="openQuest.__next()">下一句 ⏭</button>'
      + '</div>'
      + '<div class="qst-rec">🎤 点击「跟读评分」，读出上面的英文，系统会自动评分</div>';
    document.getElementById('qstBody').innerHTML = html;
  }

  // ===== 通关 =====
  function showClear() {
    var avg = Math.round(S.scores.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, S.scores.length));
    var p = getProgress(); p[LEVELS[S.levelIdx].id] = { avg: avg, time: Date.now() }; saveProgress(p);
    var html = '<div class="qst-clear">'
      + '<div class="big">🎉</div>'
      + '<div class="title">关卡完成！</div>'
      + '<div class="sub">' + esc(LEVELS[S.levelIdx].title) + '<br>平均得分：' + avg + ' 分</div>';
    if (S.levelIdx < LEVELS.length - 1) {
      html += '<button class="qst-btn green" onclick="openQuest.__enter(' + (S.levelIdx + 1) + ')" style="padding:12px 24px;font-size:15px">▶ 进入下一关</button>';
    } else {
      html += '<div style="color:#0f8;font-size:16px;margin:16px 0">🏆 恭喜！你已通关全部关卡！</div>';
    }
    html += '<div style="margin-top:16px"><button class="qst-btn" onclick="openQuest.__back()">返回关卡列表</button></div>'
      + '</div>';
    document.getElementById('qstBody').innerHTML = html;
  }

  // ===== 打开 =====
  function open() {
    css();
    closeQ();
    var m = document.createElement('div'); m.id = 'qstMask'; m.className = 'qst-mask';
    m.innerHTML = '<div class="qst-grid"></div>'
      + '<div class="qst-top"><b>⚡ 穿越！英语强制学习系统</b>'
      + '<button class="qst-x" onclick="openQuest.__close()">✕</button></div>'
      + '<div class="qst-body" id="qstBody"></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) closeQ(); });
    renderLevelSelect();
  }

  // ===== 对外接口 =====
  window.openQuest = function () { open(); };
  window.openQuest.__close = closeQ;
  window.openQuest.__back = function () { S = null; renderLevelSelect(); };
  window.openQuest.__enter = enterLevel;
  window.openQuest.__prev = function () {
    if (!S) return;
    if (S.lineIdx > 0) { S.lineIdx--; S.lastScore = null; renderLevel(); }
  };
  window.openQuest.__next = function () {
    if (!S) return;
    var lv = LEVELS[S.levelIdx];
    if (S.lineIdx < lv.lines.length - 1) { S.lineIdx++; S.lastScore = null; renderLevel(); }
    else { showClear(); }
  };
  window.openQuest.__play = function () {
    if (!S) return;
    var line = LEVELS[S.levelIdx].lines[S.lineIdx];
    if (typeof netSpeak === 'function') netSpeak(line.en, 'en-US', 0.9, null);
    else if (typeof speakUtterance === 'function') speakUtterance(line.en, 'en-US');
  };
  window.openQuest.__rec = function () {
    if (!S) return;
    var line = LEVELS[S.levelIdx].lines[S.lineIdx];
    toast('🎤 请读出这句英文…');
    if (typeof startEnglishRecognition === 'function') {
      startEnglishRecognition(
        function () { },
        function (finalText) {
          var score = scoreSpeaking(finalText, line.en);
          S.lastScore = score;
          S.scores.push(score);
          renderLevel();
          if (score >= 60) toast('✓ ' + score + ' 分，不错！');
          else toast('再试一次，目标 60 分以上');
        },
        function (err) { toast('识别失败：' + (err || '请检查麦克风权限')); }
      );
    } else {
      toast('当前环境不支持语音识别，请用播放跟读');
    }
  };
})();
