/* data/mock-papers.js — P0-B T03-01
 * -------------------------------------------------------------------
 * 真题模考引擎 · 数据契约（PRD §4.3.4 + 架构 §3.2）
 * 挂到 window.MOCK_PAPERS_DATA；走 IIFE + 防重复注入；不 fetch JSON
 *
 * 顶层 keys: cet4（四级）、exam（央国企）
 * 7 套卷（cet4 × 4 + exam × 3），覆盖 9 题型：
 *   single_choice / multiple_choice / true_false / reading / cloze /
 *   essay / translation / listening / fill_blank
 *
 * 至少 2 套 source="来源待核" + year=null（P1 阶段人工校对）
 * -------------------------------------------------------------------
 */
(function () {
  'use strict';
  if (window.MOCK_PAPERS_DATA) return; // 防重复注入

  // ====================================================================
  // CET4 · 四级真题模考（4 套卷）
  // ====================================================================
  var cet4 = {
    title: '四级 · 真题模考',
    defaultMinutes: 125,
    stages: ['writing', 'listening', 'reading', 'translation'],
    papers: [
      // —— cet-demo-1 · 体验卷 ——
      {
        id: 'cet-demo-1',
        title: '四级体验卷',
        year: 2024,
        source: '公开样题',
        difficulty: '易',
        minutes: 15,
        questions: [
          {
            id: 'cet-demo-1-q1',
            type: 'listening',
            stage: 'listening',
            q: '【P1 阶段填入真题音频】本题为听力占位。请选出与所听到内容一致的选项。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: '【P1 阶段填入真题音频】本题为听力占位题，正式上线时附带真题音频与解析。',
            audioUrl: null,
            scored: true
          },
          {
            id: 'cet-demo-1-q2',
            type: 'listening',
            stage: 'listening',
            q: '【P1 阶段填入真题音频】本题为听力占位。问：对话中男士想做什么？',
            o: ['A. 借书', 'B. 还书', 'C. 买书', 'D. 卖书'],
            a: 1,
            x: '【P1 阶段填入真题音频】本题为听力占位题。',
            audioUrl: null,
            scored: true
          },
          {
            id: 'cet-demo-1-q3',
            type: 'single_choice',
            stage: 'reading',
            q: '阅读理解：The Internet has dramatically changed the way people ______ information.\n请选出最佳填空。',
            o: ['A. exchange', 'B. play', 'C. eat', 'D. sleep'],
            a: 0,
            x: 'exchange information 是固定搭配，意为「交流信息」。其他选项语义不符。',
            scored: true
          },
          {
            id: 'cet-demo-1-q4',
            type: 'single_choice',
            stage: 'reading',
            q: '阅读理解：Which of the following best describes the author\'s attitude towards social media?\n请选出最佳选项。',
            o: ['A. Strongly supportive', 'B. Mildly cautious', 'C. Completely opposed', 'D. Indifferent'],
            a: 1,
            x: '作者既肯定其便利也担忧其影响，态度为「适度谨慎」。',
            scored: true
          },
          {
            id: 'cet-demo-1-q5',
            type: 'translation',
            stage: 'translation',
            q: '请将下列中文翻译为英文。',
            cn: '随着人工智能的发展，越来越多的人开始关注其对社会的影响。',
            minWords: 80,
            referenceAnswer: 'With / As the development of artificial intelligence, an increasing number of people begin to pay attention to its impact on society.',
            scored: false
          },
          {
            id: 'cet-demo-1-q6',
            type: 'essay',
            stage: 'writing',
            q: '请围绕「人工智能与教育」写一篇 120-180 词的短文。',
            minWords: 120,
            referenceAnswer: '提纲：①引出 AI 在教育中的普及；②列举应用场景（智能辅导 / 个性化学习 / 批改辅助）；③讨论潜在风险（隐私、依赖）；④总结展望。',
            scored: false
          },
          // —— cloze 新题型示例 ——
          {
            id: 'cet-demo-1-q7',
            type: 'cloze',
            stage: 'reading',
            q: '完形填空：根据文章内容，从下拉选项中选出最佳答案填入编号空格。',
            passage: 'In recent years, online learning has become increasingly popular. {{1}} allows students to learn at their own pace and access a wide range of {{2}}. However, some people argue that it lacks the {{3}} interaction found in traditional classrooms.',
            blanks: [
              {
                index: 1,
                blankType: 'select',
                options: ['A. This', 'B. That', 'C. It', 'D. Such'],
                answer: 2,
                explanation: '主语指代前句整体（线上学习这件事），用 It 指代前面整句最自然。'
              },
              {
                index: 2,
                blankType: 'select',
                options: ['A. subjects', 'B. resources', 'C. reasons', 'D. results'],
                answer: 1,
                explanation: 'resources 意为「资源」，与 online learning 搭配最合理；subjects 指学科，reasons/reasons 语义不符。'
              },
              {
                index: 3,
                blankType: 'select',
                options: ['A. face-to-face', 'B. side-by-side', 'C. one-on-one', 'D. hand-to-hand'],
                answer: 0,
                explanation: 'face-to-face「面对面的」形容课堂互动最准确；其他选项与课堂场景不搭。'
              }
            ],
            scored: true
          }
        ]
      },

      // —— cet-real-a · 真题卷 A（来源待核）——
      {
        id: 'cet-real-a',
        title: '四级真题卷 A',
        year: null,
        source: '来源待核',
        difficulty: '中',
        minutes: 15,
        questions: [
          {
            id: 'cet-real-a-q1',
            type: 'listening',
            stage: 'listening',
            q: '【P1 阶段填入真题音频】本题为听力占位。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: '【P1 阶段填入真题音频】',
            audioUrl: null,
            scored: true
          },
          {
            id: 'cet-real-a-q2',
            type: 'listening',
            stage: 'listening',
            q: '【P1 阶段填入真题音频】本题为听力占位。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: '【P1 阶段填入真题音频】',
            audioUrl: null,
            scored: true
          },
          {
            id: 'cet-real-a-q3',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】阅读理解题占位 1。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'cet-real-a-q4',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】阅读理解题占位 2。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'cet-real-a-q5',
            type: 'translation',
            stage: 'translation',
            q: '【P1 阶段填入真题】翻译占位。',
            cn: '占位中文：随着科技发展，远程教育已经成为一种重要的学习方式。',
            minWords: 80,
            referenceAnswer: null,
            scored: false
          },
          {
            id: 'cet-real-a-q6',
            type: 'essay',
            stage: 'writing',
            q: '【写作提纲，不计分】真题写作占位。',
            minWords: 120,
            referenceAnswer: null,
            scored: false
          },
          // —— multiple_choice 新题型示例 ——
          {
            id: 'cet-real-a-q7',
            type: 'multiple_choice',
            stage: 'reading',
            q: '多项选择：下列关于「学习策略」的说法中，哪些是正确的？（多选）',
            o: ['A. 分散练习比集中练习更有效', 'B. 间隔重复有助于长期记忆', 'C. 只靠考前突击即可', 'D. 主动回忆比被动重读更高效'],
            a: [0, 1, 3],
            x: 'C「只靠考前突击即可」是常见误区；A、B、D 均为认知科学验证的高效学习策略。',
            scored: true
          },
          // —— true_false 新题型示例 ——
          {
            id: 'cet-real-a-q8',
            type: 'true_false',
            stage: 'reading',
            q: '判断题：「multitasking（多任务并行）」能显著提高学习效率。',
            o: ['正确', '错误'],
            a: 1,
            x: '研究表明频繁切换任务会降低效率、加深错误记忆；单任务专注才是高效学习的关键。',
            scored: true
          }
        ]
      },

      // —— cet-real-b · 真题卷 B（来源待核）——
      {
        id: 'cet-real-b',
        title: '四级真题卷 B',
        year: null,
        source: '来源待核',
        difficulty: '中',
        minutes: 15,
        questions: [
          {
            id: 'cet-real-b-q1',
            type: 'listening',
            stage: 'listening',
            q: '【P1 阶段填入真题音频】本题为听力占位。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: '【P1 阶段填入真题音频】',
            audioUrl: null,
            scored: true
          },
          {
            id: 'cet-real-b-q2',
            type: 'listening',
            stage: 'listening',
            q: '【P1 阶段填入真题音频】本题为听力占位。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: '【P1 阶段填入真题音频】',
            audioUrl: null,
            scored: true
          },
          {
            id: 'cet-real-b-q3',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】阅读理解题占位 1。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'cet-real-b-q4',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】阅读理解题占位 2。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'cet-real-b-q5',
            type: 'translation',
            stage: 'translation',
            q: '【P1 阶段填入真题】翻译占位。',
            cn: '占位中文：文化多样性是社会创新的重要源泉。',
            minWords: 80,
            referenceAnswer: null,
            scored: false
          },
          {
            id: 'cet-real-b-q6',
            type: 'essay',
            stage: 'writing',
            q: '【写作提纲，不计分】真题写作占位。',
            minWords: 120,
            referenceAnswer: null,
            scored: false
          }
        ]
      },

      // —— cet-real-c · 真题卷 C ——
      {
        id: 'cet-real-c',
        title: '四级真题卷 C',
        year: 2023,
        source: '公开样题',
        difficulty: '中',
        minutes: 15,
        questions: [
          {
            id: 'cet-real-c-q1',
            type: 'listening',
            stage: 'listening',
            q: '【P1 阶段填入真题音频】本题为听力占位。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: '【P1 阶段填入真题音频】',
            audioUrl: null,
            scored: true
          },
          {
            id: 'cet-real-c-q2',
            type: 'listening',
            stage: 'listening',
            q: '【P1 阶段填入真题音频】本题为听力占位。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: '【P1 阶段填入真题音频】',
            audioUrl: null,
            scored: true
          },
          {
            id: 'cet-real-c-q3',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】阅读理解题占位 1。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'cet-real-c-q4',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】阅读理解题占位 2。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'cet-real-c-q5',
            type: 'translation',
            stage: 'translation',
            q: '【P1 阶段填入真题】翻译占位。',
            cn: '占位中文：大学毕业生应具备终身学习的能力。',
            minWords: 80,
            referenceAnswer: null,
            scored: false
          },
          {
            id: 'cet-real-c-q6',
            type: 'essay',
            stage: 'writing',
            q: '【写作提纲，不计分】真题写作占位。',
            minWords: 120,
            referenceAnswer: null,
            scored: false
          },
          // —— reading 新题型示例（passage + subQ）——
          {
            id: 'cet-real-c-q7',
            type: 'reading',
            stage: 'reading',
            q: '阅读理解：阅读下面文章，回答 3 个小题（每个小题独立作答）。',
            passage: 'The concept of "lifelong learning" has gained increasing attention in recent decades. In a rapidly changing world where technology evolves at breakneck speed, the skills acquired in formal education may become obsolete within a few years. Lifelong learning advocates argue that individuals must continuously update their knowledge and capabilities to remain relevant in the workforce and to contribute meaningfully to society.\n\nGovernments and international organizations have also recognized the importance of lifelong learning. The European Union, for instance, has set a target that 15% of adults should participate in learning activities each year. Similarly, many countries have established policies to support adult education, including subsidies for training programs and flexible working arrangements that allow employees to pursue further studies.\n\nHowever, critics point out that the burden of lifelong learning often falls disproportionately on individuals, particularly those from lower-income backgrounds who may lack the time, resources, or institutional support to engage in continuous learning. Without structural changes, lifelong learning risks becoming a privilege rather than a right.',
            subQ: [
              {
                id: 'cet-real-c-q7-1',
                type: 'single_choice',
                stage: 'reading',
                q: '小题 1：根据文章，「lifelong learning」概念受到关注的主要原因是？',
                o: ['A. 教育经费增加', 'B. 技术快速迭代导致原有技能过时', 'C. 大学招生规模扩大', 'D. 退休年龄推迟'],
                a: 1,
                x: '原文「technology evolves at breakneck speed」+「skills acquired in formal education may become obsolete」直接对应 B。',
                scored: true
              },
              {
                id: 'cet-real-c-q7-2',
                type: 'single_choice',
                stage: 'reading',
                q: '小题 2：欧盟为「lifelong learning」设定的具体目标是？',
                o: ['A. 每年 15% 的成年人参与学习活动', 'B. 每年 25% 的成年人完成学位', 'C. 每年 50% 的企业开展培训', 'D. 每年提供 100 万份奖学金'],
                a: 0,
                x: '原文「the European Union … 15% of adults should participate in learning activities each year」直接引用。',
                scored: true
              },
              {
                id: 'cet-real-c-q7-3',
                type: 'true_false',
                stage: 'reading',
                q: '小题 3：判断：作者认为「lifelong learning」可能成为少数人的特权。',
                o: ['正确', '错误'],
                a: 0,
                x: '末段「lifelong learning risks becoming a privilege rather than a right」直接支持此判断。',
                scored: true
              }
            ],
            scored: true
          },
          // —— fill_blank 新题型示例（mixed text/select）——
          {
            id: 'cet-real-c-q8',
            type: 'fill_blank',
            stage: 'reading',
            q: '填空题：阅读短文并填写空格。{{i}} 表示填空位置。',
            passage: 'In {{1}} AD, the city of {{2}} became the capital of the {{3}} Empire, marking a major shift in the political center of the ancient world.',
            blanks: [
              {
                index: 1,
                blankType: 'text',
                answer: '330',
                explanation: '公元 330 年，罗马皇帝君士坦丁一世迁都拜占庭（后改名君士坦丁堡）。'
              },
              {
                index: 2,
                blankType: 'select',
                options: ['A. Rome', 'B. Constantinople', 'C. Athens', 'D. Alexandria'],
                answer: 1,
                explanation: '迁都的城市为君士坦丁堡（Byzantium 改名），即 Constantinople。'
              },
              {
                index: 3,
                blankType: 'select',
                options: ['A. Greek', 'B. Roman', 'C. Ottoman', 'D. Persian'],
                answer: 1,
                explanation: '迁都后拜占庭即东罗马帝国，名为 Roman Empire。'
              }
            ],
            scored: true
          }
        ]
      }
    ]
  };

  // ====================================================================
  // EXAM · 央国企真题模考（3 套卷）
  // ====================================================================
  var exam = {
    title: '央国企 · 真题模考',
    defaultMinutes: 120,
    stages: ['writing', 'listening', 'reading', 'translation'],
    papers: [
      // —— exam-comp-a · 综合卷 A ——
      {
        id: 'exam-comp-a',
        title: '央国企综合卷 A',
        year: 2024,
        source: '公开样题',
        difficulty: '中',
        minutes: 15,
        questions: [
          {
            id: 'exam-comp-a-q1',
            type: 'single_choice',
            stage: 'reading',
            q: '【言语理解】下列词语没有错别字的一组是：',
            o: ['A. 再接再厉', 'B. 穿流不息', 'C. 按步就班', 'D. 一愁莫展'],
            a: 0,
            x: 'A 正确；B 应为「川流不息」；C 应为「按部就班」；D 应为「一筹莫展」。',
            scored: true
          },
          {
            id: 'exam-comp-a-q2',
            type: 'single_choice',
            stage: 'reading',
            q: '【言语理解】填入横线最恰当的一项是：他表面上不动声色，______ 早已心急如焚。',
            o: ['A. 其实', 'B. 因此', 'C. 不过', 'D. 然而'],
            a: 0,
            x: '前后转折关系 +「其实」表实际状况，符合语境。',
            scored: true
          },
          {
            id: 'exam-comp-a-q3',
            type: 'single_choice',
            stage: 'reading',
            q: '【数量关系】一项工程，甲单独做 10 天，乙单独做 15 天。两人合作需多少天？',
            o: ['A. 5 天', 'B. 6 天', 'C. 7 天', 'D. 8 天'],
            a: 1,
            x: '合作效率 = 1/10 + 1/15 = 1/6，时间 = 6 天。',
            scored: true
          },
          {
            id: 'exam-comp-a-q4',
            type: 'single_choice',
            stage: 'reading',
            q: '【判断推理】定义判断：循环经济是指在生产、流通和消费等过程中进行的资源循环利用的活动。下列属于循环经济的是：',
            o: ['A. 工厂将废水净化后循环使用', 'B. 农民将秸秆直接焚烧', 'C. 超市对过期食品直接销毁', 'D. 居民将生活垃圾混合丢弃'],
            a: 0,
            x: '循环经济强调资源循环利用，A 符合定义。',
            scored: true
          },
          {
            id: 'exam-comp-a-q5',
            type: 'single_choice',
            stage: 'reading',
            q: '【资料分析】某市 2024 年 GDP 为 8000 亿，同比增长 10%。问 2023 年 GDP 约为多少？',
            o: ['A. 7000 亿', 'B. 7200 亿', 'C. 7273 亿', 'D. 8800 亿'],
            a: 2,
            x: '基期 = 现期 ÷ (1 + r) = 8000 ÷ 1.1 ≈ 7273 亿。',
            scored: true
          },
          {
            id: 'exam-comp-a-q6',
            type: 'fill_blank',
            stage: 'reading',
            q: '填空题：根据资料填写数字。',
            passage: '2024 年某公司营业收入为 {{1}} 亿元，较上年增长 {{2}}%，净利润为 350 亿元。',
            blanks: [
              {
                index: 1,
                blankType: 'text',
                answer: '5000',
                explanation: '营业收入 5000 亿元（题目假定）。'
              },
              {
                index: 2,
                blankType: 'select',
                options: ['A. 8%', 'B. 10%', 'C. 12%', 'D. 15%'],
                answer: 2,
                explanation: '同比增长 12%（题目假定）。'
              }
            ],
            scored: true
          }
        ]
      },

      // —— exam-comp-b · 综合卷 B（含公基占位）——
      {
        id: 'exam-comp-b',
        title: '央国企综合卷 B',
        year: 2023,
        source: '公开样题',
        difficulty: '中',
        minutes: 15,
        questions: [
          {
            id: 'exam-comp-b-q1',
            type: 'single_choice',
            stage: 'reading',
            q: '【言语理解】下列句子没有语病的一项是：',
            o: ['A. 通过这次学习，使我收获很大', 'B. 他不但学习好，而且思想也好', 'C. 大约过了二十天左右', 'D. 大家都说今天来的都是好同志'],
            a: 1,
            x: 'A 缺少主语；C「大约」「左右」重复；D 表意不明。B 正确。',
            scored: true
          },
          {
            id: 'exam-comp-b-q2',
            type: 'single_choice',
            stage: 'reading',
            q: '【数量关系】某商品定价 200 元，先打 8 折再打 9 折，最终售价为：',
            o: ['A. 144 元', 'B. 160 元', 'C. 180 元', 'D. 200 元'],
            a: 0,
            x: '200 × 0.8 × 0.9 = 144 元。',
            scored: true
          },
          {
            id: 'exam-comp-b-q3',
            type: 'single_choice',
            stage: 'reading',
            q: '【判断推理】图形推理：题干给出三个图形，每个图形依次增加一个相同元素，问号处应是：',
            o: ['A. 含 3 个元素', 'B. 含 4 个元素', 'C. 含 5 个元素', 'D. 含 6 个元素'],
            a: 1,
            x: '依次递增，问号处应为第 4 个，含 4 个元素。',
            scored: true
          },
          {
            id: 'exam-comp-b-q4',
            type: 'single_choice',
            stage: 'reading',
            q: '【公基占位】P1 阶段填入真题公基题。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题公基题。',
            scored: true
          },
          {
            id: 'exam-comp-b-q5',
            type: 'single_choice',
            stage: 'reading',
            q: '【资料分析】2024 年某省常住人口 6500 万，较上年增加 50 万，同比增长率为：',
            o: ['A. 0.77%', 'B. 0.78%', 'C. 0.81%', 'D. 1.0%'],
            a: 0,
            x: '增长率 = 50 / (6500 - 50) = 50 / 6450 ≈ 0.77%。',
            scored: true
          },
          {
            id: 'exam-comp-b-q6',
            type: 'multiple_choice',
            stage: 'reading',
            q: '多项选择：下列属于「数量关系」常见题型的是？（多选）',
            o: ['A. 工程问题', 'B. 行程问题', 'C. 利润问题', 'D. 主旨概括'],
            a: [0, 1, 2],
            x: '工程、行程、利润均属数量关系；D「主旨概括」属言语理解。',
            scored: true
          }
        ]
      },

      // —— exam-real-1 · 真题卷（容器）——
      {
        id: 'exam-real-1',
        title: '央国企真题卷（容器）',
        year: null,
        source: '来源待核',
        difficulty: '难',
        minutes: 15,
        questions: [
          {
            id: 'exam-real-1-q1',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】言语题占位 1。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'exam-real-1-q2',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】数量题占位 1。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'exam-real-1-q3',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】判断题占位 1。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'exam-real-1-q4',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】资料题占位 1。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'exam-real-1-q5',
            type: 'single_choice',
            stage: 'reading',
            q: '【P1 阶段填入真题】公基占位 1。',
            o: ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'],
            a: 0,
            x: 'P1 阶段填入真题',
            scored: true
          },
          {
            id: 'exam-real-1-q6',
            type: 'essay',
            stage: 'writing',
            q: '【写作题，不计分】请就「青年人在央国企如何实现个人成长」写一篇 300 字短文。',
            minWords: 200,
            referenceAnswer: '提纲：①立足岗位、扎实学习业务；②主动承担项目、锻炼综合能力；③融入企业文化、与团队共同成长；④长期主义与价值创造。',
            scored: false
          },
          // —— cloze 在 exam 真题卷中也给 1 个示例 —
          {
            id: 'exam-real-1-q7',
            type: 'cloze',
            stage: 'reading',
            q: '完形填空：根据文章内容，从下拉选项中选出最佳答案填入编号空格。',
            passage: 'Public sector enterprises play a {{1}} role in national economic development. They not only provide essential {{2}} but also create large numbers of {{3}} opportunities.',
            blanks: [
              {
                index: 1,
                blankType: 'select',
                options: ['A. minor', 'B. vital', 'C. invisible', 'D. optional'],
                answer: 1,
                explanation: 'vital「至关重要的」修饰 role 最贴切；minor / optional 偏负面，invisible 不合语境。'
              },
              {
                index: 2,
                blankType: 'select',
                options: ['A. goods and services', 'B. profits only', 'C. entertainments', 'D. risks'],
                answer: 0,
                explanation: '公共服务部门提供「商品和服务」最合理。'
              },
              {
                index: 3,
                blankType: 'select',
                options: ['A. entertainment', 'B. tax', 'C. employment', 'D. travel'],
                answer: 2,
                explanation: 'employment「就业」与句意一致。'
              }
            ],
            scored: true
          }
        ]
      }
    ]
  };

  // ====================================================================
  // 暴露到 window
  // ====================================================================
  window.MOCK_PAPERS_DATA = {
    cet4: cet4,
    exam: exam
  };

  // 同步暴露 URL ?cat= 的别名映射（mock_exam.html 直接用 cat 字符串）
  // cet-mock -> cet4, exam-mock -> exam
  window.MOCK_CAT_ALIAS = {
    'cet-mock': 'cet4',
    'exam-mock': 'exam'
  };
})();