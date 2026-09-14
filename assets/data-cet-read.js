/* =============================================================================
 * assets/data-cet-read.js —— A1「四级 · 阅读理解」真内容数据（R48 第 2 批 / T21）
 * -----------------------------------------------------------------------------
 * 加载位置：必须在 assets/xt-content.js 之后、assets/cet-read.js 之前。
 * 暴露对象：window.CET_READ = { version, passages: [...] }
 *
 * 数据约定（渲染器 assets/cet-read.js 严格按此解析）：
 *   1) type = 'cloze'   选词填空：body 为正文串，段落用 \n\n 分隔，空格用 {{n}} 标记
 *                       （n 从 1 开始递增，与 blanks[i].no 一一对应）；
 *                       options 为 15 个选项 {k:'A', w:'absorb', p:'v.吸收'}；
 *                       blanks 为 10 个空 {no:1, a:'I', x:'解析'}。
 *   2) type = 'match'   长篇阅读：paras 为 10 段 {k:'A', t:'段落正文'}；
 *                       stats 为 10 条陈述 {no:1, t:'陈述', a:'C', x:'解析'}。
 *   3) type = 'careful' 仔细阅读：body 为正文串（\n\n 分段）；
 *                       qs 为 5 题 {q, o:[4 选项], a:正确下标, x:'解析'}。
 *
 * 铁律：全部内容为按四级真题难度与篇幅**原创改编**，不抄录任何真题原文；
 *       每题 / 每空 / 每条陈述均带中文解析（x 字段）。
 * 版本戳：20260914e
 * ========================================================================== */
(function () {
  'use strict';

  window.CET_READ = window.CET_READ || {};
  window.CET_READ.version = '20260914e';

  window.CET_READ.passages = [
    /* ---------------------------------------------------------------- 第 1 篇 */
    {
      id: 'r1',
      type: 'cloze',
      tab: '选词填空',
      title: '选词填空 · 城市绿地与公众健康',
      sub: '说明类短文 · 约 250 词 · 建议 8 分钟',
      minutes: 8,
      tip: '先给 15 个选项标词性，再按空格的语法需求（词性 + 搭配）锁定 2-3 个候选，最后靠上下文语义定夺。',
      body: 'For centuries, city planners treated parks as a pleasant extra rather than a basic {{1}}. Yet a growing body of research suggests that green space does far more than decorate a neighbourhood: it quietly {{2}} the way people feel, think and recover from illness.\n\nIn one widely cited study, residents who moved to greener districts reported an immediate rise in life satisfaction, and the effect {{3}} for at least three years. Researchers believe several mechanisms are at work. Trees and grass lower summer temperatures, trap dust and {{4}} noise from traffic. More importantly, they invite people outdoors. A shady path gives neighbours a reason to greet each other, and such small exchanges gradually build the trust that holds a community {{5}}.\n\nDoctors have begun to take notice. Some clinics in Europe now issue what they call "green prescriptions", {{6}} patients to spend two hours a week in a park instead of reaching only for medicine. Early results are encouraging: participants report lower blood pressure, fewer headaches and a {{7}} improvement in mood.\n\nNone of this means that a park can replace a hospital. Green space works best as a {{8}} to ordinary care, not a substitute for it. Nor are the benefits shared equally. In many cities the leafiest districts are also the wealthiest, while low-income families often live more than ten minutes\' walk from any {{9}} park. Planners who care about public health should therefore treat unequal {{10}} to nature as a question of fairness rather than one of taste.',
      options: [
        { k: 'A', w: 'absorb', p: 'v. 吸收（液体、声音等）' },
        { k: 'B', w: 'access', p: 'n. （使用或接触的）机会，权利' },
        { k: 'C', w: 'complement', p: 'n. 补充物；补足' },
        { k: 'D', w: 'costly', p: 'adj. 昂贵的；代价高的' },
        { k: 'E', w: 'encouraging', p: 'v. 鼓励（现在分词）' },
        { k: 'F', w: 'benefits', p: 'n. 益处（复数）' },
        { k: 'G', w: 'lasted', p: 'v. 持续（过去式）' },
        { k: 'H', w: 'measurable', p: 'adj. 可测量的；明显的' },
        { k: 'I', w: 'necessity', p: 'n. 必需品；必要性' },
        { k: 'J', w: 'rarely', p: 'adv. 很少，难得' },
        { k: 'K', w: 'shapes', p: 'v. 塑造；影响……的形成' },
        { k: 'L', w: 'sizeable', p: 'adj. 相当大的' },
        { k: 'M', w: 'together', p: 'adv. 在一起；使凝聚' },
        { k: 'N', w: 'urban', p: 'adj. 城市的' },
        { k: 'O', w: 'weighed', p: 'v. 权衡；称重（过去式）' }
      ],
      blanks: [
        { no: 1, a: 'I', x: '空格前 basic 为形容词，需填名词；rather than 前后语义相对：公园不是"锦上添花的点缀（extra）"而是"基本必需品（necessity）"，故选 I。access / complement / benefits 均为名词，但都无法与 extra 构成对照。' },
        { no: 2, a: 'K', x: '主语 it 为第三人称单数，空格处缺谓语动词；shape the way people feel（影响人们的感受方式）搭配成立，故选 K。weighed（权衡）、lasted（持续）与 the way 不搭配。' },
        { no: 3, a: 'G', x: 'and 连接并列谓语，与 reported 时态一致用过去式；last for three years 表示"持续三年"，与"搬到绿化更好的街区后幸福感上升"的语境吻合，故选 G。' },
        { no: 4, a: 'A', x: '此处为 lower / trap / ___ 三个并列动词原形，需动词原形；absorb noise 是固定搭配"吸收噪音"，故选 A。' },
        { no: 5, a: 'M', x: 'hold a community together 意为"使一个社区凝聚在一起"，副词作宾语补足语，故选 M。rarely（很少）语义相反。' },
        { no: 6, a: 'E', x: '逗号后无连词，需用现在分词作伴随状语，说明"绿色处方"的内容；encourage sb. to do sth. 为固定用法，故选 E。' },
        { no: 7, a: 'H', x: '空格前 a、空格后 improvement，需形容词；measurable improvement 表示"能被观察到的改善"，与"早期结果令人鼓舞"呼应，故选 H。costly（昂贵的）语义相反；sizeable 强调规模大，形容 mood 的改善不如 measurable 贴切。' },
        { no: 8, a: 'C', x: '空格前 a，需名词；后文 not a substitute for it（不是它的替代品）提示此处为 complement（补充物），complement 与 substitute 构成经典对照，故选 C。' },
        { no: 9, a: 'L', x: '空格后为 park，需形容词；sizeable park 指"规模较大的公园"，与"住在离任一较大公园十分钟步行路程以上"的对比语境吻合，故选 L。urban park 语法成立，但与 city 重复且缺少"距离远"所需的规模含义。' },
        { no: 10, a: 'B', x: 'access to 为固定搭配，表示"获得……的机会/权利"；unequal access to nature 意为"接触自然的机会不均等"，与末段公平性论述一致，故选 B。' }
      ]
    },

    /* ---------------------------------------------------------------- 第 2 篇 */
    {
      id: 'r2',
      type: 'match',
      tab: '长篇匹配',
      title: '长篇阅读 · 远程办公改变了什么',
      sub: '10 段约 1000 词 · 建议 10 分钟',
      minutes: 10,
      tip: '先读 10 条陈述、划出不可替换的专名与数字，再扫读段落首尾句找同义替换；每段只抓一个核心信息点。',
      paras: [
        { k: 'A', t: 'When the pandemic forced millions of employees to work from home in 2020, most managers treated the change as a temporary inconvenience that would end within months. Five years later, remote and hybrid arrangements have become a permanent feature of the labour market in dozens of countries. Surveys repeatedly find that a majority of workers whose jobs can be done from home now spend at least two days a week there.' },
        { k: 'B', t: 'The most obvious beneficiary has been time. Commuting, which once consumed close to an hour a day for the average city worker, has been partly reclaimed. A study covering eight metropolitan areas found that remote workers devoted roughly a third of the time they saved to additional work, and the rest to sleep, exercise and family.' },
        { k: 'C', t: 'Employers, however, were quick to notice what had been lost. The informal conversation beside the coffee machine, the quick glance at a colleague\'s screen, the awkward but useful five minutes before a meeting begins — all of these simply disappeared. Junior staff in particular reported that they no longer picked up professional habits by watching experienced colleagues at work.' },
        { k: 'D', t: 'Research on creativity points in the same direction. Several studies of patent teams and software groups found that fully remote collaboration produced a larger number of ideas but a smaller number of breakthrough ones. Face-to-face discussion, it seems, is unusually good at killing weak proposals early and combining half-formed thoughts into something stronger.' },
        { k: 'E', t: 'Productivity figures are harder to read than either side admits. Individual tasks — writing a report, reviewing code, answering email — tend to be completed faster at home. Team projects that require coordination, by contrast, often take longer. A large experiment at a technology company found that purely remote teams finished about 8 percent more individual assignments, yet completed joint projects more slowly than hybrid ones.' },
        { k: 'F', t: 'The effects are not evenly distributed. Senior employees with established networks and a spare room to work in adapted easily. New graduates, by contrast, reported weaker relationships with their supervisors and slower promotion. Women with young children, who gained flexibility but also took on more domestic work, gave the most mixed assessments of any group in the study.' },
        { k: 'G', t: 'Cities have felt the change as well. Office occupancy in many business districts remains well below its 2019 level, and the shops, cafés and dry cleaners that depended on office workers have closed in large numbers. Some city governments now offer tax incentives to turn half-empty office towers into flats, a process that is expensive but increasingly seen as unavoidable.' },
        { k: 'H', t: 'A second, quieter consequence has been geographical. Once employees no longer needed to live within commuting distance, many moved to smaller towns where housing costs less. This has redistributed income towards rural areas, but it has also pushed up local rents and put pressure on schools and clinics that were never designed for rapid growth.' },
        { k: 'I', t: 'Managers have responded by inventing new rules. Some firms require a fixed number of days in the office; others leave the choice to individual teams. A growing number have adopted "anchor days", on which the whole team is present, while allowing the rest of the week to be arranged freely. Evidence so far suggests that predictable schedules work better than varying ones.' },
        { k: 'J', t: 'What, then, should an organisation conclude? The honest answer is that remote work is neither the disaster its critics describe nor the revolution its enthusiasts promised. It is a tool whose value depends on the task, the person and the stage of a career. The firms that appear to be doing best are those that stopped arguing about principle and started measuring which arrangements suit which kind of work.' }
      ],
      stats: [
        { no: 1, t: 'Employees who used to spend a large part of each day travelling to work have won back some of that time.', a: 'B', x: '题干"travelling to work = commuting""won back some of that time = has been partly reclaimed"，对应 B 段"通勤曾占城市职工每天近一小时，如今部分被收回"。' },
        { no: 2, t: 'Working entirely from home appears to widen the gap between experienced staff and those at the start of their careers.', a: 'F', x: '题干"widen the gap"概括 F 段对比：资深员工有现成人脉和独立房间，适应良好；应届毕业生与主管关系更弱、晋升更慢。C 段只谈"新人不再靠观察学习"，未涉及晋升差距，故不选。' },
        { no: 3, t: "One company's trial showed that people working at home handled personal assignments more quickly, while group tasks suffered.", a: 'E', x: '题干"One company\'s trial = A large experiment at a technology company""personal assignments = individual assignments""group tasks suffered = completed joint projects more slowly"，唯一对应 E 段。' },
        { no: 4, t: 'Shops and services in central business districts have suffered because fewer people now go to offices.', a: 'G', x: '题干"Shops and services…have suffered"对应 G 段"依赖办公人群的商店、咖啡馆、干洗店大量关闭"，原因即"写字楼入住率远低于 2019 年"。' },
        { no: 5, t: 'Managers at first believed that working from home would be a short-lived arrangement.', a: 'A', x: '题干"short-lived arrangement = temporary inconvenience that would end within months"，对应 A 段首句管理者最初的判断。' },
        { no: 6, t: 'Direct personal contact helps a team reject poor suggestions and develop promising ones.', a: 'D', x: '题干"reject poor suggestions = killing weak proposals early""develop promising ones = combining half-formed thoughts into something stronger"，对应 D 段面对面讨论的独特价值。' },
        { no: 7, t: 'Some employers now make sure that all members of a team are in the workplace on particular days.', a: 'I', x: '题干"on particular days"对应 I 段"anchor days（锚定日）：全团队到岗，其余时间自由安排"。' },
        { no: 8, t: 'The move away from offices has brought money to some country areas while creating pressure on local public services.', a: 'H', x: '题干"brought money to some country areas = redistributed income towards rural areas""pressure on local public services = 推高房租、给学校和诊所带来压力"，唯一对应 H 段。' },
        { no: 9, t: 'Newcomers have fewer chances to pick up working methods by observing others around them.', a: 'C', x: '题干"pick up working methods by observing others = no longer picked up professional habits by watching experienced colleagues"，对应 C 段。' },
        { no: 10, t: 'The writer suggests that the argument should be settled by looking at evidence rather than by appealing to general beliefs.', a: 'J', x: '题干"settled by looking at evidence = started measuring which arrangements suit which kind of work""rather than appealing to general beliefs = stopped arguing about principle"，对应 J 段结论。' }
      ]
    },

    /* ---------------------------------------------------------------- 第 3 篇 */
    {
      id: 'r3',
      type: 'careful',
      tab: '仔细阅读',
      seq: 1,
      title: '仔细阅读（一）· 一条通知的代价',
      sub: '科普议论 · 约 320 词 · 建议 9 分钟',
      minutes: 9,
      tip: '先题后文：划出题干定位词，回原文找同义替换；主旨题排除以偏概全和绝对化选项。',
      body: 'Every time a phone buzzes, the brain pays a price that lasts far longer than the glance itself. Researchers at a university in California asked two groups of students to solve the same set of logic puzzles. One group worked in silence; the other received short message notifications every few minutes. The interrupted group finished more slowly and made roughly twice as many errors. The most striking finding, however, came afterwards: when both groups were later tested on material they had read during the session, the interrupted students remembered significantly less, even though they had spent more time on the task.\n\nWhy should a two-second glance do so much damage? Psychologists use the term "attention residue" to describe what happens when the mind switches tasks. Part of our attention stays behind, still busy with the message we have just seen, so the work in front of us receives only a fraction of our mental capacity. Getting back to full concentration takes, on average, more than twenty minutes — and most people are interrupted again long before that.\n\nThe cost is not evenly spread. Complex tasks that require holding several ideas in mind at once suffer most; simple mechanical work barely suffers at all. This explains why an hour of interrupted study feels busy but produces little, while the same hour spent reading or writing without interruption often yields more than two broken hours.\n\nPractical solutions are less heroic than the productivity industry suggests. Turning off notifications, leaving the phone in another room, and dividing work into blocks of forty to fifty minutes cost nothing and remove the source of the problem instead of training us to resist it. Willpower, the research suggests, is a poor substitute for a quiet desk.',
      qs: [
        {
          q: 'The experiment mentioned in the first paragraph is mainly intended to ______.',
          o: [
            'show that logic puzzles are harder than reading tasks',
            'measure the lasting cost of very brief interruptions',
            'compare students from different universities',
            'test the effect of a new messaging application'
          ],
          a: 1,
          x: '首段用对比实验引出全文话题：被打断组做得更慢、错误更多，且事后记忆更差——即"短暂打断的持续性代价"。A 项把 puzzle 与 reading 比较，非实验目的；C、D 属无中生有。'
        },
        {
          q: 'The term "attention residue" (Para. 2) refers to the fact that ______.',
          o: [
            'part of the mind remains occupied by the task just left behind',
            'the brain gradually loses the ability to concentrate',
            'people need twenty minutes to finish a simple task',
            'short messages are easier to remember than long texts'
          ],
          a: 0,
          x: '第二段对该术语立刻给出定义：Part of our attention stays behind, still busy with the message we have just seen（部分注意力仍停留在刚看过的信息上）。A 项为其同义转述。B 项"永久丧失专注能力"夸大；C 项混淆"恢复专注需 20 分钟"这一细节。'
        },
        {
          q: 'According to the passage, which kind of work is LEAST affected by interruptions?',
          o: [
            'Work that is simple and repetitive.',
            'Work that requires holding several ideas at once.',
            'Work that involves reading new material.',
            'Work that is done together with colleagues.'
          ],
          a: 0,
          x: '第三段明确：simple mechanical work barely suffers at all（简单的机械性工作几乎不受影响），A 项为同义替换。B 项恰恰是 suffer most 的对象；C、D 未提及。'
        },
        {
          q: 'What solution does the author recommend?',
          o: [
            'Training oneself to ignore the phone.',
            'Removing the source of interruption.',
            'Checking messages only during breaks of fifty minutes.',
            'Buying applications that block messages automatically.'
          ],
          a: 1,
          x: '末段提出：关通知、把手机放另一房间、按 40-50 分钟切块，其共同点是 remove the source of the problem（从源头消除干扰）；作者还明确说"训练自己去抵抗"式的意志力是 poor substitute，故 B 对 A 错。C 曲解"整块工作时长"；D 未提及。'
        },
        {
          q: "The author's attitude towards willpower as a solution is ______.",
          o: ['doubtful', 'enthusiastic', 'indifferent', 'grateful'],
          a: 0,
          x: '末句"Willpower is a poor substitute for a quiet desk"表明作者认为靠意志力并不靠谱，态度为"怀疑/不看好"，故选 doubtful。enthusiastic（热衷）、indifferent（漠然）、grateful（感激）均不符。'
        }
      ]
    },

    /* ---------------------------------------------------------------- 第 4 篇 */
    {
      id: 'r4',
      type: 'careful',
      tab: '仔细阅读',
      seq: 2,
      title: '仔细阅读（二）· 临期食品折扣店',
      sub: '社会热点 · 约 320 词 · 建议 9 分钟',
      minutes: 9,
      tip: '细节题回原文定位后，警惕"照抄原词"的干扰项——正确项多为同义替换；态度题找评价性形容词。',
      body: 'In the last three years a new kind of shop has appeared in many Chinese cities. It looks like an ordinary convenience store, but most items on its shelves carry bright yellow discount labels: milk two days from its sell-by date, bread baked yesterday, canned food whose packaging was slightly damaged in transport. Prices are typically 30 to 70 percent below those in a supermarket.\n\nThe business model rests on a simple inefficiency. Retailers throw away large amounts of food every year, not because it has gone bad but because it is approaching the printed date or because its packaging is no longer perfect. Manufacturers, meanwhile, often produce more than the market absorbs. Discount stores buy this stock cheaply and sell it fast to customers who care more about price than about a perfect box.\n\nNot everyone is persuaded. Shoppers\' biggest worry is safety, and regulators have been careful to insist that near-expiry food must still meet the same standards as any other product. Several chains now publish the test reports of every batch they receive. A second worry is that cheap food may simply move waste from the shop to the home: critics point out that buying more than one needs, simply because it is cheap, produces rubbish of exactly the kind the model claims to prevent.\n\nEvidence on the environmental benefit is still thin, but the social function is easy to see. For students, young workers and elderly people on modest pensions, these shops turn a limited budget into a fuller basket. And for the retailers who supply them, a product sold at half price is a product that is not written off entirely.',
      qs: [
        {
          q: 'Discount stores can sell food so cheaply mainly because ______.',
          o: [
            'the food they sell is of lower quality than that in supermarkets',
            'they buy stock that retailers and producers would otherwise discard',
            'the government gives them financial support',
            'their shops are smaller and their staff are unpaid'
          ],
          a: 1,
          x: '第二段核心：零售商因临近印刷日期或包装受损而丢弃大量食品，厂家也常生产过量，折扣店低价买入这批库存再快速卖出。B 项为同义概括。A 项与"not because it has gone bad"相悖；C、D 无中生有。'
        },
        {
          q: 'The word "inefficiency" (Para. 2) refers to ______.',
          o: [
            'the poor management of convenience stores',
            'the waste of food that is still perfectly usable',
            'the slow transport of canned food',
            'the low income of retail workers'
          ],
          a: 1,
          x: 'inefficiency 后紧跟解释：每年大量食品被丢弃，原因不是变质而是临近日期或包装不完美——即"仍可食用的食品被浪费"这一低效环节，故选 B。A、C、D 均未在文中出现。'
        },
        {
          q: 'What is the biggest concern of customers according to the passage?',
          o: [
            'Whether the food is safe.',
            'Whether the shops are legal.',
            'Whether the prices will rise.',
            'Whether the packaging is attractive.'
          ],
          a: 0,
          x: '第三段首句直接给出：Shoppers\' biggest worry is safety（顾客最大的担心是安全）。A 项为同义替换。B、C、D 均非文中所说的主要顾虑。'
        },
        {
          q: 'What criticism do some people make of the low-price model?',
          o: [
            'It forces supermarkets to close.',
            'It may only shift waste from shops to homes.',
            'It makes fresh food more expensive.',
            'It encourages shops to sell expired food.'
          ],
          a: 1,
          x: '第三段第二个担忧：cheap food may simply move waste from the shop to the home（便宜只是把浪费从商店转移到家里），因为买多了同样产生垃圾。B 项为原文同义转述。A、C 无中生有；D 与"必须符合同样标准""未过期"冲突。'
        },
        {
          q: "What is the author's view of the environmental benefit of these shops?",
          o: [
            'It has been proved by detailed research.',
            'It is far greater than their social value.',
            'The evidence for it is still limited.',
            'It is the main reason they were opened.'
          ],
          a: 2,
          x: '末段首句：Evidence on the environmental benefit is still thin（环保效益的证据仍然单薄），thin = limited，故选 C。A 与 thin 相反；B 颠倒——文中说社会效益 easy to see；D 未提及。'
        }
      ]
    }
  ];
})();
