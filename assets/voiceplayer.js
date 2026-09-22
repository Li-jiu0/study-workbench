/* =====================================================================
   voiceplayer.js —— 四级·听说训练（口语跟读 / 听力精听）页内全屏面板
   ---------------------------------------------------------------------
   多情景对话（咖啡/机场/餐厅/酒店/购物/问路 + 新闻/长对话/短文三类题型），
   可切换“听力精听”与“口语跟读”双 tab。
   呈现载体：动态注入的全屏面板 #vpMask（顶部返回栏 + ESC 退出 + openAppModal
   锁滚动，app.js 1843/1850 按 id=vpMask 联动关闭——该 id 不可改）。
   样式：对齐全站浅色设计令牌（--bg/--card/--border/--primary…，暗色主题自适应）。
   依赖：app.js（speakUtterance / startEnglishRecognition / evaluateSpeaking）、
         icon-map.js（data-icon 自动渲染，未加载时静默降级为纯文字按钮）。
   用法：openVoiceTrain('listen') / openVoiceTrain('speak')
   ===================================================================== */
(function () {
  'use strict';
  if (window.__VOICE__) return;
  window.__VOICE__ = 1;

  var SCENES = {
    coffee: {
      t: '咖啡店点单', lines: [
        { en: 'Hi, what can I get for you today?', zh: '你好，今天想喝点什么？' },
        { en: "I'd like a medium hot latte with less sugar, please.", zh: '我想要一杯中杯热拿铁，少糖。' },
        { en: 'Sure, anything else?', zh: '好的，还要别的吗？' },
        { en: "And I'll also have a chocolate muffin, please.", zh: '再来一个巧克力麦芬，谢谢。' },
        { en: 'Okay, that is a medium latte and a muffin. For here or to go?', zh: '好的，一杯中杯拿铁和麦芬。带走还是堂食？' },
        { en: 'To go, please. How much is that?', zh: '带走，谢谢。多少钱？' },
        { en: 'That comes to forty-two yuan. Card or cash?', zh: '一共 42 元，刷卡还是现金？' },
        { en: 'Card, please. Could I get the receipt?', zh: '刷卡，麻烦给我一张小票。' },
        { en: 'Of course. Your drink will be ready at the end of the bar.', zh: '当然可以，您的饮品做好后请在吧台尽头取餐。' }
      ]
    },
    airport: {
      t: '机场值机', lines: [
        { en: 'Good morning. May I see your passport, please?', zh: '早上好，请出示您的护照。' },
        { en: 'Here you are. I would like a window seat if possible.', zh: '给你，如果可以我想要靠窗的座位。' },
        { en: 'No problem. Do you have any checked baggage?', zh: '没问题，有需要托运的行李吗？' },
        { en: 'Yes, one suitcase. And is this flight on time?', zh: '有一个行李箱。这班航班准点吗？' },
        { en: 'It is on schedule. Here is your boarding pass, gate 22.', zh: '准点。这是你的登机牌，22 号登机口。' },
        { en: 'Thank you very much. Have a nice trip!', zh: '非常感谢，祝您旅途愉快！' },
        { en: 'Excuse me, where can I pick up my luggage after landing?', zh: '打扰一下，落地后在哪里取行李？' },
        { en: 'Just follow the signs to Baggage Claim on the first floor.', zh: '跟着指示牌到一楼行李提取处即可。' },
        { en: 'Also, please arrive at the gate forty minutes before departure.', zh: '另外，请至少在起飞前 40 分钟到达登机口。' }
      ]
    },
    restaurant: {
      t: '餐厅点餐', lines: [
        { en: 'Welcome! A table for two?', zh: '欢迎光临，两位吗？' },
        { en: 'Yes, please. Could we sit by the window?', zh: '是的，能坐靠窗的位置吗？' },
        { en: 'Of course. Here are the menus.', zh: '当然可以，这是菜单。' },
        { en: 'What do you recommend? I am a little hungry.', zh: '你有什么推荐？我有点饿了。' },
        { en: 'Our grilled salmon is quite popular.', zh: '我们的烤三文鱼很受欢迎。' },
        { en: 'Sounds good. I will have that, with a side salad.', zh: '听起来不错，就要这个，外加一份沙拉。' },
        { en: 'How would you like your salmon, medium or well done?', zh: '三文鱼要五分熟还是全熟？' },
        { en: 'Medium, please. And a glass of sparkling water.', zh: '五分熟，谢谢。再来一杯气泡水。' },
        { en: 'Sure. Your food will be ready in about fifteen minutes.', zh: '好的，您的餐点大约十五分钟后上桌。' }
      ]
    },
    hotel: {
      t: '酒店入住', lines: [
        { en: 'Good evening. How can I help you?', zh: '晚上好，有什么可以帮您？' },
        { en: 'I have a reservation under the name Zhang Wei.', zh: '我用张伟的名字预订了房间。' },
        { en: 'Let me check. Yes, a single room for two nights.', zh: '我查一下，是的，单人间两晚。' },
        { en: 'Great. What time is breakfast served?', zh: '好的，早餐几点供应？' },
        { en: 'From 6:30 to 9:30 on the second floor.', zh: '6:30 到 9:30，在二楼。' },
        { en: 'Perfect. Here is your key card, room 805.', zh: '很好。这是你的房卡，805 房。' },
        { en: 'Could you give me a wake-up call at seven tomorrow morning?', zh: '明天早上七点能给我打叫醒电话吗？' },
        { en: 'Certainly. Is there anything else you need?', zh: '当然可以。还有其他需要吗？' },
        { en: 'Yes, where is the gym and what are its opening hours?', zh: '有，健身房在哪里，几点开放？' }
      ]
    },
    shopping: {
      t: '购物退换', lines: [
        { en: 'Hi, I would like to return this shirt.', zh: '你好，我想退这件衬衫。' },
        { en: 'Do you have the receipt with you?', zh: '您带小票了吗？' },
        { en: 'Yes, here it is. I bought it yesterday.', zh: '带了，在这。我昨天买的。' },
        { en: 'Is there anything wrong with it?', zh: '是有什么问题吗？' },
        { en: 'It is too small for me, actually.', zh: '其实对我来说太小了。' },
        { en: 'No problem. I will refund it to your card.', zh: '没问题，我会退款到您的卡里。' },
        { en: 'How long will the refund take to arrive?', zh: '退款多久能到账？' },
        { en: 'Usually three to five working days.', zh: '一般三到五个工作日。' },
        { en: 'Thanks. By the way, do you have this style in a larger size?', zh: '谢谢。顺便问一下，这款有大一号的吗？' }
      ]
    },
    street: {
      t: '问路', lines: [
        { en: 'Excuse me, how can I get to the subway station?', zh: '打扰一下，去地铁站怎么走？' },
        { en: 'Go straight and turn left at the second crossing.', zh: '直走，在第二个路口左转。' },
        { en: 'Is it far from here?', zh: '离这儿远吗？' },
        { en: 'About a ten-minute walk. You cannot miss it.', zh: '步行大约十分钟，你不会错过的。' },
        { en: 'Great, thank you so much.', zh: '太好了，非常感谢。' },
        { en: 'You are welcome. Have a nice day!', zh: '不客气，祝您愉快！' },
        { en: 'Sorry to bother you again — is there a shared bike nearby?', zh: '不好意思再问一下，附近有共享单车吗？' },
        { en: 'Yes, there is a bike station just around the corner.', zh: '有，转角处就有一个单车停放点。' },
        { en: 'That saves me a lot of time. I really appreciate it.', zh: '这帮我省了不少时间，太感谢了。' }
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
        { en: 'Remember to bring your student card to all campus events.', zh: '参加校园活动时记得携带学生证。' },
        { en: 'In sports news, our university football team reached the city final last night.', zh: '体育新闻方面，我校足球队昨晚晋级市级决赛。' },
        { en: 'The final match will be held at the main stadium this Saturday afternoon.', zh: '决赛将于本周六下午在主体育场举行。' }
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
        { en: 'Great, I’ll book the room and send you the slides later.', zh: '好的，我来订房间，稍后把幻灯片发你。' },
        { en: 'Good idea. I can also summarize the survey results into a chart.', zh: '好主意。我还可以把问卷结果整理成图表。' },
        { en: 'Perfect. Then we will be ready to present on Friday.', zh: '完美，那我们周五展示就准备好了。' }
      ]
    },
    passage: {
      t: '短文朗读', lines: [
        { en: 'Today I want to share three simple tips for better memory.', zh: '今天我想分享三个提升记忆力的简单技巧。' },
        { en: 'First, review new words within twenty-four hours of learning them.', zh: '第一，在学习新单词后 24 小时内复习。' },
        { en: 'Second, try to use the word in a real sentence, not just read it.', zh: '第二，尝试在真实句子中使用该词，而不只是阅读。' },
        { en: 'Third, teach the idea to a friend; teaching helps you remember.', zh: '第三，把知识点讲给朋友听，教别人有助于记忆。' },
        { en: 'Also, a good night’s sleep makes a big difference.', zh: '此外，睡个好觉效果差别很大。' },
        { en: 'Finally, be patient; building habits takes a few weeks.', zh: '最后，要有耐心，养成习惯需要几周时间。' },
        { en: 'With regular practice, you will find words staying with you much longer.', zh: '坚持练习，你会发现单词记得更牢更久。' },
        { en: 'Small daily steps matter more than one long weekend session.', zh: '每天一小步，胜过周末突击学很久。' },
        { en: 'Thank you for listening, and good luck with your studies.', zh: '感谢收听，祝你学习顺利。' }
      ]
    }
  };

  /* ------------------------------------------------------------------
     N9-18（含 N9-10）：场景分类（仅呈现层，SCENES 数据结构不变）
     SCENE_GROUPS 为大类；SCENE_GROUP_OF 记录「场景 key → 大类 key」，
     ext JSON 增量合并进来的未知 key 默认落入 life（日常生活），保证永不丢场景。
     R131：大类不再单独平铺，改为下拉 optgroup 分组 + 徽标（vp-badge）。
     ------------------------------------------------------------------ */
  var SCENE_GROUPS = [
    { k: 'life', t: '日常生活' },
    { k: 'travel', t: '旅行出行' },
    { k: 'campus', t: '校园学习' },
    { k: 'work', t: '职场沟通' },
    { k: 'news', t: '新闻 / 题型' }
  ];
  var SCENE_GROUP_OF = {
    coffee: 'life', restaurant: 'life', shopping: 'life', street: 'life',
    airport: 'travel', hotel: 'travel',
    news: 'news', longconv: 'news', passage: 'news'
  };
  function groupKeyOf(k) { return SCENE_GROUP_OF[k] || 'life'; }
  function groupTitle(gk) {
    for (var i = 0; i < SCENE_GROUPS.length; i++) { if (SCENE_GROUPS[i].k === gk) return SCENE_GROUPS[i].t; }
    return '其它';
  }
  function sceneKeysOf(gk) {
    var out = [], ks = Object.keys(SCENES), i;
    for (i = 0; i < ks.length; i++) {
      if (groupKeyOf(ks[i]) === gk && SCENES[ks[i]] && SCENES[ks[i]].lines) out.push(ks[i]);
    }
    return out;
  }

  /* ------------------------------------------------------------------
     N9-18 P1（需求 7）：训练状态与今日统计
     —— 只存 localStorage，读写全部 try/catch（file:// / 隐私模式下静默降级为内存态）。
     存储结构：localStorage['vt_train_v1'] =
       { d: 'YYYY-MM-DD', done: { 'scene#idx': {u:听懂次数, s:跟读分} } }
     每次跨天自动清零，避免"今日统计"变成累计统计。
     ------------------------------------------------------------------ */
  var TRAIN_KEY = 'vt_train_v1';
  var TRAIN = { d: '', done: {} };
  function trainToday() {
    var dt = new Date();
    var m = dt.getMonth() + 1, dd = dt.getDate();
    return dt.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (dd < 10 ? '0' + dd : dd);
  }
  function trainLoad() {
    var t = trainToday(), raw = null;
    try { raw = window.localStorage.getItem(TRAIN_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var o = JSON.parse(raw);
        if (o && o.d === t && o.done && typeof o.done === 'object') { TRAIN = { d: t, done: o.done }; return; }
      } catch (e2) { /* 脏数据丢弃重建 */ }
    }
    TRAIN = { d: t, done: {} };
  }
  function trainSave() {
    try { window.localStorage.setItem(TRAIN_KEY, JSON.stringify(TRAIN)); } catch (e) { /* 降级为内存态 */ }
  }
  function trainKey(scene, idx) { return String(scene) + '#' + String(idx); }
  function trainGet(scene, idx) {
    var k = trainKey(scene, idx);
    return Object.prototype.hasOwnProperty.call(TRAIN.done, k) ? TRAIN.done[k] : null;
  }
  /* 记录一次训练结果：understood=true 听懂 / false 没听懂；score 为跟读分（可空） */
  function trainMark(scene, idx, understood, score) {
    var k = trainKey(scene, idx);
    var it = trainGet(scene, idx) || { u: 0, s: 0, n: 0 };
    if (understood === true) { it.u = (it.u || 0) + 1; it.ok = 1; }
    else if (understood === false) { it.u = (it.u || 0) + 1; it.ok = 0; }
    if (typeof score === 'number' && score > 0) {
      it.n = (it.n || 0) + 1;
      it.s = Math.round((((it.s || 0) * (it.n - 1)) + score) / it.n);
    }
    TRAIN.done[k] = it;
    trainSave();
  }
  /* 今日统计：完成句数 / 平均听懂次数 / 跟读平均分 */
  function trainStats() {
    var ks = Object.keys(TRAIN.done), i, done = 0, uSum = 0, sSum = 0, sN = 0, sc = TRAIN.done;
    for (i = 0; i < ks.length; i++) {
      var v = sc[ks[i]];
      if (!v) continue;
      done++;
      uSum += (Number(v.u) || 0);
      if (Number(v.s) > 0 && Number(v.n) > 0) { sSum += Number(v.s); sN++; }
    }
    return {
      done: done,
      avgListen: done ? Math.round((uSum / done) * 10) / 10 : 0,
      avgScore: sN ? Math.round(sSum / sN) : 0
    };
  }
  /* 本情景（本组）完成状态：已"听懂"过的句子视为 ✓ */
  function sceneDoneFlags(scene) {
    var out = [], lns = (SCENES[scene] && SCENES[scene].lines) ? SCENES[scene].lines : [], i, v;
    for (i = 0; i < lns.length; i++) {
      v = trainGet(scene, i);
      out.push(!!(v && v.ok === 1));
    }
    return out;
  }
  /* 挑战模式正确率（本情景内：听懂句数 / 已作答句数） */
  function sceneAcc(scene) {
    var f = sceneDoneFlags(scene), lns = (SCENES[scene] && SCENES[scene].lines) ? SCENES[scene].lines : [], i, done = 0, ok = 0, v;
    for (i = 0; i < lns.length; i++) {
      v = trainGet(scene, i);
      if (v && typeof v.ok === 'number') { done++; if (v.ok === 1) ok++; }
    }
    return { done: done, ok: ok, pct: done ? Math.round((ok / done) * 100) : 0 };
  }

  /* AI 助教「生词」用极简内置词典（离线可用，未命中时降级为「慢速朗读该词」）。
     只覆盖九个内置场景出现过的实词，不做全量词典。 */
  var VOCAB = {
    latte: 'n. 拿铁（咖啡）', muffin: 'n. 麦芬（小蛋糕）', sugar: 'n. 糖',
    receipt: 'n. 收据；小票', medium: 'adj. 中等的；中杯的',
    passport: 'n. 护照', baggage: 'n. 行李', suitcase: 'n. 手提箱',
    boarding: 'n. 登机；boarding pass 登机牌', gate: 'n. 登机口；大门',
    schedule: 'n./v. 时刻表；安排', departure: 'n. 起飞；离开',
    luggage: 'n. 行李', claim: 'v. 认领；n. Baggage Claim 行李提取处',
    recommend: 'v. 推荐；建议', grilled: 'adj. 烤制的', salmon: 'n. 三文鱼',
    sparkling: 'adj. 起泡的；sparkling water 气泡水',
    reservation: 'n. 预订；预约', breakfast: 'n. 早餐',
    gym: 'n. 健身房', wakeup: 'n. 叫醒（wake-up call 叫醒电话）',
    refund: 'n./v. 退款', shirt: 'n. 衬衫',
    style: 'n. 款式；风格', subway: 'n. 地铁', crossing: 'n. 十字路口',
    corner: 'n. 拐角', appreciate: 'v. 感激；欣赏',
    extend: 'v. 延长；扩展', forecast: 'n./v. 预报',
    native: 'adj. 本地的；native speaker 母语者', stadium: 'n. 体育场',
    exchange: 'n./v. 交换；交流', roundup: 'n. 综合报道；速览',
    divide: 'v. 划分；分配', presentation: 'n. 展示；陈述',
    summarize: 'v. 总结；概括', survey: 'n. 调查；问卷',
    slides: 'n. 幻灯片', memory: 'n. 记忆力；记忆',
    review: 'v./n. 复习；回顾', patient: 'adj. 有耐心的；n. 病人',
    habit: 'n. 习惯', difference: 'n. 差别；make a difference 有影响',
    session: 'n. 一段时间；场次', ready: 'adj. 准备好的'
  };
  /* 过滤高频虚词/代词，剩下的才算「可能的生词」 */
  var STOPWORDS = ('a an the this that these those i you he she we they it me him her us them my your his our their ' +
    'is am are was were be been being do does did doing have has had having will would can could should shall may might must ' +
    'and or but so if then than as because of to in on at for with from by about into over under after before ' +
    'there here what where when who why how which not no yes please thanks thank sorry ok okay sure great good ' +
    'today tomorrow yesterday now just very really much many more most some any all both each other another ' +
    'get got go goes going come comes coming want wants like likes need needs think thinks know knows say says ' +
    'one two three first second third about again also too well fine nice').split(' ');

  /* ------------------------------------------------------------------
     R162 扩充：内嵌兜底场景数据块（与 assets/data/listening-ext.json 的
     R162 新场景同源双保险）。file:// 直开时桌面 Chrome 的 fetch 本地 JSON
     会被 CORS 拦（App WebView 才放行），fetch 拉不到时由本块保证新场景照常
     可用；ext JSON 照留，双端兼容。结构：{ 场景key: {t, g, lines:[{en,zh}]} }，
     g 为场景大类 key（life/travel/campus/work/news），无 g 落 life。
     ------------------------------------------------------------------ */
  var EXT_FALLBACK = {
    life_doctor: { t: '看病问诊', g: 'life', lines: [
      { en: 'Good morning, what seems to be the problem?', zh: '早上好，你哪里不舒服？' },
      { en: 'I have had a sore throat and a mild fever since yesterday.', zh: '从昨天开始我喉咙痛，还有点低烧。' },
      { en: 'Let me take a look. Say \'ah\', please.', zh: '让我看看，请说\'啊\'。' },
      { en: 'It looks like a throat infection, nothing serious.', zh: '看起来是咽喉感染，不严重。' },
      { en: 'Take this medicine twice a day after meals and rest well.', zh: '这药每天饭后吃两次，好好休息。' },
      { en: 'Thank you, doctor. Do I need to come back for a follow-up?', zh: '谢谢医生，我需要回来复诊吗？' }
    ] },
    life_gym: { t: '健身房办卡', g: 'life', lines: [
      { en: 'Hi, I would like to sign up for a membership.', zh: '你好，我想办一张会员卡。' },
      { en: 'Sure. We have monthly, quarterly and yearly plans.', zh: '好的，我们有月卡、季卡和年卡。' },
      { en: 'What is included in the monthly plan?', zh: '月卡包含哪些项目？' },
      { en: 'You get full access to the gym, pool and group classes.', zh: '可以不限次使用健身房、泳池和团体课。' },
      { en: 'Are there any trainers available for beginners?', zh: '有面向初学者的教练吗？' },
      { en: 'Yes, a free introductory session comes with the membership.', zh: '有，办会员赠一节免费体验课。' }
    ] },
    travel_taxi: { t: '打车出行', g: 'travel', lines: [
      { en: 'Hello, could you take me to the railway station?', zh: '你好，能送我去火车站吗？' },
      { en: 'Sure, get in. It is about a twenty-minute drive.', zh: '可以，上车吧。大约二十分钟车程。' },
      { en: 'Could you drive a little slower? I am not in a hurry.', zh: '能开慢一点吗？我不赶时间。' },
      { en: 'No problem. The traffic is light at this hour.', zh: '没问题。这个时段车不多。' },
      { en: 'Stop here, please. How much do I owe you?', zh: '请在这儿停。车费多少？' },
      { en: 'That is thirty-six yuan. Thank you for taking my cab.', zh: '一共 36 元。感谢乘坐。' }
    ] },
    travel_sights: { t: '景点游览', g: 'travel', lines: [
      { en: 'Excuse me, what time does the museum open?', zh: '打扰一下，博物馆几点开门？' },
      { en: 'It opens at nine and the last entry is at four in the afternoon.', zh: '九点开门，下午四点停止入场。' },
      { en: 'Is there a student discount for the ticket?', zh: '门票有学生优惠吗？' },
      { en: 'Yes, students pay half price with a valid student card.', zh: '有，凭有效学生证半价。' },
      { en: 'Which exhibition would you recommend I see first?', zh: '你推荐我先看哪个展览？' },
      { en: 'The ancient bronzes on the second floor are a must-see.', zh: '二楼的古代青铜器展不容错过。' }
    ] },
    campus_library: { t: '图书馆借书', g: 'campus', lines: [
      { en: 'I would like to borrow these two books, please.', zh: '我想借这两本书。' },
      { en: 'Do you have your library card with you?', zh: '你带图书证了吗？' },
      { en: 'Here it is. How long can I keep them?', zh: '在这。最多能借多久？' },
      { en: 'Two weeks, and you can renew them once online.', zh: '两周，可以在网上续借一次。' },
      { en: 'What happens if I return them late?', zh: '如果迟还会怎么样？' },
      { en: 'There is a small fine of fifty cents per day per book.', zh: '每本书每天收五毛钱的少量滞纳金。' }
    ] },
    campus_class: { t: '课堂问答', g: 'campus', lines: [
      { en: 'Professor, could you explain that grammar rule again?', zh: '教授，您能再讲一遍那个语法规则吗？' },
      { en: 'Of course. Which part do you find confusing?', zh: '当然。你觉得哪部分不好理解？' },
      { en: 'I am not sure when to use the present perfect tense.', zh: '我不清楚什么时候用现在完成时。' },
      { en: 'Use it for actions connected to the present moment.', zh: '表示与当下有关联的动作时就用它。' },
      { en: 'Could you give us a couple of examples?', zh: '能给我们举几个例子吗？' },
      { en: 'Sure, for example: I have finished my homework.', zh: '当然，比如：我已经写完作业了。' }
    ] },
    work_interview: { t: '求职面试', g: 'work', lines: [
      { en: 'Tell me a little about yourself, please.', zh: '请简单介绍一下你自己。' },
      { en: 'I recently graduated with a degree in business English.', zh: '我最近毕业，专业是商务英语。' },
      { en: 'Why do you want to work with our company?', zh: '你为什么想加入我们公司？' },
      { en: 'I admire your company culture and its focus on innovation.', zh: '我欣赏贵公司的文化以及对创新的重视。' },
      { en: 'What do you consider your greatest strength?', zh: '你认为你最大的优势是什么？' },
      { en: 'I am a fast learner and I work well under pressure.', zh: '我学东西快，并且抗压能力强。' }
    ] },
    work_office: { t: '办公室日常', g: 'work', lines: [
      { en: 'Could you send me the report before the meeting?', zh: '开会前能把报告发给我吗？' },
      { en: 'Sure, I will email it to you within the hour.', zh: '好的，我一小时内发邮件给你。' },
      { en: 'Has the client confirmed the delivery date?', zh: '客户确认交货日期了吗？' },
      { en: 'Not yet. They promised to reply by tomorrow morning.', zh: '还没有。他们说明早之前答复。' },
      { en: 'Should we book a meeting room for the review?', zh: '评审会要订一间会议室吗？' },
      { en: 'Yes, please book the one on the third floor for two o\'clock.', zh: '好，请订三楼那间，下午两点。' }
    ] },
    news_tech: { t: '短文朗读 · 脑机输入新技术', g: 'news', lines: [
      { en: 'Scientists have developed a new tool that turns thoughts into text.', zh: '科学家研发出一种能把想法转化为文字的新工具。' },
      { en: 'Users only need to imagine speaking, and the words appear on screen.', zh: '使用者只需想象自己在说话，文字就会出现在屏幕上。' },
      { en: 'In early tests, the tool reached about eighty percent accuracy.', zh: '在早期测试中，该工具的准确率约为百分之八十。' },
      { en: 'Researchers say it could one day help patients who cannot speak.', zh: '研究人员表示，它未来或能帮助无法说话的患者。' },
      { en: 'The team plans to run larger trials in hospitals next year.', zh: '团队计划明年在医院开展更大规模的试验。' },
      { en: 'Experts warn that privacy rules must keep up with the technology.', zh: '专家提醒，隐私法规必须跟上技术发展的步伐。' },
      { en: 'A demonstration was held at the national technology fair last week.', zh: '上周在国家科技博览会上进行了现场演示。' },
      { en: 'Volunteers described the experience as strange but exciting.', zh: '志愿者形容这种体验神奇又令人兴奋。' },
      { en: 'The device currently looks like a small cap with soft sensors.', zh: '该设备目前看起来像一顶带有柔性传感器的帽子。' },
      { en: 'A lighter wearable version is expected within two years.', zh: '更轻便的可穿戴版本预计两年内面世。' }
    ] }
  };

  // 批次三 T11（R3-7）：听力三类题型增量合并（news / longconv / passage）
  // 内置 9 个场景为离线兜底（coffee/airport/restaurant/hotel/shopping/street 六个情景
  // + news/longconv/passage 三个题型）；ext JSON 按 key 合并，已存在 key 不覆盖（与 T06/T08 同策略）。
  // R162：场景条目支持可选 g 字段（大类 key，无 g 落 life，向后兼容）；
  // fetch 失败（file:// CORS / 离线）由 EXT_FALLBACK 内嵌兜底，双保险不丢新场景。
  function mergeScene(k, sc) {
    if (!sc || !sc.lines || !sc.lines.length || SCENES[k]) return false; // 已存在 key 不覆盖
    SCENES[k] = { t: sc.t || k, lines: sc.lines };
    if (sc.g && typeof sc.g === 'string') SCENE_GROUP_OF[k] = sc.g;
    return true;
  }
  function afterExtMerge(added) {
    if (added <= 0) return;
    if (typeof window.lucideAutoRender === 'function') { try { window.lucideAutoRender(); } catch (e) {} }
    try { if (S && document.getElementById('vpCats')) renderSceneBar(); } catch (e) {} // 面板已开时刷新场景条
  }
  function loadListeningExt() {
    var added = 0, ks = Object.keys(EXT_FALLBACK), i;
    for (i = 0; i < ks.length; i++) { if (mergeScene(ks[i], EXT_FALLBACK[ks[i]])) added++; }
    afterExtMerge(added);
    try {
      fetch('assets/data/listening-ext.json?v=20260929b').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var n = 0;
        if (j && j.scenes) {
          Object.keys(j.scenes).forEach(function (k) { if (mergeScene(k, j.scenes[k])) n++; });
        }
        afterExtMerge(n);
      }).catch(function () { /* file:// CORS / 离线：EXT_FALLBACK 已兜底 */ });
    } catch (e) { /* fetch 不可用：EXT_FALLBACK 已兜底 */ }
  }

  var S = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function css() {
    if (document.getElementById('vpStyle')) return;
    var c = '.vp-mask{position:fixed;inset:0;z-index:2400;background:var(--bg);display:none;flex-direction:column;color:var(--text);overflow:hidden}' +
      '.vp-mask.open{display:flex}' +
      /* 【R11 2026-09-21 用户反馈】听力训练面板（#vpMask）顶部返回栏在 App 沉浸式下被状态栏压住，
         须自垫状态栏高度：--xt-satop 由 MainActivity 注入，浏览器回落 env(...,0)，与 common.css .topbar 同口径。 */
      '.vp-top{flex:none;display:flex;align-items:center;gap:10px;padding:calc(12px + var(--xt-satop, env(safe-area-inset-top, 0px))) 16px 12px;background:var(--card);border-bottom:1px solid var(--border)}' +
      '.vp-top b{flex:1;font-size:15px;color:var(--text)}' +
      '.vp-back{display:inline-flex;align-items:center;gap:4px;background:var(--primary-light);border:none;color:var(--primary-dark);padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}' +
      '.vp-x{display:inline-flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--text-secondary);width:34px;height:34px;border-radius:10px;cursor:pointer}' +
      '.vp-x:hover{background:var(--bg)}' +
      '.vp-mode{flex:none;display:flex;gap:6px;margin:12px 16px 0;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px}' +
      '.vp-mode .m{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;text-align:center;padding:9px 0;border-radius:9px;background:transparent;font-size:13px;color:var(--text-secondary);cursor:pointer}' +
      '.vp-mode .m.on{background:var(--primary);color:#fff;font-weight:700}' +
      /* R131：场景改为「全部分类 + 下拉选择列表」（原生 select，样式对齐页面配色） */
      '.vp-cats{flex:none;display:flex;gap:8px;align-items:center;padding:10px 16px 0}' +
      '.vp-sel{flex:1;max-width:340px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:9px 12px;font-size:13px;color:var(--text);font-family:inherit;line-height:1.4;outline:none}' +
      '.vp-sel:focus{border-color:var(--primary)}' +
      '.vp-subs{flex:none;display:flex;gap:8px;flex-wrap:wrap;padding:8px 16px 4px;min-height:34px;align-items:center}' +
      '.vp-subs .s{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:6px 12px;font-size:13px;color:var(--text-secondary);cursor:pointer;font-family:inherit;line-height:1.4}' +
      '.vp-subs .s.on{background:var(--primary-light);border-color:var(--primary);color:var(--primary-dark);font-weight:700}' +
      /* R131：下拉选「全部分类」时平铺展示全部场景条目；选中某场景只显示该场景条目 */
      '.vp-none{font-size:12px;color:var(--text-muted)}' +
      '.vp-stage{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-height:0;padding:6px 16px 20px;overflow-y:auto}' +
      '.vp-count{color:var(--text-muted);font-size:12px;margin-bottom:8px}' +
      /* N9-18：主卡片放大到面板 60–70% */
      '.vp-card{background:var(--card);color:var(--text);width:70%;max-width:820px;border-radius:var(--radius);padding:18px 22px 16px;text-align:center;display:flex;flex-direction:column;box-shadow:var(--shadow);border:1px solid var(--border)}' +
      '@media (max-width:820px){.vp-card{width:100%}}' +
      '.vp-ctop{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}' +
      '.vp-badge{background:var(--primary-light);color:var(--primary-dark);font-size:12px;font-weight:700;padding:4px 10px;border-radius:12px}' +
      '.vp-idx{font-size:12px;color:var(--text-muted)}' +
      '.vp-bar{height:6px;border-radius:3px;background:var(--border);overflow:hidden}' +
      '.vp-bar i{display:block;height:100%;background:var(--primary);border-radius:3px}' +
      '.vp-apbar{height:4px;border-radius:2px;background:var(--border);overflow:hidden;margin-top:14px}' +
      '.vp-apbar i{display:block;height:100%;width:0;background:var(--primary);border-radius:2px}' +
      '.vp-en{font-size:22px;font-weight:800;line-height:1.55;margin-top:16px}' +
      '.vp-en.playing{color:var(--primary)}' +
      /* N9-18：砍掉模糊隐藏，隐藏态改为整块提示 */
      '.vp-hint{margin-top:16px;font-size:16px;color:var(--text-secondary);border:1px dashed var(--border);border-radius:12px;padding:20px 12px;cursor:pointer;line-height:1.6}' +
      '.vp-hint:hover{border-color:var(--primary);color:var(--primary-dark)}' +
      '.vp-zh{font-size:16px;color:var(--text-secondary);margin-top:12px;line-height:1.6}' +
      '.vp-link{background:transparent;border:none;color:var(--primary);font-size:13px;cursor:pointer;margin-top:12px;text-decoration:underline;font-family:inherit}' +
      /* N9-18：控制区一行排开，播放为视觉中心 */
      '.vp-ctl{display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:14px;padding:0 4px;width:100%;box-sizing:border-box;flex-wrap:nowrap}' +
      /* R164-c：控制条分三栏 左组/播放/右组，左右组等宽 → 播放按钮精确水平居中。
         R165：组宽改 2 份、播放 1.2 份；组内按钮 flex:1 撑满 —— 全部弹性、不写死像素。 */
      '.vp-ctl-l,.vp-ctl-r{flex:2 1 0;min-width:0;display:flex;align-items:center;gap:8px}' +
      '.vp-ctl-l{justify-content:flex-start}' +
      '.vp-ctl-r{justify-content:flex-end}' +
      '.vp-ctl-l .vp-cbtn,.vp-ctl-r .vp-cbtn,.vp-ctl-r .vp-sw{flex:1 1 0;min-width:0}' +
      '.vp-ctl2{display:flex;gap:10px;justify-content:center;align-items:center;margin-top:10px}' +
      '.vp-cbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:12px;padding:11px 14px;font-size:13px;cursor:pointer;font-family:inherit;line-height:1.3;white-space:nowrap}' +
      '.vp-cbtn:hover{border-color:var(--primary);color:var(--primary-dark)}' +
      '.vp-cbtn.solid{background:var(--primary);border-color:var(--primary);color:#fff;font-weight:700}' +
      '.vp-nav{padding:11px 0}' +
      '.vp-play{height:46px;border-radius:23px;background:var(--primary);border-color:var(--primary);color:#fff;font-weight:700;font-size:14px;gap:6px;flex:1.2 1 0;min-width:0}' +
      '.vp-play .nav-icon{width:18px;height:18px}' +
      '.vp-sw{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--border);color:var(--text-secondary);border-radius:20px;padding:8px 6px;font-size:13px;cursor:pointer;white-space:nowrap}' +
      '.vp-sw .swbox{display:inline-block;width:24px;height:13px;border-radius:7px;background:var(--border);position:relative;vertical-align:middle}' +
      '.vp-sw .knob{position:absolute;top:1.5px;left:1.5px;width:10px;height:10px;border-radius:50%;background:#fff}' +
      '.vp-sw.on{background:var(--primary-light);border-color:var(--primary);color:var(--primary-dark);font-weight:700}' +
      '.vp-sw.on .swbox{background:var(--primary)}' +
      '.vp-sw.on .knob{left:12.5px}' +
      '@media (max-width:400px){.vp-stage{padding:6px 10px 16px}.vp-ctl{gap:6px}.vp-ctl-l,.vp-ctl-r{gap:6px}.vp-cbtn{padding:10px 8px;font-size:13px}.vp-play{height:44px;border-radius:22px;font-size:13px}.vp-sw{padding:8px 5px;font-size:12px}.vp-sw .swbox{width:20px}.vp-sw.on .knob{left:10.5px}.vp-en{font-size:19px}}' +
      /* N9-18：逐句列表展开（R163：原文显隐改由卡片内 .vp-link 承接） */
      '.vp-full{width:70%;max-width:820px;background:var(--card);border:1px solid var(--border);border-radius:14px;margin-top:12px;padding:6px;max-height:34vh;overflow:auto;box-shadow:var(--shadow)}' +
      '@media (max-width:820px){.vp-full{width:100%}}' +
      '.vp-full .ln{display:block;width:100%;text-align:left;background:transparent;border:none;border-bottom:1px solid var(--border);padding:9px 8px;cursor:pointer;color:var(--text);font-family:inherit}' +
      '.vp-full .ln.cur{background:var(--primary-light);border-radius:8px}' +
      '.vp-full .ln b{display:block;font-size:14px;line-height:1.5}' +
      '.vp-full .ln em{display:block;font-style:normal;font-size:12px;color:var(--text-secondary);margin-top:3px}' +
      '.vp-full .ln i{display:inline-block;font-style:normal;font-size:11px;color:var(--text-muted);margin-right:6px}' +
      /* N9-18：AI 助教（单一头像 + 挂钩当前句） */
      '.vp-aiwrap{width:70%;max-width:820px;margin-top:12px;text-align:left}' +
      '@media (max-width:820px){.vp-aiwrap{width:100%}}' +
      '.vp-aifab{display:inline-flex;align-items:center;gap:8px;background:var(--primary-light);border:1px solid var(--border);border-radius:22px;padding:8px 15px;cursor:pointer;color:var(--primary-dark);font-size:13px;font-weight:600;font-family:inherit}' +
      '.vp-aibox{background:var(--card);border:1px solid var(--border);border-radius:14px;margin-top:8px;padding:12px;box-shadow:var(--shadow)}' +
      '.vp-aitabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}' +
      '.vp-aitabs .t{background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:5px 11px;font-size:12px;color:var(--text-secondary);cursor:pointer;font-family:inherit}' +
      '.vp-aitabs .t.on{background:var(--primary);border-color:var(--primary);color:#fff;font-weight:700}' +
      '.vp-aibody{font-size:13px;color:var(--text);line-height:1.8}' +
      '.vp-aibody p{margin:0 0 6px}' +
      '.vp-word{display:inline-block;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:3px 9px;margin:3px 5px 3px 0;font-size:13px;cursor:pointer;color:var(--text);font-family:inherit}' +
      '.vp-word u{text-decoration:none;display:block;font-size:11px;color:var(--text-muted);margin-top:1px}' +
      '.vp-ctx{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 10px;margin-bottom:6px}' +
      '.vp-ctx b{display:block;font-size:13px;line-height:1.5}' +
      '.vp-ctx em{display:block;font-style:normal;font-size:12px;color:var(--text-secondary);margin-top:2px}' +
      '.vp-ctx button{background:transparent;border:none;color:var(--primary);font-size:12px;cursor:pointer;padding:4px 0;font-family:inherit}' +
      /* R164-c：「问 AI」面板（快捷 chips / 输入框 / 回显区） */
      '.vp-askchips{margin:2px 0 4px}' +
      '.vp-askc{display:inline-block;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:5px 10px;margin:3px 6px 3px 0;font-size:12px;cursor:pointer;color:var(--text);font-family:inherit;text-align:left}' +
      '.vp-askc:hover{border-color:var(--primary);color:var(--primary-dark)}' +
      '.vp-askbar{display:flex;gap:6px;margin-top:8px}' +
      '.vp-aski{flex:1 1 auto;min-width:0;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 10px;font-size:13px;color:var(--text);font-family:inherit;box-sizing:border-box}' +
      '.vp-aski:focus{outline:none;border-color:var(--primary)}' +
      '.vp-askbtn{flex:none;background:var(--primary);border:1px solid var(--primary);border-radius:10px;padding:8px 14px;font-size:13px;color:#fff;font-weight:600;cursor:pointer;font-family:inherit}' +
      '.vp-askr{margin-top:8px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:9px 11px;font-size:13px;line-height:1.7;color:var(--text);word-break:break-word}' +
      '.vp-askr.vp-askerr{color:var(--danger)}' +
      '.vp-eval{background:var(--card);color:var(--text);max-width:820px;width:100%;margin-top:14px;border-radius:14px;padding:14px;max-height:40vh;overflow:auto;font-size:13px;box-shadow:var(--shadow);border:1px solid var(--border)}' +
      /* ===== N9-18 P1：精听/挑战双模式（需求 8） ===== */
      '.vp-gmode{flex:none;display:flex;gap:6px;margin:10px 16px 0;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px}' +
      '.vp-gmode .g{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;text-align:center;padding:8px 0;border-radius:9px;background:transparent;font-size:12px;color:var(--text-secondary);cursor:pointer;font-family:inherit;border:none}' +
      '.vp-gmode .g.on{background:var(--primary-light);color:var(--primary-dark);font-weight:700}' +
      /* ===== N9-18 P1：三阶段训练流程（需求 6） ===== */
      '.vp-steps{display:flex;gap:6px;justify-content:center;align-items:center;margin-top:12px;flex-wrap:wrap}' +
      '.vp-steps .st{font-size:12px;color:var(--text-muted);background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:4px 11px}' +
      '.vp-steps .st.on{background:var(--primary);border-color:var(--primary);color:#fff;font-weight:700}' +
      '.vp-steps .st.done{background:var(--primary-light);border-color:var(--primary);color:var(--primary-dark);font-weight:700}' +
      '.vp-guide{margin-top:12px;font-size:14px;color:var(--text-secondary);line-height:1.7}' +
      '.vp-yn{display:flex;gap:10px;justify-content:center;align-items:center;margin-top:14px;flex-wrap:wrap}' +
      '.vp-yn .y{background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:12px;padding:11px 20px;font-size:14px;cursor:pointer;font-family:inherit;font-weight:600}' +
      '.vp-yn .y:hover{border-color:var(--primary);color:var(--primary-dark)}' +
      '.vp-yn .y.solid{background:var(--primary);border-color:var(--primary);color:#fff}' +
      /* ===== N9-18 P1：训练状态反馈（需求 7） ===== */
      '.vp-stat{width:70%;max-width:820px;margin-top:12px;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:12px 14px;box-shadow:var(--shadow);text-align:left}' +
      '@media (max-width:820px){.vp-stat{width:100%}}' +
      '.vp-stat .dots{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}' +
      '.vp-stat .dot{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:8px;font-size:12px;background:var(--bg);border:1px solid var(--border);color:var(--text-muted);padding:0 6px}' +
      '.vp-stat .dot.ok{background:var(--primary-light);border-color:var(--primary);color:var(--primary-dark);font-weight:700}' +
      '.vp-stat .dot.cur{background:var(--primary);border-color:var(--primary);color:#fff;font-weight:700}' +
      '.vp-stat .rows{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary)}' +
      '.vp-stat .rows b{color:var(--primary-dark);font-size:14px}' +
      '.vp-stat h4{margin:0 0 4px;font-size:13px;color:var(--text)}';
    var st = document.createElement('style'); st.id = 'vpStyle'; st.textContent = c; (document.head || document.documentElement).appendChild(st);
  }

  // 图标补绘：动态插入 data-icon 元素后触发 lucide 全量扫描（icon-map.js 未加载时静默跳过）
  function paintIcons() { if (typeof window.lucideAutoRender === 'function') { try { window.lucideAutoRender(); } catch (e) {} } }

  /* ===== R131 辅助：场景条（下拉选择列表 + 场景条目） =====
     默认视图 = 「全部分类」：平铺展示全部场景条目；
     下拉选中某场景 = 条目区只显示该场景，并直接切入该场景练习。
     SCENES / SCENE_GROUPS 数据结构不变，仅改展示层。 */
  function renderSceneBar() {
    var bar1 = document.getElementById('vpCats');
    var bar2 = document.getElementById('vpSubs');
    if (!bar1 || !bar2 || !S) return;
    var sel = (S.catSel === '__all__' || !SCENES[S.catSel]) ? '__all__' : S.catSel;
    // —— 下拉选择列表：全部分类 + 各大类分组（optgroup）+ 场景选项 ——
    var h1 = '<select class="vp-sel" id="vpSel" aria-label="按场景筛选" onchange="openVoiceTrain.__selChange(this.value)">' +
      '<option value="__all__"' + (sel === '__all__' ? ' selected' : '') + '>全部分类</option>';
    for (var gi = 0; gi < SCENE_GROUPS.length; gi++) {
      var g = SCENE_GROUPS[gi];
      var gk = sceneKeysOf(g.k);
      if (!gk.length) continue;
      h1 += '<optgroup label="' + esc(g.t) + '">';
      for (var ki = 0; ki < gk.length; ki++) {
        h1 += '<option value="' + gk[ki] + '"' + (sel === gk[ki] ? ' selected' : '') + '>' + esc(SCENES[gk[ki]].t) + '</option>';
      }
      h1 += '</optgroup>';
    }
    h1 += '</select>';
    // —— 场景条目：全部分类 = 全部场景平铺（按大类顺序）；选中场景 = 仅该场景 ——
    var all = [], si;
    for (si = 0; si < SCENE_GROUPS.length; si++) { all = all.concat(sceneKeysOf(SCENE_GROUPS[si].k)); }
    var ks = Object.keys(SCENES); // 兜底：ext 合并进来的未归类场景也不丢
    for (si = 0; si < ks.length; si++) { if (all.indexOf(ks[si]) < 0) all.push(ks[si]); }
    var shown = (sel === '__all__') ? all : [sel];
    var h2 = '';
    for (si = 0; si < shown.length; si++) {
      var k = shown[si];
      if (!SCENES[k] || !SCENES[k].lines) continue;
      h2 += '<button class="s' + (S.scene === k ? ' on' : '') + '" onclick="openVoiceTrain.__scene(\'' + k + '\')">' + esc(SCENES[k].t) + '</button>';
    }
    if (!h2) h2 = '<span class="vp-none">该分类暂未收录场景</span>';
    bar1.innerHTML = h1;
    // R163：场景按钮平铺区已下线（用户红框删除）——场景切换统一走上方「全部分类」下拉
    bar2.innerHTML = '';
    bar2.style.display = 'none';
    paintIcons();
  }

  /* ===== N9-18 P1：精听 / 挑战 双模式切换条 =====
     R163：该切换条已按用户要求整体下线（红框删除），精听恒为默认模式。
     函数保留作兜底：历史调用点（openVoice / __mode / __genMode）不空转报错。 */
  function renderGModeBar() {
    var bar = document.getElementById('vpGMode');
    if (!bar) return;
    bar.innerHTML = '';
    bar.style.display = 'none';
  }

  /* ===== N9-18 辅助：AI 助教（挂钩当前句，离线规则实现） ===== */
  var AI_TABS = [
    { k: 'word', t: '生词' },
    { k: 'grammar', t: '语法' },
    { k: 'slow', t: '慢速重播' },
    { k: 'example', t: '举例' },
    { k: 'ask', t: '问 AI' }   // R164-c：新增「问 AI」——真接入 AI 通道
  ];
  function aiWords(en) {
    var raw = String(en || '').toLowerCase().split(/[^a-z']/);
    var seen = {}, out = [], i, w;
    for (i = 0; i < raw.length; i++) {
      w = raw[i].replace(/^'+|'+$/g, '');
      if (w.length < 4) continue;
      if (STOPWORDS.indexOf(w) >= 0) continue;
      if (seen[w]) continue;
      seen[w] = 1;
      out.push(w);
    }
    return out.slice(0, 8);
  }
  function aiGrammar(en) {
    var t = String(en || ''), r = [];
    if (/^(what|where|when|who|why|how)\b/i.test(t)) r.push('特殊疑问句：以疑问词开头，用来问具体信息（时间/地点/方式…），回答不能只说 Yes / No。');
    if (/^(do|does|did|is|are|was|were|can|could|would|will|should|may|have|has)\b/i.test(t) && /\?$/.test(t)) r.push('一般疑问句：助动词或情态动词提前到句首，通常先用 Yes / No 作答。');
    if (/\b(would|could)\s+(you|i|we)\b/i.test(t)) r.push('Would / Could + 主语：礼貌提出请求或建议，比 Can 更客气，服务类场景高频。');
    if (/\bthere\s+(is|are|was|were|will\s+be)\b/i.test(t)) r.push('There be 句型：表示「某处有某物 / 将有某事」，be 的形式与后面第一个名词保持一致。');
    if (/\b(have|has)\s+\w+ed\b/i.test(t)) r.push('现在完成时：have / has + 过去分词，强调过去的动作对现在造成的影响或结果。');
    if (/\b(am|is|are|was|were)\s+\w+ed\b/i.test(t)) r.push('被动语态：be + 过去分词，强调「被……」，动作的发出者常被省略。');
    if (/\b(going\s+to|will)\b/i.test(t)) r.push('一般将来时：will / be going to + 动词原形，表示将要发生的动作。');
    if (/\bif\b/i.test(t)) r.push('条件状语从句：If 引导条件，主句多用将来时或情态动词。');
    if (/\bcan\b/i.test(t)) r.push('情态动词 can：表示能力或请求许可，后面直接跟动词原形。');
    if (/^(let|let's)\b/i.test(t)) r.push('祈使 / 建议句：以动词原形或 Let’s 开头，用来提出建议。');
    if (/\bplease\b/i.test(t)) r.push('Please：礼貌标记，可放句首或句末，请求时加上更自然。');
    if (/\bmore\b/i.test(t) && /\bthan\b/i.test(t)) r.push('比较级：more + 形容词 + than，用于两者之间作比较。');
    if (!r.length) r.push('本句是简单陈述句：按「主语 + 谓语 + 宾语 / 补足语」展开。先抓主语和谓语动词，句意就清楚一半；再补上时间、地点等修饰成分。');
    return r;
  }
  function aiBodyHtml() {
    var sc = SCENES[S.scene], lns = sc.lines, it = lns[S.i], h = '', i;
    h += '<div class="vp-aitabs">';
    for (i = 0; i < AI_TABS.length; i++) {
      h += '<button class="t' + (S.aiTab === AI_TABS[i].k ? ' on' : '') + '" onclick="openVoiceTrain.__aiTab(\'' + AI_TABS[i].k + '\')">' + AI_TABS[i].t + '</button>';
    }
    h += '</div><div class="vp-aibody">';
    if (S.aiTab === 'word') {
      var ws = aiWords(it.en);
      if (!ws.length) { h += '<p>本句没有需要查的生词，都是高频基础词。</p>'; }
      else {
        h += '<p>本句可能的生词（点词可慢速朗读）：</p>';
        for (i = 0; i < ws.length; i++) {
          var mean = VOCAB[ws[i]] || '';
          h += '<button class="vp-word" onclick="openVoiceTrain.__sayWord(\'' + esc(ws[i]) + '\')">' + esc(ws[i]) + (mean ? '<u>' + esc(mean) + '</u>' : '<u>点我慢速朗读</u>') + '</button>';
        }
      }
    } else if (S.aiTab === 'grammar') {
      var gs = aiGrammar(it.en);
      for (i = 0; i < gs.length; i++) h += '<p>' + (i + 1) + '. ' + esc(gs[i]) + '</p>';
    } else if (S.aiTab === 'slow') {
      h += '<p>用 0.6 倍语速重读本句，逐词更清晰：</p><p style="color:var(--text-secondary)">' + esc(it.en) + '</p>';
      h += '<p><button class="vp-link" style="margin-top:4px" onclick="openVoiceTrain.__slow()">立即慢速重播</button></p>';
    } else if (S.aiTab === 'ask') {
      // R164-c：「问 AI」——真接入 window.callAI；快捷 chips 点击即发，也支持自由输入（Enter 发送）
      h += '<p>当前句：<b>' + esc(it.en) + '</b></p><p style="color:var(--text-secondary)">' + esc(it.zh) + '</p>';
      var ASK_CHIPS = ['这句话什么意思？怎么用？', '帮我逐词讲解这句', '用这句的句型造 3 个例句'];
      h += '<div class="vp-askchips">';
      for (i = 0; i < ASK_CHIPS.length; i++) {
        h += '<button class="vp-askc" onclick="openVoiceTrain.__ask(\'' + ASK_CHIPS[i] + '\')">' + esc(ASK_CHIPS[i]) + '</button>';
      }
      h += '</div>';
      h += '<div class="vp-askbar">' +
        '<input id="vpAskQ" class="vp-aski" type="text" placeholder="输入你的问题…" value="' + esc(S.askQ || '') + '" oninput="openVoiceTrain.__askQ(this.value)" onkeydown="if(event.key===\'Enter\'){openVoiceTrain.__askGo();}">' +
        '<button class="vp-askbtn" onclick="openVoiceTrain.__askGo()">发送</button>' +
        '</div>';
      if (S.askBusy) h += '<div class="vp-askr">AI 思考中…</div>';
      else if (S.askErr) h += '<div class="vp-askr vp-askerr">' + esc(S.askErr) + '</div>';
      else if (S.askReply) h += '<div class="vp-askr">' + esc(S.askReply).replace(/\n/g, '<br>') + '</div>';
    } else {
      h += '<p>本句在对话中的语境（可逐句慢速播放）：</p>';
      for (i = S.i - 1; i <= S.i + 1; i++) {
        if (i < 0 || i >= lns.length) continue;
        h += '<div class="vp-ctx"' + (i === S.i ? ' style="border-color:var(--primary)"' : '') + '>' +
          '<i>' + (i === S.i ? '本句' : (i < S.i ? '上一句' : '下一句')) + '</i>' +
          '<b>' + esc(lns[i].en) + '</b><em>' + esc(lns[i].zh) + '</em>' +
          '<button onclick="openVoiceTrain.__playAt(' + i + ')">慢速播放这一句</button></div>';
      }
    }
    h += '</div>';
    return h;
  }

  /* ==================================================================
     N9-18 P1（需求 6）：单句「三阶段」训练流程
     阶段① 听(stage='listen') → 阶段② 理解(stage='check') → 阶段③ 说(stage='speak')
     切句 / 切场景 / 切 tab / 切模式都会把 stage 复位到 'listen'。
     挑战模式下隐藏「原文 / 中文」，但阶段流程本身不变。
     ================================================================== */
  var STAGE_DEF = [
    { k: 'listen', t: '① 听' },
    { k: 'check', t: '② 理解' },
    { k: 'speak', t: '③ 说' }
  ];
  function stageIdx(k) {
    for (var i = 0; i < STAGE_DEF.length; i++) { if (STAGE_DEF[i].k === k) return i; }
    return 0;
  }
  function stageBarHtml() {
    var h = '<div class="vp-steps">', i, cur = stageIdx(S.stage);
    for (i = 0; i < STAGE_DEF.length; i++) {
      h += '<span class="st' + (i === cur ? ' on' : (i < cur ? ' done' : '')) + '">' + STAGE_DEF[i].t + '</span>';
    }
    if (S.stage === 'check') h += '<span class="st on">?</span>';
    h += '</div>';
    return h;
  }
  /* 挑战模式：是否允许显示原文 / 中文 / 慢速 */
  function isChallenge() { return S && S.genMode === 'challenge'; }
  // R165：本组进度 / 挑战正确率卡片按用户要求下线——函数保留作兜底（无 UI 入口，render 不再调用）。
  function challengeStatHtml() {
    var a = sceneAcc(S.scene);
    return '<div class="vp-stat"><h4>挑战模式 · 本情景正确率</h4>' +
      '<div class="rows"><span>已作答 <b>' + a.done + '</b> 句</span>' +
      '<span>听懂 <b>' + a.ok + '</b> 句</span>' +
      '<span>正确率 <b>' + a.pct + '%</b></span></div></div>';
  }
  /* 训练状态反馈（需求 7）：本组完成点阵 + 今日统计
     R165：整张「本组进度（含今日统计）」卡片按用户要求下线，函数保留作兜底（无 UI 入口，render 不再调用）。 */
  function statPanelHtml() {
    var flags = sceneDoneFlags(S.scene), lns = SCENES[S.scene].lines, i, st = trainStats();
    var h = '<div class="vp-stat"><h4>本组进度（✓ 已听懂 / ● 当前 / ○ 未完成）</h4><div class="dots">';
    for (i = 0; i < flags.length; i++) {
      var cls = (i === S.i) ? 'dot cur' : (flags[i] ? 'dot ok' : 'dot');
      h += '<span class="' + cls + '">' + (flags[i] ? '✓' : (i + 1)) + '</span>';
    }
    h += '</div><h4>今日统计</h4><div class="rows">' +
      '<span>已完成 <b>' + st.done + '</b> 句</span>' +
      '<span>平均听懂 <b>' + st.avgListen + '</b> 次</span>' +
      '<span>跟读平均分 <b>' + st.avgScore + '</b></span></div></div>';
    return h;
  }

  /* ===== N9-18：主渲染 ===== */
  function render() {
    var sc = SCENES[S.scene], lns = sc.lines, i = S.i, it = lns[i];
    var chg = isChallenge();
    // R162：口语跟读模式精简次级元素（三阶段条 / 统计块 / 假进度条不渲染），
    // 首屏核心 = 句子 + 播放控件 + 跟读按钮 + 逐句列表（full 默认展开）
    var isSpeak = (S.mode === 'speak');
    // 挑战模式强制隐藏原文 / 中文（需求 8：❌中文 ❌原文 ❌慢速）
    if (chg) { S.showEn = false; S.showZh = false; }
    var showEn = S.showEn;
    // 砍掉模糊隐藏：隐藏态完全不显示英文，只给可点击提示
    var enHtml = showEn
      ? '<div class="vp-en" id="vpEn">' + esc(it.en) + '</div>'
      : '<div class="vp-hint" onclick="openVoiceTrain.__en()">先听音频，点此显示原文</div>';
    var zhHtml = S.showZh ? '<div class="vp-zh">' + esc(it.zh) + '</div>' : '';
    var pct = Math.round(((i + 1) / lns.length) * 100);
    var box = document.getElementById('vpBody');
    var evalBox = '<div id="vpEval"></div>';
    // 控制区：挑战模式隐藏「慢速 / 中文」
    // R163：控制条删除「查看原文」按钮（vp-enbtn）——原文显隐改由卡片内 vp-link 承接。
    // R164-c：顺序 上一句 / 慢速 / 播放 / 中文 / 下一句；分「左组 / 播放 / 右组」三栏，左右组 flex:1 等宽 → 播放精确居中。
    var ctl =
      '<div class="vp-ctl">' +
      '<div class="vp-ctl-l">' +
      '<button class="vp-cbtn vp-nav" title="上一句" onclick="openVoiceTrain.__prev()"><span class="nav-icon" data-icon="chevron-left" data-icon-size="16"></span></button>' +
      (chg ? '' : '<button class="vp-cbtn" onclick="openVoiceTrain.__slow()">慢速</button>') +
      '</div>' +
      '<button class="vp-cbtn vp-play" id="vpPlay" title="播放 / 停止" onclick="openVoiceTrain.__play()"><span class="nav-icon" data-icon="play" data-icon-size="18"></span><span id="vpPlayLabel">' + (vpIsPlaying() ? '停止' : '播放') + '</span></button>' +
      '<div class="vp-ctl-r">' +
      (chg ? '' : '<button class="vp-sw' + (S.showZh ? ' on' : '') + '" onclick="openVoiceTrain.__zh()"><span class="swbox"><span class="knob"></span></span>中文</button>') +
      '<button class="vp-cbtn vp-nav" title="下一句" onclick="openVoiceTrain.__next()"><span class="nav-icon" data-icon="chevron-right" data-icon-size="16"></span></button>' +
      '</div>' +
      '</div>';
    // 阶段引导 + 阶段专属操作区（需求 6；R162：speak 模式跳过三阶段，恒为跟读态）
    // R163：听力精听（listen 模式）删除「引导文案 .vp-guide + 按钮行 .vp-yn」，首屏核心化；
    //      保留 ①②③ 步骤条(.vp-steps) / 假进度条(.vp-apbar) / 统计块(.vp-stat)；口语跟读（speak）现状不变。
    var stage = isSpeak ? 'speak' : (S.stage || 'listen');
    var stageHtml = '';
    if (stage === 'speak') {
      stageHtml += '<div class="vp-guide">现在请跟读，尽量模仿语音语调</div>';
      stageHtml += '<div class="vp-yn">' +
        '<button class="y solid" id="vpRec" onclick="openVoiceTrain.__rec()"><span class="nav-icon" data-icon="mic" data-icon-size="14"></span>开始跟读</button>' +
        '<button class="y" onclick="openVoiceTrain.__next()">下一句 →</button>' +
        '</div>';
    }
    var full = '';
    if (S.full) {
      full = '<div class="vp-full">';
      for (var j = 0; j < lns.length; j++) {
        full += '<button class="ln' + (j === i ? ' cur' : '') + '" onclick="openVoiceTrain.__jump(' + j + ')"><i>' + (j + 1) + '</i><b>' + esc(lns[j].en) + '</b><em>' + esc(lns[j].zh) + '</em></button>';
      }
      full += '</div>';
    }
    var ai = chg ? '' : '<div class="vp-aiwrap">' +
      (S.aiOpen
        ? '<button class="vp-aifab" onclick="openVoiceTrain.__ai()"><span class="nav-icon" data-icon="sparkles" data-icon-size="15"></span>收起 AI 助教</button><div class="vp-aibox">' + aiBodyHtml() + '</div>'
        : '<button class="vp-aifab" onclick="openVoiceTrain.__ai()"><span class="nav-icon" data-icon="sparkles" data-icon-size="15"></span>这句没听懂？点我</button>') +
      '</div>';
    box.innerHTML =
      '<div class="vp-card">' +
      '<div class="vp-ctop"><span class="vp-badge">' + esc(groupTitle(S.group)) + ' · ' + esc(sc.t) + '</span>' +
      '<span class="vp-idx">第 ' + (i + 1) + ' 句 / 共 ' + lns.length + ' 句</span></div>' +
      '<div class="vp-bar"><i id="vpBarIn" style="width:' + pct + '%"></i></div>' +
      enHtml + zhHtml +
      (isSpeak ? '' : stageBarHtml()) +
      stageHtml +
      (isSpeak ? '' : '<div class="vp-apbar"><i id="vpApIn"></i></div>') +
      (chg ? '' : '<button class="vp-link" onclick="openVoiceTrain.__en()">' + (showEn ? '收起原文' : '查看原文') + '</button>') +
      '</div>' +
      ctl + full + ai + evalBox;   // R165：本组进度 / 今日统计卡片按用户要求下线（statPanelHtml/challengeStatHtml 保留兜底，不再渲染）
    // 播放中重绘（切句 / 开关 / 展开）时补回高亮与按钮文案
    if (vpIsPlaying()) {
      var pe = document.getElementById('vpEn');
      if (pe) { try { pe.classList.add('playing'); } catch (e2) {} }
      var pl = document.getElementById('vpPlayLabel');
      if (pl) pl.textContent = '停止';
    }
    paintIcons();
  }

  function openVoice(mode) {
    css();
    trainLoad();
    var listen = (mode || 'listen') !== 'speak';
    S = {
      mode: mode || 'listen', scene: 'coffee', group: 'life', i: 0,
      showEn: mode === 'speak', showZh: true, slow: false,
      full: false, aiOpen: false, aiTab: 'word',   // R164-b：两 tab 一致，逐句列表不再展示
      // N9-18 P1：训练阶段（听→理解→说）+ 精听/挑战双模式
      stage: 'listen', genMode: listen ? 'intensive' : 'intensive',
      // R131：场景筛选态（'__all__' = 全部分类，默认；其它值 = 具体场景 key）
      catSel: '__all__',
      // R164-c：AI 助教「问 AI」状态——askKey 守卫异步响应只回填到发起时的句子
      askQ: '', askKey: null, askBusy: false, askReply: '', askErr: ''
    };
    var m = document.getElementById('vpMask'); if (m) m.remove();
    m = document.createElement('div'); m.id = 'vpMask'; m.className = 'vp-mask open';
    m.innerHTML =
      '<div class="vp-top">' +
      '<button class="vp-back" onclick="openVoiceTrain.__close()">← 返回</button>' +
      '<b id="vpTitle"><span class="nav-icon" data-icon="' + (mode === 'listen' ? 'headphones' : 'mic') + '" data-icon-size="16"></span> 听说训练 · ' + (mode === 'listen' ? '听力精听' : '口语跟读') + '</b>' +
      '</div>' +
      '<div class="vp-mode">' +
      '<div class="m' + (mode === 'listen' ? ' on' : '') + '" data-mo="listen" onclick="openVoiceTrain.__mode(\'listen\')"><span class="nav-icon" data-icon="headphones" data-icon-size="14"></span>听力精听</div>' +
      '<div class="m' + (mode === 'speak' ? ' on' : '') + '" data-mo="speak" onclick="openVoiceTrain.__mode(\'speak\')"><span class="nav-icon" data-icon="mic" data-icon-size="14"></span>口语跟读</div></div>' +
      // R163：精听/挑战模式切换条已下线（用户红框删除）——不再渲染容器，renderGModeBar 仅兜底隐藏
      // R131：场景区改为「全部分类 + 下拉选择列表」，内容由 renderSceneBar 填充
      '<div class="vp-cats" id="vpCats"></div>' +
      '<div class="vp-subs" id="vpSubs"></div>' +
      '<div class="vp-stage" id="vpBody"></div>';
    document.body.appendChild(m);
    if (window.openAppModal) window.openAppModal('vpMask'); // 统一弹窗基建：锁滚动（ESC 关闭由 app.js 按 #vpMask 联动 __close）
    paintIcons();
    renderSceneBar();
    renderGModeBar();
    render();
  }
  /* ============ P1 修复：Web Speech 安全播放层（2026-09-15） ============
     背景：浏览器里点播放报「朗读服务暂不可用」，根因是 speakUtterance → netSpeak →
     speakFallback 最终落到裸 Web Speech 调用，踩中 Chrome 三个经典坑：
       ① getVoices() 首次返回空数组，未等 voiceschanged 就放弃；
       ② 未指定 voice（voices 为空时合成被静默丢弃）；
       ③ 未处理 paused 状态、未挂 onerror，失败无声无息。
     本层在 voiceplayer 内自救，不改动 app.js 的 TTS 链路（避免与其它改动冲突）。
     注意：禁用正则 lookbehind —— 旧版 Android WebView 会直接抛 SyntaxError。 */
  var _vpVoicesOk = false, _vpPlaying = false;

  function vpEnsureVoices(cb) {
    var ss = window.speechSynthesis;
    if (!ss) { cb(false); return; }
    try { if (ss.getVoices && ss.getVoices().length) { _vpVoicesOk = true; cb(true); return; } } catch (e) {}
    var done = false;
    function fin() {
      if (done) return;
      done = true;
      try { ss.removeEventListener('voiceschanged', fin); } catch (e) {}
      _vpVoicesOk = true; cb(true);
    }
    try { ss.addEventListener('voiceschanged', fin); } catch (e) {}
    setTimeout(fin, 500); // 超时兜底：拿不到 voices 也要尝试朗读
  }

  function vpPickVoice(lang) {
    var ss = window.speechSynthesis;
    if (!ss || !ss.getVoices) return null;
    var vs = [], i, v;
    try { vs = ss.getVoices() || []; } catch (e) { return null; }
    var want = String(lang || '').toLowerCase();
    for (i = 0; i < vs.length; i++) { v = vs[i]; if (v && v.lang && v.lang.toLowerCase() === want) return v; }
    for (i = 0; i < vs.length; i++) { v = vs[i]; if (v && v.lang && v.lang.toLowerCase().indexOf(want.slice(0, 2)) === 0) return v; }
    return null;
  }

  /* 长文本分句：Chrome 对单条 utterance 约 15 秒静默截断，超过阈值就切段顺序播放。
     用逐字符扫描实现，不使用 lookbehind（兼容旧 WebView）。 */
  function vpSplit(t) {
    if (t.length <= 180) return [t];
    var out = [], cur = '', i, c;
    for (i = 0; i < t.length; i++) {
      c = t.charAt(i); cur += c;
      if ((c === '.' || c === '!' || c === '?' || c === '。' || c === '！' || c === '？') && cur.length > 60) { out.push(cur); cur = ''; }
    }
    if (cur.replace(/\s/g, '')) out.push(cur);
    return out.length ? out : [t];
  }

  /* N9-18：播放进度条（Web Speech 无可靠进度事件，按文本长度估算时长推进；
     结束 / 停止时归零，失败也归零，不会卡在半途） */
  var _vpProgTimer = null, _vpProgDur = 2000, _vpProgT0 = 0;
  function vpProgReset() {
    if (_vpProgTimer) { clearInterval(_vpProgTimer); _vpProgTimer = null; }
    var el = document.getElementById('vpApIn');
    if (el) el.style.width = '0%';
  }
  function vpProgStart(dur) {
    vpProgReset();
    _vpProgDur = dur > 0 ? dur : 2000;
    _vpProgT0 = Date.now();
    _vpProgTimer = setInterval(function () {
      var el = document.getElementById('vpApIn');
      if (!el) { vpProgReset(); return; }
      var p = (Date.now() - _vpProgT0) / _vpProgDur;
      if (p > 1) p = 1;
      el.style.width = Math.round(p * 100) + '%';
    }, 100);
  }
  function vpEstDur(text, rate) {
    var n = String(text == null ? '' : text).length;
    var r = Number(rate) > 0 ? Number(rate) : 0.9;
    return Math.max(1500, Math.round(n * 62 / r));
  }

  function vpSetPlaying(on) {
    _vpPlaying = !!on;
    var en = document.getElementById('vpEn');
    if (en) { try { en.classList.toggle('playing', _vpPlaying); } catch (e) {} }
    var lb = document.getElementById('vpPlayLabel');
    if (lb) lb.textContent = _vpPlaying ? '停止' : '播放';
    if (_vpPlaying) vpProgStart(_vpProgDur); else vpProgReset();
  }
  function vpIsPlaying() { return _vpPlaying; }
  function vpStop() {
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
    vpSetPlaying(false);
  }

  function vpSpeakPieces(pieces, lang, rate, idx) {
    if (idx >= pieces.length) { vpSetPlaying(false); return; }
    var ss = window.speechSynthesis;
    var u = new SpeechSynthesisUtterance(pieces[idx]);
    u.lang = lang || 'en-US';
    u.rate = Number(rate) > 0 ? Number(rate) : 0.9;
    var v = vpPickVoice(u.lang); if (v) u.voice = v;
    u.onend = function () { vpSpeakPieces(pieces, lang, rate, idx + 1); };
    u.onerror = function (ev) {
      vpSetPlaying(false);
      var e = (ev && ev.error) || '';
      if (e === 'not-allowed' || e === 'audio-busy') toast('被浏览器自动播放策略拦截，请再点一次播放');
      else if (e === 'language-unavailable' || e === 'voice-unavailable') toast('系统缺少可用的英文语音，无法朗读');
      else toast('朗读失败：' + (e || '未知原因'));
    };
    try { ss.speak(u); } catch (e) { vpSetPlaying(false); toast('朗读失败，请稍后重试'); }
  }

  function vpSafeSpeak(text, lang, rate) {
    var t = String(text == null ? '' : text).trim();
    if (!t) return false;
    var ss = window.speechSynthesis;
    if (!ss || typeof window.SpeechSynthesisUtterance !== 'function') { vpBrowserUnsupported(); return false; }
    vpEnsureVoices(function () {
      try {
        ss.cancel();
        var pieces = vpSplit(t);
        vpSetPlaying(true);
        vpSpeakPieces(pieces, lang || 'en-US', rate, 0);
        if (ss.paused) { try { ss.resume(); } catch (e) {} }
      } catch (e) { vpSetPlaying(false); toast('朗读失败，请稍后重试'); }
    });
    return true;
  }

  /* ==================================================================
     R73 需求4：语音播放三级降级（App 内可用 / 浏览器能力探测 / 友好兜底）
       ① 原生桥（App 内）：系统 TTS 就绪 → 走 app.js 既有链路（含重试 / 引擎自动切换）；
          未就绪 → 直接调原生网络 TTS（AndroidTTS.netTts，MediaPlayer 播放，不依赖系统引擎）。
       ② Web Speech（浏览器）：speechSynthesis + voiceschanged 兜底。
       ③ 都不支持：友好提示（区分安卓浏览器 / 桌面浏览器），并自动展开原文兜底。
     语法铁律：ES2017 上限（禁可选链、空值合并、对象展开、fromEntries、at 等）。
     ================================================================== */
  var _vpNativeSeq = 0, _vpResetTimer = null;

  function vpNativeAvailable() {
    try { return !!(window.AndroidTTS && typeof window.AndroidTTS.speak === 'function'); } catch (e) { return false; }
  }
  function vpNativeReady() {
    try { return !!(window.AndroidTTS && typeof window.AndroidTTS.isReady === 'function' && window.AndroidTTS.isReady()); } catch (e) { return false; }
  }
  /* 估算时长走完后自动复位播放按钮（原生链路没有页内 onend 可用） */
  function vpAutoReset(dur) {
    if (_vpResetTimer) { clearTimeout(_vpResetTimer); _vpResetTimer = null; }
    _vpResetTimer = setTimeout(function () { _vpResetTimer = null; vpSetPlaying(false); }, (dur > 0 ? dur : 2000) + 400);
  }
  /* 把原生网络 TTS 的完成/失败回调并入 voiceplayer（app.js 注册表里没有 'vp' 前缀 id）。 */
  function vpHookNetTts() {
    if (window.__vpNetHooked) return;
    window.__vpNetHooked = true;
    var oldDone = window.__netTtsDone, oldErr = window.__netTtsError;
    window.__netTtsDone = function (id) {
      try { if (String(id).indexOf('vp') === 0) { vpSetPlaying(false); return; } } catch (e) {}
      if (typeof oldDone === 'function') { try { oldDone(id); } catch (e2) {} }
    };
    window.__netTtsError = function (id, msg) {
      try {
        if (String(id).indexOf('vp') === 0) {
          vpSetPlaying(false);
          toast('朗读失败（' + (msg || '') + '）');
          return;
        }
      } catch (e) {}
      if (typeof oldErr === 'function') { try { oldErr(id, msg); } catch (e3) {} }
    };
  }
  /* 一级：App 原生。返回 true 表示已受理朗读 */
  function vpTryNative(text, rate) {
    if (!vpNativeAvailable()) return false;
    vpHookNetTts();
    var t = String(text == null ? '' : text);
    var r = Number(rate) > 0 ? Number(rate) : 0.9;
    // 引擎已就绪：走 app.js 既有链路（错误重试 / 引擎自动切换最完整）
    if (vpNativeReady() && typeof speakUtterance === 'function') {
      try { speakUtterance(t, 'en-US'); _vpProgDur = vpEstDur(t, r); vpSetPlaying(true); vpAutoReset(_vpProgDur); return true; } catch (e) {}
    }
    // 引擎未就绪：直接调原生网络 TTS（MediaPlayer 播放，不需要系统语音引擎）
    if (window.AndroidTTS && typeof window.AndroidTTS.netTts === 'function') {
      try {
        _vpNativeSeq++;
        var ok = window.AndroidTTS.netTts(t, 'en-US', r, 'vp' + _vpNativeSeq);
        if (ok) { _vpProgDur = vpEstDur(t, r); vpSetPlaying(true); vpAutoReset(_vpProgDur); return true; }
      } catch (e2) {}
    }
    // 最后再交给 app.js 原生链路（内部会给诊断提示，不会静默）
    if (typeof speakUtterance === 'function') {
      try { speakUtterance(t, 'en-US'); _vpProgDur = vpEstDur(t, r); vpSetPlaying(true); vpAutoReset(_vpProgDur); return true; } catch (e3) {}
    }
    return false;
  }
  /* 三级：环境不支持语音合成时的友好兜底 + 原文自动展开 */
  function vpBrowserUnsupported() {
    var ua = '';
    try { ua = String(navigator.userAgent || ''); } catch (e) {}
    if (/Android/i.test(ua)) {
      toast('当前浏览器不支持语音朗读（多数国产手机浏览器如此）。请在「星途 App」内打开本页，或改用 Chrome / Edge 浏览器。');
    } else {
      toast('当前浏览器不支持语音朗读，建议改用 Chrome / Edge 浏览器。');
    }
    try { if (S) { S.showEn = true; render(); } } catch (e2) {}
  }

  function play() {
    var it = SCENES[S.scene].lines[S.i];
    _vpProgDur = vpEstDur(it.en, 0.9);
    if (vpTryNative(it.en, 0.9)) return;        // ① App 原生（系统 TTS 优先，未就绪则原生网络 TTS）
    if (vpSafeSpeak(it.en, 'en-US', 0.9)) return; // ② 浏览器 Web Speech
    vpBrowserUnsupported();                       // ③ 友好提示 + 原文兜底
  }
  window.openVoiceTrain = function (mode) { openVoice(mode); };
  window.openVoiceTrain.__close = function () { vpStop(); try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {} var m = document.getElementById('vpMask'); if (m) m.remove(); S = null; if (window.closeAppModal) window.closeAppModal('vpMask'); };
  window.openVoiceTrain.__mode = function (mo) {
    if (!S || !mo) return;
    S.mode = mo; S.showEn = (mo === 'speak'); S.i = 0; S.full = false; S.aiOpen = false; vpStop();
    S.stage = 'listen'; // 切 tab 复位到阶段①，避免口语 tab 空转「理解」流程
    // K19 修复：切换 tab 时同步更新选中态（此前 on 类写死于初次渲染，点击另一 tab 样式不变）
    var tabs = document.querySelectorAll('#vpMask .vp-mode .m');
    for (var ti = 0; ti < tabs.length; ti++) { tabs[ti].classList.toggle('on', tabs[ti].getAttribute('data-mo') === mo); }
    var tt = document.getElementById('vpTitle');
    if (tt) tt.innerHTML = '<span class="nav-icon" data-icon="' + (mo === 'listen' ? 'headphones' : 'mic') + '" data-icon-size="16"></span> 听说训练 · ' + (mo === 'listen' ? '听力精听' : '口语跟读');
    // 切 tab 后重绘顶部/场景区图标态（chips 是静态 DOM，仅需标题与句区刷新）
    renderGModeBar();
    render();
    paintIcons();
  };
  // N9-18 P1（需求 8）：精听 / 挑战 模式切换
  window.openVoiceTrain.__genMode = function (gk) {
    if (!S || !gk) return;
    S.genMode = (gk === 'challenge') ? 'challenge' : 'intensive';
    S.stage = 'listen'; S.full = false; S.aiOpen = false;
    if (isChallenge()) { S.showEn = false; S.showZh = false; }
    vpStop();
    toast(isChallenge() ? '挑战模式：隐藏原文/中文/慢速，只管听' : '精听模式：可慢速、看原文、看中文');
    renderGModeBar();
    render();
  };
  // R131：下拉选择列表变化（'__all__' = 全部分类；选场景 = 筛选并直接切入该场景）
  window.openVoiceTrain.__selChange = function (v) {
    if (!S) return;
    if (v === '__all__' || !SCENES[v]) { S.catSel = '__all__'; renderSceneBar(); return; }
    S.catSel = v;
    S.scene = v; S.i = 0; S.showEn = S.mode === 'speak'; S.showZh = true;
    S.group = groupKeyOf(v); S.full = false; S.aiOpen = false; S.stage = 'listen';   // R164-b：逐句列表不再展示
    S.askKey = null; S.askReply = ''; S.askErr = '';   // R164-c：切场景清空问答回显
    vpStop();
    renderSceneBar(); render();
  };
  // 场景条目切换（条目区 chip 点击；全部分类视图下保持平铺不筛选）
  window.openVoiceTrain.__scene = function (k) {
    if (!S || !SCENES[k]) return;
    S.scene = k; S.i = 0; S.showEn = S.mode === 'speak'; S.showZh = true;
    S.group = groupKeyOf(k); S.full = false; S.aiOpen = false; S.stage = 'listen';   // R164-b：逐句列表不再展示
    S.askKey = null; S.askReply = ''; S.askErr = '';   // R164-c：切场景清空问答回显
    renderSceneBar(); render();
  };
  window.openVoiceTrain.__prev = function () { if (!S) return; if (S.i > 0) { S.i--; } else { toast('已是第一句'); } S.askKey = null; S.askReply = ''; S.askErr = ''; S.stage = 'listen'; vpStop(); render(); };
  window.openVoiceTrain.__next = function () {
    if (!S) return;
    if (S.i < SCENES[S.scene].lines.length - 1) { S.i++; S.askKey = null; S.askReply = ''; S.askErr = ''; S.stage = 'listen'; vpStop(); render(); }
    else { toast('本情景完成！换个情景再练吧'); }
  };
  // N9-18 P1：阶段推进 —— 阶段① →（点击「听完了，去判断」）→ 阶段②
  window.openVoiceTrain.__toCheck = function () {
    if (!S) return;
    S.stage = 'check';
    vpStop();
    render();
  };
  // N9-18 P1：阶段② 听懂 / 没听懂 → 记录到今日统计 → 进入阶段③
  window.openVoiceTrain.__mark = function (ok) {
    if (!S) return;
    var understood = !!ok;
    trainMark(S.scene, S.i, understood, 0);
    if (!understood) {
      // 没听懂：精听模式放宽限制（自动揭示原文+中文），挑战模式维持隐藏
      if (!isChallenge()) { S.showEn = true; S.showZh = true; }
      toast('没关系，再来一遍或多看原文');
    } else {
      toast('很棒！进入跟读阶段');
    }
    S.stage = 'speak';
    vpStop();
    render();
  };
  // N9-18：全文跳转 / 全文开关 / AI 助教开关 / AI 分栏 / 单词慢速朗读
  window.openVoiceTrain.__jump = function (n) {
    if (!S) return;
    var lns = SCENES[S.scene].lines;
    n = Number(n);
    if (isNaN(n) || n < 0 || n >= lns.length) return;
    S.i = n; S.askKey = null; S.askReply = ''; S.askErr = ''; S.stage = 'listen'; vpStop(); render();
  };
  // R163：__full（逐句列表展开）保留函数本体，但 UI 入口已下线（原展开按钮改建为「查看原文」）。
  // 逐句列表展开态由 mode/scene/selChange 默认值控制（speak 默认展开）。
  window.openVoiceTrain.__full = function () { if (!S) return; S.full = !S.full; render(); };
  window.openVoiceTrain.__ai = function () { if (!S) return; S.aiOpen = !S.aiOpen; render(); };
  window.openVoiceTrain.__aiTab = function (tk) { if (!S) return; S.aiTab = tk || 'word'; render(); };
  // R164-c：「问 AI」——真接入全站 AI 通道（window.callAI → /api/ai/chat）。纯 ES5，无 async/await，用 Promise 模式。
  window.openVoiceTrain.__askQ = function (v) { if (S) S.askQ = (v == null ? '' : String(v)); };
  window.openVoiceTrain.__askGo = function () { if (S) window.openVoiceTrain.__ask(S.askQ); };
  window.openVoiceTrain.__ask = function (q) {
    if (!S) return;
    q = String(q == null ? '' : q).replace(/^\s+|\s+$/g, '');
    if (!q || S.askBusy) return;
    if (typeof window.callAI !== 'function') { S.askErr = 'AI 通道未就绪，请稍后重试'; render(); return; }
    var sc = SCENES[S.scene], it = sc.lines[S.i];
    var key = S.scene + ':' + S.i;
    S.askKey = key; S.askBusy = true; S.askReply = ''; S.askErr = '';
    render();
    var prompt = '你是英语学习助手。请结合下面这句英文对话，回答学生的问题。\n' +
      '场景：' + sc.t + '\n' +
      '英文句子：' + it.en + '\n' +
      '中文意思：' + it.zh + '\n' +
      '学生的问题：' + q + '\n' +
      '请用适合中学生的简洁中文回答，200 字以内。';
    Promise.resolve(window.callAI('auto', [{ role: 'user', content: prompt }], {})).then(function (r) {
      if (!S || S.askKey !== key) return;
      var t = (r && (r.text || r.content)) ? String(r.text || r.content) : '';
      S.askBusy = false; S.askReply = t || 'AI 返回为空，请换个问题再试'; S.askErr = ''; render();
    }).catch(function (e) {
      if (!S || S.askKey !== key) return;
      S.askBusy = false;
      S.askErr = 'AI 调用失败：' + ((e && e.message) ? e.message : '未知错误');
      render();
    });
  };
  window.openVoiceTrain.__sayWord = function (w) {
    if (!w) return;
    _vpProgDur = vpEstDur(w, 0.6);
    if (vpTryNative(String(w), 0.6)) return;
    if (vpSafeSpeak(String(w), 'en-US', 0.6)) return;
    vpBrowserUnsupported();
  };
  // 语境示例里「慢速播放某一句」
  window.openVoiceTrain.__playAt = function (n) {
    if (!S) return;
    var lns = SCENES[S.scene].lines;
    n = Number(n);
    if (isNaN(n) || n < 0 || n >= lns.length) return;
    _vpProgDur = vpEstDur(lns[n].en, 0.6);
    if (vpTryNative(lns[n].en, 0.6)) return;
    if (vpSafeSpeak(lns[n].en, 'en-US', 0.6)) return;
    vpBrowserUnsupported();
  };
  // 播放/停止同一按钮：朗读中再点一次即停止，并复位按钮与高亮
  window.openVoiceTrain.__play = function () { if (vpIsPlaying()) { vpStop(); return; } play(); };
  window.openVoiceTrain.__slow = function () {
    if (!S) return;
    if (isChallenge()) { toast('挑战模式下不可慢速，切回精听模式即可'); return; }
    S.slow = true;
    toast('慢速播放');
    var it = SCENES[S.scene].lines[S.i];
    _vpProgDur = vpEstDur(it.en, 0.7);
    if (vpTryNative(it.en, 0.7)) return;          // ① App 原生（系统 TTS 优先，未就绪则原生网络 TTS）
    if (vpSafeSpeak(it.en, 'en-US', 0.7)) return; // ② 浏览器 Web Speech
    vpBrowserUnsupported();                        // ③ 友好提示 + 原文兜底
  };
  window.openVoiceTrain.__stop = function () { vpStop(); };
  // R164-b：口语跟读/听力精听两 tab 一致——逐句列表永不渲染，「查看原文/收起原文」只切换当前句英文显隐。
  window.openVoiceTrain.__en = function () {
    if (!S) return;
    if (isChallenge()) { toast('挑战模式下不显示原文，切回精听模式即可'); return; }
    S.showEn = !S.showEn;
    render();
  };
  window.openVoiceTrain.__zh = function () { if (!S) return; if (isChallenge()) { toast('挑战模式下不显示中文，切回精听模式即可'); return; } S.showZh = !S.showZh; render(); };
  window.openVoiceTrain.__rec = function () {
    if (!S || typeof startEnglishRecognition !== 'function') { toast('当前浏览器/页面不支持语音识别，请用文本跟读'); return; }
    var it = SCENES[S.scene].lines[S.i];
    var btn = document.getElementById('vpRec');
    toast('请读出这句英文…');
    startEnglishRecognition(function () { }, function (finalText) {
      var el = document.getElementById('vpEval'); if (!el) return;
      var ev = (typeof evaluateSpeaking === 'function') ? evaluateSpeaking(finalText, it.en) : { score: 0, tips: ['（无评分模块）'] };
      // N9-18 P1：跟读分并入今日统计（需求 7「跟读平均分」）
      try { trainMark(S.scene, S.i, null, Number(ev && ev.score) || 0); } catch (e0) {}
      el.innerHTML = '<div style="font-weight:700;color:var(--primary);font-size:18px">综合得分 ' + (ev.score || 0) + '</div>' +
        '<div style="color:var(--text-secondary);margin:6px 0">你说了：' + esc(finalText) + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted)">参考答案：' + esc(it.en) + '</div>';
      if (ev.tips && ev.tips.length) el.innerHTML += '<div style="margin-top:6px;font-size:12px;color:#666">' + ev.tips.map(function (t) { return '• ' + t; }).join('<br>') + '</div>';
      // 刷新训练状态（点阵 + 今日统计）
      var sp = document.getElementById('vpBody');
      if (sp) render();
    }, function () { });
  };
  // 启动听力三类题型增量合并（失败静默回退内置 3 场景）
  try { loadListeningExt(); } catch (e) {}
})();
