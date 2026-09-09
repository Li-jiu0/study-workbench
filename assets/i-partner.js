/* ============================================================
 * i人伙伴团 + 聊天室
 * 不同性格的虚拟伙伴，文字互动，i人专属社交练习场
 * ============================================================ */
(function () {
  'use strict';

  // ========== 伙伴数据 ==========
  const PARTNERS = [
    {
      id: 'rabbit',
      name: '小兔',
      avatar: '🐰',
      color: '#FFB6C1',
      personality: '温柔治愈型',
      traits: ['善解人意', '耐心倾听', '温和回应'],
      desc: '最适合i人的聊天伙伴，永远不会评判你，慢慢陪你练表达',
      greet: '嗨～我是小兔，今天想聊点什么呀？不用紧张，慢慢说就好😊',
      replyStyle: '先共情，再温和地给出建议，语气柔软，多用语气词'
    },
    {
      id: 'fox',
      name: '小狐',
      avatar: '🦊',
      color: '#FF8C42',
      personality: '机智社牛型',
      traits: ['反应快', '幽默风趣', '话题达人'],
      desc: '教你如何接话、抛梗、活跃气氛，跟着e人朋友学社交',
      greet: '嘿！我是小狐，今天咱们练点啥？接话？破冰？还是尬聊拯救？🔥',
      replyStyle: '幽默风趣，反应快，会主动抛话题，教你社交技巧'
    },
    {
      id: 'owl',
      name: '小鸮',
      avatar: '🦉',
      color: '#7B68EE',
      personality: '理性分析型',
      traits: ['逻辑清晰', '深度思考', '客观分析'],
      desc: '帮你分析沟通场景，拆解话术逻辑，让你说得有道理',
      greet: '你好，我是小鸮。需要分析哪个沟通场景？或者想练练逻辑表达？📚',
      replyStyle: '理性客观，逻辑清晰，会分析问题本质，给出结构化建议'
    },
    {
      id: 'cat',
      name: '小猫',
      avatar: '🐱',
      color: '#DDA0DD',
      personality: '傲娇慢热型',
      traits: ['外冷内热', '真实不装', '有边界感'],
      desc: '模拟真实社交中的"难搞"对象，练习如何与不同性格的人相处',
      greet: '……是你啊。有什么事快说，我还要打盹呢。😒（别担心，我只是嘴硬）',
      replyStyle: '傲娇，有点冷淡，但会认真回应，需要你主动破冰'
    },
    {
      id: 'bear',
      name: '小熊',
      avatar: '🐻',
      color: '#DEB887',
      personality: '踏实可靠型',
      traits: ['稳重可靠', '真诚实在', '给安全感'],
      desc: '像老朋友一样踏实，练习深度交流和真诚表达',
      greet: '来啦？坐，喝口水。今天想聊点啥？工作？学习？还是随便唠唠？☕',
      replyStyle: '稳重真诚，像老朋友一样，会认真倾听，给出实在的建议'
    }
  ];

  // ========== 话题库 ==========
  const CHAT_TOPICS = [
    '今天遇到了什么有趣的事？',
    '如果可以拥有一种超能力，你想要什么？',
    '你最近在追什么剧/看什么书？',
    '周末一般怎么安排？',
    '工作/学习中最有成就感的一件事？',
    '如果明天不用上班/上学，你会做什么？',
    '最近学到了什么新东西？',
    '你觉得i人最大的优势是什么？',
    '有没有什么一直想做但还没做的事？',
    '描述一下你理想中的一天'
  ];

  // ========== 状态 ==========
  let currentPartner = null;
  let chatHistory = [];
  let chatCount = 0;

  // ========== 工具函数 ==========
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function toast(msg) {
    if (window.toast) { window.toast(msg); return; }
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:14px';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  // ========== 生成伙伴回复（基于性格的模板回复） ==========
  function generateReply(partner, userMsg) {
    const msg = userMsg.toLowerCase();
    
    // 关键词匹配
    if (msg.includes('你好') || msg.includes('嗨') || msg.includes('hi') || msg.includes('hello')) {
      return getGreetingReply(partner);
    }
    if (msg.includes('谢谢') || msg.includes('感谢')) {
      return getThanksReply(partner);
    }
    if (msg.includes('再见') || msg.includes('拜拜') || msg.includes('bye')) {
      return getByeReply(partner);
    }
    if (msg.includes('紧张') || msg.includes('害怕') || msg.includes('不敢')) {
      return getEncourageReply(partner);
    }
    if (msg.includes('?') || msg.includes('？')) {
      return getQuestionReply(partner, userMsg);
    }
    
    // 默认回复（基于性格）
    return getDefaultReply(partner, userMsg);
  }

  function getGreetingReply(p) {
    const replies = {
      rabbit: '你好呀～看到你真开心！今天心情怎么样？😊',
      fox: '哟！你来啦！今天状态不错嘛，准备好练社交了吗？🔥',
      owl: '你好。今天想练习什么内容？我可以帮你分析。',
      cat: '……又是你啊。算了，既然来了就坐吧。😒',
      bear: '来啦！快坐快坐，今天想聊点啥？☕'
    };
    return replies[p.id] || '你好～';
  }

  function getThanksReply(p) {
    const replies = {
      rabbit: '不用谢啦～能帮到你我也很开心！💕',
      fox: '客气啥！咱们谁跟谁啊！有问题随时找我！😎',
      owl: '不客气。希望我的分析对你有帮助。',
      cat: '……哼，算你有良心。😳',
      bear: '害，这有啥的！朋友之间不就应该互相帮忙嘛！'
    };
    return replies[p.id] || '不客气～';
  }

  function getByeReply(p) {
    const replies = {
      rabbit: '再见啦～记得好好休息，下次再聊哦！👋',
      fox: '走啦？那下次继续练！记住今天学的技巧哦！💪',
      owl: '再见。建议你今天复盘一下我们聊的内容。',
      cat: '……终于走了。（其实有点舍不得）下次别太久才来啊。😤',
      bear: '行，那你先忙！有空再来唠，随时欢迎！'
    };
    return replies[p.id] || '再见～';
  }

  function getEncourageReply(p) {
    const replies = {
      rabbit: '别紧张呀～你已经很棒了！慢慢来，一步一步就好，我陪着你呢🤗',
      fox: '紧张啥！你比你想象中厉害多了！来，深呼吸，咱们一步一步来！💪',
      owl: '紧张是正常的。建议你把大目标拆解成小步骤，每完成一步就给自己正向反馈。焦虑往往来自于对未知的恐惧，准备越充分，紧张越少。',
      cat: '……怕什么，又不会吃了你。（小声）其实你已经做得很好了，比我第一次强多了。😳',
      bear: '嗨，紧张啥啊！谁都有第一次，慢慢来。你要是实在紧张，就把对方当成大白菜，反正说错了也不会少块肉！'
    };
    return replies[p.id] || '别紧张，你可以的！';
  }

  function getQuestionReply(p, question) {
    const replies = {
      rabbit: `这个问题问得真好～让我想想啊……我觉得呢，最重要的是跟着自己的感觉走，你觉得呢？😊`,
      fox: `哟！这个问题有意思！要我说啊——这就得看具体情况了！不过我可以教你一个万能回答公式：先肯定+再分析+给选项，咋样？学到没？😎`,
      owl: `关于"${question}"这个问题，我们可以从三个维度来分析：第一，核心诉求是什么；第二，有哪些可选方案；第三，每个方案的利弊。你想先从哪个角度深入？`,
      cat: `……这问题问我干嘛。（思考了一下）不过既然你问了……我觉得吧，跟着直觉走就行，想那么多累不累。😒`,
      bear: `这个问题啊……让我想想。要我说啊，别想太复杂，怎么舒服怎么来！实在拿不定主意，就抛硬币，抛的时候你心里就有答案了！`
    };
    return replies[p.id] || '这个问题很有意思～';
  }

  function getDefaultReply(p, userMsg) {
    const replies = {
      rabbit: `嗯嗯，我在听呢～你说的这个我能理解，继续说呀，我想多听听😊`,
      fox: `哦？这个有点意思！来，展开说说！我跟你讲，遇到这种情况啊，你可以这样……（此处省略100字社交技巧）学到没？😎`,
      owl: `你说的内容我记录了。从沟通分析的角度来看，你表达的核心信息是清晰的，但可以在结构上做优化：建议使用"观点-论据-总结"的三段式，会更有说服力。`,
      cat: `……哦。（其实在认真听）然后呢？😒`,
      bear: `嗯嗯，我懂你的意思！这种情况我也遇到过，后来我发现啊，其实没啥大不了的，想开点就好了！来，喝口水，慢慢说！`
    };
    return replies[p.id] || '嗯嗯，我在听～';
  }

  // ========== 渲染伙伴选择界面 ==========
  function renderPartnerSelect() {
    const partnersHtml = PARTNERS.map(p => `
      <div class="ip-card" onclick="IPartner.select('${p.id}')" style="background:linear-gradient(135deg,${p.color}22,${p.color}11)">
        <div class="ip-avatar" style="background:${p.color}">${p.avatar}</div>
        <div class="ip-info">
          <div class="ip-name">${p.name} <span class="ip-tag">${p.personality}</span></div>
          <div class="ip-desc">${p.desc}</div>
          <div class="ip-traits">${p.traits.map(t => `<span class="ip-trait">${t}</span>`).join('')}</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="ip-header">
        <div class="ip-title">🦋 i人伙伴团</div>
        <div class="ip-subtitle">选择一个伙伴开始聊天，不同性格不同回应风格，练社交不尴尬</div>
      </div>
      <div class="ip-partner-list">${partnersHtml}</div>
      <div class="ip-tips">
        💡 小提示：这是安全的练习场，说错了也没关系，伙伴不会评判你
      </div>
    `;
  }

  // ========== 渲染聊天室 ==========
  function renderChatRoom() {
    const p = currentPartner;
    const msgsHtml = chatHistory.map(m => `
      <div class="ip-msg ${m.role === 'user' ? 'ip-msg-user' : 'ip-msg-partner'}">
        ${m.role === 'partner' ? `<div class="ip-msg-avatar" style="background:${p.color}">${p.avatar}</div>` : ''}
        <div class="ip-msg-bubble">${esc(m.text)}</div>
      </div>
    `).join('');

    const quickTopics = CHAT_TOPICS.slice(0, 3).map(t => 
      `<span class="ip-topic" onclick="IPartner.sendTopic('${esc(t)}')">${t}</span>`
    ).join('');

    return `
      <div class="ip-chat-header" style="background:linear-gradient(135deg,${p.color}33,${p.color}11)">
        <button class="ip-back" onclick="IPartner.back()">← 换个伙伴</button>
        <div class="ip-chat-partner">
          <div class="ip-chat-avatar" style="background:${p.color}">${p.avatar}</div>
          <div>
            <div class="ip-chat-name">${p.name}</div>
            <div class="ip-chat-status">${p.personality} · 在线</div>
          </div>
        </div>
        <div class="ip-chat-count">已聊 ${chatCount} 句</div>
      </div>
      <div class="ip-chat-messages" id="ipChatMessages">${msgsHtml}</div>
      <div class="ip-quick-topics">
        <span class="ip-quick-label">💡 不知道说啥？试试：</span>
        ${quickTopics}
      </div>
      <div class="ip-chat-input">
        <input type="text" id="ipChatInput" placeholder="输入你想说的话..." 
               onkeydown="if(event.key==='Enter')IPartner.send()" />
        <button class="ip-send-btn" onclick="IPartner.send()">发送</button>
      </div>
    `;
  }

  // ========== 打开i人伙伴团 ==========
  function open() {
    // 检查是否已有遮罩
    let mask = document.getElementById('ipMask');
    if (mask) { mask.remove(); }

    mask = document.createElement('div');
    mask.id = 'ipMask';
    mask.className = 'ip-mask';
    mask.innerHTML = `
      <div class="ip-panel" id="ipPanel">
        <button class="ip-close" onclick="IPartner.close()">✕</button>
        <div id="ipContent">${renderPartnerSelect()}</div>
      </div>
    `;
    document.body.appendChild(mask);

    // 注入样式（只注入一次）
    if (!document.getElementById('ipStyle')) {
      const style = document.createElement('style');
      style.id = 'ipStyle';
      style.textContent = getStyles();
      document.head.appendChild(style);
    }
  }

  // ========== 选择伙伴 ==========
  function select(partnerId) {
    currentPartner = PARTNERS.find(p => p.id === partnerId);
    chatHistory = [];
    chatCount = 0;
    
    // 添加伙伴的问候
    chatHistory.push({ role: 'partner', text: currentPartner.greet });
    chatCount++;

    document.getElementById('ipContent').innerHTML = renderChatRoom();
    setTimeout(() => {
      const msgs = document.getElementById('ipChatMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 100);
  }

  // ========== 发送消息 ==========
  function send() {
    const input = document.getElementById('ipChatInput');
    const text = input.value.trim();
    if (!text) { toast('说点什么吧～'); return; }
    if (!currentPartner) return;

    // 添加用户消息
    chatHistory.push({ role: 'user', text });
    chatCount++;
    input.value = '';
    
    updateChatUI();

    // 模拟伙伴"正在输入"
    setTimeout(() => {
      const reply = generateReply(currentPartner, text);
      chatHistory.push({ role: 'partner', text: reply });
      chatCount++;
      updateChatUI();
      
      // 记录学习数据
      if (window.recordStudy) {
        window.recordStudy('comm', 'i人聊天', 1);
      }
    }, 800 + Math.random() * 700);
  }

  // ========== 发送快捷话题 ==========
  function sendTopic(topic) {
    const input = document.getElementById('ipChatInput');
    input.value = topic;
    send();
  }

  // ========== 更新聊天UI ==========
  function updateChatUI() {
    const content = document.getElementById('ipContent');
    if (!content) return;
    content.innerHTML = renderChatRoom();
    setTimeout(() => {
      const msgs = document.getElementById('ipChatMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  }

  // ========== 返回伙伴选择 ==========
  function back() {
    currentPartner = null;
    chatHistory = [];
    document.getElementById('ipContent').innerHTML = renderPartnerSelect();
  }

  // ========== 关闭 ==========
  function close() {
    const mask = document.getElementById('ipMask');
    if (mask) mask.remove();
  }

  // ========== 样式 ==========
  function getStyles() {
    return `
      .ip-mask {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5);
        z-index: 99998; display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
      }
      .ip-panel {
        width: 90%; max-width: 560px; height: 85vh; max-height: 700px;
        background: var(--bg, #fff); border-radius: 20px; overflow: hidden;
        position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        display: flex; flex-direction: column;
      }
      .ip-close {
        position: absolute; top: 12px; right: 12px; z-index: 10;
        width: 32px; height: 32px; border-radius: 50%; border: none;
        background: rgba(0,0,0,0.1); cursor: pointer; font-size: 16px;
        display: flex; align-items: center; justify-content: center;
      }
      .ip-close:hover { background: rgba(0,0,0,0.2); }
      #ipContent { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
      
      /* 伙伴选择 */
      .ip-header { padding: 24px 20px 16px; text-align: center; }
      .ip-title { font-size: 22px; font-weight: 800; color: var(--text, #333); margin-bottom: 6px; }
      .ip-subtitle { font-size: 13px; color: var(--text-secondary, #888); line-height: 1.5; }
      .ip-partner-list { padding: 0 16px; flex: 1; overflow-y: auto; }
      .ip-card {
        display: flex; gap: 14px; padding: 16px; border-radius: 16px;
        margin-bottom: 12px; cursor: pointer; transition: all 0.2s;
        border: 2px solid transparent;
      }
      .ip-card:hover { transform: translateY(-2px); border-color: var(--primary, #5B8DEF); }
      .ip-avatar {
        width: 56px; height: 56px; border-radius: 16px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; font-size: 30px;
      }
      .ip-info { flex: 1; min-width: 0; }
      .ip-name { font-size: 16px; font-weight: 700; color: var(--text, #333); margin-bottom: 4px; }
      .ip-tag {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background: var(--primary, #5B8DEF); color: #fff; margin-left: 6px; font-weight: 500;
      }
      .ip-desc { font-size: 12px; color: var(--text-secondary, #888); margin-bottom: 8px; line-height: 1.4; }
      .ip-traits { display: flex; gap: 6px; flex-wrap: wrap; }
      .ip-trait {
        font-size: 11px; padding: 2px 8px; border-radius: 8px;
        background: rgba(0,0,0,0.06); color: var(--text-secondary, #888);
      }
      .ip-tips {
        padding: 16px 20px; text-align: center; font-size: 12px;
        color: var(--text-muted, #aaa); border-top: 1px solid var(--border, #eee);
      }
      
      /* 聊天室 */
      .ip-chat-header {
        padding: 16px; display: flex; align-items: center; gap: 12px;
        border-bottom: 1px solid var(--border, #eee); flex-shrink: 0;
      }
      .ip-back {
        border: none; background: rgba(0,0,0,0.06); padding: 6px 10px;
        border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--text, #333);
      }
      .ip-back:hover { background: rgba(0,0,0,0.1); }
      .ip-chat-partner { display: flex; align-items: center; gap: 10px; flex: 1; }
      .ip-chat-avatar {
        width: 40px; height: 40px; border-radius: 12px;
        display: flex; align-items: center; justify-content: center; font-size: 22px;
      }
      .ip-chat-name { font-size: 15px; font-weight: 700; color: var(--text, #333); }
      .ip-chat-status { font-size: 11px; color: #4CAF50; }
      .ip-chat-count { font-size: 12px; color: var(--text-muted, #aaa); }
      
      .ip-chat-messages {
        flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;
      }
      .ip-msg { display: flex; gap: 8px; max-width: 85%; }
      .ip-msg-user { align-self: flex-end; flex-direction: row-reverse; }
      .ip-msg-partner { align-self: flex-start; }
      .ip-msg-avatar {
        width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; font-size: 18px;
      }
      .ip-msg-bubble {
        padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.5;
        background: var(--bg, #f5f5f5); color: var(--text, #333);
      }
      .ip-msg-user .ip-msg-bubble {
        background: var(--primary, #5B8DEF); color: #fff; border-bottom-right-radius: 4px;
      }
      .ip-msg-partner .ip-msg-bubble { border-bottom-left-radius: 4px; }
      
      .ip-quick-topics {
        padding: 8px 16px; display: flex; gap: 8px; flex-wrap: wrap;
        border-top: 1px solid var(--border, #eee); flex-shrink: 0;
      }
      .ip-quick-label { font-size: 11px; color: var(--text-muted, #aaa); align-self: center; }
      .ip-topic {
        font-size: 11px; padding: 4px 10px; border-radius: 12px; cursor: pointer;
        background: rgba(91,141,239,0.1); color: var(--primary, #5B8DEF);
        transition: all 0.2s;
      }
      .ip-topic:hover { background: rgba(91,141,239,0.2); }
      
      .ip-chat-input {
        display: flex; gap: 8px; padding: 12px 16px;
        border-top: 1px solid var(--border, #eee); flex-shrink: 0;
      }
      .ip-chat-input input {
        flex: 1; padding: 10px 14px; border-radius: 12px;
        border: 1px solid var(--border, #ddd); background: var(--bg, #fff);
        color: var(--text, #333); font-size: 14px; outline: none;
      }
      .ip-chat-input input:focus { border-color: var(--primary, #5B8DEF); }
      .ip-send-btn {
        padding: 10px 20px; border-radius: 12px; border: none;
        background: var(--primary, #5B8DEF); color: #fff; font-size: 14px;
        font-weight: 600; cursor: pointer; transition: all 0.2s;
      }
      .ip-send-btn:hover { opacity: 0.9; }
    `;
  }

  // ========== 暴露API ==========
  window.IPartner = {
    open, select, send, sendTopic, back, close
  };

  console.log('✅ i人伙伴团已加载');
})();
