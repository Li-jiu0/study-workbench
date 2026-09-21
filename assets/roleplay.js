/* =====================================================================
   roleplay.js —— 角色扮演训练（纯静态、可复用挂载资产）
   ---------------------------------------------------------------------
   把「表达」页内「角色扮演训练」的完整实现（DOM 结构 + 样式 +
   交互逻辑 + 剧本对话数据）无损抽取为独立资产，便于搬到其它页面
   （如 i人团伙页面）内联挂载，而不再依赖 app.js 里的同名函数。

   设计约定（对齐 voiceplayer.js）：
   - IIFE 包裹 + window.__ROLEPLAY__ 幂等守卫，重复引入只生效一次。
   - 样式由 css() 动态注入 <style id="rpStyle">，对齐全站设计令牌
     （--card/--border/--primary/--primary-light/--text/--text-secondary/
      --radius/--shadow，兼容 --g2/--success），不依赖任何页面级样式。
   - 对外暴露：
       window.mountRolePlay(containerEl, options)  —— 给一个容器 div 即可渲染整套界面
       window.openRolePlay(options)                —— 快捷打开（兼容旧 openRoleplayDemo 行为）
   - 功能 id 语义不变：rpCurrent / rpDialogue / rpInput / rpEval。
   - 严禁 alert/confirm/prompt；依赖宿主 app.js 提供的 showToast / navigateTo。
   ===================================================================== */
(function () {
  'use strict';
  if (window.__ROLEPLAY__) return;
  window.__ROLEPLAY__ = 1;

  /* ------------------------- 剧本/对话数据 ------------------------- */
  // 5 轮 NPC 台词（原 app.js RP_DIALOGUES，逐字保留）
  var RP_DIALOGUES = [
    '哎呀，那个数据啊……我这两天太忙了，还没弄完呢，你再等等呗。',
    '唉，主要是那个系统导出数据特别慢，我也没办法啊。要不你先用旧数据顶着？',
    '行吧行吧，我尽量今天弄完。不过你得帮我跟领导说一声，不是我不想弄，是系统太慢。',
    '对了，弄完我直接发你微信？还是放共享文件夹里？',
    '好的，那就这样。谢谢你啊，改天请你喝奶茶。'
  ];
  var RP_TOTAL = RP_DIALOGUES.length; // 5 轮

  /* ------------------------- 样式注入 ------------------------- */
  function css() {
    if (document.getElementById('rpStyle')) return;
    var c =
      '.rp-app .rp-topbar{display:flex;align-items:center;gap:12px;margin-bottom:16px}' +
      '.rp-app .rp-back{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 14px;border-radius:10px;font-size:13px;cursor:pointer}' +
      '.rp-app .rp-back:hover{border-color:var(--primary);color:var(--primary)}' +
      '.rp-app .rp-topbar b{flex:1;font-size:18px;font-weight:800;color:var(--text)}' +
      '.rp-app .rp-mode-tag{font-size:12px;padding:3px 10px;border-radius:20px;background:var(--primary-light);color:var(--primary);font-weight:600}' +
      '.rp-app .player-container{max-width:760px;margin:0 auto;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:18px;box-shadow:0 10px 30px -18px rgba(0,0,0,.25)}' +
      '.rp-app .player-header{display:flex;align-items:center;justify-content:space-between;padding:0 0 12px;border-bottom:1px solid var(--border);margin-bottom:14px}' +
      '.rp-app .player-title{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:800;color:var(--text)}' +
      '.rp-app .player-title .nav-icon{color:var(--primary)}' +
      '.rp-app .player-progress-text{font-size:var(--xt-font-sm);color:var(--text-secondary)}' +
      '.rp-app .player-stage{display:flex;flex-direction:column;align-items:center;gap:16px}' +
      '.rp-app .player-chars{display:flex;justify-content:center;gap:32px;width:100%}' +
      '.rp-app .player-dialogue{width:100%;max-width:520px}' +
      '.rp-app .rp-tip{display:flex;align-items:flex-start;gap:8px;width:100%;max-width:520px;padding:10px 14px;background:var(--primary-light);border-radius:12px;font-size:var(--xt-font-sm);color:var(--text-secondary);line-height:1.6}' +
      '.rp-app .rp-tip .nav-icon{flex:none;color:var(--primary);margin-top:2px}' +
      '.rp-app .player-controls{display:flex;align-items:center;gap:10px;width:100%;max-width:520px;margin:4px auto 0}' +
      '.rp-app .player-btn{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--bg);border:1px solid var(--border);cursor:pointer;transition:border-color .15s}' +
      '.rp-app .player-btn:hover{border-color:var(--primary)}' +
      '.rp-app .player-btn.play{background:var(--primary);border-color:var(--primary);color:#fff;width:48px;height:48px}' +
      '.rp-app .player-progress{flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden}' +
      '.rp-app .player-progress-fill{height:100%;background:linear-gradient(135deg,var(--primary),var(--g2,var(--primary)));border-radius:3px}' +
      '.rp-app .player-time{font-size:12px;color:var(--text-secondary);white-space:nowrap}' +
      '.rp-app .player-record-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 22px;border-radius:12px;border:1px dashed var(--primary);background:var(--primary-light);color:var(--primary);font-size:14px;font-weight:600;cursor:pointer}' +
      '.rp-app .eval-panel{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px;max-width:760px;margin:16px auto 0}' +
      '.rp-app .eval-title{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:800;color:var(--text);margin-bottom:14px}' +
      '.rp-app .eval-title .nav-icon{color:var(--primary)}' +
      '.rp-app .eval-scores{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:14px}' +
      '.rp-app .eval-score-item{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:10px 12px}' +
      '.rp-app .eval-score-label{font-size:12px;color:var(--text-secondary);margin-bottom:6px}' +
      '.rp-app .eval-stars{display:flex;gap:2px;color:#F5A623}' +
      '.rp-app .eval-feedback{border-radius:12px;padding:12px 14px;margin-bottom:10px}' +
      '.rp-app .eval-feedback.good{background:rgba(82,196,26,.1)}' +
      '.rp-app .eval-feedback.tip{background:var(--primary-light)}' +
      '.rp-app .eval-feedback-title{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;margin-bottom:6px}' +
      '.rp-app .eval-feedback.good .eval-feedback-title{color:var(--success,#52C41A)}' +
      '.rp-app .eval-feedback.tip .eval-feedback-title{color:var(--primary)}' +
      '.rp-app .eval-feedback-content{font-size:13px;line-height:1.7;color:var(--text-secondary)}' +
      '.rp-app .eval-reference{background:var(--bg);border:1px dashed var(--border);border-radius:12px;padding:12px 14px;margin-bottom:6px}' +
      '.rp-app .eval-reference-title{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--primary);margin-bottom:6px}' +
      '.rp-app .eval-reference-text{font-size:13px;line-height:1.7;color:var(--text-secondary)}' +
      /* 角色 SVG 容器尺寸（原页面级 .character 等由 common.css 提供，这里兜底行高/布局） */
      '.rp-app .player-chars .character-container{display:flex;flex-direction:column;align-items:center;gap:6px}' +
      '.rp-app .player-chars .char-name{font-size:13px;color:var(--text-secondary);font-weight:600}' +
      '.rp-app .char-svg{width:120px;height:140px;display:block}';
    var st = document.createElement('style');
    st.id = 'rpStyle';
    st.textContent = c;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ------------------------- 图标补绘 ------------------------- */
  function paintIcons() {
    if (typeof window.lucideAutoRender === 'function') {
      try { window.lucideAutoRender(); } catch (e) {}
    }
  }

  /* ------------------------- 转义 ------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------- 交互逻辑（原 app.js 角色扮演体验段，逐字保留语义） ------------------------- */
  var rpRound = 1;
  var rpRecording = false;
  // 当前挂载配置（backTo/onBack 由 mountRolePlay 的 options 决定，默认回落到表达页 comm）
  var RP_OPTS = { backTo: 'comm', onBack: null };

  /* 返回：优先自定义回调，其次宿主 navigateTo(target)，都没有则静默降级（严禁 alert） */
  function rpGoBack(target, onBack) {
    if (typeof onBack === 'function') { try { onBack(); return; } catch (e) {} }
    if (typeof window.navigateTo === 'function') {
      try { window.navigateTo(target || 'comm'); return; } catch (e) {}
    }
    if (typeof window.showToast === 'function') { try { window.showToast('已返回'); } catch (e) {} }
  }

  // 旧 openRoleplayDemo 的等价实现；window.openRolePlay 的底层
  function openRoleplayDemo() {
    // 宿主页仍保留 #page-roleplay-demo 时走原来的「切页」行为；
    // 该页已下线（如表达页删除菜单后）则退化为就近挂载到 #roleplayMount。
    if (document.getElementById('page-roleplay-demo')) {
      if (typeof window.navigateTo === 'function') {
        try { window.navigateTo('roleplay-demo'); return; } catch (e) {}
      }
    }
    window.openRolePlay();
  }

  function toggleRpVoice() {
    var btn = document.getElementById('rpVoiceBtn');
    var input = document.getElementById('rpInput');
    if (!btn) { // 体验版无语音按钮：降级为提示（与原页面 record-btn 行为一致）
      if (typeof showToast === 'function') showToast('语音输入功能开发中，体验版请用文字输入');
      return;
    }
    if (rpRecording) {
      if (typeof stopRecognition === 'function') stopRecognition();
      return;
    }
    rpRecording = true;
    btn.classList.add('recording');
    btn.innerHTML = '🔴 正在听...';
    if (typeof showToast === 'function') showToast('开始语音输入，请说话...');
    if (typeof startChineseRecognition === 'function') {
      startChineseRecognition(
        function (final, interim) { if (input) input.value = final + interim; },
        function (finalText) {
          rpRecording = false;
          btn.classList.remove('recording');
          btn.innerHTML = '🎤 语音输入';
          if (finalText && input) { input.value = finalText; if (typeof showToast === 'function') showToast('语音识别完成！'); }
        },
        function () {
          rpRecording = false;
          btn.classList.remove('recording');
          btn.innerHTML = '🎤 语音输入';
        }
      );
    }
  }

  function submitRoleplay() {
    var input = document.getElementById('rpInput');
    var val = input ? input.value.trim() : '';
    if (!val) { if (typeof showToast === 'function') showToast('请输入或语音输入你的回答'); return; }
    var ev = document.getElementById('rpEval');
    if (ev) ev.style.display = 'block';
    if (ev && ev.scrollIntoView) ev.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof showToast === 'function') showToast('评定完成！');
  }

  function nextRoleplayRound() {
      rpRound++;
    if (rpRound > RP_TOTAL) {
      if (typeof showToast === 'function') showToast('场景完成！总评报告生成中...');
      setTimeout(function () { rpGoBack(RP_OPTS.backTo, RP_OPTS.onBack); }, 1500);
      return;
    }
    var cur = document.getElementById('rpCurrent');
    if (cur) cur.textContent = rpRound;
    var ev = document.getElementById('rpEval');
    if (ev) ev.style.display = 'none';
    var input = document.getElementById('rpInput');
    if (input) input.value = '';
    var dialogue = document.getElementById('rpDialogue');
    if (dialogue) dialogue.innerHTML = '<div class="chat-bubble ai">' + esc(RP_DIALOGUES[rpRound - 1]) + '</div>';
    if (typeof showToast === 'function') showToast('第 ' + rpRound + ' 轮');
  }

  /* ------------------------- 模板（原 #page-roleplay-demo 内的 DOM，逐字保留） ------------------------- */
  function template(opts) {
    opts = opts || {};
    var firstLine = RP_DIALOGUES[0];
    return '' +
    '<div class="rp-app">' +
      '<div class="rp-topbar">' +
        '<button class="rp-back" type="button" data-rp-back="' + esc(opts.backTo || 'comm') + '">← 返回</button>' +
        '<b>角色扮演训练</b>' +
        '<span class="rp-mode-tag">体验版 · 中级</span>' +
      '</div>' +
      '<div class="player-container">' +
        '<div class="player-header">' +
          '<div class="player-title"><span class="nav-icon" data-icon="briefcase" data-icon-size="16"></span>同事拖延催进度 · 中级</div>' +
          '<div class="player-progress-text">第 <span id="rpCurrent">1</span> / ' + RP_TOTAL + ' 轮</div>' +
        '</div>' +
        '<div class="player-stage">' +
          '<div class="player-chars">' +
            '<div class="character-container">' +
              '<div class="character" id="charColleague">' +
                '<svg viewBox="0 0 120 140" class="char-svg">' +
                  '<path d="M88 100 Q108 95 106 78 Q104 65 92 68" fill="none" stroke="#FF9F68" stroke-width="10" stroke-linecap="round"/>' +
                  '<path d="M88 100 Q108 95 106 78 Q104 65 92 68" fill="none" stroke="#2D3436" stroke-width="3" stroke-linecap="round"/>' +
                  '<ellipse cx="60" cy="105" rx="30" ry="26" fill="#FF9F68" stroke="#2D3436" stroke-width="3"/>' +
                  '<ellipse cx="60" cy="110" rx="18" ry="16" fill="#FFF3E0"/>' +
                  '<ellipse cx="44" cy="128" rx="9" ry="7" fill="#FF9F68" stroke="#2D3436" stroke-width="3"/>' +
                  '<ellipse cx="76" cy="128" rx="9" ry="7" fill="#FF9F68" stroke="#2D3436" stroke-width="3"/>' +
                  '<path d="M32 35 L22 8 L48 24 Z" fill="#FF9F68" stroke="#2D3436" stroke-width="3" stroke-linejoin="round"/>' +
                  '<path d="M88 35 L98 8 L72 24 Z" fill="#FF9F68" stroke="#2D3436" stroke-width="3" stroke-linejoin="round"/>' +
                  '<path d="M34 30 L28 14 L42 24 Z" fill="#FFCC80"/>' +
                  '<path d="M86 30 L92 14 L78 24 Z" fill="#FFCC80"/>' +
                  '<circle cx="60" cy="52" r="34" fill="#FF9F68" stroke="#2D3436" stroke-width="3"/>' +
                  '<ellipse cx="60" cy="60" rx="20" ry="16" fill="#FFF3E0"/>' +
                  '<ellipse cx="36" cy="60" rx="6" ry="4" fill="#FFB5B5" opacity="0.7"/>' +
                  '<ellipse cx="84" cy="60" rx="6" ry="4" fill="#FFB5B5" opacity="0.7"/>' +
                  '<g class="char-eyes">' +
                    '<ellipse cx="47" cy="50" rx="6" ry="8" fill="#2D3436"/>' +
                    '<ellipse cx="73" cy="50" rx="6" ry="8" fill="#2D3436"/>' +
                    '<circle cx="49" cy="47" r="2" fill="#fff"/>' +
                    '<circle cx="75" cy="47" r="2" fill="#fff"/>' +
                  '</g>' +
                  '<ellipse cx="42" cy="40" rx="5" ry="3" fill="#FFF3E0"/>' +
                  '<ellipse cx="78" cy="40" rx="5" ry="3" fill="#FFF3E0"/>' +
                  '<ellipse cx="60" cy="58" rx="5" ry="4" fill="#2D3436"/>' +
                  '<ellipse cx="58.5" cy="56.5" rx="1.2" ry="0.8" fill="#5D4037"/>' +
                  '<path class="char-mouth-svg" d="M52 64 Q60 72 68 64" stroke="#2D3436" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
                  '<ellipse cx="60" cy="69" rx="4" ry="3" fill="#FF8A80"/>' +
                '</svg>' +
              '</div>' +
              '<div class="char-name">小王（柴犬）</div>' +
            '</div>' +
            '<div class="character-container">' +
              '<div class="character" id="charRpUser">' +
                '<svg viewBox="0 0 120 140" class="char-svg">' +
                  '<ellipse cx="60" cy="105" rx="32" ry="28" fill="#A1887F" stroke="#2D3436" stroke-width="3"/>' +
                  '<ellipse cx="60" cy="110" rx="20" ry="18" fill="#D7CCC8"/>' +
                  '<ellipse cx="42" cy="128" rx="10" ry="8" fill="#A1887F" stroke="#2D3436" stroke-width="3"/>' +
                  '<ellipse cx="78" cy="128" rx="10" ry="8" fill="#A1887F" stroke="#2D3436" stroke-width="3"/>' +
                  '<circle cx="32" cy="26" r="12" fill="#A1887F" stroke="#2D3436" stroke-width="3"/>' +
                  '<circle cx="88" cy="26" r="12" fill="#A1887F" stroke="#2D3436" stroke-width="3"/>' +
                  '<circle cx="32" cy="26" r="6" fill="#D7CCC8"/>' +
                  '<circle cx="88" cy="26" r="6" fill="#D7CCC8"/>' +
                  '<circle cx="60" cy="52" r="34" fill="#A1887F" stroke="#2D3436" stroke-width="3"/>' +
                  '<ellipse cx="60" cy="58" rx="22" ry="18" fill="#D7CCC8"/>' +
                  '<ellipse cx="38" cy="60" rx="6" ry="4" fill="#FFB5B5" opacity="0.7"/>' +
                  '<ellipse cx="82" cy="60" rx="6" ry="4" fill="#FFB5B5" opacity="0.7"/>' +
                  '<g class="char-eyes">' +
                    '<ellipse cx="48" cy="50" rx="6" ry="8" fill="#2D3436"/>' +
                    '<ellipse cx="72" cy="50" rx="6" ry="8" fill="#2D3436"/>' +
                    '<circle cx="50" cy="47" r="2" fill="#fff"/>' +
                    '<circle cx="74" cy="47" r="2" fill="#fff"/>' +
                  '</g>' +
                  '<ellipse cx="60" cy="60" rx="6" ry="4.5" fill="#5D4037" stroke="#2D3436" stroke-width="2"/>' +
                  '<ellipse cx="58" cy="58.5" rx="1.5" ry="1" fill="#8D6E63"/>' +
                  '<path class="char-mouth-svg" d="M54 66 Q60 72 66 66" stroke="#2D3436" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
                  '<line x1="60" y1="64.5" x2="60" y2="67" stroke="#2D3436" stroke-width="1.5"/>' +
                '</svg>' +
              '</div>' +
              '<div class="char-name">你（小熊）</div>' +
            '</div>' +
          '</div>' +
          '<div class="player-dialogue" id="rpDialogue">' +
            '<div class="chat-bubble ai">' + esc(firstLine) + '</div>' +
          '</div>' +
          '<div class="rp-tip">' +
            '<span class="nav-icon" data-icon="lightbulb" data-icon-size="15"></span>' +
            '<span><strong>提示：</strong>先共情对方的忙碌，再表达你的紧迫性，最后给出解决方案</span>' +
          '</div>' +
        '</div>' +
        '<div class="player-controls">' +
          '<div class="player-btn" onclick="showToast(\'上一轮\')" title="上一轮"><span class="nav-icon" data-icon="chevron-left" data-icon-size="18"></span></div>' +
          '<div class="player-btn play" onclick="showToast(\'播放对话\')" title="播放对话"><span class="nav-icon" data-icon="play" data-icon-size="18"></span></div>' +
          '<div class="player-btn" onclick="showToast(\'下一轮\')" title="下一轮"><span class="nav-icon" data-icon="chevron-right" data-icon-size="18"></span></div>' +
          '<div class="player-progress"><div class="player-progress-fill" style="width:20%"></div></div>' +
          '<div class="player-time">第1轮</div>' +
        '</div>' +
      '</div>' +
      '<div style="text-align:center;margin:20px 0">' +
        '<button class="player-record-btn" onclick="showToast(\'语音输入功能开发中，体验版请用文字输入\')">' +
          '<span class="nav-icon" data-icon="mic" data-icon-size="15"></span>语音回答' +
        '</button>' +
      '</div>' +
      '<div class="card">' +
        '<div class="form-group">' +
          '<div class="form-label">或输入文字回答：</div>' +
          '<textarea class="form-input" rows="3" placeholder="输入你的回答..." id="rpInput"></textarea>' +
        '</div>' +
        '<button class="btn btn-primary btn-block" onclick="submitRoleplay()">提交回答</button>' +
      '</div>' +
      '<div id="rpEval" style="display:none">' +
        '<div class="eval-panel">' +
          '<div class="eval-title"><span class="nav-icon" data-icon="chart-bar" data-icon-size="16"></span>本轮评定</div>' +
          '<div class="eval-scores">' +
            '<div class="eval-score-item"><div class="eval-score-label">共情度</div><div class="eval-stars"><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span></div></div>' +
            '<div class="eval-score-item"><div class="eval-score-label">策略性</div><div class="eval-stars"><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span></div></div>' +
            '<div class="eval-score-item"><div class="eval-score-label">逻辑清晰</div><div class="eval-stars"><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span></div></div>' +
            '<div class="eval-score-item"><div class="eval-score-label">用词得体</div><div class="eval-stars"><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span></div></div>' +
            '<div class="eval-score-item"><div class="eval-score-label">情绪稳定</div><div class="eval-stars"><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span></div></div>' +
            '<div class="eval-score-item"><div class="eval-score-label">目标达成</div><div class="eval-stars"><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span><span class="nav-icon" data-icon="star" data-icon-size="14"></span></div></div>' +
          '</div>' +
          '<div class="eval-feedback good">' +
            '<div class="eval-feedback-title"><span class="nav-icon" data-icon="check" data-icon-size="14"></span>做得好</div>' +
            '<div class="eval-feedback-content">明确表达了时间紧迫性（"明天就截止了"），让对方知道事情的严重性。</div>' +
          '</div>' +
          '<div class="eval-feedback tip">' +
            '<div class="eval-feedback-title"><span class="nav-icon" data-icon="lightbulb" data-icon-size="14"></span>改进建议</div>' +
            '<div class="eval-feedback-content">开头可以先共情对方（"我知道你最近忙"），避免直接指责引起抵触；可以给出具体解决方案（"要不要我帮你一起弄"），把对方拉到同一战线。</div>' +
          '</div>' +
          '<div class="eval-reference">' +
            '<div class="eval-reference-title"><span class="nav-icon" data-icon="lightbulb" data-icon-size="14"></span>参考回答</div>' +
            '<div class="eval-reference-text">"小王，我知道你最近手头事多，辛苦了。那个数据我这边确实等着用，明天就是截止日期了。你看现在主要卡在哪了？要不要我帮你一起弄？争取今天能出来。"</div>' +
          '</div>' +
          '<div style="display:flex;gap:10px;margin-top:14px">' +
            '<button class="btn btn-secondary btn-sm" onclick="showToast(\'用参考回答\')">用参考回答</button>' +
            '<button class="btn btn-primary btn-sm" onclick="nextRoleplayRound()">下一轮 →</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ------------------------- 对外：挂载入口 ------------------------- */
  /**
   * 把「角色扮演训练」整套界面渲染进一个容器。
   * @param {HTMLElement|string} containerEl 容器元素或其 id
   * @param {Object} [options]
   *        options.backTo  {string}   返回按钮/结束回跳的页面 id，默认 'comm'
   *        options.onBack  {Function} 自定义返回回调（优先级高于 backTo）
   * @returns {HTMLElement|null} 渲染出的 .rp-app 根节点
   */
  window.mountRolePlay = function (containerEl, options) {
    css();
    var el = containerEl;
    if (typeof containerEl === 'string') el = document.getElementById(containerEl);
    if (!el) return null;
    options = options || {};
    RP_OPTS.backTo = options.backTo || 'comm';
    RP_OPTS.onBack = typeof options.onBack === 'function' ? options.onBack : null;
    rpRound = 1; // 每次挂载重置到第 1 轮
    el.innerHTML = template(RP_OPTS);
    // 返回按钮：用事件委托绑定，避免把回调拼进内联 onclick
    var backBtn = el.querySelector('[data-rp-back]');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        rpGoBack(this.getAttribute('data-rp-back'), RP_OPTS.onBack);
      });
    }
    paintIcons();
    return el.querySelector('.rp-app') || el.firstElementChild || el;
  };

  /* ------------------------- 对外：快捷打开（兼容旧 openRoleplayDemo） ------------------------- */
  /**
   * 快捷入口：挂载到 options.container（元素或 id），缺省取 #roleplayMount。
   * @param {Object} [options] 同 mountRolePlay，另可带 options.container
   * @returns {HTMLElement|null}
   */
  window.openRolePlay = function (options) {
    options = options || {};
    var el = options.container || document.getElementById('roleplayMount');
    return window.mountRolePlay(el, options);
  };
  // 兼容旧的全局名，避免其它入口（如菜单卡 onclick="openRoleplayDemo()"）失效
  window.openRoleplayDemo = openRoleplayDemo;
  // 交互函数挂到 window，供模板内联 onclick 调用
  window.submitRoleplay = submitRoleplay;
  window.nextRoleplayRound = nextRoleplayRound;
  window.toggleRpVoice = toggleRpVoice;

  /* ------------------------- 自举：表达页内置锚点 #roleplayMount 自动挂载 ------------------------- */
  function autoBoot() {
    var m = document.getElementById('roleplayMount');
    if (m) window.mountRolePlay(m);
  }
  if (document.readyState !== 'loading') autoBoot();
  else document.addEventListener('DOMContentLoaded', autoBoot);
})();
