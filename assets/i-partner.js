/* ============================================================
 * i人伙伴团 + 聊天室
 * 不同性格的虚拟伙伴，文字互动，i人专属社交练习场
 * ------------------------------------------------------------
 * 20260915b 数据显示优化：
 *   ① 场景话术库（10 条）从"只做关键词匹配"改为界面可见可点；
 *   ② 伙伴卡补上 coachFocus / replyStyle（原仅供 LLM 提示词使用，界面从未显示）；
 *   ③ 聊天记录落地 localStorage，补时间显示、继续上次对话、清空；
 *   ④ 修 undefined / NaN / 空值露出、换行丢失、气泡与底色同色、窄屏挤压；
 *   ⑤ 回复库按意图分类扩充，同类随机取用不连续重复；无 emoji。
 * ------------------------------------------------------------
 * 20260915b 角色扮演合并（角色扮演菜单从本页下线后的接住方）：
 *   ⑥ 伙伴选择页「进阶实战 · 角色扮演」入口 → openRoleplay() → window.mountRolePlay()
 *      （assets/roleplay.js，同一份实现，不复制代码）渲染进 #ipContent，ADR-3 页面内呈现；
 *   ⑦ roleplay.js 是 defer 可选依赖：typeof 守卫 + 3 秒短轮询，拿不到就降级文案，不白屏；
 *   ⑧ 剧本内「返回」通过 options.onBack 回到伙伴选择页，不退出 i人伙伴团面板。
 * ============================================================ */
(function () {
  'use strict';

  /* ========== 存储常量 ========== */
  var LS_CHAT = 'study_ipartner_chat_v1';   // 每位伙伴的会话记录
  var LS_STATS = 'study_ipartner_stats_v1'; // 累计互动句数 / 最近互动时间
  var MAX_STORE = 200;                      // 单伙伴最多存 200 条
  var MAX_RENDER = 120;                     // 单屏最多渲染 120 条（防长列表卡顿）
  var LLM_TIMEOUT = 6000;                   // 真 LLM 超过 6 秒无回包则本地兜底

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
      greet: '嗨，我是小兔。今天想聊点什么呀？不用紧张，慢慢说就好。',
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
      greet: '嘿，我是小狐。今天咱们练点啥？接话、破冰，还是拯救尬聊？',
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
      greet: '你好，我是小鸮。需要分析哪个沟通场景？或者想练练逻辑表达？',
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
      greet: '……是你啊。有什么事快说，我还要打盹呢。（别担心，我只是嘴硬）',
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
      greet: '来啦？坐，喝口水。今天想聊点啥？工作、学习，还是随便唠唠？',
      replyStyle: '稳重真诚，像老朋友一样，会认真倾听，给出实在的建议',
      coachFocus: '给出最朴素、能立刻照做的说法，帮用户放下心理负担，别把沟通想复杂'
    }
  ];

  // ========== 人格语气包装（把通用话术套上各伙伴的口吻） ==========
  const PARTNER_FLAVOR = {
    rabbit: { lead: '这种事确实会有点为难，', tail: '别急，先把这一句念顺，说不出来也没关系，我陪你慢慢练。' },
    fox: { lead: '这题我熟！', tail: '记住这个句式，下次碰上直接套，稳得很。' },
    owl: { lead: '先拆一下这个场景：', tail: '建议你把这句默念两遍，再补上你自己的具体情况。' },
    cat: { lead: '……行吧，教你可以，别说是我教的。（其实挺管用）', tail: '哼，学会了就赶紧去用。' },
    bear: { lead: '这事啊，我给你说句实在的：', tail: '别想太复杂，照这句说，说错了也没啥大不了的。' }
  };

  // ========== 场景话术库（通用、可操作；不编造具体企业/年份/事件） ==========
  // name：界面展示用的场景名；match[0]：聊天室点场景时发送的默认触发词
  const SCENARIOS = [
    {
      key: 'refuse',
      name: '拒绝',
      match: ['拒绝', '不想帮', '推不掉', '不好意思拒绝', '加活', '接不了', '不想去', '婉拒'],
      method: '别只说"不行"，按"接住请求→说明自己当前的优先级→给出你能做到的部分→把决定权交回对方"四步走。拒绝的是这件事，不是这个人。',
      script: '这事我理解挺急的，不过我今天手上有__要交付，实在排不开。我可以__（明天上午帮你/先帮你看看框架/推荐更合适的人），你看行吗？'
    },
    {
      key: 'apologize',
      name: '道歉',
      match: ['道歉', '说错话', '得罪', '迟到', '搞砸', '认错', '惹生气'],
      method: '顺序是"先道歉→再说明不是故意→最后给补救动作"。别一上来解释一大堆，对方没接住情绪时，解释听起来都像借口。',
      script: '刚才那句话我说得不合适，是我的问题，没有别的意思。我后面注意__，这次的__我来补上，你看可以吗？'
    },
    {
      key: 'breakice',
      name: '破冰',
      match: ['破冰', '不认识', '陌生人', '第一次见面', '不熟', '搭话', '冷场'],
      method: '从"眼前共同的处境"开口最省力，再抛一个对方好回答的小问题。别想着要有趣，能让对方接得上就够了。',
      script: '你好，我也是第一次来__，刚才还在想坐哪儿。你之前来过吗？有没有什么要注意的？'
    },
    {
      key: 'report',
      name: '汇报',
      match: ['汇报', '向领导', '跟领导说', '同步进度', '请示', '工作进度'],
      method: '先说结论，再说进展，最后说卡点和需要的支持。领导最怕听完不知道你做到哪一步、要不要他拍板。',
      script: '__目前进度是__，预计__能完成。现在卡在__，我想请你定一下__，其余的我按原计划推进。'
    },
    {
      key: 'askhelp',
      name: '求助',
      match: ['求助', '帮忙', '请教', '想请', '不知道怎么开口', '找人帮'],
      method: '把"能不能帮我"换成"具体要对方做什么+占用多久+你可以怎么回报"，对方答应的成本越低，越容易说出口。',
      script: '有个事想请你帮个忙：__，大概占你__分钟。要是你这边不方便直说就行，下次你有事也可以找我。'
    },
    {
      key: 'disagree',
      name: '提反对意见',
      match: ['不同意', '有意见', '反对', '想法不一样', '不敢说', '表达不同'],
      method: '先肯定对方考虑到了什么，再讲你的顾虑，最后给一个可以试的小方案。直接用"但是"最容易把气氛搞僵。',
      script: '你说的__我认同，尤其是__这点。我还有一个顾虑是__，要不我们先小范围试一下__，看看效果再定？'
    },
    {
      key: 'urge',
      name: '催进度',
      match: ['催', '催进度', '没回复', '拖', '什么时候', '催一下'],
      method: '催人别用"你怎么还没"，改成"我这边有个时间点+确认对方卡在哪"，把催变成协作，对方不容易有情绪。',
      script: '想跟你对一下__的进度，我这边__前要交，所以想确认下你那部分大概什么时候能给我？如果有卡点我这边可以先顶一下。'
    },
    {
      key: 'speakup',
      name: '当众发言',
      match: ['开会', '发言', '被点名', '会议上', '当众', '不敢讲'],
      method: '被点名又没想好时，先说一句"接住"的话争取十几秒，再讲你确定的部分，不确定的就说"我确认一下再回复"，别硬撑乱讲。',
      script: '我先说一下我了解的这部分：__。另外__这块我还需要确认一下数据，我__前在群里补给大家。'
    },
    {
      key: 'smalltalk',
      name: '接话闲聊',
      match: ['闲聊', '没话题', '尬聊', '接不上', '聊天', '怎么接话'],
      method: '接话用"复述对方最后一句话+追问一个具体细节"，比现想一个新话题省脑子，也显得你在认真听。',
      script: '你说的__我还挺好奇的，__是怎么弄的？/ 后来怎么样了？'
    },
    {
      key: 'praise',
      name: '被夸与夸人',
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
    '硬性约束：不要编造具体的公司名、年份、数据或真实事件；不要说"加油你可以的"这类空话；单次回复控制在150字以内。',
    '不要使用 emoji，用纯文字表达语气。'
  ].join('\n');

  // ========== 话题库 ==========
  const CHAT_TOPICS = [
    '今天遇到了什么有趣的事？',
    '如果可以拥有一种超能力，你想要什么？',
    '你最近在追什么剧或看什么书？',
    '周末一般怎么安排？',
    '工作或学习中最有成就感的一件事？',
    '如果明天不用上班上学，你会做什么？',
    '最近学到了什么新东西？',
    '你觉得i人最大的优势是什么？',
    '有没有一直想做但还没做的事？',
    '描述一下你理想中的一天'
  ];
  var TOPIC_PAGE = 4; // 一屏显示的话题数

  /* ========== 意图化回复库 ==========
   * 结构：REPLY_BANK[意图][伙伴 id] = [多条不同措辞]
   * _default 为未知人格时的兜底。同类内用"洗牌取用"避免连续重复。 */
  const REPLY_BANK = {
    greeting: {
      rabbit: [
        '你来啦，我正好在。今天想练哪一句？直接说场景就行，说不完整也没关系，我陪你慢慢顺。',
        '嗨，先不用想怎么说才得体。你就当跟我聊天，想到哪说到哪，卡住的地方我帮你接。',
        '见到你挺高兴的。有没有哪句话一直卡在喉咙里？把那句原话发过来，我们今天就练这一句。'
      ],
      fox: [
        '来了！别寒暄，直接上场景。拒绝、道歉、破冰、汇报、催进度，挑一个，我现场给你编一句能用的。',
        '哟，你终于来了。今天想练哪种？先说最让你头疼的那个，越具体我越好给你套句式。',
        '来啦来啦。这样，你先用一句话说完"你想让对方干啥"，剩下的包装我来做。'
      ],
      owl: [
        '你好。直接给我三个要素就行：跟谁说、想达成什么、卡在哪一句。我按这三样帮你拆。',
        '你好。先确认一下目标：这次沟通，你希望结束后对方做的是什么？把这个定下来，话就好编了。',
        '你好。你可以先把场景说个大概，我会帮你拆成"目标-对象-障碍-话术"四格，再给具体句子。'
      ],
      cat: [
        '……又是你。算了，坐吧。今天又卡在哪句话上了？说吧，我在听。',
        '哦，来了啊。别绕弯子，直接说事，我最烦铺垫。',
        '你倒是挺准时的。（清了清嗓子）行，今天想练什么，说吧。'
      ],
      bear: [
        '来啦，快坐。今天想聊点啥？想到啥说啥，说不圆的地方我帮你捋。',
        '哟，来了。喝口水先。你今天遇到的这事，是跟谁有关？咱从那个人说起。',
        '来啦。别紧张，咱不考试。你就当跟老朋友唠，说错了也不扣分。'
      ],
      _default: [
        '你好，我在。想练什么场景直接说，比如拒绝、道歉、汇报，我给你一句能照着说的。',
        '你好。告诉我跟谁说、想达成什么、卡在哪一句，我照这三样帮你想。',
        '来啦。今天先从一句开始，就一句，说完就算赢。'
      ]
    },
    thanks: {
      rabbit: [
        '不用谢。真要谢我，就把那句话明天真用一次，用完回来告诉我对方啥反应。',
        '别客气呀。你能开口说就已经很好了，剩下的交给时间。',
        '哪用得着谢。你要是还拿不准，我们再把那句念两遍。'
      ],
      fox: [
        '客气啥，咱俩谁跟谁。记住那个句式，下次碰上直接套，比现想快十倍。',
        '小意思。不过我可提醒你：学会不算会，用出去才算。',
        '谢啥谢。你要真想谢我，下次碰到类似场面别躲，直接上。'
      ],
      owl: [
        '不客气。建议把这句存进备忘录，附上适用场景，下次调取会更快。',
        '不客气。如果愿意，可以复盘一下：哪一步最难开口？下次我们专门练那一步。',
        '不必谢。有帮助就行。你接着说下一个场景，我们趁热。'
      ],
      cat: [
        '哼，算你有良心。记住了啊，下次别再来问同一句。',
        '别谢了，听着别扭。学会就赶紧去用，别搁我这练个没完。',
        '行了行了，知道你记得我的好。（转过头）去吧，用得上的。'
      ],
      bear: [
        '害，这有啥的。朋友之间不就应该互相帮衬嘛。真用上了记得回来跟我说效果。',
        '谢啥。你就记住，话是说给人听的，说得不漂亮不要紧，说到位就行。',
        '别客气。下次再卡住，还来找我，我反正闲着。'
      ],
      _default: [
        '不客气。把这句存进备忘录，下次直接就能用。',
        '不用谢。挑一句今天练的，明天真用一次，比在这儿练十次都管用。',
        '客气啦。还想练别的场景就说，我都在。'
      ]
    },
    bye: {
      rabbit: [
        '好，那你先忙。今天这句别忘了，明天找个真场合用一次，我会等你的消息。',
        '去吧，记得歇会儿。练表达挺耗神的，别把自己逼太紧。',
        '再见啦。走之前把今天那句在心里过一遍，明天就不那么陌生了。'
      ],
      fox: [
        '走啦？行，下次继续。别忘了那句万能句式，我下次要抽查的。',
        '拜拜。今天学的这个，明天找个机会用掉，用完你会有成就感。',
        '行，先放你走。下次来的时候，直接告诉我你用得怎么样。'
      ],
      owl: [
        '再见。建议你今天花两分钟复盘一句：最难开口的是哪一步，下次我们针对它练。',
        '再见。今天的内容建议记一句就够，贪多反而记不住。',
        '再见。下次来的时候带上你实际说出口的版本，我们对照着改。'
      ],
      cat: [
        '……终于走了。（小声）下次别隔太久才来啊，走之前把今天那句再念一遍。',
        '走吧走吧。反正你该学的也学了。（停顿）记得用。',
        '嗯，拜。（其实有点舍不得）下次早点来。'
      ],
      bear: [
        '行，那你先忙。有空再来唠。临走前想想：今天这句，明天能在哪儿用上一次？',
        '去吧去吧，别熬夜。明天要是真用上了，回来跟我说说，我替你高兴。',
        '好，那你忙。记住了，说错一句天塌不下来，下次接着说就是了。'
      ],
      _default: [
        '再见。记得挑一句今天练的，明天真用一次。',
        '好的，先到这儿。下次想练什么直接来，我都在。',
        '拜拜。今天练的这句存好了，别过两天就忘。'
      ]
    },
    nervous: {
      rabbit: [
        '紧张很正常，说明你在意。先做两件事：慢慢呼一口气，再把第一句在心里过一遍。真卡住了就先说「我有点紧张，我想慢慢说，可以吗」，对方一般都会等你。',
        '别急，我们不追求说得多好，先追求说出口。你把第一句写下来发给我，我帮你改到顺口为止。',
        '紧张的时候人总想把话讲完美，越想越说不出。要不咱先只说一半，剩下的下次补？'
      ],
      fox: [
        '紧张啥，给你个笨办法但特别管用：把第一句提前写下来念三遍，开口时照着念，不用现场现想。',
        '怕就怕在你想一步到位。你把要说的压成一句话，先扔出去，后面自然就跟上了。',
        '教你个开场：「我想先捋一下，怕说乱了。」这不丢人，反而显得你稳。'
      ],
      owl: [
        '紧张通常来自"不知道下一句说什么"。把内容压成三句：结论、依据、希望对方做什么。写下来照着说，紧张会明显下降。',
        '先用一句争取时间：「我整理一下，大概三点。」这十几秒足够你把思路拉回来。',
        '把注意力从"我说得好不好"挪到"对方听懂了没"，紧张会少一半。'
      ],
      cat: [
        '怕什么，又不会吃了你。说错一句谁还记得啊。最坏也就是对方说"我再想想"，那也不亏。',
        '……紧张就紧张呗，又不是只有你。你就别在脑子里预演一百遍了，说完就完了。',
        '实在开不了口，先发条消息铺垫一下。打字也算沟通，不丢人。'
      ],
      bear: [
        '紧张啥，谁都有第一次。你就把对方当成来办事的人，不是来评判你的。',
        '开不了口就先递一句实在话：「这事我想当面跟你说清楚，怕打字讲不明白。」说完这句，后面自然就接上了。',
        '深呼吸一口，然后就别想了。想得越多越说不出，直接开口反而就过去了。'
      ],
      _default: [
        '别紧张，先只练第一句：把想说的话写在备忘录里照着念一遍，念顺了再开口。',
        '紧张很正常。先说一句争取时间的话：「我整理一下，大概三点。」',
        '不用一次说完美。先说出口，哪怕只说了一半，也比在脑子里排练十遍强。'
      ]
    },
    emotion: {
      rabbit: [
        '嗯，我听着。这段时间你确实撑得挺久的，累了就先歇会儿，不用马上振作。想说说具体是哪件事吗？',
        '这种感觉闷在心里最难受。你愿意说多少就说多少，我会一直听着，不会催你。',
        '听得出来你现在状态不太好。要不我们先不谈怎么解决，你就先把不痛快的那部分说痛快。'
      ],
      fox: [
        '哎，谁还没个低谷。你先把最烦的那件事说出来，一件一件来，别一股脑全堆着。',
        '听着是挺憋屈的。要不这样，你先吐槽两句，说完我们再想怎么收拾。',
        '心情不好的时候别硬扛，找个人说说真的有用。你继续说，我接着。'
      ],
      owl: [
        '听起来你现在的压力来源不止一个。我们先分一下：哪些是你能控制的，哪些暂时控制不了。先处理能控制的那部分。',
        '情绪需要先被承认，才能被处理。你现在的感受是合理的。如果愿意，说说触发它的具体事件。',
        '如果你现在说不清楚，也没关系。可以先只描述事实：发生了什么、你做了什么、结果是怎样。'
      ],
      cat: [
        '……听起来挺累的。（沉默两秒）不想说就别说，我陪你坐会儿也行。',
        '谁都有这种时候，别觉得自己矫情。想说就说，不想说我就在这。',
        '嗯。（把纸巾推过去）哭出来也没事，反正就咱俩。'
      ],
      bear: [
        '听着是挺累的。你先别想怎么解决，先吃口东西歇一歇，缓过来再说。',
        '这种事搁谁身上都难受。你要是信得过我，就从头跟我说说，我帮你想想。',
        '累就歇着，别硬撑。天大的事，睡一觉起来再说也不迟。'
      ],
      _default: [
        '嗯，我在听。你慢慢说，不着急，我在。',
        '听起来你今天状态不太好。想说的话就说，不想说我们就安静一会儿。',
        '先把心里那口气顺过来。等你愿意说了，再告诉我发生了什么。'
      ]
    },
    selfdoubt: {
      rabbit: [
        '别这么说自己。你能来这儿练，就说明你一直在努力，只是还没找到顺手的方式。',
        '口才不是天生的，是一次次说出来的。你今天说的每一句，都在给你攒经验。',
        '你不是不行，你只是还没练熟。我们把目标定小一点：今天只练一句，行吗？'
      ],
      fox: [
        '谁规定一定要嘴皮子利索？你会听、会想，这两样比能说更值钱。剩下的包在我身上。',
        '别给自己贴标签。说不好只是练习量不够，跟天赋没多大关系。',
        '你这是把"还不熟练"说成了"我不行"。来，挑一句最简单的，我陪你练三遍。'
      ],
      owl: [
        '把"我不行"换成"我还没找到方法"，这是两个完全不同的命题。前者无法证伪，后者可以拆解。',
        '我们先量化一下：具体是哪一步做不到？是开口、还是组织语言、还是怕对方的反应？拆开处理会容易得多。',
        '你的判断可能受情绪影响。我们只看事实：你今天有没有比昨天多说一句？有，那就是在进步。'
      ],
      cat: [
        '……又在贬低自己了。（翻个白眼）你要真不行，早就不来了。',
        '嘴笨怎么了，我认识话多的人多了去了，没几个说到点子上的。',
        '行了，别演悲情戏。你只是缺练，不是缺天分。来，练。'
      ],
      bear: [
        '别这么说。我见过太多一开始说不利索的人，后来都比那些嘴快的办得成事。',
        '你不是不行，你是太想一次说好了。咱慢慢来，一句一句攒。',
        '嗨，谁一开始不是磕磕巴巴的。你就记住：敢说就已经赢了一半。'
      ],
      _default: [
        '别急着否定自己。把"我不行"换成"我还没练熟"，事情就开始有了转机。',
        '你能坚持来练，本身就不是"不行"的表现。我们今天只练一句就好。',
        '先别下结论。说说具体卡在哪一步，我们针对那一步来想办法。'
      ]
    },
    study: {
      rabbit: [
        '学习这事急不来。你把大目标切成今天能做完的一小块，做完就打个勾，心里会踏实很多。',
        '要是学不进去，先别怪自己。是不是最近睡得不太好？状态差的时候，学一小时顶平时十分钟。',
        '我们可以试试"说给空气听"：把今天学的知识点用自己的话讲一遍，讲不顺的地方，就是还没真懂的地方。'
      ],
      fox: [
        '学习这事我最有话说：别一坐就是三小时，脑子早跑了。试试学二十五分钟歇五分钟，效率能翻倍。',
        '背不下来就别死背。把知识点编成一句话讲给别人听，讲得出来才是真会了。',
        '给你个小技巧：每天固定同一个时间、同一个地方学，养成习惯后你都不用靠意志力。'
      ],
      owl: [
        '先做一次诊断：把最近的错题按"真不会"和"会但做错"分两类，后者提分更快，先攻它。',
        '学习的瓶颈大多不在时间，在反馈。每学完一块，立刻做三道题验证，比反复看十遍有效。',
        '建议用"输出倒逼输入"：学完一个知识点，用三句话写下来，写不出来就回去再看。'
      ],
      cat: [
        '学不进去就先别学了，硬坐着也是发呆。眯十分钟再回来，比耗三小时强。',
        '……你这是方法不对，不是脑子不行。错题本翻过吗？',
        '别贪多。今天就把最弱的那一个点搞明白，搞明白一个就赚了。'
      ],
      bear: [
        '学习跟干活一样，得有个准点。你给自己定个固定时间段，到点就坐下来，慢慢就成习惯了。',
        '别跟别人比进度。你就问自己：今天比昨天多会了一点没？有就行。',
        '学累了就出去走走，别硬撑。脑子转不动的时候，再学也是白搭。'
      ],
      _default: [
        '先把目标切小：今天只攻一个知识点，弄明白就算完成。',
        '学完立刻做几道题验证一下，比反复看教材有效得多。',
        '如果学不进去，先休息十分钟。状态回来了再继续，效率会高一截。'
      ]
    },
    work: {
      rabbit: [
        '职场上的话，说清楚比说漂亮重要。你把想让对方做的事先想明白，剩下的我陪你一句句写。',
        '跟领导沟通，先给结论再给过程。对方时间有限，这样最省他的心，也最省你的力气。',
        '同事之间的关系不用刻意经营。你把答应过的事按时做到，这本身就是最实在的信任。'
      ],
      fox: [
        '职场沟通就十二个字：先说结论、再讲依据、最后要动作。照这个顺序说，谁听了都觉得你靠谱。',
        '跟领导汇报，别讲你多辛苦，讲进展到哪了、卡在哪、需要他定什么。他要的是这三样。',
        '同事找你帮忙又不好意思拒？记住一句：「我先看看手上的排期，晚点回你。」给自己留个缓冲。'
      ],
      owl: [
        '职场沟通先把目标写清楚：这次对话，你希望对方做出什么决定？目标明确了，话就不容易散。',
        '跟上级沟通建议用"结论-进展-卡点-需要的支持"四段，信息密度高，对方也省力。',
        '跨部门协作最容易卡在责任不清。开口前先确认一句：「这部分我来跟，你看可以吗？」'
      ],
      cat: [
        '……职场那些弯弯绕绕，我懒得说。你就记住：别答应你做不到的事。',
        '领导也是人，你怕他，他还怕你辞职呢。（耸肩）正常说话就行。',
        '同事关系别处得太用力。做好自己的活，比啥都强。'
      ],
      bear: [
        '职场说到底还是做事。你把活干好了，话少一点也没人挑你。',
        '跟领导说话别绕。你就说：这事我做到哪了、卡在哪、想请你定一下啥。三句说完。',
        '同事之间能帮就帮，帮不了就直说，别含糊。含糊最伤关系。'
      ],
      _default: [
        '职场沟通，先把"你希望对方做什么"想清楚，再开口，会省掉很多来回。',
        '跟上级说话建议先结论后过程：进展、卡点、需要的支持，三样说清就够了。',
        '答应之前先确认自己排得开，做不到就早说，比事后补救体面得多。'
      ]
    },
    question: {
      rabbit: [
        '你问的这个，得看跟谁说。你先告诉我对方是谁、你们关系怎么样，我好帮你挑语气。',
        '这个问题问得挺好。我先反问一句：你最担心的是说错，还是怕对方不高兴？',
        '我想想……要是我的话，会先把目的说出来，再说细节。你觉得这样行吗？'
      ],
      fox: [
        '哟，这题有意思。我教你个万能公式：先肯定、再分析、最后给选项。碰到啥问题都能套。',
        '要我说，答不上来也别慌。你就说「这个我确认一下，回头给你准信」，比瞎编强一百倍。',
        '这得看场合。你先告诉我是群里说、一对一说，还是开会当众说，我给你配不同的说法。'
      ],
      owl: [
        '这个问题可以从三个维度看：核心诉求是什么、有哪些可选方案、每个方案的成本。你先挑一个维度，我们展开。',
        '先界定一下：你问的是"怎么说"，还是"要不要说"？这两件事的解法完全不同。',
        '我需要两个信息才能给准建议：对方是谁、你希望他听完做什么。补充一下，我马上给你句子。'
      ],
      cat: [
        '……这问题问我干嘛。（想了想）不过既然你问了，我先给你一句能用的：「这事我想先听你的想法，我再补充。」把球抛回去，你就不用现场想答案了。',
        '不知道就不知道呗，装懂才丢人。你就说「我不太确定，我查一下告诉你」。',
        '嗯。你先说说你自己怎么想的，我再告诉你哪儿不对。'
      ],
      bear: [
        '这个问题我给你个实在的说法：答不上来别硬撑，先说「这个我得确认一下，明天给你回复」。',
        '你先别急着要答案，先想想你问这个是想解决啥。目标清楚了，答案自己就冒出来了。',
        '要我说，实话实说最好。知道多少说多少，不知道的就说明天回他，谁也不会怪你。'
      ],
      _default: [
        '这个问题得看场景。你先告诉我：跟谁说、想达成什么，我给你编一句能直接用的。',
        '先确认一件事：你需要的是答案，还是一句能说出口的话？这两样我给的东西不一样。',
        '你可以先把问题说得具体一点，我好给你对应的说法，而不是泛泛的建议。'
      ]
    },
    chat: {
      rabbit: [
        '嗯嗯，我在听。你说的这个，我能想象那个场面。后来呢，对方怎么回你的？',
        '我懂你的意思。要不我们把这句话写下来，看看有没有更顺的说法？',
        '你接着说，我想多听听。要是愿意，把当时那句原话发给我，我帮你看看哪里容易让人误会。'
      ],
      fox: [
        '哦？这个有点意思。展开说说，我给你配个接法，下次碰上直接套。',
        '听着像是个能练的场景。你先说结果：你希望对方听完之后做什么？',
        '来，我们把这事翻过来想：如果换成你朋友碰上，你会劝他怎么说？'
      ],
      owl: [
        '我记下你说的情况。从沟通的角度看，你表达的核心信息是清楚的，缺的是一个结构：观点、依据、你希望对方做什么。',
        '先确认一下：这件事你希望的结果是"对方同意"，还是"对方知道你的立场"？目标不同，说法差别很大。',
        '建议把这件事压成一句话：「我想请他做什么，因为什么。」写下来我们就好改了。'
      ],
      cat: [
        '……哦。（其实在认真听）所以你卡住的是哪一句？把那句原话发我。',
        '嗯，然后呢？别只说一半，我好不容易听进去了。',
        '这事听着不复杂。你到底想说啥，直接讲重点。'
      ],
      bear: [
        '嗯嗯，我懂你的意思。你别讲全貌，先用一句话说清"你想让对方做什么"。试试填这个：「我想请他做什么，因为什么。」填完我帮你看看顺不顺。',
        '你说的我听明白了。那你现在最犯怵的是哪一步？怕开口，还是怕他回你？',
        '行，我捋一下：你这事其实就是想让对方知道你的想法，对吧？那就直说，别绕。'
      ],
      _default: [
        '嗯嗯，我在听。你直接说场景吧，拒绝、道歉、汇报、破冰、催进度都行，我给你一句能照着说的话。',
        '我大概明白了。你把当时想说却没说出口的那句发我，我帮你改成能开口的版本。',
        '你接着说。要不我们先定个小目标：今天就练这一句，把它说顺。'
      ]
    }
  };

  // 意图关键词（顺序即优先级；场景命中优先于本表）
  const INTENT_RULES = [
    ['emotion', ['累', '烦', '难过', '难受', '焦虑', '压力', '崩溃', 'emo', '委屈', '低落', '失眠', '心烦', '不想说话', '没劲', '丧', '不开心']],
    ['selfdoubt', ['我不行', '没用', '做不到', '口才差', '说不好', '自卑', '社恐', '嘴笨', '改不了', '没救', '好笨', '太笨']],
    ['greeting', ['你好', '嗨', 'hi', 'hello', '哈喽', '在吗', '在么', '早上好', '晚上好', '早啊']],
    ['thanks', ['谢谢', '感谢', '多谢', 'thx', '3q', '受教', '多亏']],
    ['bye', ['再见', '拜拜', 'bye', '先走', '睡了', '下次聊', '下线', '走了']],
    ['nervous', ['紧张', '害怕', '不敢', '心慌', '发抖', '发怵', '怯场', '怕开口', '怕说', '慌']],
    ['study', ['学习', '考试', '四级', '六级', '刷题', '背书', '上岸', '备考', '考研', '复习', '成绩', '知识点', '题']],
    ['work', ['领导', '同事', '加班', '面试', '职场', '团队', '甲方', '客户', '绩效', '工位', '公司']]
  ];

  // ========== 状态 ==========
  let currentPartner = null;
  let chatHistory = [];      // [{role:'user'|'partner', text, ts}]
  let roundCount = 0;        // 本轮用户发言数
  let pending = false;       // 是否正在等伙伴回复
  let resumeInfo = null;     // {count, ts} 进入时恢复到的历史
  let openSceneKey = null;   // 伙伴选择页展开的场景
  let topicOffset = 0;       // 话题轮换偏移
  /* 【R11 2026-09-21 用户需求】快捷话术区（不知道说啥 / 场景话术 两排 chips）做成可收放。
     默认收起——用户多次反馈"交流区域太小"，把空间还给对话区；
     偏好落地 localStorage（'1'=收起），跨会话记住。lsGet 是函数声明会提升，此处调用安全。 */
  let quickFold = (lsGet('xt_ip_quick_fold') !== '0');
  let chats = {};            // {partnerId: {msgs:[], updatedAt}}
  let stats = {};            // {partnerId: {total, lastAt}}

  // ========== 工具函数 ==========
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = safeStr(str);
    return div.innerHTML;
  }

  /** 把任意值转成安全字符串，挡掉 undefined/null/NaN/[object Object] */
  function safeStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return '';
    return String(v);
  }

  /** 安全数字，挡掉 NaN */
  function safeNum(v, def) {
    const n = Number(v);
    return (typeof n === 'number' && isFinite(n)) ? n : (def || 0);
  }

  function toast(msg) {
    if (window.toast) { window.toast(msg); return; }
    if (window.showToast) { window.showToast(msg); return; }
    try {
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;font-size:14px';
      t.textContent = safeStr(msg);
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2000);
    } catch (e) { /* 忽略 */ }
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtClock(ts) {
    const t = safeNum(ts, 0);
    if (!t) return '';
    const d = new Date(t);
    if (isNaN(d.getTime())) return '';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** 今天 14:05 / 昨天 09:12 / 3 天前 / 刚刚 */
  function fmtRel(ts) {
    const t = safeNum(ts, 0);
    if (!t) return '未知时间';
    const d = new Date(t);
    if (isNaN(d.getTime())) return '未知时间';
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - t) / 60000);
    if (diffMin < 1) return '刚刚';
    const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayX = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round((day0 - dayX) / 86400000);
    if (dayDiff <= 0) return '今天 ' + fmtClock(t);
    if (dayDiff === 1) return '昨天 ' + fmtClock(t);
    if (dayDiff < 30) return dayDiff + ' 天前';
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  /** 卡片上的短版：今天 / 昨天 / N 天前 / 从未 */
  function fmtShort(ts) {
    const t = safeNum(ts, 0);
    if (!t) return '还没聊过';
    const d = new Date(t);
    if (isNaN(d.getTime())) return '还没聊过';
    const now = new Date();
    const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayX = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round((day0 - dayX) / 86400000);
    if (dayDiff <= 0) return '今天';
    if (dayDiff === 1) return '昨天';
    if (dayDiff < 30) return dayDiff + ' 天前';
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  // ========== 本地存储（全部 try/catch：file:// 或隐私模式下不可用） ==========
  function lsGet(key) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return null;
      return localStorage.getItem(key);
    } catch (e) { return null; }
  }

  function lsSet(key, val) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(key, val);
    } catch (e) { /* 配额满或禁用，忽略 */ }
  }

  function loadStore() {
    chats = {};
    stats = {};
    try {
      const rawC = lsGet(LS_CHAT);
      const objC = rawC ? JSON.parse(rawC) : null;
      if (objC && typeof objC === 'object') {
        Object.keys(objC).forEach(function (pid) {
          const rec = objC[pid];
          if (!rec || !Array.isArray(rec.msgs)) return;
          // 过滤脏数据：只保留角色合法且文本非空的条目
          const msgs = rec.msgs.filter(function (m) {
            return m && typeof m.text === 'string' && m.text.trim() &&
              (m.role === 'user' || m.role === 'partner');
          }).map(function (m) {
            return { role: m.role, text: String(m.text), ts: safeNum(m.ts, Date.now()) };
          });
          if (msgs.length) chats[pid] = { msgs: msgs, updatedAt: safeNum(rec.updatedAt, msgs[msgs.length - 1].ts) };
        });
      }
    } catch (e) { chats = {}; }
    try {
      const rawS = lsGet(LS_STATS);
      const objS = rawS ? JSON.parse(rawS) : null;
      if (objS && typeof objS === 'object') {
        Object.keys(objS).forEach(function (pid) {
          const s = objS[pid];
          if (!s || typeof s !== 'object') return;
          stats[pid] = { total: safeNum(s.total, 0), lastAt: safeNum(s.lastAt, 0) };
        });
      }
    } catch (e) { stats = {}; }
  }

  function saveChat(pid) {
    if (!pid) return;
    const list = chatHistory.filter(function (m) { return m && m.text; }).slice(-MAX_STORE);
    chats[pid] = { msgs: list, updatedAt: Date.now() };
    lsSet(LS_CHAT, JSON.stringify(chats));
  }

  function bumpStat(pid, n) {
    if (!pid) return;
    const cur = stats[pid] || { total: 0, lastAt: 0 };
    stats[pid] = { total: safeNum(cur.total, 0) + safeNum(n, 0), lastAt: Date.now() };
    lsSet(LS_STATS, JSON.stringify(stats));
  }

  function statOf(pid) {
    const s = stats[pid];
    return { total: safeNum(s && s.total, 0), lastAt: safeNum(s && s.lastAt, 0) };
  }

  function totalAll() {
    return PARTNERS.reduce(function (sum, p) { return sum + statOf(p.id).total; }, 0);
  }

  function lastAll() {
    let max = 0;
    PARTNERS.forEach(function (p) { const t = statOf(p.id).lastAt; if (t > max) max = t; });
    return max;
  }

  // ========== 回复生成 ==========
  function matchScenario(msg) {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const s = SCENARIOS[i];
      for (let j = 0; j < s.match.length; j++) {
        if (msg.indexOf(s.match[j]) !== -1) return s;
      }
    }
    return null;
  }

  function detectIntent(msg) {
    for (let i = 0; i < INTENT_RULES.length; i++) {
      const intent = INTENT_RULES[i][0];
      const words = INTENT_RULES[i][1];
      for (let j = 0; j < words.length; j++) {
        if (msg.indexOf(words[j]) !== -1) return intent;
      }
    }
    if (/[?？]/.test(msg)) return 'question';
    if (/(吗|呢|怎么|如何|为什么|是什么|哪|谁)$/.test(msg.trim())) return 'question';
    return 'chat';
  }

  /** 洗牌取用：一轮内不重复，且不与上一句相同 */
  const pickBag = {};
  function pickReply(intent, pid) {
    const group = REPLY_BANK[intent] || REPLY_BANK.chat;
    let list = (pid && group[pid]) || group._default || REPLY_BANK.chat._default;
    if (!Array.isArray(list) || !list.length) list = REPLY_BANK.chat._default;
    const key = intent + '|' + safeStr(pid);
    let st = pickBag[key];
    if (!st) { st = pickBag[key] = { bag: [], last: '' }; }
    if (!st.bag.length) {
      st.bag = list.slice();
      for (let i = st.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = st.bag[i]; st.bag[i] = st.bag[j]; st.bag[j] = tmp;
      }
      // 避免跨轮首句与上一句撞车
      if (st.bag.length > 1 && st.bag[st.bag.length - 1] === st.last) {
        const tmp = st.bag[st.bag.length - 1];
        st.bag[st.bag.length - 1] = st.bag[0];
        st.bag[0] = tmp;
      }
    }
    const text = st.bag.pop();
    st.last = text;
    return text;
  }

  function composeScenarioReply(partner, scenario) {
    const flavor = PARTNER_FLAVOR[partner.id] || { lead: '', tail: '' };
    const parts = [];
    if (flavor.lead) parts.push(flavor.lead);
    parts.push('【' + safeStr(scenario.name || scenario.key) + '】' + safeStr(scenario.method));
    parts.push('你可以直接这样说：');
    parts.push('「' + safeStr(scenario.script) + '」');
    if (flavor.tail) parts.push(flavor.tail);
    return parts.join('\n');
  }

  function generateReply(partner, userMsg) {
    const msg = safeStr(userMsg).toLowerCase();
    const scenario = matchScenario(msg);
    if (scenario) return composeScenarioReply(partner, scenario);
    const intent = detectIntent(msg);
    return pickReply(intent, partner && partner.id);
  }

  // ========== 真人设 LLM 接入 ==========
  function buildSystemPrompt(partner) {
    const p = partner || currentPartner;
    if (!p) { return COACH_CONTEXT; }
    const flavor = PARTNER_FLAVOR[p.id] || { lead: '', tail: '' };
    return [
      COACH_CONTEXT,
      '你现在扮演「' + p.name + '」，人设：' + p.personality + '（' + p.traits.join('、') + '）。',
      '回复风格：' + p.replyStyle + '。',
      '你的练习重点：' + (p.coachFocus || '帮用户把话说出口。'),
      '口吻参考：' + ((flavor.lead + flavor.tail) || '自然、口语化，别端着。'),
      '下面这些是各场景的参考话术，结合用户具体情况改写后使用，不要原样照抄，也不要编造具体企业名、年份和数据：',
      SCENARIOS.map(function (s, i) { return (i + 1) + '. ' + safeStr(s.name || s.key) + '：' + s.script; }).join('\n')
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

  // 已接真 LLM 时走 LLM；超时/报错/空回包一律本地兜底
  function fetchReply(partner, userMsg, done) {
    let settled = false;
    let timer = null;
    const finish = function (text) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const t = safeStr(text).trim();
      done(t ? t : generateReply(partner, userMsg));
    };
    try {
      if (typeof window.IPartnerLLM === 'function') {
        timer = setTimeout(function () {
          console.warn('[i-partner] LLM 超时，回退本地模板');
          finish('');
        }, LLM_TIMEOUT);
        window.IPartnerLLM({
          partner: partner,
          systemPrompt: buildSystemPrompt(partner),
          messages: buildMessages(partner, chatHistory, userMsg)
        }, function (text) { finish(text); });
        return;
      }
    } catch (err) {
      console.warn('[i-partner] LLM 回复失败，回退本地模板：', err);
    }
    finish(generateReply(partner, userMsg));
  }

  /* ========== 角色扮演训练（挂载 assets/roleplay.js，不复制其核心实现） ==========
   * ADR-3：整套界面渲染进 #ipContent，与「伙伴选择」「聊天室」同级切换，不做遮罩弹窗。
   * roleplay.js 是 defer 加载的可选依赖，首次点击时可能还没就绪 →
   * 先 typeof 守卫，再短轮询；始终拿不到就给降级文案，不白屏、不抛错。
   */
  var RP_POLL_MS = 100;    // 就绪检查间隔
  var RP_WAIT_MAX = 3000;  // 最多等 3 秒

  /** 伙伴选择页的角色扮演入口：放在「常见练习场景」下方，作为进阶实战 */
  function roleplayEntryHtml() {
    return `
      <div class="ip-sec-t">进阶实战 · 角色扮演<span class="ip-sec-h">固定剧本，逐句打磨</span></div>
      <div class="ip-rp-entry">
        <div class="ip-rp-t">同事拖延催进度 · 中级</div>
        <div class="ip-rp-d">和伙伴自由聊天练的是临场反应，这里换成一个完整剧本：5 轮对话，每轮写完你的说法后给出评定、改进建议和参考回答。</div>
        <button class="ip-rp-btn" onclick="IPartner.openRoleplay()">开始角色扮演</button>
      </div>`;
  }

  /** 入口点击：界面的渲染由 roleplay.js 的 mountRolePlay 负责，本文件只管挂载与降级 */
  function openRoleplay() {
    const content = document.getElementById('ipContent');
    if (!content) { toast('请先打开 i人伙伴团面板'); return; }
    if (typeof window.mountRolePlay === 'function') { mountRoleplayInto(content); return; }
    const start = Date.now();
    (function poll() {
      const c = document.getElementById('ipContent');
      if (typeof window.mountRolePlay === 'function') { mountRoleplayInto(c); return; }
      if (Date.now() - start >= RP_WAIT_MAX) { renderRoleplayFallback(c); return; }
      setTimeout(poll, RP_POLL_MS);
    })();
  }

  function mountRoleplayInto(content) {
    if (!content) return;
    let root = null;
    try {
      root = window.mountRolePlay(content, {
        backTo: 'comm',
        onBack: function () { back(); }  // 剧本内「返回」回到伙伴选择页，不退出 i人伙伴团面板
      });
    } catch (err) {
      console.warn('[i-partner] 角色扮演挂载失败：', err);
    }
    if (!root) { renderRoleplayFallback(content); return; }
    content.scrollTop = 0;
  }

  /** 降级：roleplay.js 缺失或加载失败时，仍是一张完整可读的卡片，不白屏 */
  function renderRoleplayFallback(content) {
    if (!content) return;
    content.innerHTML = `
      <div class="ip-header">
        <div class="ip-title">角色扮演训练</div>
        <div class="ip-subtitle">这段剧本暂时没能加载出来。</div>
      </div>
      <div class="ip-empty">
        <div class="ip-empty-t">角色扮演模块未能就绪</div>
        <div class="ip-empty-d">可能是 assets/roleplay.js 还没加载完成或被缓存拦下。刷新页面后重试即可，与伙伴的自由聊天不受影响。</div>
        <button class="ip-rp-btn" onclick="IPartner.back()">返回伙伴列表</button>
      </div>`;
    toast('角色扮演模块未加载，刷新页面后重试');
  }

  // ========== 渲染：伙伴选择 ==========
  function partnerCardHtml(p) {
    const st = statOf(p.id);
    const hasHistory = !!(chats[p.id] && chats[p.id].msgs.length);
    const focus = safeStr(p.coachFocus);
    const traits = Array.isArray(p.traits) ? p.traits : [];
    return `
      <div class="ip-card" onclick="IPartner.select('${esc(p.id)}')">
        <div class="ip-avatar">${safeStr(p.avatar)}</div>
        <div class="ip-info">
          <div class="ip-name">${esc(p.name)}<span class="ip-tag">${esc(p.personality)}</span></div>
          <div class="ip-desc">${esc(p.desc)}</div>
          <div class="ip-traits">${traits.map(t => `<span class="ip-trait">${esc(t)}</span>`).join('')}</div>
          ${focus ? `<div class="ip-focus"><span class="ip-focus-k">练习重点</span>${esc(focus)}</div>` : ''}
          <div class="ip-meta">
            <span class="ip-meta-i">累计 ${st.total} 句</span>
            <span class="ip-meta-i">${esc(fmtShort(st.lastAt))}</span>
            ${hasHistory ? '<span class="ip-meta-i ip-meta-hl">有上次对话</span>' : '<span class="ip-meta-i">还没聊过</span>'}
          </div>
        </div>
      </div>
    `;
  }

  function sceneDetailHtml() {
    if (!openSceneKey) return '';
    let found = null;
    for (let i = 0; i < SCENARIOS.length; i++) { if (SCENARIOS[i].key === openSceneKey) { found = SCENARIOS[i]; break; } }
    if (!found) return '';
    const picks = PARTNERS.map(p => `
      <button class="ip-scene-go" onclick="IPartner.startScene('${esc(found.key)}','${esc(p.id)}')">
        <span class="ip-scene-go-av" style="background:${safeStr(p.color)}22">${safeStr(p.avatar)}</span>${esc(p.name)}
      </button>`).join('');
    return `
      <div class="ip-scene-detail">
        <div class="ip-scene-dt-head">${esc(found.name)} · 怎么说</div>
        <div class="ip-scene-dt-row"><span class="ip-scene-dt-k">方法</span><span class="ip-scene-dt-v">${esc(found.method)}</span></div>
        <div class="ip-scene-dt-row"><span class="ip-scene-dt-k">可照说</span><span class="ip-scene-dt-v ip-scene-dt-s">「${esc(found.script)}」</span></div>
        <div class="ip-scene-dt-pick">找个伙伴开练：${picks}</div>
      </div>`;
  }

  function renderPartnerSelect() {
    if (!PARTNERS.length) {
      return `
        <div class="ip-header"><div class="ip-title">i人伙伴团</div></div>
        <div class="ip-empty">
          <div class="ip-empty-t">伙伴列表暂时为空</div>
          <div class="ip-empty-d">请刷新页面重试，或稍后再来。</div>
        </div>`;
    }
    const total = totalAll();
    const last = lastAll();
    const sceneChips = SCENARIOS.map(s => `
      <button class="ip-scene-chip${openSceneKey === s.key ? ' on' : ''}" onclick="IPartner.toggleScene('${esc(s.key)}')">${esc(s.name)}</button>
    `).join('');

    return `
      <div class="ip-header">
        <div class="ip-title">i人伙伴团</div>
        <div class="ip-subtitle">选一个伙伴开聊，不同性格不同回应风格。这里是练习场，说错了也不会被评判。</div>
        <div class="ip-summary">
          ${total > 0
            ? `共 ${PARTNERS.length} 位伙伴 · 累计练习 ${total} 句 · 上次 ${esc(fmtRel(last))}`
            : `共 ${PARTNERS.length} 位伙伴 · 还没开始，挑一个点开就行`}
        </div>
      </div>
      <div class="ip-sec-t">选个伙伴<span class="ip-sec-h">点卡片直接进入聊天</span></div>
      <div class="ip-partner-list">${PARTNERS.map(partnerCardHtml).join('')}</div>
      <div class="ip-sec-t">常见练习场景 · ${SCENARIOS.length} 个<span class="ip-sec-h">点开看方法，再选伙伴开练</span></div>
      <div class="ip-scene-grid">${sceneChips}</div>
      ${sceneDetailHtml()}
      ${roleplayEntryHtml()}
      <div class="ip-tips">提示：不确定说什么时，直接把场景丢过来，比如"我不知道怎么拒绝同事"，伙伴会给你一句能照着说的话。跟伙伴练完再去上面的角色扮演，把话逐句打磨。</div>
    `;
  }

  // ========== 渲染：聊天室 ==========
  function msgHtml(m) {
    const isUser = m.role === 'user';
    const time = fmtClock(m.ts);
    const avatar = (!isUser && currentPartner)
      ? `<div class="ip-msg-avatar" style="background:${safeStr(currentPartner.color)}22">${safeStr(currentPartner.avatar)}</div>` : '';
    return `
      <div class="ip-msg ${isUser ? 'ip-msg-user' : 'ip-msg-partner'}">
        ${avatar}
        <div class="ip-msg-col">
          <div class="ip-msg-bubble">${esc(m.text)}</div>
          ${time ? `<div class="ip-msg-time">${esc(time)}</div>` : ''}
        </div>
      </div>`;
  }

  function renderChatRoom() {
    const p = currentPartner;
    if (!p) {
      return `<div class="ip-empty"><div class="ip-empty-t">还没有选择伙伴</div><div class="ip-empty-d">请返回列表挑一位伙伴再开始。</div></div>`;
    }
    const total = chatHistory.length;
    const start = Math.max(0, total - MAX_RENDER);
    const shown = chatHistory.slice(start);
    let msgsHtml = '';
    if (start > 0) {
      msgsHtml += `<div class="ip-more-tip">仅显示最近 ${MAX_RENDER} 条（共 ${total} 条），更早的已归档</div>`;
    }
    msgsHtml += shown.map(msgHtml).join('');
    if (pending) {
      msgsHtml += `
        <div class="ip-msg ip-msg-partner">
          <div class="ip-msg-avatar" style="background:${safeStr(p.color)}22">${safeStr(p.avatar)}</div>
          <div class="ip-msg-col"><div class="ip-msg-bubble ip-typing"><i></i><i></i><i></i></div></div>
        </div>`;
    }

    const onlyGreet = total <= 1;
    const guide = onlyGreet ? `
      <div class="ip-guide">
        <div class="ip-guide-t">可以这样说开场</div>
        <div class="ip-guide-c">
          ${SCENARIOS.slice(0, 5).map(s => `<button class="ip-guide-b" onclick="IPartner.startScene('${esc(s.key)}','${esc(p.id)}')">${esc(s.name)}</button>`).join('')}
        </div>
        <div class="ip-guide-d">也可以直接把你的原话发过来，比如"同事又让我帮忙，我不想接"。</div>
      </div>` : '';

    const resumeBar = resumeInfo ? `
      <div class="ip-resume">
        <span class="ip-resume-t">继续上次对话 · ${resumeInfo.count} 条 · ${esc(fmtRel(resumeInfo.ts))}</span>
        <button class="ip-resume-b" onclick="IPartner.newChat()">新开一段</button>
      </div>` : '';

    const topicList = [];
    for (let i = 0; i < TOPIC_PAGE; i++) {
      topicList.push(CHAT_TOPICS[(topicOffset + i) % CHAT_TOPICS.length]);
    }
    const quickTopics = topicList.map(t =>
      `<button class="ip-topic" onclick="IPartner.sendTopic('${esc(t)}')">${esc(t)}</button>`
    ).join('') + `<button class="ip-topic ip-topic-more" onclick="IPartner.moreTopics()">换一批</button>`;

    const sceneChips = SCENARIOS.map(s =>
      `<button class="ip-scene-chip sm" onclick="IPartner.startScene('${esc(s.key)}','${esc(p.id)}')">${esc(s.name)}</button>`
    ).join('');

    const st = statOf(p.id);

    return `
      <div class="ip-chat-header">
        <button class="ip-back" onclick="IPartner.back()">← 换个伙伴</button>
        <div class="ip-chat-partner">
          <div class="ip-chat-avatar" style="background:${safeStr(p.color)}22">${safeStr(p.avatar)}</div>
          <div class="ip-chat-meta">
            <div class="ip-chat-name">${esc(p.name)}</div>
            <div class="ip-chat-status">${esc(p.personality)} · 本轮 ${roundCount} 句 · 累计 ${st.total} 句</div>
          </div>
        </div>
        <button class="ip-clear" onclick="IPartner.clearChat()">清空</button>
      </div>
      ${resumeBar}
      <div class="ip-chat-messages" id="ipChatMessages">${msgsHtml}${guide}</div>
      <div class="ip-quick${quickFold ? ' ip-quick-fold' : ''}">
        <button class="ip-quick-bar" type="button" onclick="IPartner.toggleQuick()"
                aria-expanded="${quickFold ? 'false' : 'true'}"
                title="${quickFold ? '展开快捷话术' : '收起快捷话术'}">
          <span class="ip-quick-bar-t">话术助手</span>
          <span class="ip-quick-bar-d">${quickFold ? '点开，不知道说什么就挑一句' : '收起，给对话腾地方'}</span>
          <span class="ip-quick-chev" aria-hidden="true">${quickFold ? '▸' : '▾'}</span>
        </button>
        <div class="ip-quick-body">
          <div class="ip-quick-row">
            <span class="ip-quick-label">不知道说啥</span>${quickTopics}
          </div>
          <div class="ip-quick-row">
            <span class="ip-quick-label">场景话术</span>${sceneChips}
          </div>
        </div>
      </div>
      <div class="ip-chat-input">
        <input type="text" id="ipChatInput" placeholder="输入你想说的话，回车发送"
               onkeydown="if(event.key==='Enter')IPartner.send()" />
        <button class="ip-send-btn" onclick="IPartner.send()"${pending ? ' disabled' : ''}>${pending ? '…' : '发送'}</button>
      </div>
    `;
  }

  // ========== 打开 i人伙伴团 ==========
  function open() {
    let mask = document.getElementById('ipMask');
    if (mask) { mask.remove(); }
    try { loadStore(); } catch (e) { /* 忽略 */ }
    currentPartner = null;
    chatHistory = [];
    roundCount = 0;
    pending = false;
    resumeInfo = null;
    openSceneKey = null;

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

    if (!document.getElementById('ipStyle')) {
      const style = document.createElement('style');
      style.id = 'ipStyle';
      style.textContent = getStyles();
      document.head.appendChild(style);
    }
  }

  // ========== 选择伙伴 ==========
  function select(partnerId) {
    const p = PARTNERS.filter(x => x.id === partnerId)[0];
    if (!p) { toast('没找到这位伙伴'); return; }
    currentPartner = p;
    pending = false;
    resumeInfo = null;

    const saved = chats[p.id];
    if (saved && saved.msgs && saved.msgs.length) {
      chatHistory = saved.msgs.slice();
      resumeInfo = { count: chatHistory.length, ts: safeNum(saved.updatedAt, Date.now()) };
    } else {
      chatHistory = [{ role: 'partner', text: safeStr(p.greet), ts: Date.now() }];
      saveChat(p.id);
    }
    roundCount = chatHistory.filter(m => m.role === 'user').length;

    const content = document.getElementById('ipContent');
    if (!content) return;
    content.innerHTML = renderChatRoom();
    /* 2026-09-21 手机适配：聊天室打标记 → CSS 把消息区改为独立滚动、输入框固定不滚走（见 表达.html） */
    content.classList[document.getElementById('ipChatMessages') ? 'add' : 'remove']('ip-chat-mode');
    scrollBottom();
  }

  // ========== 从场景直接开练 ==========
  function startScene(sceneKey, partnerId) {
    let s = null;
    for (let i = 0; i < SCENARIOS.length; i++) { if (SCENARIOS[i].key === sceneKey) { s = SCENARIOS[i]; break; } }
    if (!s) return;
    const pid = partnerId || (currentPartner && currentPartner.id);
    if (!pid) { toast('先选一位伙伴'); return; }
    if (!currentPartner || currentPartner.id !== pid) select(pid);
    const input = document.getElementById('ipChatInput');
    if (input) {
      input.value = safeStr(s.match[0]);
      send();
    } else {
      openSceneKey = s.key;
      const content = document.getElementById('ipContent');
      if (content) { content.innerHTML = renderPartnerSelect(); content.classList.remove('ip-chat-mode'); }
    }
  }

  function toggleScene(key) {
    openSceneKey = (openSceneKey === key) ? null : key;
    const content = document.getElementById('ipContent');
    if (content) { content.innerHTML = renderPartnerSelect(); content.classList.remove('ip-chat-mode'); }
  }

  // ========== 发送消息 ==========
  function send() {
    const input = document.getElementById('ipChatInput');
    if (!input) return;
    const text = safeStr(input.value).trim();
    if (!text) { toast('说点什么吧'); return; }
    if (!currentPartner) { toast('先选一位伙伴'); return; }
    if (pending) return;

    input.value = '';
    pushMsg('user', text);
    bumpStat(currentPartner.id, 1);
    pending = true;
    resumeInfo = null;
    updateChatUI();

    setTimeout(function () {
      fetchReply(currentPartner, text, function (reply) {
        pushMsg('partner', safeStr(reply) || pickReply('chat', currentPartner && currentPartner.id));
        pending = false;
        updateChatUI();
        if (window.recordStudy) {
          try { window.recordStudy('comm', 'i人聊天', 1); } catch (e) { /* 忽略 */ }
        }
      });
    }, 600 + Math.random() * 500);
  }

  function pushMsg(role, text) {
    chatHistory.push({ role: role === 'user' ? 'user' : 'partner', text: safeStr(text), ts: Date.now() });
    if (role === 'user') roundCount++;
    if (chatHistory.length > MAX_STORE) chatHistory = chatHistory.slice(-MAX_STORE);
    saveChat(currentPartner && currentPartner.id);
  }

  function sendTopic(topic) {
    const input = document.getElementById('ipChatInput');
    if (!input) return;
    input.value = safeStr(topic);
    send();
  }

  function moreTopics() {
    topicOffset = (topicOffset + TOPIC_PAGE) % CHAT_TOPICS.length;
    updateChatUI();
  }

  /** 【R11】收起 / 展开快捷话术区（不知道说啥 / 场景话术 两排 chips）。
   *  收起后对话区拿到全部剩余高度；偏好写 localStorage 跨会话记住。 */
  function toggleQuick() {
    quickFold = !quickFold;
    lsSet('xt_ip_quick_fold', quickFold ? '1' : '0');
    updateChatUI();
  }

  /** 清空当前伙伴的对话，重新开始 */
  function clearChat() {
    if (!currentPartner) return;
    const pid = currentPartner.id;
    chatHistory = [{ role: 'partner', text: safeStr(currentPartner.greet), ts: Date.now() }];
    roundCount = 0;
    pending = false;
    resumeInfo = null;
    saveChat(pid);
    updateChatUI();
    toast('本轮对话已清空，历史句数已保留');
  }

  /** 保留历史，另起一轮（其实是把历史归档后重开） */
  function newChat() {
    if (!currentPartner) return;
    const pid = currentPartner.id;
    chatHistory = [{ role: 'partner', text: safeStr(currentPartner.greet), ts: Date.now() }];
    roundCount = 0;
    pending = false;
    resumeInfo = null;
    saveChat(pid);
    updateChatUI();
  }

  // ========== 更新 UI ==========
  function updateChatUI() {
    const content = document.getElementById('ipContent');
    if (!content) return;
    content.innerHTML = renderChatRoom();
    /* 2026-09-21 手机适配：聊天室打标记 → CSS 把消息区改为独立滚动、输入框固定不滚走（见 表达.html） */
    content.classList[document.getElementById('ipChatMessages') ? 'add' : 'remove']('ip-chat-mode');
    scrollBottom();
  }

  function scrollBottom() {
    setTimeout(function () {
      const msgs = document.getElementById('ipChatMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  }

  // ========== 返回伙伴选择 ==========
  function back() {
    currentPartner = null;
    chatHistory = [];
    roundCount = 0;
    pending = false;
    resumeInfo = null;
    const content = document.getElementById('ipContent');
    if (!content) return;
    content.innerHTML = renderPartnerSelect();
    content.classList.remove('ip-chat-mode');
    content.scrollTop = 0;
  }

  // ========== 关闭 ==========
  function close() {
    const mask = document.getElementById('ipMask');
    if (mask) mask.remove();
    pending = false;
  }

  // ========== 样式（统一用全站设计令牌） ==========
  function getStyles() {
    return `
      .ip-mask {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5);
        z-index: 99998; display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
      }
      .ip-panel {
        width: 90%; max-width: 560px; height: 85vh; max-height: 700px;
        background: var(--bg); border-radius: var(--radius); overflow: hidden;
        position: relative; box-shadow: var(--shadow-hover);
        display: flex; flex-direction: column;
      }
      .ip-close {
        position: absolute; top: 12px; right: 12px; z-index: 10;
        width: 32px; height: 32px; border-radius: 50%; border: none;
        background: rgba(0,0,0,0.1); cursor: pointer; font-size: 16px;
        display: flex; align-items: center; justify-content: center; color: var(--text);
      }
      .ip-close:hover { background: rgba(0,0,0,0.2); }
      #ipContent { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }

      /* 空态 */
      .ip-empty { padding: 48px 24px; text-align: center; }
      .ip-empty-t { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
      .ip-empty-d { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }

      /* 伙伴选择 */
      .ip-header { padding: 22px 18px 12px; text-align: center; }
      .ip-title { font-size: 20px; font-weight: 800; color: var(--text); margin-bottom: 6px; }
      .ip-subtitle { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
      .ip-summary {
        display: inline-block; margin-top: 10px; padding: 5px 12px; border-radius: 999px;
        background: var(--primary-light); color: var(--primary); font-size: 12px; font-weight: 600;
      }
      .ip-sec-t {
        display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
        padding: 14px 18px 8px; font-size: 14px; font-weight: 800; color: var(--text);
      }
      .ip-sec-h { font-size: 12px; font-weight: 400; color: var(--text-muted); }
      .ip-partner-list { padding: 0 14px; }
      .ip-card {
        display: flex; gap: 12px; padding: 14px; margin-bottom: 10px;
        border: 1px solid var(--border); border-radius: var(--radius-sm);
        background: var(--card); cursor: pointer; transition: var(--transition);
      }
      .ip-card:hover { transform: translateY(-2px); border-color: var(--primary); box-shadow: var(--shadow); }
      .ip-avatar {
        width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
        background: var(--primary-light);
        display: flex; align-items: center; justify-content: center; font-size: 28px;
      }
      .ip-info { flex: 1; min-width: 0; }
      .ip-name {
        font-size: 15px; font-weight: 800; color: var(--text); margin-bottom: 4px;
        display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      }
      .ip-tag {
        font-size: 11px; padding: 2px 8px; border-radius: 999px;
        background: var(--primary-light); color: var(--primary); font-weight: 600;
      }
      .ip-desc { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.5; }
      .ip-traits { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
      .ip-trait {
        font-size: 11px; padding: 2px 8px; border-radius: 8px;
        background: var(--bg); border: 1px solid var(--border); color: var(--text-secondary);
      }
      .ip-focus {
        font-size: 12px; line-height: 1.6; color: var(--text-secondary);
        padding: 7px 10px; border-radius: 8px; background: var(--bg); margin-bottom: 8px;
      }
      .ip-focus-k {
        display: inline-block; margin-right: 6px; padding: 1px 6px; border-radius: 6px;
        background: var(--primary-light); color: var(--primary); font-size: 11px; font-weight: 700;
      }
      .ip-meta { display: flex; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--text-muted); }
      .ip-meta-i { padding: 2px 8px; border-radius: 999px; background: var(--bg); border: 1px solid var(--border); }
      .ip-meta-hl { color: var(--primary); border-color: var(--primary-light); background: var(--primary-light); }

      /* 场景区 */
      .ip-scene-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 18px 4px; }
      .ip-scene-chip {
        padding: 6px 12px; min-height: 32px; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--border); background: var(--card);
        font-size: 12px; color: var(--text-secondary); transition: var(--transition);
      }
      .ip-scene-chip:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
      .ip-scene-chip.on { border-color: var(--primary); color: var(--primary); background: var(--primary-light); font-weight: 700; }
      .ip-scene-chip.sm { padding: 4px 10px; min-height: 28px; font-size: 11px; }
      .ip-scene-detail {
        margin: 10px 18px 0; padding: 12px 14px; border-radius: var(--radius-sm);
        background: var(--card); border: 1px solid var(--border); box-shadow: var(--shadow);
      }
      .ip-scene-dt-head { font-size: 13px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
      .ip-scene-dt-row { display: flex; gap: 8px; margin-bottom: 6px; }
      .ip-scene-dt-k {
        flex: none; font-size: 11px; font-weight: 700; color: var(--primary);
        background: var(--primary-light); border-radius: 6px; padding: 1px 6px; height: 18px; line-height: 16px;
      }
      .ip-scene-dt-v { font-size: 12px; line-height: 1.7; color: var(--text-secondary); min-width: 0; word-break: break-word; }
      .ip-scene-dt-s { color: var(--text); font-weight: 600; }
      .ip-scene-dt-pick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; align-items: center; font-size: 12px; color: var(--text-secondary); }
      .ip-scene-go {
        display: inline-flex; align-items: center; gap: 4px; min-height: 30px; padding: 4px 10px;
        border-radius: 999px; border: 1px solid var(--border); background: var(--card);
        font-size: 12px; color: var(--text); cursor: pointer; transition: var(--transition);
      }
      .ip-scene-go:hover { border-color: var(--primary); color: var(--primary); }
      .ip-scene-go-av { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }

      .ip-tips {
        margin: 14px 18px 18px; padding: 12px 14px; border-radius: var(--radius-sm);
        background: var(--card); border: 1px solid var(--border);
        font-size: 12px; line-height: 1.7; color: var(--text-secondary);
      }

      /* 聊天室 */
      .ip-chat-header {
        position: sticky; top: 0; z-index: 2;
        padding: 12px 14px; display: flex; align-items: center; gap: 10px;
        border-bottom: 1px solid var(--border); background: var(--card); flex: none;
      }
      .ip-back, .ip-clear {
        flex: none; min-height: 32px; border: 1px solid var(--border); background: var(--card);
        padding: 6px 10px; border-radius: 8px; cursor: pointer; font-size: 12px; color: var(--text-secondary);
        transition: var(--transition);
      }
      .ip-back:hover, .ip-clear:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }
      .ip-chat-partner { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
      .ip-chat-avatar {
        width: 36px; height: 36px; border-radius: 10px; flex: none;
        display: flex; align-items: center; justify-content: center; font-size: 20px;
      }
      .ip-chat-meta { min-width: 0; }
      .ip-chat-name { font-size: 15px; font-weight: 800; color: var(--text); }
      .ip-chat-status {
        font-size: 11px; color: var(--text-muted); margin-top: 2px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      .ip-resume {
        display: flex; align-items: center; gap: 10px; padding: 8px 14px;
        background: var(--primary-light); border-bottom: 1px solid var(--border); font-size: 12px; flex: none;
      }
      .ip-resume-t { flex: 1; min-width: 0; color: var(--primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ip-resume-b {
        flex: none; min-height: 28px; padding: 4px 10px; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--primary); background: var(--card); color: var(--primary); font-size: 11px;
      }

      .ip-chat-messages { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
      .ip-more-tip, .ip-guide { align-self: stretch; }
      .ip-more-tip {
        text-align: center; font-size: 11px; color: var(--text-muted);
        padding: 6px 10px; border-radius: 999px; background: var(--bg); border: 1px dashed var(--border);
      }
      .ip-msg { display: flex; gap: 8px; max-width: 86%; }
      .ip-msg-user { align-self: flex-end; flex-direction: row-reverse; }
      .ip-msg-partner { align-self: flex-start; }
      .ip-msg-avatar {
        width: 30px; height: 30px; border-radius: 10px; flex: none;
        display: flex; align-items: center; justify-content: center; font-size: 16px;
      }
      .ip-msg-col { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
      .ip-msg-bubble {
        padding: 10px 13px; border-radius: 14px; font-size: 14px; line-height: 1.65;
        background: var(--card); color: var(--text);
        white-space: pre-line; word-break: break-word; overflow-wrap: anywhere;
        box-shadow: var(--shadow);
      }
      .ip-msg-user .ip-msg-bubble {
        background: var(--primary); color: #fff; border-bottom-right-radius: 4px;
      }
      .ip-msg-user .ip-msg-col { align-items: flex-end; }
      .ip-msg-partner .ip-msg-bubble { border-bottom-left-radius: 4px; }
      .ip-msg-time { font-size: 10px; color: var(--text-muted); padding: 0 4px; }
      .ip-typing { display: flex; align-items: center; gap: 4px; }
      .ip-typing i {
        width: 5px; height: 5px; border-radius: 50%; background: var(--text-muted);
        animation: ipBlink 1.2s infinite;
      }
      .ip-typing i:nth-child(2) { animation-delay: .2s; }
      .ip-typing i:nth-child(3) { animation-delay: .4s; }
      @keyframes ipBlink { 0%,60%,100% { opacity: .25; } 30% { opacity: 1; } }

      .ip-guide {
        margin-top: 4px; padding: 12px 14px; border-radius: var(--radius-sm);
        background: var(--card); border: 1px dashed var(--border);
      }
      .ip-guide-t { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
      .ip-guide-c { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      .ip-guide-b {
        min-height: 30px; padding: 4px 10px; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--primary-light); background: var(--primary-light);
        color: var(--primary); font-size: 12px;
      }
      .ip-guide-b:hover { border-color: var(--primary); }
      .ip-guide-d { font-size: 12px; line-height: 1.7; color: var(--text-secondary); }

      .ip-quick {
        position: sticky; bottom: 0; flex: none;
        padding: 8px 14px; display: flex; flex-direction: column; gap: 6px;
        border-top: 1px solid var(--border); background: var(--card);
      }
      .ip-quick-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .ip-quick-label { font-size: 11px; color: var(--text-muted); flex: none; }
      /* 【R11】快捷话术区可收放：细长开关条常驻（收起时也看得见、点得着），chip 两排放进 .ip-quick-body */
      .ip-quick-bar {
        display: flex; align-items: center; gap: 8px; width: 100%;
        padding: 6px 2px; margin: 0; border: none; background: transparent; cursor: pointer;
        font-family: inherit; text-align: left; border-radius: 8px;
      }
      .ip-quick-bar:hover { background: var(--bg); }
      .ip-quick-bar-t { flex: none; font-size: 12px; font-weight: 800; color: var(--text); }
      .ip-quick-bar-d { flex: 1; min-width: 0; font-size: 11px; color: var(--text-muted);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ip-quick-chev { flex: none; font-size: 12px; color: var(--text-muted); line-height: 1; }
      .ip-quick-fold .ip-quick-body { display: none; }
      .ip-quick-fold { padding-top: 4px; padding-bottom: 4px; }
      .ip-topic {
        max-width: 100%; min-height: 28px; padding: 4px 10px; border-radius: 999px; cursor: pointer;
        background: var(--primary-light); color: var(--primary); border: 1px solid transparent;
        font-size: 11px; transition: var(--transition); white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
      }
      .ip-topic:hover { border-color: var(--primary); }
      .ip-topic-more { background: var(--bg); color: var(--text-secondary); border-color: var(--border); }

      .ip-chat-input {
        display: flex; gap: 8px; padding: 10px 14px 14px;
        border-top: 1px solid var(--border); background: var(--card); flex: none;
      }
      .ip-chat-input input {
        flex: 1; min-width: 0; min-height: 40px; padding: 10px 14px; border-radius: 999px;
        border: 1px solid var(--border); background: var(--bg);
        color: var(--text); font-size: 14px; outline: none; font-family: inherit;
      }
      .ip-chat-input input:focus { border-color: var(--primary); background: var(--card); }
      .ip-send-btn {
        flex: none; min-height: 40px; padding: 0 18px; border-radius: 999px; border: none;
        background: var(--primary); color: #fff; font-size: 14px;
        font-weight: 700; cursor: pointer; transition: var(--transition);
      }
      .ip-send-btn:hover { opacity: .9; }
      .ip-send-btn[disabled] { opacity: .5; cursor: not-allowed; }

      /* 角色扮演入口 + roleplay.js 挂载后的容器微调（界面主体由 roleplay.js 自带 rpStyle 提供） */
      .ip-rp-entry {
        margin: 0 18px 4px; padding: 14px; border-radius: var(--radius-sm);
        background: var(--card); border: 1px solid var(--border); box-shadow: var(--shadow);
      }
      .ip-rp-t { font-size: 13px; font-weight: 800; color: var(--text); margin-bottom: 6px; }
      .ip-rp-d { font-size: 12px; line-height: 1.7; color: var(--text-secondary); margin-bottom: 12px; }
      .ip-rp-btn {
        min-height: 40px; padding: 0 20px; border: none; border-radius: 999px; cursor: pointer;
        background: var(--primary); color: #fff; font-size: 13px; font-weight: 700;
        font-family: inherit; transition: var(--transition);
      }
      .ip-rp-btn:hover { opacity: .9; }
      #ipContent .rp-app { padding: 2px 0 16px; }

      /* 窄屏适配：单列、不横向溢出、点按区域够大 */
      @media (max-width: 420px) {
        .ip-panel { width: 100%; max-width: none; height: 100%; max-height: none; border-radius: 0; }
        .ip-header { padding: 18px 14px 10px; }
        .ip-partner-list, .ip-scene-grid { padding-left: 12px; padding-right: 12px; }
        .ip-sec-t, .ip-tips { margin-left: 12px; margin-right: 12px; padding-left: 0; padding-right: 0; }
        .ip-tips { padding: 12px 14px; }
        .ip-card { padding: 12px; gap: 10px; }
        .ip-avatar { width: 44px; height: 44px; font-size: 24px; }
        .ip-chat-header { padding: 10px 12px; gap: 8px; }
        .ip-back, .ip-clear { padding: 6px 8px; font-size: 11px; }
        .ip-back { white-space: nowrap; }
        .ip-msg { max-width: 92%; }
        .ip-chat-messages { padding: 12px; }
        .ip-quick { padding: 8px 12px; }
        .ip-chat-input { padding: 8px 12px 12px; }
        .ip-send-btn { padding: 0 14px; }
      }
    `;
  }

  // ========== 暴露 API ==========
  window.IPartner = {
    open, select, send, sendTopic, back, close,
    startScene, toggleScene, moreTopics, clearChat, newChat,
    toggleQuick,
    openRoleplay: openRoleplay,
    buildSystemPrompt: buildSystemPrompt,
    buildMessages: buildMessages,
    getScenarios: function () { return SCENARIOS.slice(); },
    getPartners: function () { return PARTNERS.slice(); }
  };

  console.log('✅ i人伙伴团已加载');
})();
