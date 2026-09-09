/* 四级备考 占位模块内容（听力/阅读/写作/翻译/模考） */
window.MINI_BANK = window.MINI_BANK || {};
var CET = window.MINI_BANK;

CET['cet-listen'] = {
  t: '四级 · 听力要点', mode: 'quiz', d: '常考场景、设问与应试技巧',
  q: [
    { q: '短对话中，男士问 Could you give me a ride to the airport? 女士答 I wish I could, but my car is being repaired. 女士的言外之意是？', o: ['她很乐意送', '车坏了，无法送', '她也要去机场', '建议打车去'], a: 1, x: '关键词 repair(在修) 表明无法提供帮助，故选 B。' },
    { q: '新闻听力里，听到 death toll 最可能谈什么？', o: ['交通状况', '伤亡人数', '天气预警', '比赛结果'], a: 1, x: 'death toll = 死亡人数，多出现在事故/灾害报道。' },
    { q: '长对话做题时，最该优先抓哪类信息？', o: ['每句都要听懂', '人物身份+时间地点+目的', '只抓最后一句', '专有名词拼写'], a: 1, x: '长对话信息量大，先锁定 who/when/where/why 再听细节。' },
    { q: 'I’m afraid I can’t make it on time. 中 make it 的意思是？', o: ['制作它', '及时赶到/办到', '放弃', '批准'], a: 1, x: 'make it = 成功做到/及时赶到。' },
    { q: '听力前抢读选项，主要为了？', o: ['练口语', '预测话题与设问', '记生词', '数题目数量'], a: 1, x: '抢读选项能预测听什么、问什么，带着目的去听。' },
    { q: '说 It’s a deal. 表示？', o: ['成交/就这么定了', '出事了', '打折了', '抱歉'], a: 0, x: 'a deal 常用于达成一致：就这么定了。' },
    { q: '听到数字 1,500 用 fifteen hundred，可能考什么？', o: ['语法', '数字与单位辨析', '人名', '地点'], a: 1, x: '听力常设数字陷阱，须分辨 hundred/thousand 与时间、票价等。' },
    { q: 'Speaker: Sorry to interrupt, but… 表明说话人将？', o: ['道歉离开', '插话/打断', '结束对话', '表示感谢'], a: 1, x: 'I’m sorry to interrupt = 礼貌打断，接下来要插话。' },
    { q: '对话中 Good point, but… 结构常用来？', o: ['赞同后转折', '直接否定', '提新话题', '抱怨'], a: 0, x: '先肯定对方观点再提出异议，是常考语气转折。' },
    { q: '做题时间分配上，建议听完后何时涂卡？', o: ['每段听完立刻涂', '全部听完再统一涂', '边听边涂上一题', '不涂卡'], a: 2, x: '利用各题间隔涂上一题答案，避免手忙脚乱。' }
  ]
};

CET['cet-read'] = {
  t: '四级 · 阅读理解', mode: 'quiz',
  q: [
    { q: '定位题干关键词时，最先找哪种词？', o: ['冠词和介词', '数字/大写专有名词/特殊词', '所有形容词', '每段首句动词'], a: 1, x: '数字、专有名词等在原文几乎原样重现，最易定位。' },
    { q: '细节题的正确选项通常如何改写原文？', o: ['逐词照抄', '同义替换+同意转换', '删掉限定词', '扩大范围'], a: 1, x: '正确项多为同义替换，照抄原词常是干扰项。' },
    { q: '主旨题看哪里最有效？', o: ['只读末段', '首段+各段主题句', '只看标题选项', '随机一段'], a: 1, x: '首段引出主题，各段主题句支撑，综合判断主旨。' },
    { q: 'The passage implies that… 属于哪类题？', o: ['细节', '推理判断题', '词义猜测', '指代'], a: 1, x: 'imply/infer 都指向“读出来的潜台词”，不能照抄原文。' },
    { q: '词义猜测题里，破折号后内容常起什么作用？', o: ['引出反义', '给出解释说明', '表示转折', '无意义'], a: 1, x: '破折号、that is、namely 常引出对前词的直接解释。' },
    { q: '做选词填空(十五选十)第一步应？', o: ['逐词翻译选项', '给选项词标注词性', '先读末句', '猜每个空'], a: 1, x: '先按词性给选项分类，再按空格词性需求选择，速度快。' },
    { q: '段落匹配题阅读策略应？', o: ['逐段精读', '先题干划关键词再扫读', '先读首尾段即可', '凭感觉选'], a: 1, x: '匹配题用“关键词定位+同义替换”快速对应，不必精读。' },
    { q: 'Long-standing 最接近的含义是？', o: ['短暂的', '长期存在的', '临时的', '崭新的'], a: 1, x: 'long-standing = 长期存在的、由来已久的。' },
    { q: '作者用 however 转折后，观点重心通常在？', o: ['转折前', '转折后', '全文均衡', '段落开头'], a: 1, x: '转折词后的内容往往是作者真正想强调的部分。' },
    { q: '做主旨题时，含“绝对化”表述(如 only/never)的选项通常？', o: ['正确', '多为干扰项', '必然正确', '需优先选'], a: 1, x: '原文多用委婉限定，绝对化选项常被夸大，多为错项。' }
  ]
};

CET['cet-write'] = {
  t: '四级 · 写作模板', mode: 'quiz',
  q: [
    { q: '作文开篇给出观点，最规范的模板句是？', o: ['I very think it good.', 'From my perspective, the advantages of X outweigh its drawbacks.', 'X is good and bad.', 'As we all know many.'], a: 1, x: 'From my perspective 引出个人立场，结构正式。' },
    { q: '列举论据时，下面哪句衔接最自然？', o: ['First, … Moreover, … In addition, …', 'And and and …', 'X so Y because.', 'Now next other.'], a: 0, x: 'First/Moreover/In addition 是清晰的递进衔接词。' },
    { q: '举例支撑时更地道的表达是？', o: ['For example, taking the case of…', 'Like example is …', 'One for example X.', 'Such that is.'], a: 0, x: 'For example + taking the case of 是常见的举例句式。' },
    { q: '结尾重申观点的经典句式是？', o: ['In conclusion, I am convinced that…', 'Finish, I think.', 'End, so good.', 'Bye, my idea is yes.'], a: 0, x: 'In conclusion + be convinced that 收束全文较正式。' },
    { q: '写优缺点类作文，第二段通常用来？', o: ['重复开头', '分点论述优/缺点', '只写优点', '讲笑话'], a: 1, x: '主体段分点展开论证，是四六级作文常见结构。' },
    { q: '想要“更正式”，下面哪种表达最好？', o: ['Things are getting important.', 'It is widely acknowledged that…', 'People now think it is good.', 'We all must know.'], a: 1, x: 'It is widely acknowledged that… 被动结构更书面化。' },
    { q: '论述个人生活例子时合适的句子？', o: ['My life is full of such experience that…', 'Me example yes.', 'I am example.', 'Life X me.'], a: 0, x: '以自身经历举例用 such experience that… 更连贯。' },
    { q: '字数紧张时，最不该做的是？', o: ['删掉一个例子但仍保留观点', '直接截断句子', '写废话凑字', '重复标题'], a: 1, x: '宁可略减细节，也要保证句子完整、结构收尾。' }
  ]
};

CET['cet-translate'] = {
  t: '四级 · 汉译英', mode: 'quiz',
  q: [
    { q: '“越来越多的人选择线上学习。” 最佳译法是？', o: ['More and more people choose study online.', 'An increasing number of people choose online learning.', 'People more choose learn by internet.', 'More people learning on line.'], a: 1, x: 'An increasing number of 比 more and more 更书面，online learning 作宾语。' },
    { q: '“这座桥建于宋朝。” 用被动最正确的是？', o: ['This bridge built in Song Dynasty.', 'This bridge was built in the Song Dynasty.', 'Built bridge Song.', 'The bridge is build by Song.'], a: 1, x: '过去被动 be+done，Dynasty 前加 the。' },
    { q: '“随着经济的发展” 常见对应是？', o: ['with the development of economy', 'with economy developing very much', 'because economy', 'after the economy go'], a: 0, x: 'with the development of … 是典型译法。' },
    { q: '“值得我们重视” 地道译法是？', o: ['worth our attention', 'deserve to be paid attention to', 'we should very care it', 'need our look'], a: 1, x: 'deserve (to be) done / deserve attention 表示“值得”。' },
    { q: '“由此可见” 最常用？', o: ['Therefore, it can be seen that…', 'So can see.', 'Look at this.', 'It is can see.'], a: 0, x: 'Therefore / Thus, it can be seen that… 表总结。' },
    { q: '“不但…而且…” 正式译法是？', o: ['not only … but also …', 'not only … and …', 'both and also', 'also but'], a: 0, x: 'not only … but also … 为并列强调结构。' },
    { q: '“传统文化” 正确译名？', o: ['traditional culture', 'culture of before', 'old custom culture', 'tradition culture'], a: 0, x: 'traditional culture 是标准表达。' },
    { q: '“被广泛认为” 的被动式？', o: ['is widely considered to be', 'is wide think', 'considered widely it', 'to be think'], a: 0, x: 'be widely considered to be + 表语。' },
    { q: '“为解决这一问题” 的从句起点是？', o: ['In order to solve this problem', 'For solve the question', 'Solving this to', 'Because problem'], a: 0, x: 'In order to / To solve this problem … 表目的。' },
    { q: '“对……有重大影响” 常用？', o: ['have a significant impact on…', 'make big affect for', 'influence to', 'impact with'], a: 0, x: 'have an impact/influence on … 是固定搭配。' }
  ]
};

CET['cet-mock'] = {
  t: '四级 · 试卷结构与时间分配', mode: 'info',
  items: [
    { icon: '🎧', title: '写作与听力(约55分钟)', body: '先写作30分钟(120-180词)，随后立即播放听力约25分钟。听力边听边做，不设单独涂卡时间，抓紧段落间隙。' },
    { icon: '📖', title: '阅读(40分钟)', body: '选词填空、长篇匹配、仔细阅读三类。建议顺序：仔细阅读→长篇匹配→选词填空(分值低耗时高，放最后)。' },
    { icon: '🌐', title: '翻译(30分钟)', body: '汉译英约180词，先通读划主干，再逐句翻译；宁可句子简单正确，也不要硬拼长难句出错。' },
    { icon: '🎯', title: '分数分布速记', body: '听力35%、阅读35%(仔细阅读占大头)、写作与翻译各15%。阅读和听力是拿分主战场。' },
    { icon: '💡', title: '临场策略', body: '听力听不懂跳过别恋战；阅读每篇控制在8-10分钟；翻译不确定的词用上义词替代，别空题。' }
  ]
};
