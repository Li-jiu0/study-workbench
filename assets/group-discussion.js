/* ============================================================
 * 无领导小组讨论
 * 多角色模拟讨论 + 用户参与 + 总结评定
 * 适用于群面/面试训练
 * ============================================================ */
(function () {
  'use strict';

  // ========== 讨论题目库 ==========
  const TOPICS = [
    {
      id: 'island',
      title: '荒岛求生',
      icon: '🏝️',
      desc: '你们一行人乘船出海遇险，漂流到一座荒岛。现在有10件物品，但只能带走5件，请讨论决定选择哪5件，并说明理由。',
      items: ['🔦 手电筒', '🧭 指南针', '📻 收音机', '🔪 刀具', '🧥 防寒外套', '💊 急救药品', '📦 压缩饼干', '💧 净水器', '🧵 绳索', '📖 求生手册'],
      time: 15
    },
    {
      id: 'budget',
      title: '部门经费分配',
      icon: '💰',
      desc: '公司给你们部门100万年度经费，需要在以下5个方向分配：培训、团建、设备升级、市场推广、研发创新。请讨论分配方案，并说明理由。',
      items: ['📚 员工培训', '🎉 团队建设', '💻 设备升级', '📢 市场推广', '🔬 研发创新'],
      time: 15
    },
    {
      id: 'rescue',
      title: '救援优先级',
      icon: '🚑',
      desc: '地震后有6名被困者需要救援，但资源有限只能按顺序救援。请讨论决定救援优先级，并说明理由。被困者：科学家、孕妇、儿童、老人、企业家、医生。',
      items: ['🔬 科学家', '🤰 孕妇', '👶 儿童', '👴 老人', '💼 企业家', '⚕️ 医生'],
      time: 15
    },
    {
      id: 'promotion',
      title: '优秀员工评选',
      icon: '🏆',
      desc: '公司要评选年度优秀员工，有5位候选人，只能选1位。请讨论决定人选，并说明理由。候选人：业绩第一但不合群的A、兢兢业业但业绩平平的B、创新能力强但经验不足的C、团队凝聚力强但业绩一般的D、资历最老但缺乏冲劲的E。',
      items: ['🥇 业绩王A', '🐂 老黄牛B', '💡 创新者C', '🤝 凝聚者D', '🎓 资深者E'],
      time: 15
    }
  ];

  // ========== 虚拟角色 ==========
  const CHARACTERS = [
    { id: 'leader', name: '领导者', avatar: '🦁', color: '#E53935', style: '主动引导讨论，善于总结观点，推动进程', firstSpeak: '好，我们开始讨论吧。这个问题的核心是要确定一个标准，然后按照标准来选择。大家怎么看？' },
    { id: 'analyst', name: '分析者', avatar: '🦉', color: '#7B68EE', style: '理性分析，善于拆解问题，用数据和逻辑说话', firstSpeak: '我觉得我们应该先建立一个评估框架，比如从重要性、紧迫性、可行性三个维度来分析。' },
    { id: 'creative', name: '创意者', avatar: '🦊', color: '#FF8C42', style: '思维活跃，经常提出新角度，但有时跑题', firstSpeak: '诶，我有个不一样的想法！我们能不能换个角度看这个问题？比如从长期价值来考虑...' },
    { id: 'harmonizer', name: '协调者', avatar: '🐰', color: '#FFB6C1', style: '注重团队和谐，善于调和矛盾，照顾每个人感受', firstSpeak: '我觉得大家说的都有道理，我们可以把大家的观点整合一下，找到一个平衡点。' }
  ];

  // ========== 状态 ==========
  let currentTopic = null;
  let discussionMessages = [];
  let round = 0;
  let userHasSpoken = false;
  let isRunning = false;

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

  // ========== 生成角色发言 ==========
  function generateCharacterSpeech(char, round, topic) {
    const speeches = {
      leader: [
        `我来总结一下大家的观点，目前主要有几种意见...我建议我们先确定标准，再逐一评估。`,
        `时间不多了，我们需要尽快达成共识。我建议投票决定，大家觉得呢？`,
        `好，那我们就按照这个方案来。谁还有补充意见吗？没有的话我们就定了。`
      ],
      analyst: [
        `从数据来看，${topic.items[Math.floor(Math.random() * topic.items.length)].split(' ')[1]}的重要性更高。我们可以用加权评分法来量化评估。`,
        `我补充一个角度：从成本收益比来看，这个选择的投入产出比是最高的。`,
        `我做了一个简单的分析矩阵，大家可以看看。综合评分最高的是这个选项。`
      ],
      creative: [
        `等等，我突然想到一个新角度！我们能不能不做非此即彼的选择，而是找到一个创新的解决方案？`,
        `大家有没有想过，这个问题的前提可能就有问题？我们是不是可以跳出题目给的框架？`,
        `我有个大胆的想法！虽然听起来有点离谱，但仔细想想其实很有道理...`
      ],
      harmonizer: [
        `我理解${CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].name}的观点，也同意${CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].name}的部分看法，其实两者可以结合。`,
        `大家先别争，我们都是为了找到最好的方案。不如每个人都说说自己最看重的是什么？`,
        `我觉得我们已经讨论得很充分了，现在最重要的是达成一致，不要因为细节影响了整体。`
      ]
    };
    
    const charSpeeches = speeches[char.id] || speeches.analyst;
    return charSpeeches[round % charSpeeches.length];
  }

  // ========== 渲染题目选择 ==========
  function renderTopicList() {
    const topicsHtml = TOPICS.map(t => `
      <div class="gd-card" onclick="GroupDiscussion.select('${t.id}')">
        <div class="gd-icon">${t.icon}</div>
        <div class="gd-info">
          <div class="gd-title">${t.title}</div>
          <div class="gd-desc">${t.desc.substring(0, 40)}...</div>
          <div class="gd-meta">⏱️ ${t.time}分钟 · 👥 ${CHARACTERS.length}个角色</div>
        </div>
        <div class="gd-arrow">→</div>
      </div>
    `).join('');

    return `
      <div class="gd-header">
        <div class="gd-title">👥 无领导小组讨论</div>
        <div class="gd-subtitle">经典群面题目模拟，4个虚拟角色与你一起讨论，锻炼团队协作与表达能力</div>
      </div>
      <div class="gd-actions">
        <button class="gd-btn gd-btn-primary" onclick="GroupDiscussion.random()">🎲 随机抽题</button>
        <span class="gd-count">共 ${TOPICS.length} 个经典题目</span>
      </div>
      <div class="gd-list">${topicsHtml}</div>
      <div class="gd-tips">
        💡 小提示：讨论中可以随时输入你的观点，角色会根据你的发言回应。结束后会有总结评定。
      </div>
    `;
  }

  // ========== 渲染讨论界面 ==========
  function renderDiscussion() {
    const t = currentTopic;
    const msgsHtml = discussionMessages.map(m => {
      if (m.role === 'user') {
        return `
          <div class="gd-msg gd-msg-user">
            <div class="gd-msg-bubble">${esc(m.text)}</div>
            <div class="gd-msg-avatar">🧑</div>
          </div>`;
      } else {
        const char = CHARACTERS.find(c => c.id === m.charId);
        return `
          <div class="gd-msg gd-msg-char">
            <div class="gd-msg-avatar" style="background:${char.color}">${char.avatar}</div>
            <div class="gd-msg-content">
              <div class="gd-msg-name">${char.name}</div>
              <div class="gd-msg-bubble">${esc(m.text)}</div>
            </div>
          </div>`;
      }
    }).join('');

    const itemsHtml = t.items.map((item, i) => `
      <span class="gd-item">${item}</span>
    `).join('');

    return `
      <div class="gd-disc-header">
        <button class="gd-back" onclick="GroupDiscussion.back()">← 换题</button>
        <div class="gd-disc-title">${t.icon} ${t.title}</div>
        <div class="gd-disc-round">第 ${round + 1} 轮</div>
      </div>
      <div class="gd-topic-box">
        <div class="gd-topic-desc">${t.desc}</div>
        <div class="gd-items">${itemsHtml}</div>
      </div>
      <div class="gd-chars-bar">
        ${CHARACTERS.map(c => `
          <div class="gd-char-chip" style="border-color:${c.color}">
            <span class="gd-char-chip-avatar" style="background:${c.color}">${c.avatar}</span>
            <span class="gd-char-chip-name">${c.name}</span>
          </div>
        `).join('')}
        <div class="gd-char-chip gd-user-chip">
          <span class="gd-char-chip-avatar">🧑</span>
          <span class="gd-char-chip-name">你</span>
        </div>
      </div>
      <div class="gd-messages" id="gdMessages">${msgsHtml}</div>
      <div class="gd-input-area">
        <input type="text" id="gdInput" placeholder="输入你的观点，参与讨论..." 
               onkeydown="if(event.key==='Enter')GroupDiscussion.sendUserMessage()" />
        <button class="gd-send-btn" onclick="GroupDiscussion.sendUserMessage()">发送</button>
      </div>
      <div class="gd-actions-bar">
        <button class="gd-btn gd-btn-outline" onclick="GroupDiscussion.nextRound()">➡️ 下一轮</button>
        <button class="gd-btn gd-btn-warn" onclick="GroupDiscussion.endDiscussion()">🏁 结束讨论</button>
      </div>
    `;
  }

  // ========== 渲染总结评定 ==========
  function renderSummary() {
    const userMessages = discussionMessages.filter(m => m.role === 'user');
    const totalMessages = discussionMessages.length;
    const userRatio = Math.round(userMessages.length / Math.max(totalMessages, 1) * 100);
    
    let participation = userMessages.length >= 3 ? '积极参与' : userMessages.length >= 1 ? '参与较少' : '未参与';
    let logicScore = userRatio >= 20 ? '良好' : '待提升';
    
    const tips = [];
    if (userMessages.length === 0) tips.push('⚠️ 本次讨论你没有发言，建议下次主动参与，群面中发言很重要');
    if (userMessages.length < 3) tips.push('💡 可以更积极地表达观点，至少发言3次以上才能让面试官记住你');
    if (userRatio < 20) tips.push('💡 你的发言占比偏低，建议在讨论中更主动地引导话题或总结观点');
    tips.push('💡 群面技巧：① 首次发言要亮明观点 ② 中间可以做协调者或总结者 ③ 最后争取做总结陈词');
    tips.push('💡 注意倾听他人观点，在别人基础上补充，比单纯反对更有说服力');

    return `
      <div class="gd-summary-header">
        <div class="gd-summary-title">📊 讨论总结</div>
        <div class="gd-summary-subtitle">${currentTopic.icon} ${currentTopic.title}</div>
      </div>
      <div class="gd-summary-content">
        <div class="gd-scores-grid">
          <div class="gd-score-card">
            <div class="gd-score-label">总发言数</div>
            <div class="gd-score-value">${totalMessages}</div>
          </div>
          <div class="gd-score-card">
            <div class="gd-score-label">你的发言</div>
            <div class="gd-score-value">${userMessages.length}</div>
          </div>
          <div class="gd-score-card">
            <div class="gd-score-label">发言占比</div>
            <div class="gd-score-value">${userRatio}%</div>
          </div>
          <div class="gd-score-card">
            <div class="gd-score-label">参与度</div>
            <div class="gd-score-value gd-score-tag">${participation}</div>
          </div>
        </div>
        <div class="gd-section">
          <div class="gd-section-title">💬 你的发言记录</div>
          ${userMessages.length > 0 ? userMessages.map((m, i) => `
            <div class="gd-user-msg-item">
              <span class="gd-user-msg-num">${i + 1}.</span>
              <span class="gd-user-msg-text">${esc(m.text)}</span>
            </div>
          `).join('') : '<div class="gd-empty">暂无发言记录</div>'}
        </div>
        <div class="gd-section">
          <div class="gd-section-title">💡 改进建议</div>
          <ul class="gd-tips-list">
            ${tips.map(t => `<li>${t}</li>`).join('')}
          </ul>
        </div>
      </div>
      <div class="gd-summary-actions">
        <button class="gd-btn gd-btn-outline" onclick="GroupDiscussion.select('${currentTopic.id}')">🔄 再练一次</button>
        <button class="gd-btn gd-btn-primary" onclick="GroupDiscussion.random()">🎲 下一个题目</button>
        <button class="gd-btn gd-btn-outline" onclick="GroupDiscussion.back()">📋 返回题目</button>
      </div>
    `;
  }

  // ========== 打开无领导小组讨论 ==========
  // 【批次 20260913j】页面内全屏视图：存在宿主容器 #gdAiPane（商务礼仪面试.html 合并页）时，
  // 直接渲染为页面内面板，不再创建浮层蒙版；其他调用环境保持原浮层行为不变。
  function open() {
    let mask = document.getElementById('gdMask');
    if (mask) mask.remove();

    const host = document.getElementById('gdAiPane');
    if (host) {
      host.innerHTML = `
        <div class="gd-panel gd-panel-inline" id="gdPanel">
          <div id="gdContent">${renderTopicList()}</div>
        </div>
      `;
    } else {
      mask = document.createElement('div');
      mask.id = 'gdMask';
      mask.className = 'gd-mask';
      mask.innerHTML = `
        <div class="gd-panel" id="gdPanel">
          <button class="gd-close" onclick="GroupDiscussion.close()">✕</button>
          <div id="gdContent">${renderTopicList()}</div>
        </div>
      `;
      document.body.appendChild(mask);
    }

    if (!document.getElementById('gdStyle')) {
      const style = document.createElement('style');
      style.id = 'gdStyle';
      style.textContent = getStyles();
      document.head.appendChild(style);
    }
  }

  // ========== 选择题目 ==========
  function select(topicId) {
    currentTopic = TOPICS.find(t => t.id === topicId);
    discussionMessages = [];
    round = 0;
    userHasSpoken = false;
    isRunning = true;
    
    document.getElementById('gdContent').innerHTML = renderDiscussion();
    
    // 第一轮：角色依次发言
    setTimeout(() => {
      CHARACTERS.forEach((char, i) => {
        setTimeout(() => {
          addCharacterMessage(char, char.firstSpeak);
        }, i * 1200);
      });
    }, 500);
  }

  // ========== 随机抽题 ==========
  function random() {
    const idx = Math.floor(Math.random() * TOPICS.length);
    select(TOPICS[idx].id);
    toast('🎲 抽到了：' + TOPICS[idx].title);
  }

  // ========== 添加角色消息 ==========
  function addCharacterMessage(char, text) {
    discussionMessages.push({ role: 'char', charId: char.id, text });
    updateMessages();
  }

  // ========== 发送用户消息 ==========
  function sendUserMessage() {
    const input = document.getElementById('gdInput');
    const text = input.value.trim();
    if (!text) { toast('说点什么吧～'); return; }
    if (!isRunning) return;
    
    discussionMessages.push({ role: 'user', text });
    userHasSpoken = true;
    input.value = '';
    updateMessages();
    
    // 角色回应（随机1-2个角色回应）
    setTimeout(() => {
      const responders = CHARACTERS.sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2));
      responders.forEach((char, i) => {
        setTimeout(() => {
          const response = `我同意你说的部分观点，不过我想补充一点...${generateCharacterSpeech(char, round, currentTopic)}`;
          addCharacterMessage(char, response);
        }, i * 1000);
      });
    }, 800);
    
    // 记录学习数据
    if (window.recordStudy) {
      window.recordStudy('interview', '无领导小组讨论', 1);
    }
  }

  // ========== 下一轮 ==========
  function nextRound() {
    if (!isRunning) return;
    round++;
    if (round >= 4) {
      toast('已到最后一轮，可以结束讨论了');
      return;
    }
    
    // 角色继续讨论
    CHARACTERS.forEach((char, i) => {
      setTimeout(() => {
        addCharacterMessage(char, generateCharacterSpeech(char, round, currentTopic));
      }, i * 1000);
    });
    
    document.querySelector('.gd-disc-round').textContent = `第 ${round + 1} 轮`;
  }

  // ========== 结束讨论 ==========
  function endDiscussion() {
    if (!confirm('确定结束讨论吗？')) return;
    isRunning = false;
    document.getElementById('gdContent').innerHTML = renderSummary();
  }

  // ========== 更新消息区域 ==========
  function updateMessages() {
    const msgsContainer = document.getElementById('gdMessages');
    if (!msgsContainer) return;
    
    const msgsHtml = discussionMessages.map(m => {
      if (m.role === 'user') {
        return `
          <div class="gd-msg gd-msg-user">
            <div class="gd-msg-bubble">${esc(m.text)}</div>
            <div class="gd-msg-avatar">🧑</div>
          </div>`;
      } else {
        const char = CHARACTERS.find(c => c.id === m.charId);
        return `
          <div class="gd-msg gd-msg-char">
            <div class="gd-msg-avatar" style="background:${char.color}">${char.avatar}</div>
            <div class="gd-msg-content">
              <div class="gd-msg-name">${char.name}</div>
              <div class="gd-msg-bubble">${esc(m.text)}</div>
            </div>
          </div>`;
      }
    }).join('');
    
    msgsContainer.innerHTML = msgsHtml;
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
  }

  // ========== 返回题目列表 ==========
  function back() {
    isRunning = false;
    currentTopic = null;
    discussionMessages = [];
    document.getElementById('gdContent').innerHTML = renderTopicList();
  }

  // ========== 关闭 ==========
  function close() {
    isRunning = false;
    const mask = document.getElementById('gdMask');
    if (mask) mask.remove();
  }

  // ========== 样式 ==========
  function getStyles() {
    return `
      .gd-mask {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5);
        z-index: 99998; display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
      }
      .gd-panel {
        width: 94%; max-width: 640px; height: 90vh; max-height: 780px;
        background: var(--bg, #fff); border-radius: 20px; overflow: hidden;
        position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        display: flex; flex-direction: column;
      }
      .gd-close {
        position: absolute; top: 12px; right: 12px; z-index: 10;
        width: 32px; height: 32px; border-radius: 50%; border: none;
        background: rgba(0,0,0,0.1); cursor: pointer; font-size: 16px;
        display: flex; align-items: center; justify-content: center;
      }
      .gd-close:hover { background: rgba(0,0,0,0.2); }
      /* 页面内全屏视图（合并页 #gdAiPane 宿主）：占满容器，无浮层阴影 */
      .gd-panel-inline { width: 100%; max-width: none; height: 100%; max-height: none; border-radius: 16px; box-shadow: none; }
      #gdContent { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
      
      .gd-header { padding: 24px 20px 12px; text-align: center; }
      .gd-title { font-size: 22px; font-weight: 800; color: var(--text, #333); margin-bottom: 6px; }
      .gd-subtitle { font-size: 13px; color: var(--text-secondary, #888); line-height: 1.5; }
      .gd-actions { padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
      .gd-count { font-size: 12px; color: var(--text-muted, #aaa); }
      .gd-list { padding: 0 16px 16px; flex: 1; overflow-y: auto; }
      .gd-card {
        display: flex; align-items: center; gap: 14px; padding: 14px 16px;
        border-radius: 14px; margin-bottom: 10px; cursor: pointer;
        background: var(--bg, #f8f9fa); border: 1px solid var(--border, #eee);
        transition: all 0.2s;
      }
      .gd-card:hover { transform: translateY(-2px); border-color: var(--primary, #5B8DEF); }
      .gd-icon { font-size: 28px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: rgba(91,141,239,0.1); border-radius: 12px; }
      .gd-info { flex: 1; min-width: 0; }
      .gd-title { font-size: 15px; font-weight: 700; color: var(--text, #333); margin-bottom: 4px; }
      .gd-desc { font-size: 12px; color: var(--text-secondary, #888); margin-bottom: 4px; }
      .gd-meta { font-size: 11px; color: var(--text-muted, #aaa); }
      .gd-arrow { color: var(--text-muted, #ccc); font-size: 18px; }
      .gd-tips { padding: 12px 20px; text-align: center; font-size: 12px; color: var(--text-muted, #aaa); border-top: 1px solid var(--border, #eee); }
      
      .gd-disc-header { padding: 16px 20px; background: linear-gradient(135deg, rgba(91,141,239,0.1), rgba(91,141,239,0.05)); border-bottom: 1px solid var(--border, #eee); display: flex; align-items: center; gap: 12px; }
      .gd-back { border: none; background: rgba(0,0,0,0.06); padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--text, #333); }
      .gd-disc-title { flex: 1; font-size: 17px; font-weight: 800; color: var(--text, #333); }
      .gd-disc-round { font-size: 12px; padding: 4px 10px; border-radius: 10px; background: var(--primary, #5B8DEF); color: #fff; }
      
      .gd-topic-box { padding: 12px 20px; background: rgba(255,193,7,0.08); border-bottom: 1px solid var(--border, #eee); }
      .gd-topic-desc { font-size: 13px; line-height: 1.6; color: var(--text, #333); margin-bottom: 8px; }
      .gd-items { display: flex; gap: 6px; flex-wrap: wrap; }
      .gd-item { font-size: 11px; padding: 4px 10px; border-radius: 10px; background: rgba(0,0,0,0.06); color: var(--text-secondary, #666); }
      
      .gd-chars-bar { padding: 8px 20px; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border, #eee); background: var(--bg, #fafafa); }
      .gd-char-chip { display: flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border-radius: 20px; border: 1.5px solid; background: var(--bg, #fff); }
      .gd-char-chip-avatar { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }
      .gd-char-chip-name { font-size: 11px; font-weight: 600; color: var(--text, #333); }
      .gd-user-chip { border-color: #4CAF50; }
      
      .gd-messages { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
      .gd-msg { display: flex; gap: 8px; max-width: 85%; }
      .gd-msg-user { align-self: flex-end; flex-direction: row-reverse; }
      .gd-msg-char { align-self: flex-start; }
      .gd-msg-avatar { width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; background: #4CAF50; }
      .gd-msg-content { flex: 1; min-width: 0; }
      .gd-msg-name { font-size: 11px; color: var(--text-secondary, #888); margin-bottom: 2px; }
      .gd-msg-bubble { padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; background: var(--bg, #f5f5f5); color: var(--text, #333); }
      .gd-msg-user .gd-msg-bubble { background: var(--primary, #5B8DEF); color: #fff; border-bottom-right-radius: 4px; }
      .gd-msg-char .gd-msg-bubble { border-bottom-left-radius: 4px; }
      
      .gd-input-area { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border, #eee); }
      .gd-input-area input { flex: 1; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--border, #ddd); background: var(--bg, #fff); color: var(--text, #333); font-size: 14px; outline: none; }
      .gd-input-area input:focus { border-color: var(--primary, #5B8DEF); }
      .gd-send-btn { padding: 10px 18px; border-radius: 12px; border: none; background: var(--primary, #5B8DEF); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
      
      .gd-actions-bar { display: flex; gap: 10px; padding: 10px 16px; border-top: 1px solid var(--border, #eee); background: var(--bg, #fafafa); }
      .gd-btn { padding: 10px 16px; border-radius: 10px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; flex: 1; }
      .gd-btn-primary { background: var(--primary, #5B8DEF); color: #fff; }
      .gd-btn-outline { background: transparent; border: 1px solid var(--border, #ddd); color: var(--text, #333); }
      .gd-btn-warn { background: #FF9800; color: #fff; }
      
      .gd-summary-header { padding: 24px 20px 16px; text-align: center; background: linear-gradient(135deg, rgba(91,141,239,0.1), rgba(91,141,239,0.05)); }
      .gd-summary-title { font-size: 22px; font-weight: 800; color: var(--text, #333); margin-bottom: 4px; }
      .gd-summary-subtitle { font-size: 13px; color: var(--text-secondary, #888); }
      .gd-summary-content { padding: 16px 20px; flex: 1; overflow-y: auto; }
      .gd-scores-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
      .gd-score-card { padding: 14px; background: var(--bg, #f8f9fa); border-radius: 12px; text-align: center; }
      .gd-score-label { font-size: 11px; color: var(--text-secondary, #888); margin-bottom: 4px; }
      .gd-score-value { font-size: 22px; font-weight: 800; color: var(--primary, #5B8DEF); }
      .gd-score-tag { font-size: 14px; padding: 2px 8px; border-radius: 8px; background: rgba(76,175,80,0.15); color: #4CAF50; display: inline-block; }
      .gd-section { margin-bottom: 16px; }
      .gd-section-title { font-size: 14px; font-weight: 700; color: var(--text, #333); margin-bottom: 8px; }
      .gd-user-msg-item { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border, #eee); font-size: 13px; line-height: 1.5; color: var(--text, #333); }
      .gd-user-msg-num { color: var(--primary, #5B8DEF); font-weight: 700; flex-shrink: 0; }
      .gd-empty { text-align: center; padding: 20px; color: var(--text-muted, #aaa); font-size: 13px; }
      .gd-tips-list { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.7; color: var(--text-secondary, #666); }
      .gd-tips-list li { margin-bottom: 6px; }
      .gd-summary-actions { display: flex; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border, #eee); }
    `;
  }

  // ========== 暴露API ==========
  window.GroupDiscussion = {
    open, select, random, sendUserMessage, nextRound, endDiscussion, back, close
  };

  console.log('✅ 无领导小组讨论已加载');
})();
