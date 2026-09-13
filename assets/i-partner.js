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
      replyStyle: '先共情，再温和地给出建议，语气柔软，多用语气词',
      coachFocus: '帮用户把"不敢开口"变成"敢说第一句"，重点降低开口门槛，一次只练一句'
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
      replyStyle: '幽默风趣，反应快，会主动抛话题，教你社交技巧',
      coachFocus: '教用户接话与破冰的"万能句式"，强调套路可复用，鼓励当场套用练一遍'
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
      replyStyle: '理性客观，逻辑清晰，会分析问题本质，给出结构化建议',
      coachFocus: '把沟通拆成"目标-对象-障碍-话术"四格，先问清场景要素再给方案'
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
      replyStyle: '傲娇，有点冷淡，但会认真回应，需要你主动破冰',
      coachFocus: '模拟真实社交里的"难搞对象"，训练用户在冷淡回应下继续把话说完'
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
      replyStyle: '稳重真诚，像老朋友一样，会认真倾听，给出实在的建议',
      coachFocus: '给出最朴素、能立刻照做的说法，帮用户放下心理负担，别把沟通想复杂'
    }
  ];

  // ========== 人格语气包装（用于把通用话术套上各伙伴的口吻） ==========
  const PARTNER_FLAVOR = {
    rabbit: { lead: '这种事确实会有点为难，', tail: '别急，先把这一句念顺，说不出来也没关系，我陪你慢慢练🤗' },
    fox: { lead: '这题我熟！', tail: '记住这个句式，下次碰上直接套，稳得很😎' },
    owl: { lead: '先拆一下这个场景：', tail: '建议你把这句默念两遍，再补上你自己的具体情况。' },
    cat: { lead: '……行吧，教你可以，别说是我教的。（其实挺管用）', tail: '哼，学会了就赶紧去用。😒' },
    bear: { lead: '这事啊，我给你说句实在的：', tail: '别想太复杂，照这句说，说错了也没啥大不了的。' }
  };

  // ========== 场景话术库（通用、可操作；不编造具体企业/年份/事件） ==========
  const SCENARIOS = [
    {
      key: 'refuse',
      match: ['拒绝', '不想帮', '推不掉', '不好意思拒绝', '加活', '接不了', '不想去', '婉拒'],
      method: '别只说"不行"，按"接住请求→说明自己当前的优先级→给出你能做到的部分→把决定权交回对方"四步走。拒绝的是这件事，不是这个人。',
      script: '这事我理解挺急的，不过我今天手上有__要交付，实在排不开。我可以__（明天上午帮你/先帮你看看框架/推荐更合适的人），你看行吗？'
    },
    {
      key: 'apologize',
      match: ['道歉', '说错话', '得罪', '迟到', '搞砸', '认错', '惹生气'],
      method: '顺序是"先道歉→再说明不是故意→最后给补救动作"。别一上来解释一大堆，对方没接住情绪时，解释听起来都像借口。',
      script: '刚才那句话我说得不合适，是我的问题，没有别的意思。我后面注意__，这次的__我来补上，你看可以吗？'
    },
    {
      key: 'breakice',
      match: ['破冰', '不认识', '陌生人', '第一次见面', '不熟', '搭话', '冷场'],
      method: '从"眼前共同的处境"开口最省力，再抛一个对方好回答的小问题。别想着要有趣，能让对方接得上就够了。',
      script: '你好，我也是第一次来__，刚才还在想坐哪儿。你之前来过吗？有没有什么要注意的？'
    },
    {
      key: 'report',
      match: ['汇报', '向领导', '跟领导说', '同步进度', '请示', '工作进度'],
      method: '先说结论，再说进展，最后说卡点和需要的支持。领导最怕听完不知道你做到哪一步、要不要他拍板。',
      script: '__目前进度是__，预计__能完成。现在卡在__，我想请你定一下__，其余的我按原计划推进。'
    },
    {
      key: 'askhelp',
      match: ['求助', '帮忙', '请教', '想请', '不知道怎么开口', '找人帮'],
      method: '把"能不能帮我"换成"具体要对方做什么+占用多久+你可以怎么回报"，对方答应的成本越低，越容易说出口。',
      script: '有个事想请你帮个忙：__，大概占你__分钟。要是你这边不方便直说就行，下次你有事也可以找我。'
    },
    {
      key: 'disagree',
      match: ['不同意', '有意见', '反对', '想法不一样', '不敢说', '表达不同'],
      method: '先肯定对方考虑到了什么，再讲你的顾虑，最后给一个可以试的小方案。直接用"但是"最容易把气氛搞僵。',
      script: '你说的__我认同，尤其是__这点。我还有一个顾虑是__，要不我们先小范围试一下__，看看效果再定？'
    },
    {
      key: 'urge',
      match: ['催', '催进度', '没回复', '拖', '什么时候', '催一下'],
      method: '催人别用"你怎么还没"，改成"我这边有个时间点+确认对方卡在哪"，把催变成协作，对方不容易有情绪。',
      script: '想跟你对一下__的进度，我这边__前要交，所以想确认下你那部分大概什么时候能给我？如果有卡点我这边可以先顶一下。'
    },
    {
      key: 'speakup',
      match: ['开会', '发言', '被点名', '会议上', '当众', '不敢讲'],
      method: '被点名又没想好时，先说一句"接住"的话争取十几秒，再讲你确定的部分，不确定的就说"我确认一下再回复"，别硬撑乱讲。',
      script: '我先说一下我了解的这部分：__。另外__这块我还需要确认一下数据，我__前在群里补给大家。'
    },
    {
      key: 'smalltalk',
      match: ['闲聊', '没话题', '尬聊', '接不上', '聊天', '怎么接话'],
      method: '接话用"复述对方最后一句话+追问一个具体细节"，比现想一个新话题省脑子，也显得你在认真听。',
      script: '你说的__我还挺好奇的，__是怎么弄的？/ 后来怎么样了？'
    },
    {
      key: 'praise',
      match: ['被夸', '夸我', '怎么回应', '夸别人', '表扬'],
      method: '被夸别急着否认，说一句谢谢再把功劳分出去就好；夸别人要说具体的点，泛泛的"好厉害"听起来像客套。',
      script: '谢谢，这次__多亏了__，我自己做肯定没这么顺。/ 你刚才那个__处理得很稳，特别是__那一下。'
    }
  ];

  // ========== 通用教练上下文（真人设 LLM 与本地模板共用） ==========
  const COACH_CONTEXT = [
    '使用场景：这是给内向者（i人）练习沟通的安全练习场，用户说的每一句基本都是在练表达。',
    '你的任务：帮用户把"想说但说不出口"的话，变成一句能直接照着开口说的句子。',
    '回复结构（按顺序，缺一不可）：',
    '①接住：一句话共情或复述用户的处境，不做评判；',
    '②方法：给一条具体可操作的沟通建议，说清"先做什么、再做什么"，不要讲大道理；',
    '③话术：给一句用户可以直接照着说的话，用「」包起来，口语化、短、自然；',
    '④追问：用一个具体问题把对话延续下去。',
    '硬性约束：不要编造具体的公司名、年份、数据或真实事件；不要说"加油你可以的"这类空话；单次回复控制在150字以内。'
  ].join('\n');

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

  // ========== 生成伙伴回复（基于性格的模板回复 + 场景话术库） ==========
  function generateReply(partner, userMsg) {
    const msg = (userMsg || '').toLowerCase();

    // 0) 场景话术优先：命中具体沟通场景时，直接给"方法 + 可照说的话术"
    const scenario = matchScenario(msg);
    if (scenario) {
      return composeScenarioReply(partner, scenario);
    }

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

  // 命中场景 → 返回该场景的通用方法 + 可直接照说的话术
  function matchScenario(msg) {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const s = SCENARIOS[i];
      for (let j = 0; j < s.match.length; j++) {
        if (msg.indexOf(s.match[j]) !== -1) return s;
      }
    }
    return null;
  }

  function composeScenarioReply(partner, scenario) {
    const flavor = PARTNER_FLAVOR[partner.id] || { lead: '', tail: '' };
    const parts = [];
    if (flavor.lead) parts.push(flavor.lead);
    parts.push(scenario.method);
    parts.push('你可以直接这样说：');
    parts.push('「' + scenario.script + '」');
    if (flavor.tail) parts.push(flavor.tail);
    return parts.join('\n');
  }

  function getGreetingReply(p) {
    const replies = {
      rabbit: '你好呀～看到你真开心！今天想练哪句话？直接说场景就行，比如"我不知道怎么拒绝同事"，我陪你一句一句顺😊',
      fox: '哟！你来啦！别寒暄了，直接上场景：拒绝、道歉、破冰、汇报、催进度，挑一个，我现场给你编一句能用的🔥',
      owl: '你好。直接告诉我场景三要素就行：跟谁说、想达成什么、卡在哪一句。我按这三样帮你拆。',
      cat: '……又是你啊。算了，既然来了就坐吧。今天又卡在哪句话上了？😒（说吧，我在听）',
      bear: '来啦！快坐快坐。今天想练哪句？想到啥说啥，说不圆的地方我帮你捋☕'
    };
    return replies[p.id] || '你好～想练什么场景，直接说就行。';
  }

  function getThanksReply(p) {
    const replies = {
      rabbit: '不用谢啦～能帮到你我也很开心！💕',
      fox: '客气啥！咱们谁跟谁啊！有问题随时找我！😎',
      owl: '不客气。希望我的分析对你有帮助。',
      cat: '……哼，算你有良心。记住了啊，下次别再来问同一句。😳',
      bear: '害，这有啥的！朋友之间不就应该互相帮忙嘛！下次真用上了，记得回来跟我说效果。'
    };
    return replies[p.id] || '不客气～把这句存进备忘录，下次直接就能用。';
  }

  function getByeReply(p) {
    const replies = {
      rabbit: '再见啦～记得好好休息，下次再聊哦！👋',
      fox: '走啦？那下次继续练！记住今天学的技巧哦！💪',
      owl: '再见。建议你今天复盘一下我们聊的内容。',
      cat: '……终于走了。（其实有点舍不得）下次别太久才来啊。走之前把今天那句再念一遍。😤',
      bear: '行，那你先忙！有空再来唠，随时欢迎！临走前想想：今天这句，明天能在哪儿用上一次？'
    };
    return replies[p.id] || '再见～记得挑一句今天练的，明天真用一次，比在这儿练十次都管用。';
  }

  function getEncourageReply(p) {
    const replies = {
      rabbit: '别紧张呀～你已经很棒了！先做两步：慢慢呼一口气，再把第一句话在心里过一遍。第一句只要出口，后面就顺了。真卡住了就先说：「我有点紧张，我想慢慢说，可以吗？」对方一般都会等你🤗',
      fox: '紧张啥！给你个笨办法但特别管用：把要说的第一句提前写下来念三遍，开口时照着念就行，不用现场现想。你也可以直接开场：「我想先捋一下，怕说乱了」——这不丢人，反而显得稳😎',
      owl: '紧张通常来自"不知道下一句说什么"。建议把内容压成三句话：我要说什么结论、依据是什么、我希望对方做什么。写下来照着说，紧张会明显下降。开场可以先用这句争取时间：「我整理一下，大概三点。」',
      cat: '……怕什么，又不会吃了你。（小声）说错一句又不会怎么样，谁还记得啊。你就想：最坏也就是对方说"我再想想"，那也不亏。实在不行，先发条消息铺垫一下再说😳',
      bear: '嗨，紧张啥啊！谁都有第一次。你就记住一件事：把对方当成来办事的人，不是来评判你的。开不了口就先递一句实在话：「这事我想当面跟你说清楚，怕打字讲不明白。」说完这句，后面自然就接上了。'
    };
    return replies[p.id] || '别紧张，先只练第一句：把想说的话写在备忘录里，照着念一遍，念顺了再开口。';
  }

  function getQuestionReply(p, question) {
    const replies = {
      rabbit: `这个问题问得真好～让我想想啊……我觉得呢，最重要的是跟着自己的感觉走，你觉得呢？😊`,
      fox: `哟！这个问题有意思！要我说啊——这就得看具体情况了！不过我可以教你一个万能回答公式：先肯定+再分析+给选项，咋样？学到没？😎`,
      owl: `关于"${question}"这个问题，我们可以从三个维度来分析：第一，核心诉求是什么；第二，有哪些可选方案；第三，每个方案的利弊。你想先从哪个角度深入？`,
      cat: `……这问题问我干嘛。（思考了一下）不过既然你问了……我先给你一句能用的：「这事我想先听你的想法，我再补充。」把球抛回去，你就不用现场想答案了😒`,
      bear: `这个问题啊……我给你个实在的说法：答不上来的时候别硬撑，先说「这个我得确认一下，__前给你回复」。比现场瞎编强一百倍，对方也觉得你靠谱。`
    };
    return replies[p.id] || '这个问题很有意思～你先告诉我：跟谁说、想达成什么，我好给你编一句能直接用的。';
  }

  function getDefaultReply(p, userMsg) {
    const replies = {
      rabbit: `嗯嗯，我在听呢～你说的这个我能理解，继续说呀，我想多听听😊`,
      fox: `哦？这个有点意思！来，展开说说！我跟你讲，遇到这种情况啊，你可以这样……（此处省略100字社交技巧）学到没？😎`,
      owl: `你说的内容我记录了。从沟通分析的角度来看，你表达的核心信息是清晰的，但可以在结构上做优化：建议使用"观点-论据-总结"的三段式，会更有说服力。`,
      cat: `……哦。（其实在认真听）所以你卡住的是哪一句？把那句原话发我，我帮你看哪里容易让人误会😒`,
      bear: `嗯嗯，我懂你的意思！这样，你别讲全貌，先用一句话说清"你想让对方做什么"。你试着填这个：「我想请他__，因为__。」填完我帮你看看顺不顺。`
    };
    return replies[p.id] || '嗯嗯，我在听～你直接说场景吧（拒绝/道歉/汇报/破冰/催进度都行），我给你一句能照着说的话。';
  }

  // ========== 真人设 LLM 接入：系统提示词与对话上下文 ==========
  // 说明：本地模板回复时不需要这两项；当外部接入真 LLM（window.IPartnerLLM）时，
  // 由下面两个函数提供人设、风格、场景话术库与近期上下文，保证 5 人格与 replyStyle 不被写死在调用方。
  function buildSystemPrompt(partner) {
    const p = partner || currentPartner;
    if (!p) { return COACH_CONTEXT; }
    const flavor = PARTNER_FLAVOR[p.id] || { lead: '', tail: '' };
    return [
      COACH_CONTEXT,
      '你现在扮演「' + p.name + '」，人设：' + p.personality + '（' + p.traits.join('、') + '）。',
      '回复风格：' + p.replyStyle + '。',
      '你的练习重点：' + (p.coachFocus || '帮用户把话说出口。'),
      '口吻参考：' + (flavor.lead + flavor.tail || '自然、口语化，别端着。'),
      '下面这些是各场景的参考话术，结合用户具体情况改写后使用，不要原样照抄，也不要编造具体企业名、年份和数据：',
      SCENARIOS.map(function (s, i) { return (i + 1) + '. ' + s.key + '：' + s.script; }).join('\n')
    ].join('\n');
  }

  function buildMessages(partner, history, userMsg) {
    const messages = [{ role: 'system', content: buildSystemPrompt(partner) }];
    const list = Array.isArray(history) ? history : [];
    const start = Math.max(0, list.length - 10);
    for (let i = start; i < list.length; i++) {
      messages.push({ role: list[i].role === 'user' ? 'user' : 'assistant', content: list[i].text });
    }
    messages.push({ role: 'user', content: userMsg });
    return messages;
  }

  // 已接真 LLM 时走 LLM，否则回退到本地模板回复（保证现有行为不变）
  function fetchReply(partner, userMsg, done) {
    let settled = false;
    const finish = function (text) {
      if (settled) { return; }
      settled = true;
      done(text);
    };
    try {
      if (typeof window.IPartnerLLM === 'function') {
        window.IPartnerLLM({
          partner: partner,
          systemPrompt: buildSystemPrompt(partner),
          messages: buildMessages(partner, chatHistory, userMsg)
        }, function (text) {
          const reply = (text && String(text).trim()) ? String(text).trim() : generateReply(partner, userMsg);
          finish(reply);
        });
        return;
      }
    } catch (err) {
      console.warn('[i-partner] LLM 回复失败，回退本地模板：', err);
    }
    finish(generateReply(partner, userMsg));
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

    // 模拟伙伴"正在输入"（已接真 LLM 时由 LLM 生成，否则回退到本地模板回复）
    setTimeout(() => {
      fetchReply(currentPartner, text, (reply) => {
        chatHistory.push({ role: 'partner', text: reply });
        chatCount++;
        updateChatUI();

        // 记录学习数据
        if (window.recordStudy) {
          window.recordStudy('comm', 'i人聊天', 1);
        }
      });
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
    open, select, send, sendTopic, back, close,
    // 供真 LLM 接入方使用（不改现有 5 人格与 replyStyle 结构）
    buildSystemPrompt: buildSystemPrompt,
    buildMessages: buildMessages,
    getScenarios: function () { return SCENARIOS.slice(); },
    getPartners: function () { return PARTNERS.slice(); }
  };

  console.log('✅ i人伙伴团已加载');
})();
