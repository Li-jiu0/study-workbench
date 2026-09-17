/* ============================================================
 * 话题表达训练
 * 随机话题 + 深度解读 + 1分钟语音表达 + 评定反馈
 * 适用于行测/面试的综合分析能力训练
 * ============================================================ */
(function () {
  'use strict';

  // ========== 话题库 ==========
  const TOPICS = [
    {
      id: 'volunteer-dilemma',
      category: '社会现象',
      title: '志愿者困境',
      icon: '🤝',
      background: '志愿者困境是指：在一个群体中，如果有人自愿承担某项公共任务（如加班、组织活动、帮大家跑腿），那么其他人就可以"搭便车"享受成果；但如果所有人都等着别人去做，最终任务就没人完成，所有人都受损。',
      core: '核心矛盾：个人理性（等别人做，自己省力）vs 集体理性（总得有人做，否则全输）',
      perspectives: [
        { stance: '支持主动做', points: ['主动承担能建立个人信誉和影响力', '避免集体损失，整体收益更大', '锻炼自己的组织和执行能力'] },
        { stance: '反对总是做', points: ['长期主动会被当成"软柿子"，被过度索取', '不公平：为什么总是我付出，别人享受', '应该建立轮流机制或明确分工'] },
        { stance: '折中方案', points: ['第一次主动做，但同时提出建立机制', '用"我做这次，下次轮到XX"的方式', '把个人付出转化为制度建设'] }
      ],
      framework: '分析框架：1. 定性（这是什么现象）2. 影响（对个人/集体的影响）3. 原因（为什么会出现）4. 对策（如何解决）',
      keyPoints: ['搭便车心理', '公共物品供给', '责任分散效应', '制度设计的重要性']
    },
    {
      id: 'prisoner-dilemma',
      category: '博弈论',
      title: '囚徒困境',
      icon: '🔗',
      background: '两个嫌疑人被分别审讯，如果都沉默，各判1年；如果都坦白，各判5年；如果一个坦白一个沉默，坦白的释放，沉默的判10年。每个人的最优选择都是坦白，但两人都坦白的结果比都沉默更差。',
      core: '核心矛盾：个体理性导致集体非理性，合作对双方都有利但难以维持',
      perspectives: [
        { stance: '选择合作（沉默）', points: ['信任对方，追求双赢', '长期博弈中合作收益更高', '道德和信誉的考量'] },
        { stance: '选择背叛（坦白）', points: ['规避风险，避免最坏结果', '一次性博弈中背叛是占优策略', '不信任对方会选择合作'] },
        { stance: '制度设计视角', points: ['增加背叛成本（如惩罚机制）', '建立重复博弈环境（未来还要合作）', '信息透明，建立信誉体系'] }
      ],
      framework: '分析框架：1. 博弈结构（参与人、策略、收益）2. 均衡分析（纳什均衡）3. 现实意义（如何促进合作）',
      keyPoints: ['纳什均衡', '占优策略', '重复博弈', '信任机制']
    },
    {
      id: 'trolley-problem',
      category: '伦理道德',
      title: '电车难题',
      icon: '🚃',
      background: '一辆失控的电车即将撞上轨道上的5个人，你可以拉拉杆让电车转到另一条轨道，但那条轨道上有1个人。你会拉拉杆吗？另一个变体：你站在桥上，把身边的胖子推下去可以挡住电车救5人，你会推吗？',
      core: '核心矛盾：功利主义（牺牲1人救5人，总效用最大）vs 义务论（不能主动杀人，即使是为了救更多人）',
      perspectives: [
        { stance: '功利主义立场', points: ['追求最大多数人的最大幸福', '5条命比1条命更有价值', '结果论：只要结果好，手段可以接受'] },
        { stance: '义务论立场', points: ['不能把人当作手段，即使是为了好的目的', '主动杀人和见死不救有本质区别', '道德规则是绝对的，不能计算'] },
        { stance: '现实应用视角', points: ['这个思想实验揭示了道德直觉的复杂性', '现实中很少有这种极端选择', '更重要的是思考：我们的道德判断依据是什么'] }
      ],
      framework: '分析框架：1. 情境描述 2. 核心冲突 3. 不同立场 4. 现实启示',
      keyPoints: ['功利主义', '义务论', '道德直觉', '作为与不作为']
    },
    {
      id: '996',
      category: '职场话题',
      title: '996工作制',
      icon: '💼',
      background: '996指早上9点上班、晚上9点下班、每周工作6天的工作制度。互联网行业曾普遍存在，引发广泛讨论。有人认为是奋斗精神，有人认为是剥削，还有人认为是行业特殊阶段的产物。',
      core: '核心矛盾：企业效率/个人发展 vs 劳动者权益/身心健康',
      perspectives: [
        { stance: '理解支持', points: ['行业竞争激烈，不进则退', '年轻时候拼一把，换取长期发展', '多劳多得，付出有回报'] },
        { stance: '反对批判', points: ['违反劳动法，侵害休息权', '损害身心健康，得不偿失', '效率不等于时长，疲劳工作反而低效'] },
        { stance: '理性分析', points: ['关键看是否自愿、是否有合理补偿', '行业差异：创业期vs成熟期不同', '根本出路是提高效率而非延长工时'] }
      ],
      framework: '分析框架：1. 现象描述 2. 成因分析 3. 多方影响 4. 解决路径',
      keyPoints: ['劳动法', '工作效率', '工作生活平衡', '行业发展阶段']
    },
    {
      id: 'involution',
      category: '社会现象',
      title: '内卷',
      icon: '🌀',
      background: '内卷原指社会文化模式发展到一定程度后停滞不前，无法转化为更高级模式的现象。现在多指同行间过度竞争导致个体收益努力比下降，大家都更累但整体没有进步。比如教育内卷、职场内卷。',
      core: '核心矛盾：个体竞争加剧 vs 整体收益不增甚至下降',
      perspectives: [
        { stance: '批判视角', points: ['过度竞争导致资源浪费', '大家都更累但没人真正受益', '焦虑感蔓延，幸福感下降'] },
        { stance: '辩证视角', points: ['竞争在一定程度上促进进步', '内卷是发展阶段的必然现象', '关键是把握度，避免恶性竞争'] },
        { stance: '破局视角', points: ['寻找差异化竞争，不挤独木桥', '提升效率而非增加时长', '开拓新赛道，把蛋糕做大'] }
      ],
      framework: '分析框架：1. 概念界定 2. 表现形式 3. 成因分析 4. 破局路径',
      keyPoints: ['过度竞争', '收益递减', '差异化', '创新破局']
    },
    {
      id: 'lying-flat',
      category: '社会现象',
      title: '躺平',
      icon: '🛌',
      background: '躺平是年轻人面对竞争压力时选择降低欲望、不追求世俗成功的一种生活态度。不买房、不结婚、不生子、不消费，维持最低生存标准。有人认为是消极逃避，有人认为是对过度内卷的无声反抗。',
      core: '核心矛盾：个人选择自由 vs 社会发展期待',
      perspectives: [
        { stance: '理解同情', points: ['面对压力的自我保护', '对过度内卷的合理反抗', '降低欲望也是一种生活智慧'] },
        { stance: '批判担忧', points: ['年轻人躺平影响社会活力', '长期躺平可能失去竞争力', '逃避不能真正解决问题'] },
        { stance: '理性看待', points: ['躺平是个人选择，应尊重', '关键是"暂时躺平"还是"永远躺平"', '社会应该提供更多元的成功标准'] }
      ],
      framework: '分析框架：1. 现象描述 2. 成因分析 3. 多方影响 4. 社会反思',
      keyPoints: ['低欲望社会', '成功标准多元化', '社会压力', '个人选择']
    },
    {
      id: 'ai-replace',
      category: '科技伦理',
      title: 'AI会取代人类工作吗',
      icon: '🤖',
      background: '人工智能快速发展，ChatGPT、AI绘画、AI编程等工具已经能完成很多人类工作。有人担心大规模失业，有人认为会创造新岗位，还有人认为人机协作是未来。',
      core: '核心矛盾：技术进步效率 vs 就业冲击与社会稳定',
      perspectives: [
        { stance: '悲观担忧', points: ['AI能力提升快，很多岗位会被替代', '转型成本高，中年人尤其困难', '可能加剧贫富差距'] },
        { stance: '乐观期待', points: ['历史上技术革命最终创造了更多岗位', 'AI把人从重复劳动中解放', '催生新产业、新职业'] },
        { stance: '理性应对', points: ['AI替代的是任务不是岗位', '关键是提升不可替代的能力（创造力、情感、复杂判断）', '人机协作是主流，学会用AI提效'] }
      ],
      framework: '分析框架：1. 现状描述 2. 影响分析 3. 历史对比 4. 应对策略',
      keyPoints: ['技术革命', '就业结构', '人机协作', '终身学习']
    },
    {
      id: 'digital-divide',
      category: '社会公平',
      title: '数字鸿沟',
      icon: '📱',
      background: '数字鸿沟指不同群体在信息技术拥有和使用能力上的差距。老年人不会用智能手机、农村地区网络覆盖差、低收入家庭买不起设备……数字化在带来便利的同时，也可能让一部分人被落下。',
      core: '核心矛盾：技术进步效率 vs 社会公平包容',
      perspectives: [
        { stance: '问题严重性', points: ['老年人就医、出行、购物困难', '城乡差距进一步拉大', '数字时代的"新文盲"'] },
        { stance: '企业责任', points: ['产品设计应考虑适老化', '保留人工服务通道', '开展数字素养培训'] },
        { stance: '政府责任', points: ['加强基础设施建设（网络覆盖）', '出台政策保障基本服务', '推动公共服务数字化与传统方式并行'] }
      ],
      framework: '分析框架：1. 现象描述 2. 影响分析 3. 多方责任 4. 解决路径',
      keyPoints: ['适老化', '数字素养', '基础设施', '包容性发展']
    }
  ];

  // ========== 状态 ==========
  let currentTopic = null;
  let isRecording = false;
  let recordSeconds = 0;
  let recordTimer = null;
  let recognition = null;
  let userSpeech = '';

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

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ========== 渲染话题选择 ==========
  function renderTopicList() {
    const topicsHtml = TOPICS.map(t => `
      <div class="te-card" onclick="TopicExpress.select('${t.id}')">
        <div class="te-icon">${t.icon}</div>
        <div class="te-info">
          <div class="te-cat">${t.category}</div>
          <div class="te-title">${t.title}</div>
        </div>
        <div class="te-arrow">→</div>
      </div>
    `).join('');

    return `
      <div class="te-header">
        <div class="te-title">🎤 话题表达训练</div>
        <div class="te-subtitle">随机抽取话题，先看深度解读，再进行1分钟即兴表达，锻炼综合分析与语言表达</div>
      </div>
      <div class="te-actions">
        <button class="te-btn te-btn-primary" onclick="TopicExpress.random()">🎲 随机抽题</button>
        <span class="te-count">共 ${TOPICS.length} 个话题</span>
      </div>
      <div class="te-list">${topicsHtml}</div>
    `;
  }

  // ========== 渲染话题详情 ==========
  function renderTopicDetail() {
    const t = currentTopic;
    const perspectivesHtml = t.perspectives.map((p, i) => `
      <div class="te-perspective">
        <div class="te-perspective-title">${i === 0 ? '🟢' : i === 1 ? '🔴' : '🟡'} ${p.stance}</div>
        <ul class="te-perspective-points">
          ${p.points.map(pt => `<li>${pt}</li>`).join('')}
        </ul>
      </div>
    `).join('');

    const keyPointsHtml = t.keyPoints.map(k => `<span class="te-keyword">${k}</span>`).join('');

    return `
      <div class="te-detail-header">
        <button class="te-back" onclick="TopicExpress.back()">← 返回话题</button>
        <div class="te-detail-title">${t.icon} ${t.title}</div>
        <div class="te-detail-cat">${t.category}</div>
      </div>
      <div class="te-detail-content">
        <div class="te-section">
          <div class="te-section-title">📖 背景介绍</div>
          <div class="te-section-text">${t.background}</div>
        </div>
        <div class="te-section">
          <div class="te-section-title">⚡ 核心矛盾</div>
          <div class="te-section-text te-highlight">${t.core}</div>
        </div>
        <div class="te-section">
          <div class="te-section-title">💡 不同立场</div>
          ${perspectivesHtml}
        </div>
        <div class="te-section">
          <div class="te-section-title">🧠 分析框架</div>
          <div class="te-section-text">${t.framework}</div>
        </div>
        <div class="te-section">
          <div class="te-section-title">🔑 关键词</div>
          <div class="te-keywords">${keyPointsHtml}</div>
        </div>
      </div>
      <div class="te-record-section">
        <div class="te-record-title">🎙️ 1分钟即兴表达</div>
        <div class="te-record-desc">看完解读后，用自己的话对这个话题进行1分钟表达，可以参考上面的分析框架</div>
        <div class="te-timer" id="teTimer">0:00 / 1:00</div>
        <div class="te-record-actions">
          <button class="te-btn te-btn-record" id="teRecordBtn" onclick="TopicExpress.toggleRecord()">
            🎤 开始录音
          </button>
          <button class="te-btn te-btn-outline" onclick="TopicExpress.stopRecord()" id="teStopBtn" style="display:none">
            ⏹️ 结束
          </button>
        </div>
        <div class="te-speech-box" id="teSpeechBox" style="display:none">
          <div class="te-speech-title">📝 你的表达（语音识别）：</div>
          <div class="te-speech-text" id="teSpeechText"></div>
        </div>
        <div class="te-feedback" id="teFeedback" style="display:none"></div>
      </div>
    `;
  }

  // ========== 打开话题表达训练（页内全屏面板，与站内其他模块一致的进入/返回方式） ==========
  function open() {
    ensurePage();
    renderList();
    // navigateTo 会按 themeMap 回退主题色，这里保留进入前的 body 类（含央国企主题与深色标记）
    const prevBodyClass = document.body.className;
    if (typeof navigateTo === 'function') { navigateTo('exam-topic'); document.body.className = prevBodyClass; }
    else { document.getElementById('page-exam-topic').classList.add('active'); }
    const titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = '话题表达训练';
  }

  // 确保页内全屏面板容器存在（惰性创建，挂在 .content 内与其他 page 同级）
  function ensurePage() {
    let page = document.getElementById('page-exam-topic');
    if (!page) {
      page = document.createElement('div');
      page.className = 'page';
      page.id = 'page-exam-topic';
      page.innerHTML = `
        <div class="te-panel" id="tePanel">
          <div id="teContent"></div>
          <div class="te-page-footer">
            <button class="btn btn-outline" onclick="TopicExpress.close()">← 返回笔试</button>
          </div>
        </div>
      `;
      const contentEl = document.querySelector('.content');
      if (contentEl) contentEl.appendChild(page);
      else document.body.appendChild(page);
    }
    if (!document.getElementById('teStyle')) {
      const style = document.createElement('style');
      style.id = 'teStyle';
      style.textContent = getStyles();
      document.head.appendChild(style);
    }
  }

  function renderList() {
    const el = document.getElementById('teContent');
    if (el) el.innerHTML = renderTopicList();
  }

  // ========== 选择话题 ==========
  function select(topicId) {
    currentTopic = TOPICS.find(t => t.id === topicId);
    const el = document.getElementById('teContent');
    if (el) el.innerHTML = renderTopicDetail();
  }

  // ========== 随机抽题 ==========
  function random() {
    const idx = Math.floor(Math.random() * TOPICS.length);
    select(TOPICS[idx].id);
    toast('🎲 抽到了：' + TOPICS[idx].title);
  }

  // ========== 返回话题列表 ==========
  function back() {
    stopRecord();
    currentTopic = null;
    renderList();
  }

  // ========== 录音控制 ==========
  function toggleRecord() {
    if (isRecording) {
      stopRecord();
    } else {
      startRecord();
    }
  }

  function startRecord() {
    isRecording = true;
    recordSeconds = 0;
    userSpeech = '';
    
    document.getElementById('teRecordBtn').textContent = '⏸️ 录音中...';
    document.getElementById('teRecordBtn').classList.add('recording');
    document.getElementById('teStopBtn').style.display = 'inline-block';
    document.getElementById('teSpeechBox').style.display = 'block';
    document.getElementById('teSpeechText').textContent = '正在听你说...';
    document.getElementById('teFeedback').style.display = 'none';

    // 计时器
    recordTimer = setInterval(() => {
      recordSeconds++;
      document.getElementById('teTimer').textContent = `${formatTime(recordSeconds)} / 1:00`;
      if (recordSeconds >= 60) {
        toast('⏰ 1分钟到！');
        stopRecord();
      }
    }, 1000);

    // 语音识别
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.continuous = true;
        recognition.interimResults = true;
        
        recognition.onresult = (e) => {
          let transcript = '';
          for (let i = 0; i < e.results.length; i++) {
            transcript += e.results[i][0].transcript;
          }
          userSpeech = transcript;
          document.getElementById('teSpeechText').textContent = transcript;
        };
        
        recognition.onerror = (e) => {
          console.log('语音识别错误:', e.error);
        };
        
        recognition.start();
      }
    } catch (e) {
      console.log('语音识别不可用:', e);
    }
  }

  function stopRecord() {
    if (!isRecording) return;
    isRecording = false;
    
    if (recordTimer) {
      clearInterval(recordTimer);
      recordTimer = null;
    }
    
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
      recognition = null;
    }
    
    document.getElementById('teRecordBtn').textContent = '🎤 开始录音';
    document.getElementById('teRecordBtn').classList.remove('recording');
    document.getElementById('teStopBtn').style.display = 'none';
    
    // 生成反馈
    if (recordSeconds > 0) {
      generateFeedback();
    }
    
    // 记录学习数据
    if (window.recordStudy) {
      window.recordStudy('exam', '话题表达', 1);
    }
  }

  // ========== 生成反馈 ==========
  function generateFeedback() {
    const feedback = document.getElementById('teFeedback');
    const speechLen = userSpeech.length;
    
    // 简单评定
    let timeScore = recordSeconds >= 50 ? '优秀' : recordSeconds >= 30 ? '良好' : '待加强';
    let contentScore = speechLen >= 150 ? '内容充实' : speechLen >= 80 ? '内容适中' : '内容偏少';
    
    const tips = [];
    if (recordSeconds < 30) tips.push('⏱️ 表达时间偏短，建议展开论述，至少说满40秒');
    if (speechLen < 80) tips.push('📝 内容可以更丰富，参考分析框架，从背景-矛盾-立场-对策展开');
    if (recordSeconds >= 50 && speechLen >= 150) tips.push('✅ 时间和内容都很棒，继续保持！');
    tips.push('💡 建议开头先亮明观点，中间分点论述，结尾总结升华');
    tips.push('💡 可以使用"第一、第二、第三"这样的连接词，让逻辑更清晰');
    
    feedback.innerHTML = `
      <div class="te-feedback-title">📊 表达评定</div>
      <div class="te-feedback-scores">
        <div class="te-score-item">
          <div class="te-score-label">表达时长</div>
          <div class="te-score-value">${formatTime(recordSeconds)}</div>
          <div class="te-score-tag">${timeScore}</div>
        </div>
        <div class="te-score-item">
          <div class="te-score-label">表达字数</div>
          <div class="te-score-value">${speechLen}字</div>
          <div class="te-score-tag">${contentScore}</div>
        </div>
      </div>
      <div class="te-feedback-tips">
        <div class="te-tips-title">💡 改进建议</div>
        <ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul>
      </div>
      <div class="te-feedback-actions">
        <button class="te-btn te-btn-outline" onclick="TopicExpress.select('${currentTopic.id}')">🔄 再练一次</button>
        <button class="te-btn te-btn-primary" onclick="TopicExpress.random()">🎲 下一个话题</button>
      </div>
    `;
    feedback.style.display = 'block';
  }

  // ========== 关闭（返回行测主页，与其他模块的返回方式一致） ==========
  function close() {
    stopRecord();
    currentTopic = null;
    if (typeof navigateTo === 'function') {
      navigateTo('exam');
    } else {
      const page = document.getElementById('page-exam-topic');
      if (page) page.classList.remove('active');
    }
  }

  // ========== 样式 ==========
  function getStyles() {
    return `
      /* 页内全屏面板：不再使用 modal 遮罩，作为 .page 内的卡片呈现 */
      .te-panel {
        width: 100%; max-width: 720px; margin: 0 auto;
        background: var(--card, #fff); border-radius: 20px; overflow: hidden;
        border: 1px solid var(--border, #eee);
        display: flex; flex-direction: column;
      }
      .te-page-footer { padding: 16px 20px 4px; text-align: center; }
      #teContent { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
      
      .te-header { padding: 24px 20px 12px; text-align: center; }
      .te-title { font-size: 22px; font-weight: 800; color: var(--text, #333); margin-bottom: 6px; }
      .te-subtitle { font-size: 13px; color: var(--text-secondary, #888); line-height: 1.5; }
      .te-actions { padding: 12px 20px; display: flex; align-items: center; gap: 12px; }
      .te-count { font-size: 12px; color: var(--text-muted, #aaa); }
      .te-list { padding: 0 16px 16px; flex: 1; overflow-y: auto; }
      .te-card {
        display: flex; align-items: center; gap: 14px; padding: 14px 16px;
        border-radius: 14px; margin-bottom: 10px; cursor: pointer;
        background: var(--bg, #f8f9fa); border: 1px solid var(--border, #eee);
        transition: all 0.2s;
      }
      .te-card:hover { transform: translateY(-2px); border-color: var(--primary, #5B8DEF); box-shadow: 0 4px 12px rgba(91,141,239,0.15); }
      .te-icon { font-size: 28px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: rgba(91,141,239,0.1); border-radius: 12px; }
      .te-info { flex: 1; }
      .te-cat { font-size: 11px; color: var(--primary, #5B8DEF); font-weight: 600; margin-bottom: 2px; }
      .te-title { font-size: 15px; font-weight: 700; color: var(--text, #333); }
      .te-arrow { color: var(--text-muted, #ccc); font-size: 18px; }
      
      .te-detail-header { padding: 20px; background: linear-gradient(135deg, rgba(91,141,239,0.1), rgba(91,141,239,0.05)); border-bottom: 1px solid var(--border, #eee); }
      .te-back { border: none; background: rgba(0,0,0,0.06); padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--text, #333); margin-bottom: 12px; }
      .te-back:hover { background: rgba(0,0,0,0.1); }
      .te-detail-title { font-size: 20px; font-weight: 800; color: var(--text, #333); margin-bottom: 4px; }
      .te-detail-cat { font-size: 12px; color: var(--primary, #5B8DEF); font-weight: 600; }
      .te-detail-content { padding: 16px 20px; flex: 1; overflow-y: auto; }
      .te-section { margin-bottom: 20px; }
      .te-section-title { font-size: 14px; font-weight: 700; color: var(--text, #333); margin-bottom: 8px; }
      .te-section-text { font-size: 13px; line-height: 1.7; color: var(--text-secondary, #666); }
      .te-highlight { background: rgba(255,193,7,0.15); padding: 10px 14px; border-radius: 10px; border-left: 3px solid #FFC107; }
      .te-perspective { margin-bottom: 12px; padding: 12px; background: var(--bg, #f8f9fa); border-radius: 10px; }
      .te-perspective-title { font-size: 13px; font-weight: 700; color: var(--text, #333); margin-bottom: 6px; }
      .te-perspective-points { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.6; color: var(--text-secondary, #666); }
      .te-perspective-points li { margin-bottom: 4px; }
      .te-keywords { display: flex; gap: 8px; flex-wrap: wrap; }
      .te-keyword { font-size: 12px; padding: 4px 10px; border-radius: 12px; background: rgba(91,141,239,0.1); color: var(--primary, #5B8DEF); }
      
      .te-record-section { padding: 16px 20px; border-top: 1px solid var(--border, #eee); background: var(--bg, #fafafa); }
      .te-record-title { font-size: 16px; font-weight: 800; color: var(--text, #333); margin-bottom: 4px; text-align: center; }
      .te-record-desc { font-size: 12px; color: var(--text-secondary, #888); text-align: center; margin-bottom: 12px; }
      .te-timer { font-size: 28px; font-weight: 800; color: var(--primary, #5B8DEF); text-align: center; margin-bottom: 12px; font-family: monospace; }
      .te-record-actions { display: flex; gap: 10px; justify-content: center; margin-bottom: 12px; }
      .te-btn { padding: 10px 20px; border-radius: 12px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
      .te-btn-primary { background: var(--primary, #5B8DEF); color: #fff; }
      .te-btn-primary:hover { opacity: 0.9; }
      .te-btn-outline { background: transparent; border: 1px solid var(--border, #ddd); color: var(--text, #333); }
      .te-btn-outline:hover { background: var(--bg, #f5f5f5); }
      .te-btn-record { background: #E53935; color: #fff; }
      .te-btn-record.recording { background: #FF9800; animation: pulse 1s infinite; }
      @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
      .te-speech-box { margin-bottom: 12px; padding: 12px; background: var(--bg, #fff); border-radius: 10px; border: 1px solid var(--border, #eee); }
      .te-speech-title { font-size: 12px; font-weight: 600; color: var(--text-secondary, #888); margin-bottom: 6px; }
      .te-speech-text { font-size: 13px; line-height: 1.6; color: var(--text, #333); max-height: 80px; overflow-y: auto; }
      .te-feedback { margin-top: 12px; padding: 16px; background: var(--bg, #fff); border-radius: 12px; border: 1px solid var(--border, #eee); }
      .te-feedback-title { font-size: 15px; font-weight: 800; color: var(--text, #333); margin-bottom: 12px; text-align: center; }
      .te-feedback-scores { display: flex; gap: 12px; margin-bottom: 12px; }
      .te-score-item { flex: 1; text-align: center; padding: 12px; background: var(--bg, #f8f9fa); border-radius: 10px; }
      .te-score-label { font-size: 11px; color: var(--text-secondary, #888); margin-bottom: 4px; }
      .te-score-value { font-size: 20px; font-weight: 800; color: var(--primary, #5B8DEF); margin-bottom: 4px; }
      .te-score-tag { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: rgba(76,175,80,0.15); color: #4CAF50; display: inline-block; }
      .te-feedback-tips { margin-bottom: 12px; }
      .te-tips-title { font-size: 13px; font-weight: 700; color: var(--text, #333); margin-bottom: 8px; }
      .te-feedback-tips ul { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.7; color: var(--text-secondary, #666); }
      .te-feedback-tips li { margin-bottom: 4px; }
      .te-feedback-actions { display: flex; gap: 10px; justify-content: center; }
    `;
  }

  // ========== 暴露API ==========
  window.TopicExpress = {
    open, select, random, back, toggleRecord, stopRecord, close
  };

  console.log('✅ 话题表达训练已加载');
})();
