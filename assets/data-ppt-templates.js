/* =====================================================================
   data-ppt-templates.js · A7「PPT · 实战模板库」富结构数据（v3）
   批次：2026-09-16 / B2「N9-12 PPT版式库升级」/ 版本戳 20260916（本波不 bump）
   ---------------------------------------------------------------------
   架构约定（ADR-1 数据外置 + 后置覆盖）：
     · 本文件在 assets/mini-ppt.js 「之后」加载，用新结构覆盖同名 key
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
   ---------------------------------------------------------------------
   B2 新增（v3，不改动上面的 'ppt-templates' key 一字节语义）：
     · 新增同名板式库数据集 window.MINI_BANK['ppt-layout-lib']，字段严格按
       《需求文档-PPT版式库升级-豆包-20260915.md》第七节：
         id / name / category / previewImage / pptFile / useCase /
         designPoints[] / palette / placeholder（占位骨架用）
     · previewImage 一律填 ''（「不写会 404 的路径」）；previewImage 为空时
       渲染器走「内联 SVG 版式示意骨架」占位降级（见 tpl-preview.js）。
     · pptFile 一律 null（本波无真实 .pptx 文件）→ 下载按钮显示「制作中」置灰。
     · 共 16 条，覆盖 4 个分类：封面页 4 / 目录页 3 / 过渡页 3 / 内容页 6。
     · 分类页签顺序与需求文档一致：全部 · 封面页 · 目录页 · 过渡页 · 内容页 · 我的收藏
     · 内容全部原创，为经验性排版建议，不含任何权威结论或数据断言。
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

  /* =====================================================================
     B2 · N9-12 版式库数据集（v3）
     ---------------------------------------------------------------------
     字段口径严格对齐《需求文档-PPT版式库升级-豆包-20260915.md》第七节；
     额外增加 palette（配色，用于占位骨架着色）与 ph（placeholder 骨架布局键）。
     previewImage 一律为空串 —— 图片目录 assets/images/ppt-templates/ 尚不存在，
     绝不能写会 404 的路径；渲染器见 previewImage 为空即走内联 SVG 占位。
     ===================================================================== */

  /* 4 个分类，顺序与需求文档第四节页签一致 */
  var LIB_CATS = ['封面页', '目录页', '过渡页', '内容页'];

  var LIB_ITEMS = [
    /* ---------- 封面页 4 ---------- */
    {
      id: 'cover-01',
      name: '封面页·商务蓝',
      category: '封面页',
      previewImage: '',
      pptFile: null,
      ph: 'cover-center',
      palette: { main: '#1F4E79', accent: '#2E75B6', bg: '#FFFFFF', text: '#333333' },
      useCase: '汇报 / 答辩 / 发布会的第一页，奠定整份材料的基本风格',
      designPoints: [
        '大标题居中，字号 40-60pt，是全篇最大的一处文字',
        '副标题紧贴主标题下方，字号约为主标题的一半',
        '背景用主题色纯色或深色渐变，避免花哨图片抢焦点',
        '底部留汇报人 / 日期 / 单位落款，位置固定不动'
      ]
    },
    {
      id: 'cover-02',
      name: '封面页·极简白',
      category: '封面页',
      previewImage: '',
      pptFile: null,
      ph: 'cover-left',
      palette: { main: '#2C3E50', accent: '#E05040', bg: '#FFFFFF', text: '#2E2A27' },
      useCase: '课程讲义 / 内部文档转化而来的分享，追求干净耐看',
      designPoints: [
        '标题左对齐而非居中，右侧留大块白，气质更克制',
        '只用一条强调色细线做分割，不再加任何装饰',
        '白底黑字对比足，投影与打印都清晰',
        '适合内容偏理性、不需要情绪渲染的场合'
      ]
    },
    {
      id: 'cover-03',
      name: '封面页·深色质感',
      category: '封面页',
      previewImage: '',
      pptFile: null,
      ph: 'cover-dark',
      palette: { main: '#12263F', accent: '#00A8E8', bg: '#12263F', text: '#FFFFFF' },
      useCase: '发布会 / 路演 / 品牌向分享，希望第一眼有冲击力',
      designPoints: [
        '深色底 + 高亮度标题字，对比强、显高级',
        '标题占版面约三分之二宽，字号放大才有气势',
        '底部放一个小色块或一句 slogan，起稳定重心的作用',
        '深色底现场投影易偏暗，务必提前到现场试投'
      ]
    },
    {
      id: 'cover-04',
      name: '封面页·分隔线式',
      category: '封面页',
      previewImage: '',
      pptFile: null,
      ph: 'cover-rule',
      palette: { main: '#2F7A5E', accent: '#F0A03C', bg: '#FBF7EF', text: '#3A3A3A' },
      useCase: '教育培训 / 系列课程的第 N 讲封面，需要标明章节',
      designPoints: [
        '主标题与副标题之间加一条水平细线，结构一目了然',
        '左上角或右上角给出"第 X 讲 / 系列名"信息位',
        '暖底色比纯白更亲和，长时间看眼睛不累',
        '章节序号建议全篇统一同一位置，翻页时形成节奏'
      ]
    },

    /* ---------- 目录页 3 ---------- */
    {
      id: 'toc-01',
      name: '目录页·数字编号版',
      category: '目录页',
      previewImage: '',
      pptFile: null,
      ph: 'toc-number',
      palette: { main: '#1F4E79', accent: '#2E75B6', bg: '#FFFFFF', text: '#333333' },
      useCase: '结构清晰的正式汇报，目录要能一眼看出层级',
      designPoints: [
        '每条用 01 / 02 / 03 数字编号，编号与文字左对齐成一条线',
        '章节数控制在 3-5 条，超过就说明该合并',
        '每条不超过 12 个字，长标题换行或改短',
        '当前章节可加粗或换强调色，其余保持灰色弱化'
      ]
    },
    {
      id: 'toc-02',
      name: '目录页·双列排布',
      category: '目录页',
      previewImage: '',
      pptFile: null,
      ph: 'toc-twocol',
      palette: { main: '#42526E', accent: '#36CFC9', bg: '#FFFFFF', text: '#333333' },
      useCase: '章节较多（6-8 条）的课程或培训类材料',
      designPoints: [
        '分左右两列，每列 3-4 条，避免单列拉太长',
        '两列的条目顶部必须对齐，错位会立刻显得乱',
        '给每条配一个小图标位，视觉更友好但要统一风格',
        '列与列之间留出至少一个字符宽的间距，别贴在一起'
      ]
    },
    {
      id: 'toc-03',
      name: '目录页·侧边标签式',
      category: '目录页',
      previewImage: '',
      pptFile: null,
      ph: 'toc-sidebar',
      palette: { main: '#2C3E50', accent: '#E05040', bg: '#F4F7FA', text: '#1B2733' },
      useCase: '内容分块明显的分析报告或长文档提炼',
      designPoints: [
        '左侧一条竖向色带承载目录，右侧留白或放一句主题语',
        '竖带的宽度建议不超过页宽的 30%',
        '目录文字距竖带边缘留出固定内边距，显得精致',
        '适合与大段内容的正文页形成明显区分'
      ]
    },

    /* ---------- 过渡页 3 ---------- */
    {
      id: 'section-01',
      name: '过渡页·大号序号',
      category: '过渡页',
      previewImage: '',
      pptFile: null,
      ph: 'section-big',
      palette: { main: '#1F4E79', accent: '#2E75B6', bg: '#1F4E79', text: '#FFFFFF' },
      useCase: '长材料分章节时的"翻篇页"，给听众一个停顿点',
      designPoints: [
        '整页只放一个超大序号 + 章节名，不再放任何正文',
        '深色底与前后内容页拉开差异，起到"分隔"作用',
        '停留时间短，视觉冲击比信息量更重要',
        '序号字号建议为主标题的 2 倍以上'
      ]
    },
    {
      id: 'section-02',
      name: '过渡页·色块横幅',
      category: '过渡页',
      previewImage: '',
      pptFile: null,
      ph: 'section-band',
      palette: { main: '#2F7A5E', accent: '#F0A03C', bg: '#FBF7EF', text: '#3A3A3A' },
      useCase: '偏轻松的分享 / 内训，过渡页不希望太"重"',
      designPoints: [
        '页面中部一条横幅色块，章节名写在色块内',
        '色块高度约占页高的四分之一，上下留白对称',
        '色块用主题色或强调色，与封面保持同一套配色',
        '横幅之外全部留白，不放任何多余元素'
      ]
    },
    {
      id: 'section-03',
      name: '过渡页·左序右题',
      category: '过渡页',
      previewImage: '',
      pptFile: null,
      ph: 'section-left',
      palette: { main: '#12263F', accent: '#00A8E8', bg: '#F4F7FA', text: '#1B2733' },
      useCase: '正式报告章节切换，需要同时交代"第几部分、讲什么"',
      designPoints: [
        '左侧放大号序号，右侧放章节标题与一句本章要点',
        '左右之间用一条竖线或留白分隔，形成清晰阅读顺序',
        '浅底深字，与深色过渡页交替使用可增加节奏变化',
        '一句要点控制在 20 字内，写成结论而非描述'
      ]
    },

    /* ---------- 内容页 6 ---------- */
    {
      id: 'content-01',
      name: '内容页·左文右图',
      category: '内容页',
      previewImage: '',
      pptFile: null,
      ph: 'content-lr',
      palette: { main: '#5B8DEF', accent: '#36CFC9', bg: '#FFFFFF', text: '#333333' },
      useCase: '需要配图说明的内容，产品介绍 / 概念解释',
      designPoints: [
        '左侧文字占 40-50%，右侧图片占 50-60%',
        '标题在左上方，正文分点列出，每点一行',
        '图片要清晰且与内容强相关，宁缺毋滥',
        '图文之间留出至少 24px 间距，别贴边'
      ]
    },
    {
      id: 'content-02',
      name: '内容页·三栏并列',
      category: '内容页',
      previewImage: '',
      pptFile: null,
      ph: 'content-3col',
      palette: { main: '#4CAF50', accent: '#FF9800', bg: '#FFFFFF', text: '#333333' },
      useCase: '展示三个并列要点 / 优势 / 步骤',
      designPoints: [
        '三栏等宽，栏与栏间距一致，整体左右对齐',
        '每栏结构统一：图标 / 序号 + 标题 + 两行说明',
        '三栏内容体量尽量均衡，避免一栏特别长',
        '适合"三大优势""三个步骤"这类并列表达'
      ]
    },
    {
      id: 'content-03',
      name: '内容页·四宫格',
      category: '内容页',
      previewImage: '',
      pptFile: null,
      ph: 'content-grid',
      palette: { main: '#5B8DEF', accent: '#9B6BD9', bg: '#FFFFFF', text: '#333333' },
      useCase: '展示四个并列模块 / 维度 / 模块能力',
      designPoints: [
        '2×2 网格，每格等大，四格间距完全一致',
        '每格内：小图标或数字 + 标题 + 一句说明',
        '可用四种近似色区分，但明度要接近才不显花',
        '注意四格文字量均衡，不要有一格只剩两三个字'
      ]
    },
    {
      id: 'content-04',
      name: '内容页·时间轴',
      category: '内容页',
      previewImage: '',
      pptFile: null,
      ph: 'content-timeline',
      palette: { main: '#00A8E8', accent: '#FF9F68', bg: '#F4F7FA', text: '#1B2733' },
      useCase: '展示发展历程 / 流程步骤 / 项目计划',
      designPoints: [
        '横向或纵向一条主线，节点用圆点标记',
        '每个节点：时间 + 标题 + 一句简短说明',
        '节点数 3-6 个为宜，过多就拆成两页',
        '已完成 / 进行中 / 未开始可用颜色区分，但线型要统一'
      ]
    },
    {
      id: 'content-05',
      name: '内容页·数据图表',
      category: '内容页',
      previewImage: '',
      pptFile: null,
      ph: 'content-chart',
      palette: { main: '#12263F', accent: '#00A8E8', bg: '#F4F7FA', text: '#1B2733' },
      useCase: '展示数据 / 趋势 / 对比，用图表说话',
      designPoints: [
        '图表占版面 50-70%，是这一页的绝对主角',
        '页面标题写结论，不写"数据图表"这类类型名',
        '图表旁配一到两条数据解读，说明"所以呢"',
        '去掉网格线与多余标签，只留必要刻度'
      ]
    },
    {
      id: 'content-06',
      name: '内容页·对比双栏',
      category: '内容页',
      previewImage: '',
      pptFile: null,
      ph: 'content-compare',
      palette: { main: '#E05040', accent: '#36CFC9', bg: '#FFFFFF', text: '#333333' },
      useCase: '展示两种方案 / 版本 / 观点的对比',
      designPoints: [
        '左右两栏对称，中间用 VS 或箭头分隔',
        '每栏顶部写清"这是哪一方"，避免听众混淆',
        '对比项要一一对应，行数尽量相同才好横向比',
        '底部可加一句推荐结论，替听众做判断'
      ]
    }
  ];

  /* 给每条补 palette 兜底与统一字段，避免渲染器遇到缺字段崩 */
  for (var j = 0; j < LIB_ITEMS.length; j++) {
    var it = LIB_ITEMS[j];
    if (!it.palette) it.palette = { main: '#5B8DEF', accent: '#36CFC9', bg: '#FFFFFF', text: '#333333' };
    if (typeof it.previewImage !== 'string') it.previewImage = '';
    if (typeof it.pptFile === 'undefined') it.pptFile = null;
    if (!it.designPoints || !it.designPoints.length) it.designPoints = ['待补充设计要点'];
  }

  /* 分类计数（供页签显示 "封面页 (4)" 之类，可选） */
  var LIB_COUNT = {};
  for (var c = 0; c < LIB_CATS.length; c++) LIB_COUNT[LIB_CATS[c]] = 0;
  for (var k = 0; k < LIB_ITEMS.length; k++) {
    var cat = LIB_ITEMS[k].category;
    if (typeof LIB_COUNT[cat] === 'number') LIB_COUNT[cat]++;
    else LIB_COUNT[cat] = 1;
  }

  PPT['ppt-layout-lib'] = {
    t: 'PPT版式库',
    mode: 'layout-lib',
    v: 3,
    credit: '原创版式骨架 · 由星途自撰，非任何商业模板复刻',
    cats: LIB_CATS,
    counts: LIB_COUNT,
    meta: { unit: '种', total: LIB_ITEMS.length },
    /* 预览图目录（当前不存在，仅作后续补真图的锚点说明） */
    imageDir: 'assets/images/ppt-templates/',
    fileDir: 'assets/ppt-files/',
    items: LIB_ITEMS
  };
})();
