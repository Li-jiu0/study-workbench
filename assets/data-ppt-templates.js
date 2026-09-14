/* =====================================================================
   data-ppt-templates.js · A7「PPT · 实战模板库」富结构数据（v2）
   批次：2026-09-14 / R48「做真内容」/ 版本戳 20260914e
   ---------------------------------------------------------------------
   架构约定（ADR-1 数据外置 + 后置覆盖）：
     · 本文件在 assets/mini-ppt.js **之后**加载，用新结构覆盖同名 key
       PPT['ppt-templates']；mini-ppt.js 原有 5 条文字数据一行不删、不动。
     · 旧 5 条文案的去向（保证零删除）：
         旧①通用版式模板套件 → items[0].summary
         旧②商务汇报风       → items[1].summary
         旧③教育培训风       → items[2].summary
         旧④数据分析风       → items[3].summary
         旧⑤使用建议         → guide.body + guide.steps
     · mode 使用 'gallery'（自研渲染器识别用）；mini.js 遇到非 'info' 的
       mode 不会渲染，因此旧路径不会出现半截内容。
     · 不调用 saveData()；进度键由渲染器前缀化为 xtc:ppt:tpl:<id>:*
     · 全部原创：版式、文案、骨架均由本文件自撰，未搬运任何商业模板。
     · 渲染器：assets/tpl-preview.js（注册 window.PPTV2['ppt-templates']）
   ===================================================================== */
(function () {
  'use strict';

  window.MINI_BANK = window.MINI_BANK || {};
  var PPT = window.MINI_BANK;

  /* ---------- 各模板的 HTML 骨架字符串（仅 div/span/h3/p/ul/li 白名单标签） ---------- */

  var SK_GENERAL =
    '<div class="slide slide-cover">' +
      '<h3 class="s-title">主标题</h3>' +
      '<p class="s-sub">副标题 / 部门 / 姓名 / 日期</p>' +
    '</div>' +
    '<div class="slide slide-toc">' +
      '<h3 class="s-h">目录</h3>' +
      '<ul class="s-list"><li>一、全年回顾</li><li>二、重点项目</li><li>三、问题复盘</li></ul>' +
    '</div>' +
    '<div class="slide slide-section">' +
      '<span class="s-num">01</span>' +
      '<h3 class="s-h">章节名</h3>' +
    '</div>' +
    '<div class="slide slide-2col">' +
      '<h3 class="s-h">核心结论</h3>' +
      '<div class="col-l"><p>左栏：结论要点</p></div>' +
      '<div class="col-r"><p>右栏：依据说明</p></div>' +
    '</div>' +
    '<div class="slide slide-3col">' +
      '<div class="col"><h3 class="s-h">要点一</h3><p>两行说明</p></div>' +
      '<div class="col"><h3 class="s-h">要点二</h3><p>两行说明</p></div>' +
      '<div class="col"><h3 class="s-h">要点三</h3><p>两行说明</p></div>' +
    '</div>' +
    '<div class="slide slide-kpi">' +
      '<h3 class="s-h">关键数据</h3>' +
      '<div class="kpi-row"><span class="kpi-v">112%</span><span class="kpi-k">目标达成</span></div>' +
      '<p class="s-note">结论：一句话说清数据含义</p>' +
    '</div>' +
    '<div class="slide slide-end">' +
      '<h3 class="s-title">谢谢</h3>' +
      '<p class="s-sub">欢迎提问与建议</p>' +
    '</div>';

  var SK_BIZ =
    '<div class="slide slide-cover biz">' +
      '<h3 class="s-title">2026 年度经营汇报</h3>' +
      '<p class="s-sub">战略发展部 / 2027 年 1 月</p>' +
    '</div>' +
    '<div class="slide slide-toc biz">' +
      '<h3 class="s-h">目录</h3>' +
      '<ul class="s-list"><li>01 经营总览</li><li>02 业务拆解</li><li>03 风险与对策</li><li>04 明年目标</li></ul>' +
    '</div>' +
    '<div class="slide slide-2col biz">' +
      '<h3 class="s-h">结论先行：利润增长快于规模</h3>' +
      '<div class="col-l"><p>左栏：判断 / 结论</p></div>' +
      '<div class="col-r"><p>右栏：数据 / 依据</p></div>' +
    '</div>' +
    '<div class="slide slide-kpi biz">' +
      '<h3 class="s-h">关键指标</h3>' +
      '<div class="kpi-row"><span class="kpi-v">+15%</span><span class="kpi-k">利润同比</span></div>' +
      '<div class="kpi-row"><span class="kpi-v">41%</span><span class="kpi-k">高毛利占比</span></div>' +
    '</div>' +
    '<div class="slide slide-end biz">' +
      '<h3 class="s-title">谢谢</h3>' +
      '<p class="s-sub">敬请指正</p>' +
    '</div>';

  var SK_EDU =
    '<div class="slide slide-cover edu">' +
      '<span class="s-badge">第 3 讲</span>' +
      '<h3 class="s-title">如何做一页好 PPT</h3>' +
      '<p class="s-sub">星途内训 / 讲师：李老师</p>' +
    '</div>' +
    '<div class="slide slide-toc edu">' +
      '<h3 class="s-h">本节目录</h3>' +
      '<ul class="s-list"><li>一、版面四原则</li><li>二、配色三色法</li><li>三、字体两族法</li></ul>' +
    '</div>' +
    '<div class="slide slide-point edu">' +
      '<h3 class="s-h">本节要点</h3>' +
      '<div class="point-card"><p>对齐决定专业感，对比决定主次</p></div>' +
      '<ul class="s-list"><li>左：先对齐，再配色</li><li>右：先主次，再装饰</li></ul>' +
    '</div>' +
    '<div class="slide slide-ex edu">' +
      '<h3 class="s-h">随堂练习</h3>' +
      '<div class="col-l"><p>题目：找出这页的三处问题</p></div>' +
      '<div class="col-r"><p>作答区（留白 / 手写 / 口答）</p></div>' +
    '</div>' +
    '<div class="slide slide-end edu">' +
      '<h3 class="s-title">本节小结</h3>' +
      '<p class="s-sub">课后任务：改一页自己的 PPT</p>' +
    '</div>';

  var SK_DATA =
    '<div class="slide slide-cover data">' +
      '<h3 class="s-title">2026 H1 经营数据分析</h3>' +
      '<p class="s-sub">数据口径：集团合并 / 截至 6 月 30 日</p>' +
    '</div>' +
    '<div class="slide slide-concl data">' +
      '<p class="s-lead">结论：华东区增速领先全国 12 个百分点</p>' +
    '</div>' +
    '<div class="slide slide-kpi data">' +
      '<h3 class="s-h">核心指标</h3>' +
      '<div class="kpi-row"><span class="kpi-v">+24%</span><span class="kpi-k">华东增速</span></div>' +
      '<div class="kpi-row"><span class="kpi-v">+12%</span><span class="kpi-k">全国增速</span></div>' +
      '<div class="kpi-row"><span class="kpi-v">8.6k</span><span class="kpi-k">样本量</span></div>' +
    '</div>' +
    '<div class="slide slide-2col data">' +
      '<h3 class="s-h">归因与对策</h3>' +
      '<div class="col-l"><p>左：原因（新渠道 + 客单价）</p></div>' +
      '<div class="col-r"><p>右：对策（复制打法至华中华南）</p></div>' +
    '</div>' +
    '<div class="slide slide-end data">' +
      '<h3 class="s-title">下一步行动</h3>' +
      '<ul class="s-list"><li>责任人</li><li>时间节点</li><li>验收口径</li></ul>' +
    '</div>';

  var SK_PROPOSAL =
    '<div class="slide slide-cover pro">' +
      '<h3 class="s-title">智能客服升级项目</h3>' +
      '<p class="s-sub">一句话主张：为谁解决什么问题</p>' +
      '<p class="s-note">数字化中心 / 2026 年 9 月</p>' +
    '</div>' +
    '<div class="slide slide-pain pro">' +
      '<h3 class="s-h">现状与痛点</h3>' +
      '<ul class="s-list"><li>痛点一：人工工单量大</li><li>痛点二：首答准确率低</li><li>痛点三：知识库分散</li></ul>' +
    '</div>' +
    '<div class="slide slide-2col pro">' +
      '<h3 class="s-h">方案：分两期实施</h3>' +
      '<div class="col-l"><p>一期（3 个月）：工单自动分派</p></div>' +
      '<div class="col-r"><p>二期（5 个月）：知识库自助答疑</p></div>' +
    '</div>' +
    '<div class="slide slide-kpi pro">' +
      '<h3 class="s-h">投入与产出</h3>' +
      '<div class="kpi-row"><span class="kpi-v">-38%</span><span class="kpi-k">人工工单量</span></div>' +
      '<div class="kpi-row"><span class="kpi-v">6 个月</span><span class="kpi-k">回本周期</span></div>' +
    '</div>' +
    '<div class="slide slide-end pro">' +
      '<h3 class="s-title">期待与您一起推进</h3>' +
      '<p class="s-sub">联系人 / 电话 / 邮箱</p>' +
    '</div>';

  /* ---------- 5 套模板 ---------- */

  var ITEMS = [
    {
      id: 'tpl-general-kit',
      kind: 'tpl',
      icon: 'package',
      name: '通用八件套 · 简约中性风',
      scene: ['日常作业', '课程展示', '内部同步', '通用汇报'],
      summary: '灰蓝中性底 + 青绿强调，直角卡片、无装饰线。封面 / 目录 / 章节页 / 内容双栏 / 三栏 / 图文 / 数据 / 结束页 8 件套，先套框架再换色换字，30 分钟起稿。',
      palette: { main: '#42526E', accent: '#36CFC9', bg: '#FFFFFF', text: '#333333' },
      shape: 'sharp',
      font: {
        title: '思源黑体 Bold 30pt',
        body: '思源黑体 Regular 18pt',
        note: '中英文各一族；全篇字重不超过 3 级，行距 1.3'
      },
      structure: [
        '封面：主标题 + 副标题（部门 / 姓名 / 日期）',
        '目录：3-5 条，每条不超过 12 字',
        '章节页：大号序号 + 章节名，用于长内容分段',
        '内容双栏：左结论右依据，或左文右图',
        '内容三栏：并列三点，每点一个标题 + 两行说明',
        '图文页：上图下文，图占约 60% 高度',
        '数据页：KPI 卡 + 单一图表 + 一句结论',
        '结束页：致谢 + 问答提示'
      ],
      frames: [
        {
          name: '封面', layout: 'cover',
          blocks: [
            { type: 'title', text: '2026 年度工作汇报' },
            { type: 'sub', text: '市场部 · 张三 · 2026-12-20' }
          ]
        },
        {
          name: '目录', layout: 'toc',
          blocks: [
            { type: 'list', items: ['一、全年回顾', '二、重点项目', '三、问题复盘', '四、明年计划'] }
          ]
        },
        {
          name: '内容双栏', layout: 'two-col',
          blocks: [
            { type: 'h', text: '核心结论' },
            { type: 'col', items: ['全年目标达成 112%，超预期', '增量主要来自华东区与新渠道'] }
          ]
        },
        {
          name: '数据页', layout: 'kpi',
          blocks: [
            { type: 'kpi', items: [{ v: '112%', k: '目标达成' }, { v: '32', k: '项目数' }, { v: '+18%', k: '同比' }] },
            { type: 'chart', kind: 'bar' }
          ]
        },
        {
          name: '结束页', layout: 'end',
          blocks: [
            { type: 'title', text: '谢谢' },
            { type: 'sub', text: '欢迎提问与建议' }
          ]
        }
      ],
      skeleton: SK_GENERAL,
      practice: [
        {
          q: '八件套里「章节页」的主要作用是？',
          o: ['放图表', '给长内容分段，给听众一个停顿点', '当封面用', '放参考文献'],
          a: 1,
          x: '章节页是长汇报的分段标记，让听众知道"进入下一块了"。它不承载细节，只放序号 + 章节名。'
        },
        {
          q: '套用通用八件套时，最先该统一的三个元素是？',
          o: ['标题字、强调色、版式间距', '动画、音效、切换方式', '页眉、页脚、页码', '背景图、logo、二维码'],
          a: 0,
          x: '三处一致是全篇"不散"的关键：标题字号统一、强调色只用一种、卡片间距固定为 24px / 32px 两档。动画与页码属于锦上添花，不影响整体感。'
        }
      ]
    },

    {
      id: 'tpl-biz-report',
      kind: 'tpl',
      icon: 'briefcase',
      name: '商务汇报风',
      scene: ['工作汇报', '年终总结', '方案汇报', '经营分析会'],
      summary: '深蓝 + 白灰，直角卡片，标题粗、正文细。适合工作报告、总结、方案汇报。',
      palette: { main: '#1F4E79', accent: '#2E75B6', bg: '#FFFFFF', text: '#333333' },
      shape: 'sharp',
      font: {
        title: '思源黑体 Bold 32pt',
        body: '思源黑体 Regular 18pt',
        note: '标题加粗不加边框；正文统一左对齐；数字用等宽字'
      },
      structure: [
        '封面：深蓝底 + 白色主标题，右下角落款',
        '目录：编号制（01 / 02 / 03），右侧留白',
        '章节页：深蓝色块 + 白色序号',
        '内容双栏：左"结论"右"依据"，中间加分隔细线',
        '数据页：KPI 三卡并列 + 单张柱状图',
        '结束页：深蓝底 + "谢谢 / 敬请指正"'
      ],
      frames: [
        {
          name: '封面', layout: 'cover',
          blocks: [
            { type: 'title', text: '2026 年度经营汇报' },
            { type: 'sub', text: '战略发展部 · 2027 年 1 月' }
          ]
        },
        {
          name: '目录', layout: 'toc',
          blocks: [
            { type: 'list', items: ['01 经营总览', '02 业务拆解', '03 风险与对策', '04 明年目标'] }
          ]
        },
        {
          name: '内容双栏', layout: 'two-col',
          blocks: [
            { type: 'h', text: '结论先行：利润增长快于规模' },
            { type: 'col', items: ['营收 +9%，利润 +15%', '高毛利产品占比提升至 41%'] }
          ]
        },
        {
          name: '数据页', layout: 'kpi',
          blocks: [
            { type: 'kpi', items: [{ v: '+15%', k: '利润同比' }, { v: '9.2%', k: '营收同比' }, { v: '41%', k: '高毛利占比' }] },
            { type: 'chart', kind: 'bar' }
          ]
        },
        {
          name: '结束页', layout: 'end',
          blocks: [
            { type: 'title', text: '谢谢' },
            { type: 'sub', text: '敬请指正' }
          ]
        }
      ],
      skeleton: SK_BIZ,
      practice: [
        {
          q: '商务汇报封面的主标题字号，通常应该？',
          o: ['与正文相同', '明显大于正文，形成层级', '越小越正式', '随意即可'],
          a: 1,
          x: '标题 ≥ 正文一个层级（如 32pt / 18pt）才有主次。标题与正文同号会让页面失去视觉焦点。'
        },
        {
          q: '深蓝主色配强调色时，强调色的面积宜控制在？',
          o: ['铺满整页', '点缀，不超过版面 10%', '与深蓝各占一半', '完全不用强调色'],
          a: 1,
          x: '强调色用来"点亮"关键数字和关键词，面积一大全页就花。控制在 10% 以内，只在最需要的地方出现。'
        }
      ]
    },

    {
      id: 'tpl-edu-course',
      kind: 'tpl',
      icon: 'graduation-cap',
      name: '教育培训风',
      scene: ['课程课件', '科普分享', '内训带教', '班会 / 家长会'],
      summary: '青绿 + 米白、圆角卡片、预留图标位，字大行疏。适合课程、科普、内训。',
      palette: { main: '#2F7A5E', accent: '#F0A03C', bg: '#FBF7EF', text: '#3A3A3A' },
      shape: 'round',
      font: {
        title: '思源黑体 Bold 34pt',
        body: '思源黑体 Regular 20pt',
        note: '行距 1.4-1.6；一页正文不超过 6 行'
      },
      structure: [
        '封面：米白底 + 青绿大标题 + 圆形图标位',
        '目录：图标 + 文字，两列排布',
        '知识点页：大圆角卡 + 一句结论 + 一个例子',
        '练习页：题目居左，作答区居右（或整页留白）',
        '小结页：三条要点 + 一个思考题',
        '结束页：米白底 + 青绿"谢谢" + 课后任务'
      ],
      frames: [
        {
          name: '封面', layout: 'cover',
          blocks: [
            { type: 'title', text: '第 3 讲 · 如何做一页好 PPT' },
            { type: 'sub', text: '星途内训 · 讲师：李老师' }
          ]
        },
        {
          name: '目录', layout: 'toc',
          blocks: [
            { type: 'list', items: ['一、版面四原则', '二、配色三色法', '三、字体两族法', '四、实战演练'] }
          ]
        },
        {
          name: '内容双栏', layout: 'two-col',
          blocks: [
            { type: 'h', text: '本节要点' },
            { type: 'col', items: ['对齐决定专业感', '对比决定信息主次'] }
          ]
        },
        {
          name: '数据页', layout: 'kpi',
          blocks: [
            { type: 'kpi', items: [{ v: '4', k: '四原则' }, { v: '3', k: '配色数' }, { v: '2', k: '字体族' }] },
            { type: 'chart', kind: 'bar' }
          ]
        },
        {
          name: '结束页', layout: 'end',
          blocks: [
            { type: 'title', text: '本节小结' },
            { type: 'sub', text: '课后任务：改一页自己的 PPT' }
          ]
        }
      ],
      skeleton: SK_EDU,
      practice: [
        {
          q: '教育培训类页面，正文行距建议取？',
          o: ['1.0（默认）', '1.2 以下，越密越好', '1.4-1.6，字大行疏', '2.5 以上'],
          a: 2,
          x: '教学场景常有投影、后排观看，行距 1.4-1.6 且字大行疏才读得清。行距过密文字粘连，是最常见的课件问题。'
        },
        {
          q: '课件里用圆角卡片，主要目的是？',
          o: ['降低距离感，贴合教学氛围', '显得更严肃正式', '节省版面', '方便黑白打印'],
          a: 0,
          x: '圆角弱化了"报告感"，更亲和，适合课堂与内训。正式对外汇报反而更常用直角或细描边卡片。'
        }
      ]
    },

    {
      id: 'tpl-data-report',
      kind: 'tpl',
      icon: 'chart-bar',
      name: '数据分析风',
      scene: ['经营分析', '月度复盘', '数据周报', '项目看板'],
      summary: '浅底 + 大号图表 + 指标卡片（KPI），每页一个结论标题。适合经营分析、月度复盘。',
      palette: { main: '#12263F', accent: '#00A8E8', bg: '#F4F7FA', text: '#1B2733' },
      shape: 'sharp',
      font: {
        title: '思源黑体 Bold 28pt',
        body: '思源黑体 Regular 16pt',
        note: '数字统一用等宽字体（DIN / Roboto Mono），小数点位数对齐'
      },
      structure: [
        '封面：深底 + 标题 + 数据区间（如 2026 H1）',
        '结论页：一句话结论，字号全篇最大',
        'KPI 页：3 张指标卡（数值 / 同比 / 环比）',
        '图表页：一图一结论，图占约 70% 版面',
        '归因页：左原因右对策，双栏对照',
        '结束页：下一步行动 3 条 + 责任人'
      ],
      frames: [
        {
          name: '封面', layout: 'cover',
          blocks: [
            { type: 'title', text: '2026 H1 经营数据分析' },
            { type: 'sub', text: '数据口径：集团合并 · 截至 6 月 30 日' }
          ]
        },
        {
          name: '目录', layout: 'toc',
          blocks: [
            { type: 'list', items: ['一、核心结论', '二、分区域拆解', '三、归因分析', '四、行动建议'] }
          ]
        },
        {
          name: '内容双栏', layout: 'two-col',
          blocks: [
            { type: 'h', text: '结论：华东区增速领先全国 12pt' },
            { type: 'col', items: ['原因：新渠道投放 + 客单价提升', '对策：复制打法至华中华南'] }
          ]
        },
        {
          name: '数据页', layout: 'kpi',
          blocks: [
            { type: 'kpi', items: [{ v: '+24%', k: '华东增速' }, { v: '+12%', k: '全国增速' }, { v: '8.6k', k: '样本量' }] },
            { type: 'chart', kind: 'bar' }
          ]
        },
        {
          name: '结束页', layout: 'end',
          blocks: [
            { type: 'title', text: '下一步行动' },
            { type: 'sub', text: '责任人 / 时间节点 / 验收口径' }
          ]
        }
      ],
      skeleton: SK_DATA,
      practice: [
        {
          q: '数据页的页面标题，最合适的写法是？',
          o: ['"数据分析"', '一句结论，如"华东区增速领先全国 12pt"', '图表类型名', '留空'],
          a: 1,
          x: '数据页标题写结论而非写"分析"，听众不看图也能拿到答案。图表只负责证明这句话。'
        },
        {
          q: 'KPI 卡上除了数值，最好同时给出？',
          o: ['同比 / 环比等参照值', '图表制作工具', '制作人姓名', '字体名称'],
          a: 0,
          x: '孤立的数字没有意义，"112%" 配上"同比 +18%"才有判断依据。参照值优先于单位与来源。'
        }
      ]
    },

    {
      id: 'tpl-proposal',
      kind: 'tpl',
      icon: 'file-text',
      name: '项目提案风',
      scene: ['项目立项', '方案投标', '融资路演', '立项评审'],
      summary: '暖白底 + 珊瑚红强调，大留白、强对比。先讲痛点再给方案，一页一个主张，最后一页必须有行动号召。',
      palette: { main: '#D64545', accent: '#F2B705', bg: '#FFFDF9', text: '#2E2A27' },
      shape: 'round',
      font: {
        title: '思源黑体 Bold 36pt',
        body: '思源黑体 Regular 18pt',
        note: '主张句加粗或换强调色，其余文字保持克制'
      },
      structure: [
        '封面：暖白底 + 一句话主张 + 提案方',
        '痛点页：3 个痛点，每条一句，配强调色序号',
        '方案页：一张流程 / 架构图 + 三步说明',
        '价值页：投入 / 产出 / 周期 三栏数字',
        '计划页：甘特式时间轴（4-6 个里程碑）',
        '结束页：行动号召 + 联系方式'
      ],
      frames: [
        {
          name: '封面', layout: 'cover',
          blocks: [
            { type: 'title', text: '智能客服升级项目 · 立项提案' },
            { type: 'sub', text: '数字化中心 · 2026 年 9 月' }
          ]
        },
        {
          name: '目录', layout: 'toc',
          blocks: [
            { type: 'list', items: ['01 现状与痛点', '02 方案设计', '03 投入与产出', '04 实施计划'] }
          ]
        },
        {
          name: '内容双栏', layout: 'two-col',
          blocks: [
            { type: 'h', text: '我们建议分两期实施' },
            { type: 'col', items: ['一期（3 个月）：工单自动分派', '二期（5 个月）：知识库自助答疑'] }
          ]
        },
        {
          name: '数据页', layout: 'kpi',
          blocks: [
            { type: 'kpi', items: [{ v: '-38%', k: '人工工单量' }, { v: '6 个月', k: '回本周期' }, { v: '92%', k: '首答准确率' }] },
            { type: 'chart', kind: 'bar' }
          ]
        },
        {
          name: '结束页', layout: 'end',
          blocks: [
            { type: 'title', text: '期待与您一起推进' },
            { type: 'sub', text: '联系人 / 电话 / 邮箱' }
          ]
        }
      ],
      skeleton: SK_PROPOSAL,
      practice: [
        {
          q: '提案类 PPT 的封面主张句，应该写成？',
          o: ['公司全称 + 简介', '一句话说清"为谁解决什么问题"', '当天日期', '留白，靠讲'],
          a: 1,
          x: '评审往往只看封面几秒。主张句要能独立成立："为客服团队把人工工单量降 38%"，比"智能客服升级项目"更有说服力。'
        },
        {
          q: '提案中「痛点页」之后，通常紧跟的是？',
          o: ['结束页', '方案页：针对前面每个痛点给对应解法', '参考文献', '团队介绍'],
          a: 1,
          x: '痛点与方案一一对应，是提案的逻辑 backbone。若跳到团队介绍，听众会失去"为什么是你"的判断依据。'
        }
      ]
    }
  ];

  /* fonts 别名：与 font 指向同一对象，兼容不同渲染器字段命名 */
  for (var i = 0; i < ITEMS.length; i++) {
    ITEMS[i].fonts = ITEMS[i].font;
  }

  /* ---------- 后置覆盖同名 key（mini-ppt.js 原数据保持不动） ---------- */
  PPT['ppt-templates'] = {
    t: 'PPT · 实战模板库',
    mode: 'gallery',
    v: 2,
    credit: '原创骨架 · 版式与文案由星途自撰，非任何商业模板复刻',
    meta: { unit: '套', total: 5, frames: 25 },
    items: ITEMS,
    guide: {
      icon: 'lightbulb',
      title: '使用建议 · 怎么挑模板',
      body: '模板先选"用途"再选"色系"；换内容时保持三处一致（标题字、强调色、版式间距），整体才不会散。',
      steps: [
        '第一步看用途：汇报用商务风，讲课用教育风，讲数据用分析风，要资源用提案风。',
        '第二步看受众：对外偏正式（深蓝 / 中性灰蓝），对内培训可轻松（青绿 / 暖白）。',
        '第三步换色不换骨架：只改 main / accent 两个色值，栅格与间距一律不动。',
        '第四步统一三处：标题字号、强调色、卡片间距（建议 24px / 32px 两档）。',
        '第五步做减法：一页只留一个结论，多余内容移到备注栏或附录页。'
      ]
    }
  };
})();
