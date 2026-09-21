/* =====================================================================
   quest.js —— 穿越英语 · 情景穿越闯关（16 关 / 4 大章节）
   ---------------------------------------------------------------------
   玩法：选关 → 情景对话（逐句跟读评分）→ 高频表达 → 通关小测 → 解锁下一关。
   发音：AndroidTTS.netTts（有道/百度）；评分：系统 SpeechRecognizer 文本对比。
   进度：localStorage study_workbench_quest_progress（沿用旧 key，向后兼容）
   用法：openQuest()
   ---------------------------------------------------------------------
   内容量：16 关 ×（6 句对话 + 6 条高频表达 + 1 条易错点 + 1 条文化提示 + 3 道小测）
           = 96 句对话 + 96 条表达 + 32 条提示 + 48 道小测 = 272 条真实内容
   ===================================================================== */
(function () {
  'use strict';
  if (window.__QUEST__) return;
  window.__QUEST__ = 1;

  // ===================== 关卡数据 =====================
  // 字段：id 编号 / chapter 章节 / tag 分类 / title 标题 / brief 一句话副标题
  //       briefEn 英文副标题 / level 难度 / story 场景说明（真实背景知识）
  //       lines 情景对话（en+zh）/ phrases 高频表达（en+zh）
  //       pitfall 易错点 / culture 文化提示 / quiz 通关小测（q+options+a+explain）
  var LEVELS = [
    // ---------- 第一章 · 出行通关 ----------
    {
      id: 'coffee', chapter: '出行通关', tag: '餐饮', level: '入门',
      title: '咖啡店点单',
      brief: '连锁咖啡店的标准点单顺序与常见定制说法',
      briefEn: 'Ordering at a coffee chain: size, drink, temperature, extras',
      story: '场景背景：连锁咖啡店（Starbucks / Costa / Pret）有一套固定点单顺序——先杯型（size），再饮品（drink），再冷热（hot or iced），最后定制（糖浆、奶、extra shot）。店员写完杯子会问 "For here or to go?"。堂食用陶瓷杯，外带用纸杯，价格一样。',
      lines: [
        { en: "Hi there, what can I get started for you?", zh: '你好，今天想喝点什么？' },
        { en: "Could I get a medium oat milk latte, please?", zh: '请给我一杯中杯燕麦拿铁。' },
        { en: "Sure, would you like that hot or iced?", zh: '好的，要热的还是冰的？' },
        { en: "Hot, please. And could you go light on the syrup?", zh: '热的，谢谢。糖浆能少放点吗？' },
        { en: "Of course. Anything to eat with that?", zh: '当然。要配点吃的吗？' },
        { en: "Just a croissant, and that's it. For here, thanks.", zh: '只要一个可颂，就这些。堂食，谢谢。' }
      ],
      phrases: [
        { en: "What can I get for you?", zh: '您想点什么？（店员开场白）' },
        { en: "Could I get a ..., please?", zh: '请给我来一份……（最自然的点单句）' },
        { en: "For here or to go?", zh: '堂食还是外带？（英国常说 eat in or take away）' },
        { en: "go light on the sugar", zh: '少放糖（light on = 少量）' },
        { en: "oat milk / almond milk / skim milk", zh: '燕麦奶／杏仁奶／脱脂奶' },
        { en: "Can I get an extra shot in that?", zh: '能加一份浓缩吗？' }
      ],
      pitfall: '易错点：直接说 "I want a coffee" 语法没错但很生硬，点单用 "Could I get…" 或 "I\'ll have…"。另外 coffee 本身指滴滤咖啡，想喝拿铁必须说 latte。',
      culture: '文化提示：美国的 "regular coffee" 指加了奶和糖的滴滤咖啡；柜台上的 tip jar（小费罐）给不给都行，不给不算失礼。',
      quiz: [
        { q: '店员问 "For here or to go?"，你想在店里喝，该怎么回答？', options: ['For here, please.', 'To go, please.', 'Here you are.'], a: 0, explain: '"For here" 堂食；"To go" 外带。"Here you are" 是把东西递给别人时说的。' },
        { q: '想让店员少放糖浆，最地道的说法是？', options: ['Put less sugar syrup.', 'Go light on the syrup, please.', 'Make it not sweet.'], a: 1, explain: '"go light on + 名词" 表示"少放、少量使用"，是咖啡店高频说法。' },
        { q: '下面哪句是正确的点单句？', options: ['Give me a latte.', 'Could I get a medium latte, please?', 'I want to buy latte.'], a: 1, explain: '"Could I get…, please?" 是标准礼貌点单句；"Give me…" 偏命令，且 latte 是可数名词需加 a。' }
      ]
    },
    {
      id: 'airport', chapter: '出行通关', tag: '交通', level: '入门',
      title: '机场值机与登机',
      brief: '值机、托运、超重、登机口一整套流程用语',
      briefEn: 'Check-in, baggage drop, overweight fees and boarding',
      story: '场景背景：国际航班建议提前 2~3 小时到机场。流程是 check-in（值机）→ 托运行李 → security（安检）→ gate（登机口）。随身行李叫 carry-on，托运的叫 checked baggage。多数航空公司经济舱托运限额 23kg/件，超重要付 excess baggage fee。',
      lines: [
        { en: "Good morning. May I see your passport and booking reference?", zh: '早上好，请出示护照和订票号。' },
        { en: "Here you go. I'd like a window seat if one is still available.", zh: '给你。如果还有的话，我想要靠窗座位。' },
        { en: "Are you checking any bags today?", zh: '今天有行李要托运吗？' },
        { en: "Just one suitcase. This backpack is my carry-on.", zh: '只有一个行李箱。这个背包是随身的。' },
        { en: "Your suitcase is slightly over the limit. It's twenty-four kilos.", zh: '您的行李箱有点超重，24 公斤。' },
        { en: "No problem. Your gate is B12 and boarding starts at ten forty.", zh: '没问题。登机口是 B12，10:40 开始登机。' }
      ],
      phrases: [
        { en: "check in / check-in counter", zh: '办理值机／值机柜台' },
        { en: "carry-on (baggage)", zh: '随身行李' },
        { en: "checked baggage", zh: '托运行李' },
        { en: "over the weight limit / excess baggage", zh: '超重／超重行李（费）' },
        { en: "boarding pass / gate / boarding time", zh: '登机牌／登机口／登机时间' },
        { en: "Is the flight on time?", zh: '航班准点吗？' }
      ],
      pitfall: '易错点：luggage 是不可数名词，不能说 luggages；一件行李要说 "a piece of luggage" 或 "a bag"。另外 "去值机" 是 check in（两个词），名词才写作 check-in。',
      culture: '文化提示：英美口语里说 "My flight was delayed / cancelled"，很少说 "My plane"；登机口（gate）可能在起飞前变更，务必盯显示屏。',
      quiz: [
        { q: '"随身行李" 英文怎么说？', options: ['carry-on baggage', 'hand bag', 'body luggage'], a: 0, explain: 'carry-on (baggage) 是航空业标准说法；handbag 指女式手提包，body luggage 不存在。' },
        { q: '你想说"我要托运一件行李"，正确说法是？', options: ['I want to check one baggage.', 'I have one bag to check in.', 'I will send my luggage.'], a: 1, explain: '"have + 物品 + to check in" 是值机柜台常用表达；baggage 不可数，不接 a/one。' },
        { q: '下面哪个句子有语法错误？', options: ['My flight was delayed.', 'I have three luggages.', 'The gate has changed.'], a: 1, explain: 'luggage 不可数，应说 "three pieces of luggage" 或 "three bags"。' }
      ]
    },
    {
      id: 'customs', chapter: '出行通关', tag: '出入境', level: '进阶',
      title: '海关入境问答',
      brief: '目的、停留时长、住宿、申报——四问四答',
      briefEn: 'Purpose of visit, length of stay, address and declaration',
      story: '场景背景：入境分三步——immigration（查护照签证、问话）→ baggage claim（转盘取行李）→ customs（抽检申报）。官员通常只问四个问题：来访目的、停留多久、住哪里、有没有需要申报的物品。回答要简短、具体、不主动展开。肉类、水果、种子类未申报被查到会罚款。',
      lines: [
        { en: "Next, please. Passport. What's the purpose of your visit?", zh: '下一位。请出示护照。您此行的目的是？' },
        { en: "I'm here on business. I'll be attending a conference.", zh: '我是来出差的，要参加一个会议。' },
        { en: "How long do you plan to stay?", zh: '您打算停留多久？' },
        { en: "About ten days. I'm flying back on the twenty-eighth.", zh: '大约十天，28 号飞回去。' },
        { en: "And where will you be staying?", zh: '您会住在哪里？' },
        { en: "At the Hilton downtown. I have the booking confirmation here.", zh: '市中心的希尔顿，预订单在这。' }
      ],
      phrases: [
        { en: "purpose of your visit", zh: '来访目的' },
        { en: "I'm here on business / on holiday", zh: '我来出差／度假' },
        { en: "How long will you be staying?", zh: '您会待多久？' },
        { en: "Nothing to declare.", zh: '没有需要申报的物品。' },
        { en: "baggage claim / carousel", zh: '行李提取处／行李转盘' },
        { en: "Do you have anything to declare?", zh: '有需要申报的东西吗？' }
      ],
      pitfall: '易错点：别说 "I come to travel"，正确说法是 "I\'m here on holiday" 或 "I\'m here for sightseeing"。另外 stay 是"停留"，不是"居住"，"我住在朋友家"要说 "I\'m staying with a friend"。',
      culture: '文化提示：海关问话是"审问式"的，简短回答最可信；切忌反问或开玩笑。申报（declare）不等于交税，多数旅客申报后直接放行，隐瞒才会被罚。',
      quiz: [
        { q: '官员问 "What\'s the purpose of your visit?"，你是来旅游，最佳回答是？', options: ["I'm here on holiday.", 'I come to travel.', 'My purpose is tourism.'], a: 0, explain: '"I\'m here on holiday" 是固定搭配；"I come to travel" 时态和搭配都不自然。' },
        { q: '"没有需要申报的物品" 怎么说？', options: ["I don't have declare.", 'Nothing to declare.', 'No need report.'], a: 1, explain: '"Nothing to declare." 是海关标准回答，简洁固定。' },
        { q: '被问到停留多久，下面哪句最地道？', options: ['I will stay ten days.', "I'm staying for about ten days.", 'I stay ten days here.'], a: 1, explain: '已安排好的行程用现在进行时 "I\'m staying for…" 最自然。' }
      ]
    },
    {
      id: 'hotel', chapter: '出行通关', tag: '住宿', level: '入门',
      title: '酒店入住与退房',
      brief: '预订确认、押金预授权、延迟退房',
      briefEn: 'Reservation, deposit hold, breakfast and late check-out',
      story: '场景背景：前台叫 front desk（美式）或 reception（英式）。入住通常 15:00 之后，退房（check-out）通常 11:00 之前。登记时要刷信用卡做预授权（incidentals hold），冻结金额退房后几天解冻。房价之外常有 city tax（城市税），需要另外付。',
      lines: [
        { en: "Good evening, welcome. Do you have a reservation?", zh: '晚上好，欢迎。请问有预订吗？' },
        { en: "Yes, it's under the name Li Na, for three nights.", zh: '有，用李娜的名字订的，住三晚。' },
        { en: "May I see your ID and take a card for the deposit?", zh: '请出示证件，并刷一张卡做押金。' },
        { en: "Sure. What time is breakfast, and where is it served?", zh: '好的。早餐几点，在哪里？' },
        { en: "From six thirty to ten, on the second floor.", zh: '六点半到十点，在二楼。' },
        { en: "Great. Could I also get a late check-out tomorrow?", zh: '很好。明天能延迟退房吗？' }
      ],
      phrases: [
        { en: "I have a reservation under ...", zh: '我以……的名字预订了' },
        { en: "check in / check out", zh: '入住／退房' },
        { en: "front desk / reception", zh: '前台' },
        { en: "a card for the deposit / incidentals", zh: '刷预授权押金／杂费' },
        { en: "late check-out", zh: '延迟退房' },
        { en: "Could I get a wake-up call at seven?", zh: '能帮我设七点的叫醒服务吗？' }
      ],
      pitfall: '易错点：预订的名词是 reservation 或 booking，不要说 "I have a reserve"。"延迟退房" 是 late check-out，不是 "delay check-out"。',
      culture: '文化提示：欧美酒店房价常不含城市税，账单上另列；给客房清洁的小费 1~2 美元/晚比较常见，放在枕头上并留张便条。',
      quiz: [
        { q: '想说"我用王磊的名字订了房"，正确说法是？', options: ['I have a reservation under Wang Lei.', 'I booked with the name of Wang Lei.', 'I reserved under name Wang Lei.'], a: 0, explain: '"reservation under + 姓名" 是酒店登记的标准说法。' },
        { q: '"延迟退房" 正确表达是？', options: ['delay check-out', 'late check-out', 'slow check-out'], a: 1, explain: 'late check-out 固定搭配；delay 指"延误"，slow 指"慢"，都不对。' },
        { q: '前台说 "May I take a card for incidentals?"，他在问什么？', options: ['要收房费', '要刷一张卡作杂费押金', '要借你的卡打电话'], a: 1, explain: 'incidentals 指房费之外的杂费（迷你吧、餐饮等），酒店会先冻结一笔预授权。' }
      ]
    },
    {
      id: 'taxi', chapter: '出行通关', tag: '交通', level: '入门',
      title: '打车与网约车',
      brief: '报目的地、选路线、小费与下车点',
      briefEn: 'Telling the driver where to go, routes and tipping',
      story: '场景背景：路边招手叫 hail a cab，手机叫车叫 book a ride（Uber / Lyft / Bolt）。上车后司机常问 "Where are you headed?"，你可以补充 fastest route（最快路线）或避开 toll road（收费公路）。美国打车一般给 10~15% 小费，网约车可在 App 内给。',
      lines: [
        { en: "Where are you headed?", zh: '您去哪儿？' },
        { en: "The Hilton on Fifth Avenue, please. Do you know it?", zh: '第五大道的希尔顿，请问您知道吗？' },
        { en: "Sure. Is the fastest route okay with you?", zh: '知道。走最快的路线可以吗？' },
        { en: "Yes, as long as it's not a toll road.", zh: '可以，只要不是收费公路。' },
        { en: "No worries. Traffic is pretty light today.", zh: '放心，今天路上不太堵。' },
        { en: "Good to hear. You can just drop me off at the corner.", zh: '那就好。在路口把我放下就行。' }
      ],
      phrases: [
        { en: "Where are you headed?", zh: '您去哪儿？（司机常用）' },
        { en: "Drop me off at ..., please.", zh: '请在……让我下车。' },
        { en: "How much do I owe you?", zh: '我该付多少？' },
        { en: "Keep the change.", zh: '不用找了。' },
        { en: "Could you take the fastest route?", zh: '能走最快的路线吗？' },
        { en: "Is there a toll?", zh: '有通行费吗？' }
      ],
      pitfall: '易错点："上车" 是 get in the car（出租车/私家车），大巴地铁才是 get on；"下车" 出租车是 get out of，公交地铁是 get off。混用会显得别扭。',
      culture: '文化提示：伦敦黑色出租车（black cab）凑整即可，不必按百分比；美国网约车不需要额外给现金小费，App 内评分和 tipping 更常见。',
      quiz: [
        { q: '你想让司机在路口放你下车，该怎么说？', options: ['Stop at the corner, please.', 'You can drop me off at the corner.', 'Let me down at the corner.'], a: 1, explain: '"drop sb off + 地点" 是让某人下车的标准说法。' },
        { q: '司机说 "Traffic is light"，意思是？', options: ['路上车很少，不堵', '红绿灯坏了', '他开得很快'], a: 0, explain: 'light traffic = 车流少、不拥堵；heavy traffic 才是堵车。' },
        { q: '"不用找零了" 怎么说？', options: ['Keep the change.', 'Take the money.', 'No money back.'], a: 0, explain: '"Keep the change." 是给小费时的固定说法。' }
      ]
    },

    // ---------- 第二章 · 生活办事 ----------
    {
      id: 'restaurant', chapter: '生活办事', tag: '餐饮', level: '入门',
      title: '餐厅点餐与买单',
      brief: '带位、点菜、忌口、买单与打包',
      briefEn: 'Being seated, ordering, dietary needs and paying',
      story: '场景背景：流程是 host 带位 → server 上水和菜单 → 点 appetizer（前菜）/ main course（主菜）/ dessert（甜点）→ 结账。美国餐厅分量普遍偏大，吃不完可以要 doggy bag 打包。账单叫 check（美式）或 bill（英式），小费 15~20% 是惯例而非可选。',
      lines: [
        { en: "Hi, table for two, please. Could we sit by the window?", zh: '你好，两位。能坐靠窗的位置吗？' },
        { en: "Of course. Your server will be right with you.", zh: '当然，服务员马上就来。' },
        { en: "What would you recommend? I'm in the mood for something light.", zh: '有什么推荐吗？我想吃点清淡的。' },
        { en: "The grilled salmon is very popular tonight.", zh: '今晚烤三文鱼很受欢迎。' },
        { en: "I'll go with that. Could I get the sauce on the side?", zh: '就要这个。酱汁能单独放在旁边吗？' },
        { en: "Absolutely. And would you like to see the dessert menu?", zh: '没问题。要看甜点单吗？' }
      ],
      phrases: [
        { en: "Table for two, please.", zh: '两位，谢谢。' },
        { en: "I'm in the mood for ...", zh: '我想吃……／我现在想吃……' },
        { en: "What do you recommend?", zh: '有什么推荐吗？' },
        { en: "on the side", zh: '（酱汁、配菜）单独另放' },
        { en: "Could we get the check, please?", zh: '请买单。（英式：the bill）' },
        { en: "Could I get this to go?", zh: '这个能打包吗？' }
      ],
      pitfall: '易错点："打包" 说 "to go" 或 "a doggy bag"，不要说 "pack it"（那是装箱）。"买单" 在美国说 check，在英国说 bill，说错不会误会但会露怯。',
      culture: '文化提示：小费是服务员工资的主要部分，15~20% 属于义务；6 人以上聚餐账单常自动加 gratuity（服务费），此时不必再加。',
      quiz: [
        { q: '"我想吃点清淡的"，最地道说法是？', options: ['I want to eat light food.', "I'm in the mood for something light.", 'I feel like light eating.'], a: 1, explain: '"be in the mood for + 名词" 表示此刻想吃什么，是餐厅高频句型。' },
        { q: '你想让酱汁单独放，怎么说？', options: ['Put the sauce outside.', 'Sauce separately, please.', 'Could I get the sauce on the side?'], a: 2, explain: '"on the side" 是餐饮业固定用语，表示配料单独另装。' },
        { q: '在美国餐厅想买单，应该叫服务员？', options: ['Bill, please.', 'Could we get the check, please?', 'Pay money, please.'], a: 1, explain: '美式英语账单是 check；英式才是 bill。' }
      ]
    },
    {
      id: 'shopping', chapter: '生活办事', tag: '消费', level: '入门',
      title: '购物退换与退款',
      brief: '退货、换货、尺码问题、原路退款',
      briefEn: 'Returns, exchanges, sizing and refunds',
      story: '场景背景：退货叫 return，换货叫 exchange（不是 change）。多数商店需要 receipt（小票）和原包装，期限 30 天。退款方式通常是 refund to the original payment method（原路退回），现金支付可能只能退 store credit（购物金）。打折区商品常标 final sale，一律不退不换。',
      lines: [
        { en: "Hi, I'd like to return this shirt, please.", zh: '你好，我想退这件衬衫。' },
        { en: "Sure. Do you have the receipt with you?", zh: '好的，小票带了吗？' },
        { en: "Yes, here it is. I bought it last weekend.", zh: '带了，在这。我上周末买的。' },
        { en: "May I ask what the issue is?", zh: '请问是什么问题？' },
        { en: "It runs a bit small. I'd rather exchange it for a medium.", zh: '有点偏小，我想换成中号。' },
        { en: "No problem. I'll process the exchange right away.", zh: '没问题，我马上办换货。' }
      ],
      phrases: [
        { en: "I'd like to return / exchange this.", zh: '我想退货／换货。' },
        { en: "Do you have the receipt?", zh: '有小票吗？' },
        { en: "It runs small / large.", zh: '（版型）偏小／偏大。' },
        { en: "final sale", zh: '特价商品，不退不换' },
        { en: "refund to the original payment method", zh: '原路退款' },
        { en: "Is this on sale?", zh: '这个在打折吗？' }
      ],
      pitfall: '易错点：形容衣服版型偏小用 "It runs small"，主语是衣服；"It\'s too small for me" 指的是"我穿太小"，两者都能用但 run 更专业。"换货" 是 exchange，说 change 会被理解成"换零钱"。',
      culture: '文化提示：美国多数商店退货期 30 天；final sale / clearance 商品通常不可退。保留吊牌和原包装能大幅提高退货成功率。',
      quiz: [
        { q: '"我想换一个中号"，怎么说最地道？', options: ["I'd like to change it to medium.", "I'd like to exchange it for a medium.", 'I want to turn it into medium.'], a: 1, explain: '"exchange A for B" 是把 A 换成 B；change 容易和"换零钱"混淆。' },
        { q: '标签写 "final sale" 表示？', options: ['最后一天打折', '特价商品不退不换', '只剩最后一件'], a: 1, explain: 'final sale 指清仓特价，售出后不支持退货换货。' },
        { q: '衣服版型偏小，正确的英文表达是？', options: ['It is small running.', 'It runs small.', 'It smalls.'], a: 1, explain: 'run + 形容词 表示"某商品的尺码/版型偏……"，主语是商品。' }
      ]
    },
    {
      id: 'rental', chapter: '生活办事', tag: '居住', level: '进阶',
      title: '租房看房与签约',
      brief: '租金含什么、押金、租期、入住日',
      briefEn: 'Rent, utilities, deposit, lease term and move-in date',
      story: '场景背景：租房关键四项——rent（租金）、utilities（水电网气）、security deposit（押金）、lease term（租期，常见 12 个月）。签约前必须问清 utilities included? 和 move-in date。带家具是 furnished，不带是 unfurnished。房东常要求收入达到月租的 2.5~3 倍，或提供 guarantor（担保人）。',
      lines: [
        { en: "Thanks for showing me around. Is the apartment still available?", zh: '谢谢你带我看房。这套公寓还在吗？' },
        { en: "It is. The lease would be twelve months, starting September first.", zh: '在的。租期 12 个月，9 月 1 日起算。' },
        { en: "Are utilities included in the rent?", zh: '房租含水电网吗？' },
        { en: "Water and trash are. You'd cover electricity and internet.", zh: '水和垃圾费含，电和网需要你自己付。' },
        { en: "Got it. And how much is the security deposit?", zh: '明白了。押金多少？' },
        { en: "One month's rent, refundable when you move out.", zh: '一个月房租，搬走时可退。' }
      ],
      phrases: [
        { en: "Is it still available?", zh: '还在出租吗？' },
        { en: "utilities included", zh: '含水电网（杂费）' },
        { en: "security deposit", zh: '押金' },
        { en: "sign the lease", zh: '签租约' },
        { en: "furnished / unfurnished", zh: '带家具／不带家具' },
        { en: "move-in date", zh: '入住日期' }
      ],
      pitfall: '易错点：租金就是 rent，不说 rental fee；押金是 security deposit，不是 guarantee money 或 "押金钱" 的直译。另外 "租房子" 是 rent an apartment，"出租" 也是 rent（rent out）。',
      culture: '文化提示：英美房租按月预付，通常第一个月房租 + 押金一起付；搬出时要做 move-out inspection，房屋损坏会从押金里扣。',
      quiz: [
        { q: '"押金" 的正确英文是？', options: ['safety money', 'security deposit', 'guarantee fee'], a: 1, explain: 'security deposit 是标准法律用语，指可退的租房押金。' },
        { q: '你想问"房租含水电网吗？"，正确说法是？', options: ['Are utilities included in the rent?', 'Does rent have water and electric?', 'Is rent containing utilities?'], a: 0, explain: 'utilities 泛指水电网气，"be included in the rent" 表示已含在房租内。' },
        { q: 'lease 这个词的意思是？', options: ['押金', '租约/租期', '中介费'], a: 1, explain: 'lease 是租赁合同，也指租期；"sign the lease" 即签租约。' }
      ]
    },
    {
      id: 'bank', chapter: '生活办事', tag: '金融', level: '进阶',
      title: '银行开户与转账',
      brief: '支票账户、月费豁免、借记卡、电汇',
      briefEn: 'Checking vs savings, fees, debit card and transfers',
      story: '场景背景：日常消费账户叫 checking account（美国）或 current account（英国），储蓄账户是 savings account。开户需要 ID 和 proof of address（地址证明）。常见费用：monthly maintenance fee（月管理费，满足 minimum balance 可豁免）、overdraft fee（透支费）。跨行大额转账叫 wire transfer，需要 routing number 和 account number。',
      lines: [
        { en: "Good afternoon. I'd like to open a checking account.", zh: '下午好，我想开一个支票账户。' },
        { en: "Happy to help. Do you have your ID and proof of address?", zh: '很乐意为您办理。带了身份证和地址证明吗？' },
        { en: "Yes. Is there a monthly maintenance fee?", zh: '带了。有月管理费吗？' },
        { en: "There is, but it's waived if you keep a minimum balance.", zh: '有的，但只要保持最低余额就能免除。' },
        { en: "I see. How long until the debit card arrives?", zh: '明白了。借记卡多久能到？' },
        { en: "About five business days. We'll mail it to your address.", zh: '大约五个工作日，会寄到您的地址。' }
      ],
      phrases: [
        { en: "open an account", zh: '开户' },
        { en: "checking / savings account", zh: '支票（日常）账户／储蓄账户' },
        { en: "proof of address", zh: '地址证明' },
        { en: "monthly maintenance fee", zh: '月管理费' },
        { en: "minimum balance", zh: '最低余额' },
        { en: "wire transfer / bank transfer", zh: '电汇／银行转账' }
      ],
      pitfall: '易错点：银行"账户"是 account 不是 card；"存钱" 是 deposit，"取钱" 是 withdraw（过去式 withdrew），"draw money" 是中式英语。',
      culture: '文化提示：美国的 checking account 是日常收支账户，因为可以 write a check（开支票）而得名；信用评分（credit score）与银行账户长期绑定，透支会留下记录。',
      quiz: [
        { q: '美国的"日常消费账户"叫什么？', options: ['current account', 'checking account', 'daily account'], a: 1, explain: '美国称 checking account，英国称 current account。' },
        { q: '"我想取 200 美元"，正确说法是？', options: ["I'd like to withdraw two hundred dollars.", 'I want to draw 200 dollars.', 'Please take out me 200 dollars.'], a: 0, explain: '银行取款动词是 withdraw；draw money / take out me 都不正确。' },
        { q: '"这笔月费可以免除" 里 "免除" 用哪个词？', options: ['waived', 'canceled', 'deleted'], a: 0, explain: 'waive a fee 指"免除费用"，是银行账单标准用语。' }
      ]
    },
    {
      id: 'hospital', chapter: '生活办事', tag: '医疗', level: '进阶',
      title: '看病就医与取药',
      brief: '描述症状、过敏史、处方与转诊',
      briefEn: 'Describing symptoms, allergies, prescriptions and referrals',
      story: '场景背景：小病去 clinic（诊所）看 primary care physician（家庭医生），急症才去 ER（急诊室），急诊费用极高。看诊要描述 symptoms（症状）、持续时间和 allergies（过敏史）。拿药去 pharmacy（药房），处方药必须凭 prescription。保险相关高频词：copay（自付额）、deductible（免赔额）、in-network（网络内）。',
      lines: [
        { en: "Good morning. What seems to be the problem?", zh: '早上好，哪里不舒服？' },
        { en: "I've had a sore throat and a slight fever since Monday.", zh: '我从周一起就嗓子疼，还有点低烧。' },
        { en: "Any other symptoms? A cough, or trouble breathing?", zh: '还有其他症状吗？咳嗽或者呼吸困难？' },
        { en: "A bit of a cough, but no trouble breathing.", zh: '有点咳嗽，但呼吸没有问题。' },
        { en: "Do you have any allergies to medication?", zh: '有药物过敏吗？' },
        { en: "No, none that I know of.", zh: '没有，据我所知没有。' }
      ],
      phrases: [
        { en: "What seems to be the problem?", zh: '哪里不舒服？（医生开场白）' },
        { en: "I've had a ... since ...", zh: '我从……起就一直……' },
        { en: "symptoms / side effects", zh: '症状／副作用' },
        { en: "I'm allergic to ...", zh: '我对……过敏。' },
        { en: "fill a prescription", zh: '凭处方配药' },
        { en: "Do I need a referral?", zh: '我需要转诊单吗？' }
      ],
      pitfall: '易错点："我疼" 不能说 "I\'m painful"（那表示"我令别人痛苦"），要说 "It hurts" 或 "I have a pain in my + 部位"。"发烧" 是 have a fever，不是 have a hot。',
      culture: '文化提示：美国看病先预约家庭医生（PCP），直接去 ER 可能花费上千美元；看专科医生通常需要 PCP 开 referral（转诊单）。',
      quiz: [
        { q: '"我头疼" 的正确英文是？', options: ["I'm painful in my head.", 'I have a headache.', 'My head is painful me.'], a: 1, explain: '疼痛用 "have a + 部位 + ache"（headache / stomachache），或 "My head hurts"。' },
        { q: '医生说 "fill a prescription"，意思是？', options: ['开处方', '凭处方配药', '重新检查'], a: 1, explain: 'fill a prescription 指拿着处方去药房取药。' },
        { q: '"我从周一就开始咳嗽了" 怎么说？', options: ["I've had a cough since Monday.", 'I cough from Monday.', 'I am coughing since Monday.'], a: 0, explain: '从过去持续到现在用现在完成时 "I\'ve had…since…"。' }
      ]
    },
    {
      id: 'parcel', chapter: '生活办事', tag: '消费', level: '进阶',
      title: '快递查询与网购售后',
      brief: '物流状态、异常件、退款与补发',
      briefEn: 'Tracking a parcel, delivery issues, refunds and replacements',
      story: '场景背景：网购流程是 place an order → shipping → delivery，全程靠 tracking number（物流单号）追踪。常见状态：out for delivery（派送中）、delayed（延误）、lost in transit（运输中丢失）、delivered（已签收）。出问题先联系 seller 或 marketplace 客服，要求 refund（退款）或 replacement（补发）。',
      lines: [
        { en: "Hi, I'm calling about my order. It hasn't arrived yet.", zh: '你好，我想问一下我的订单，还没收到。' },
        { en: "Could I have your order number, please?", zh: '请提供一下订单号。' },
        { en: "It's 4085-2219. The tracking has said out for delivery since Tuesday.", zh: '是 4085-2219。物流从周二起就一直显示派送中。' },
        { en: "Let me check. It looks like it was misrouted.", zh: '我查一下，看起来是分拣走错了。' },
        { en: "So will it still arrive this week?", zh: '那这周还能送到吗？' },
        { en: "Friday at the latest. I'll send you a new tracking link.", zh: '最迟周五。我会给您发一个新的物流链接。' }
      ],
      phrases: [
        { en: "place an order", zh: '下单' },
        { en: "tracking number", zh: '物流单号' },
        { en: "out for delivery", zh: '正在派送中' },
        { en: "lost in transit", zh: '运输途中丢失' },
        { en: "request a refund / a replacement", zh: '申请退款／补发' },
        { en: "It arrived damaged.", zh: '到货时已经破损。' }
      ],
      pitfall: '易错点："快递" 是美国英语的 package / parcel，"寄快递" 是 ship 或 mail a package，说 "send a fast" 完全不通。"到货" 说 arrive，不说 "come to my home"。',
      culture: '文化提示：美国电商的 free shipping 常有满额门槛；退货通常可以在线打印 prepaid return label（预付退货标签），贴好直接投寄。',
      quiz: [
        { q: '物流显示 "out for delivery"，表示包裹处于什么状态？', options: ['已退回仓库', '正在派送途中', '尚未发货'], a: 1, explain: 'out for delivery 指包裹已装上派送车，当天会送达。' },
        { q: '"我想申请退款" 怎么说？', options: ["I'd like to request a refund.", 'I want to return my money.', 'Please give back money.'], a: 0, explain: '"request a refund" 是客服场景标准说法。' },
        { q: '"我下单了但还没收到" 正确表达是？', options: ['I placed an order but it has not arrived yet.', 'I put an order but no come.', 'I bought order, not received.'], a: 0, explain: 'place an order 是固定搭配；"收到货" 用 arrive。' }
      ]
    },

    // ---------- 第三章 · 校园职场 ----------
    {
      id: 'campus', chapter: '校园职场', tag: '校园', level: '进阶',
      title: '校园选课与答疑',
      brief: '加课等待名单、学分、答疑时间',
      briefEn: 'Waitlists, credits, office hours and dropping a course',
      story: '场景背景：选课是 register for / enroll in a course，退课是 drop，加课是 add。课程满员会进 waitlist（等待名单）。上课叫 attend a class（不是 have class）。教授每周有 office hours（答疑时间），一般不用预约，直接去办公室排队问。课程大纲叫 syllabus，学分是 credits，成绩单是 transcript。',
      lines: [
        { en: "Hi Professor Chen, do you have a minute?", zh: '陈教授您好，能打扰一下吗？' },
        { en: "Of course. What can I do for you?", zh: '当然，有什么事？' },
        { en: "I'm on the waitlist for your psychology course. Is there any chance of getting in?", zh: '我在您心理学课的等待名单上，还有机会加进去吗？' },
        { en: "A few spots usually open up during the first week.", zh: '第一周通常会空出几个名额。' },
        { en: "Should I keep attending in the meantime?", zh: '那我这期间要继续来上课吗？' },
        { en: "Yes, please do. And check the portal again on Friday.", zh: '要的，请继续来。周五再看一下系统。' }
      ],
      phrases: [
        { en: "register for / enroll in a course", zh: '选课／注册课程' },
        { en: "waitlist", zh: '候选（等待）名单' },
        { en: "office hours", zh: '教授答疑时间' },
        { en: "drop / add a course", zh: '退课／加课' },
        { en: "credits", zh: '学分' },
        { en: "syllabus", zh: '课程大纲' }
      ],
      pitfall: '易错点："上课" 是 attend a class / go to class，说 "have class" 只在表示"我今天有课"时勉强可用；"选课" 不能直译成 choose course，要用 register for 或 enroll in。',
      culture: '文化提示：美国大学开学前 1~2 周是 shopping period，可以试听多门课再最终确定；office hours 是拿推荐信和加深印象的关键场合。',
      quiz: [
        { q: '"我在等待名单上"，怎么说？', options: ["I'm on the waitlist.", 'I am in the waiting people.', 'I joined the wait people.'], a: 0, explain: '"be on the waitlist" 是固定搭配。' },
        { q: '"退掉一门课" 的正确表达是？', options: ['delete a course', 'drop a course', 'remove a course'], a: 1, explain: '退课固定用 drop a course，加课用 add a course。' },
        { q: '教授说 "My office hours are Tuesdays at two"，意思是？', options: ['他周二两点在办公室答疑', '他周二两点要开会', '他周二两点才上班'], a: 0, explain: 'office hours 指教授开放给学生答疑的固定时段，学生可直接前往。' }
      ]
    },
    {
      id: 'interview', chapter: '校园职场', tag: '求职', level: '高阶',
      brief: '自我介绍、优势、五年规划与提问',
      briefEn: 'Tell me about yourself, strengths, and closing questions',
      title: '求职面试现场',
      story: '场景背景：英语面试高频四题——Tell me about yourself、Why do you want this role、greatest strength / weakness、Where do you see yourself in five years。答题用 STAR 结构（Situation 情境 - Task 任务 - Action 行动 - Result 结果），避免空泛形容词。结尾一定要问问题，薪资留到终面或 HR 阶段谈。',
      lines: [
        { en: "Thanks for coming in. Tell me a little about yourself.", zh: '感谢前来。简单介绍一下你自己吧。' },
        { en: "Sure. I'm a marketing graduate, and I've spent two years running social media campaigns.", zh: '好的。我是市场营销专业毕业，有两年运营社交媒体活动的经验。' },
        { en: "What would you say is your greatest strength?", zh: '你认为自己最大的优势是什么？' },
        { en: "I'm good at turning data into decisions, and I pick things up quickly.", zh: '我擅长把数据转化成决策，而且学东西很快。' },
        { en: "Where do you see yourself in five years?", zh: '你对自己五年后的规划是什么？' },
        { en: "Ideally leading a small team, and still hands-on with strategy.", zh: '希望能带一个小团队，同时继续亲自参与策略。' }
      ],
      phrases: [
        { en: "Tell me about yourself.", zh: '介绍一下你自己。' },
        { en: "I have two years of experience in ...", zh: '我在……方面有两年的经验。' },
        { en: "strengths and weaknesses", zh: '优势与不足' },
        { en: "I'm a quick learner.", zh: '我学东西很快。' },
        { en: "Why should we hire you?", zh: '我们为什么要录用你？' },
        { en: "Do you have any questions for us?", zh: '你有什么想问我们的吗？' }
      ],
      pitfall: '易错点：别说 "My English is poor"（自降分），改说 "I\'m still working on my English"。说优势不要只给形容词，必须配一个具体事例，否则会被认为空泛。',
      culture: '文化提示：面试后 24 小时内发一封 thank-you email 是欧美惯例；问薪资用 "What\'s the salary range for this role?"，不要直接问 "How much will you pay me?"。',
      quiz: [
        { q: '被问 "Tell me about yourself"，最佳策略是？', options: ['从小学开始讲人生经历', '用现在—过去—未来结构，30~60 秒讲完', '反问面试官想听什么'], a: 1, explain: '标准做法是"现在做什么 → 过去相关经历 → 为什么来这里"，控制在 1 分钟内。' },
        { q: '想表达"我学东西很快"，地道说法是？', options: ['I learn very fast.', "I'm a quick learner.", 'My study is quick.'], a: 1, explain: '"I\'m a quick learner." 是面试常用固定表达。' },
        { q: '想问薪资范围，最得体的说法是？', options: ['How much will you pay me?', "What's the salary range for this role?", 'Tell me the money.'], a: 1, explain: '"salary range for this role" 专业且得体，直接问 how much 会显得唐突。' }
      ]
    },
    {
      id: 'meeting', chapter: '校园职场', tag: '职场', level: '高阶',
      title: '职场会议发言',
      brief: '议程、打断、待办与远程会议用语',
      briefEn: 'Agenda, jumping in, action items and remote meeting phrases',
      story: '场景背景：会议围绕 agenda（议程）推进，结束时留 action items（待办）并指定 owner。高频动词短语：run through（过一遍）、circle back（回头再议）、follow up（跟进）、take it offline（会后单独聊）。远程会议常见问题：You\'re on mute（你静音了）、Could you share your screen（能共享屏幕吗）。',
      lines: [
        { en: "Shall we get started? I think everyone's here.", zh: '我们开始吧，人好像都到齐了。' },
        { en: "Before we dive in, let me run through the agenda.", zh: '开始之前，我先过一遍议程。' },
        { en: "Just a heads-up, I have a hard stop at three.", zh: '提前说明一下，我三点必须结束。' },
        { en: "Noted. Let's move on to the budget update.", zh: '记下了。我们进入预算更新环节。' },
        { en: "Could you walk us through those numbers?", zh: '能带我们看一下这些数字吗？' },
        { en: "Sure. I'll keep it short and share the deck afterwards.", zh: '好的，我长话短说，稍后把材料发给大家。' }
      ],
      phrases: [
        { en: "get started / kick off", zh: '开始' },
        { en: "run through the agenda", zh: '过一遍议程' },
        { en: "circle back to that", zh: '这个回头再议' },
        { en: "action items", zh: '待办事项' },
        { en: "I'll follow up by email.", zh: '我会用邮件跟进。' },
        { en: "Let's take it offline.", zh: '这个我们会后单独讨论。' }
      ],
      pitfall: '易错点："开会" 是 have / hold a meeting，不是 open a meeting（中式英语）。"hard stop" 指必须结束的时间点，不是"很难停下来"。',
      culture: '文化提示：英美会议强调 timebox（限时），打断别人说 "Sorry to jump in"；迟到说 "Sorry I\'m late, I got held up"（被事耽搁了）。',
      quiz: [
        { q: '"Let\'s circle back to that" 的意思是？', options: ['我们围成一圈', '这个问题回头再讨论', '我们把桌子转一下'], a: 1, explain: 'circle back 是职场高频短语，表示稍后回到某个话题。' },
        { q: '"action items" 指什么？', options: ['会议中的表演环节', '会议产生的待办事项', '需要采购的物品'], a: 1, explain: 'action items 指会议结束时分配下去的、需要跟进的具体任务。' },
        { q: '"开会" 的正确动词搭配是？', options: ['open a meeting', 'have / hold a meeting', 'make a meeting'], a: 1, explain: 'have 或 hold a meeting；open a meeting 是中式英语。' }
      ]
    },

    // ---------- 第四章 · 人际交往 ----------
    {
      id: 'smalltalk', chapter: '人际交往', tag: '社交', level: '入门',
      title: '社交破冰与寒暄',
      brief: '自我介绍、安全话题与得体告别',
      briefEn: 'Breaking the ice, safe topics and graceful exits',
      story: '场景背景：英语社交靠 small talk（寒暄）破冰。安全话题：天气、旅行、美食、宠物、爱好、泛泛的工作。慎聊：年龄、收入、婚姻、政治、宗教。提问用开放式问题（How do you know…? / What do you do?），接话用 "Really?"、"Me too"、"Small world!" 给对方继续说的空间。',
      lines: [
        { en: "Hey, I don't think we've met. I'm Daniel.", zh: '你好，我们好像还没见过。我是丹尼尔。' },
        { en: "Nice to meet you, Daniel. I'm Amy.", zh: '很高兴认识你，丹尼尔。我是艾米。' },
        { en: "So how do you know the host?", zh: '你是怎么认识主人的？' },
        { en: "We used to work together, years ago.", zh: '我们很多年前一起工作过。' },
        { en: "That's cool. Have you tried the dumplings? They're amazing.", zh: '真巧。你尝饺子了吗？特别好吃。' },
        { en: "Not yet, but you've convinced me. Let's grab some.", zh: '还没，被你说动了。我们去拿点。' }
      ],
      phrases: [
        { en: "I don't think we've met.", zh: '我们好像还没见过。' },
        { en: "How do you know ...?", zh: '你是怎么认识……的？' },
        { en: "Small world!", zh: '世界真小／真巧！' },
        { en: "What do you do?", zh: '你是做什么的？' },
        { en: "Have you tried the ...?", zh: '你尝过……吗？' },
        { en: "It was nice talking to you.", zh: '很高兴和你聊天。（告别语）' }
      ],
      pitfall: '易错点：问职业用 "What do you do?"，说 "What\'s your job?" 略显生硬。告别别说 "Goodbye"（太正式、像永别），用 "See you around" 或 "Take care"。',
      culture: '文化提示：英美人把 "How are you?" 当招呼语，回答 "Good, thanks — you?" 即可，不必真的讲述近况；被夸奖时说 "Thanks" 而不是反复否认。',
      quiz: [
        { q: '聚会结束想得体告别，最好说？', options: ['Goodbye forever.', "It was nice talking to you. See you around.", 'I must disappear now.'], a: 1, explain: '"It was nice talking to you" 加 "See you around" 是标准社交收尾。' },
        { q: '"What do you do?" 是在问什么？', options: ['你正在做什么', '你的职业是什么', '你有什么爱好'], a: 1, explain: '在社交场合，"What do you do?" 是问对方职业的标准问法。' },
        { q: '发现两人有共同熟人时，最自然的感叹是？', options: ['Small world!', 'Little earth!', 'So coincidence!'], a: 0, explain: '"Small world!" 是英语中表达"真巧、世界真小"的固定感叹。' }
      ]
    },
    {
      id: 'email', chapter: '人际交往', tag: '写作', level: '高阶',
      title: '英文邮件写作',
      brief: '主题行、请求语气、跟进与附件',
      briefEn: 'Subject lines, polite requests, follow-ups and attachments',
      story: '场景背景：商务邮件结构固定——subject（一句话说清目的）→ greeting → 正文（目的 + 细节 + 期望动作 + 时间）→ closing → signature。请求用 "Could you…" 或 "I was wondering if…"；催办用 "Just following up on…"。正文控制在 5 句话以内，超过就开会或打电话。',
      lines: [
        { en: "Subject: Quick question about tomorrow's schedule", zh: '主题：关于明天日程的一个简短问题' },
        { en: "Hi Sarah, hope you're having a good week.", zh: '你好萨拉，希望你这一周顺利。' },
        { en: "I'm writing to confirm the meeting time for tomorrow.", zh: '我写这封邮件是想确认明天的会议时间。' },
        { en: "Could you let me know if ten a.m. still works?", zh: '请问上午十点是否仍然方便？' },
        { en: "If not, I'm happy to move it to the afternoon.", zh: '如果不方便，我可以改到下午。' },
        { en: "Thanks in advance, and let me know either way.", zh: '提前致谢，无论如何都请告知我。' }
      ],
      phrases: [
        { en: "I'm writing to ...", zh: '我写邮件是为了……' },
        { en: "Could you ...?", zh: '能否请您……？' },
        { en: "Thanks in advance.", zh: '提前致谢。' },
        { en: "Just following up on ...", zh: '跟进一下……' },
        { en: "Please find the file attached.", zh: '附件请查收。' },
        { en: "Let me know if you have any questions.", zh: '如有疑问请告知。' }
      ],
      pitfall: '易错点：邮件结尾的 "please revert" 是中式英语，正确说法是 "please reply" 或 "let me know"。不知道收件人姓名时用 "Hi there" 或 "Dear Hiring Team"，不要用老派的 "Dear Sir or Madam"。',
      culture: '文化提示：subject 必须具体（"Question about Friday\'s report"），空主题或只写 "Hello" 的邮件最容易被忽略；美国职场邮件回复时限一般是一个工作日。',
      quiz: [
        { q: '"附件请查收" 的标准写法是？', options: ['Please find the file attached.', 'Please check the add-file.', 'The attachment please receive.'], a: 0, explain: '"Please find ... attached." 是商务邮件固定句式。' },
        { q: '想催一下上封邮件，开头最合适的是？', options: ['Why are you not replying?', 'Just following up on my email below.', 'I am waiting for you.'], a: 1, explain: '"Just following up on…" 是礼貌且常用的催办开场。' },
        { q: '下面哪个邮件结尾是不地道的？', options: ['Thanks in advance.', 'Please revert to me soon.', 'Let me know if you have any questions.'], a: 1, explain: '"please revert" 是典型中式英语，应改成 "please reply" 或 "let me know"。' }
      ]
    }
  ];

  var CHAPTERS = ['出行通关', '生活办事', '校园职场', '人际交往'];
  var PROGRESS_KEY = 'study_workbench_quest_progress';
  var CLEAR_QUIZ_MIN = 2;   // 通关小测至少答对题数
  var PASS_SCORE = 60;      // 跟读及格分

  var S = null;             // 当前关卡会话：{ idx, tab, lineIdx, lastScore, quizAns }

  // ===================== 工具 =====================
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(m) { if (typeof showToast === 'function') showToast(m); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function getProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { }
  }
  // 单关记录：{ learned:[句索引], quizBest:正确数, quizDone:bool, avg:均分, cleared:bool, time }
  function getRec(id) {
    var p = getProgress();
    var r = p[id];
    if (!r || typeof r !== 'object') return { learned: [], quizBest: 0, quizDone: false, avg: 0, cleared: false };
    // 兼容旧结构 { avg, time }
    return {
      learned: r.learned || [],
      quizBest: r.quizBest || 0,
      quizDone: !!r.quizDone,
      avg: r.avg || 0,
      cleared: !!r.cleared || !!r.avg,
      time: r.time || 0
    };
  }
  function putRec(id, rec) {
    var p = getProgress();
    p[id] = rec;
    saveProgress(p);
  }
  function getLast() {
    var p = getProgress();
    return p.__last && typeof p.__last === 'object' ? p.__last : null;
  }
  function putLast(o) {
    var p = getProgress();
    p.__last = o;
    saveProgress(p);
  }

  function isCleared(i) { return getRec(LEVELS[i].id).cleared; }
  function isUnlocked(i) {
    if (i === 0) return true;
    return isCleared(i - 1);
  }
  function idxOf(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i;
    return -1;
  }

  function stats() {
    var p = getProgress(), done = 0, lines = 0, sum = 0, cnt = 0, phrases = 0, quiz = 0;
    LEVELS.forEach(function (lv) {
      var r = getRec(lv.id);
      if (r.cleared) {
        done++;
        lines += lv.lines.length;
        phrases += lv.phrases.length;
        quiz += lv.quiz.length;
        if (r.avg) { sum += r.avg; cnt++; }
      } else {
        lines += r.learned.length;
      }
    });
    return {
      total: LEVELS.length, done: done,
      pct: Math.round(done / LEVELS.length * 100),
      lines: lines, phrases: phrases, quiz: quiz,
      avg: cnt ? Math.round(sum / cnt) : 0
    };
  }

  // ===== 评分：语音识别文本与标准文本的相似度 =====
  function scoreSpeaking(recognized, standard) {
    if (!recognized) return 0;
    var r = recognized.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    var s = standard.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (!r || !s) return 0;
    var sWords = s.split(/\s+/).filter(Boolean);
    var rWords = r.split(/\s+/).filter(Boolean);
    var hit = 0;
    rWords.forEach(function (w) { if (sWords.indexOf(w) >= 0) hit++; });
    return Math.round((hit / sWords.length) * 100);
  }

  function speak(text) {
    if (typeof netSpeak === 'function') { try { netSpeak(text, 'en-US', 0.9, null); return true; } catch (e) { } }
    if (typeof speakUtterance === 'function') { try { speakUtterance(text, 'en-US'); return true; } catch (e) { } }
    return false;
  }

  // ===================== CSS =====================
  function css() {
    if (document.getElementById('questStyle')) return;
    var c = '.qst-mask{position:fixed;inset:0;background:#0a0a1a;z-index:2500;display:flex;flex-direction:column;color:#e0e0ff;padding:20px 16px 10px;overflow:hidden;font-family:\'Segoe UI\',\'PingFang SC\',sans-serif}'
      + '.qst-grid{position:absolute;inset:0;opacity:.08;background-image:linear-gradient(rgba(0,255,255,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,255,.3) 1px,transparent 1px);background-size:30px 30px}'
      + '.qst-top{display:flex;align-items:center;gap:8px;position:relative;z-index:1}.qst-top b{flex:1;font-size:16px;color:#0ff;text-shadow:0 0 10px rgba(0,255,255,.5)}'
      + '.qst-x{background:rgba(255,255,255,.1);border:1px solid rgba(0,255,255,.3);color:#0ff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:14px}'
      + '.qst-body{flex:1;overflow-y:auto;position:relative;z-index:1;padding:10px 0}'
      // 统计 / 继续
      + '.qst-stats{display:flex;gap:10px;margin-bottom:14px}.qst-stat{flex:1;background:rgba(0,255,255,.08);border:1px solid rgba(0,255,255,.2);border-radius:10px;padding:10px 4px;text-align:center}'
      + '.qst-stat .num{font-size:20px;font-weight:800;color:#0ff}.qst-stat .lbl{font-size:11px;color:#8899aa;margin-top:2px}'
      + '.qst-resume{display:flex;align-items:center;gap:10px;background:rgba(0,255,136,.08);border:1px solid rgba(0,255,136,.35);border-radius:12px;padding:12px 14px;margin-bottom:14px;cursor:pointer}'
      + '.qst-resume .t{font-size:14px;font-weight:700;color:#0f8}.qst-resume .d{font-size:12px;color:#8899aa;margin-top:2px}.qst-resume .go{margin-left:auto;color:#0f8;font-size:13px;font-weight:700}'
      // 章节 / 关卡卡片
      + '.qst-chapter{font-size:12px;color:#0ff;letter-spacing:1px;margin:16px 0 8px;padding-left:8px;border-left:3px solid #0ff}'
      + '.qst-level{display:flex;align-items:flex-start;gap:12px;background:rgba(255,255,255,.05);border:1px solid rgba(0,255,255,.15);border-radius:14px;padding:12px;margin-bottom:10px;cursor:pointer;transition:all .2s}'
      + '.qst-level:active{transform:scale(.99)}.qst-level.locked{opacity:.45;cursor:not-allowed}.qst-level.done{border-color:rgba(0,255,136,.5);background:rgba(0,255,136,.05)}'
      + '.qst-licon{width:46px;height:46px;border-radius:12px;background:rgba(0,255,255,.12);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:#0ff;flex-shrink:0}'
      + '.qst-level.done .qst-licon{background:rgba(0,255,136,.15);color:#0f8}'
      + '.qst-linfo{flex:1;min-width:0}'
      + '.qst-ltitle{font-size:15px;font-weight:700;color:#e0e0ff}'
      + '.qst-lsub{font-size:12px;color:#9aa;margin-top:3px;line-height:1.5}'
      + '.qst-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}'
      + '.qst-chip{font-size:10px;padding:2px 7px;border-radius:20px;background:rgba(0,255,255,.1);color:#7dd;border:1px solid rgba(0,255,255,.2)}'
      + '.qst-chip.g{background:rgba(0,255,136,.12);color:#0f8;border-color:rgba(0,255,136,.3)}'
      + '.qst-bar{height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:8px;overflow:hidden}.qst-bar i{display:block;height:100%;background:linear-gradient(90deg,#0ff,#0f8)}'
      + '.qst-lbadge{font-size:11px;padding:4px 8px;border-radius:6px;flex-shrink:0;white-space:nowrap;margin-top:2px}'
      + '.qst-badge-done{background:rgba(0,255,136,.15);color:#0f8}.qst-badge-lock{background:rgba(255,255,255,.08);color:#778}'
      + '.qst-badge-doing{background:rgba(0,255,255,.15);color:#0ff}.qst-badge-new{background:rgba(255,255,255,.08);color:#9ab}'
      // 关卡内：tab
      + '.qst-tabs{display:flex;gap:6px;margin-bottom:12px;background:rgba(255,255,255,.05);border:1px solid rgba(0,255,255,.15);border-radius:10px;padding:4px}'
      + '.qst-tab{flex:1;text-align:center;padding:8px 0;border-radius:8px;font-size:12px;color:#9ab;cursor:pointer}'
      + '.qst-tab.on{background:#0ff;color:#001;font-weight:700}'
      + '.qst-hd{display:flex;align-items:center;gap:8px;margin-bottom:10px}.qst-hd .ti{font-size:15px;font-weight:800;color:#e0e0ff;flex:1}'
      + '.qst-back{background:rgba(255,255,255,.08);border:1px solid rgba(0,255,255,.25);color:#0ff;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer}'
      + '.qst-progress{height:6px;background:rgba(255,255,255,.1);border-radius:3px;margin-bottom:8px;overflow:hidden}.qst-progress .bar{height:100%;background:linear-gradient(90deg,#0ff,#0f8);border-radius:3px;transition:width .3s}'
      // 关卡内：内容
      + '.qst-story{background:rgba(0,255,255,.06);border-left:3px solid #0ff;border-radius:0 10px 10px 0;padding:12px 14px;margin-bottom:12px;font-size:12.5px;line-height:1.75;color:#bcd}'
      + '.qst-line-card{background:rgba(255,255,255,.06);border:1px solid rgba(0,255,255,.2);border-radius:16px;padding:20px;margin-bottom:12px;text-align:center}'
      + '.qst-en{font-size:20px;font-weight:700;color:#fff;line-height:1.5}'
      + '.qst-zh{font-size:13px;color:#8899aa;margin-top:10px}'
      + '.qst-score{font-size:34px;font-weight:800;margin:8px 0}.qst-score.good{color:#0f8}.qst-score.ok{color:#ff0}.qst-score.bad{color:#f44}'
      + '.qst-controls{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px}'
      + '.qst-btn{padding:10px 16px;border-radius:10px;border:1px solid rgba(0,255,255,.4);background:rgba(0,255,255,.1);color:#0ff;font-size:13px;cursor:pointer}'
      + '.qst-btn.solid{background:#0ff;color:#001;font-weight:700}.qst-btn.green{background:#0f8;color:#001;border-color:#0f8;font-weight:700}'
      + '.qst-btn.dim{opacity:.55}'
      + '.qst-rec{font-size:12px;color:#8899aa;margin-top:8px;line-height:1.6}'
      // 表达 / 笔记 / 小测
      + '.qst-sec{font-size:12px;color:#0ff;margin:14px 0 8px;letter-spacing:.5px}'
      + '.qst-ph{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.05);border:1px solid rgba(0,255,255,.12);border-radius:10px;padding:10px 12px;margin-bottom:8px}'
      + '.qst-ph .e{flex:1;min-width:0}.qst-ph .en{font-size:14px;color:#fff;font-weight:600;line-height:1.4}'
      + '.qst-ph .zh{font-size:12px;color:#8899aa;margin-top:3px}'
      + '.qst-ph .sp{background:rgba(0,255,255,.1);border:1px solid rgba(0,255,255,.25);color:#0ff;border-radius:8px;width:30px;height:30px;flex-shrink:0;cursor:pointer;font-size:11px}'
      + '.qst-note{background:rgba(255,255,255,.05);border-radius:10px;padding:12px;margin-bottom:8px;font-size:12.5px;line-height:1.8;color:#bcd;border-left:3px solid #fa3}'
      + '.qst-note.cul{border-left-color:#a6f}'
      + '.qst-note b{display:block;color:#ffb;margin-bottom:3px;font-size:12px}'
      + '.qst-q{background:rgba(255,255,255,.05);border:1px solid rgba(0,255,255,.12);border-radius:12px;padding:14px;margin-bottom:12px}'
      + '.qst-q .q{font-size:13.5px;color:#e0e0ff;line-height:1.6;font-weight:600}'
      + '.qst-opt{display:flex;gap:8px;align-items:flex-start;background:rgba(255,255,255,.04);border:1px solid transparent;border-radius:9px;padding:9px 11px;margin-top:7px;cursor:pointer;font-size:13px;color:#cce;line-height:1.5}'
      + '.qst-opt .k{color:#0ff;font-weight:700;flex-shrink:0}'
      + '.qst-opt.right{background:rgba(0,255,136,.12);border-color:rgba(0,255,136,.45);color:#bfb}'
      + '.qst-opt.wrong{background:rgba(255,68,68,.12);border-color:rgba(255,68,68,.45);color:#fbb}'
      + '.qst-exp{font-size:12px;color:#9ab;line-height:1.7;margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,.15)}'
      + '.qst-banner{background:rgba(255,170,51,.1);border:1px solid rgba(255,170,51,.4);border-radius:12px;padding:12px;font-size:13px;color:#fc6;line-height:1.7;margin-bottom:12px}'
      + '.qst-banner.ok{background:rgba(0,255,136,.1);border-color:rgba(0,255,136,.4);color:#8fd}'
      // 通关
      + '.qst-clear{text-align:center;padding:36px 18px}'
      + '.qst-clear .title{font-size:24px;font-weight:800;color:#0ff;text-shadow:0 0 20px rgba(0,255,255,.6);margin-bottom:8px}'
      + '.qst-clear .sub{font-size:14px;color:#8899aa;margin-bottom:18px;line-height:1.8}'
      + '.qst-harvest{display:flex;gap:8px;margin:0 0 18px}.qst-harvest div{flex:1;background:rgba(255,255,255,.05);border-radius:10px;padding:10px 4px}'
      + '.qst-harvest .n{font-size:18px;font-weight:800;color:#0f8}.qst-harvest .l{font-size:11px;color:#8899aa;margin-top:2px}'
      ;
    var st = document.createElement('style'); st.id = 'questStyle'; st.textContent = c;
    (document.head || document.documentElement).appendChild(st);
  }

  function closeQ() { var m = document.getElementById('qstMask'); if (m) m.remove(); S = null; }

  // ===================== 关卡列表 =====================
  function renderLevelSelect() {
    var st = stats();
    var html = '<div class="qst-stats">'
      + '<div class="qst-stat"><div class="num">' + st.done + '/' + st.total + '</div><div class="lbl">已通关</div></div>'
      + '<div class="qst-stat"><div class="num">' + st.pct + '%</div><div class="lbl">完成度</div></div>'
      + '<div class="qst-stat"><div class="num">' + st.lines + '</div><div class="lbl">已学句子</div></div>'
      + '<div class="qst-stat"><div class="num">' + (st.avg || '--') + '</div><div class="lbl">平均跟读分</div></div>'
      + '</div>';

    var last = getLast();
    var li = last ? idxOf(last.id) : -1;
    if (li >= 0 && !isCleared(li)) {
      var lr = getRec(last.id);
      html += '<div class="qst-resume" onclick="openQuest.__enter(' + li + ',' + (last.tab || 0) + ')">'
        + '<div><div class="t">继续上次：' + esc(LEVELS[li].title) + '</div>'
        + '<div class="d">已学 ' + lr.learned.length + '/' + LEVELS[li].lines.length + ' 句'
        + (lr.quizDone ? ' · 小测已答对 ' + lr.quizBest + '/' + LEVELS[li].quiz.length : ' · 小测未开始') + '</div></div>'
        + '<div class="go">进入</div></div>';
    }

    html += '<div style="font-size:12px;color:#8899aa;line-height:1.7;margin-bottom:6px">'
      + '共 ' + st.total + ' 关 · ' + countAll('lines') + ' 句情景对话 · ' + countAll('phrases') + ' 条高频表达 · ' + countAll('quiz') + ' 道通关小测。<br>'
      + '通关条件：本关 ' + LEVELS[0].lines.length + ' 句全部跟读过，且小测答对至少 ' + CLEAR_QUIZ_MIN + ' 题。</div>';

    CHAPTERS.forEach(function (ch) {
      var list = [];
      LEVELS.forEach(function (lv, i) { if (lv.chapter === ch) list.push(i); });
      if (!list.length) return;
      var doneN = list.filter(isCleared).length;
      html += '<div class="qst-chapter">' + esc(ch) + ' （' + doneN + '/' + list.length + '）</div>';
      list.forEach(function (i) {
        var lv = LEVELS[i], r = getRec(lv.id);
        var unlocked = isUnlocked(i);
        var cls = 'qst-level' + (unlocked ? '' : ' locked') + (r.cleared ? ' done' : '');
        html += '<div class="' + cls + '"' + (unlocked ? ' onclick="openQuest.__enter(' + i + ')"' : '') + '>'
          + '<div class="qst-licon">' + pad2(i + 1) + '</div>'
          + '<div class="qst-linfo">'
          + '<div class="qst-ltitle">' + esc(lv.title) + '</div>'
          + '<div class="qst-lsub">' + esc(lv.brief) + '</div>'
          + '<div class="qst-chips">'
          + '<span class="qst-chip">' + esc(lv.level) + '</span>'
          + '<span class="qst-chip">' + esc(lv.tag) + '</span>'
          + '<span class="qst-chip">' + lv.lines.length + ' 句对话</span>'
          + '<span class="qst-chip">' + lv.phrases.length + ' 表达</span>'
          + '<span class="qst-chip">' + lv.quiz.length + ' 题</span>'
          + (r.cleared ? '<span class="qst-chip g">小测 ' + r.quizBest + '/' + lv.quiz.length + '</span>' : '')
          + '</div>';
        if (unlocked && !r.cleared) {
          var pct = Math.round(r.learned.length / lv.lines.length * 100);
          html += '<div class="qst-bar"><i style="width:' + pct + '%"></i></div>';
        }
        html += '</div>';
        if (!unlocked) html += '<div class="qst-lbadge qst-badge-lock">未解锁</div>';
        else if (r.cleared) html += '<div class="qst-lbadge qst-badge-done">已通关 ' + (r.avg ? r.avg + '分' : '') + '</div>';
        else if (r.learned.length) html += '<div class="qst-lbadge qst-badge-doing">' + r.learned.length + '/' + lv.lines.length + '</div>';
        else html += '<div class="qst-lbadge qst-badge-new">开始</div>';
        html += '</div>';
      });
    });

    document.getElementById('qstBody').innerHTML = html;
  }

  function countAll(kind) {
    var n = 0;
    LEVELS.forEach(function (lv) { n += lv[kind].length; });
    return n;
  }

  // ===================== 进入关卡 =====================
  function enterLevel(idx, tab) {
    if (idx < 0 || idx >= LEVELS.length) return;
    if (!isUnlocked(idx)) { toast('请先通关上一关'); return; }
    S = { idx: idx, tab: tab || 0, lineIdx: 0, lastScore: null, quizAns: {}, quizDone: false };
    putLast({ id: LEVELS[idx].id, tab: S.tab, time: Date.now() });
    renderLevel();
  }

  function setTab(t) {
    if (!S) return;
    S.tab = t; S.lastScore = null;
    putLast({ id: LEVELS[S.idx].id, tab: t, time: Date.now() });
    renderLevel();
  }

  function renderLevel() {
    if (!S) return;
    var lv = LEVELS[S.idx], r = getRec(lv.id);
    var tabs = ['情景对话', '高频表达', '通关小测'];
    var html = '<div class="qst-hd">'
      + '<button class="qst-back" onclick="openQuest.__back()">返回</button>'
      + '<div class="ti">' + pad2(S.idx + 1) + ' ' + esc(lv.title) + '</div>'
      + '<button class="qst-x" onclick="openQuest.__close()">×</button>'
      + '</div>'
      + '<div class="qst-progress"><div class="bar" style="width:' + Math.round(r.learned.length / lv.lines.length * 100) + '%"></div></div>'
      + '<div class="qst-tabs">';
    tabs.forEach(function (t, i) {
      var extra = '';
      if (i === 0) extra = ' ' + r.learned.length + '/' + lv.lines.length;
      if (i === 2 && r.quizDone) extra = ' ' + r.quizBest + '/' + lv.quiz.length;
      html += '<div class="qst-tab' + (S.tab === i ? ' on' : '') + '" onclick="openQuest.__tab(' + i + ')">' + t + extra + '</div>';
    });
    html += '</div>';

    if (S.tab === 0) html += viewLines(lv, r);
    else if (S.tab === 1) html += viewPhrases(lv);
    else html += viewQuiz(lv, r);

    document.getElementById('qstBody').innerHTML = html;
  }

  // ---- Tab 1：情景对话 ----
  function viewLines(lv, r) {
    if (S.lineIdx >= lv.lines.length) S.lineIdx = lv.lines.length - 1;
    var line = lv.lines[S.lineIdx];
    var learned = r.learned.indexOf(S.lineIdx) >= 0;

    var html = '<div class="qst-story"><b style="color:#0ff">场景说明 · </b>' + esc(lv.story) + '</div>';

    if (r.learned.length >= lv.lines.length) {
      html += '<div class="qst-banner ok">本关 ' + lv.lines.length + ' 句已全部学过。'
        + (r.quizDone && r.quizBest >= CLEAR_QUIZ_MIN ? '小测也已达标，本关已通关。'
          : '去「通关小测」答对至少 ' + CLEAR_QUIZ_MIN + ' 题即可通关。'
            + '<div style="margin-top:8px"><button class="qst-btn green" onclick="openQuest.__tab(2)">去做小测</button></div>')
        + '</div>';
    }

    var scoreHtml = '';
    if (S.lastScore != null) {
      var cls = S.lastScore >= 80 ? 'good' : (S.lastScore >= PASS_SCORE ? 'ok' : 'bad');
      scoreHtml = '<div class="qst-score ' + cls + '">' + S.lastScore + ' 分</div>';
    }

    html += '<div style="font-size:12px;color:#8899aa;margin-bottom:8px">第 ' + (S.lineIdx + 1) + ' / ' + lv.lines.length + ' 句'
      + (learned ? ' · 已学过' : '') + '</div>'
      + '<div class="qst-line-card">'
      + '<div class="qst-en">' + esc(line.en) + '</div>'
      + '<div class="qst-zh">' + esc(line.zh) + '</div>'
      + scoreHtml
      + '</div>'
      + '<div class="qst-controls">'
      + '<button class="qst-btn' + (S.lineIdx === 0 ? ' dim' : '') + '" onclick="openQuest.__prev()">上一句</button>'
      + '<button class="qst-btn solid" onclick="openQuest.__play()">播放</button>'
      + '<button class="qst-btn green" onclick="openQuest.__rec()">跟读评分</button>'
      + '<button class="qst-btn" onclick="openQuest.__next()">下一句</button>'
      + '</div>'
      + '<div class="qst-rec">播放或跟读任意一次即标记该句「已学」；跟读 ' + PASS_SCORE + ' 分以上为及格。</div>';

    // 句导航点
    html += '<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:12px">';
    for (var i = 0; i < lv.lines.length; i++) {
      var on = i === S.lineIdx, ok = r.learned.indexOf(i) >= 0;
      html += '<div onclick="openQuest.__go(' + i + ')" style="width:30px;height:30px;line-height:30px;text-align:center;border-radius:8px;cursor:pointer;font-size:12px;'
        + (on ? 'background:#0ff;color:#001;font-weight:800' : ok ? 'background:rgba(0,255,136,.18);color:#0f8;border:1px solid rgba(0,255,136,.45)' : 'background:rgba(255,255,255,.06);color:#889')
        + '">' + (i + 1) + '</div>';
    }
    html += '</div>';

    html += '<div class="qst-sec">本关要点</div>'
      + '<div class="qst-note"><b>易错点</b>' + esc(lv.pitfall) + '</div>'
      + '<div class="qst-note cul"><b>文化提示</b>' + esc(lv.culture) + '</div>';
    return html;
  }

  // ---- Tab 2：高频表达 ----
  function viewPhrases(lv) {
    var html = '<div class="qst-story"><b style="color:#0ff">英文情景 · </b>' + esc(lv.briefEn) + '</div>'
      + '<div class="qst-sec">本关 ' + lv.phrases.length + " 条高频表达（点右侧按钮听发音）</div>";
    lv.phrases.forEach(function (p, i) {
      html += '<div class="qst-ph"><div class="e"><div class="en">' + esc(p.en) + '</div>'
        + '<div class="zh">' + esc(p.zh) + '</div></div>'
        + '<button class="sp" onclick="openQuest.__say(' + i + ')">播放</button></div>';
    });
    html += '<div class="qst-sec">回到对话中找它们</div>'
      + '<div class="qst-rec">这些表达都来自本关的情景对话。学会后回到「情景对话」跟读一遍，印象更深。</div>'
      + '<div style="margin-top:12px"><button class="qst-btn" onclick="openQuest.__tab(0)">回到对话</button>'
      + '<button class="qst-btn green" onclick="openQuest.__tab(2)" style="margin-left:8px">去做小测</button></div>';
    return html;
  }

  // ---- Tab 3：通关小测 ----
  function viewQuiz(lv, r) {
    var html = '';
    if (r.learned.length < lv.lines.length) {
      html += '<div class="qst-banner">还有 ' + (lv.lines.length - r.learned.length) + ' 句没学过。'
        + '建议先回到「情景对话」把 ' + lv.lines.length + ' 句都过一遍，再来做小测。'
        + '<div style="margin-top:8px"><button class="qst-btn" onclick="openQuest.__tab(0)">去学对话</button></div></div>';
    }

    var answered = 0, correct = 0;
    lv.quiz.forEach(function (q, qi) {
      var pick = S.quizAns[qi];
      if (pick != null) { answered++; if (pick === q.a) correct++; }
    });

    html += '<div class="qst-sec">共 ' + lv.quiz.length + ' 题，答对 ' + CLEAR_QUIZ_MIN + ' 题即达标（当前 ' + correct + '/' + answered + '）</div>';

    lv.quiz.forEach(function (q, qi) {
      var pick = S.quizAns[qi];
      html += '<div class="qst-q"><div class="q">' + (qi + 1) + '. ' + esc(q.q) + '</div>';
      q.options.forEach(function (op, oi) {
        var cls = '';
        if (pick != null) {
          if (oi === q.a) cls = ' right';
          else if (oi === pick) cls = ' wrong';
        }
        html += '<div class="qst-opt' + cls + '"' + (pick == null ? ' onclick="openQuest.__pick(' + qi + ',' + oi + ')"' : '') + '>'
          + '<span class="k">' + 'ABC'.charAt(oi) + '.</span><span>' + esc(op) + '</span></div>';
      });
      if (pick != null) {
        html += '<div class="qst-exp">' + (pick === q.a ? '答对了。' : '正确答案：' + 'ABC'.charAt(q.a) + '。')
          + esc(q.explain) + '</div>';
      }
      html += '</div>';
    });

    if (answered === lv.quiz.length) {
      if (correct >= CLEAR_QUIZ_MIN && r.learned.length >= lv.lines.length) {
        if (!r.cleared) { finishLevel(correct); return '<div class="qst-clear"></div>'; }
        html += '<div class="qst-banner ok">本关已通关（小测 ' + correct + '/' + lv.quiz.length + '）。</div>';
      } else {
        var miss = [];
        if (correct < CLEAR_QUIZ_MIN) miss.push('小测答对 ' + CLEAR_QUIZ_MIN + ' 题（当前 ' + correct + '）');
        if (r.learned.length < lv.lines.length) miss.push('把 ' + lv.lines.length + ' 句对话全部跟读过（当前 ' + r.learned.length + '）');
        html += '<div class="qst-banner">还差：' + miss.join('；') + '。</div>';
      }
      html += '<div style="margin-top:12px"><button class="qst-btn" onclick="openQuest.__retryQuiz()">重做本关小测</button></div>';
    }
    return html;
  }

  // ===================== 通关 =====================
  function finishLevel(quizCorrect) {
    var lv = LEVELS[S.idx], r = getRec(lv.id);
    var scores = r.scores || [];
    var avg = r.avg || 0;
    var now = {
      learned: lv.lines.map(function (_, i) { return i; }),
      quizBest: Math.max(r.quizBest || 0, quizCorrect),
      quizDone: true,
      avg: avg,
      scores: scores,
      cleared: true,
      time: Date.now()
    };
    putRec(lv.id, now);
    S = null;

    var html = '<div class="qst-clear">'
      + '<div class="title">关卡完成</div>'
      + '<div class="sub">' + esc(lv.title) + '<br>小测 ' + quizCorrect + '/' + lv.quiz.length
      + (avg ? ' · 跟读均分 ' + avg : '') + '</div>'
      + '<div class="qst-harvest">'
      + '<div><div class="n">' + lv.lines.length + '</div><div class="l">情景对话</div></div>'
      + '<div><div class="n">' + lv.phrases.length + '</div><div class="l">高频表达</div></div>'
      + '<div><div class="n">' + lv.quiz.length + '</div><div class="l">小测题</div></div>'
      + '</div>'
      + '<div class="qst-note cul" style="text-align:left"><b>文化提示</b>' + esc(lv.culture) + '</div>';
    var nextIdx = idxOf(lv.id) + 1;
    if (nextIdx < LEVELS.length) {
      html += '<button class="qst-btn green" onclick="openQuest.__enter(' + nextIdx + ')" style="padding:12px 24px;font-size:15px">进入下一关：' + esc(LEVELS[nextIdx].title) + '</button>';
    } else {
      html += '<div style="color:#0f8;font-size:16px;margin:16px 0">全部 ' + LEVELS.length + ' 关已通关</div>';
    }
    html += '<div style="margin-top:16px"><button class="qst-btn" onclick="openQuest.__back()">返回关卡列表</button></div></div>';
    document.getElementById('qstBody').innerHTML = html;
  }

  // ===================== 打开 =====================
  function open() {
    css();
    closeQ();
    var m = document.createElement('div'); m.id = 'qstMask'; m.className = 'qst-mask';
    m.innerHTML = '<div class="qst-grid"></div>'
      + '<div class="qst-top"><b>穿越英语 · 情景穿越闯关</b>'
      + '<button class="qst-x" onclick="openQuest.__close()">×</button></div>'
      + '<div class="qst-body" id="qstBody"></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) closeQ(); });
    renderLevelSelect();
  }

  // ===================== 对外接口 =====================
  window.openQuest = function () { open(); };
  window.openQuest.__close = closeQ;
  window.openQuest.__back = function () { S = null; renderLevelSelect(); };
  window.openQuest.__enter = enterLevel;
  window.openQuest.__tab = setTab;
  window.openQuest.__go = function (i) {
    if (!S) return;
    S.lineIdx = i; S.lastScore = null; putLast({ id: LEVELS[S.idx].id, tab: 0, time: Date.now() });
    renderLevel();
  };
  window.openQuest.__prev = function () {
    if (!S) return;
    if (S.lineIdx > 0) { S.lineIdx--; S.lastScore = null; renderLevel(); }
  };
  window.openQuest.__next = function () {
    if (!S) return;
    var lv = LEVELS[S.idx];
    if (S.lineIdx < lv.lines.length - 1) { S.lineIdx++; S.lastScore = null; renderLevel(); }
    else { S.tab = 2; renderLevel(); }
  };
  window.openQuest.__say = function (i) {
    if (!S) return;
    var p = LEVELS[S.idx].phrases[i];
    if (p) speak(p.en);
  };
  window.openQuest.__play = function () {
    if (!S) return;
    var lv = LEVELS[S.idx];
    var line = lv.lines[S.lineIdx];
    if (!speak(line.en)) toast('当前环境不支持语音播放，请对照文字跟读');
    markLearned(lv.id, S.lineIdx);
    renderLevel();
  };
  window.openQuest.__rec = function () {
    if (!S) return;
    var lv = LEVELS[S.idx], line = lv.lines[S.lineIdx];
    if (typeof startEnglishRecognition !== 'function') {
      toast('当前环境不支持语音识别，请对照文字跟读');
      markLearned(lv.id, S.lineIdx);
      renderLevel();
      return;
    }
    toast('请读出这句英文…');
    startEnglishRecognition(
      function () { },
      function (finalText) {
        if (!S) return;
        var score = scoreSpeaking(finalText, line.en);
        S.lastScore = score;
        var rec = getRec(lv.id);
        rec.scores = rec.scores || [];
        rec.scores.push(score);
        rec.avg = Math.round(rec.scores.reduce(function (a, b) { return a + b; }, 0) / rec.scores.length);
        putRec(lv.id, rec);
        markLearned(lv.id, S.lineIdx);
        renderLevel();
        toast(score >= PASS_SCORE ? score + ' 分，及格通过' : score + ' 分，再试一次（目标 ' + PASS_SCORE + ' 分）');
      },
      function (err) { toast('识别失败：' + (err || '请检查麦克风权限')); }
    );
  };
  window.openQuest.__pick = function (qi, oi) {
    if (!S) return;
    S.quizAns[qi] = oi;
    var lv = LEVELS[S.idx];
    var answered = 0, correct = 0;
    lv.quiz.forEach(function (q, i) {
      var pick = S.quizAns[i];
      if (pick != null) { answered++; if (pick === q.a) correct++; }
    });
    if (answered === lv.quiz.length) {
      var r = getRec(lv.id);
      if (r.quizBest < correct) { r.quizBest = correct; }
      r.quizDone = true;
      putRec(lv.id, r);
      if (correct >= CLEAR_QUIZ_MIN && r.learned.length >= lv.lines.length) {
        finishLevel(correct);
        return;
      }
    }
    renderLevel();
  };
  window.openQuest.__retryQuiz = function () {
    if (!S) return;
    S.quizAns = {};
    renderLevel();
  };

  function markLearned(id, lineIdx) {
    var r = getRec(id);
    if (r.learned.indexOf(lineIdx) < 0) {
      r.learned.push(lineIdx);
      r.learned.sort(function (a, b) { return a - b; });
    }
    if (!r.time) r.time = Date.now();
    putRec(id, r);
  }
})();
