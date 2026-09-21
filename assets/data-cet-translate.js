/* =============================================================================
 * assets/data-cet-translate.js —— A2「四级 · 翻译专项」真内容数据（R48 第 2 批 / T22）
 * -----------------------------------------------------------------------------
 * 加载位置：必须在 assets/xt-content.js 之后、assets/cet-translate.js 之前。
 * 暴露对象：window.CET_TRANS = { version, items: [...] }
 *
 * 数据约定（渲染器 assets/cet-translate.js 严格按此解析）：
 *   item = {
 *     id:      's1'                 ASCII id，用于 localStorage 存档
 *     type:    'sentence' | 'para'  单句 / 段落
 *     cn:      '中文原文'
 *     ref:     '参考译文（英文）'
 *     keys:    [ [ 'an increasing number of', 'more and more' ], ... ]
 *              —— 关键词组：每组内任一写法命中即算该组命中，第 1 项为推荐写法（评分区展示）
 *     tips:    '中文解析：句式 / 易错点 / 得分要点'
 *     minutes: 建议用时（分钟）
 *     words:   参考英文词数
 *   }
 *   评分：命中组数 / 总组数 × 100，四舍五入取整；仅作自测参考，非官方评分标准。
 *
 * 铁律：中文原文与参考译文均为按四级真题难度与话题「原创改编」，不抄录真题原文。
 * 版本戳：20260914e
 * ========================================================================== */
(function () {
  'use strict';

  window.CET_TRANS = window.CET_TRANS || {};
  window.CET_TRANS.version = '20260914e';

  window.CET_TRANS.items = [
    /* ---------------------------------------------------------------- 单句 1 */
    {
      id: 's1',
      type: 'sentence',
      topic: '生活 · 健康',
      cn: '随着生活水平的提高，越来越多的中国人开始重视身体健康，并积极参加各种体育活动。',
      ref: 'With the improvement of living standards, a growing number of Chinese people have begun to attach importance to physical fitness and take an active part in various sports activities.',
      keys: [
        ['with the improvement of', 'as living standards improve', 'as the living standard improves'],
        ['living standards', 'living standard'],
        ['a growing number of', 'an increasing number of', 'more and more'],
        ['attach importance to', 'pay attention to', 'attach great importance to', 'value'],
        ['physical fitness', 'physical health'],
        ['take an active part in', 'actively take part in', 'actively participate in', 'actively join in']
      ],
      tips: '① "随着……的提高"用 with the improvement of…，介词 with 后接名词短语，不要写成 with the living standard improve（谓语动词误用）。② "越来越多的"除 more and more 外，书面的 a growing / an increasing number of 更讨巧。③ "重视"可译 attach importance to 或 pay attention to，注意 to 是介词，后接名词/动名词。④ 两个并列动作"重视……并积极参加……"用 and 连接，时态统一用现在完成时 have begun。',
      minutes: 3,
      words: 30
    },

    /* ---------------------------------------------------------------- 单句 2 */
    {
      id: 's2',
      type: 'sentence',
      topic: '文化 · 古迹',
      cn: '这座建于明朝的古城墙已有六百多年的历史，每年吸引数百万游客前来参观。',
      ref: 'The ancient city wall, which was built in the Ming Dynasty, has a history of more than 600 years and attracts millions of visitors every year.',
      keys: [
        ['which was built in', 'built in', 'which dates from', 'dating from'],
        ['the ming dynasty', 'ming dynasty'],
        ['has a history of', 'with a history of', 'dates back'],
        ['more than 600 years', 'over 600 years', 'more than six hundred years'],
        ['attracts millions of', 'attracting millions of', 'draws millions of'],
        ['visitors', 'tourists']
      ],
      tips: '① "建于……"是被动态，用 be built in + 朝代；朝代前要加定冠词 the（the Ming Dynasty）。② 用 which 引导非限定性定语从句把"建于明朝"挂到主语后，避免写出两个谓语动词（The wall was built…, it has…）。③ "已有……历史"可用 has a history of…，注意不要说 has…history 缺少冠词。④ "数百万"用 millions of，million 有 s 且后接 of；具体数字（two million）则不加 s。',
      minutes: 3,
      words: 27
    },

    /* ---------------------------------------------------------------- 单句 3 */
    {
      id: 's3',
      type: 'sentence',
      topic: '文化 · 节日',
      cn: '中国的传统节日不仅是家人团聚的日子，也是传承民族文化的重要方式。',
      ref: 'Traditional Chinese festivals are not only occasions for family reunions, but also an important way of passing on the national culture.',
      keys: [
        ['traditional chinese festivals', 'traditional chinese festival', 'traditional festivals in china'],
        ['not only', 'not merely', 'not just'],
        ['but also'],
        ['family reunion', 'family reunions', 'family gathering', 'family gatherings'],
        ['passing on', 'passing down', 'inheriting', 'handing down', 'carrying forward'],
        ['national culture', 'traditional culture']
      ],
      tips: '① "不仅……而且……"用 not only … but also …，前后成分要对称：not only 后是名词短语 occasions，but also 后也用名词短语 an important way。② "……的日子"不要直译成 the days，用 occasion（场合/时机）更地道。③ "传承"可译 pass on / pass down / hand down，注意 on/down 后接名词。④ "……的重要方式"用 a way of doing sth.，of 后必须用动名词 passing。',
      minutes: 3,
      words: 24
    },

    /* ---------------------------------------------------------------- 单句 4 */
    {
      id: 's4',
      type: 'sentence',
      topic: '经济 · 科技',
      cn: '近年来，中国的高铁网络发展迅速，大大缩短了城市之间的旅行时间。',
      ref: 'In recent years, China\'s high-speed rail network has developed rapidly, greatly shortening the travel time between cities.',
      keys: [
        ['in recent years', 'in the past few years', 'recently'],
        ['china\'s high-speed rail', 'high-speed railway', 'high-speed rail network', 'high-speed rail'],
        ['has developed rapidly', 'developed rapidly', 'has grown rapidly', 'has developed quickly'],
        ['shortening', 'reducing', 'cutting', 'shortened'],
        ['travel time', 'journey time', 'travelling time'],
        ['between cities', 'among cities']
      ],
      tips: '① "近年来"是现在完成时的标志，主句用 has developed。② "高铁"标准说法是 high-speed rail / high-speed railway，注意连字符不要丢。③ "大大缩短了……"作结果状语，用现在分词 shortening（主动）而非 shortened（被动），主语 network 是"缩短"的发出者。④ 若不会写 shortening，可退而用并列句：…has developed rapidly and has greatly shortened…，保证句子结构正确优先于堆砌难词。',
      minutes: 3,
      words: 22
    },

    /* ---------------------------------------------------------------- 单句 5 */
    {
      id: 's5',
      type: 'sentence',
      topic: '人物 · 科技',
      cn: '尽管遇到许多困难，这位科学家从未放弃对可再生能源的研究。',
      ref: 'Although he met with many difficulties, the scientist never gave up his research on renewable energy.',
      keys: [
        ['although', 'though', 'despite', 'in spite of'],
        ['many difficulties', 'numerous difficulties', 'a lot of difficulties', 'great difficulties'],
        ['never gave up', 'never abandoned', 'has never given up'],
        ['research on', 'study of', 'research into', 'research on the'],
        ['renewable energy', 'renewable energies']
      ],
      tips: '① "尽管"后接句子用 Although / Though；后接名词短语才用 Despite / In spite of，两者不可混用（Despite he met…是典型错句）。② "遇到（困难）"可用 meet with / encounter，注意时态与"从未放弃"一致用过去式。③ "放弃"give up 是"动词 + 副词"短语，代词作宾语须放中间（give it up）。④ "对……的研究"固定搭配 research on / into，不用 research of。',
      minutes: 3,
      words: 21
    },

    /* ---------------------------------------------------------------- 单句 6 */
    {
      id: 's6',
      type: 'sentence',
      topic: '社会 · 环保',
      cn: '为了减少污染，政府鼓励市民少用一次性塑料制品，多乘坐公共交通工具。',
      ref: 'In order to reduce pollution, the government encourages citizens to use fewer disposable plastic products and to travel more by public transport.',
      keys: [
        ['in order to reduce', 'to reduce', 'so as to reduce', 'aiming to reduce'],
        ['pollution'],
        ['encourages citizens to', 'encourages people to', 'encourages the public to'],
        ['disposable plastic products', 'single-use plastic products', 'disposable plastics', 'throwaway plastic products'],
        ['public transport', 'public transportation', 'public transit']
      ],
      tips: '① 目的状语"为了……"用 In order to / To + 动词原形，不要写 For reduce。② "鼓励某人做某事"是 encourage sb. to do sth.，to 不可省。③ "少用……多乘……"两个并列不定式用 and 连接，第二个 to 可保留使结构更清晰。④ "一次性"常用 disposable / single-use；"公共交通"英式 public transport、美式 public transportation 均可。',
      minutes: 3,
      words: 27
    },

    /* ---------------------------------------------------------------- 段落 1 */
    {
      id: 'p1',
      type: 'para',
      topic: '文化 · 剪纸',
      cn: '剪纸是中国最古老的民间艺术之一，已有两千多年的历史。人们通常在春节或婚礼时把红色的剪纸贴在门窗上，因为它们象征着幸福和好运。如今，剪纸不仅被看作一种装饰，还被用来讲述故事、记录生活。2009 年，中国剪纸被列入联合国教科文组织人类非物质文化遗产代表作名录。',
      ref: 'Paper-cutting is one of the oldest folk arts in China, with a history of more than 2,000 years. People usually put up red paper-cuttings on doors and windows during the Spring Festival or at weddings, because they stand for happiness and good luck. Today, paper-cutting is regarded not only as a form of decoration but also as a way of telling stories and recording daily life. In 2009, Chinese paper-cutting was included in UNESCO\'s Representative List of the Intangible Cultural Heritage of Humanity.',
      keys: [
        ['paper-cutting', 'paper cutting', 'paper-cut'],
        ['one of the oldest folk arts', 'one of the oldest traditional arts', 'one of the oldest folk art'],
        ['with a history of', 'has a history of', 'which has a history of'],
        ['more than 2000 years', 'over 2000 years', 'more than two thousand years', 'over two thousand years'],
        ['put up', 'paste', 'stick'],
        ['the spring festival', 'spring festival'],
        ['wedding', 'weddings'],
        ['stand for', 'symbolize', 'symbolise', 'represent'],
        ['happiness and good luck', 'happiness and fortune'],
        ['not only'],
        ['but also'],
        ['telling stories', 'tell stories'],
        ['recording daily life', 'record daily life', 'recording everyday life'],
        ['in 2009'],
        ['unesco'],
        ['intangible cultural heritage', 'intangible heritage']
      ],
      tips: '① "……之一"用 one of + 最高级 + 复数名词（one of the oldest folk arts）。② "已有……历史"可用 with a history of… 作伴随状语，避免另起一句造成流水句。③ "贴（剪纸）"用 put up / paste … on …；"象征"用 stand for / symbolize，别写成 stands of。④ "被看作"be regarded as / be seen as，as 不可省。⑤ 末句为被动：be included in … List of the Intangible Cultural Heritage of Humanity，专名首字母大写。⑥ 段落翻译宁可拆成若干结构正确的简单句，也不要硬凑长句导致时态、单复数连环出错。',
      minutes: 12,
      words: 105
    },

    /* ---------------------------------------------------------------- 段落 2 */
    {
      id: 'p2',
      type: 'para',
      topic: '经济 · 电商',
      cn: '过去十年，中国的电子商务迅速发展，改变了人们的购物方式。如今，越来越多的消费者习惯在网上购买日常生活用品，并通过手机付款。物流体系的完善使商品能够在几天之内送达偏远地区。电子商务不仅创造了大量就业机会，也为农村产品的销售提供了新的渠道。',
      ref: 'Over the past decade, China\'s e-commerce has developed rapidly and changed the way people shop. Nowadays, a growing number of consumers are used to buying daily necessities online and paying by mobile phone. The improvement of the logistics system has made it possible for goods to be delivered to remote areas within a few days. E-commerce has not only created a large number of jobs, but also provided a new channel for the sale of rural products.',
      keys: [
        ['over the past decade', 'in the past ten years', 'over the last ten years', 'over the past ten years'],
        ['china\'s e-commerce', 'e-commerce in china', 'electronic commerce', 'online business'],
        ['has developed rapidly', 'developed rapidly', 'has grown rapidly', 'has developed quickly'],
        ['the way people shop', 'people\'s way of shopping', 'the way of shopping', 'shopping habits'],
        ['a growing number of', 'an increasing number of', 'more and more'],
        ['daily necessities', 'daily goods', 'daily supplies', 'daily articles'],
        ['online', 'on the internet', 'on the web'],
        ['paying by mobile phone', 'mobile payment', 'pay by phone', 'paying with mobile phones', 'paying by phone'],
        ['logistics system', 'delivery system', 'logistics network'],
        ['within a few days', 'in a few days', 'within several days'],
        ['remote areas', 'rural areas', 'distant areas'],
        ['created a large number of jobs', 'created many jobs', 'created a lot of jobs', 'created numerous jobs'],
        ['provided a new channel', 'provided new channels', 'offered a new channel', 'provided a new way'],
        ['rural products', 'agricultural products', 'farm products']
      ],
      tips: '① "过去十年"用 Over / In the past decade，是现在完成时的时间标志。② "改变了人们的购物方式"：the way 后接定语从句可省略关系词（the way people shop）。③ "习惯做某事"是 be used to doing sth.，to 为介词，后接 buying，切勿接动词原形。④ "使……成为可能"用 make it possible for sb./sth. to do，it 为形式宾语。⑤ "不仅……而且……"连接两个谓语时保持时态一致（has created … and provided）。⑥ 段落中重复出现"电子商务"，第二句起可用 E-commerce 或 It 回指，避免重复啰嗦。',
      minutes: 12,
      words: 100
    }
  ];
})();
