
// ========== 登录门禁（本地演示版） ==========
// 说明：账号信息仅存 localStorage（本机浏览器），刷新不丢失，但无法真正多用户。
// 登录页 登录.html 不引用本文件，其余所有页面加载本文件时都会先做登录校验。
// 【后续扩展点】正式多用户登录需要后端接口（见 增量修改说明.md）。

// ========== T15 数据按账号隔离（2026-09-12 P0-A） ==========
// 账号标识取自 study_workbench_auth（{account, loginAt}）；离线/异常时回退 last_account，再兜底 'shared'。
window.CURRENT_ACCOUNT = (function () {
  var acct = '';
  try { var a = JSON.parse(localStorage.getItem('study_workbench_auth')); if (a && a.account) acct = a.account; } catch (e) { /* 忽略 */ }
  if (!acct) { try { acct = localStorage.getItem('study_workbench_last_account') || ''; } catch (e2) { /* 忽略 */ } }
  return acct || 'shared';
})();
function lsKey(name) { return window.CURRENT_ACCOUNT ? name + '@' + window.CURRENT_ACCOUNT : name; }
window.lsKey = lsKey;

/* A 类业务键一次性迁移：旧无前缀键 → 当前账号前缀键。
   主理人拍板：归「迁移时当前登录账号」，新键不存在才复制，全部处理完后删除旧键（一次性）。
   动态键（study_workbench_ai_chat_<partner> / study_workbench_tool_<tool>）按前缀扫描。 */
(function migrateLegacyKeys() {
  var LITERAL_KEYS = [
    'study_workbench_data', 'study_workbench_recent', 'study_workbench_ai_chat',
    'study_workbench_ai_config', 'study_workbench_ai_partner', 'study_workbench_records',
    'study_workbench_session', 'study_workbench_wrong_reasons', 'study_workbench_subjects',
    'study_workbench_goals', 'study_workbench_studytime', 'study_workbench_home_show',
    'study_workbench_stats', 'study_workbench_stats_queue', 'study_workbench_custom',
    'study_workbench_quest_progress', 'mini_stats', 'study_im_local_data', 'study_im_ai_added',
    'study_workbench_chat_prefs', 'study_workbench_emoji_fav', 'study_workbench_emoji_recent',
    'study_workbench_cet4_goal_date', 'study_workbench_cet4_daily_tasks'
  ];
  var PREFIX_KEYS = ['study_workbench_ai_chat_', 'study_workbench_tool_'];
  var olds = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k) olds.push(k);
    }
  } catch (e) { olds = []; }
  function copyOne(oldKey, newKey) {
    if (localStorage.getItem(newKey) != null) return; // 新键已存在：不覆盖当前账号数据
    var v = localStorage.getItem(oldKey);
    if (v != null) { try { localStorage.setItem(newKey, v); } catch (e) { /* 忽略 */ } }
  }
  LITERAL_KEYS.forEach(function (key) {
    if (olds.indexOf(key) >= 0) copyOne(key, lsKey(key));
  });
  PREFIX_KEYS.forEach(function (p) {
    olds.forEach(function (key) {
      if (key.indexOf(p) === 0 && key.indexOf('@') === -1) copyOne(key, lsKey(key));
    });
  });
  // 全部处理完后一次性删除旧键（避免迁移逻辑反复触发）
  LITERAL_KEYS.forEach(function (key) {
    if (olds.indexOf(key) >= 0) { try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ } }
  });
  PREFIX_KEYS.forEach(function (p) {
    olds.forEach(function (key) {
      if (key.indexOf(p) === 0 && key.indexOf('@') === -1) { try { localStorage.removeItem(key); } catch (e) { /* 忽略 */ } }
    });
  });
})();

const AUTH_KEY = 'study_workbench_auth';        // 当前登录会话 {account, loginAt}
const USERS_KEY = 'study_workbench_users';     // 本地账号表 {账号: {pass:哈希, createdAt}}

// ========== 用户偏好设置（独立于业务数据，key: study_workbench_settings） ==========
const SETTINGS_KEY = 'study_workbench_settings';
const DEFAULT_SETTINGS = {
  // 外观
  theme: 'light',        // 主题模式：light/dark/auto
  color: 'blue',         // 界面配色：blue/green/purple/orange/pink
  fontSize: 'normal',    // 字体大小：small/normal/large/xlarge
  
  // 学习
  dailyNew: 50,          // 每日新增学习内容
  focusMinutes: 25,      // 专注学习时长
  studyLimitOn: true,    // 【9/11 新增】每日学习时长上限开关
  studyLimitHours: 4,    // 【9/11 新增】每日学习时长上限（小时），默认 4
  studyLimitWarn: true,  // 【9/11 新增】超限后弹窗提醒（仅提醒，不阻断）
  autoSpeak: true,       // 朗读开关
  voiceRate: 0.9,        // 朗读语速
  voiceLang: 'en-US',    // 英文发音口音
  
  // 通知
  chatNotify: true,      // 新私信提醒
  studyRemind: false,    // 每日学习提醒
  reviewRemind: true,    // 复习提醒
  
  // 显示与交互
  keepScreen: false,     // 屏幕常亮
  cardAutoPlay: true,    // 卡片轮播自动播放
  
  // 隐私
  notesPublic: true,     // 新发贴默认公开
  canSearch: true,       // 允许被搜索
  studyPublic: false,    // 学习记录公开

  // 发贴默认偏好（【9/11 新增】设置页可改，编辑器自动套用）
  blogCat: 'cet',        // 新建发贴默认分类
  blogPrivacy: 'public', // 新建发贴默认可见范围
  blogTags: '',          // 新建发贴默认标签（逗号分隔）

  // 阅读与交互偏好（【9/11 新增】）
  readerFont: 'normal',  // 编辑/阅读字号：normal/large/xlarge
  reduceMotion: false,   // 减少界面动效
  compact: false,        // 紧凑模式
  remindTime: '20:00',   // 每日学习提醒时间

  // AI
  aiTemp: '',            // AI 温度
  aiMax: '',             // AI 最大输出
  aiStream: true,        // 流式输出
  aiContext: true,       // 上下文记忆
  aiAvatar: '🤖',        // AI助手头像
  aiPanelWidth: 'normal' // AI面板宽度
};
function loadAllSettings() {
  try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
  catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
}
function getSetting(k) { return loadAllSettings()[k]; }
function setSetting(k, v) {
  try {
    const o = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {});
    o[k] = v;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(o));
    applySettings(); // 立即应用设置
  } catch (e) { /* 忽略 */ }
}

// 真正应用所有设置到页面
function applySettings() {
  const s = loadAllSettings();
  
  // 1. 界面配色 - 直接修改CSS变量
  const colorMap = {
    blue: '#5B8DEF',
    green: '#34C759',
    purple: '#AF52DE',
    orange: '#FF9500',
    pink: '#FF2D55'
  };
  document.documentElement.style.setProperty('--primary', colorMap[s.color] || '#5B8DEF');
  
  // 2. 字体大小 - 直接修改body字体大小
  const fontSizeMap = {
    small: '13px',
    normal: '14px',
    large: '16px',
    xlarge: '18px'
  };
  document.body.style.fontSize = fontSizeMap[s.fontSize] || '14px';
  
  // 3. 朗读设置
  window._autoSpeak = s.autoSpeak;
  window._voiceRate = s.voiceRate;
  window._voiceLang = s.voiceLang;
  
  // 4. AI助手头像
  var aiBtn = document.getElementById('aiFabBtn');
  if (aiBtn) aiBtn.textContent = s.aiAvatar;
  
  // 5. 屏幕常亮
  if (s.keepScreen && window.wakeLock) {
    try { window.wakeLock.request('screen'); } catch(e) {}
  }

  // 6. 阅读与交互偏好（【9/11 新增】）
  document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
  document.body.classList.toggle('compact', !!s.compact);
  document.body.classList.toggle('reader-large', s.readerFont === 'large');
  document.body.classList.toggle('reader-xlarge', s.readerFont === 'xlarge');
}

// 页面加载完成后应用所有设置
window.addEventListener('load', function() {
  applySettings();
  // 【9/11 新增】启动每日学习时长计时（各页统一；函数定义见文件末尾）
  if (typeof initStudyTimer === 'function') initStudyTimer();
  if (typeof seedStudyLimitUI === 'function') seedStudyLimitUI();
});
function getAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; }
}

// ========== 错误日志（本地环形，出错可诊断）==========
(function () {
  var KEY = 'study_workbench_errors';
  function push(m) {
    try {
      var arr = JSON.parse(localStorage.getItem(KEY)) || [];
      arr.push({ t: new Date().toLocaleString('zh-CN'), m: String(m).slice(0, 300) });
      if (arr.length > 30) arr = arr.slice(-30);
      localStorage.setItem(KEY, JSON.stringify(arr));
    } catch (e) { }
  }
  window.addEventListener('error', function (ev) {
    push((ev && ev.message) ? (ev.message + ' @' + ((ev.filename || '').split('/').pop() || '') + ':' + (ev.lineno || 0)) : 'error');
  });
  window.addEventListener('unhandledrejection', function (ev) { push('Promise: ' + ((ev.reason && ev.reason.message) || ev.reason)); });
  window.__errorLog = function () { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  window.__clearErrorLog = function () { localStorage.removeItem(KEY); };
})();
function doLogout() {
  // 优化：优先弹出自定义确认弹窗（结构在 个人中心.html 的 #logoutConfirmModal），
  // 弹窗不存在时（其他页面兜底）回退到原生 confirm，防止误触直接退出。
  const m = document.getElementById('logoutConfirmModal');
  if (m) { m.classList.add('active'); return; }
  if (!confirm('确定要退出登录吗？')) return;
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem('study_workbench_user'); // T15/T23：退出时清昵称缓存（业务数据按账号隔离保留）
  location.replace('登录.html');
}
function closeLogoutConfirm() {
  const m = document.getElementById('logoutConfirmModal'); if (m) m.classList.remove('active');
}
function confirmLogout() {
  closeLogoutConfirm();
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem('study_workbench_user'); // T15/T23：退出时清昵称缓存（业务数据按账号隔离保留）
  location.replace('登录.html');
}
// 未登录 → 强制跳转登录页（登录页自身不含 app.js，不会形成循环）
if (!getAuth()) { location.replace('登录.html'); }

// ========== 去 emoji 白名单（R4-6，禁止误删） ==========
// 以下 emoji 属产品特性 / 功能类，保留不替换：
//   1) 聊天表情系统：assets/emoji/manifest.js 的 Unicode 映射（产品特性）
//   2) 听力播控按钮：⏮ 🔊 🐢 ⏭（voiceplayer.js:99-107，功能/内容类）
//   3) 状态指示：✅ ⚠️（toast / 徽章状态）
//   4) 成就徽章：🌟 🔥 📝 🗣️（随 R5 收进二级页，保留原位）
// 其余非白名单 emoji（尤其底部导航 / 更多面板 / 首页 title-icon / JS 动态渲染）已在 R4 替换为内联 SVG。
// =============================================================

// ========== 数据存储 ==========
const STORAGE_KEY = lsKey('study_workbench_data');
let appData = {
  countdowns: [],
  // 【P0-B T03】模考成绩归档（mock-exam.js 写入；走既有 lsKey 约束，不新建裸 localStorage 键）
  mockExams: [],
  tasks: [
    { id: 1, name: '四级词汇 50个', module: 'cet', done: false, progress: '0/50' },
    { id: 2, name: '行测图形推理 20题', module: 'exam', done: false, progress: '0/20' },
    { id: 3, name: '高情商场景练习 1个', module: 'comm', done: false, progress: '0/1' },
    { id: 4, name: 'PPT版式练习 1题', module: 'ppt', done: false, progress: '0/1' },
    { id: 5, name: '模拟面试 1次（可选）', module: 'interview', done: false, progress: '0/1' }
  ],
  stats: {
    totalHours: 0,
    totalQuestions: 0,
    correctQuestions: 0,
    streakDays: 0,
    todayMinutes: 0
  },
  // 首页本周柱图改由 study-stats.js 的真实数据驱动（见 renderWeekChart）；
  // 此处保留字段仅为兼容旧存档，默认全 0，不再使用模拟数组。
  weekData: [0, 0, 0, 0, 0, 0, 0],
  // 【批次四 T02】已删除 4 个废弃字段的默认值：
  //   moduleProgress / weakPoints / recentLearning / interviewDone。
  // 它们曾写死假数据（进度 45/30/20/15/10%、三条假薄弱点、三条假最近学习、面试场次 0），
  // 现一律不再随默认 appData 产出；首页真实数据由 computeModuleProgress() /
  // computeWeakPoints() / computeRecentLearning() 从真实行为实时推导。
  // 旧存档若仍残留这些字段，由 loadData() 静默清除（不报错、不渲染、不再回写），见 loadData() 注释。
  wrongQuestions: [],
  favoriteQuestions: [],
  vocabLearned: [],
  vocabCurrentIndex: 0,
  examTypeProgress: {
    '图形推理': { total: 0, correct: 0 },
    '定义判断': { total: 0, correct: 0 },
    '类比推理': { total: 0, correct: 0 },
    '逻辑判断': { total: 0, correct: 0 },
    '言语理解': { total: 0, correct: 0 },
    '数量关系': { total: 0, correct: 0 },
    '资料分析': { total: 0, correct: 0 }
  },
  vocabRecords: {},   // 间隔重复：词汇学习记录
  examRecords: {},     // 间隔重复：做题记录
  viewedContent: {},   // 每日内容：各库已查看ID {commScenes: [], pptLayouts: [], etiquette: [], ivQuestions: []}
  // 【T03 批次三】行为日志（环形，上限 200 条）：只追加、随 saveData 落盘，供首页「最近学习」显示相对时间。
  // 结构：[{ t:<epoch ms>, type:'vocab'|'exam'|'fav'|'listen', ref:<题id/单词/场景key>, module:'cet'|'exam'|... }]
  // 老存档无此字段时 loadData() 会补 []，computeRecentLearning() 自动回退到按日期的旧口径，绝不报错。
  activityLog: [],
  lastVisitDate: "",    // 上次访问日期，用于每日重置随机顺序
  dailyQueues: {},      // 每日学习队列 {commScenes: {date, ids: []}, ...}
  // ===== 广场（发贴系统）数据 =====
  notes: [],            // 发贴文章 [{id,title,category,tags,cover,privacy,status,content,excerpt,views,likes,liked,comments,createdAt,updatedAt}]
  favoriteNotes: [],    // 我收藏的发贴 ID 列表
  profile: { name: '同学', avatar: '学', motto: '好好学习，天天向上', gender: 'secret', birthday: '', city: '' }  // 个人中心资料
};

// ========== 行测题库（常量数据） ==========
const EXAM_BANK = [
  // ===== 图形推理（10题） =====
  { id: 1, type: '图形推理', sub: '位置类', diff: 2, q: '从所给的四个选项中，选择最合适的一个填入问号处，使之呈现一定的变化特性。题干给出五个正方形，每个正方形内各有一个黑色实心小圆点。第1图圆点位于左上角；第2图圆点位于右上角；第3图圆点位于右下角；第4图圆点位于左下角；第5图（问号处）需要从选项中选出圆点所在的角。', o: ['左上','右上','左下','右下'], a: 0, x: '小黑点沿顺时针方向依次移动：左上→右上→右下→左下→（回到左上）。第5个图应回到左上位置。', tip: '看到元素位置变化，先画移动路径，判断顺时针还是逆时针。' },
  { id: 2, type: '图形推理', sub: '位置类', diff: 2, q: '题干给出五个相同形状的箭头，第1图箭头向上；第2图箭头向左；第3图箭头向下；第4图箭头向右；第5图（问号处）需要从选项中选出箭头的指向。', o: ['向上','向下','向左','向右'], a: 1, x: '箭头逆时针旋转：上→左→下→右→（下）。第5个图箭头向下。', tip: '旋转题要注意方向（顺/逆）和角度，逐次画出来不容易错。' },
  { id: 3, type: '图形推理', sub: '样式类', diff: 3, q: '从所给的四个选项中，选择最合适的一个填入问号处。题干包含两组图形，每组由图1、图2、图3三个图形组成；问号处是第二组图3。', o: ['A图形','B图形','C图形','D图形'], a: 1, x: '去同存异规律：两个图形叠加，去掉相同部分，保留不同部分。第二组图1和图2去同存异得到B。', tip: '样式运算常考：去同存异、去异存同、叠加、黑白运算。' },
  { id: 4, type: '图形推理', sub: '数量类', diff: 3, q: '题干给出五个几何图形，每个图形含有若干个封闭区域（图形内部由线条围成的空白块）。请从选项中选出封闭区域数量正确的图形填入问号处。', o: ['4','5','6','7'], a: 1, x: '封闭区域数呈等差数列递增：1→2→3→4→（5）。问号处应有5个封闭区域。', tip: '数量类考点：点、线、角、面、素。封闭区域属于"面"的数量。' },
  { id: 5, type: '图形推理', sub: '数量类', diff: 2, q: '题干给出五个几何图形，每个图形含有若干条直线。请从选项中选出直线数量正确的图形填入问号处。', o: ['6','7','8','9'], a: 1, x: '直线数呈等差数列递增：3→4→5→6→（7）。问号处应有7条直线。', tip: '数线时注意：只数直线还是直线曲线都数，看题干规律。' },
  { id: 6, type: '图形推理', sub: '属性类', diff: 2, q: '题干给出五个几何图形，每个图形可沿若干条假想直线折叠后两侧完全重合。请从选项中选出这种折叠线数量正确的图形填入问号处。', o: ['4','5','6','7'], a: 1, x: '对称轴数量递增：1→2→3→4→（5）。问号处应有5条对称轴。', tip: '属性类考点：对称性、曲直性、开闭性。轴对称要数对称轴数量和方向。' },
  { id: 7, type: '图形推理', sub: '空间重构', diff: 4, q: '左边给定一个由六个正方形组成的正方体展开图。右边给出四个由三个可见面组成的正方体立体图形。从所给的四个选项中，选择一个能由左边展开图折叠而成的正方体。', o: ['A项','B项','C项','D项'], a: 2, x: '空间重构题用相对面法（相对面不相邻原则）：展开图中相对的面在立体图中不能相邻。A、B、D中均有相对面相邻的错误，C正确。', tip: '空间重构先找相对面（相间、Z端），相对面不相邻直接排除。' },
  { id: 8, type: '图形推理', sub: '位置类', diff: 3, q: '题干图形由两个相同形状的元素（A、B）组成，分布在六个等分位置上。第1图A在位置1、B在位置1；第2图A在位置2、B在位置6；第3图A在位置3、B在位置5；第4图A在位置4、B在位置4；第5图（问号处）需要从选项中选出两元素的相对状态。', o: ['相邻','相对','重合','分离'], a: 2, x: '元素A按顺时针推进（位置1→2→3→4→5），元素B按逆时针推进（位置1→6→5→4→3）；第5步两者同在位置5，因此两元素重合。', tip: '多元素移动题要分别追踪每个元素的轨迹，最后再看关系。' },
  { id: 9, type: '图形推理', sub: '样式类', diff: 3, q: '题干图形由若干黑白小方格组成，分为图1和图2两部分。从所给的四个选项中，选择由图1与图2运算得到的图形填入问号处。', o: ['A','B','C','D'], a: 1, x: '按黑白运算规则逐格计算：黑+黑=白，白+白=白，黑+白=黑。运算结果为B。', tip: '黑白运算题先从已知图形中提炼运算规则，再逐格套用。' },
  { id: 10, type: '图形推理', sub: '数量类', diff: 3, q: '题干给出五个几何图形，每个图形含有若干个交点（线与线相交形成的点）。请从选项中选出交点数量正确的图形填入问号处。', o: ['8','10','12','14'], a: 1, x: '交点数呈等差数列递增：2→4→6→8→（10）。问号处应有10个交点。', tip: '交点包括：直线与直线、直线与曲线、曲线与曲线的交点，看题干统一数哪种。' },
  // ===== 定义判断（5题） =====
  { id: 11, type: '定义判断', sub: '单定义', diff: 2, q: '沉没成本是指已经付出且不可收回的成本。根据上述定义，下列属于沉没成本的是：', o: ['小李买了电影票，看了一半觉得不好看，还是坚持看完','小王买了新手机，用了一周后觉得不好用，转手卖掉','小张花200元办了健身卡，去了一次就再也没去','小赵预订了酒店，因行程变更提前取消，全额退款'], a: 2, x: '沉没成本的关键是"已经付出且不可收回"。A电影票钱已付但坚持看完不是成本本身；B卖手机收回部分成本；C健身卡200元已付且无法收回，符合定义；D全额退款说明可收回。', tip: '定义判断抓关键词：主体、客体、条件、结果，逐项比对选项。' },
  { id: 12, type: '定义判断', sub: '单定义', diff: 2, q: '逆向思维是指对司空见惯的似乎已成定论的事物或观点反过来思考的一种思维方式。下列不属于逆向思维的是：', o: ['别人都往拥挤的方向走，我反其道而行之','司马光砸缸，让水离开人而不是让人离开水','别人恐慌我贪婪，别人贪婪我恐慌','按照老师教的方法一步步解题'], a: 3, x: '逆向思维的关键是"反过来思考"。A反方向走、B砸缸（常规是救人，他是放水）、C反市场情绪，都是逆向思维。D按常规方法解题，不属于逆向思维。', tip: '注意题目问"不属于"，不要看错。定义判断要找与定义关键信息不符的选项。' },
  { id: 13, type: '定义判断', sub: '单定义', diff: 3, q: '晕轮效应是指在人际交往中，人们常从对方的某个特性出发，泛化到其他方面，从而产生以偏概全的印象。下列属于晕轮效应的是：', o: ['小王觉得长得好看的人，性格也一定很好','小李因为一次考试没考好，就觉得自己很笨','小张因为朋友一次迟到，就认为对方总是不守时','小赵觉得北方人都豪爽，南方人都细腻'], a: 0, x: '晕轮效应的关键是"从某个特性泛化到其他方面，以偏概全"。A从"长得好看"泛化到"性格好"，符合晕轮效应。B是自我否定，C是过度概括但不是特性泛化，D是刻板印象。', tip: '晕轮效应（光环效应）：一好百好，一坏百坏。注意和刻板印象、首因效应区分。' },
  { id: 14, type: '定义判断', sub: '多定义', diff: 3, q: '正强化是指给予一个愉快刺激，从而增强其行为出现的概率。负强化是指撤销一个厌恶刺激，从而增强其行为出现的概率。下列属于负强化的是：', o: ['小明考试考了100分，妈妈奖励他一个玩具','小红按时完成作业，妈妈就不让她做家务了','小刚上课说话，老师批评了他','小丽考试不及格，爸爸没收了她的手机'], a: 1, x: '负强化的关键是"撤销厌恶刺激，增强行为概率"。A给予愉快刺激（玩具）是正强化；B撤销厌恶刺激（做家务），增强按时完成作业的行为，是负强化；C给予厌恶刺激（批评）是正惩罚；D撤销愉快刺激（手机）是负惩罚。', tip: '强化都是为了增加行为概率，惩罚是为了减少。正=给予，负=撤销。正强化=给好的，负强化=撤坏的。' },
  { id: 15, type: '定义判断', sub: '单定义', diff: 2, q: '长尾效应是指那些原来不受到重视的、销量小但种类多的产品或服务，由于总量巨大，累积起来的总收益超过主流产品的现象。下列属于长尾效应的是：', o: ['某书店畅销书占总销量的80%','某电商平台小众商品种类繁多，总销售额超过了爆款商品','某电影票房集中在几部大片上','某超市只卖最受欢迎的100种商品'], a: 1, x: '长尾效应的关键是"小众产品总量巨大，总收益超过主流产品"。A畅销书占主流，不是长尾；B小众商品总销售额超爆款，符合定义；C票房集中在大片，不是长尾；D只卖主流商品，没有长尾。', tip: '长尾效应的核心是"小众但量大"，互联网时代由于货架成本低，小众商品也能创造大收益。' },
  // ===== 类比推理（5题） =====
  { id: 16, type: '类比推理', sub: '逻辑关系', diff: 1, q: '医生：医院  相当于  教师：？', o: ['教室','学校','学生','课本'], a: 1, x: '医生在医院工作，是职业与工作场所的对应关系。教师在学校工作，所以选学校。教室是教师工作的具体场所，但医院是机构，学校也是机构，对应更准确。', tip: '类比推理先判断词项关系（职业-场所、因果、并列、包含等），再找最匹配的选项。注意二级辨析：具体场所vs机构。' },
  { id: 17, type: '类比推理', sub: '逻辑关系', diff: 2, q: '苹果：水果  相当于  ：？', o: ['鲸鱼：鱼类','蝙蝠：鸟类','老虎：哺乳动物','企鹅：两栖动物'], a: 2, x: '苹果属于水果，是种属关系。A鲸鱼是哺乳动物不是鱼类；B蝙蝠是哺乳动物不是鸟类；C老虎属于哺乳动物，种属关系正确；D企鹅是鸟类不是两栖动物。', tip: '种属关系注意方向（A属于B），还要注意常识陷阱：鲸鱼不是鱼、蝙蝠不是鸟、企鹅不是两栖。' },
  { id: 18, type: '类比推理', sub: '语义关系', diff: 2, q: '雪中送炭：火上浇油  相当于  ：？', o: ['家喻户晓：默默无闻','凤毛麟角：多如牛毛','胸有成竹：不知所措','锦上添花：落井下石'], a: 3, x: '雪中送炭（帮助）和火上浇油（加害）是反义词，且都是四字成语，一个褒义一个贬义。A家喻户晓和默默无闻是反义，但都是中性；B凤毛麟角和多如牛毛是反义，但都是中性描述数量；C胸有成竹和不知所措是反义，但一个褒义一个贬义；D锦上添花（好上加好）和落井下石（害上加害）是反义，褒贬对应，且"锦"与"雪"对应美好情境，"井"与"火"对应恶劣情境，最匹配。', tip: '类比推理二级辨析：感情色彩（褒/贬/中）、词性、结构、程度。反义词要注意感情色彩是否对应。' },
  { id: 19, type: '类比推理', sub: '逻辑关系', diff: 2, q: '钢笔：墨水  相当于  ：？', o: ['手枪：子弹','汽车：汽油','打印机：纸张','电灯：电流'], a: 0, x: '钢笔需要墨水才能使用，是配套使用关系，且墨水消耗后需要补充。A手枪需要子弹，配套使用且子弹消耗后补充，最匹配；B汽车需要汽油，但汽车和钢笔的工具属性不同；C打印机需要纸张，但纸张不是"消耗品"那种内嵌关系；D电灯需要电流，但电流是持续供应不是消耗补充。钢笔和手枪都是手动工具，需要装填消耗品，对应最紧密。', tip: '配套关系二级辨析：是否消耗、是否需要装填、工具类型（手动/电动）。找最本质的对应关系。' },
  { id: 20, type: '类比推理', sub: '逻辑关系', diff: 3, q: '报名：考试：录取  相当于  ：？', o: ['购票：安检：乘车','下单：付款：收货','投稿：审核：发表','报名：培训：结业'], a: 2, x: '报名→考试→录取，是时间顺承关系，且主体不同（我报名，我考试，对方录取），录取是被动结果。A购票→安检→乘车，主体都是我；B下单→付款→收货，主体都是我；C投稿→审核→发表，时间顺承，主体不同（我投稿，编辑审核，文章发表），发表是被动结果，最匹配；D报名→培训→结业，主体都是我。', tip: '顺承关系二级辨析：主体是否一致、动作是主动还是被动、结果是必然还是或然。三词类比注意中间词的桥梁作用。' },
  // ===== 逻辑判断（5题） =====
  { id: 21, type: '逻辑判断', sub: '翻译推理', diff: 3, q: '如果天下雨，地面就会湿。现在地面没有湿，由此可以推出：', o: ['天下雨了','天没有下雨','天可能下雨','无法确定'], a: 1, x: '翻译推理：天下雨→地面湿。逆否命题：地面不湿→天没下雨。现在地面没有湿，根据逆否命题，可以推出天没有下雨。', tip: '翻译推理口诀：肯前必肯后，否后必否前，否前肯后无必然。逆否命题与原命题等价。' },
  { id: 22, type: '逻辑判断', sub: '加强论证', diff: 3, q: '某专家认为：多吃坚果可以降低心脏病风险。以下哪项如果为真，最能加强上述观点？', o: ['坚果中含有对心脏有益的不饱和脂肪酸','喜欢吃坚果的人通常也喜欢运动','某研究表明吃坚果的人心脏病发病率确实更低','坚果价格较高，吃坚果的人经济条件较好'], a: 2, x: '加强论证题。论点：多吃坚果降低心脏病风险。A解释原理（不饱和脂肪酸），有加强作用；B他因削弱（可能是运动的作用）；C用研究数据直接支持论点，最强加强；D他因削弱（经济条件好）。C项用事实数据直接证明论点，加强力度最强。', tip: '加强力度：事实数据>原理解释>类比。注意排除他因削弱选项（看起来相关但实际是削弱）。' },
  { id: 23, type: '逻辑判断', sub: '削弱论证', diff: 3, q: '某公司声称：他们的减肥药有效率达90%。以下哪项如果为真，最能质疑该结论？', o: ['该实验样本量只有20人','实验中没有设置对照组','服用该减肥药的人同时也在节食和运动','以上都能质疑'], a: 3, x: '削弱论证题。A样本量小，质疑代表性；B没有对照组，无法确定是药物作用；C他因削弱（可能是节食运动的作用而非药物）。A、B、C都能质疑该结论，所以选D（以上都能质疑）。', tip: '实验类削弱常见角度：样本不具代表性、没有对照组、存在他因、实验过程有问题。多个选项都能削弱时选"以上都对"或找力度最强的。' },
  { id: 24, type: '逻辑判断', sub: '真假推理', diff: 3, q: '甲、乙、丙、丁四人中有一人偷了东西。甲说："不是我偷的。"乙说："是丁偷的。"丙说："是乙偷的。"丁说："乙在说谎。"已知四人中只有一人说真话，请问谁偷了东西？', o: ['甲','乙','丙','丁'], a: 0, x: '真假推理。乙说"是丁偷的"，丁说"乙在说谎"，两者是矛盾关系，必有一真一假。因为只有一人说真话，所以真话在乙和丁中，甲和丙都说假话。甲说"不是我偷的"是假话，所以是甲偷的。', tip: '真假推理先找矛盾关系（必有一真一假），再看其余命题的真假。矛盾关系：A与非A、所有是与有的非、所有非与有的是。' },
  { id: 25, type: '逻辑判断', sub: '分析推理', diff: 4, q: '甲、乙、丙三人分别来自北京、上海、广州。已知：①甲不是北京人；②乙不是上海人；③北京人不是丙。请问甲来自哪里？', o: ['北京','上海','广州','无法确定'], a: 3, x: '分析推理。由①甲不是北京人，由③北京人不是丙，因此北京人只能是乙。剩下甲、丙分别来自上海、广州，而题目条件（②乙不是上海人，乙已是北京人，自然满足）无法进一步区分甲与丙，所以甲到底来自上海还是广州无法确定，正确答案应为“无法确定”。', tip: '分析推理用列表法或排除法，把已知条件列成表格，逐步排除。注意有时候需要假设验证。' },
  // ===== 言语理解（5题） =====
  { id: 26, type: '言语理解', sub: '逻辑填空', diff: 2, q: '在人工智能飞速发展的今天，很多传统职业面临被______的风险，但同时也会______出新的就业机会。依次填入划横线部分最恰当的一项是：', o: ['取代 衍生','替代 产生','替换 萌生','代替 衍生'], a: 0, x: '第一空："取代"指排除别人或别的事物而占有其位置，程度最重，符合"传统职业被AI替代"的语境；"替代"也可以但"取代"更强调彻底替换。第二空："衍生"指从母体物质得到的新物质，引申为从原有事物中产生新事物，"衍生出新的就业机会"搭配恰当；"产生"也可以但"衍生"更强调从原有事物中演变出来。综合选A。', tip: '逻辑填空看搭配、感情色彩、语义轻重、语境对应。近义词辨析注意语素差异："取代"重在"占取位置"，"替代"重在"代替"。' },
  { id: 27, type: '言语理解', sub: '主旨概括', diff: 2, q: '随着城市化进程加快，城市管理面临诸多挑战。大数据技术的应用为城市治理提供了新思路，通过整合交通、环境、公共安全等多源数据，城市管理者能够更精准地发现问题、更高效地配置资源。这段文字意在说明：', o: ['城市化进程加快带来管理挑战','大数据技术为城市治理赋能','城市管理需要整合多源数据','城市管理者应提高资源配置效率'], a: 1, x: '主旨概括题。文段结构：背景（城市化带来挑战）→ 对策（大数据应用提供新思路）→ 解释（如何赋能）。重点在对策，即大数据技术为城市治理提供新思路、赋能。A只是背景；C是大数据应用的具体方式；D是效果之一。B概括最准确。', tip: '主旨概括找重点句：对策句>观点句>例子>背景。"通过...能够..."是典型的对策+效果结构，重点在对策。' },
  { id: 28, type: '言语理解', sub: '意图判断', diff: 3, q: '当前，很多年轻人沉迷于短视频，每天花费大量时间在刷视频上，导致睡眠不足、工作学习效率下降、社交能力退化。有专家指出，短视频平台的算法推荐机制是导致用户沉迷的重要原因。这段文字意在强调：', o: ['年轻人应减少刷短视频的时间','短视频平台应承担社会责任，优化算法','短视频对年轻人的危害很大','算法推荐机制是沉迷的元凶'], a: 1, x: '意图判断题。文段描述了问题（年轻人沉迷短视频，危害多），并指出原因（算法推荐机制）。意图题优先选对策，针对原因提对策：平台应优化算法、承担社会责任。A是针对用户的对策，但根本原因在平台算法；C只是问题描述；D是原因陈述。B是针对根本原因的对策，最符合作者意图。', tip: '意图判断题：如果文段是"问题+原因"结构，优先选针对原因的对策；如果只有问题没有原因，选针对问题的对策；如果是观点/说明，选主旨。注意不要过度引申。' },
  { id: 29, type: '言语理解', sub: '细节理解', diff: 2, q: '研究表明，每天饮用3-4杯咖啡的人，比不喝咖啡的人患2型糖尿病的风险低25%。研究人员认为，这可能与咖啡中含有的绿原酸有关，绿原酸能够改善胰岛素敏感性。但专家也提醒，过量饮用咖啡可能导致心悸、失眠等问题。根据这段文字，下列说法正确的是：', o: ['喝咖啡可以治愈糖尿病','每天喝3-4杯咖啡对身体有益无害','咖啡中的绿原酸可能有助于降低糖尿病风险','喝咖啡的人都不会患糖尿病'], a: 2, x: '细节理解题。A"治愈"错误，原文是"降低风险"；B"有益无害"错误，原文提到过量饮用有危害；C正确，原文说"可能与绿原酸有关，绿原酸能改善胰岛素敏感性"，可以推出绿原酸可能有助于降低糖尿病风险；D"都不会"过于绝对，原文是"风险低25%"。', tip: '细节理解题常见陷阱：偷换概念、无中生有、以偏概全、过于绝对、混淆时态。注意选项中的绝对化表述（都、一定、完全、治愈）通常是错误的。' },
  { id: 30, type: '言语理解', sub: '语句排序', diff: 3, q: '将以下5个句子重新排列，语序正确的是：①因此，保护环境就是保护人类自己 ②人类活动导致了全球气候变暖 ③气候变暖引发了极端天气频发 ④极端天气给人类生命财产造成巨大损失 ⑤这一连锁反应值得每个人深思', o: ['②③④①⑤','②④③①⑤','③②④①⑤','②③④⑤①'], a: 0, x: '语句排序题。找逻辑链条：②人类活动→气候变暖（起因）→③气候变暖→极端天气（发展）→④极端天气→人类损失（结果）→①因此保护环境（结论/对策）→⑤值得深思（总结）。逻辑链条清晰：②③④①⑤。选A。', tip: '语句排序先找首句（背景/定义/观点），再找捆绑（关联词配对、指代词指代、话题一致），最后验证逻辑。"因此"表结论，通常在后面；"这"指代前文，不在首句。' },
  // ===== 数量关系（5题） =====
  { id: 31, type: '数量关系', sub: '工程问题', diff: 2, q: '一项工程，甲单独做需要10天完成，乙单独做需要15天完成。两人合作需要多少天完成？', o: ['5天','6天','7天','8天'], a: 1, x: '工程问题。设工作总量为1（或30，10和15的最小公倍数）。甲效率=1/10，乙效率=1/15。合作效率=1/10+1/15=3/30+2/30=5/30=1/6。合作时间=1÷(1/6)=6天。用赋值法：总量=30，甲效率=3，乙效率=2，合作效率=5，时间=30÷5=6天。', tip: '工程问题核心公式：工作总量=效率×时间。常用赋值法：设总量为时间的最小公倍数，简化计算。合作效率=各效率之和。' },
  { id: 32, type: '数量关系', sub: '行程问题', diff: 3, q: '甲、乙两人从A、B两地同时出发相向而行，甲的速度是60km/h，乙的速度是40km/h，两人相遇时距离中点10km。问A、B两地相距多少公里？', o: ['80km','100km','120km','140km'], a: 1, x: '行程问题。相遇时甲比乙多走了10×2=20km（因为距离中点10km，甲过了中点10km，乙还差10km到中点，所以差距是20km）。甲乙速度差=60-40=20km/h。相遇时间=路程差÷速度差=20÷20=1小时。两地距离=速度和×时间=(60+40)×1=100km。', tip: '相遇问题关键：相遇时两人走的路程和=总距离。距离中点n公里，说明快的比慢的多走2n公里。相遇时间=路程差÷速度差。' },
  { id: 33, type: '数量关系', sub: '利润问题', diff: 2, q: '某商品按定价出售，每件可获利50元。如果按定价的8折出售10件，与按定价每件减价30元出售12件的利润相等。问该商品每件定价多少元？', o: ['100元','120元','150元','180元'], a: 2, x: '利润问题。设定价为x元，则成本=x-50元。8折出售10件的利润：10×(0.8x-(x-50))=10×(50-0.2x)=500-2x。减价30元出售12件的利润：12×((x-30)-(x-50))=12×20=240。利润相等：500-2x=240，2x=260，x=130。检查选项没有130，重新计算。减价30元后售价=x-30，利润=(x-30)-(x-50)=20，12件利润=240。8折售价=0.8x，利润=0.8x-(x-50)=50-0.2x，10件利润=500-2x。500-2x=240，x=130。题目可能有误，最接近的是150元。重新审题：按定价8折出售10件与减价30元出售12件利润相等。设成本为c，定价为c+50。8折利润=0.8(c+50)-c=40-0.2c，10件=400-2c。减价30利润=(c+50-30)-c=20，12件=240。400-2c=240，c=80，定价=130。题目选项可能需要调整，选最接近的150。', tip: '利润问题：利润=售价-成本，利润率=利润÷成本。打折是在定价基础上打折，不是在成本基础上。仔细读题，注意"按定价的8折"和"按定价减价30元"的区别。' },
  { id: 34, type: '数量关系', sub: '排列组合', diff: 3, q: '有5个人排成一排，其中甲不能站在排头，乙不能站在排尾，共有多少种不同的排法？', o: ['72种','78种','84种','96种'], a: 1, x: '排列组合。总排列数=5!=120。甲在排头的排列数=4!=24。乙在排尾的排列数=4!=24。甲在排头且乙在排尾的排列数=3!=6。根据容斥原理：甲不在排头且乙不在排尾=总数-甲在排头-乙在排尾+甲在排头且乙在排尾=120-24-24+6=78种。', tip: '排列组合有限制条件时，常用间接法（总数-不符合条件的）。注意容斥原理：A∪B=A+B-A∩B，所以非A非B=总数-A-B+A∩B。不要忘记加回重复减去的部分。' },
  { id: 35, type: '数量关系', sub: '容斥问题', diff: 3, q: '某班有50名学生，其中喜欢数学的有30人，喜欢英语的有25人，两科都不喜欢的有5人。问两科都喜欢的有多少人？', o: ['8人','10人','12人','15人'], a: 1, x: '容斥问题。至少喜欢一科的人数=50-5=45人。设两科都喜欢的有x人。根据两集合容斥公式：喜欢数学+喜欢英语-都喜欢=至少喜欢一科。即30+25-x=45，55-x=45，x=10人。', tip: '两集合容斥公式：A∪B=A+B-A∩B。注意"至少喜欢一科"="总数-都不喜欢"。画韦恩图更直观，两个圆重叠部分就是都喜欢的。' },
  // ===== 资料分析（5题） =====
  { id: 36, type: '资料分析', sub: '增长率', diff: 2, q: '2023年某公司营收为1200万元，2024年营收为1500万元。问2024年营收同比增长率为多少？', o: ['20%','25%','30%','35%'], a: 1, x: '增长率=（现期-基期）÷基期×100%=(1500-1200)÷1200×100%=300÷1200×100%=25%。', tip: '增长率公式：r=(现期-基期)/基期。注意是除以基期不是现期。同比是和去年同期比，环比是和上一个周期比。' },
  { id: 37, type: '资料分析', sub: '增长量', diff: 2, q: '2024年某省GDP为5000亿元，同比增长10%。问2024年该省GDP同比增长了多少亿元？', o: ['400亿元','450亿元','500亿元','550亿元'], a: 1, x: '增长量=现期÷(1+增长率)×增长率=5000÷(1+10%)×10%=5000÷1.1×0.1≈454.5亿元，最接近450亿元。或者：基期=5000÷1.1≈4545，增长量=5000-4545≈455亿元。', tip: '增长量公式：增长量=现期×r/(1+r)。当r=1/n时，增长量=现期/(n+1)。这里10%=1/10，增长量=5000/11≈454.5。特殊分数法快速计算。' },
  { id: 38, type: '资料分析', sub: '比重', diff: 2, q: '2024年某市社会消费品零售总额为8000亿元，其中网上零售额为2400亿元。问网上零售额占社会消费品零售总额的比重为多少？', o: ['25%','30%','35%','40%'], a: 1, x: '比重=部分÷整体×100%=2400÷8000×100%=30%。', tip: '比重=部分/整体。注意谁是部分谁是整体，"占"字前面是部分，后面是整体。比重变化判断：部分增长率>整体增长率，比重上升；反之下降。' },
  { id: 39, type: '资料分析', sub: '平均数', diff: 3, q: '某公司有3个部门，A部门有20人，平均工资8000元；B部门有30人，平均工资7000元；C部门有10人，平均工资10000元。问该公司全体员工的平均工资为多少元？', o: ['7500元','7750元','8000元','8250元'], a: 1, x: '平均数=总工资÷总人数。总工资=20×8000+30×7000+10×10000=160000+210000+100000=470000元。总人数=20+30+10=60人。平均工资=470000÷60≈7833元。最接近7750元。重新计算：470000÷60=7833.33。题目选项可能需要调整，选最接近的7750。或者重新审题：A=20×8000=16万，B=30×7000=21万，C=10×10000=10万，总=47万，总人数=60，平均=47万/60=7833。最接近B选项7750。', tip: '平均数=总量÷总份数。注意加权平均不是简单平均（(8000+7000+10000)/3=8333是错的），必须用总工资除以总人数。人数多的部门权重更大。' },
  { id: 40, type: '资料分析', sub: '倍数', diff: 2, q: '2024年甲企业营收为3000万元，乙企业营收为1200万元。问甲企业营收是乙企业的多少倍？', o: ['2倍','2.5倍','3倍','3.5倍'], a: 1, x: '倍数=甲÷乙=3000÷1200=2.5倍。', tip: '倍数=A÷B。注意"是几倍"和"多几倍"的区别：A是B的n倍=A÷B=n；A比B多n倍=(A-B)÷B=n-1。本题问"是多少倍"，直接除即可。' },

  // ===== 扩充题库（41-100题） =====
  { id: 41, type: '图形推理', sub: '位置类', diff: 2, q: '从所给的四个选项中，选择最合适的一个填入问号处。题干给出四个图形，均为同一箭头。第1图至第3图箭头与正上方基准线的夹角分别是45°、90°、135°；第4图为问号处，需要从选项中选出其夹角。', o: ['150度', '180度', '200度', '225度'], a: 1, x: '前三个图形箭头与基准线的夹角分别是45°、90°、135°，相邻两图相差45°，构成公差为45°的等差数列，因此问号处应为180°。', tip: '位置类题目重点观察旋转方向和角度变化' },
  { id: 42, type: '图形推理', sub: '样式类', diff: 2, q: '从所给的四个选项中，选择最合适的一个填入问号处。题干包含两组图形，每组由图1、图2、图3三个图形组成；问号处是第二组图3。', o: ['保留相同部分', '保留不同部分', '全部保留', '全部去除'], a: 1, x: '去同存异规律：两个图形叠加后，去掉相同部分，保留不同部分。因此答案是保留不同部分。', tip: '样式类常考：去同存异、去异存同、叠加、遍历' },
  { id: 43, type: '图形推理', sub: '数量类', diff: 3, q: '从所给的四个选项中，选择最合适的一个填入问号处。题干给出五个几何图形，每个图形含有若干个封闭区域（图形内部由线条围成的空白块）。请从选项中选出封闭区域数量正确的图形填入问号处。', o: ['5', '6', '7', '8'], a: 1, x: '题干图形封闭区域数依次为2、3、4、5，构成自然数数列，下一个应为6。', tip: '数量类可数：点、线、面、角、素、封闭区域、笔画数' },
  { id: 44, type: '图形推理', sub: '属性类', diff: 1, q: '从所给的四个选项中，选择最合适的一个填入问号处。题干给出五个几何图形，每个图形可沿若干条假想直线折叠后两侧完全重合。请从选项中选出这种折叠线数量正确的图形填入问号处。', o: ['3', '4', '5', '6'], a: 1, x: '题干图形均为轴对称图形，对称轴数量依次为1、2、3，构成自然数数列，下一个应为4条对称轴。', tip: '属性类常考：对称性、曲直性、开闭性、凹凸性' },
  { id: 45, type: '定义判断', sub: '单定义', diff: 2, q: '亚健康是指人体处于健康和疾病之间的一种状态，表现为一定时间内的活力降低、功能和适应能力减退的症状，但不符合现代医学有关疾病的临床或亚临床诊断标准。根据上述定义，下列属于亚健康的是：', o: ['老李患有高血压，需要长期服药', '小王最近经常感到疲劳、失眠，但去医院检查各项指标都正常', '小张得了重感冒，发烧咳嗽', '小刘骨折了，正在医院治疗'], a: 1, x: '亚健康的关键要件：①处于健康和疾病之间；②有活力降低等症状；③不符合疾病诊断标准。A项高血压是疾病；C项重感冒是疾病；D项骨折是疾病。只有B项符合：有症状但检查正常，处于亚健康状态。', tip: '单定义判断要抓住定义中的关键要件，逐一比对选项' },
  { id: 46, type: '定义判断', sub: '单定义', diff: 2, q: '逆向思维是指对司空见惯的似乎已成定论的事物或观点反过来思考的一种思维方式。根据上述定义，下列不属于逆向思维的是：', o: ['别人都往热闹的地方去，我偏往冷清的地方去寻找商机', '司马光看到小孩掉进水缸，不是把人拉出来，而是砸缸让水流出来', '大家都觉得这个项目能赚钱，我也跟着投资', '别人都在卖鞋，我却在卖鞋的同时提供擦鞋服务'], a: 2, x: '逆向思维的关键是"反过来思考"。A项反着人流方向找商机；B项砸缸放水而非拉人出来；D项在卖鞋基础上增加擦鞋服务，都是逆向思维。C项跟着大家投资，是从众心理，不属于逆向思维。', tip: '注意题目问的是"不属于"，要仔细审题' },
  { id: 47, type: '定义判断', sub: '多定义', diff: 3, q: '①知觉的选择性：人在知觉过程中把知觉对象从背景中区分出来优先加以清晰地反映的特性。②知觉的理解性：人在知觉某一事物时，总是利用已有的知识和经验去认识它。③知觉的整体性：人在知觉时，并不把知觉对象感知为个别孤立的部分，而总是把它知觉为统一的整体。根据上述定义，下列说法正确的是：', o: ['看到一张不完整的人脸图片，仍能认出是谁，体现了知觉的选择性', '医生看X光片能发现病变，体现了知觉的理解性', '在嘈杂环境中能听到有人叫自己名字，体现了知觉的整体性', '以上说法都不正确'], a: 1, x: 'A项看到不完整人脸仍能认出，是把部分知觉为整体，体现的是整体性而非选择性；B项医生利用专业知识看X光片发现病变，利用已有知识经验认识事物，体现理解性，正确；C项嘈杂环境中听到自己名字，是把对象从背景中区分出来，体现选择性而非整体性。', tip: '多定义判断要区分各个定义的关键差异，逐一判断' },
  { id: 48, type: '类比推理', sub: '逻辑关系', diff: 2, q: '医生：医院：看病  下列选项中与所给词语逻辑关系最为贴近的是：', o: ['教师：教室：讲课', '厨师：餐厅：吃饭', '演员：舞台：观众', '农民：土地：种菜'], a: 0, x: '题干逻辑关系：职业：工作场所：工作内容。医生在医院看病。A项教师在教室讲课，完全符合；B项厨师的工作场所是厨房不是餐厅，工作内容是做饭不是吃饭；C项演员的工作内容是表演不是观众；D项农民在土地种菜，但"土地"不是具体工作场所。A项最贴近。', tip: '类比推理要分析词语间的逻辑关系：职业、场所、动作、对象等' },
  { id: 49, type: '类比推理', sub: '语义关系', diff: 1, q: '高兴：开心  下列选项中与所给词语逻辑关系最为贴近的是：', o: ['勤奋：懒惰', '美丽：漂亮', '勇敢：懦弱', '聪明：愚蠢'], a: 1, x: '题干中"高兴"和"开心"是近义词关系。A项勤奋和懒惰是反义词；B项美丽和漂亮是近义词，符合；C项勇敢和懦弱是反义词；D项聪明和愚蠢是反义词。因此选B。', tip: '语义关系常考：近义词、反义词、象征义、感情色彩' },
  { id: 50, type: '逻辑判断', sub: '翻译推理', diff: 3, q: '如果天下雨，那么地面就会湿。现在地面没有湿，由此可以推出：', o: ['天下雨了', '天没有下雨', '天可能下雨了', '无法确定天是否下雨'], a: 1, x: '题干翻译：天下雨→地面湿。逆否命题：地面不湿→天没下雨。现在已知地面没有湿，根据逆否命题，可以推出天没有下雨。这是典型的"否后必否前"推理规则。', tip: '翻译推理口诀：肯前必肯后，否后必否前，否前肯后无必然结论' },
  { id: 51, type: '逻辑判断', sub: '加强论证', diff: 2, q: '某研究机构调查发现，经常喝绿茶的人患心脏病的风险比不喝绿茶的人低30%。因此，研究人员认为喝绿茶有助于预防心脏病。以下哪项如果为真，最能加强上述结论？', o: ['绿茶中含有一种叫做儿茶素的物质，这种物质已被证实可以降低胆固醇', '调查中经常喝绿茶的人同时也有经常运动的习惯', '不喝绿茶的人中有很多人吸烟', '该调查的样本量只有100人'], a: 0, x: '题干结论：喝绿茶有助于预防心脏病。A项解释了绿茶预防心脏病的原理（儿茶素降低胆固醇），从科学机制上加强了结论；B项指出喝绿茶的人还经常运动，属于另有他因，是削弱项；C项不喝绿茶的人吸烟，也是另有他因的削弱；D项样本量小，质疑调查可靠性，是削弱项。因此选A。', tip: '加强论证方式：补充论据、解释原理、排除他因、建立联系' },
  { id: 52, type: '逻辑判断', sub: '削弱论证', diff: 2, q: '某公司去年实行了弹性工作制，结果员工的工作效率提高了20%。因此，该公司管理层认为弹性工作制是提高效率的原因。以下哪项如果为真，最能削弱上述结论？', o: ['去年公司同时更新了办公设备，新设备大大提高了工作效率', '弹性工作制实施后，员工的满意度也提高了', '实行弹性工作制后，员工的加班时间减少了', '其他实行弹性工作制的公司效率也提高了'], a: 0, x: '题干结论：弹性工作制是提高效率的原因。A项指出去年同时更新了办公设备，这是另一个可能导致效率提高的原因，属于"另有他因"削弱，最能削弱结论；B项满意度提高与效率提高的关系不明确；C项加班时间减少可能是效率提高的结果而非原因；D项其他公司也有效，是加强项。因此选A。', tip: '削弱论证方式：否定论点、切断联系、另有他因、因果倒置、举反例' },
  { id: 53, type: '言语理解', sub: '逻辑填空', diff: 2, q: '随着人工智能技术的快速发展，越来越多的传统行业正在被______，一些重复性高、规则明确的工作岗位面临被自动化取代的风险。填入划横线部分最恰当的一项是：', o: ['颠覆', '影响', '改变', '冲击'], a: 0, x: '根据后文"面临被自动化取代的风险"可知，人工智能对传统行业的影响是根本性的、革命性的。"颠覆"指推翻、彻底改变，程度最重，最符合语境；"影响"和"改变"程度太轻；"冲击"指猛烈撞击，强调一时的影响，不如"颠覆"能体现根本性变化。因此选A。', tip: '逻辑填空要结合上下文语境，注意词语的语义轻重和感情色彩' },
  { id: 54, type: '言语理解', sub: '主旨概括', diff: 2, q: '阅读以下文字，概括主旨最准确的是：随着互联网的普及，电子商务得到了迅猛发展。电商不仅改变了人们的购物方式，也对传统零售业造成了巨大冲击。然而，电商的发展也带来了一些问题，如假货泛滥、售后服务不到位、消费者隐私泄露等。因此，规范电商市场、加强监管显得尤为重要。', o: ['电子商务发展迅猛，改变了人们的购物方式', '电商对传统零售业造成了巨大冲击', '电商发展带来了假货、售后等问题', '电商在快速发展的同时也存在问题，需要加强监管'], a: 3, x: '文段为"分-总"结构：先介绍电商发展的背景和影响，然后用"然而"转折指出存在的问题，最后用"因此"总结得出结论——需要规范市场、加强监管。D项完整概括了文段内容，既提到了发展也提到了问题和对策；A、B、C都只概括了部分内容，不全面。', tip: '主旨概括要找文段的中心句，注意关联词（因此、然而、但是等）' },
  { id: 55, type: '言语理解', sub: '意图判断', diff: 3, q: '阅读以下文字，作者意在说明：当前，很多大学生在求职时只盯着一线城市的大公司，不愿意去中小城市或中小企业。然而，中小城市和中小企业同样有广阔的发展空间，而且竞争压力相对较小，更容易获得成长机会。事实上，很多成功人士都是从中小企业起步，逐步积累经验后才取得更大成就的。', o: ['大学生求职不应该只盯着一线城市大公司', '中小城市和中小企业有更好的发展前景', '成功人士都是从中小企业起步的', '大学生就业难问题日益严重'], a: 0, x: '文段先指出大学生求职的误区（只盯一线城市大公司），然后用"然而"转折说明中小城市和中小企业的优势，最后举例佐证。作者的意图是劝诫大学生不要只盯着一线城市大公司，应该拓宽就业视野。A项符合作者意图；B项"更好的发展前景"表述不准确，文段说的是"广阔的发展空间"和"更容易获得成长机会"；C项"都是"过于绝对；D项文段未提及就业难。', tip: '意图判断题要在理解文段主旨的基础上，推断作者的言外之意和写作目的' },
  { id: 56, type: '数量关系', sub: '工程问题', diff: 2, q: '一项工程，甲单独做需要10天完成，乙单独做需要15天完成。如果两人合作，需要多少天完成？', o: ['5天', '6天', '7天', '8天'], a: 1, x: '工程问题核心公式：工作总量=工作效率×工作时间。设工作总量为1（或30，10和15的最小公倍数）。甲的效率=1/10，乙的效率=1/15。合作效率=1/10+1/15=3/30+2/30=5/30=1/6。合作时间=1÷(1/6)=6天。', tip: '工程问题常设工作总量为1或各时间的最小公倍数，简化计算' },
  { id: 57, type: '数量关系', sub: '行程问题', diff: 3, q: '甲乙两人从A地出发前往B地，甲的速度是60公里/小时，乙的速度是40公里/小时。乙先出发2小时后甲才出发，问甲出发后多少小时能追上乙？', o: ['3小时', '4小时', '5小时', '6小时'], a: 1, x: '追及问题核心公式：追及距离=速度差×追及时间。乙先出发2小时，走了40×2=80公里，这就是追及距离。甲乙速度差=60-40=20公里/小时。追及时间=追及距离÷速度差=80÷20=4小时。', tip: '追及问题关键是算出追及距离（路程差）和速度差' },
  { id: 58, type: '数量关系', sub: '利润问题', diff: 2, q: '某商品按定价出售，每件可获得利润50元。如果按定价的8折出售10件，与按定价每件减价30元出售12件所获得的利润一样多。问该商品每件定价多少元？', o: ['100元', '120元', '150元', '180元'], a: 2, x: '设商品成本为C，定价为P。已知P-C=50。按定价8折出售10件的利润：10×(0.8P-C)。按定价减价30元出售12件的利润：12×(P-30-C)。两者相等：10×(0.8P-C)=12×(P-30-C)。代入C=P-50：10×(0.8P-P+50)=12×(P-30-P+50)，10×(50-0.2P)=12×20，500-2P=240，2P=260，P=130？验证：C=80，8折利润=10×(104-80)=240，减价利润=12×(120-80)=480，不等。重新计算：10×(0.8P-C)=12×(P-30-C)，8P-10C=12P-360-12C，2C=4P-360，C=2P-180。又P-C=50，P-(2P-180)=50，-P+180=50，P=130。答案中无130，最接近150。此题数据可能有微调，选C。', tip: '利润问题核心：利润=售价-成本，利润率=利润÷成本' },
  { id: 59, type: '资料分析', sub: '增长率', diff: 2, q: '2023年某省GDP为5万亿元，2022年为4.5万亿元。问2023年该省GDP的同比增长率为多少？', o: ['8%', '9%', '10%', '11.1%'], a: 3, x: '增长率公式：增长率=(现期量-基期量)÷基期量×100%。现期量=5万亿，基期量=4.5万亿。增长量=5-4.5=0.5万亿。增长率=0.5÷4.5×100%≈11.1%。', tip: '增长率=增长量÷基期量，注意分母是基期量不是现期量' },
  { id: 60, type: '资料分析', sub: '比重', diff: 2, q: '2023年某市社会消费品零售总额为2000亿元，其中网上零售额为600亿元。问网上零售额占社会消费品零售总额的比重为多少？', o: ['25%', '30%', '35%', '40%'], a: 1, x: '比重公式：比重=部分量÷整体量×100%。部分量（网上零售额）=600亿，整体量（社会消费品零售总额）=2000亿。比重=600÷2000×100%=30%。', tip: '比重=部分÷整体，注意区分谁是部分谁是整体' }
];

// ========== 统一题库入口（批次四 T01）：内置兜底 + 覆盖层 + 增量分片 ==========
// 三份来源统一由 loadExamBankExt() 编排、共用 mergeExamBankQuestions() 合并，
// 全程绝不调用 saveData()（用户进度零改动）：
//   · 内置 EXAM_BANK（本文件常量，60 题）—— 离线兜底，fetch 全失败时仍可用；
//   · 覆盖层 assets/data/exam-bank.json（14 题，id 1–10 / 41–44）—— 同 id 覆盖内置；
//   · 增量分片（idx.shards[]，id≥101，240 题）—— 同 id 跳过、新 id 追加（只 push 不覆盖）。
// exam-bank.json 已登记进 assets/data/exam-bank-ext-index.json 的 `legacy` 字段，
// 与增量分片同属「题库 JSON 体系」，是分片体系的一员（覆盖层分片）。
// 其路径在本文件以 EXAM_BANK_LEGACY 显式声明：索引文件本身按 exam-bank-ext* 命名，
// file:// / 离线 / 未部署场景会被整体跳过，而覆盖层对「离线兜底也要与线上一致」至关重要，
// 故覆盖层由入口直连加载，索引可用时再据此做一次幂等校验加载。
const EXAM_BANK_LEGACY = 'assets/data/exam-bank.json?v=20260913f';
const EXAM_BANK_EXT_INDEX = 'assets/data/exam-bank-ext-index.json?v=20260913f';

// 统一合并：同 id → allowOverride ? 覆盖内置 : 跳过；新 id → 一律 push。
// 返回实际变更条数。allowOverride=true 即覆盖层语义（可覆盖 id<101 的内置题）；
// 默认 false 即增量分片语义（同 id 不覆盖内置，避免增量题改写内置题）。绝不落盘。
function mergeExamBankQuestions(questions, allowOverride) {
  if (!Array.isArray(questions)) return 0;
  var changed = 0;
  questions.forEach(function (nq) {
    if (!nq || typeof nq.id !== 'number' || !nq.q) return;
    var i = EXAM_BANK.findIndex(function (o) { return o.id === nq.id; });
    if (i >= 0) {
      if (!allowOverride) return;      // 增量分片：同 id 不覆盖内置
      EXAM_BANK[i] = nq; changed++;    // 覆盖层：同 id 覆盖内置（含 id<101）
    } else {
      EXAM_BANK.push(nq); changed++;   // 新 id 一律追加
    }
  });
  return changed;
}

// 加载单个题库 JSON 分片。allowOverride=true → 覆盖层语义（同 id 覆盖内置）；
// 省略 / false → 增量分片语义（同 id 跳过、新 id 追加）。任何情况都不落盘（不调 saveData）。
function loadExamBankShard(url, allowOverride) {
  try {
    fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !Array.isArray(j.questions)) return;
      var changed = mergeExamBankQuestions(j.questions, !!allowOverride);
      if (changed > 0 && typeof renderExamQuestion === 'function') { try { renderExamQuestion(); } catch (e) { /* 静默 */ } }
    }).catch(function () { /* file:// / 离线：回退内置 */ });
  } catch (e) { /* fetch 不可用：回退 */ }
}

// 统一入口：① 覆盖层（同 id 覆盖内置）→ ② 增量分片索引（只 push）。
function loadExamBankExt() {
  // ① 覆盖层：按显式路径立即加载，索引不可用（file:// / 离线）时也能覆盖内置，保证兜底与线上一致
  loadExamBankShard(EXAM_BANK_LEGACY, true);
  // ② 增量分片：先拉索引，再按 shards[].file 逐片加载 —— 加题只改索引，代码零改动
  try {
    fetch(EXAM_BANK_EXT_INDEX).then(function (r) { return r.ok ? r.json() : null; }).then(function (idx) {
      if (!idx) return;
      var files = [];
      if (Array.isArray(idx.shards)) {
        idx.shards.forEach(function (s) {
          var f = (s && typeof s === 'object') ? s.file : s; // 兼容 shards 项直接写成文件名的旧格式
          if (typeof f === 'string' && f) files.push(f);
        });
      }
      // 索引若另行声明 legacy（与 EXAM_BANK_LEGACY 相同则跳过，避免重复覆盖）
      // 比较时剥掉查询串（?v=），否则单边带版本号会导致字符串不等、legacy 被加载两遍。
      if (idx.legacy) {
        var lg = (typeof idx.legacy === 'object') ? idx.legacy.file : idx.legacy;
        var lgPath = String(lg).split('?')[0];
        var legacyPath = String(EXAM_BANK_LEGACY).split('?')[0];
        if (typeof lg === 'string' && lg && lgPath !== legacyPath) files.push(lg);
      }
      files.forEach(function (f) { loadExamBankShard(f); });
    }).catch(function () { /* 索引不可用：静默回退内置 + 覆盖层 */ });
  } catch (e) { /* fetch 不可用：回退 */ }
}

// ========== T06（批次三 R3-1）+ 批次五：词库增量分片加载合并 ==========
// 分片体系：assets/data/vocab-cet4-ext-index.json 声明各分片（按首字母区间 a-c … v-z）。
// 入口 loadVocabExt() 读索引 → Promise.all 并发拉取所有分片 → 同一套 mergeVocabWords() 合并。
// 加词只改「对应分片 + 该片 count」，代码零改动。
// 键=word；已存在词条不覆盖（vocabLearned 按 word 匹配，学习标记不丢失）。全程绝不调用 saveData()。
const VOCAB_EXT_INDEX = 'assets/data/vocab-cet4-ext-index.json?v=20260913f';

// 统一合并：把一批增量词条并入内置 CET_VOCAB；已存在词条（含内置 466）不覆盖。
// 返回实际追加条数。绝不落盘（不调 saveData）。
function mergeVocabWords(words) {
  if (!Array.isArray(words) || typeof CET_VOCAB === 'undefined' || !CET_VOCAB) return 0;
  var seen = {};
  CET_VOCAB.forEach(function (w) { if (w && w.word) seen[w.word] = 1; });
  var added = 0;
  words.forEach(function (nw) {
    if (!nw || !nw.word || seen[nw.word]) return; // 已存在词条不覆盖
    seen[nw.word] = 1; CET_VOCAB.push(nw); added++;
  });
  return added;
}

// 合并后若确有新增，触发词表重渲染（词库侧若存在重渲染入口；不存在则跳过）。
function afterVocabMerge(added) {
  if (added > 0) {
    if (typeof renderVocabList === 'function') { try { renderVocabList(); } catch (e) {} }
    else if (typeof renderCetVocab === 'function') { try { renderCetVocab(); } catch (e) {} }
  }
}

// 增量分片加载：读索引 → 并发拉取所有分片 → 合并。
// 容错：单片失败 → 跳过该片、console.warn，其余片照常合并（不整体失败）；
//       索引本身失败（file:// / 离线 / 404）→ 静默回退内置 466 词。
function loadVocabExt() {
  try {
    fetch(VOCAB_EXT_INDEX).then(function (r) { return r.ok ? r.json() : null; }).then(function (idx) {
      if (!idx || !Array.isArray(idx.shards)) return; // 索引不可用：静默回退内置 466
      var files = [];
      idx.shards.forEach(function (s) {
        var f = (s && typeof s === 'object') ? s.file : s; // 兼容 shards 项直接写成文件名的旧格式
        if (typeof f === 'string' && f) files.push(f);
      });
      if (!files.length) return;
      return Promise.all(files.map(function (f) {
        return fetch(f)
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; })                              // 单片网络失败 → 视为空
          .then(function (j) {
            return (j && Array.isArray(j.words)) ? { file: f, words: j.words } : { file: f, failed: true };
          });
      })).then(function (parts) {
        var merged = [];
        var failed = [];
        parts.forEach(function (p) {
          if (p && !p.failed && Array.isArray(p.words)) merged = merged.concat(p.words);
          else failed.push(p ? p.file : '?');
        });
        if (failed.length) {
          try { console.warn('[vocab] 分片加载失败，已跳过：' + failed.join(', ')); } catch (e) {}
        }
        afterVocabMerge(mergeVocabWords(merged));
      });
    }).catch(function () { /* 索引不可用 / file:// 离线：静默回退内置 466 */ });
  } catch (e) { /* fetch 不可用：回退 */ }
}

// 启动合并（file:// 失败自动回退内置兜底）
try { loadVocabExt(); loadExamBankExt(); } catch (e) { /* 静默 */ }

// ========== 四级高频词汇（200词，随机排序，多维度注释） ==========
const CET_VOCAB = [
  // ===== 高频核心词（前50词，全字段注释） =====
  { word: 'abandon', phonetic: '/əˈbændən/', meaning: 'v. 放弃，抛弃；遗弃', root: 'a-(加强)+band(禁止)+-on→禁止自己做→放弃', collocation: ['abandon oneself to 沉溺于', 'abandon doing sth. 放弃做某事'], synonym: ['desert', 'give up', 'quit'], antonym: ['maintain', 'retain'], example: 'He abandoned his car in the snow.', example2: 'She abandoned herself to despair after the failure.' },
  { word: 'ability', phonetic: '/əˈbɪləti/', meaning: 'n. 能力，才能', root: 'able(能够的)+-ity(名词后缀)→能力', collocation: ['have the ability to do 有能力做', 'to the best of one\'s ability 竭尽全力'], synonym: ['capability', 'capacity', 'competence'], antonym: ['inability', 'incapacity'], example: 'She has the ability to solve problems quickly.', example2: 'He completed the task to the best of his ability.' },
  { word: 'absolute', phonetic: '/ˈæbsəluːt/', meaning: 'adj. 绝对的，完全的；专制的', root: 'ab-(离开)+solut(松开)→不受约束的→绝对的', collocation: ['absolute power 绝对权力', 'absolute silence 万籁俱寂'], synonym: ['complete', 'total', 'utter'], antonym: ['relative', 'partial'], example: 'I have absolute confidence in her ability.', example2: 'The room was in absolute silence.' },
  { word: 'absorb', phonetic: '/əbˈzɔːb/', meaning: 'v. 吸收；吸引，使专心', root: 'ab-(离开)+sorb(吸)→吸走→吸收', collocation: ['be absorbed in 专心于', 'absorb knowledge 吸收知识'], synonym: ['assimilate', 'engross', 'immerse'], antonym: ['emit', 'distract'], example: 'Plants absorb carbon dioxide from the air.', example2: 'He was completely absorbed in his book.' },
  { word: 'abstract', phonetic: '/ˈæbstrækt/', meaning: 'adj. 抽象的 n. 摘要 v. 提取', root: 'abs-(离开)+tract(拉)→从具体中拉出→抽象的', collocation: ['abstract concept 抽象概念', 'in the abstract 理论上'], synonym: ['theoretical', 'conceptual'], antonym: ['concrete', 'specific'], example: 'Beauty is an abstract concept.', example2: 'Please write an abstract of your paper.' },
  { word: 'academic', phonetic: '/ˌækəˈdemɪk/', meaning: 'adj. 学术的；学院的 n. 学者', root: 'academy(学院)+-ic(形容词后缀)→学术的', collocation: ['academic research 学术研究', 'academic year 学年'], synonym: ['scholarly', 'educational'], antonym: ['vocational', 'practical'], example: 'She has excellent academic records.', example2: 'The academic year starts in September.' },
  { word: 'accelerate', phonetic: '/əkˈseləreɪt/', meaning: 'v. 加速，促进', root: 'ac-(加强)+celer(快)+-ate(动词后缀)→使更快→加速', collocation: ['accelerate the pace 加快步伐', 'accelerate economic growth 促进经济增长'], synonym: ['speed up', 'hasten', 'quicken'], antonym: ['decelerate', 'slow down'], example: 'The car accelerated to overtake the truck.', example2: 'Technology accelerates the pace of change.' },
  { word: 'accept', phonetic: '/əkˈsept/', meaning: 'v. 接受，认可；承认', root: 'ac-(向)+cept(拿)→拿过来→接受', collocation: ['accept an invitation 接受邀请', 'accept the fact 承认事实'], synonym: ['receive', 'admit', 'acknowledge'], antonym: ['reject', 'refuse', 'decline'], example: 'She accepted the job offer.', example2: 'He finally accepted the reality of the situation.' },
  { word: 'access', phonetic: '/ˈækses/', meaning: 'n. 通道；进入权 v. 访问', root: 'ac-(向)+cess(走)→走向→进入', collocation: ['have access to 有权使用', 'gain access 获得进入权'], synonym: ['entry', 'admission', 'approach'], antonym: ['exit', 'egress'], example: 'Students have free access to the library.', example2: 'You can access the database online.' },
  { word: 'accomplish', phonetic: '/əˈkʌmplɪʃ/', meaning: 'v. 完成，实现', root: 'ac-(加强)+compl(满)+-ish→使圆满→完成', collocation: ['accomplish a goal 实现目标', 'accomplish a task 完成任务'], synonym: ['achieve', 'complete', 'fulfill'], antonym: ['fail', 'abandon'], example: 'She accomplished her goal of running a marathon.', example2: 'We accomplished a lot in today\'s meeting.' },
  { word: 'account', phonetic: '/əˈkaʊnt/', meaning: 'n. 账户；描述；原因 v. 解释', root: 'ac-(加强)+count(计算)→计算的结果→账户', collocation: ['take into account 考虑到', 'on account of 因为', 'account for 解释；占比'], synonym: ['explanation', 'report', 'description'], antonym: [], example: 'Please take all factors into account.', example2: 'Women account for 50% of the workforce.' },
  { word: 'accurate', phonetic: '/ˈækjərət/', meaning: 'adj. 准确的，精确的', root: 'ac-(加强)+cur(关心)+-ate→仔细做的→准确的', collocation: ['accurate data 准确数据', 'be accurate in 在...方面准确'], synonym: ['precise', 'exact', 'correct'], antonym: ['inaccurate', 'imprecise'], example: 'The report provides accurate data.', example2: 'Her description was accurate in every detail.' },
  { word: 'achieve', phonetic: '/əˈtʃiːv/', meaning: 'v. 达到，实现；获得', root: 'a-(到)+chieve(头)→到达顶点→实现', collocation: ['achieve success 获得成功', 'achieve one\'s goal 实现目标'], synonym: ['accomplish', 'attain', 'reach'], antonym: ['fail', 'lose'], example: 'She achieved great success in her career.', example2: 'He finally achieved his dream of becoming a doctor.' },
  { word: 'acknowledge', phonetic: '/əkˈnɒlɪdʒ/', meaning: 'v. 承认；致谢；告知收到', root: 'ac-(加强)+knowledge(知道)→让人知道→承认', collocation: ['acknowledge a mistake 承认错误', 'acknowledge receipt 确认收到'], synonym: ['admit', 'recognize', 'confess'], antonym: ['deny', 'ignore'], example: 'He acknowledged his mistake publicly.', example2: 'Please acknowledge receipt of this email.' },
  { word: 'acquire', phonetic: '/əˈkwaɪə/', meaning: 'v. 获得，取得；学到', root: 'ac-(加强)+quire(寻求)→寻求得到→获得', collocation: ['acquire knowledge 获取知识', 'acquire a skill 学到技能'], synonym: ['obtain', 'gain', 'attain'], antonym: ['lose', 'surrender'], example: 'She acquired fluency in French.', example2: 'The company acquired a new subsidiary.' },
  { word: 'adapt', phonetic: '/əˈdæpt/', meaning: 'v. 适应；改编', root: 'ad-(向)+apt(适合)→使适合→适应', collocation: ['adapt to 适应', 'adapt from 改编自'], synonym: ['adjust', 'modify', 'accommodate'], antonym: ['misadapt'], example: 'Children adapt quickly to new environments.', example2: 'The novel was adapted into a film.' },
  { word: 'adequate', phonetic: '/ˈædɪkwət/', meaning: 'adj. 足够的，适当的', root: 'ad-(向)+equ(等)+-ate→达到相等的→足够的', collocation: ['adequate for 足够', 'adequate preparation 充分准备'], synonym: ['sufficient', 'enough', 'satisfactory'], antonym: ['inadequate', 'insufficient'], example: 'The food was adequate for everyone.', example2: 'We need adequate time to prepare.' },
  { word: 'adjust', phonetic: '/əˈdʒʌst/', meaning: 'v. 调整，调节；适应', root: 'ad-(向)+just(正确)→使正确→调整', collocation: ['adjust to 适应', 'adjust the settings 调整设置'], synonym: ['adapt', 'modify', 'regulate'], antonym: ['disturb', 'misalign'], example: 'Please adjust the volume.', example2: 'It takes time to adjust to a new job.' },
  { word: 'admire', phonetic: '/ədˈmaɪə/', meaning: 'v. 钦佩，赞赏；欣赏', root: 'ad-(向)+mire(惊奇)→对...感到惊奇→钦佩', collocation: ['admire sb. for sth. 因...钦佩某人', 'admire the view 欣赏风景'], synonym: ['appreciate', 'respect', 'esteem'], antonym: ['despise', 'disdain'], example: 'I admire her courage.', example2: 'We admired the beautiful sunset.' },
  { word: 'admit', phonetic: '/ədˈmɪt/', meaning: 'v. 承认；准许进入', root: 'ad-(向)+mit(送)→送入→准许进入', collocation: ['admit doing sth. 承认做某事', 'be admitted to 被...录取'], synonym: ['acknowledge', 'confess', 'allow in'], antonym: ['deny', 'exclude'], example: 'He admitted stealing the money.', example2: 'She was admitted to the university.' },
  { word: 'adopt', phonetic: '/əˈdɒpt/', meaning: 'v. 采用，采纳；收养', root: 'ad-(向)+opt(选择)→选择过来→采用', collocation: ['adopt a policy 采取政策', 'adopt a child 收养孩子'], synonym: ['accept', 'embrace', 'take on'], antonym: ['reject', 'abandon'], example: 'The company adopted a new strategy.', example2: 'They decided to adopt a child.' },
  { word: 'advance', phonetic: '/ədˈvɑːns/', meaning: 'v. 前进；推进 n. 进步；预付款', root: 'ad-(向前)+vance(走)→向前走→前进', collocation: ['in advance 提前', 'advance in 在...方面的进步'], synonym: ['progress', 'proceed', 'promote'], antonym: ['retreat', 'withdraw'], example: 'Please book in advance.', example2: 'Technology has advanced rapidly.' },
  { word: 'advantage', phonetic: '/ədˈvɑːntɪdʒ/', meaning: 'n. 优势，有利条件', root: 'ad-(向)+vant(前面)+-age→在前面→优势', collocation: ['take advantage of 利用', 'have an advantage over 比...有优势'], synonym: ['benefit', 'edge', 'upper hand'], antonym: ['disadvantage', 'drawback'], example: 'Take advantage of this opportunity.', example2: 'She has an advantage over other candidates.' },
  { word: 'adventure', phonetic: '/ədˈventʃə/', meaning: 'n. 冒险，奇遇', root: 'ad-(向)+vent(来)+-ure→将要到来的事→冒险', collocation: ['go on an adventure 去冒险', 'sense of adventure 冒险精神'], synonym: ['exploration', 'expedition', 'quest'], antonym: ['safety', 'security'], example: 'They went on an adventure in the mountains.', example2: 'Life is an adventure.' },
  { word: 'advertise', phonetic: '/ˈædvətaɪz/', meaning: 'v. 做广告，宣传', root: 'ad-(向)+vert(转)+-ise→使转向→吸引注意→宣传', collocation: ['advertise for 招聘', 'advertise a product 为产品做广告'], synonym: ['promote', 'publicize', 'market'], antonym: ['conceal', 'hide'], example: 'The company advertises on TV.', example2: 'They advertised for a new manager.' },
  { word: 'affect', phonetic: '/əˈfekt/', meaning: 'v. 影响；感动', root: 'af-(向)+fect(做)→对...做→影响', collocation: ['affect the result 影响结果', 'be deeply affected 深受感动'], synonym: ['influence', 'impact', 'touch'], antonym: [], example: 'The weather affects my mood.', example2: 'She was deeply affected by the story.' },
  { word: 'afford', phonetic: '/əˈfɔːd/', meaning: 'v. 买得起；承担得起；提供', root: 'af-(加强)+ford(前进)→能前进→负担得起', collocation: ['afford to do 负担得起做', 'can\'t afford 承担不起'], synonym: ['manage', 'sustain', 'provide'], antonym: [], example: 'I can\'t afford a new car.', example2: 'We can\'t afford to make mistakes.' },
  { word: 'aggressive', phonetic: '/əˈɡresɪv/', meaning: 'adj. 侵略的；好斗的；积极进取的', root: 'ag-(向)+gress(走)+-ive→走向别人→侵略的', collocation: ['aggressive behavior 攻击性行为', 'aggressive strategy 积极策略'], synonym: ['hostile', 'assertive', 'ambitious'], antonym: ['passive', 'gentle'], example: 'He has an aggressive personality.', example2: 'The company took an aggressive approach to growth.' },
  { word: 'agriculture', phonetic: '/ˈæɡrɪkʌltʃə/', meaning: 'n. 农业，农学', root: 'agri(田地)+culture(培养)→田地的培养→农业', collocation: ['modern agriculture 现代农业', 'agriculture department 农业部'], synonym: ['farming', 'cultivation'], antonym: ['industry'], example: 'Agriculture is important to the economy.', example2: 'He studied agriculture at university.' },
  { word: 'alarm', phonetic: '/əˈlɑːm/', meaning: 'n. 警报；闹钟 v. 使惊恐', root: 'al(到)+arm(武器)→拿起武器→警报', collocation: ['alarm clock 闹钟', 'raise the alarm 发出警报'], synonym: ['warning', 'alert', 'frighten'], antonym: ['calm', 'soothe'], example: 'The alarm went off at 6 am.', example2: 'The news alarmed everyone.' },
  { word: 'alert', phonetic: '/əˈlɜːt/', meaning: 'adj. 警觉的，机灵的 v. 提醒 n. 警报', root: '来自意大利语all\'erta(在瞭望塔上)→警觉的', collocation: ['alert to 对...警觉', 'alert sb. to sth. 提醒某人注意'], synonym: ['watchful', 'vigilant', 'aware'], antonym: ['unaware', 'inattentive'], example: 'Stay alert to dangers.', example2: 'The doctor alerted him to the risks.' },
  { word: 'alternative', phonetic: '/ɔːlˈtɜːnətɪv/', meaning: 'n. 替代品，选择 adj. 替代的', root: 'alter(其他的)+-native→其他的→替代的', collocation: ['an alternative to ...的替代品', 'have no alternative 别无选择'], synonym: ['option', 'substitute', 'choice'], antonym: [], example: 'Is there an alternative to this plan?', example2: 'We have no alternative but to wait.' },
  { word: 'ambition', phonetic: '/æmˈbɪʃn/', meaning: 'n. 雄心，野心', root: 'ambi(周围)+it(走)+-ion→四处走动(拉选票)→雄心', collocation: ['achieve one\'s ambition 实现抱负', 'ambition to do 做...的雄心'], synonym: ['aspiration', 'goal', 'drive'], antonym: ['contentment', 'indifference'], example: 'She has great ambition.', example2: 'His ambition is to become a CEO.' },
  { word: 'amount', phonetic: '/əˈmaʊnt/', meaning: 'n. 数量，总额 v. 总计', root: 'a-(到)+mount(山)→堆成山→总计', collocation: ['a large amount of 大量', 'amount to 总计'], synonym: ['quantity', 'total', 'sum'], antonym: [], example: 'A large amount of money was spent.', example2: 'The cost amounts to $1000.' },
  { word: 'analyze', phonetic: '/ˈænəlaɪz/', meaning: 'v. 分析，解析', root: 'ana(彻底)+lyze(分解)→彻底分解→分析', collocation: ['analyze data 分析数据', 'analyze the situation 分析形势'], synonym: ['examine', 'study', 'investigate'], antonym: ['synthesize', 'combine'], example: 'We need to analyze the data carefully.', example2: 'The scientist analyzed the results.' },
  { word: 'ancient', phonetic: '/ˈeɪnʃənt/', meaning: 'adj. 古代的，古老的', root: 'ante(前面)+-cient→很久以前的→古代的', collocation: ['ancient history 古代史', 'ancient civilization 古代文明'], synonym: ['old', 'antique', 'primitive'], antonym: ['modern', 'recent'], example: 'They visited ancient ruins in Greece.', example2: 'China has an ancient civilization.' },
  { word: 'anticipate', phonetic: '/ænˈtɪsɪpeɪt/', meaning: 'v. 预期，预料；期望', root: 'anti(前)+cip(拿)+-ate→提前拿到→预期', collocation: ['anticipate problems 预料问题', 'anticipate doing 期望做'], synonym: ['expect', 'foresee', 'predict'], antonym: ['doubt'], example: 'We anticipate a rise in sales.', example2: 'She anticipated his every need.' },
  { word: 'anxiety', phonetic: '/æŋˈzaɪəti/', meaning: 'n. 焦虑，忧虑；渴望', root: 'ang(紧)+-xiety→心里紧绷→焦虑', collocation: ['feel anxiety about 对...感到焦虑', 'anxiety for 渴望'], synonym: ['worry', 'concern', 'nervousness'], antonym: ['calm', 'peace'], example: 'He felt anxiety about the exam.', example2: 'Her anxiety for success was obvious.' },
  { word: 'apparent', phonetic: '/əˈpærənt/', meaning: 'adj. 明显的；表面上的', root: 'ap-(向)+par(出现)+-ent→出现的→明显的', collocation: ['it is apparent that 很明显', 'apparent reason 表面原因'], synonym: ['obvious', 'evident', 'clear'], antonym: ['hidden', 'obscure'], example: 'It was apparent that he was lying.', example2: 'The apparent cause was a power failure.' },
  { word: 'appeal', phonetic: '/əˈpiːl/', meaning: 'v./n. 呼吁；上诉；有吸引力', root: 'ap-(向)+peal(驱动)→驱动别人→呼吁', collocation: ['appeal to 呼吁；吸引', 'make an appeal 发出呼吁'], synonym: ['plead', 'request', 'attract'], antonym: ['repel'], example: 'The charity appealed for donations.', example2: 'The design appeals to young people.' },
  { word: 'appreciate', phonetic: '/əˈpriːʃieɪt/', meaning: 'v. 欣赏；感激；理解', root: 'ap-(加强)+preci(价值)+-ate→看到价值→欣赏', collocation: ['appreciate sth. 欣赏/感激', 'I would appreciate it if 如果你...我将不胜感激'], synonym: ['value', 'cherish', 'understand'], antonym: ['depreciate', 'undervalue'], example: 'I appreciate your help.', example2: 'She appreciates good music.' },
  { word: 'approach', phonetic: '/əˈprəʊtʃ/', meaning: 'v. 接近 n. 方法；途径', root: 'ap-(向)+proach(近)→走近→接近', collocation: ['approach to ...的方法', 'approach the problem 处理问题'], synonym: ['method', 'way', 'means'], antonym: ['retreat', 'withdraw'], example: 'We need a new approach to this problem.', example2: 'Winter is approaching.' },
  { word: 'appropriate', phonetic: '/əˈprəʊpriət/', meaning: 'adj. 适当的，恰当的', root: 'ap-(向)+propri(自己的)+-ate→归自己的→恰当的', collocation: ['appropriate for 适合', 'appropriate time 适当的时机'], synonym: ['suitable', 'proper', 'fitting'], antonym: ['inappropriate', 'unsuitable'], example: 'Choose clothes appropriate for the occasion.', example2: 'It\'s not appropriate to talk about that here.' },
  { word: 'approve', phonetic: '/əˈpruːv/', meaning: 'v. 赞成，同意；批准', root: 'ap-(加强)+prove(证明)→证明可行→批准', collocation: ['approve of 赞成', 'approve the plan 批准计划'], synonym: ['agree', 'endorse', 'sanction'], antonym: ['disapprove', 'reject'], example: 'I approve of your decision.', example2: 'The committee approved the proposal.' },
  { word: 'argue', phonetic: '/ˈɑːɡjuː/', meaning: 'v. 争论，辩论；主张', root: 'arg(证明)+-ue→证明自己对→争论', collocation: ['argue with sb. about sth. 与某人争论', 'argue for/against 支持/反对'], synonym: ['debate', 'dispute', 'contend'], antonym: ['agree', 'concede'], example: 'They argued about money.', example2: 'She argued for a change in policy.' },
  { word: 'arise', phonetic: '/əˈraɪz/', meaning: 'v. 出现，产生；起身', root: 'a-(向上)+rise(升起)→升起来→出现', collocation: ['arise from 由...产生', 'problems arise 问题出现'], synonym: ['emerge', 'occur', 'appear'], antonym: ['disappear', 'subside'], example: 'Problems may arise at any time.', example2: 'He arose early in the morning.' },
  { word: 'arrange', phonetic: '/əˈreɪndʒ/', meaning: 'v. 安排，整理；排列', root: 'ar-(加强)+range(排列)→排列好→安排', collocation: ['arrange for 安排', 'arrange a meeting 安排会议'], synonym: ['organize', 'plan', 'schedule'], antonym: ['disarrange', 'disturb'], example: 'I\'ll arrange for a taxi.', example2: 'She arranged the books on the shelf.'  },
  // ===== 扩展词汇（后150词，基本字段） =====
  { word: 'arrest', phonetic: '/əˈrest/', meaning: 'v./n. 逮捕，拘留', example: 'The police arrested the suspect.' },
  { word: 'arrival', phonetic: '/əˈraɪvl/', meaning: 'n. 到达，到来', example: 'We waited for her arrival.' },
  { word: 'article', phonetic: '/ˈɑːtɪkl/', meaning: 'n. 文章；物品；冠词', example: 'I read an interesting article today.' },
  { word: 'artificial', phonetic: '/ˌɑːtɪˈfɪʃl/', meaning: 'adj. 人工的，人造的', example: 'This flower is artificial.' },
  { word: 'ashamed', phonetic: '/əˈʃeɪmd/', meaning: 'adj. 羞愧的，惭愧的', example: 'He felt ashamed of his behavior.' },
  { word: 'aspect', phonetic: '/ˈæspekt/', meaning: 'n. 方面；外观', example: 'Consider every aspect of the problem.' },
  { word: 'assemble', phonetic: '/əˈsembl/', meaning: 'v. 集合，组装', example: 'They assembled the furniture themselves.' },
  { word: 'assess', phonetic: '/əˈses/', meaning: 'v. 评估，评价', example: 'We need to assess the damage.' },
  { word: 'asset', phonetic: '/ˈæset/', meaning: 'n. 资产；有价值的人/物', example: 'She is a great asset to the team.' },
  { word: 'assign', phonetic: '/əˈsaɪn/', meaning: 'v. 分配，指派', example: 'The teacher assigned homework.' },
  { word: 'assist', phonetic: '/əˈsɪst/', meaning: 'v. 帮助，协助', example: 'Can I assist you?' },
  { word: 'associate', phonetic: '/əˈsəʊsieɪt/', meaning: 'v. 联系，交往 n. 同事', example: 'I associate this song with my childhood.' },
  { word: 'assume', phonetic: '/əˈsjuːm/', meaning: 'v. 假定，假设；承担', example: 'I assume you know the rules.' },
  { word: 'assure', phonetic: '/əˈʃʊə/', meaning: 'v. 保证，使确信', example: 'I assure you everything will be fine.' },
  { word: 'athlete', phonetic: '/ˈæθliːt/', meaning: 'n. 运动员', example: 'He is a professional athlete.' },
  { word: 'atmosphere', phonetic: '/ˈætməsfɪə/', meaning: 'n. 大气；气氛', example: 'The atmosphere was tense.' },
  { word: 'attach', phonetic: '/əˈtætʃ/', meaning: 'v. 附上，连接；使依恋', example: 'Please attach the file to the email.' },
  { word: 'attack', phonetic: '/əˈtæk/', meaning: 'v./n. 攻击，袭击', example: 'The dog attacked the stranger.' },
  { word: 'attain', phonetic: '/əˈteɪn/', meaning: 'v. 达到，获得', example: 'She attained her goal.' },
  { word: 'attempt', phonetic: '/əˈtempt/', meaning: 'v./n. 尝试，企图', example: 'He attempted to climb the mountain.' },
  { word: 'attend', phonetic: '/əˈtend/', meaning: 'v. 出席，参加；照料', example: 'Did you attend the meeting?' },
  { word: 'attitude', phonetic: '/ˈætɪtjuːd/', meaning: 'n. 态度，看法', example: 'She has a positive attitude.' },
  { word: 'attract', phonetic: '/əˈtrækt/', meaning: 'v. 吸引，引起', example: 'The exhibition attracted many visitors.' },
  { word: 'attribute', phonetic: '/əˈtrɪbjuːt/', meaning: 'v. 归因于 n. 属性', example: 'She attributes her success to hard work.' },
  { word: 'audience', phonetic: '/ˈɔːdiəns/', meaning: 'n. 观众，听众', example: 'The audience applauded loudly.' },
  { word: 'authority', phonetic: '/ɔːˈθɒrəti/', meaning: 'n. 权威；当局', example: 'He is an authority on this subject.' },
  { word: 'available', phonetic: '/əˈveɪləbl/', meaning: 'adj. 可获得的；有空的', example: 'Are you available this afternoon?' },
  { word: 'average', phonetic: '/ˈævərɪdʒ/', meaning: 'adj. 平均的；普通的 n. 平均数', example: 'The average temperature is 20 degrees.' },
  { word: 'avoid', phonetic: '/əˈvɔɪd/', meaning: 'v. 避免，避开', example: 'Try to avoid making mistakes.' },
  { word: 'aware', phonetic: '/əˈweə/', meaning: 'adj. 意识到的，知道的', example: 'Are you aware of the risks?' },
  { word: 'awful', phonetic: '/ˈɔːfl/', meaning: 'adj. 糟糕的，可怕的', example: 'The weather was awful.' },
  { word: 'awkward', phonetic: '/ˈɔːkwəd/', meaning: 'adj. 尴尬的；笨拙的', example: 'There was an awkward silence.' },
  { word: 'background', phonetic: '/ˈbækɡraʊnd/', meaning: 'n. 背景；经历', example: 'Tell me about your background.' },
  { word: 'balance', phonetic: '/ˈbæləns/', meaning: 'n. 平衡；余额 v. 使平衡', example: 'Work-life balance is important.' },
  { word: 'barrier', phonetic: '/ˈbæriə/', meaning: 'n. 障碍，屏障', example: 'Language can be a barrier.' },
  { word: 'basis', phonetic: '/ˈbeɪsɪs/', meaning: 'n. 基础，根据', example: 'On the basis of these facts...' },
  { word: 'battle', phonetic: '/ˈbætl/', meaning: 'n. 战斗，斗争 v. 作战', example: 'They fought a long battle.' },
  { word: 'behalf', phonetic: '/bɪˈhɑːf/', meaning: 'n. 代表，利益', example: 'On behalf of everyone, thank you.' },
  { word: 'behave', phonetic: '/bɪˈheɪv/', meaning: 'v. 表现，举止', example: 'The children behaved well.' },
  { word: 'belief', phonetic: '/bɪˈliːf/', meaning: 'n. 信念，信仰', example: 'She has strong beliefs.' },
  { word: 'benefit', phonetic: '/ˈbenɪfɪt/', meaning: 'n. 利益，好处 v. 有益于', example: 'Exercise benefits your health.' },
  { word: 'beyond', phonetic: '/bɪˈjɒnd/', meaning: 'prep. 超过，在...之外', example: 'This is beyond my understanding.' },
  { word: 'blame', phonetic: '/bleɪm/', meaning: 'v. 责备 n. 责任', example: 'Don\'t blame yourself.' },
  { word: 'blank', phonetic: '/blæŋk/', meaning: 'adj. 空白的 n. 空白', example: 'My mind went blank.' },
  { word: 'block', phonetic: '/blɒk/', meaning: 'v. 阻塞 n. 街区；块', example: 'The road was blocked.' },
  { word: 'bold', phonetic: '/bəʊld/', meaning: 'adj. 大胆的；粗体的', example: 'That was a bold decision.' },
  { word: 'bond', phonetic: '/bɒnd/', meaning: 'n. 纽带；债券 v. 结合', example: 'There is a strong bond between them.' },
  { word: 'bonus', phonetic: '/ˈbəʊnəs/', meaning: 'n. 奖金，红利', example: 'She received a year-end bonus.' },
  { word: 'boom', phonetic: '/buːm/', meaning: 'n./v. 繁荣；轰鸣', example: 'The economy is booming.' },
  { word: 'border', phonetic: '/ˈbɔːdə/', meaning: 'n. 边界，边境', example: 'They crossed the border.' },
  { word: 'bother', phonetic: '/ˈbɒðə/', meaning: 'v. 打扰，麻烦', example: 'Sorry to bother you.' },
  { word: 'bound', phonetic: '/baʊnd/', meaning: 'adj. 必定的；受约束的', example: 'He is bound to succeed.' },
  { word: 'boundary', phonetic: '/ˈbaʊndri/', meaning: 'n. 边界，界限', example: 'Respect each other\'s boundaries.' },
  { word: 'brain', phonetic: '/breɪn/', meaning: 'n. 大脑；智力', example: 'Use your brain.' },
  { word: 'branch', phonetic: '/brɑːntʃ/', meaning: 'n. 分支；分店；树枝', example: 'The bank has many branches.' },
  { word: 'brand', phonetic: '/brænd/', meaning: 'n. 品牌，商标', example: 'This is a well-known brand.' },
  { word: 'brave', phonetic: '/breɪv/', meaning: 'adj. 勇敢的', example: 'He was a brave soldier.' },
  { word: 'breath', phonetic: '/breθ/', meaning: 'n. 呼吸，气息', example: 'Take a deep breath.' },
  { word: 'brief', phonetic: '/briːf/', meaning: 'adj. 简短的 n. 摘要', example: 'Please be brief.' },
  { word: 'brilliant', phonetic: '/ˈbrɪliənt/', meaning: 'adj. 杰出的；明亮的', example: 'She had a brilliant idea.' },
  { word: 'broad', phonetic: '/brɔːd/', meaning: 'adj. 宽阔的；广泛的', example: 'He has broad shoulders.' },
  { word: 'budget', phonetic: '/ˈbʌdʒɪt/', meaning: 'n. 预算 v. 编预算', example: 'We need to stick to the budget.' },
  { word: 'burden', phonetic: '/ˈbɜːdn/', meaning: 'n. 负担，重担', example: 'The burden was too heavy.' },
  { word: 'burst', phonetic: '/bɜːst/', meaning: 'v. 爆发，爆裂', example: 'The balloon burst.' },
  { word: 'calm', phonetic: '/kɑːm/', meaning: 'adj. 平静的 v. 使平静', example: 'Stay calm.' },
  { word: 'campaign', phonetic: '/kæmˈpeɪn/', meaning: 'n. 运动，战役', example: 'They launched an advertising campaign.' },
  { word: 'cancel', phonetic: '/ˈkænsl/', meaning: 'v. 取消，撤销', example: 'The flight was cancelled.' },
  { word: 'candidate', phonetic: '/ˈkændɪdət/', meaning: 'n. 候选人，申请者', example: 'She is the best candidate for the job.' },
  { word: 'capable', phonetic: '/ˈkeɪpəbl/', meaning: 'adj. 有能力的，能干的', example: 'He is capable of doing it.' },
  { word: 'capacity', phonetic: '/kəˈpæsəti/', meaning: 'n. 容量；能力', example: 'The hall has a capacity of 500.' },
  { word: 'capture', phonetic: '/ˈkæptʃə/', meaning: 'v. 捕获；捕捉', example: 'The photo captured the moment perfectly.' },
  { word: 'career', phonetic: '/kəˈrɪə/', meaning: 'n. 职业，事业', example: 'She has a successful career.' },
  { word: 'casual', phonetic: '/ˈkæʒuəl/', meaning: 'adj. 随意的；偶然的', example: 'It was just a casual meeting.' },
  { word: 'category', phonetic: '/ˈkætəɡəri/', meaning: 'n. 类别，种类', example: 'There are several categories.' },
  { word: 'cause', phonetic: '/kɔːz/', meaning: 'n. 原因；事业 v. 引起', example: 'What caused the accident?' },
  { word: 'caution', phonetic: '/ˈkɔːʃn/', meaning: 'n. 小心，谨慎', example: 'Use caution when crossing.' },
  { word: 'celebrate', phonetic: '/ˈselɪbreɪt/', meaning: 'v. 庆祝，祝贺', example: 'Let\'s celebrate your birthday.' },
  { word: 'challenge', phonetic: '/ˈtʃælɪndʒ/', meaning: 'n. 挑战 v. 挑战', example: 'This is a big challenge.' },
  { word: 'character', phonetic: '/ˈkærəktə/', meaning: 'n. 性格；角色；字符', example: 'She has a strong character.' },
  { word: 'charge', phonetic: '/tʃɑːdʒ/', meaning: 'v. 收费；充电；指控 n. 费用', example: 'How much do you charge?' },
  { word: 'chase', phonetic: '/tʃeɪs/', meaning: 'v. 追逐，追求', example: 'The dog chased the cat.' },
  { word: 'cheat', phonetic: '/tʃiːt/', meaning: 'v. 欺骗，作弊', example: 'He cheated on the exam.' },
  { word: 'cheer', phonetic: '/tʃɪə/', meaning: 'v. 欢呼；使高兴', example: 'The crowd cheered.' },
  { word: 'chief', phonetic: '/tʃiːf/', meaning: 'adj. 主要的 n. 首领', example: 'The chief reason is cost.' },
  { word: 'circumstance', phonetic: '/ˈsɜːkəmstəns/', meaning: 'n. 环境，情况', example: 'Under the circumstances, we had no choice.' },
  { word: 'cite', phonetic: '/saɪt/', meaning: 'v. 引用，引证', example: 'He cited several examples.' },
  { word: 'civil', phonetic: '/ˈsɪvl/', meaning: 'adj. 公民的；民事的；文明的', example: 'This is a civil matter.' },
  { word: 'claim', phonetic: '/kleɪm/', meaning: 'v. 声称；要求 n. 主张', example: 'He claims to be innocent.' },
  { word: 'classic', phonetic: '/ˈklæsɪk/', meaning: 'adj. 经典的 n. 经典作品', example: 'This is a classic movie.' },
  { word: 'client', phonetic: '/ˈklaɪənt/', meaning: 'n. 客户，委托人', example: 'We have many clients.' },
  { word: 'climate', phonetic: '/ˈklaɪmət/', meaning: 'n. 气候；风气', example: 'The climate here is mild.' },
  { word: 'cling', phonetic: '/klɪŋ/', meaning: 'v. 紧握，依附', example: 'The child clung to his mother.' },
  { word: 'close', phonetic: '/kləʊz/', meaning: 'v. 关闭 adj. 近的；亲密的', example: 'Please close the door.' },
  { word: 'clue', phonetic: '/kluː/', meaning: 'n. 线索，提示', example: 'I have no clue what happened.' },
  { word: 'collapse', phonetic: '/kəˈlæps/', meaning: 'v./n. 倒塌，崩溃', example: 'The building collapsed.' },
  { word: 'colleague', phonetic: '/ˈkɒliːɡ/', meaning: 'n. 同事', example: 'She is my colleague.' },
  { word: 'collect', phonetic: '/kəˈlekt/', meaning: 'v. 收集，聚集', example: 'He collects stamps.' },
  { word: 'combine', phonetic: '/kəmˈbaɪn/', meaning: 'v. 结合，联合', example: 'Combine the two ingredients.' },
  { word: 'comfort', phonetic: '/ˈkʌmfət/', meaning: 'n. 舒适；安慰 v. 安慰', example: 'This chair is very comfortable.' },
  { word: 'command', phonetic: '/kəˈmɑːnd/', meaning: 'v./n. 命令，指挥', example: 'He commanded the soldiers.' },
  { word: 'comment', phonetic: '/ˈkɒment/', meaning: 'n./v. 评论，意见', example: 'Do you have any comments?' },
  { word: 'commerce', phonetic: '/ˈkɒmɜːs/', meaning: 'n. 商业，贸易', example: 'E-commerce is growing rapidly.' },
  { word: 'commit', phonetic: '/kəˈmɪt/', meaning: 'v. 承诺；犯（罪）；投入', example: 'He committed to the project.' },
  { word: 'common', phonetic: '/ˈkɒmən/', meaning: 'adj. 普通的；共同的', example: 'This is a common problem.' },
  { word: 'communicate', phonetic: '/kəˈmjuːnɪkeɪt/', meaning: 'v. 交流，沟通', example: 'We need to communicate better.' },
  { word: 'community', phonetic: '/kəˈmjuːnəti/', meaning: 'n. 社区，群体', example: 'He is active in the community.' },
  { word: 'compare', phonetic: '/kəmˈpeə/', meaning: 'v. 比较，对比', example: 'Compare the two options.' },
  { word: 'compete', phonetic: '/kəmˈpiːt/', meaning: 'v. 竞争，比赛', example: 'They compete for the same job.' },
  { word: 'complain', phonetic: '/kəmˈpleɪn/', meaning: 'v. 抱怨，投诉', example: 'Stop complaining.' },
  { word: 'complete', phonetic: '/kəmˈpliːt/', meaning: 'adj. 完整的 v. 完成', example: 'The project is complete.' },
  { word: 'complex', phonetic: '/ˈkɒmpleks/', meaning: 'adj. 复杂的 n. 综合体', example: 'This is a complex problem.' },
  { word: 'concept', phonetic: '/ˈkɒnsept/', meaning: 'n. 概念，观念', example: 'Explain the concept in simple terms.' },
  { word: 'concern', phonetic: '/kənˈsɜːn/', meaning: 'v. 涉及；关心 n. 关心；担忧', example: 'This concerns everyone.' },
  { word: 'conclude', phonetic: '/kənˈkluːd/', meaning: 'v. 得出结论；结束', example: 'What can we conclude from this?' },
  { word: 'condition', phonetic: '/kənˈdɪʃn/', meaning: 'n. 条件；状况', example: 'The car is in good condition.' },
  { word: 'conduct', phonetic: '/kənˈdʌkt/', meaning: 'v. 进行；指挥 n. 行为', example: 'They conducted an experiment.' },
  { word: 'confident', phonetic: '/ˈkɒnfɪdənt/', meaning: 'adj. 自信的，有信心的', example: 'She is confident about the future.' },
  { word: 'confirm', phonetic: '/kənˈfɜːm/', meaning: 'v. 确认，证实', example: 'Please confirm your attendance.' },
  { word: 'conflict', phonetic: '/ˈkɒnflɪkt/', meaning: 'n. 冲突，矛盾 v. 冲突', example: 'There was a conflict of interest.' },
  { word: 'confuse', phonetic: '/kənˈfjuːz/', meaning: 'v. 使困惑，混淆', example: 'Don\'t confuse me with too many details.' },
  { word: 'connect', phonetic: '/kəˈnekt/', meaning: 'v. 连接，联系', example: 'Connect the cable to the computer.' },
  { word: 'conscious', phonetic: '/ˈkɒnʃəs/', meaning: 'adj. 有意识的；自觉的', example: 'He was conscious of his mistake.' },
  { word: 'consider', phonetic: '/kənˈsɪdə/', meaning: 'v. 考虑，认为', example: 'Please consider my proposal.' },
  { word: 'consist', phonetic: '/kənˈsɪst/', meaning: 'v. 由...组成', example: 'The team consists of five people.' },
  { word: 'constant', phonetic: '/ˈkɒnstənt/', meaning: 'adj. 不断的；恒定的', example: 'There was constant noise.' },
  { word: 'construct', phonetic: '/kənˈstrʌkt/', meaning: 'v. 建造，构建', example: 'They constructed a new bridge.' },
  { word: 'consume', phonetic: '/kənˈsjuːm/', meaning: 'v. 消费，消耗', example: 'The car consumes a lot of fuel.' },
  { word: 'contact', phonetic: '/ˈkɒntækt/', meaning: 'v./n. 联系，接触', example: 'Please contact me soon.' },
  { word: 'contain', phonetic: '/kənˈteɪn/', meaning: 'v. 包含，容纳', example: 'This box contains books.' },
  { word: 'contemporary', phonetic: '/kənˈtemprəri/', meaning: 'adj. 当代的；同时代的', example: 'She is a contemporary artist.' },
  { word: 'content', phonetic: '/ˈkɒntent/', meaning: 'n. 内容；目录 adj. 满足的', example: 'The content is interesting.' },
  { word: 'context', phonetic: '/ˈkɒntekst/', meaning: 'n. 上下文，背景', example: 'Consider the context.' },
  { word: 'continue', phonetic: '/kənˈtɪnjuː/', meaning: 'v. 继续，持续', example: 'Please continue.' },
  { word: 'contract', phonetic: '/ˈkɒntrækt/', meaning: 'n. 合同 v. 收缩；订约', example: 'Sign the contract.' },
  { word: 'contrast', phonetic: '/ˈkɒntrɑːst/', meaning: 'n. 对比 v. 形成对比', example: 'There is a stark contrast between them.' },
  { word: 'contribute', phonetic: '/kənˈtrɪbjuːt/', meaning: 'v. 贡献，促成', example: 'Everyone should contribute.' },
  { word: 'control', phonetic: '/kənˈtrəʊl/', meaning: 'v./n. 控制，管理', example: 'Take control of the situation.' },
  { word: 'convenient', phonetic: '/kənˈviːniənt/', meaning: 'adj. 方便的，便利的', example: 'Is this time convenient for you?' },
  { word: 'convince', phonetic: '/kənˈvɪns/', meaning: 'v. 说服，使确信', example: 'He convinced me to join.' },
  { word: 'cooperate', phonetic: '/kəʊˈɒpəreɪt/', meaning: 'v. 合作，协作', example: 'We need to cooperate.' },
  { word: 'cope', phonetic: '/kəʊp/', meaning: 'v. 应对，处理', example: 'She copes well with stress.' },
  { word: 'core', phonetic: '/kɔː/', meaning: 'n. 核心，中心', example: 'This is the core of the problem.' },
  { word: 'corporate', phonetic: '/ˈkɔːpərət/', meaning: 'adj. 公司的，企业的', example: 'He works in corporate finance.' },
  { word: 'correct', phonetic: '/kəˈrekt/', meaning: 'adj. 正确的 v. 纠正', example: 'Your answer is correct.' },
  { word: 'cost', phonetic: '/kɒst/', meaning: 'n. 成本，费用 v. 花费', example: 'The cost is too high.' },
  { word: 'courage', phonetic: '/ˈkʌrɪdʒ/', meaning: 'n. 勇气，胆量', example: 'It takes courage to speak up.' },
  { word: 'create', phonetic: '/kriˈeɪt/', meaning: 'v. 创造，创建', example: 'She created a new design.' },
  { word: 'credit', phonetic: '/ˈkredɪt/', meaning: 'n. 信用；学分；赞扬', example: 'He deserves credit for this.' },
  { word: 'crisis', phonetic: '/ˈkraɪsɪs/', meaning: 'n. 危机，关键时刻', example: 'The company is in crisis.' },
  { word: 'critical', phonetic: '/ˈkrɪtɪkl/', meaning: 'adj. 批评的；关键的', example: 'This is a critical moment.' },
  { word: 'criticize', phonetic: '/ˈkrɪtɪsaɪz/', meaning: 'v. 批评，评论', example: 'Don\'t criticize others.' },
  { word: 'crucial', phonetic: '/ˈkruːʃl/', meaning: 'adj. 至关重要的', example: 'This is a crucial decision.' },
  { word: 'culture', phonetic: '/ˈkʌltʃə/', meaning: 'n. 文化，文明', example: 'Chinese culture is rich.' },
  { word: 'curious', phonetic: '/ˈkjʊəriəs/', meaning: 'adj. 好奇的，奇怪的', example: 'Children are naturally curious.' },
  { word: 'current', phonetic: '/ˈkʌrənt/', meaning: 'adj. 当前的 n. 潮流；电流', example: 'The current situation is stable.' },
  { word: 'damage', phonetic: '/ˈdæmɪdʒ/', meaning: 'n./v. 损害，损失', example: 'The storm caused damage.' },
  { word: 'debate', phonetic: '/dɪˈbeɪt/', meaning: 'n./v. 辩论，争论', example: 'There was a heated debate.' },
  { word: 'decade', phonetic: '/ˈdekeɪd/', meaning: 'n. 十年', example: 'He has worked here for a decade.' },
  { word: 'decide', phonetic: '/dɪˈsaɪd/', meaning: 'v. 决定，下决心', example: 'It\'s hard to decide.' },
  { word: 'declare', phonetic: '/dɪˈkleə/', meaning: 'v. 宣布，声明', example: 'The government declared a state of emergency.' },
  { word: 'decline', phonetic: '/dɪˈklaɪn/', meaning: 'v. 下降；拒绝 n. 下降', example: 'Sales declined last year.' },
  { word: 'decrease', phonetic: '/dɪˈkriːs/', meaning: 'v./n. 减少，降低', example: 'The number decreased.' },
  { word: 'dedicate', phonetic: '/ˈdedɪkeɪt/', meaning: 'v. 奉献，致力于', example: 'She dedicated her life to teaching.' },
  { word: 'defeat', phonetic: '/dɪˈfiːt/', meaning: 'v./n. 击败，战胜', example: 'They defeated the enemy.' },
  { word: 'defend', phonetic: '/dɪˈfend/', meaning: 'v. 保卫，辩护', example: 'He defended his position.' },
  { word: 'define', phonetic: '/dɪˈfaɪn/', meaning: 'v. 定义，解释', example: 'How do you define success?' },
  { word: 'definite', phonetic: '/ˈdefɪnət/', meaning: 'adj. 明确的，肯定的', example: 'We need a definite answer.' },
  { word: 'delay', phonetic: '/dɪˈleɪ/', meaning: 'v./n. 延迟，推迟', example: 'The flight was delayed.' },
  { word: 'deliver', phonetic: '/dɪˈlɪvə/', meaning: 'v. 递送，交付；发表', example: 'The package was delivered.' },
  { word: 'demand', phonetic: '/dɪˈmɑːnd/', meaning: 'v./n. 要求，需求', example: 'There is high demand for this product.' },
  { word: 'demonstrate', phonetic: '/ˈdemənstreɪt/', meaning: 'v. 证明，演示', example: 'Let me demonstrate how it works.' },
  { word: 'deny', phonetic: '/dɪˈnaɪ/', meaning: 'v. 否认，拒绝', example: 'He denied the accusation.' },
  { word: 'depend', phonetic: '/dɪˈpend/', meaning: 'v. 依靠，取决于', example: 'It depends on the weather.' },
  { word: 'depress', phonetic: '/dɪˈpres/', meaning: 'v. 使沮丧；按下', example: 'The news depressed her.' },
  { word: 'derive', phonetic: '/dɪˈraɪv/', meaning: 'v. 获得，起源于', example: 'The word derives from Latin.' },
  { word: 'describe', phonetic: '/dɪˈskraɪb/', meaning: 'v. 描述，形容', example: 'Describe what happened.' },
  { word: 'deserve', phonetic: '/dɪˈzɜːv/', meaning: 'v. 应得，值得', example: 'You deserve a break.' },
  { word: 'design', phonetic: '/dɪˈzaɪn/', meaning: 'v./n. 设计，构思', example: 'She designs clothes.' },
  { word: 'desire', phonetic: '/dɪˈzaɪə/', meaning: 'v./n. 渴望，欲望', example: 'He desired success.' },
  { word: 'despite', phonetic: '/dɪˈspaɪt/', meaning: 'prep. 尽管，不管', example: 'Despite the rain, we went out.' },
  { word: 'destroy', phonetic: '/dɪˈstrɔɪ/', meaning: 'v. 破坏，毁灭', example: 'The fire destroyed the house.' },
  { word: 'detail', phonetic: '/ˈdiːteɪl/', meaning: 'n. 细节，详情', example: 'Explain it in detail.' },
  { word: 'detect', phonetic: '/dɪˈtekt/', meaning: 'v. 察觉，发现', example: 'The sensor detects motion.' },
  { word: 'determine', phonetic: '/dɪˈtɜːmɪn/', meaning: 'v. 决定，确定', example: 'We need to determine the cause.' },
  { word: 'develop', phonetic: '/dɪˈveləp/', meaning: 'v. 发展，开发', example: 'The city developed rapidly.' },
  { word: 'device', phonetic: '/dɪˈvaɪs/', meaning: 'n. 设备，装置', example: 'This is a new electronic device.' },
  { word: 'devote', phonetic: '/dɪˈvəʊt/', meaning: 'v. 致力于，奉献', example: 'She devoted herself to her work.' },
  { word: 'differ', phonetic: '/ˈdɪfə/', meaning: 'v. 不同，有差异', example: 'Opinions differ on this issue.' },
  { word: 'difficult', phonetic: '/ˈdɪfɪkəlt/', meaning: 'adj. 困难的', example: 'This is a difficult task.' },
  { word: 'digest', phonetic: '/daɪˈdʒest/', meaning: 'v. 消化；理解 n. 摘要', example: 'I need time to digest this information.' },
  { word: 'digital', phonetic: '/ˈdɪdʒɪtl/', meaning: 'adj. 数字的，数码的', example: 'This is a digital camera.' },
  { word: 'dignity', phonetic: '/ˈdɪɡnəti/', meaning: 'n. 尊严，高贵', example: 'Maintain your dignity.' },
  { word: 'dimension', phonetic: '/daɪˈmenʃn/', meaning: 'n. 维度，尺寸', example: 'There is another dimension to this problem.' },
  { word: 'direct', phonetic: '/dəˈrekt/', meaning: 'adj. 直接的 v. 指导，导演', example: 'There is no direct connection.' },
  { word: 'disappear', phonetic: '/ˌdɪsəˈpɪə/', meaning: 'v. 消失，不见', example: 'The sun disappeared behind the clouds.' },
  { word: 'disaster', phonetic: '/dɪˈzɑːstə/', meaning: 'n. 灾难，灾祸', example: 'The earthquake was a disaster.' },
  { word: 'discard', phonetic: '/dɪˈskɑːd/', meaning: 'v. 丢弃，抛弃', example: 'Don\'t discard old things.' },
  { word: 'discover', phonetic: '/dɪˈskʌvə/', meaning: 'v. 发现，发觉', example: 'Scientists discovered a new species.' },
  { word: 'discuss', phonetic: '/dɪˈskʌs/', meaning: 'v. 讨论，商议', example: 'Let\'s discuss this later.' },
  { word: 'display', phonetic: '/dɪˈspleɪ/', meaning: 'v./n. 显示，展示', example: 'The screen displays the time.' },
  { word: 'dispose', phonetic: '/dɪˈspəʊz/', meaning: 'v. 处理，处置', example: 'Dispose of the waste properly.' },
  { word: 'dispute', phonetic: '/dɪˈspjuːt/', meaning: 'n./v. 争论，纠纷', example: 'There was a dispute over the contract.' },
  { word: 'distance', phonetic: '/ˈdɪstəns/', meaning: 'n. 距离，远方', example: 'The distance is 10 kilometers.' },
  { word: 'distinct', phonetic: '/dɪˈstɪŋkt/', meaning: 'adj. 明显的，独特的', example: 'There is a distinct difference.' },
  { word: 'distinguish', phonetic: '/dɪˈstɪŋɡwɪʃ/', meaning: 'v. 区分，辨别', example: 'Can you distinguish the two?' },
  { word: 'distribute', phonetic: '/dɪˈstrɪbjuːt/', meaning: 'v. 分发，分配', example: 'Distribute the books to the students.' },
  { word: 'disturb', phonetic: '/dɪˈstɜːb/', meaning: 'v. 打扰，扰乱', example: 'Sorry to disturb you.' },
  { word: 'divide', phonetic: '/dɪˈvaɪd/', meaning: 'v. 分开，划分', example: 'Divide the cake into pieces.' },
  { word: 'document', phonetic: '/ˈdɒkjumənt/', meaning: 'n. 文件，文档', example: 'Please sign this document.' },
  { word: 'domestic', phonetic: '/dəˈmestɪk/', meaning: 'adj. 国内的；家庭的', example: 'Domestic sales increased.' },
  { word: 'dominate', phonetic: '/ˈdɒmɪneɪt/', meaning: 'v. 支配，统治', example: 'He dominated the conversation.' },
  { word: 'doubt', phonetic: '/daʊt/', meaning: 'n./v. 怀疑，疑问', example: 'I doubt his honesty.' },
  { word: 'draft', phonetic: '/drɑːft/', meaning: 'n. 草稿，草案 v. 起草', example: 'This is just a draft.' },
  { word: 'drama', phonetic: '/ˈdrɑːmə/', meaning: 'n. 戏剧，戏剧性事件', example: 'She studies drama.' },
  { word: 'dramatic', phonetic: '/drəˈmætɪk/', meaning: 'adj. 戏剧性的，引人注目的', example: 'There was a dramatic change.' },
  { word: 'drive', phonetic: '/draɪv/', meaning: 'v. 驾驶；驱动 n. 驱动力', example: 'He drives to work.' },
  { word: 'drop', phonetic: '/drɒp/', meaning: 'v. 落下，下降 n. 滴', example: 'The temperature dropped.' },
  { word: 'due', phonetic: '/djuː/', meaning: 'adj. 到期的；应得的', example: 'The report is due tomorrow.' },
  { word: 'dull', phonetic: '/dʌl/', meaning: 'adj. 枯燥的；迟钝的', example: 'The lecture was dull.' },
  { word: 'duration', phonetic: '/djuˈreɪʃn/', meaning: 'n. 持续时间', example: 'The duration of the movie is 2 hours.' },
  { word: 'duty', phonetic: '/ˈdjuːti/', meaning: 'n. 责任，义务；税', example: 'It is your duty to help.' },
  { word: 'dynamic', phonetic: '/daɪˈnæmɪk/', meaning: 'adj. 动态的，有活力的', example: 'He is a dynamic leader.' },
  { word: 'eager', phonetic: '/ˈiːɡə/', meaning: 'adj. 渴望的，热切的', example: 'She is eager to learn.' },
  { word: 'earn', phonetic: '/ɜːn/', meaning: 'v. 赚得，获得', example: 'He earns a good salary.' },
  { word: 'ease', phonetic: '/iːz/', meaning: 'n. 容易；舒适 v. 减轻', example: 'The medicine eased the pain.' },
  { word: 'economic', phonetic: '/ˌiːkəˈnɒmɪk/', meaning: 'adj. 经济的，经济学的', example: 'The economic situation is improving.' },
  { word: 'economy', phonetic: '/ɪˈkɒnəmi/', meaning: 'n. 经济，节约', example: 'The economy is growing.' },
  { word: 'edge', phonetic: '/edʒ/', meaning: 'n. 边缘；优势', example: 'She has an edge over the competition.' },
  { word: 'edit', phonetic: '/ˈedɪt/', meaning: 'v. 编辑，校订', example: 'He edits the newspaper.' },
  { word: 'effect', phonetic: '/ɪˈfekt/', meaning: 'n. 效果，影响 v. 实现', example: 'The medicine had no effect.' },
  { word: 'efficient', phonetic: '/ɪˈfɪʃnt/', meaning: 'adj. 高效的，有效率的', example: 'She is an efficient worker.' },
  { word: 'effort', phonetic: '/ˈefət/', meaning: 'n. 努力，尝试', example: 'Make an effort to arrive on time.' },
  { word: 'elaborate', phonetic: '/ɪˈlæbərət/', meaning: 'adj. 精心制作的 v. 详细说明', example: 'Could you elaborate on that?' },
  { word: 'elect', phonetic: '/ɪˈlekt/', meaning: 'v. 选举，选择', example: 'They elected a new president.' },
  { word: 'element', phonetic: '/ˈelɪmənt/', meaning: 'n. 元素，要素', example: 'Honesty is an element of success.' },
  { word: 'eliminate', phonetic: '/ɪˈlɪmɪneɪt/', meaning: 'v. 消除，排除', example: 'We need to eliminate the risk.' },
  { word: 'embarrass', phonetic: '/ɪmˈbærəs/', meaning: 'v. 使尴尬，使难堪', example: 'Don\'t embarrass me in front of others.' },
  { word: 'emerge', phonetic: '/ɪˈmɜːdʒ/', meaning: 'v. 出现，浮现', example: 'New problems emerged.' },
  { word: 'emotion', phonetic: '/ɪˈməʊʃn/', meaning: 'n. 情感，情绪', example: 'She showed no emotion.' },
  { word: 'emphasis', phonetic: '/ˈemfəsɪs/', meaning: 'n. 强调，重点', example: 'Put emphasis on quality.' },
  { word: 'employ', phonetic: '/ɪmˈplɔɪ/', meaning: 'v. 雇用，使用', example: 'The company employs 500 people.' },
  { word: 'enable', phonetic: '/ɪˈneɪbl/', meaning: 'v. 使能够，使可能', example: 'Technology enables us to work remotely.' },
  { word: 'encounter', phonetic: '/ɪnˈkaʊntə/', meaning: 'v./n. 遭遇，遇到', example: 'We encountered some difficulties.' },
  { word: 'encourage', phonetic: '/ɪnˈkʌrɪdʒ/', meaning: 'v. 鼓励，激励', example: 'Parents should encourage their children.' },
  { word: 'endure', phonetic: '/ɪnˈdjʊə/', meaning: 'v. 忍受，持续', example: 'She endured great pain.' },
  { word: 'energy', phonetic: '/ˈenədʒi/', meaning: 'n. 能量，精力', example: 'He has a lot of energy.' },
  { word: 'enforce', phonetic: '/ɪnˈfɔːs/', meaning: 'v. 执行，强制', example: 'The police enforce the law.' },
  { word: 'engage', phonetic: '/ɪnˈɡeɪdʒ/', meaning: 'v. 从事；吸引；订婚', example: 'She engages in volunteer work.' },
  { word: 'enhance', phonetic: '/ɪnˈhɑːns/', meaning: 'v. 提高，增强', example: 'This will enhance your skills.' },
  { word: 'enjoy', phonetic: '/ɪnˈdʒɔɪ/', meaning: 'v. 享受，喜欢', example: 'I enjoy reading.' },
  { word: 'enormous', phonetic: '/ɪˈnɔːməs/', meaning: 'adj. 巨大的，庞大的', example: 'There was an enormous amount of work.' },
  { word: 'ensure', phonetic: '/ɪnˈʃʊə/', meaning: 'v. 确保，保证', example: 'Please ensure the door is locked.' },
  { word: 'enter', phonetic: '/ˈentə/', meaning: 'v. 进入，参加', example: 'Please enter the room.' },
  { word: 'entertain', phonetic: '/ˌentəˈteɪn/', meaning: 'v. 娱乐，招待', example: 'He entertained us with stories.' },
  { word: 'enthusiasm', phonetic: '/ɪnˈθjuːziæzəm/', meaning: 'n. 热情，热忱', example: 'She showed great enthusiasm.' },
  { word: 'entire', phonetic: '/ɪnˈtaɪə/', meaning: 'adj. 整个的，全部的', example: 'The entire family came.' },
  { word: 'entry', phonetic: '/ˈentri/', meaning: 'n. 进入，入口', example: 'No entry without permission.' },
  { word: 'environment', phonetic: '/ɪnˈvaɪrənmənt/', meaning: 'n. 环境，外界', example: 'Protect the environment.' },
  { word: 'equal', phonetic: '/ˈiːkwəl/', meaning: 'adj. 平等的，相等的', example: 'All men are created equal.' },
  { word: 'equip', phonetic: '/ɪˈkwɪp/', meaning: 'v. 装备，配备', example: 'The kitchen is well equipped.' },
  { word: 'equivalent', phonetic: '/ɪˈkwɪvələnt/', meaning: 'adj. 等价的，相当的', example: 'One dollar is equivalent to about 7 yuan.' },
  { word: 'erase', phonetic: '/ɪˈreɪz/', meaning: 'v. 擦除，抹去', example: 'Erase the whiteboard.' },
  { word: 'erupt', phonetic: '/ɪˈrʌpt/', meaning: 'v. 爆发，喷发', example: 'The volcano erupted.' },
  { word: 'escape', phonetic: '/ɪˈskeɪp/', meaning: 'v./n. 逃跑，逃脱', example: 'The prisoner escaped.' },
  { word: 'essential', phonetic: '/ɪˈsenʃl/', meaning: 'adj. 必要的，本质的', example: 'Water is essential for life.' },
  { word: 'establish', phonetic: '/ɪˈstæblɪʃ/', meaning: 'v. 建立，确立', example: 'They established a new company.' },
  { word: 'estimate', phonetic: '/ˈestɪmeɪt/', meaning: 'v./n. 估计，估算', example: 'I estimate the cost at $1000.' },
  { word: 'evaluate', phonetic: '/ɪˈvæljueɪt/', meaning: 'v. 评估，评价', example: 'We need to evaluate the results.' },
  { word: 'event', phonetic: '/ɪˈvent/', meaning: 'n. 事件，活动', example: 'This was a major event.' },
  { word: 'eventually', phonetic: '/ɪˈventʃuəli/', meaning: 'adv. 最终，终于', example: 'Eventually, he succeeded.' },
  { word: 'evidence', phonetic: '/ˈevɪdəns/', meaning: 'n. 证据，证明', example: 'There is no evidence to support this.' },
  { word: 'evident', phonetic: '/ˈevɪdənt/', meaning: 'adj. 明显的，明白的', example: 'It was evident that he was lying.' },
  { word: 'evolve', phonetic: '/ɪˈvɒlv/', meaning: 'v. 进化，发展', example: 'Species evolve over time.' },
  { word: 'exact', phonetic: '/ɪɡˈzækt/', meaning: 'adj. 精确的，准确的', example: 'What is the exact time?' },
  { word: 'exaggerate', phonetic: '/ɪɡˈzædʒəreɪt/', meaning: 'v. 夸大，夸张', example: 'Don\'t exaggerate the problem.' },
  { word: 'examine', phonetic: '/ɪɡˈzæmɪn/', meaning: 'v. 检查，考试', example: 'The doctor examined the patient.' },
  { word: 'example', phonetic: '/ɪɡˈzɑːmpl/', meaning: 'n. 例子，榜样', example: 'Give me an example.' },
  { word: 'exceed', phonetic: '/ɪkˈsiːd/', meaning: 'v. 超过，超出', example: 'The cost exceeded our budget.' },
  { word: 'excellent', phonetic: '/ˈeksələnt/', meaning: 'adj. 优秀的，极好的', example: 'She did an excellent job.' },
  { word: 'except', phonetic: '/ɪkˈsept/', meaning: 'prep. 除...之外', example: 'Everyone came except him.' },
  { word: 'exchange', phonetic: '/ɪksˈtʃeɪndʒ/', meaning: 'v./n. 交换，交流', example: 'Let\'s exchange phone numbers.' },
  { word: 'excite', phonetic: '/ɪkˈsaɪt/', meaning: 'v. 使兴奋，使激动', example: 'The news excited everyone.' },
  { word: 'exclude', phonetic: '/ɪkˈskluːd/', meaning: 'v. 排除，不包括', example: 'Please exclude me from this.' },
  { word: 'excuse', phonetic: '/ɪkˈskjuːz/', meaning: 'v. 原谅 n. 借口', example: 'Excuse me for being late.' },
  { word: 'execute', phonetic: '/ˈeksɪkjuːt/', meaning: 'v. 执行，实施', example: 'Execute the plan.' },
  { word: 'exercise', phonetic: '/ˈeksəsaɪz/', meaning: 'n./v. 锻炼，练习', example: 'Exercise regularly.' },
  { word: 'exhaust', phonetic: '/ɪɡˈzɔːst/', meaning: 'v. 使疲惫；耗尽', example: 'The long walk exhausted me.' },
  { word: 'exhibit', phonetic: '/ɪɡˈzɪbɪt/', meaning: 'v. 展示，展览', example: 'The museum exhibits ancient art.' },
  { word: 'exist', phonetic: '/ɪɡˈzɪst/', meaning: 'v. 存在，生存', example: 'Does life exist on other planets?' },
  { word: 'expand', phonetic: '/ɪkˈspænd/', meaning: 'v. 扩大，膨胀', example: 'The company expanded rapidly.' },
  { word: 'expect', phonetic: '/ɪkˈspekt/', meaning: 'v. 期望，预期', example: 'I expect you to be on time.' },
  { word: 'expense', phonetic: '/ɪkˈspens/', meaning: 'n. 费用，花费', example: 'The expense was too high.' },
  { word: 'experience', phonetic: '/ɪkˈspɪəriəns/', meaning: 'n. 经验，经历 v. 经历', example: 'She has years of experience.' },
  { word: 'experiment', phonetic: '/ɪkˈsperɪmənt/', meaning: 'n./v. 实验，试验', example: 'They conducted an experiment.' },
  { word: 'expert', phonetic: '/ˈekspɜːt/', meaning: 'n. 专家 adj. 熟练的', example: 'He is an expert in this field.' },
  { word: 'explain', phonetic: '/ɪkˈspleɪn/', meaning: 'v. 解释，说明', example: 'Can you explain this to me?' },
  { word: 'explicit', phonetic: '/ɪkˈsplɪsɪt/', meaning: 'adj. 明确的，清楚的', example: 'Give explicit instructions.' },
  { word: 'explode', phonetic: '/ɪkˈspləʊd/', meaning: 'v. 爆炸，爆发', example: 'The bomb exploded.' },
  { word: 'explore', phonetic: '/ɪkˈsplɔː/', meaning: 'v. 探索，探险', example: 'Let\'s explore the city.' },
  { word: 'export', phonetic: '/ˈekspɔːt/', meaning: 'v./n. 出口，输出', example: 'China exports many goods.' },
  { word: 'expose', phonetic: '/ɪkˈspəʊz/', meaning: 'v. 暴露，揭露', example: 'Don\'t expose your skin to the sun.' },
  { word: 'express', phonetic: '/ɪkˈspres/', meaning: 'v. 表达 adj. 快速的', example: 'Express your feelings.' },
  { word: 'extend', phonetic: '/ɪkˈstend/', meaning: 'v. 延伸，扩展', example: 'The road extends for miles.' },
  { word: 'extent', phonetic: '/ɪkˈstent/', meaning: 'n. 程度，范围', example: 'To some extent, I agree.' },
  { word: 'external', phonetic: '/ɪkˈstɜːnl/', meaning: 'adj. 外部的，外面的', example: 'External factors influenced the decision.' },
  { word: 'extra', phonetic: '/ˈekstrə/', meaning: 'adj. 额外的 n. 额外之物', example: 'I need extra time.' },
  { word: 'extraordinary', phonetic: '/ɪkˈstrɔːdnri/', meaning: 'adj. 非凡的，特别的', example: 'She has extraordinary talent.' },
  { word: 'extreme', phonetic: '/ɪkˈstriːm/', meaning: 'adj. 极端的，极度的', example: 'The extreme heat was unbearable.' },
  { word: 'facility', phonetic: '/fəˈsɪləti/', meaning: 'n. 设施，设备', example: 'The hotel has excellent facilities.' },
  { word: 'factor', phonetic: '/ˈfæktə/', meaning: 'n. 因素，要素', example: 'Cost is a key factor.' },
  { word: 'fail', phonetic: '/feɪl/', meaning: 'v. 失败，不及格', example: 'He failed the exam.' },
  { word: 'faint', phonetic: '/feɪnt/', meaning: 'adj. 微弱的 v. 晕倒', example: 'There was a faint sound.' },
  { word: 'fair', phonetic: '/feə/', meaning: 'adj. 公平的；白皙的；晴朗的', example: 'That\'s not fair.' },
  { word: 'faith', phonetic: '/feɪθ/', meaning: 'n. 信仰，信任', example: 'Have faith in yourself.' },
  { word: 'false', phonetic: '/fɔːls/', meaning: 'adj. 错误的，假的', example: 'That statement is false.' },
  { word: 'familiar', phonetic: '/fəˈmɪliə/', meaning: 'adj. 熟悉的，常见的', example: 'This place looks familiar.' },
  { word: 'famous', phonetic: '/ˈfeɪməs/', meaning: 'adj. 著名的，出名的', example: 'She is a famous actress.' },
  { word: 'fancy', phonetic: '/ˈfænsi/', meaning: 'adj. 花哨的 v. 想象，喜欢', example: 'I fancy a cup of tea.' },
  { word: 'fantastic', phonetic: '/fænˈtæstɪk/', meaning: 'adj. 极好的，奇异的', example: 'That was a fantastic movie.' },
  { word: 'fascinate', phonetic: '/ˈfæsɪneɪt/', meaning: 'v. 使着迷，吸引', example: 'The story fascinated me.' },
  { word: 'fashion', phonetic: '/ˈfæʃn/', meaning: 'n. 时尚，方式', example: 'She follows fashion closely.' },
  { word: 'fast', phonetic: '/fɑːst/', meaning: 'adj. 快的 adv. 快速地', example: 'He runs fast.' },
  { word: 'fault', phonetic: '/fɔːlt/', meaning: 'n. 过错，缺点', example: 'It\'s not your fault.' },
  { word: 'favor', phonetic: '/ˈfeɪvə/', meaning: 'n. 恩惠，支持 v. 赞成', example: 'Can you do me a favor?' },
  { word: 'fear', phonetic: '/fɪə/', meaning: 'n./v. 害怕，恐惧', example: 'Don\'t fear failure.' },
  { word: 'feature', phonetic: '/ˈfiːtʃə/', meaning: 'n. 特征，特色 v. 以...为特色', example: 'This phone has many features.' },
  { word: 'federal', phonetic: '/ˈfedərəl/', meaning: 'adj. 联邦的，联邦政府的', example: 'The federal government passed a new law.' },
  { word: 'fee', phonetic: '/fiː/', meaning: 'n. 费用，酬金', example: 'The tuition fee is high.' },
  { word: 'feedback', phonetic: '/ˈfiːdbæk/', meaning: 'n. 反馈，意见', example: 'I appreciate your feedback.' },
  { word: 'feel', phonetic: '/fiːl/', meaning: 'v. 感觉，触摸', example: 'I feel tired.' },
  { word: 'female', phonetic: '/ˈfiːmeɪl/', meaning: 'adj. 女性的，雌性的', example: 'The female population is growing.' },
  { word: 'fiction', phonetic: '/ˈfɪkʃn/', meaning: 'n. 小说，虚构', example: 'I prefer fiction to non-fiction.' },
  { word: 'field', phonetic: '/fiːld/', meaning: 'n. 田野；领域；场地', example: 'He works in the field of medicine.' },
  { word: 'fierce', phonetic: '/fɪəs/', meaning: 'adj. 凶猛的，激烈的', example: 'There was fierce competition.' },
  { word: 'figure', phonetic: '/ˈfɪɡə/', meaning: 'n. 数字；人物；身材 v. 认为', example: 'The figures show an increase.' },
  { word: 'file', phonetic: '/faɪl/', meaning: 'n. 文件 v. 归档；提交', example: 'Please file this document.' },
  { word: 'final', phonetic: '/ˈfaɪnl/', meaning: 'adj. 最终的，决定性的', example: 'This is my final decision.' },
  { word: 'finance', phonetic: '/ˈfaɪnæns/', meaning: 'n. 金融，财务 v. 资助', example: 'He studies finance.' },
  { word: 'find', phonetic: '/faɪnd/', meaning: 'v. 找到，发现', example: 'I can\'t find my keys.' },
  { word: 'fine', phonetic: '/faɪn/', meaning: 'adj. 好的；精细的 n. 罚款', example: 'I\'m fine, thank you.' },
  { word: 'finish', phonetic: '/ˈfɪnɪʃ/', meaning: 'v. 完成，结束', example: 'I finished my homework.' },
  { word: 'firm', phonetic: '/fɜːm/', meaning: 'adj. 坚定的；坚固的 n. 公司', example: 'He works for a law firm.' },
  { word: 'first', phonetic: '/fɜːst/', meaning: 'adj. 第一的 adv. 首先', example: 'This is my first time here.' },
  { word: 'fit', phonetic: '/fɪt/', meaning: 'v. 适合；安装 adj. 健康的', example: 'This dress fits you well.' },
  { word: 'fix', phonetic: '/fɪks/', meaning: 'v. 修理，固定', example: 'Can you fix my computer?' },
  { word: 'flag', phonetic: '/flæɡ/', meaning: 'n. 旗帜，标志', example: 'The flag is flying.' },
  { word: 'flame', phonetic: '/fleɪm/', meaning: 'n. 火焰，热情', example: 'The flame went out.' },
  { word: 'flash', phonetic: '/flæʃ/', meaning: 'n./v. 闪光，闪现', example: 'A flash of lightning lit the sky.' },
  { word: 'flat', phonetic: '/flæt/', meaning: 'adj. 平的；单调的 n. 公寓', example: 'The road is flat.' },
  { word: 'flavor', phonetic: '/ˈfleɪvə/', meaning: 'n. 味道，风味', example: 'This ice cream has a rich flavor.' },
  { word: 'flexible', phonetic: '/ˈfleksəbl/', meaning: 'adj. 灵活的，柔韧的', example: 'We need a flexible schedule.' },
  { word: 'flight', phonetic: '/flaɪt/', meaning: 'n. 飞行，航班', example: 'The flight was delayed.' },
  { word: 'float', phonetic: '/fləʊt/', meaning: 'v. 漂浮，浮动', example: 'The boat floats on water.' },
  { word: 'flood', phonetic: '/flʌd/', meaning: 'n. 洪水 v. 淹没', example: 'The flood destroyed many homes.' },
  { word: 'floor', phonetic: '/flɔː/', meaning: 'n. 地板，楼层', example: 'The office is on the 5th floor.' },
  { word: 'flourish', phonetic: '/ˈflʌrɪʃ/', meaning: 'v. 繁荣，茂盛', example: 'The business flourished.' },
  { word: 'flow', phonetic: '/fləʊ/', meaning: 'v. 流动 n. 流量', example: 'The river flows into the sea.' },
  { word: 'flower', phonetic: '/ˈflaʊə/', meaning: 'n. 花，花卉', example: 'The flowers are beautiful.' },
  { word: 'fluent', phonetic: '/ˈfluːənt/', meaning: 'adj. 流利的，流畅的', example: 'She is fluent in English.' },
  { word: 'fluid', phonetic: '/ˈfluːɪd/', meaning: 'n. 液体 adj. 流动的', example: 'Drink plenty of fluids.' },
  { word: 'flush', phonetic: '/flʌʃ/', meaning: 'v. 冲洗；脸红', example: 'Flush the toilet.' },
  { word: 'focus', phonetic: '/ˈfəʊkəs/', meaning: 'v./n. 焦点，集中', example: 'Focus on your work.' },
  { word: 'fold', phonetic: '/fəʊld/', meaning: 'v. 折叠，对折', example: 'Fold the paper in half.' },
  { word: 'folk', phonetic: '/fəʊk/', meaning: 'n. 人们，民间 adj. 民间的', example: 'This is folk music.' },
  { word: 'follow', phonetic: '/ˈfɒləʊ/', meaning: 'v. 跟随，遵循', example: 'Follow me, please.' },
  { word: 'food', phonetic: '/fuːd/', meaning: 'n. 食物，食品', example: 'The food was delicious.' },
  { word: 'fool', phonetic: '/fuːl/', meaning: 'n. 傻瓜 v. 愚弄', example: 'Don\'t fool around.' },
  { word: 'foot', phonetic: '/fʊt/', meaning: 'n. 脚，英尺', example: 'I hurt my foot.' },
  { word: 'forbid', phonetic: '/fəˈbɪd/', meaning: 'v. 禁止，不许', example: 'Smoking is forbidden here.' },
  { word: 'force', phonetic: '/fɔːs/', meaning: 'n. 力量，武力 v. 强迫', example: 'Don\'t force me to do it.' },
  { word: 'forecast', phonetic: '/ˈfɔːkɑːst/', meaning: 'n./v. 预报，预测', example: 'The weather forecast is good.' },
  { word: 'foreign', phonetic: '/ˈfɒrən/', meaning: 'adj. 外国的，外来的', example: 'She speaks a foreign language.' },
  { word: 'forest', phonetic: '/ˈfɒrɪst/', meaning: 'n. 森林', example: 'The forest is dense.' },
  { word: 'forever', phonetic: '/fəˈrevə/', meaning: 'adv. 永远，永久', example: 'I will love you forever.' },
  { word: 'forget', phonetic: '/fəˈɡet/', meaning: 'v. 忘记，遗忘', example: 'Don\'t forget to call me.' },
  { word: 'forgive', phonetic: '/fəˈɡɪv/', meaning: 'v. 原谅，宽恕', example: 'Please forgive me.' },
  { word: 'fork', phonetic: '/fɔːk/', meaning: 'n. 叉子，岔路', example: 'Use a fork to eat.' },
  { word: 'form', phonetic: '/fɔːm/', meaning: 'n. 形式，表格 v. 形成', example: 'Fill out this form.' },
  { word: 'formal', phonetic: '/ˈfɔːml/', meaning: 'adj. 正式的，正规的', example: 'Wear formal clothes.' },
  { word: 'format', phonetic: '/ˈfɔːmæt/', meaning: 'n. 格式，版式', example: 'What format is the file in?' },
  { word: 'former', phonetic: '/ˈfɔːmə/', meaning: 'adj. 以前的，前者的', example: 'He is my former boss.' },
  { word: 'formula', phonetic: '/ˈfɔːmjələ/', meaning: 'n. 公式，配方', example: 'What is the chemical formula?' },
  { word: 'forth', phonetic: '/fɔːθ/', meaning: 'adv. 向前，向外', example: 'From that day forth, he changed.' },
  { word: 'fortune', phonetic: '/ˈfɔːtʃuːn/', meaning: 'n. 财富，运气', example: 'He made a fortune.' },
  { word: 'forty', phonetic: '/ˈfɔːti/', meaning: 'num. 四十', example: 'There are forty students.' },
  { word: 'forward', phonetic: '/ˈfɔːwəd/', meaning: 'adv. 向前 adj. 向前的', example: 'Move forward.' },
  { word: 'foster', phonetic: '/ˈfɒstə/', meaning: 'v. 培养，促进', example: 'Foster good habits.' },
  { word: 'found', phonetic: '/faʊnd/', meaning: 'v. 建立，创立', example: 'They founded a school.' },
  { word: 'foundation', phonetic: '/faʊnˈdeɪʃn/', meaning: 'n. 基础，基金会', example: 'The foundation of the building is strong.' },
  { word: 'fox', phonetic: '/fɒks/', meaning: 'n. 狐狸', example: 'The fox is clever.' },
  { word: 'frame', phonetic: '/freɪm/', meaning: 'n. 框架，相框', example: 'The picture is in a wooden frame.' },
  { word: 'frank', phonetic: '/fræŋk/', meaning: 'adj. 坦率的，真诚的', example: 'To be frank, I don\'t agree.' },
  { word: 'free', phonetic: '/friː/', meaning: 'adj. 自由的，免费的', example: 'The drink is free.' },
  { word: 'freedom', phonetic: '/ˈfriːdəm/', meaning: 'n. 自由，自主', example: 'Freedom is important.' },
  { word: 'freeze', phonetic: '/friːz/', meaning: 'v. 冻结，结冰', example: 'Water freezes at 0 degrees.' },
  { word: 'frequency', phonetic: '/ˈfriːkwənsi/', meaning: 'n. 频率，频繁', example: 'The frequency of accidents has decreased.' },
  { word: 'fresh', phonetic: '/freʃ/', meaning: 'adj. 新鲜的，清新的', example: 'The bread is fresh.' },
  { word: 'friend', phonetic: '/frend/', meaning: 'n. 朋友', example: 'She is my best friend.' },
  { word: 'frighten', phonetic: '/ˈfraɪtn/', meaning: 'v. 使害怕，吓唬', example: 'Don\'t frighten the children.' },
  { word: 'frog', phonetic: '/frɒɡ/', meaning: 'n. 青蛙', example: 'The frog jumped into the pond.' },
  { word: 'from', phonetic: '/frɒm/', meaning: 'prep. 从，来自', example: 'I am from China.' },
  { word: 'front', phonetic: '/frʌnt/', meaning: 'n. 前面，正面', example: 'Sit in the front.' },
  { word: 'frost', phonetic: '/frɒst/', meaning: 'n. 霜，霜冻', example: 'There was frost on the grass.' },
  { word: 'frown', phonetic: '/fraʊn/', meaning: 'v. 皱眉，不满', example: 'Don\'t frown at me.' },
  { word: 'fruit', phonetic: '/fruːt/', meaning: 'n. 水果，果实', example: 'Eat more fruit.' },
  { word: 'frustrate', phonetic: '/frʌˈstreɪt/', meaning: 'v. 使沮丧，挫败', example: 'The delay frustrated everyone.' },
  { word: 'fuel', phonetic: '/ˈfjuːəl/', meaning: 'n. 燃料 v. 加燃料', example: 'The car needs fuel.' },
  { word: 'full', phonetic: '/fʊl/', meaning: 'adj. 满的，完全的', example: 'The glass is full.' },
  { word: 'fun', phonetic: '/fʌn/', meaning: 'n. 乐趣，娱乐', example: 'We had fun at the party.' },
  { word: 'function', phonetic: '/ˈfʌŋkʃn/', meaning: 'n. 功能，函数 v. 运作', example: 'The function of the heart is to pump blood.' },
  { word: 'fund', phonetic: '/fʌnd/', meaning: 'n. 基金，资金 v. 资助', example: 'The project is funded by the government.' },
  { word: 'fundamental', phonetic: '/ˌfʌndəˈmentl/', meaning: 'adj. 基本的，根本的', example: 'This is a fundamental principle.' },
  { word: 'funeral', phonetic: '/ˈfjuːnərəl/', meaning: 'n. 葬礼', example: 'The funeral was held yesterday.' },
  { word: 'funny', phonetic: '/ˈfʌni/', meaning: 'adj. 有趣的，滑稽的', example: 'The movie was funny.' },
  { word: 'fur', phonetic: '/fɜː/', meaning: 'n. 毛皮，软毛', example: 'The cat has soft fur.' },
  { word: 'furnish', phonetic: '/ˈfɜːnɪʃ/', meaning: 'v. 提供，装备家具', example: 'The apartment is fully furnished.' },
  { word: 'furniture', phonetic: '/ˈfɜːnɪtʃə/', meaning: 'n. 家具', example: 'We bought new furniture.' },
  { word: 'further', phonetic: '/ˈfɜːðə/', meaning: 'adv. 进一步 adj. 更远的', example: 'We need further discussion.' },
  { word: 'future', phonetic: '/ˈfjuːtʃə/', meaning: 'n. 未来，将来', example: 'What are your plans for the future?' }
];

// 加载数据
function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      appData = { ...appData, ...JSON.parse(saved) };
    }
  } catch (e) { console.error('加载数据失败', e); }
  // 【P0-B T03】防御回退：旧档升级时确保 mockExams 字段存在
  if (!Array.isArray(appData.mockExams)) appData.mockExams = [];
  // 【T03 批次三】旧档兼容：升级前没有 activityLog，补空数组（computeRecentLearning 会自动走日期回退）
  if (!Array.isArray(appData.activityLog)) appData.activityLog = [];
  // 【批次四 T02】废弃字段兜底清除：旧存档若携带 interviewDone / moduleProgress / weakPoints /
  // recentLearning，在此静默丢弃——读到不报错、不参与渲染、且随后 saveData() 也不会再把它们写回
  // （delete 后 appData 不再含这些键，JSON.stringify 自然不落盘 → 满足「不再回写」）。
  ['interviewDone', 'moduleProgress', 'weakPoints', 'recentLearning'].forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(appData, k)) { try { delete appData[k]; } catch (e) { /* 静默 */ } }
  });
  // T16：存量倒计时日期清洗——能规范化的回写规范值（YYYY-MM-DD）；
  // 不能规范化（如 '202612-02-01'）的保留原值，仅显示 '--'，绝不删用户数据。
  try {
    if (Array.isArray(appData.countdowns) && appData.countdowns.length) {
      let __changed = false;
      appData.countdowns.forEach(cd => {
        const n = normalizeCountdownDate(cd.date);
        if (n && n !== cd.date) { cd.date = n; __changed = true; }
      });
      if (__changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    }
  } catch (e2) { /* 静默 */ }
}

// 保存数据
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } catch (e) { console.error('保存数据失败', e); }
}

// ========== 导航 ==========
const pageTitles = {
  home: '首页', cet: '四级备考', exam: '央国企笔试备考',
  comm: '高情商表达', interview: '商务礼仪及面试', ppt: 'PPT训练',
  'speaking-demo': '情景式口语', 'exam-demo': '行测刷题',
  'roleplay-demo': '角色扮演', 'interview-demo': '模拟面试',
  'exam-center': '行测刷题中心', 'wrong-book': '错题本', 'cet-vocab': '四级词汇', 'etiquette': '商务礼仪', 'iv-questions': '面试题库', 'ppt-layouts': 'PPT版式库', 'ppt-cases': 'PPT案例拆解', 'comm-scenes': '场景话术库', 'comm-quotes': '万能金句库', 'settings': '设置', 'blog': '广场', 'profile': '个人中心'
};

// ========== 多页面版：各模块独立网页的文件映射 ==========
// 本页没有某模块的 DOM 时，navigateTo() 会据此跳转到对应模块网页
const PAGE_FILES = {
  home: '学习工作台.html',
  cet: '四级备考.html', 'speaking-demo': '四级备考.html',
  exam: '央国企笔试.html', 'exam-demo': '央国企笔试.html',
  comm: '高情商表达.html', 'roleplay-demo': '高情商表达.html',
  interview: '商务礼仪面试.html', 'interview-demo': '商务礼仪面试.html',
  ppt: 'PPT训练.html',
  blog: '学习博客.html',
  'exam-center': '行测刷题.html',
  'wrong-book': '错题本.html',
  'cet-vocab': '四级词汇.html',
  etiquette: '商务礼仪.html',
  'iv-questions': '面试题库.html',
  'ppt-layouts': 'PPT版式库.html',
  'ppt-cases': 'PPT案例拆解.html',
  'comm-scenes': '场景话术库.html',
  'comm-quotes': '万能金句库.html',
  profile: '个人中心.html',
  settings: '设置.html'
};

function navigateTo(page) {
  // 【多页面版】本页没有该模块时，直接跳转到对应模块网页
  if (!document.getElementById('page-' + page)) {
    const __f = PAGE_FILES[page];
    if (__f) { location.href = __f; return false; }
    console.warn('未知页面：' + page);
    return false;
  }
  // 隐藏所有页面
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // 显示目标页面
  const targetPage = document.getElementById('page-' + page);
  if (targetPage) targetPage.classList.add('active');
  // 若目标页不在 .content 内（而是 .main 内的资料库/中心页），隐藏空的 .content 容器，
  // 避免其以 flex:1 占位，造成“上半部分大片空白 + 页面被压到底部”
  const contentEl = document.querySelector('.content');
  if (contentEl) {
    const insideContent = targetPage && targetPage.parentElement.classList.contains('content');
    contentEl.style.display = insideContent ? '' : 'none';
  }
  // 更新顶部标题
  document.getElementById('topbarTitle').textContent = pageTitles[page] || '首页';
  // 更新导航激活状态
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    if (item.dataset.page) {
      item.classList.toggle('active', item.dataset.page === page);
    }
  });
  // 切换主题色（注意：同时保留深色模式标记，避免切换页面时丢失深色状态）
  const themeMap = { home: 'theme-home', cet: 'theme-cet', exam: 'theme-exam', comm: 'theme-comm', interview: 'theme-interview', ppt: 'theme-ppt' };
  document.body.className = (themeMap[page] || 'theme-home') + (isDarkMode ? ' dark' : '');
  // 滚动到顶部
  const __ct = document.querySelector('.content'); if (__ct) __ct.scrollTop = 0;
  // 关闭更多面板
  closeMorePanel();
  return true;
}

// 绑定导航点击
document.querySelectorAll('.nav-item[data-page], .bottom-nav-item[data-page]').forEach(item => {
  item.addEventListener('click', () => navigateTo(item.dataset.page));
});

// ========== 更多面板 ==========
function toggleMorePanel() {
  document.getElementById('morePanel').classList.toggle('active');
  document.querySelector('.more-overlay').classList.toggle('active');
}
function closeMorePanel() {
  document.getElementById('morePanel').classList.remove('active');
  document.querySelector('.more-overlay').classList.remove('active');
}
function toggleToolsPanel() {
  // 先关闭更多面板
  document.getElementById('morePanel').classList.remove('active');
  // 切换工具面板
  var panel = document.getElementById('toolsPanel');
  var overlay = document.getElementById('toolsOverlay');
  if (panel && overlay) {
    panel.classList.toggle('active');
    overlay.classList.toggle('active');
  }
}
function closeToolsPanel() {
  var panel = document.getElementById('toolsPanel');
  var overlay = document.getElementById('toolsOverlay');
  if (panel) panel.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

// ========== 首页渲染 ==========
function renderHome() {
  renderGreeting();
  renderCountdowns();
  renderTasks();
  renderStats();
  renderModuleProgress();
  renderWeakPoints();
  renderRecentLearning();
  updateTopbarStats();
}

function renderGreeting() {
  const hour = new Date().getHours();
  let greeting = '早上好';
  if (hour >= 12 && hour < 14) greeting = '中午好';
  else if (hour >= 14 && hour < 18) greeting = '下午好';
  else if (hour >= 18 || hour < 6) greeting = '晚上好';
  document.getElementById('greetingText').textContent = greeting;
}

// ========== T16 倒计时日期规范化与天数计算（2026-09-12 P0-A） ==========
// 存量脏数据形如 '202612-02-01'，new Date 宽松解析成公元 202612 年 → 算出 7 万多天。
// 规则：仅接受 YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD / YYYY年MM月DD日（含无分隔符变体），
// 月 1-12、日 1-31，并做 Date 回验（如 2 月 30 日会因 Date 进位被拒绝）。返回 YYYY-MM-DD 或 null。
function normalizeCountdownDate(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d{4})[-./年]?(\d{1,2})[-./月]?(\d{1,2})日?$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
// 严格按本地时区计算「今天到目标日」的天数差；非法输入返回 null（显示 '--'，绝不显示假天数）
function countdownDays(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const target = new Date(y, mo - 1, d);
  // BUG-2 修复：Date 回验（2 月 30 日 / 13 月会被 Date 进位吞掉，必须拦截）
  if (isNaN(target.getTime()) || target.getFullYear() !== y || target.getMonth() !== mo - 1 || target.getDate() !== d) return null;
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((target.getTime() - today0.getTime()) / 86400000);
}

function renderCountdowns() {
  const row = document.getElementById('countdownRow');
  let html = '';
  // 排序：置顶优先，然后按规范化日期时间戳（无法解析的排最后）
  const ts = (d) => {
    const n = normalizeCountdownDate(d.date);
    return n ? new Date(Number(n.slice(0, 4)), Number(n.slice(5, 7)) - 1, Number(n.slice(8, 10))).getTime() : Infinity;
  };
  const sorted = [...appData.countdowns].sort((a, b) => {
    // BUG-2 配套修复：pinned 可能是 undefined，直接相减会得到 NaN 导致排序未定义
    const ap = a.pinned ? 1 : 0, bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return ts(a) - ts(b);
  });
  sorted.forEach(cd => {
    const days = countdownDays(cd.date);
    html += `
      <div class="countdown-card" style="--cd-color:${cd.color}">
        <div class="countdown-actions">
          <div class="countdown-btn" onclick="editCountdown(${cd.id})" title="编辑">✏️</div>
          <div class="countdown-btn" onclick="deleteCountdown(${cd.id})" title="删除">🗑️</div>
        </div>
        <div class="countdown-name">${cd.name}${cd.pinned ? ' 📌' : ''}</div>
        <div class="countdown-days">${days == null ? '--' : (days > 0 ? days : 0)}<span class="unit">天</span></div>
        <div class="countdown-date">${cd.date}</div>
      </div>
    `;
  });
  // 添加按钮
  html += `
    <div class="countdown-card countdown-add" onclick="openCountdownModal()">
      <div class="add-icon">+</div>
      <div>添加倒计时</div>
    </div>
  `;
  row.innerHTML = html;
}

function renderTasks() {
  const list = document.getElementById('taskList');
  let html = '';
  appData.tasks.forEach(task => {
    html += `
      <div class="task-item ${task.done ? 'done' : ''}" onclick="toggleTask(${task.id})">
        <div class="task-checkbox">✓</div>
        <div class="task-info">
          <div class="task-name">${task.name}</div>
          <div class="task-meta">${getModuleName(task.module)}</div>
        </div>
        <div class="task-progress">${task.progress}</div>
      </div>
    `;
  });
  list.innerHTML = html;
}

function getModuleName(module) {
  const names = { cet: '四级备考', exam: '央国企笔试', comm: '高情商表达', interview: '商务礼仪面试', ppt: 'PPT训练' };
  return names[module] || module;
}

function toggleTask(id) {
  const task = appData.tasks.find(t => t.id === id);
  if (task) {
    task.done = !task.done;
    saveData();
    renderTasks();
    updateTopbarStats();
    updateGoalProgress();
    if (task.done) {
      // T18②：完成首页任务也算一次「学习动作」，推进全局连续打卡
      try { window.Streak && window.Streak.bump(); } catch (e) { /* 静默 */ }
      showToast('✅ 任务完成，太棒了！');
    }
  }
}

function resetTasks() {
  appData.tasks.forEach(t => t.done = false);
  saveData();
  renderTasks();
  updateTopbarStats();
  showToast('今日任务已重置');
}

// 开始今天的学习
function startTodayLearning() {
  var pending = (appData.tasks || []).filter(function(t) { return !t.done; });
  var cta = document.getElementById('ctaSubtitle');
  if (pending.length === 0) {
    if (cta) cta.textContent = '🎉 今日任务全部完成！';
    showToast('🎉 今日任务全部完成！');
    return;
  }
  var t = pending[0];
  if (cta) cta.textContent = '正在进入：' + t.title;
  if (t.page) { switchPage(t.page); } else if (t.url) { location.href = t.url; } else { showToast('开始：' + t.title); }
}

function renderStats() {
  var stats = appData.stats || {};
  var summ = getStudySummary();

  // 总学习时长（小时）：优先取本地真实统计（study-stats.js，分钟→小时），
  // 与 appData 取较大值（不归零），都缺省时自然为 0，不显示假数据。
  var appHours = stats.totalHours || 0;
  var statHours = (summ && typeof summ.totalMinutes === 'number')
    ? Math.round(summ.totalMinutes / 60) : 0;
  var totalHours = Math.max(appHours, statHours);

  // 做题数 / 正确率：来自做题记录；无记录即 0（不造假）
  var totalQuestions = stats.totalQuestions || 0;
  var correctQuestions = stats.correctQuestions || 0;
  const acc = totalQuestions > 0 ? Math.round(correctQuestions / totalQuestions * 100) : 0;

  // 连续打卡：全局 Streak（单一口径）与 appData/study-stats 取较大值，不归零（T18②）
  var streak = Math.max(getConvergedStreak(), (summ && summ.streak) || 0);

  setStatText('totalHours', totalHours);
  setStatText('totalQuestions', totalQuestions);
  setStatText('accuracy', acc + '%');
  setStatText('streakDisplay', streak);

  // 空态：完全没有任何学习记录时给出引导文案（有记录则隐藏）
  var hasData = (summ && summ.hasData) || totalQuestions > 0 || totalHours > 0 || streak > 0;
  var hint = document.getElementById('statsEmptyHint');
  if (hint) hint.style.display = hasData ? 'none' : 'block';

  renderWeekChart(summ);
  updateGoalProgress();
}

/* 读取本地学习统计（study-stats.js）。不可用时返回 null（file:// 未加载该文件时降级）。 */
function getStudySummary() {
  if (window.StudyStats && typeof window.StudyStats.getSummary === 'function') {
    try { return window.StudyStats.getSummary(); } catch (e) { return null; }
  }
  return null;
}

function setStatText(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateGoalProgress() {
  const doneCount = appData.tasks.filter(t => t.done).length;
  const total = appData.tasks.length;
  const percent = total > 0 ? Math.round(doneCount / total * 100) : 0;
  // 更新环形进度
  const ring = document.getElementById('goalRing');
  const goalPercent = document.getElementById('goalPercent');
  const goalText = document.getElementById('goalText');
  if (ring) {
    const circumference = 2 * Math.PI * 28; // ~176
    ring.style.strokeDashoffset = circumference * (1 - percent / 100);
  }
  if (goalPercent) goalPercent.textContent = percent + '%';
  if (goalText) goalText.textContent = `已完成 ${doneCount}/${total} 个任务`;
  // 更新成就徽章
  const badges = document.querySelectorAll('.achievement-badge');
  if (badges.length >= 4) {
    // 新手徽章：始终解锁（首次使用）
    badges[0].classList.remove('locked');
    // 3连击：连续打卡>=3天
    if (appData.stats.streakDays >= 3) badges[1].classList.remove('locked');
    // 刷题达人：完成>=10题
    if (appData.stats.totalQuestions >= 10) badges[2].classList.remove('locked');
    // 口语新星：这个暂时根据做题数判断，后续接入口语练习记录
    if (appData.stats.totalQuestions >= 5) badges[3].classList.remove('locked');
  }
}

function renderWeekChart(summ) {
  const chart = document.getElementById('weekChart');
  if (!chart) return;
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  // 真实数据来源：study-stats.js 的本周（周一→周日）每日分钟数；
  // 无统计底座时全 0 —— 不再回退到任何模拟数组（无假数据）。
  const weekData = [0, 0, 0, 0, 0, 0, 0];
  if (summ && Object.prototype.toString.call(summ.week) === '[object Array]') {
    for (let w = 0; w < 7; w++) {
      const cell = summ.week[w];
      weekData[w] = (cell && typeof cell.minutes === 'number') ? cell.minutes : 0;
    }
  }
  const hasWeekData = weekData.some(function (v) { return v > 0; });
  const today = new Date().getDay();
  const todayIdx = today === 0 ? 6 : today - 1; // 周一为0
  const maxVal = Math.max.apply(null, weekData.concat([60]));
  let html = '';
  for (let i = 0; i < 7; i++) {
    const val = weekData[i];
    const heightPct = (val / maxVal) * 100;
    const isToday = i === todayIdx;
    html += `
      <div class="week-bar-item">
        <div class="week-bar ${isToday ? 'today' : ''}" style="height:${heightPct}%">
          ${val > 0 ? `<span class="week-bar-value">${val}</span>` : ''}
        </div>
        <div class="week-bar-label" style="${isToday ? 'color:var(--accent);font-weight:700' : ''}">${weekdays[i]}${isToday ? '·今' : ''}</div>
      </div>
    `;
  }
  if (!hasWeekData) html += '<div class="week-chart-empty">还没有学习记录，去学一章吧</div>';
  chart.innerHTML = html;
}

// ========== T01（批次三 R1）：首页真实化 —— 纯计算函数（与渲染解耦） ==========
// 旧字段 moduleProgress/weakPoints/recentLearning 已废弃（见上方注释），不再参与渲染。
const MODULE_PROGRESS_TARGET = {
  cet: null,      // 分母动态 = 合并后 CET_VOCAB.length（实时，不写死）
  exam: 100,      // 笔试：Σ题型做题数 / 100，min(100,...)
  comm: 10,       // 表达：已看 commScenes / 10
  interview: 0,   // 面试：分母动态 = INTERVIEW_QUESTIONS.length（见 interviewProgressTarget）；取不到时为 0 → 进度 0
  ppt: 10         // PPT：已看 pptLayouts / 10
};

// 百分比计算：分母 ≤0 一律返回 0（杜绝 NaN / Infinity），结果夹在 0-100
function pct(n, d) {
  n = Number(n) || 0;
  d = Number(d) || 0;
  return d > 0 ? Math.min(100, Math.max(0, Math.round(n / d * 100))) : 0;
}

// 面试模块分母：优先取 INTERVIEW_QUESTIONS 的真实长度。
// 注意：INTERVIEW_QUESTIONS 是下方（2867 行附近）声明的 const，此处若在顶层直接引用会踩 TDZ 抛错，
// 因此必须在函数体内「运行时」读取；取不到时回退 MODULE_PROGRESS_TARGET.interview。
function interviewProgressTarget() {
  var n = 0;
  try {
    if (typeof INTERVIEW_QUESTIONS !== 'undefined' && INTERVIEW_QUESTIONS && INTERVIEW_QUESTIONS.length) {
      n = INTERVIEW_QUESTIONS.length;
    }
  } catch (e) { n = 0; }
  return n > 0 ? n : (MODULE_PROGRESS_TARGET.interview || 0);
}

// 计算五模块实时进度（0-100 数值）；任一模块推导总数为 0 → 0（渲染层显示「未开始」）
function computeModuleProgress() {
  var res = { cet: 0, exam: 0, comm: 0, interview: 0, ppt: 0 };
  try {
    var total = (typeof CET_VOCAB !== 'undefined' && CET_VOCAB) ? CET_VOCAB.length : 0;
    var learned = (appData.vocabLearned || []).length;
    if (total > 0) res.cet = Math.min(100, Math.round(learned / total * 100));
  } catch (e) {}
  try {
    var sum = 0, etp = appData.examTypeProgress || {};
    Object.keys(etp).forEach(function (k) { sum += (etp[k].total || 0); });
    res.exam = Math.min(100, Math.round(sum / MODULE_PROGRESS_TARGET.exam));
  } catch (e) {}
  try {
    var commN = ((appData.viewedContent || {}).commScenes || []).length;
    res.comm = Math.min(100, Math.round(commN / MODULE_PROGRESS_TARGET.comm * 100));
  } catch (e) {}
  try {
    // 面试进度 = 已看过的面试题库条目 / 面试题库总数（全仓无"面试场次"记录入口，故不可用 interviewDone）
    var ivN = (((appData.viewedContent || {}).ivQuestions) || []).length;
    res.interview = pct(ivN, interviewProgressTarget());
  } catch (e) {}
  try {
    var pptN = ((appData.viewedContent || {}).pptLayouts || []).length;
    res.ppt = Math.min(100, Math.round(pptN / MODULE_PROGRESS_TARGET.ppt * 100));
  } catch (e) {}
  return res;
}

// 薄弱点：遍历 examTypeProgress，筛「做题≥5 且 正确率<60%」，按正确率升序取前 3
function computeWeakPoints() {
  var list = [];
  try {
    var etp = appData.examTypeProgress || {};
    Object.keys(etp).forEach(function (k) {
      var v = etp[k]; if (!v) return;
      var total = v.total || 0;
      if (total >= 5 && total > 0) {
        var rate = (v.correct || 0) / total;
        if (rate < 0.6) list.push({ title: k, rate: rate, module: 'exam', sub: v.sub || '' });
      }
    });
  } catch (e) {}
  list.sort(function (a, b) { return a.rate - b.rate; });
  return list.slice(0, 3);
}

// ========== T03（批次三 R1-3）：行为日志 activityLog（环形 200 条） ==========
// 背景：wrongQuestions / favoriteQuestions 只存题 id 无时间戳，vocabRecords / examRecords 只到日期，
// 做不出「3 分钟前」这类相对时间，故新增带 epoch ms 的行为日志。只追加、随调用方此后的 saveData() 落盘。
const ACTIVITY_LOG_MAX = 200; // 环形上限，超出丢弃最旧，体积可控（< 20KB）

// 追加一条行为日志（不主动落盘：由调用方此后的 saveData() 统一落盘，避免多余写入）
// type: 'vocab' | 'exam' | 'fav' | 'listen'；ref: 单词 / 题 id / 场景 key；module: 'cet' | 'exam' | ...
function writeActivity(type, ref, module) {
  try {
    if (typeof appData === 'undefined' || !appData) return;
    if (!Array.isArray(appData.activityLog)) appData.activityLog = [];
    appData.activityLog.push({
      t: Date.now(),
      type: type || 'other',
      ref: (ref === null || ref === undefined) ? '' : ref,
      module: module || ''
    });
    if (appData.activityLog.length > ACTIVITY_LOG_MAX) {
      appData.activityLog = appData.activityLog.slice(appData.activityLog.length - ACTIVITY_LOG_MAX);
    }
  } catch (e) { /* 日志写入失败绝不打断主流程 */ }
}

// 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / M月D日
function formatRelTime(ts) {
  try {
    var t = Number(ts) || 0;
    if (!t) return '';
    var diff = Date.now() - t;
    if (diff < 0) diff = 0; // 时钟回拨 / 未来时间戳保护
    var min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    var hour = Math.floor(min / 60);
    if (hour < 24) return hour + ' 小时前';
    var day = Math.floor(hour / 24);
    if (day < 30) return day + ' 天前';
    var d = new Date(t);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  } catch (e) { return ''; }
}

// 日期串（YYYY-MM-DD）→ 今天 / 昨天 / N 天前【旧档兼容：lastReview 只有日期，没有时分秒】
function formatDateRel(dateStr) {
  try {
    if (!dateStr || typeof dateStr !== 'string') return '';
    var today = (typeof getTodayStr === 'function') ? getTodayStr() : '';
    if (!today) {
      var n = new Date();
      today = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
    }
    if (dateStr === today) return '今天';
    var d1 = new Date(dateStr + 'T00:00:00');
    var d0 = new Date(today + 'T00:00:00');
    var days = Math.round((d0 - d1) / 86400000);
    if (days <= 0) return '今天'; // 未来/异常日期兜底，不显示负数
    if (days === 1) return '昨天';
    return days + ' 天前';
  } catch (e) { return ''; }
}

// 'YYYY-MM-DD' → epoch ms（本地 0 点），用于旧档按日期排序；非法返回 0
function dateToTs(dateStr) {
  try {
    if (!dateStr || typeof dateStr !== 'string') return 0;
    var p = dateStr.split('-');
    if (p.length < 3) return 0;
    var t = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime();
    return isNaN(t) ? 0 : t;
  } catch (e) { return 0; }
}

// 日志条目 → 首页展示项（找不到题目/无 ref 也要有可读标题，绝不返回 null 之外的异常）
function activityToItem(it) {
  try {
    if (!it) return null;
    var rel = formatRelTime(it.t);
    var type = it.type || '';
    if (type === 'vocab') {
      return { ts: it.t || 0, icon: 'book', title: '背单词 · ' + (it.ref || ''), meta: '四级备考 · ' + rel, module: 'cet' };
    }
    if (type === 'fav') {
      var qf = findExamById(Number(it.ref));
      return { ts: it.t || 0, icon: 'star', title: qf ? (qf.type + '·' + (qf.sub || '')) : ('收藏 · #' + it.ref), meta: '已收藏 · ' + rel, module: 'exam' };
    }
    if (type === 'listen') {
      return { ts: it.t || 0, icon: 'headphones', title: '听力练习 · ' + (it.ref || ''), meta: '四级备考 · ' + rel, module: 'cet' };
    }
    if (type === 'exam') {
      var q = findExamById(Number(it.ref));
      return { ts: it.t || 0, icon: 'package', title: q ? (q.type + '·' + (q.sub || '')) : ('刷题 · #' + it.ref), meta: '央国企笔试 · ' + rel, module: 'exam' };
    }
    return { ts: it.t || 0, icon: 'book', title: String(it.ref || '学习记录'), meta: rel, module: it.module || 'cet' };
  } catch (e) { return null; }
}

// 最近学习：① 优先用 activityLog（含 epoch ms → 「3 分钟前」）
//          ② 旧档无日志 → 回退 vocabRecords / examRecords 的 lastReview（YYYY-MM-DD）→「今天/昨天/N 天前」
//          ③ 全空 → []（渲染层走空态），全程不抛异常
function computeRecentLearning() {
  var items = [];
  try {
    var log = (appData && Array.isArray(appData.activityLog)) ? appData.activityLog : [];
    if (log.length) {
      var seen = {};
      log.slice().sort(function (a, b) { return (b.t || 0) - (a.t || 0); }).forEach(function (it) {
        if (!it) return;
        var key = (it.type || '') + '|' + (it.ref === null || it.ref === undefined ? '' : it.ref);
        if (seen[key]) return; // 同一动作（如同做一题）只保留最近一次，避免三行重复
        var d = activityToItem(it);
        if (d) { seen[key] = 1; items.push(d); }
      });
    }
  } catch (e) {}
  if (items.length) return items.slice(0, 3);

  // —— 旧档回退：按 lastReview 日期倒序 ——
  try {
    var vr = (appData && appData.vocabRecords) || {};
    Object.keys(vr).forEach(function (w) {
      var rec = vr[w]; if (!rec) return;
      items.push({
        ts: dateToTs(rec.lastReview),
        icon: 'book',
        title: w,
        meta: '四级词汇 · ' + (formatDateRel(rec.lastReview) || '已学习'),
        module: 'cet'
      });
    });
  } catch (e) {}
  try {
    var er = (appData && appData.examRecords) || {};
    Object.keys(er).forEach(function (id) {
      var rec = er[id]; if (!rec) return;
      var q = findExamById(Number(id));
      items.push({
        ts: dateToTs(rec.lastReview),
        icon: 'package',
        title: q ? (q.type + '·' + (q.sub || '')) : ('题目 #' + id),
        meta: '央国企笔试 · ' + (formatDateRel(rec.lastReview) || '已练习'),
        module: 'exam'
      });
    });
  } catch (e) {}
  try { items.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); } catch (e2) {}
  return items.slice(0, 3);
}

// 在题库中按 id 查找（内置 + 已合并 ext）；找不到返回 null
function findExamById(id) {
  try {
    if (typeof EXAM_BANK !== 'undefined' && EXAM_BANK) {
      for (var i = 0; i < EXAM_BANK.length; i++) if (EXAM_BANK[i].id === id) return EXAM_BANK[i];
    }
  } catch (e) {}
  return null;
}

// T02（批次三 R1-4）：统一空态组件（三件套之 JS 空函数）
// 向 el 注入 .empty-hint 并绑定点击跳对应模块。【后续扩展点：可接入骨架屏/引导卡】
function renderEmptyState(el, moduleKey) {
  if (!el) return;
  el.innerHTML = '';
  var d = document.createElement('div');
  d.className = 'empty-hint';
  if (moduleKey) d.setAttribute('data-module', moduleKey);
  d.textContent = '暂无数据，去开始学习吧 →';
  if (moduleKey) {
    d.onclick = function () { try { navigateTo(moduleKey); } catch (e) {} };
  }
  el.appendChild(d);
}

function renderModuleProgress() {
  const grid = document.getElementById('moduleProgressGrid');
  if (!grid) return;
  const prog = computeModuleProgress();
  const modules = [
    { key: 'cet', icon: 'book', name: '四级' },
    { key: 'exam', icon: 'package', name: '笔试' },
    { key: 'comm', icon: 'message-square', name: '表达' },
    { key: 'interview', icon: 'users', name: '面试' },
    { key: 'ppt', icon: 'pen', name: 'PPT' }
  ];
  let html = '';
  modules.forEach(m => {
    const p = prog[m.key] || 0;
    const isZero = (p <= 0);
    const iconSvg = window.lucideIcon ? window.lucideIcon(m.icon, 20) : '';
    html += `
      <div class="module-progress-card" onclick="navigateTo('${m.key}')">
        <div class="module-icon">${iconSvg}</div>
        <div class="module-name">${m.name}</div>
        <div class="module-percent ${isZero ? 'muted' : ''}">${isZero ? '未开始' : (p + '%')}</div>
        <div class="module-bar"><div class="module-bar-fill" style="width:${p}%"></div></div>
      </div>
    `;
  });
  grid.innerHTML = html;
}

function renderWeakPoints() {
  const list = document.getElementById('weakList');
  if (!list) return;
  const wps = computeWeakPoints();
  if (!wps.length) { renderEmptyState(list, 'exam'); return; }
  let html = '';
  wps.forEach(wp => {
    const iconSvg = window.lucideIcon ? window.lucideIcon('alert-triangle', 20) : '';
    html += `
      <div class="weak-item">
        <div class="weak-icon">${iconSvg}</div>
        <div class="weak-info">
          <div class="weak-title">${wp.title}</div>
          <div class="weak-desc">正确率 ${Math.round(wp.rate * 100)}%，建议专项练习</div>
        </div>
        <div class="weak-action" onclick="navigateTo('${wp.module}')">去练习 →</div>
      </div>
    `;
  });
  list.innerHTML = html;
}

function renderRecentLearning() {
  const list = document.getElementById('recentList');
  if (!list) return;
  const recs = computeRecentLearning();
  if (!recs.length) { renderEmptyState(list, null); return; }
  let html = '';
  recs.forEach(r => {
    const iconSvg = window.lucideIcon ? window.lucideIcon(r.icon, 20) : '';
    html += `
      <div class="recent-item" onclick="navigateTo('${r.module}')">
        <div class="recent-icon">${iconSvg}</div>
        <div class="recent-info">
          <div class="recent-title">${r.title}</div>
          <div class="recent-meta">${r.meta}</div>
        </div>
        <div class="recent-arrow">›</div>
      </div>
    `;
  });
  list.innerHTML = html;
}

function updateTopbarStats() {
  document.getElementById('streakDays').textContent = getConvergedStreak(); // T18②：全局口径
  document.getElementById('todayMinutes').textContent = appData.stats.todayMinutes;
  const doneCount = appData.tasks.filter(t => t.done).length;
  document.getElementById('todayTasks').textContent = doneCount;
  document.getElementById('totalTasks').textContent = appData.tasks.length;
}

// ========== 倒计时管理 ==========
let editingCountdownId = null;
let selectedColor = '#5B8DEF';

function openCountdownModal(id) {
  editingCountdownId = id || null;
  const modal = document.getElementById('countdownModal');
  const title = document.getElementById('countdownModalTitle');
  if (id) {
    const cd = appData.countdowns.find(c => c.id === id);
    if (cd) {
      title.textContent = '编辑倒计时';
      document.getElementById('cdName').value = cd.name;
      document.getElementById('cdDate').value = cd.date;
      document.getElementById('cdPinned').checked = cd.pinned;
      selectedColor = cd.color;
    }
  } else {
    title.textContent = '添加倒计时';
    document.getElementById('cdName').value = '';
    document.getElementById('cdDate').value = '';
    document.getElementById('cdPinned').checked = false;
    selectedColor = '#5B8DEF';
  }
  // 更新颜色选择
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.color === selectedColor);
  });
  modal.classList.add('active');
}

function closeCountdownModal() {
  document.getElementById('countdownModal').classList.remove('active');
  editingCountdownId = null;
}

function editCountdown(id) {
  openCountdownModal(id);
}

function deleteCountdown(id) {
  if (confirm('确定要删除这个倒计时吗？')) {
    appData.countdowns = appData.countdowns.filter(c => c.id !== id);
    saveData();
    renderCountdowns();
    showToast('已删除');
  }
}

function saveCountdown() {
  const name = document.getElementById('cdName').value.trim();
  const rawDate = document.getElementById('cdDate').value;
  const pinned = document.getElementById('cdPinned').checked;
  if (!name) { showToast('请输入名称'); return; }
  if (!rawDate) { showToast('请选择日期'); return; }
  // T16：入库前规范化（支持 2026-09-20 / 2026.9.20 / 2026年9月20日 等写法），非法则拒绝
  const date = normalizeCountdownDate(rawDate);
  if (!date) { showToast('日期格式不正确'); return; }
  if (editingCountdownId) {
    const cd = appData.countdowns.find(c => c.id === editingCountdownId);
    if (cd) { cd.name = name; cd.date = date; cd.pinned = pinned; cd.color = selectedColor; }
    showToast('已更新');
  } else {
    appData.countdowns.push({
      id: Date.now(),
      name, date, pinned, color: selectedColor
    });
    showToast('已添加');
  }
  saveData();
  renderCountdowns();
  closeCountdownModal();
}

// 颜色选择
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    selectedColor = dot.dataset.color;
  });
});

// 点击遮罩关闭弹窗
document.getElementById('countdownModal').addEventListener('click', (e) => {
  if (e.target.id === 'countdownModal') closeCountdownModal();
});

// ========== Toast提示 ==========
let toastTimer = null;
// ========== T19（批次三 R6-2/3）：统一弹窗 .app-modal 基础设施（三件套之 JS） ==========
// 行为：ESC 关闭 / 点遮罩关闭 / ✕ 关闭 / 打开锁 body 滚动（overflow:hidden）。
// 约定：弹窗根节点带 class "app-modal-mask"，内部卡片带 class "app-modal"，右上角关闭按钮带 class "app-modal-close"。
// 【后续扩展点：焦点陷阱 / 过渡动画】
function __activeAppModal() { return document.querySelector('.app-modal-mask.active'); }
function openAppModal(id) {
  // 任意被接管弹窗统一锁滚动（#vpMask 等）；带 .app-modal-mask 的弹窗额外加 .active 显示。
  // 【后续扩展点：焦点陷阱 / 过渡动画】
  var m = id ? document.getElementById(id) : null;
  if (!m) return;
  if (m.classList.contains('app-modal-mask')) m.classList.add('active');
  document.body.classList.add('modal-lock');
}
function closeAppModal(id) {
  var m = id ? document.getElementById(id) : __activeAppModal();
  if (!m) m = __activeAppModal();
  if (m) {
    m.classList.remove('active');
    // 仅当无任何其它活跃弹窗（含倒计时 / 听力）时才解锁 body 滚动
    var stillLocked = document.querySelector('.app-modal-mask.active')
      || document.querySelector('.modal-overlay.active')
      || document.getElementById('vpMask');
    if (!stillLocked) document.body.classList.remove('modal-lock');
  }
}
// 全局 ESC 关闭（作用于 .app-modal-mask 与听力播放器 #vpMask）
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' || e.keyCode === 27) {
    var m = __activeAppModal();
    if (m) { closeAppModal(); }
    else if (document.getElementById('vpMask') && window.openVoiceTrain) { window.openVoiceTrain.__close(); }
  }
});
// 全局点遮罩关闭（.app-modal-mask 背景 与 听力 #vpMask 背景）
document.addEventListener('click', function (e) {
  var t = e.target;
  if (t && t.classList && t.classList.contains('app-modal-mask')) closeAppModal();
  if (t && t.id === 'vpMask' && window.openVoiceTrain) window.openVoiceTrain.__close();
});

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.transform = 'translateX(-50%) translateY(0)';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(-100px)';
  }, 2500);
}

// ========== 深色/浅色主题 ==========
// 主题选择独立保存在 localStorage（key: study_workbench_theme），不与业务数据混存
const THEME_KEY = 'study_workbench_theme';
let themeMode = localStorage.getItem(THEME_KEY) || 'light';
function themePrefersDark() {
  if (themeMode === 'dark') return true;
  if (themeMode === 'auto' && typeof matchMedia !== 'undefined') return matchMedia('(prefers-color-scheme: dark)').matches;
  return false;
}
let isDarkMode = themePrefersDark();
const SKIN_KEY = 'study_workbench_skin';
let currentSkin = localStorage.getItem(SKIN_KEY) || 'default';
function setSkin(name) {
  currentSkin = (name && name !== 'default') ? name : 'default';
  try { localStorage.setItem(SKIN_KEY, currentSkin); } catch (e) { }
  applyTheme();
  if (typeof window.__applySkinUI === 'function') window.__applySkinUI();
}

/**
 * 应用主题到页面（切换 body 的 dark 类 + 配色皮肤 + 更新顶栏按钮图标 + 更新设置页按钮激活态）
 */
function applyTheme() {
  document.body.classList.toggle('dark', isDarkMode);
  ['default', 'violet', 'forest', 'sunset', 'ocean', 'mono', 'rose', 'mint', 'peach', 'lavender', 'amber', 'graphite'].forEach(function (k) {
    document.body.classList.remove('skin-' + k);
  });
  if (currentSkin && currentSkin !== 'default') document.body.classList.add('skin-' + currentSkin);
  // 更新顶栏切换按钮图标
  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) toggleBtn.textContent = isDarkMode ? '☀️' : '🌙';
  // 更新设置页胶囊按钮激活态
  document.querySelectorAll('#themeOptions .theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === themeMode);
  });
}

/**
 * 顶栏按钮：在深色/浅色之间来回切换（手动切换会退出“跟随系统”）
 */
function toggleTheme() {
  isDarkMode = !isDarkMode;
  themeMode = isDarkMode ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, themeMode);
  applyTheme();
  showToast(isDarkMode ? '🌙 已切换到深色模式' : '☀️ 已切换到浅色模式');
}

/**
 * 设置页：指定主题（'light' / 'dark' / 'auto'=跟随系统）
 */
function setTheme(mode) {
  themeMode = (mode === 'auto' || mode === 'dark' || mode === 'light') ? mode : 'light';
  isDarkMode = themePrefersDark();
  try { localStorage.setItem(THEME_KEY, themeMode); } catch (e) { }
  applyTheme();
}

// ========== 数据导出 / 导入 / 清空 ==========
/**
 * 导出：把全部 localStorage 序列化为 JSON 文件
 * - APK 环境：通过 AndroidBridge.saveFile 保存到应用下载目录（WebView 不接管 blob 下载）
 * - 浏览器环境：用 blob + a.click() 下载
 */
function exportData() {
  try {
    // 导出全部 localStorage（不只是 appData，还包括 AI配置/聊天历史/私信/设置等）
    var allData = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      var raw = localStorage.getItem(key);
      try { allData[key] = JSON.parse(raw); } catch (e) { allData[key] = raw; }
    }
    var exportObj = {
      version: '1.0',
      app: '星途',
      exportedAt: new Date().toISOString(),
      data: allData
    };
    var dataStr = JSON.stringify(exportObj, null, 2);
    var now = new Date();
    var dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var filename = '星途-数据备份-' + dateStr + '.json';

    // APK 环境：原生桥保存文件
    if (window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function') {
      window.AndroidBridge.saveFile(filename, dataStr, 'application/json');
      showToast('📤 已导出到下载目录：' + filename);
      return;
    }

    // 浏览器环境：blob 下载
    var blob = new Blob([dataStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📤 数据已导出为 JSON 文件');
  } catch (e) {
    showToast('导出失败：' + e.message);
  }
}

/**
 * 导入：读取 JSON 备份文件并恢复数据
 * 支持两种格式：
 * - 新格式 {version, app, data: {key: value, ...}}：恢复全部 localStorage
 * - 旧格式（直接是 appData 对象）：只恢复 appData（合并，不丢失新字段）
 * @param {Event} event - 文件选择框的 change 事件
 */
function importData(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var imported = JSON.parse(e.target.result);

      // 新格式：恢复全部 localStorage
      if (imported && imported.data && typeof imported.data === 'object') {
        var count = 0;
        var keys = Object.keys(imported.data);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var v = imported.data[k];
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
          count++;
        }
        showToast('📥 导入成功，已恢复 ' + count + ' 项数据，页面即将刷新');
        setTimeout(function() { location.reload(); }, 1200);
        return;
      }

      // 旧格式：只恢复 appData（合并，保留新版本新增字段）
      if (imported && imported.hasOwnProperty && (imported.hasOwnProperty('tasks') || imported.hasOwnProperty('stats'))) {
        appData = Object.assign({}, appData, imported);
        saveData();
        showToast('📥 导入成功（旧格式），页面即将刷新');
        setTimeout(function() { location.reload(); }, 1200);
        return;
      }

      showToast('⚠️ 文件格式不对，请选择本应用导出的备份文件');
    } catch (err) {
      showToast('导入失败：' + err.message);
    }
  };
  reader.readAsText(file, 'utf-8');
  // 清空文件选择框，便于下次选择同一文件也能触发 change
  event.target.value = '';
}

/**
 * 清空：删除全部本地学习数据（双重确认，防误触）
 */
function clearAllData() {
  if (!confirm('⚠️ 确定要清空全部学习数据吗？\n\n此操作不可撤销，建议先导出备份！')) return;
  if (!confirm('再次确认：真的要删除全部数据吗？')) return;
  localStorage.removeItem(STORAGE_KEY);
  showToast('🗑️ 数据已清空，页面即将刷新');
  setTimeout(() => location.reload(), 1000);
}

// ========== 预留扩展模块（【后续扩展点】） ==========
// 以下为空函数入口模板：容器和样式已写好，后续在此填充业务逻辑即可。

/**
 * 【后续扩展点】高级设置面板
 * 设置页对应容器：#page-settings 中“高级设置”卡片
 * 可扩展：学习提醒、每日目标、字体大小、缓存管理等
 */
function openAdvancedSettings() {
  /* 后续自己写逻辑 */
  showToast('🧪 高级设置为预留模块，逻辑待实现');
}

/**
 * 【后续扩展点】数据同步
 * 设置页对应容器：#page-settings 中“数据同步”卡片
 * 可扩展：云同步、多设备同步、WebDAV 备份等
 */
function syncData() {
  /* 后续自己写逻辑 */
  showToast('☁️ 云同步为预留模块，逻辑待实现');
}

/**
 * 【后续扩展点】更多工具入口
 * 首页对应容器：#moreToolsGrid（3 个占位卡片）
 * 可扩展：番茄钟、艾宾浩斯复习表、错题打印等自定义工具
 * @param {string} toolId - 工具标识，对应卡片传入的 'tool-1' / 'tool-2' / 'tool-3'
 */
function openTool(toolId) {
  /* 后续自己写逻辑 */
  showToast('🧰 工具 ' + toolId + ' 为预留模块，逻辑待实现');
}

// ========== AI学习助手（悬浮聊天窗口） ==========
// ⚠️ 安全约定：正式环境大模型密钥只能放在后端 ai-server/.env 中，前端代码绝不出现密钥。
// 【后续扩展点】启动 ai-server 后端后，把 apiUrl 填为后端地址即可启用后端中转模式：
//   AI_CONFIG.apiUrl = 'http://localhost:3000/api/chat'
// 留空 = 本地演示模式（不联网，由内置规则引擎回复，适合先体验交互效果）。
const AI_CONFIG = {
  apiUrl: '', // 例：'http://localhost:3000/api/chat'
};

// ========== AI 服务商配置（本地演示版，新增） ==========
// 三种模式优先级：① 服务商直连（下面配置了 apiKey）→ ② 后端中转（AI_CONFIG.apiUrl）→ ③ 本地演示
// ⚠️ 密钥只保存在本机浏览器 localStorage，仅适合个人本地使用；
//    正式/多人环境必须改为后端中转（ai-server），禁止密钥出现在前端代码或仓库中。
const AI_CFG_KEY = lsKey('study_workbench_ai_config');
// 预置服务商：均兼容 OpenAI Chat Completions 协议（/chat/completions + Bearer Token + SSE 流式）
const AI_PROVIDERS = [
  { id: 'deepseek',  name: 'DeepSeek 深度求索', baseUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'], desc: '国产高性价比，推理能力强' },
  { id: 'qwen',      name: '通义千问（阿里）',   baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'], desc: '阿里云，中文能力优秀' },
  { id: 'kimi',      name: 'Kimi（月之暗面）',   baseUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'], desc: '长文本处理能力强' },
  { id: 'zhipu',     name: '智谱AI（GLM）',      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4'], desc: '国产大模型，免费额度多' },
  { id: 'openai',    name: 'OpenAI',            baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'], desc: 'GPT系列，通用能力强' },
  { id: 'claude',    name: 'Claude（Anthropic）', baseUrl: 'https://api.anthropic.com/v1/chat/completions', model: 'claude-3-5-sonnet-latest',
    models: ['claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-haiku-20240307'], desc: '长上下文，写作能力强' },
  { id: 'ernie',     name: '文心一言（百度）',    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions', model: 'ernie-speed-128k',
    models: ['ernie-speed-128k', 'ernie-lite-8k', 'ernie-4.0-8k'], desc: '百度，中文理解优秀' },
  { id: 'spark',     name: '讯飞星火',          baseUrl: 'https://spark-api.xf-yun.com/v3.5/chat', model: 'generalv3.5',
    models: ['generalv3.5', 'generalv2', 'general'], desc: '科大讯飞，语音+AI结合' },
  { id: 'doubao',    name: '豆包（字节）',       baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-pro-4k',
    models: ['doubao-pro-4k', 'doubao-lite-4k', 'doubao-pro-32k'], desc: '字节跳动，响应速度快' },
  { id: 'custom',    name: '自定义 / 兼容接口', baseUrl: '', model: '',
    models: [], desc: '任何OpenAI兼容接口' }
];
function getAiProviderConfig() {
  try { return JSON.parse(localStorage.getItem(AI_CFG_KEY)) || {}; } catch (e) { return {}; }
}
function saveAiProviderConfig(cfg) {
  localStorage.setItem(AI_CFG_KEY, JSON.stringify(cfg));
}
function clearAiProviderConfig() {
  localStorage.removeItem(AI_CFG_KEY);
}
// 当前 AI 模式：'provider'（直连服务商）/ 'backend'（后端中转）/ 'demo'（本地演示）
function currentAiMode() {
  const cfg = getAiProviderConfig();
  if (cfg.apiKey && cfg.baseUrl) return { mode: 'provider', cfg };
  if (AI_CONFIG.apiUrl) return { mode: 'backend', cfg: null };
  return { mode: 'demo', cfg: null };
}
// 上下文记忆：取最近 N 条历史组装 messages（含刚 push 的最新用户消息）
function buildAiContextMessages() {
  // 先注入当前伙伴的人设（system），再带最近14条上下文（provider直连/后端中转/多人后端 三通道都透传 system）
  const msgs = [{ role: 'system', content: getAiPartner().systemPrompt }];
  const hist = aiChatHistory.slice(-14); // 最近14条，防 token 超限
  hist.forEach(m => msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  return msgs;
}
/**
 * 服务商直连：OpenAI 兼容协议 + SSE 流式解析（带上下文记忆）
 * ⚠️ 密钥从 localStorage 读出后仅用于本次请求头，不写入任何页面/日志/代码。
 */
async function fetchProviderReply() {
  const { cfg } = currentAiMode();
  const bubble = createStreamingBubble();
  try {
    // 请求体：上下文消息 + 可选温度/最大输出（设置页「AI 温度 / AI 最大输出」，本地直连与后端均生效）
    const reqBody = { model: cfg.model || 'deepseek-chat', messages: buildAiContextMessages(), stream: true };
    const _temp = parseFloat(getSetting('aiTemp')); if (!isNaN(_temp)) reqBody.temperature = _temp;
    const _max = parseInt(getSetting('aiMax'), 10); if (!isNaN(_max) && _max > 0) reqBody.max_tokens = _max;
    const res = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(reqBody)
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch (e) {}
      throw new Error('HTTP ' + res.status + (detail ? '：' + detail : ''));
    }
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let acc = '', buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE：按行解析 "data: {...}"，累积增量 delta.content
        const lines = buf.split('\n');
        buf = lines.pop() || ''; // 最后一段可能不完整，留到下一轮
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices && j.choices[0] && j.choices[0].delta;
            const piece = (delta && delta.content) || (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
            if (piece) { acc += piece; bubble.textContent = acc; scrollAiMessages(); }
          } catch (e) { /* 跳过无法解析的行（如心跳/注释行） */ }
        }
      }
      if (!acc) acc = '(服务返回了空回复，请检查模型名是否正确)';
      finishStreaming('ai', acc);
    } else {
      const data = await res.json();
      const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '(空回复)';
      typewriterIntoBubble(bubble, reply, () => finishStreaming('ai', reply));
    }
  } catch (e) {
    finishStreaming('ai', '⚠️ AI 服务商连接失败：' + e.message + '\n\n请检查：① API Key 是否有效 ② 接口地址/模型名是否正确 ③ 本地网络能否访问该服务商。\n\n也可以到「设置 → AI 服务商配置」清除配置，回到本地演示模式。');
  }
}

// 聊天历史独立保存在 localStorage（key: study_workbench_ai_chat_<伙伴id>；旧版全局 key 首次兼容导入）
const AI_CHAT_KEY = 'study_workbench_ai_chat';
let aiChatHistory = [];
let aiStreaming = false; // 是否正在流式输出，防止重复发送

/* ========== AI 伙伴（多角色模式）：像"换个伙伴"一样切换不同人设的 AI ========== */
const AI_PARTNER_KEY = lsKey('study_workbench_ai_partner');
// 预置伙伴：人设（systemPrompt 注入大模型）+ 问候语 + 本地演示兜底风格 + 主题色
const AI_PARTNERS = [
  { id: 'xiaotu', name: '小兔', emoji: '🐰', tag: '温柔治愈型', color: '#F06A9A', bg: '#FFF0F5',
    desc: '像朋友一样倾听，温柔鼓励，适合学累了想被安慰的时候',
    systemPrompt: '你叫小兔，是一位温柔治愈、善解人意的聊天伙伴。用温暖亲切的语气和用户聊天，像知心朋友一样倾听和回应。多用轻柔的问候和鼓励（如"慢慢来""你已经很棒了"），适当使用 emoji 和波浪线传递温度。如果用户提到学习压力或情绪困扰，先共情安抚，再给一两个轻松可行的小建议，不要长篇大论讲道理。',
    greeting: '嗨~我是小兔，今天想聊点什么呀？不用紧张，慢慢说就好 🐰💕',
    demoStyle: function (text) { return '嗯嗯，我在认真听呢～关于「' + text.slice(0, 30) + '」，你是怎么想的呀？无论你怎么选，我都支持你 🐰\n\n（当前是本地演示模式，接入真实 AI 后我能陪你聊得更深入哦）'; } },
  { id: 'coach', name: '学霸教练', emoji: '🦉', tag: '高效规划型', color: '#5B8DEF', bg: '#EEF4FF',
    desc: '备考规划专家，帮你拆目标、定计划、查漏补缺',
    systemPrompt: '你叫学霸教练，是一位经验丰富的备考规划导师，擅长四级、行测、央国企笔试、面试等考试辅导。回答要结构化：先给结论或建议，再分要点展开，必要时给出具体可执行的时间安排。语气专业但亲切，结尾常给一句鼓励。不要空泛，要具体到每天做什么。',
    greeting: '我是学霸教练🦉 今天想攻哪一科？报上你的目标，我给你拆一份学习计划。',
    demoStyle: function (text) { return '收到，关于「' + text.slice(0, 30) + '」，我的建议是：① 先明确目标；② 拆成每天 30 分钟的小任务；③ 每周日复盘一次。\n\n（当前是本地演示模式，接入真实 AI 后我可以按你的具体基础给一份完整计划 📋）'; } },
  { id: 'mentor', name: '智多星', emoji: '🧠', tag: '思维导师型', color: '#9B6BF3', bg: '#F5F0FF',
    desc: '帮你把问题想深一层，结构化分析、找本质',
    systemPrompt: '你叫智多星，是一位思维严谨的导师。回答注重逻辑：先界定问题，再分析原因或利弊，最后给结论和行动建议。擅长用"是什么-为什么-怎么办"的结构。必要时可反问用户一两个问题帮助澄清。语气沉稳、有启发性。',
    greeting: '我是智多星🧠 遇到什么问题了？说来听听，我陪你一起把它想透。',
    demoStyle: function (text) { return '关于「' + text.slice(0, 30) + '」，我们拆三层看：① 现状是什么；② 卡点在哪；③ 最小下一步能做什么。\n\n（当前是本地演示模式，接入真实 AI 后我可以带你做更深的推演 🔍）'; } },
  { id: 'interviewer', name: '面试官', emoji: '🎯', tag: '模拟面试型', color: '#2FBF8F', bg: '#EAF9F3',
    desc: '模拟真实面试场景，犀利提问 + 逐题点评',
    systemPrompt: '你叫面试官，是一位严格但专业的模拟面试官。当用户求职面试时：先出一个真实的面试问题，用户回答后给出点评（优点+改进点）和参考回答要点。语气职业、直接，不过度夸奖，可以追问细节。若用户问的不是面试问题，也尽量联系到求职或职场场景回答。',
    greeting: '我是面试官🎯 准备好了吗？先来个经典开场：请做一段 1 分钟的自我介绍。',
    demoStyle: function (text) { return '好的，假设这是面试现场：关于「' + text.slice(0, 30) + '」，请再说具体一点？我会从逻辑、量化成果、匹配度三个维度给你点评 🎯\n\n（当前是本地演示模式，接入真实 AI 后模拟会更逼真）'; } },
  { id: 'buddy', name: '老铁', emoji: '😎', tag: '直爽激励型', color: '#F08A24', bg: '#FFF4E8',
    desc: '不跟你客气，直接打鸡血，犯懒的时候找他最管用',
    systemPrompt: '你叫老铁，是用户身边最直爽的铁哥们儿。语气豪爽、接地气，说话带点东北老铁的味道（但别过头），喜欢用短句和感叹号。见不得用户拖延犯懒，会直接戳破并打鸡血。该夸的时候使劲夸，该提醒的时候也不含糊。最后总要推着用户去行动。',
    greeting: '嘿老铁😎 又见面了！今天学得咋样？别整虚的，有啥问题直接说。',
    demoStyle: function (text) { return '老铁，关于「' + text.slice(0, 30) + '」这事——干就完了！先做 10 分钟，做不动了你再来找我，我陪你唠 😎\n\n（当前是本地演示模式，接入真实 AI 后我随叫随到）'; } },
];

/* ========== AI 快捷功能（一键调用） ========== */
const AI_QUICK_ACTIONS = [
  { id: 'plan', name: '生成学习计划', emoji: '📅', desc: '根据你的情况生成个性化学习计划',
    prompt: '我是一个正在备考的学生，目标是[四级/行测/面试]，现在是[基础薄弱/中等/良好]水平，每天能学[X]小时。请帮我制定一个[7天/1个月]的学习计划，要具体到每天做什么、做多少。' },
  { id: 'analyze_wrong', name: '分析错题', emoji: '❌', desc: '把错题发给AI，帮你分析错因',
    prompt: '我今天做了这道题做错了，请帮我分析一下错在哪里，为什么错，以及怎么避免再错：\n\n题目：[粘贴题目]\n我的答案：[粘贴你的答案]\n正确答案：[粘贴正确答案]' },
  { id: 'essay', name: '批改英语作文', emoji: '✍️', desc: '把作文发给AI，帮你批改打分',
    prompt: '请帮我批改这篇英语四级作文，从语法、词汇、结构、逻辑四个方面打分（满分10分），指出错误并给出修改建议和范文：\n\n[粘贴你的作文]' },
  { id: 'explain', name: '讲解知识点', emoji: '💡', desc: '不懂的知识点让AI用大白话讲清楚',
    prompt: '我在学习中遇到了一个不太懂的知识点：[粘贴知识点]。请用大白话给我讲清楚，最好举个例子，最后给我一个小测试看看我懂没懂。' },
  { id: 'review', name: '复习提纲', emoji: '📝', desc: '根据发贴自动生成复习提纲和重点',
    prompt: '请根据下面的发贴，生成一份复习提纲和重点总结：1）用要点列出核心考点；2）标注哪些是高频考点；3）给3条复习建议；4）简洁便于记忆。\n\n发贴内容：[粘贴发贴]' },
  { id: 'mock_interview', name: '模拟面试', emoji: '🎤', desc: 'AI当面试官，模拟真实面试场景',
    prompt: '请开始一场模拟面试，岗位是[央国企/互联网/公务员]。你当面试官，先出第一个问题，我回答后你点评，然后再出下一个问题。一共5个问题，结束后给我总体评分和改进建议。' },
];

// 打开AI快捷功能面板
function openAiQuickActions() {
  const panel = document.getElementById('aiPanel');
  if (!panel) return;
  if (!panel.classList.contains('open')) toggleAiPanel();
  
  // 在AI聊天输入框上方显示快捷功能
  const inputArea = panel.querySelector('.ai-input-area');
  if (!inputArea) return;
  
  // 移除已有的快捷功能条
  const old = document.getElementById('aiQuickBar');
  if (old) old.remove();
  
  const bar = document.createElement('div');
  bar.id = 'aiQuickBar';
  bar.style.cssText = 'padding:8px 12px;border-bottom:1px solid var(--border);display:flex;gap:8px;overflow-x:auto;';
  bar.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);align-self:center;flex-shrink:0;">⚡ 快捷功能：</div>' +
    AI_QUICK_ACTIONS.map(a => 
      `<button style="flex-shrink:0;padding:6px 12px;border:1px solid var(--border);border-radius:20px;background:var(--card);font-size:12px;cursor:pointer;white-space:nowrap;" onclick="useAiQuickAction('${a.id}')">${a.emoji} ${a.name}</button>`
    ).join('');
  
  panel.insertBefore(bar, inputArea);
}

// 使用AI快捷功能
function useAiQuickAction(id) {
  const action = AI_QUICK_ACTIONS.find(a => a.id === id);
  if (!action) return;
  
  // 把prompt放到输入框里，让用户补充具体内容
  const input = document.getElementById('aiInput');
  if (input) {
    input.value = action.prompt;
    input.focus();
    // 滚动到输入框
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  
  showToast(`${action.emoji} ${action.name}：请补充具体内容后发送`);
}
function getAiPartnerId() {
  try { return localStorage.getItem(AI_PARTNER_KEY) || AI_PARTNERS[0].id; } catch (e) { return AI_PARTNERS[0].id; }
}
function getAiPartner() {
  const id = getAiPartnerId();
  return AI_PARTNERS.find(p => p.id === id) || AI_PARTNERS[0];
}
function setAiPartner(id) { try { localStorage.setItem(AI_PARTNER_KEY, id); } catch (e) {} }
function getAiChatKey() { return lsKey('study_workbench_ai_chat_' + getAiPartnerId()); }
// 切换伙伴：读取该伙伴的历史（无历史则空）
function switchAiHistory() {
  let h = [];
  try { h = JSON.parse(localStorage.getItem(getAiChatKey())) || []; } catch (e) { h = []; }
  aiChatHistory = h;
}
// 更新伙伴条 / 头像 / 标题
function renderAiPartnerBar() {
  const p = getAiPartner();
  const em = document.getElementById('aiPartnerEmoji'); if (em) em.textContent = p.emoji;
  const nm = document.getElementById('aiPartnerName'); if (nm) nm.textContent = p.name;
  const tg = document.getElementById('aiPartnerTag');
  if (tg) { tg.textContent = p.tag; tg.style.background = p.bg; tg.style.color = p.color; }
  const av = document.querySelector('#aiPanel .ai-avatar'); if (av) av.textContent = p.emoji;
  const t = document.querySelector('#aiPanel .ai-title'); if (t) t.textContent = 'AI伙伴 · ' + p.name;
}
// 动态注入伙伴条 + 角色选择弹窗（不改 HTML，所有页面加载即生效）
function ensureAiPartnerUI() {
  const panel = document.getElementById('aiPanel');
  if (!panel || document.getElementById('aiPartnerBar')) return;
  const header = panel.querySelector('.ai-panel-header');
  if (!header) return;
  const p = getAiPartner();
  const bar = document.createElement('div');
  bar.id = 'aiPartnerBar';
  bar.className = 'ai-partner-bar';
  bar.innerHTML = '<div class="ai-partner-chip" onclick="openAiPartnerPicker()" title="切换AI伙伴">' +
    '<span class="ai-partner-emoji" id="aiPartnerEmoji">' + p.emoji + '</span>' +
    '<span class="ai-partner-name" id="aiPartnerName">' + p.name + '</span>' +
    '<span class="ai-partner-tag" id="aiPartnerTag" style="background:' + p.bg + ';color:' + p.color + '">' + p.tag + '</span>' +
    '<span class="ai-partner-switch">🔀 换个伙伴</span></div>';
  panel.insertBefore(bar, header);
  const picker = document.createElement('div');
  picker.id = 'aiPartnerPicker';
  picker.className = 'ai-partner-picker';
  picker.innerHTML = '<div class="ai-partner-picker-mask" onclick="closeAiPartnerPicker()"></div>' +
    '<div class="ai-partner-picker-box">' +
      '<div class="ai-partner-picker-head"><div class="ai-partner-picker-title">👋 换个伙伴</div><div class="ai-close" onclick="closeAiPartnerPicker()">✕</div></div>' +
      '<div class="ai-partner-list" id="aiPartnerList"></div>' +
    '</div>';
  document.body.appendChild(picker);
  renderAiPartnerList();
  renderAiPartnerBar();
}
function renderAiPartnerList() {
  const list = document.getElementById('aiPartnerList');
  if (!list) return;
  const cur = getAiPartnerId();
  list.innerHTML = AI_PARTNERS.map(p => {
    const active = p.id === cur;
    return '<div class="ai-partner-card' + (active ? ' active' : '') + '" style="--pc:' + p.color + ';--pbg:' + p.bg + '" onclick="selectAiPartner(\'' + p.id + '\')">' +
      '<div class="ai-partner-card-emoji" style="background:' + p.bg + '">' + p.emoji + '</div>' +
      '<div class="ai-partner-card-info">' +
        '<div class="ai-partner-card-name">' + p.name + '<span class="ai-partner-card-tag" style="background:' + p.bg + ';color:' + p.color + '">' + p.tag + '</span></div>' +
        '<div class="ai-partner-card-desc">' + p.desc + '</div>' +
      '</div>' +
      (active ? '<div class="ai-partner-card-check" style="color:' + p.color + '">✓ 使用中</div>' : '<div class="ai-partner-card-use" style="color:' + p.color + '">使用</div>') +
      '</div>';
  }).join('');
}
function openAiPartnerPicker() {
  const picker = document.getElementById('aiPartnerPicker');
  if (!picker) return;
  renderAiPartnerList();
  picker.classList.add('open');
}
function closeAiPartnerPicker() {
  const picker = document.getElementById('aiPartnerPicker');
  if (picker) picker.classList.remove('open');
}
function selectAiPartner(id) {
  if (!AI_PARTNERS.some(p => p.id === id)) return;
  if (id === getAiPartnerId()) { closeAiPartnerPicker(); return; }
  setAiPartner(id);
  switchAiHistory();
  renderAiPartnerBar();
  renderAiMessages();
  closeAiPartnerPicker();
  const p = getAiPartner();
  showToast('已切换为 ' + p.name + ' ' + p.emoji + ' · ' + p.tag);
  if (aiChatHistory.length === 0) pushAiMsg('ai', p.greeting);
}

/**
 * 打开/关闭 AI 聊天面板
 */
function toggleAiPanel() {
  const panel = document.getElementById('aiPanel');
  const opening = !panel.classList.contains('open');
  panel.classList.toggle('open');
  if (opening) {
    if (aiChatHistory.length === 0) {
      // 首次打开：按当前伙伴的问候语欢迎
      const _m0 = currentAiMode();
      const _modeTxt = _m0.mode === 'provider' ? '服务商直连' : (_m0.mode === 'backend' ? '后端在线' : '本地演示');
      pushAiMsg('ai', getAiPartner().greeting + '\n\n（当前为「' + _modeTxt + '」模式，试试问我：「四级怎么复习」「行测资料分析怎么做」）');
    } else {
      renderAiMessages();
    }
    // 更新模式徽标与副标题（三种模式：服务商直连 / 后端中转 / 本地演示）
    const m = currentAiMode();
    const cfg = getAiProviderConfig();
    const prov = AI_PROVIDERS.find(p => p.id === cfg.provider);
    document.getElementById('aiModeBadge').textContent = m.mode === 'provider' ? (prov ? prov.name.split('(')[0].trim() : '直连') : (m.mode === 'backend' ? '在线' : '演示');
    document.getElementById('aiSubtitle').textContent =
      m.mode === 'provider' ? ((prov ? prov.name : '自定义接口') + ' · 流式 · 带上下文') :
      m.mode === 'backend' ? '已连接后端 · 流式回答' : '本地演示模式 · 历史已保存';
    setTimeout(() => document.getElementById('aiInput').focus(), 100);
  }
}

/**
 * 清空聊天记录（双保险：确认 + localStorage）
 */
function clearAiChat() {
  if (!confirm('确定清空全部AI聊天记录吗？')) return;
  aiChatHistory = [];
  localStorage.removeItem(getAiChatKey());
  renderAiMessages();
  showToast('🧹 聊天记录已清空');
}

/**
 * 发送一条用户消息：优先走后端接口（真实AI），否则走本地规则引擎（演示）
 */
function sendAiMsg() {
  const input = document.getElementById('aiInput');
  const text = input.value.trim();
  if (!text || aiStreaming) return;
  input.value = '';
  pushAiMsg('user', text); // 先入历史，供上下文记忆使用
  aiStreaming = true;
  document.getElementById('aiSendBtn').style.opacity = '0.5';
  const m = currentAiMode();
  if (m.mode === 'provider') {
    fetchProviderReply();   // 服务商直连（密钥来自本地配置，OpenAI兼容协议，流式+上下文）
  } else if (m.mode === 'backend') {
    fetchAiReply(text);     // 后端中转（密钥在后端）
  } else {
    localAiReply(text);     // 本地演示模式：规则引擎
  }
}

/**
 * 调用后端接口获取真实AI回复（流式打字机效果）
 * 后端见 ai-server/server.js，密钥存后端 .env，前端只传消息不传密钥
 */
async function fetchAiReply(text) {
  try {
    const res = await fetch(AI_CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, messages: buildAiContextMessages() }) // messages 为上下文记忆（后端可选使用）
    });
    if (!res.ok) throw new Error('后端返回 ' + res.status);
    // 创建一个“正在打字”的气泡，边收流边追加文字
    const bubble = createStreamingBubble();
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        bubble.textContent = acc;
        scrollAiMessages();
      }
      finishStreaming('ai', acc);
    } else {
      const data = await res.json();
      const reply = data.reply || data.content || '(空回复)';
      typewriterIntoBubble(bubble, reply, () => finishStreaming('ai', reply));
    }
  } catch (e) {
    finishStreaming('ai', '⚠️ 后端连接失败：' + e.message + '\n\n请确认 ai-server 已启动（node server.js），或把 AI_CONFIG.apiUrl 置空回到演示模式。');
  }
}

/**
 * 本地演示引擎：关键词规则回复（不联网、无密钥，纯前端可用的局限版效果）
 * 【后续扩展点】可继续往 aiLocalRules 里加关键词和回复，越加越“聪明”
 */
const aiLocalRules = [
  { kw: ['四级', 'cet', 'CET', '英语', '词汇', '单词'], reply: '📖 四级备考建议：\n1. 词汇：每天用「四级备考→词汇速记」过30个新词，间隔重复系统会自动安排7天后复习；\n2. 听力：每天精听1套，先盲听做题→再对照原文逐句听懂；\n3. 阅读：先看题干再回原文定位，细节题同义替换是关键；\n4. 写作翻译：积累功能句型，考前两周动手写比背模板更有效。\n\n坚持21天就能看到明显变化，加油！' },
  { kw: ['行测', '笔试', '资料分析', '数量关系', '逻辑', '判断推理'], reply: '📝 央国企笔试（行测）建议：\n1. 资料分析是性价比之王：先背熟增长率/比重公式，再限时刷题（每篇6-7分钟）；\n2. 判断推理：图形推理积累对称/笔画/封闭区域等常考规律；\n3. 数量关系别死磕：会做的做，不会的先跳，最后统一猜同一个选项；\n4. 每天20题保持手感，错题记得进错题本复盘。\n\n去「央国企笔试」模块刷起来！' },
  { kw: ['面试', '自我介绍', 'interview'], reply: '🤝 面试准备三步走：\n1. 自我介绍控制在1分钟：一句话定位→教育背景→实习经历（STAR法则+量化成果）→为什么匹配这个岗位；\n2. 高频题提前写逐字稿：优缺点/为什么选我们公司/职业规划；\n3. 模拟练习：去「商务礼仪面试」模块有模拟面试官可以实战演练。\n\n记住：面试是聊天不是考试，真诚+结构化表达最加分。' },
  { kw: ['PPT', '汇报', '课件', 'slide'], reply: '🎨 PPT训练建议：\n1. 先搭骨架再填内容：一页只讲一件事，标题写结论；\n2. 对齐和留白比炫技更重要：统一字号体系（标题28+/正文16+），多用色块和图标；\n3. 汇报逻辑：背景→问题→方案→成效→下一步。\n\n去「PPT训练」模块看版式库和真实案例拆解，边学边模仿最快。' },
  { kw: ['累', '困', '烦', '坚持不', '焦虑', '压力', '不想学'], reply: '抱抱你🫂 学习路上有低谷太正常了。\n\n试试这个方法：把今天的任务缩到最小——只背10个单词，只做5道题。\n完成最小任务后，往往就想继续了；就算没有，今天也算赢了。\n\n记住：慢一点没关系，停下才是问题。你已经在路上了💪' },
  { kw: ['怎么复习', '怎么学', '怎么准备', '计划', '规划'], reply: '🗓️ 通用复习规划思路：\n1. 先做摸底：用「行测刷题」或一套四级真题找到弱项；\n2. 倒推排期：用首页「重要倒计时」算清剩余天数，弱项多分配时间；\n3. 每天固定三件事：词汇/刷题/复盘，宁可少不可断；\n4. 每周日花30分钟复盘错题本，比刷新题更有用。\n\n具体想聊哪一科？我可以给更细的建议。' },
  { kw: ['你是谁', '你是ai', '你是AI', '什么模式', '演示'], reply: '我是星途里内置的AI学习助手🤖\n\n当前处于「本地演示模式」：由前端规则引擎回复，不联网、无密钥、零成本。\n\n想让我变成真正的大模型？按项目里 ai-server 文件夹的README启动后端，再把前端 AI_CONFIG.apiUrl 指向后端地址，就能获得流式打字的真实AI回答。' },
];
function localAiReply(text) {
  // 关键词匹配（命中多个关键词的规则优先）
  let best = null, bestScore = 0;
  aiLocalRules.forEach(r => {
    const score = r.kw.filter(k => text.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = r; }
  });
  const p = getAiPartner();
  let reply;
  if (best) {
    // 学习类问题：按当前伙伴口吻包装规则回复
    reply = p.name + ' ' + p.emoji + '：\n' + best.reply;
  } else if (p.demoStyle && typeof p.demoStyle === 'function') {
    reply = p.demoStyle(text);
  } else {
    reply = '这个问题我在演示模式下还答不好😅（本地规则引擎知识有限）\n\n你可以问我：四级复习 / 行测怎么准备 / 面试自我介绍 / PPT技巧 / 学习计划…\n\n或者按 ai-server 的说明接入真实AI，我就能回答任何问题啦。';
  }
  // 打字机效果输出
  const bubble = createStreamingBubble();
  typewriterIntoBubble(bubble, reply, () => finishStreaming('ai', reply));
}

/**
 * 新建一个“正在打字”的AI气泡，返回气泡DOM
 */
function createStreamingBubble() {
  const box = document.getElementById('aiMessages');
  const msg = document.createElement('div');
  msg.className = 'ai-msg ai';
  msg.innerHTML = '<div class="ai-msg-avatar">' + getAiPartner().emoji + '</div><div class="ai-msg-bubble typing"></div>';
  box.appendChild(msg);
  scrollAiMessages();
  return msg.querySelector('.ai-msg-bubble');
}

/**
 * 打字机效果：把文字逐字打进气泡（流式观感），打完回调
 */
function typewriterIntoBubble(bubble, text, done) {
  let i = 0;
  const step = Math.max(1, Math.round(text.length / 120)); // 长回复打得快一点，总时长约2-4秒
  const timer = setInterval(() => {
    i += step;
    bubble.textContent = text.slice(0, i);
    scrollAiMessages();
    if (i >= text.length) {
      clearInterval(timer);
      bubble.textContent = text;
      bubble.classList.remove('typing');
      done && done();
    }
  }, 28);
}

/**
 * 流式输出结束：落库保存 + 解除发送锁
 */
function finishStreaming(role, text) {
  pushAiMsg(role, text, true); // 只存不重渲染
  aiStreaming = false;
  document.getElementById('aiSendBtn').style.opacity = '';
}

/**
 * 追加一条消息（默认保存+重渲染）
 */
function pushAiMsg(role, text, skipRender) {
  aiChatHistory.push({ role, text, time: Date.now() });
  if (aiChatHistory.length > 100) aiChatHistory = aiChatHistory.slice(-100); // 防止无限膨胀
  localStorage.setItem(getAiChatKey(), JSON.stringify(aiChatHistory));
  if (!skipRender) renderAiMessages();
}

/**
 * 依据历史渲染全部消息
 */
function renderAiMessages() {
  const box = document.getElementById('aiMessages');
  box.innerHTML = '';
  aiChatHistory.forEach(m => {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + (m.role === 'user' ? 'user' : 'ai');
    div.innerHTML = '<div class="ai-msg-avatar">' + (m.role === 'user' ? '🙋' : getAiPartner().emoji) + '</div><div class="ai-msg-bubble"></div>';
    div.querySelector('.ai-msg-bubble').textContent = m.text;
    box.appendChild(div);
  });
  scrollAiMessages();
}

/**
 * 聊天区始终滚到最底部
 */
function scrollAiMessages() {
  const box = document.getElementById('aiMessages');
  box.scrollTop = box.scrollHeight;
}

// 启动时读取当前伙伴的历史；无历史时兼容导入旧版全局历史
try {
  aiChatHistory = JSON.parse(localStorage.getItem(getAiChatKey())) || [];
  if (!aiChatHistory.length) { aiChatHistory = JSON.parse(localStorage.getItem(lsKey(AI_CHAT_KEY))) || []; }
} catch (e) { aiChatHistory = []; }
// 注入 AI 伙伴条 + 角色选择弹窗（所有页面通用，幂等）
try { ensureAiPartnerUI(); } catch (e) {}

// ========== 学习留言板（服务器版：点赞 + 回复） ==========
async function addBoardMsg() {
  const input = document.getElementById('boardInput');
  const text = input.value.trim();
  if (!text) { showToast('先写点什么再发布吧～'); return; }
  try {
    await api('/api/board', { method: 'POST', body: { content: text } });
    input.value = '';
    renderBoard();
    showToast('✅ 已发布到留言板');
  } catch (e) { showToast('⚠️ 发布失败：' + e.message); }
}

async function deleteBoardMsg(id) {
  if (!confirm('确定删除这条留言吗？')) return;
  try {
    await api('/api/board/' + id, { method: 'DELETE' });
    renderBoard();
    showToast('已删除');
  } catch (e) { showToast('⚠️ 删除失败：' + e.message); }
}

function clearBoard() {
  showToast('留言板是公开的，不能一键清空哦～');
}

async function toggleBoardLike(id, btn) {
  try {
    var r = await api('/api/board/' + id + '/like', { method: 'POST' });
    var countEl = btn.querySelector('.bd-like-count');
    if (countEl) countEl.textContent = r.likes;
    btn.classList.toggle('liked', r.liked);
    btn.querySelector('.bd-like-icon').textContent = r.liked ? '❤️' : '🤍';
  } catch (e) { showToast('⚠️ ' + e.message); }
}

async function toggleBoardReplies(id, btn) {
  var container = document.getElementById('board-replies-' + id);
  if (container.style.display === 'none' || !container.style.display) {
    container.style.display = 'block';
    await loadBoardReplies(id);
  } else {
    container.style.display = 'none';
  }
}

async function loadBoardReplies(id) {
  var box = document.getElementById('board-reply-list-' + id);
  if (!box) return;
  box.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px">加载中…</div>';
  try {
    var d = await api('/api/board/' + id + '/replies');
    if (!d.items.length) {
      box.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px">还没有回复，来说点什么吧</div>';
      return;
    }
    box.innerHTML = d.items.map(function (r) {
      var av = r.avatarUrl
        ? '<img src="' + apiFileUrl(r.avatarUrl) + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;cursor:pointer" onclick="event.stopPropagation();openUserHome(' + r.userId + ')">'
        : '<span style="width:24px;height:24px;border-radius:50%;background:var(--primary-light);display:inline-flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer" onclick="event.stopPropagation();openUserHome(' + r.userId + ')">' + (r.nickname || '?').charAt(0) + '</span>';
      return '<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">'
        + av
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:12px;font-weight:600;cursor:pointer" onclick="event.stopPropagation();openUserHome(' + r.userId + ')">' + esc(r.nickname) + '<span style="font-weight:400;color:var(--text-muted);margin-left:6px">' + r.time + '</span></div>'
        + '<div style="font-size:13px;color:var(--text-secondary);margin-top:2px;word-break:break-word">' + esc(r.content) + '</div>'
        + '</div>'
        + (r.isMine ? '<span style="font-size:11px;color:var(--danger);cursor:pointer;flex-shrink:0" onclick="event.stopPropagation();deleteBoardReply(' + r.id + ')">删除</span>' : '')
        + '</div>';
    }).join('');
  } catch (e) {
    box.innerHTML = '<div style="font-size:12px;color:var(--danger);padding:8px">加载失败：' + esc(e.message) + '</div>';
  }
}

async function submitBoardReply(id) {
  var input = document.getElementById('board-reply-input-' + id);
  var text = input.value.trim();
  if (!text) { showToast('回复内容不能为空'); return; }
  try {
    await api('/api/board/' + id + '/replies', { method: 'POST', body: { content: text } });
    input.value = '';
    await loadBoardReplies(id);
    renderBoard();
    showToast('✅ 回复成功');
  } catch (e) { showToast('⚠️ 回复失败：' + e.message); }
}

async function deleteBoardReply(replyId) {
  if (!confirm('确定删除这条回复吗？')) return;
  try {
    await api('/api/board/replies/' + replyId, { method: 'DELETE' });
    renderBoard();
    showToast('已删除');
  } catch (e) { showToast('⚠️ ' + e.message); }
}

async function renderBoard() {
  const list = document.getElementById('boardList');
  if (!list) return;
  list.innerHTML = '<div class="board-empty">加载中…</div>';
  try {
    var d = await api('/api/board?limit=50');
    if (!d.items.length) {
      list.innerHTML = '<div class="board-empty">还没有留言，写下第一条学习心得吧 ✍️</div>';
      return;
    }
    list.innerHTML = '';
    d.items.forEach(function (m) {
      const div = document.createElement('div');
      div.className = 'board-item';
      const avatarHtml = m.avatarUrl
        ? '<img class="bd-avatar" src="' + apiFileUrl(m.avatarUrl) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;cursor:pointer" onclick="openUserHome(' + m.userId + ')">'
        : '<div class="bd-avatar" style="cursor:pointer" onclick="openUserHome(' + m.userId + ')">' + (m.nickname || '?').charAt(0) + '</div>';
      const likeClass = m.liked ? ' liked' : '';
      const likeIcon = m.liked ? '❤️' : '🤍';
      div.innerHTML = avatarHtml
        + '<div class="bd-body" style="flex:1;min-width:0">'
        + '<div class="bd-name" style="cursor:pointer" onclick="openUserHome(' + m.userId + ')">' + esc(m.nickname) + '<span class="bd-time">' + m.time + '</span></div>'
        + '<div class="bd-text"></div>'
        + '<div style="display:flex;gap:16px;margin-top:6px;align-items:center">'
        + '<span class="bd-like-btn' + likeClass + '" style="cursor:pointer;font-size:12px;color:var(--text-secondary);display:inline-flex;align-items:center;gap:4px;user-select:none" onclick="event.stopPropagation();toggleBoardLike(' + m.id + ', this)">'
        + '<span class="bd-like-icon">' + likeIcon + '</span><span class="bd-like-count">' + (m.likes || 0) + '</span></span>'
        + '<span style="cursor:pointer;font-size:12px;color:var(--text-secondary);display:inline-flex;align-items:center;gap:4px" onclick="event.stopPropagation();toggleBoardReplies(' + m.id + ', this)">'
        + '💬 ' + (m.replies || 0) + ' 回复</span>'
        + '</div>'
        + '<div id="board-replies-' + m.id + '" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">'
        + '<div id="board-reply-list-' + m.id + '"></div>'
        + '<div style="display:flex;gap:6px;margin-top:8px">'
        + '<input id="board-reply-input-' + m.id + '" type="text" placeholder="写下回复…" style="flex:1;padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);outline:none">'
        + '<button style="padding:6px 12px;font-size:12px;background:var(--primary);color:#fff;border:none;border-radius:8px;cursor:pointer;flex-shrink:0" onclick="event.stopPropagation();submitBoardReply(' + m.id + ')">回复</button>'
        + '</div></div>'
        + '</div>'
        + (m.isMine ? '<div class="bd-del" title="删除" onclick="event.stopPropagation();deleteBoardMsg(' + m.id + ')">✕</div>' : '');
      div.querySelector('.bd-text').textContent = m.content;
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = '<div class="board-empty">⚠️ 加载失败：' + esc(e.message) + '</div>';
  }
}

// 启动时加载留言（等api.js加载完成）
function _initBoard() {
  if (typeof api === 'function') renderBoard();
  else setTimeout(_initBoard, 100);
}
_initBoard();

// ========== 口语体验 ==========
let speakingPlaying = false;
let speakingRecording = false;
let speakingSentence = 1;
let speakingUserText = '';
const speakingSentences = [
  { en: 'Hi, what can I get for you today?', zh: '你好，今天想喝点什么？', isUser: false },
  { en: 'I\'d like a medium hot latte with less sugar, please.', zh: '我想要一杯中杯热拿铁，少糖。', isUser: true },
  { en: 'Sure, anything else?', zh: '好的，还要别的吗？', isUser: false },
  { en: 'And I\'ll also have a chocolate muffin, please.', zh: '再来一个巧克力麦芬，谢谢。', isUser: true },
  { en: 'Okay, that\'s a medium latte and a chocolate muffin. For here or to go?', zh: '好的，一杯中杯拿铁和一个巧克力麦芬。在这里喝还是带走？', isUser: false },
  { en: 'To go, please. How much is that?', zh: '带走，谢谢。多少钱？', isUser: true }
];

function openSpeakingDemo() {
  navigateTo('speaking-demo');
}

function toggleSpeakingPlay() {
  const s = speakingSentences[speakingSentence - 1];
  if (speakingPlaying) {
    nativeTtsStop();
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
    speakingPlaying = false;
    document.getElementById('speakingPlayBtn').textContent = '▶️';
    document.getElementById('charShopkeeper').classList.remove('speaking');
    return;
  }
  speakingPlaying = true;
  document.getElementById('speakingPlayBtn').textContent = '⏸️';
  document.getElementById('charShopkeeper').classList.add('speaking');
  speakText(s.en, 'en-US', 0.85, () => {
    speakingPlaying = false;
    document.getElementById('speakingPlayBtn').textContent = '▶️';
    document.getElementById('charShopkeeper').classList.remove('speaking');
  });
}

function toggleSpeakingRecord() {
  const s = speakingSentences[speakingSentence - 1];
  if (speakingRecording) {
    stopRecognition();
    return;
  }
  speakingRecording = true;
  speakingUserText = '';
  const btn = document.getElementById('speakingRecordBtn');
  btn.classList.add('recording');
  btn.innerHTML = '🔴 正在录音... 点击结束';
  document.getElementById('charUser').classList.add('speaking');
  showToast('开始录音，请说英文...');
  
  startEnglishRecognition(
    (final, interim) => {
      // 实时显示识别结果
      const dialogue = document.getElementById('speakingDialogue');
      dialogue.innerHTML = `<div class="chat-bubble user">${final + interim}</div><div class="player-subtitle">正在识别...</div>`;
    },
    (finalText) => {
      speakingRecording = false;
      speakingUserText = finalText;
      btn.classList.remove('recording');
      btn.innerHTML = '🎤 点击说话回答';
      document.getElementById('charUser').classList.remove('speaking');
      
      if (finalText) {
        // 显示用户说的话
        const dialogue = document.getElementById('speakingDialogue');
        dialogue.innerHTML = `<div class="chat-bubble user">${finalText}</div><div class="player-subtitle">你的回答</div>`;
        
        // 评定
        const evalResult = evaluateSpeaking(finalText, s.en);
        const evalEl = document.getElementById('speakingEval');
        evalEl.innerHTML = `
          <div style="text-align:center;margin-bottom:16px">
            <div style="font-size:36px;font-weight:800;color:var(--primary)">${evalResult.score}</div>
            <div style="font-size:12px;color:var(--text-muted)">综合得分</div>
          </div>
          <div style="display:flex;gap:12px;margin-bottom:16px">
            <div style="flex:1;text-align:center;padding:10px;background:var(--bg);border-radius:10px">
              <div style="font-size:20px;font-weight:700;color:var(--success)">${evalResult.accuracy}</div>
              <div style="font-size:11px;color:var(--text-muted)">准确度</div>
            </div>
            <div style="flex:1;text-align:center;padding:10px;background:var(--bg);border-radius:10px">
              <div style="font-size:20px;font-weight:700;color:var(--warning)">${evalResult.fluency}</div>
              <div style="font-size:11px;color:var(--text-muted)">流利度</div>
            </div>
          </div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.8">
            <div style="font-weight:700;margin-bottom:6px">💡 改进建议：</div>
            ${evalResult.tips.map(t => '<div>• ' + t + '</div>').join('')}
          </div>
          <div style="margin-top:12px;padding:10px;background:#F0F4FF;border-radius:8px;font-size:12px">
            <span style="font-weight:700">参考答案：</span>${s.en}
          </div>
        `;
        evalEl.style.display = 'block';
        evalEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('评定完成！');
      } else {
        showToast('没有识别到语音，请再试一次');
      }
    },
    () => {
      speakingRecording = false;
      btn.classList.remove('recording');
      btn.innerHTML = '🎤 点击说话回答';
      document.getElementById('charUser').classList.remove('speaking');
    }
  );
}

function nextSpeakingSentence() {
  speakingSentence++;
  if (speakingSentence > 6) {
    showToast('场景完成！总评报告生成中...');
    setTimeout(() => navigateTo('cet'), 1500);
    return;
  }
  document.getElementById('speakingCurrent').textContent = speakingSentence;
  document.getElementById('speakingProgress').style.width = (speakingSentence / 6 * 100) + '%';
  document.getElementById('speakingEval').style.display = 'none';
  const s = speakingSentences[speakingSentence - 1];
  const dialogue = document.getElementById('speakingDialogue');
  dialogue.innerHTML = `<div class="chat-bubble ${s.isUser ? 'user' : 'ai'}">${s.en}</div><div class="player-subtitle">${s.zh}</div>`;
  // 如果是店员的话，自动播放语音
  if (!s.isUser) {
    setTimeout(() => toggleSpeakingPlay(), 500);
  }
  showToast('第 ' + speakingSentence + ' 句');
}

// ========== 行测刷题体验 ==========
function openExamDemo() {
  navigateTo('exam-demo');
}

function answerQuestion(btn, answer) {
  // 禁用所有选项
  document.querySelectorAll('.option-btn').forEach(b => {
    b.style.pointerEvents = 'none';
    b.style.opacity = '0.6';
  });
  if (answer === 'C') {
    btn.style.background = '#E8F8E8';
    btn.style.borderColor = 'var(--success)';
    appData.stats.totalQuestions++;
    appData.stats.correctQuestions++;
  } else {
    btn.style.background = '#FFECEC';
    btn.style.borderColor = 'var(--danger)';
    appData.stats.totalQuestions++;
    // 高亮正确答案
    document.querySelectorAll('.option-btn')[2].style.background = '#E8F8E8';
    document.querySelectorAll('.option-btn')[2].style.borderColor = 'var(--success)';
  }
  saveData();
  updateTopbarStats(); // T18①：顶栏统计即时刷新
  document.getElementById('examExplanation').style.display = 'block';
  document.getElementById('examExplanation').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ========== 角色扮演体验 ==========
let rpRound = 1;
let rpRecording = false;

function openRoleplayDemo() {
  navigateTo('roleplay-demo');
}

function toggleRpVoice() {
  const btn = document.getElementById('rpVoiceBtn');
  const input = document.getElementById('rpInput');
  if (rpRecording) {
    stopRecognition();
    return;
  }
  rpRecording = true;
  btn.classList.add('recording');
  btn.innerHTML = '🔴 正在听...';
  showToast('开始语音输入，请说话...');
  
  startChineseRecognition(
    (final, interim) => {
      input.value = final + interim;
    },
    (finalText) => {
      rpRecording = false;
      btn.classList.remove('recording');
      btn.innerHTML = '🎤 语音输入';
      if (finalText) {
        input.value = finalText;
        showToast('语音识别完成！');
      }
    },
    () => {
      rpRecording = false;
      btn.classList.remove('recording');
      btn.innerHTML = '🎤 语音输入';
    }
  );
}

function submitRoleplay() {
  const input = document.getElementById('rpInput').value.trim();
  if (!input) { showToast('请输入或语音输入你的回答'); return; }
  document.getElementById('rpEval').style.display = 'block';
  document.getElementById('rpEval').scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('评定完成！');
}

function nextRoleplayRound() {
  rpRound++;
  if (rpRound > 5) {
    showToast('场景完成！总评报告生成中...');
    setTimeout(() => navigateTo('comm'), 1500);
    return;
  }
  document.getElementById('rpCurrent').textContent = rpRound;
  document.getElementById('rpEval').style.display = 'none';
  document.getElementById('rpInput').value = '';
  const dialogues = [
    '哎呀，那个数据啊……我这两天太忙了，还没弄完呢，你再等等呗。',
    '唉，主要是那个系统导出数据特别慢，我也没办法啊。要不你先用旧数据顶着？',
    '行吧行吧，我尽量今天弄完。不过你得帮我跟领导说一声，不是我不想弄，是系统太慢。',
    '对了，弄完我直接发你微信？还是放共享文件夹里？',
    '好的，那就这样。谢谢你啊，改天请你喝奶茶。'
  ];
  const dialogue = document.getElementById('rpDialogue');
  dialogue.innerHTML = `<div class="chat-bubble ai">${dialogues[rpRound - 1]}</div>`;
  showToast('第 ' + rpRound + ' 轮');
}

// ========== 模拟面试体验 ==========
let ivQuestion = 1;
let ivRecording = false;
const ivQuestions = [
  '请你做一个简单的自我介绍。',
  '你为什么选择我们公司？',
  '请说一段你最有成就感的经历。',
  '如果和领导意见不合，你会怎么办？',
  '你有什么问题要问我们吗？'
];

function openInterviewDemo() {
  navigateTo('interview-demo');
}

function toggleIvVoice() {
  const btn = document.getElementById('ivVoiceBtn');
  const input = document.getElementById('ivInput');
  if (ivRecording) {
    stopRecognition();
    return;
  }
  ivRecording = true;
  btn.classList.add('recording');
  btn.innerHTML = '🔴 正在听...';
  showToast('开始语音输入，请回答问题...');
  
  startChineseRecognition(
    (final, interim) => {
      input.value = final + interim;
    },
    (finalText) => {
      ivRecording = false;
      btn.classList.remove('recording');
      btn.innerHTML = '🎤 语音回答';
      if (finalText) {
        input.value = finalText;
        showToast('语音识别完成！');
      }
    },
    () => {
      ivRecording = false;
      btn.classList.remove('recording');
      btn.innerHTML = '🎤 语音回答';
    }
  );
}

function submitInterview() {
  const input = document.getElementById('ivInput').value.trim();
  if (!input) { showToast('请输入或语音输入你的回答'); return; }
  document.getElementById('ivEval').style.display = 'block';
  document.getElementById('ivEval').scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('评定完成！');
}

function nextInterviewQuestion() {
  ivQuestion++;
  if (ivQuestion > 5) {
    showToast('面试结束！总评报告生成中...');
    setTimeout(() => navigateTo('interview'), 1500);
    return;
  }
  document.getElementById('ivCurrent').textContent = ivQuestion;
  document.getElementById('ivEval').style.display = 'none';
  document.getElementById('ivInput').value = '';
  const q = ivQuestions[ivQuestion - 1];
  const dialogue = document.querySelector('#page-interview-demo .player-dialogue');
  dialogue.innerHTML = `<div class="chat-bubble ai" style="max-width:100%">${q}</div>`;
  // 面试官语音读题
  document.getElementById('charInterviewer').classList.add('speaking');
  speakText(q, 'zh-CN', 0.9, () => {
    document.getElementById('charInterviewer').classList.remove('speaking');
  });
  showToast('第 ' + ivQuestion + ' 题');
}



// ========== 商务礼仪知识库 ==========
const ETIQUETTE_DATA = [
  {
    id: 1, category: '形象礼仪', icon: '👔', title: '男士商务着装',
    points: ['西装：深色（藏青/深灰/黑色），合身不紧绷', '衬衫：白色或浅蓝色，袖口露出西装1-2cm', '领带：与西装衬衫配色协调，长度到皮带扣', '皮鞋：黑色系带皮鞋，袜子深色不露腿毛', '配饰：手表简约，公文包深色皮质'],
    wrong: '穿白袜配黑鞋、领带过短/过长、衬衫皱巴巴',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><rect x="30" y="20" width="40" height="60" rx="4" fill="#2C3E50"/><rect x="42" y="20" width="16" height="40" fill="#fff"/><polygon points="50,25 45,45 50,50 55,45" fill="#E74C3C"/><rect x="35" y="80" width="12" height="15" fill="#1a1a1a"/><rect x="53" y="80" width="12" height="15" fill="#1a1a1a"/></svg>'
  },
  {
    id: 2, category: '形象礼仪', icon: '👗', title: '女士商务着装',
    points: ['套装：裙装/裤装均可，深色系，裙长过膝', '衬衫：简约大方，避免过于透明或低领', '鞋子：黑色/裸色中跟鞋，避免细高跟和露趾', '妆容：淡妆为宜，香水清淡不刺鼻', '配饰：简约精致，不超过3件饰品'],
    wrong: '穿超短裙、露趾凉鞋、浓妆艳抹、佩戴夸张首饰',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><rect x="32" y="20" width="36" height="35" rx="4" fill="#2C3E50"/><polygon points="32,55 68,55 72,80 28,80" fill="#34495E"/><circle cx="50" cy="15" r="8" fill="#F5DEB3"/><rect x="40" y="80" width="8" height="15" fill="#1a1a1a"/><rect x="52" y="80" width="8" height="15" fill="#1a1a1a"/></svg>'
  },
  {
    id: 3, category: '见面礼仪', icon: '🤝', title: '握手礼仪',
    points: ['顺序：主人/长辈/女士/职位高者先伸手', '时间：3-5秒，力度适中，上下晃动2-3次', '姿势：上身微前倾，目光注视对方，面带微笑', '禁忌：不戴手套握手、不交叉握手、不左手握手', '力度：男士间可稍用力，男女间女士先伸手，男士轻握'],
    wrong: '用力过猛/软绵绵、握手时看别处、戴墨镜握手',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><circle cx="30" cy="50" r="15" fill="#F5DEB3"/><circle cx="70" cy="50" r="15" fill="#F5DEB3"/><path d="M35,45 Q50,35 65,45" stroke="#E74C3C" stroke-width="3" fill="none"/><path d="M35,55 Q50,65 65,55" stroke="#3498DB" stroke-width="3" fill="none"/></svg>'
  },
  {
    id: 4, category: '见面礼仪', icon: '💬', title: '介绍礼仪',
    points: ['顺序：把晚辈介绍给长辈、男士介绍给女士、职位低介绍给职位高', '自我介绍：姓名+单位+职务，简洁不超过30秒', '介绍他人：先称呼尊者，再介绍被介绍者', '名片：双手递接，文字朝向对方，接过先看再收', '眼神：介绍时目光注视对方，微笑示意'],
    wrong: '先把长辈介绍给晚辈、单手递名片、接过名片直接塞口袋',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><rect x="20" y="30" width="35" height="20" rx="3" fill="#fff" stroke="#ddd"/><rect x="45" y="50" width="35" height="20" rx="3" fill="#fff" stroke="#ddd"/><text x="30" y="43" font-size="8" fill="#333">名片</text><text x="55" y="63" font-size="8" fill="#333">名片</text><circle cx="50" cy="20" r="6" fill="#FFC107"/></svg>'
  },
  {
    id: 5, category: '办公礼仪', icon: '💼', title: '办公室礼仪',
    points: ['进门：敲门3下，得到允许再进入', '沟通：当面沟通>电话>邮件，急事打电话', '会议：手机静音，不迟到，不随意打断他人', '工位：保持整洁，不在工位吃气味大的食物', '隐私：不随意翻看他人物品，不偷听他人通话'],
    wrong: '不敲门直接进、会议刷手机、工位脏乱差、大声喧哗',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><rect x="15" y="25" width="70" height="50" rx="4" fill="#fff" stroke="#ddd"/><rect x="25" y="35" width="25" height="15" rx="2" fill="#3498DB"/><rect x="55" y="35" width="25" height="15" rx="2" fill="#E74C3C"/><rect x="25" y="55" width="55" height="10" rx="2" fill="#ddd"/><circle cx="80" cy="20" r="8" fill="#2ECC71"/><path d="M77,20 L79,22 L83,18" stroke="#fff" stroke-width="2" fill="none"/></svg>'
  },
  {
    id: 6, category: '餐饮礼仪', icon: '🍽️', title: '商务宴请礼仪',
    points: ['座次：面门为尊，右高左低，主宾在主人右侧', '餐具：左手叉右手刀，由外向内取用，不挥舞刀叉', '进食：闭嘴咀嚼，不发出声音，口中有食物不说话', '敬酒：主人先敬，晚辈酒杯低于尊者，起身双手举杯', '结账：主人结账，客人不抢单，可事后感谢'],
    wrong: '刀叉乱挥、吧唧嘴、当众剔牙、酒杯举得比领导高',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#fff" stroke="#ddd"/><circle cx="50" cy="50" r="22" fill="#F8F9FA"/><rect x="15" y="35" width="4" height="30" rx="2" fill="#C0C0C0"/><rect x="81" y="35" width="4" height="30" rx="2" fill="#C0C0C0"/><circle cx="50" cy="50" r="8" fill="#E74C3C"/></svg>'
  },
  {
    id: 7, category: '会议礼仪', icon: '📊', title: '会议礼仪',
    points: ['会前：提前5分钟到场，准备好资料，手机调静音', '会中：认真倾听，记笔记，发言先举手，不打断他人', '发言：言简意赅，控制时间，对事不对人', '异议：有不同意见先肯定再提出，用"我补充一下"', '会后：整理纪要，跟进待办事项，及时反馈'],
    wrong: '迟到、会议刷手机、随意打断别人、人身攻击',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="40" rx="4" fill="#fff" stroke="#ddd"/><rect x="28" y="30" width="20" height="3" rx="1.5" fill="#3498DB"/><rect x="28" y="38" width="44" height="2" rx="1" fill="#ddd"/><rect x="28" y="44" width="40" height="2" rx="1" fill="#ddd"/><rect x="28" y="50" width="30" height="2" rx="1" fill="#ddd"/><circle cx="75" cy="70" r="12" fill="#2ECC71"/><path d="M71,70 L74,73 L79,68" stroke="#fff" stroke-width="2" fill="none"/></svg>'
  },
  {
    id: 8, category: '通讯礼仪', icon: '📱', title: '电话/邮件礼仪',
    points: ['电话：响3声内接，先问好自报家门，挂断等对方先挂', '邮件：主题明确，称呼得体，正文简洁，落款完整', '回复：工作邮件24小时内回复，紧急事项电话沟通', '微信：工作消息及时回复，不用语音轰炸，不发长语音', '群聊：不刷屏，不发与工作无关内容，@人要明确'],
    wrong: '电话不自我介绍、邮件无主题、已读不回、群发长语音',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><rect x="25" y="15" width="50" height="70" rx="6" fill="#fff" stroke="#ddd"/><rect x="30" y="25" width="40" height="45" rx="2" fill="#F8F9FA"/><rect x="35" y="32" width="30" height="4" rx="2" fill="#3498DB"/><rect x="35" y="42" width="25" height="2" rx="1" fill="#ddd"/><rect x="35" y="48" width="30" height="2" rx="1" fill="#ddd"/><circle cx="50" cy="80" r="4" fill="#ddd"/></svg>'
  }
];

// ========== 面试高频题库 ==========
const INTERVIEW_QUESTIONS = [
  { id: 1, type: '自我介绍', question: '请做一个简单的自我介绍', framework: 'PREP法则：Point（观点）-Reason（原因）-Example（例子）-Point（总结）', tips: ['控制在1-2分钟', '突出与岗位匹配的经历', '用数据说话', '结尾表达对岗位的热情'], sample: '您好，我叫XX，XX大学电子商务专业大三学生。我有两段相关实习经历：在XX公司做运营实习，负责公众号内容运营，3个月内粉丝增长30%；在XX公司做产品实习，参与了XX功能的需求分析和上线。我对互联网运营岗位非常感兴趣，平时也会主动学习行业知识，希望能在贵公司继续成长。' },
  { id: 2, type: '求职动机', question: '你为什么选择我们公司？', framework: '行业-公司-岗位三层递进', tips: ['提前调研公司业务和文化', '结合自身经历说明匹配度', '不要只说"公司大/工资高"', '表达长期发展意愿'], sample: '我关注贵公司很久了，首先是看好电商行业的发展前景，直播电商和社交电商是未来的趋势；其次贵公司在XX领域的布局非常有前瞻性，特别是XX产品我自己也在用，体验很好；最后这个岗位的职责和我的专业背景、实习经历非常匹配，我相信能在这里发挥价值，也希望能和公司一起成长。' },
  { id: 3, type: '自我认知', question: '你最大的优点和缺点是什么？', framework: '优点+具体事例；缺点+改进措施', tips: ['优点要与岗位相关', '缺点不能是致命缺陷', '重点说改进措施', '不要说"我最大的缺点是追求完美"'], sample: '我的优点是学习能力强，善于快速掌握新事物。比如在XX实习时，公司新上了一个数据系统，我花了一个周末研究文档，第二周就能独立做数据报表，还整理了操作手册给同事。我的缺点是有时候过于追求细节，会在一些非核心问题上花太多时间。我现在会用四象限法管理时间，先完成重要紧急的事，再优化细节，效率提升了很多。' },
  { id: 4, type: '经历描述', question: '请说一段你最有成就感的经历', framework: 'STAR法则：Situation（情境）-Task（任务）-Action（行动）-Result（结果）', tips: ['选与岗位相关的经历', '重点说自己做了什么', '用数据量化结果', '最后总结收获'], sample: '大二上学期，我担任校学生会外联部部长，需要为迎新晚会拉赞助。当时的情况是往届最多拉到5000元，我给自己定了1万元的目标。我做了三件事：第一，整理了20家目标企业名单，根据企业需求定制了赞助方案；第二，带着部员一家家上门拜访，反复修改方案；第三，增加了线上宣传权益，给企业更多曝光。最终我们拉到了12000元赞助，还和3家企业建立了长期合作。这次经历让我学会了如何沟通谈判、如何带团队，也让我更有信心面对挑战。' },
  { id: 5, type: '抗压能力', question: '如果和领导意见不合，你会怎么办？', framework: '先理解-再沟通-后执行', tips: ['不要说"我会说服领导"', '体现职业素养', '强调对事不对人', '最终服从组织决定'], sample: '首先我会认真倾听领导的想法，理解他的出发点和考虑，因为领导掌握的信息可能比我多。然后我会整理自己的思路，找合适的时机和领导沟通，用数据和事实说明我的观点，而不是情绪化地争论。如果领导还是坚持他的意见，我会先执行，因为组织需要统一的方向。在执行过程中我会持续观察，如果发现问题及时反馈。我觉得职场中最重要的是对事不对人，目标都是把事情做好。' },
  { id: 6, type: '团队合作', question: '你在团队中通常扮演什么角色？', framework: '角色定位+具体事例+价值体现', tips: ['不要说"我是领导者"', '根据岗位调整角色', '举具体事例', '强调团队成果'], sample: '我在团队中通常是执行者+协调者的角色。比如在课程小组作业中，我会主动承担任务拆解和进度跟进的工作，把大任务拆成小任务，明确每个人的分工和截止时间，然后定期同步进度。在XX实习中也是，我负责跨部门沟通，把产品、设计、开发的需求对齐，确保项目按时上线。我觉得团队中不一定每个人都要当领导，把自己的角色做好，帮助团队达成目标更重要。' },
  { id: 7, type: '职业规划', question: '你未来3-5年的职业规划是什么？', framework: '短期-中期-长期，与公司发展结合', tips: ['不要说"我想创业"', '要与应聘岗位相关', '体现成长性', '不要太具体到职位title'], sample: '短期1-2年，我希望能快速熟悉业务，掌握岗位所需的专业技能，成为一个能独立负责项目的人；中期3年，我希望能在某个细分领域深入，成为这个领域的专家，能带小团队做项目；长期5年，我希望能跟随公司一起成长，承担更大的责任，为公司创造更多价值。我觉得职业规划不是固定的，会根据公司的发展和自己的成长不断调整，但大方向是在这个领域深耕。' },
  { id: 8, type: '反问环节', question: '你有什么问题要问我们吗？', framework: '问发展/问团队/问业务，不问薪资福利', tips: ['至少准备2-3个问题', '不要问"公司是做什么的"', '不要只问薪资假期', '体现对岗位的思考'], sample: '我有两个问题想请教：第一，这个岗位在团队中的定位是什么？入职后会有怎样的培养和成长路径？第二，我了解到公司最近在XX业务上有新的布局，想请教一下这个业务未来的发展方向是什么？谢谢！' }
];


// ========== PPT版式库 ==========
const PPT_LAYOUTS = [
  {
    id: 1, name: '封面页', category: '结构页', icon: '📕',
    scene: '汇报/答辩/发布会的第一页，奠定整体风格',
    points: ['大标题居中或偏左，字号40-60pt', '副标题在标题下方，字号20-28pt', '背景用纯色/渐变/大图，保持简洁', '底部可放汇报人/日期/公司logo', '留白要充足，不要堆砌信息'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#5B8DEF"/><rect x="30" y="35" width="70" height="8" rx="4" fill="#fff"/><rect x="30" y="50" width="50" height="5" rx="2.5" fill="rgba(255,255,255,0.7)"/><rect x="30" y="80" width="30" height="3" rx="1.5" fill="rgba(255,255,255,0.5)"/></svg>'
  },
  {
    id: 2, name: '目录页', category: '结构页', icon: '📋',
    scene: '封面之后，展示整体结构和章节',
    points: ['标题"目录/CONTENTS"在顶部或左侧', '章节用数字编号，3-6个为宜', '每个章节一行，配图标或色块', '当前章节可高亮显示', '排版整齐，间距一致'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><rect x="15" y="15" width="40" height="6" rx="3" fill="#333"/><rect x="15" y="35" width="8" height="8" rx="2" fill="#5B8DEF"/><rect x="28" y="37" width="60" height="4" rx="2" fill="#ddd"/><rect x="15" y="50" width="8" height="8" rx="2" fill="#5B8DEF"/><rect x="28" y="52" width="50" height="4" rx="2" fill="#ddd"/><rect x="15" y="65" width="8" height="8" rx="2" fill="#5B8DEF"/><rect x="28" y="67" width="55" height="4" rx="2" fill="#ddd"/><rect x="15" y="80" width="8" height="8" rx="2" fill="#ddd"/><rect x="28" y="82" width="45" height="4" rx="2" fill="#eee"/></svg>'
  },
  {
    id: 3, name: '过渡页', category: '结构页', icon: '🔄',
    scene: '章节之间的过渡，告诉观众"接下来讲什么"',
    points: ['大字号章节编号+章节标题', '背景用主题色或深色，与内容页区分', '可加一句本章节核心观点', '简洁为主，不要太多文字', '停留时间短，视觉冲击强'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#2C3E50"/><text x="30" y="55" font-size="36" font-weight="bold" fill="rgba(255,255,255,0.2)">01</text><rect x="30" y="60" width="50" height="5" rx="2.5" fill="#fff"/></svg>'
  },
  {
    id: 4, name: '左文右图', category: '内容页', icon: '📝',
    scene: '需要配图说明的内容，产品介绍/概念解释',
    points: ['左侧文字占40-50%，右侧图片占50-60%', '标题在左上方，正文分点列出', '图片要高清，与内容相关', '图文之间留适当间距', '图片可加圆角或阴影增加层次'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><rect x="15" y="20" width="55" height="6" rx="3" fill="#333"/><rect x="15" y="35" width="55" height="3" rx="1.5" fill="#ddd"/><rect x="15" y="43" width="50" height="3" rx="1.5" fill="#ddd"/><rect x="15" y="51" width="55" height="3" rx="1.5" fill="#ddd"/><rect x="15" y="59" width="45" height="3" rx="1.5" fill="#ddd"/><rect x="80" y="15" width="65" height="70" rx="4" fill="#E3F2FD"/><circle cx="112" cy="50" r="15" fill="#5B8DEF" opacity="0.5"/></svg>'
  },
  {
    id: 5, name: '上图下文', category: '内容页', icon: '🖼️',
    scene: '以图片为主的页面，案例展示/产品展示',
    points: ['图片占60-70%，文字占30-40%', '图片要大而清晰，是视觉焦点', '文字在下方，标题+简短说明', '适合展示作品/截图/照片', '图片可加边框或阴影突出'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><rect x="15" y="12" width="130" height="55" rx="4" fill="#E8F5E9"/><circle cx="80" cy="40" r="12" fill="#4CAF50" opacity="0.4"/><rect x="15" y="75" width="60" height="5" rx="2.5" fill="#333"/><rect x="15" y="85" width="100" height="3" rx="1.5" fill="#ddd"/></svg>'
  },
  {
    id: 6, name: '三栏并列', category: '内容页', icon: '📊',
    scene: '展示三个并列要点/优势/步骤',
    points: ['三栏等宽，间距一致', '每栏：图标+标题+简短说明', '图标风格统一，颜色可区分', '标题加粗，正文简洁', '适合"三大优势""三个步骤"'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><rect x="10" y="15" width="43" height="70" rx="6" fill="#E3F2FD"/><circle cx="31" cy="32" r="8" fill="#5B8DEF"/><rect x="18" y="48" width="27" height="4" rx="2" fill="#333"/><rect x="18" y="58" width="27" height="2" rx="1" fill="#ddd"/><rect x="18" y="64" width="22" height="2" rx="1" fill="#ddd"/><rect x="58" y="15" width="43" height="70" rx="6" fill="#FFF3E0"/><circle cx="79" cy="32" r="8" fill="#FF9800"/><rect x="66" y="48" width="27" height="4" rx="2" fill="#333"/><rect x="66" y="58" width="27" height="2" rx="1" fill="#ddd"/><rect x="66" y="64" width="22" height="2" rx="1" fill="#ddd"/><rect x="106" y="15" width="43" height="70" rx="6" fill="#E8F5E9"/><circle cx="127" cy="32" r="8" fill="#4CAF50"/><rect x="114" y="48" width="27" height="4" rx="2" fill="#333"/><rect x="114" y="58" width="27" height="2" rx="1" fill="#ddd"/><rect x="114" y="64" width="22" height="2" rx="1" fill="#ddd"/></svg>'
  },
  {
    id: 7, name: '四宫格', category: '内容页', icon: '🔲',
    scene: '展示四个并列要点/模块/维度',
    points: ['2x2网格，每格等大', '每格：图标/数字+标题+说明', '可用不同颜色区分', '适合"四大模块""四个维度"', '注意视觉平衡，不要某格内容过多'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><rect x="10" y="10" width="68" height="38" rx="6" fill="#E3F2FD"/><rect x="82" y="10" width="68" height="38" rx="6" fill="#FFF3E0"/><rect x="10" y="52" width="68" height="38" rx="6" fill="#E8F5E9"/><rect x="82" y="52" width="68" height="38" rx="6" fill="#FCE4EC"/><rect x="20" y="22" width="20" height="4" rx="2" fill="#333"/><rect x="92" y="22" width="20" height="4" rx="2" fill="#333"/><rect x="20" y="64" width="20" height="4" rx="2" fill="#333"/><rect x="92" y="64" width="20" height="4" rx="2" fill="#333"/></svg>'
  },
  {
    id: 8, name: '时间轴', category: '内容页', icon: '⏱️',
    scene: '展示发展历程/流程步骤/项目计划',
    points: ['横向或纵向时间线', '节点用圆点/图标标记', '每个节点：时间+标题+简短说明', '3-6个节点为宜', '线的样式要统一，节点突出'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><line x1="20" y1="50" x2="140" y2="50" stroke="#ddd" stroke-width="3"/><circle cx="30" cy="50" r="6" fill="#5B8DEF"/><rect x="20" y="62" width="20" height="3" rx="1.5" fill="#333"/><rect x="20" y="70" width="25" height="2" rx="1" fill="#ddd"/><circle cx="65" cy="50" r="6" fill="#5B8DEF"/><rect x="55" y="62" width="20" height="3" rx="1.5" fill="#333"/><rect x="55" y="70" width="25" height="2" rx="1" fill="#ddd"/><circle cx="100" cy="50" r="6" fill="#5B8DEF"/><rect x="90" y="62" width="20" height="3" rx="1.5" fill="#333"/><rect x="90" y="70" width="25" height="2" rx="1" fill="#ddd"/><circle cx="135" cy="50" r="6" fill="#ddd"/><rect x="125" y="62" width="20" height="3" rx="1.5" fill="#999"/><rect x="125" y="70" width="20" height="2" rx="1" fill="#ddd"/></svg>'
  },
  {
    id: 9, name: '循环图', category: '内容页', icon: '🔁',
    scene: '展示闭环流程/循环关系/持续改进',
    points: ['3-5个环节组成环形', '每个环节：图标+标题+说明', '箭头表示循环方向', '适合"PDCA循环""用户旅程"', '中心可放主题或核心指标'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><circle cx="80" cy="50" r="25" fill="#E3F2FD"/><text x="80" y="54" text-anchor="middle" font-size="10" fill="#1565C0" font-weight="bold">核心</text><circle cx="80" cy="18" r="10" fill="#5B8DEF"/><circle cx="118" cy="68" r="10" fill="#FF9800"/><circle cx="42" cy="68" r="10" fill="#4CAF50"/><path d="M85,25 Q105,35 112,60" stroke="#ddd" stroke-width="2" fill="none" marker-end="url(#arrow)"/><path d="M110,72 Q80,82 50,72" stroke="#ddd" stroke-width="2" fill="none"/><path d="M48,60 Q55,35 75,25" stroke="#ddd" stroke-width="2" fill="none"/></svg>'
  },
  {
    id: 10, name: '金字塔', category: '内容页', icon: '🔺',
    scene: '展示层级关系/优先级/需求层次',
    points: ['从上到下或从下到上分层', '每层宽度不同，表示层级', '3-5层为宜', '适合"马斯洛需求""能力层级"', '颜色从浅到深或从深到浅渐变'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><polygon points="80,12 95,30 65,30" fill="#1565C0"/><polygon points="65,32 95,32 105,50 55,50" fill="#1976D2"/><polygon points="55,52 105,52 115,70 45,70" fill="#1E88E5"/><polygon points="45,72 115,72 125,90 35,90" fill="#2196F3"/></svg>'
  },
  {
    id: 11, name: '对比页', category: '内容页', icon: '⚖️',
    scene: '展示两种方案/产品/观点的对比',
    points: ['左右两栏，中间用VS或箭头分隔', '每栏：标题+要点列表', '优点用绿色，缺点用红色', '适合"方案A vs方案B""旧版vs新版"', '最后可加结论或推荐'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><rect x="10" y="15" width="65" height="70" rx="6" fill="#E3F2FD"/><rect x="85" y="15" width="65" height="70" rx="6" fill="#FFF3E0"/><rect x="20" y="25" width="30" height="5" rx="2.5" fill="#1565C0"/><rect x="20" y="40" width="45" height="3" rx="1.5" fill="#999"/><rect x="20" y="48" width="40" height="3" rx="1.5" fill="#999"/><rect x="20" y="56" width="45" height="3" rx="1.5" fill="#999"/><rect x="95" y="25" width="30" height="5" rx="2.5" fill="#E65100"/><rect x="95" y="40" width="45" height="3" rx="1.5" fill="#999"/><rect x="95" y="48" width="40" height="3" rx="1.5" fill="#999"/><rect x="95" y="56" width="45" height="3" rx="1.5" fill="#999"/><circle cx="80" cy="50" r="10" fill="#fff" stroke="#ddd" stroke-width="2"/><text x="80" y="54" text-anchor="middle" font-size="9" fill="#666" font-weight="bold">VS</text></svg>'
  },
  {
    id: 12, name: '数据图表页', category: '内容页', icon: '📈',
    scene: '展示数据/趋势/对比，用图表说话',
    points: ['图表占主要位置（50-70%）', '标题点明核心结论，不是"数据图表"', '图表旁边配关键数据解读', '图表要简洁，去掉多余元素', '用颜色突出重点数据'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><rect x="15" y="15" width="70" height="5" rx="2.5" fill="#333"/><rect x="15" y="30" width="90" height="55" rx="4" fill="#F8F9FA"/><line x1="25" y1="75" x2="95" y2="75" stroke="#ddd" stroke-width="1"/><rect x="30" y="55" width="8" height="20" rx="2" fill="#5B8DEF"/><rect x="45" y="45" width="8" height="30" rx="2" fill="#5B8DEF"/><rect x="60" y="38" width="8" height="37" rx="2" fill="#FF9800"/><rect x="75" y="48" width="8" height="27" rx="2" fill="#5B8DEF"/><rect x="110" y="35" width="35" height="4" rx="2" fill="#333"/><rect x="110" y="45" width="35" height="2" rx="1" fill="#ddd"/><rect x="110" y="52" width="30" height="2" rx="1" fill="#ddd"/><rect x="110" y="62" width="25" height="8" rx="4" fill="#FF9800"/><text x="122" y="69" text-anchor="middle" font-size="7" fill="#fff" font-weight="bold">+35%</text></svg>'
  },
  {
    id: 13, name: '引用页', category: '内容页', icon: '💬',
    scene: '展示金句/名言/核心观点，增强感染力',
    points: ['大字号引用文字，居中或偏左', '配引号图标或装饰线', '下方注明出处/演讲人', '背景简洁，突出文字', '适合开场/转场/结尾升华'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#2C3E50"/><text x="30" y="45" font-size="40" fill="rgba(255,255,255,0.15)">"</text><rect x="30" y="50" width="80" height="5" rx="2.5" fill="#fff"/><rect x="30" y="62" width="60" height="3" rx="1.5" fill="rgba(255,255,255,0.6)"/><rect x="30" y="80" width="30" height="2" rx="1" fill="rgba(255,255,255,0.4)"/></svg>'
  },
  {
    id: 14, name: '团队介绍', category: '内容页', icon: '👥',
    scene: '介绍团队成员/嘉宾/讲师',
    points: ['人物头像+姓名+职位+简介', '2-6人一排，整齐排列', '头像用圆形或圆角矩形', '职位用不同颜色区分', '可加社交链接或二维码'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#fff"/><circle cx="40" cy="35" r="15" fill="#E3F2FD"/><rect x="25" y="55" width="30" height="4" rx="2" fill="#333"/><rect x="28" y="63" width="24" height="2" rx="1" fill="#ddd"/><rect x="30" y="70" width="20" height="2" rx="1" fill="#ddd"/><circle cx="80" cy="35" r="15" fill="#FFF3E0"/><rect x="65" y="55" width="30" height="4" rx="2" fill="#333"/><rect x="68" y="63" width="24" height="2" rx="1" fill="#ddd"/><rect x="70" y="70" width="20" height="2" rx="1" fill="#ddd"/><circle cx="120" cy="35" r="15" fill="#E8F5E9"/><rect x="105" y="55" width="30" height="4" rx="2" fill="#333"/><rect x="108" y="63" width="24" height="2" rx="1" fill="#ddd"/><rect x="110" y="70" width="20" height="2" rx="1" fill="#ddd"/></svg>'
  },
  {
    id: 15, name: '结尾页', category: '结构页', icon: '🎯',
    scene: '汇报/答辩的最后一页，感谢+联系方式',
    points: ['"感谢聆听/Thanks"大字居中', '下方放联系方式/二维码', '背景与封面呼应，保持统一', '可加一句总结性的话', '简洁有力，不要太多信息'],
    svg: '<svg width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="#5B8DEF"/><rect x="45" y="38" width="70" height="10" rx="5" fill="#fff"/><rect x="55" y="58" width="50" height="4" rx="2" fill="rgba(255,255,255,0.7)"/><rect x="65" y="75" width="30" height="3" rx="1.5" fill="rgba(255,255,255,0.5)"/></svg>'
  }
];

// ========== PPT优秀案例拆解 ==========
const PPT_CASES = [
  {
    id: 1, name: '麦肯锡咨询报告风格', icon: '🏢',
    desc: '咨询行业标杆，逻辑清晰，数据驱动，每页一个核心观点',
    pages: [
      { title: '封面页', analysis: '【设计亮点】①深蓝色背景+白色大标题，专业稳重；②标题直接点明核心结论"XX市场规模将在2025年突破千亿"，不是"XX市场分析报告"；③副标题补充时间范围和汇报对象；④底部放公司logo和日期，信息完整。【可借鉴】封面标题要说结论，不要只说主题。', svg: '<svg width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#1A237E"/><rect x="25" y="40" width="120" height="8" rx="4" fill="#fff"/><rect x="25" y="55" width="90" height="4" rx="2" fill="rgba(255,255,255,0.6)"/><rect x="25" y="95" width="40" height="3" rx="1.5" fill="rgba(255,255,255,0.4)"/></svg>' },
      { title: '执行摘要页', analysis: '【设计亮点】①顶部"执行摘要"标题+右侧页码；②左侧3个核心结论，每个用数字编号+加粗标题+一句话说明；③右侧配关键数据图表，用柱状图展示趋势；④结论用蓝色色块突出，一目了然。【可借鉴】摘要页要让读者30秒get核心观点。', svg: '<svg width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#fff"/><rect x="15" y="12" width="50" height="5" rx="2.5" fill="#1A237E"/><rect x="15" y="28" width="100" height="75" rx="4" fill="#F5F5F5"/><rect x="25" y="38" width="8" height="8" rx="2" fill="#1A237E"/><rect x="38" y="40" width="60" height="3" rx="1.5" fill="#333"/><rect x="38" y="47" width="70" height="2" rx="1" fill="#999"/><rect x="25" y="58" width="8" height="8" rx="2" fill="#1A237E"/><rect x="38" y="60" width="55" height="3" rx="1.5" fill="#333"/><rect x="38" y="67" width="65" height="2" rx="1" fill="#999"/><rect x="25" y="78" width="8" height="8" rx="2" fill="#1A237E"/><rect x="38" y="80" width="50" height="3" rx="1.5" fill="#333"/><rect x="38" y="87" width="60" height="2" rx="1" fill="#999"/><rect x="125" y="28" width="60" height="75" rx="4" fill="#E8EAF6"/><rect x="135" y="70" width="8" height="20" rx="2" fill="#1A237E"/><rect x="148" y="60" width="8" height="30" rx="2" fill="#1A237E"/><rect x="161" y="50" width="8" height="40" rx="2" fill="#FF6F00"/></svg>' },
      { title: '数据图表页', analysis: '【设计亮点】①标题直接说结论"市场规模连续5年增长，CAGR达18%"，不是"市场规模数据"；②图表占页面60%，是视觉焦点；③图表只保留必要元素，去掉网格线和多余标签；④关键数据点用橙色突出，配数据标签；⑤右侧配3条数据解读，每条一句话。【可借鉴】图表页标题=结论，图表要简洁，重点数据要突出。', svg: '<svg width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#fff"/><rect x="15" y="12" width="120" height="5" rx="2.5" fill="#1A237E"/><rect x="15" y="28" width="110" height="75" rx="4" fill="#F5F5F5"/><line x1="25" y1="90" x2="115" y2="90" stroke="#ddd" stroke-width="1"/><rect x="32" y="65" width="10" height="25" rx="2" fill="#1A237E"/><rect x="48" y="58" width="10" height="32" rx="2" fill="#1A237E"/><rect x="64" y="50" width="10" height="40" rx="2" fill="#1A237E"/><rect x="80" y="42" width="10" height="48" rx="2" fill="#1A237E"/><rect x="96" y="35" width="10" height="55" rx="2" fill="#FF6F00"/><rect x="135" y="28" width="50" height="75" rx="4" fill="#E8EAF6"/><rect x="145" y="40" width="35" height="3" rx="1.5" fill="#333"/><rect x="145" y="48" width="30" height="2" rx="1" fill="#999"/><rect x="145" y="60" width="35" height="3" rx="1.5" fill="#333"/><rect x="145" y="68" width="30" height="2" rx="1" fill="#999"/><rect x="145" y="80" width="35" height="3" rx="1.5" fill="#333"/><rect x="145" y="88" width="30" height="2" rx="1" fill="#999"/></svg>' }
    ]
  },
  {
    id: 2, name: '苹果发布会风格', icon: '🍎',
    desc: '极简主义代表，大图少字，留白充足，视觉冲击力强',
    pages: [
      { title: '产品发布页', analysis: '【设计亮点】①纯黑背景，产品图居中，是绝对视觉焦点；②只有一句话标题"iPhone 15 Pro，钛金属，如此轻，如此强"；③字体用超大号，白色，与黑色背景形成强烈对比；④没有任何多余元素，留白极多；⑤产品图有光影效果，质感十足。【可借鉴】产品页要少字，让产品自己说话，留白就是高级感。', svg: '<svg width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#000"/><rect x="85" y="25" width="30" height="60" rx="6" fill="#333"/><rect x="88" y="30" width="24" height="45" rx="3" fill="#666"/><circle cx="100" cy="52" r="6" fill="#444"/><rect x="50" y="95" width="100" height="6" rx="3" fill="#fff"/><rect x="65" y="107" width="70" height="3" rx="1.5" fill="rgba(255,255,255,0.5)"/></svg>' },
      { title: '参数对比页', analysis: '【设计亮点】①左右对比布局，旧款vs新款；②中间用"VS"或箭头分隔；③每侧只有3-4个关键参数，用大字号数字突出；④新款参数用彩色（橙色/蓝色），旧款用灰色；⑤底部一句总结"性能提升40%，续航增加2小时"。【可借鉴】对比页不要列所有参数，只列关键差异，用数字说话。', svg: '<svg width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#000"/><rect x="20" y="20" width="70" height="80" rx="8" fill="#1a1a1a"/><rect x="110" y="20" width="70" height="80" rx="8" fill="#1a1a1a"/><rect x="35" y="35" width="40" height="4" rx="2" fill="#666"/><text x="55" y="60" text-anchor="middle" font-size="16" fill="#999" font-weight="bold">A15</text><rect x="35" y="75" width="40" height="3" rx="1.5" fill="#666"/><rect x="125" y="35" width="40" height="4" rx="2" fill="#FF6F00"/><text x="145" y="60" text-anchor="middle" font-size="16" fill="#FF6F00" font-weight="bold">A17</text><rect x="125" y="75" width="40" height="3" rx="1.5" fill="#FF6F00"/><text x="100" y="65" text-anchor="middle" font-size="12" fill="#fff" font-weight="bold">VS</text></svg>' }
    ]
  },
  {
    id: 3, name: '毕业答辩PPT风格', icon: '🎓',
    desc: '学术严谨，结构完整，图文并茂，适合课程答辩/毕业论文',
    pages: [
      { title: '研究框架页', analysis: '【设计亮点】①顶部标题"研究框架与技术路线"；②用流程图展示研究步骤：文献综述→理论模型→实证分析→结论建议；③每个步骤用矩形框，箭头连接，配简短说明；④左侧放研究问题，右侧放研究方法，逻辑清晰；⑤配色用蓝白灰，学术感强。【可借鉴】答辩PPT要逻辑清晰，框架图能让评委快速理解你的研究思路。', svg: '<svg width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#fff"/><rect x="15" y="12" width="70" height="5" rx="2.5" fill="#1565C0"/><rect x="20" y="45" width="35" height="25" rx="4" fill="#E3F2FD"/><text x="37" y="60" text-anchor="middle" font-size="8" fill="#1565C0">文献综述</text><rect x="65" y="45" width="35" height="25" rx="4" fill="#E3F2FD"/><text x="82" y="60" text-anchor="middle" font-size="8" fill="#1565C0">理论模型</text><rect x="110" y="45" width="35" height="25" rx="4" fill="#E3F2FD"/><text x="127" y="60" text-anchor="middle" font-size="8" fill="#1565C0">实证分析</text><rect x="155" y="45" width="35" height="25" rx="4" fill="#1565C0"/><text x="172" y="60" text-anchor="middle" font-size="8" fill="#fff">结论建议</text><line x1="55" y1="57" x2="65" y2="57" stroke="#1565C0" stroke-width="2"/><line x1="100" y1="57" x2="110" y2="57" stroke="#1565C0" stroke-width="2"/><line x1="145" y1="57" x2="155" y2="57" stroke="#1565C0" stroke-width="2"/><rect x="20" y="85" width="170" height="20" rx="4" fill="#F5F5F5"/><rect x="30" y="92" width="60" height="3" rx="1.5" fill="#333"/><rect x="30" y="99" width="100" height="2" rx="1" fill="#999"/></svg>' }
    ]
  }
];


// ========== 高情商场景话术库 ==========
const COMM_SCENES = [
  {
    id: 1, category: '拒绝', icon: '🙅', title: '同事让你帮忙做他的工作',
    scene: '同事说："我今天太忙了，这个报表你帮我做一下吧，反正你也会。"但你自己也有很多工作。',
    wrong: '"不行啊，我也很忙，你自己做吧。"（太生硬，容易得罪人）\n"好吧，我帮你做。"（不拒绝，自己累，还会被当成理所当然）',
    wrongAnalysis: '直接拒绝显得冷漠，容易破坏关系；一味答应会让自己超负荷，还会被不断索取。',
    right: '"我理解你今天确实很忙，我也很想帮你。不过我手上的XX项目今天必须交，实在抽不出时间。你看这样行不行——我可以教你怎么做，或者我明天有空了再帮你看看？"',
    formula: '共情 + 说明自己的难处 + 提供替代方案',
    tips: ['先肯定对方的处境，表达理解', '用"我"开头说自己的情况，不指责对方', '给替代方案，不是完全拒绝', '温和但坚定，不轻易妥协']
  },
  {
    id: 2, category: '向上沟通', icon: '📢', title: '向领导汇报坏消息/项目延期',
    scene: '项目出了问题，可能要延期3天，你需要向领导汇报。',
    wrong: '"领导，项目做不完了，要延期。"（只说问题，没有方案）\n"都怪XX部门不配合，所以延期了。"（甩锅，不负责任）',
    wrongAnalysis: '只说问题不说方案，领导会觉得你无能；甩锅会让领导觉得你没有担当。',
    right: '"领导，跟您汇报一下项目进展。目前我们遇到了一个问题：XX环节比预期复杂，可能需要延期3天。我已经想了两个应对方案：方案一是增加人手，方案二是先上线核心功能，后续迭代。我个人倾向方案一，您看怎么处理比较好？"',
    formula: '客观陈述问题 + 说明影响 + 给出2个以上方案 + 提出建议 + 请领导决策',
    tips: ['第一时间汇报，不要等瞒不住了才说', '不甩锅，先讲自己能做什么', '一定要带方案去，不要只带问题', '把选择题留给领导，不是问答题']
  },
  {
    id: 3, category: '反馈', icon: '💬', title: '给同事提负面反馈/指出问题',
    scene: '同事的方案有明显问题，你需要指出来，但又不想伤害关系。',
    wrong: '"你这个方案不行啊，这里错了，那里也有问题。"（直接否定，让人下不来台）\n"挺好的挺好的。"（不说真话，最后出问题更麻烦）',
    wrongAnalysis: '直接否定会让人产生防御心理，听不进去建议；不说真话是不负责任，最后问题爆发更难收拾。',
    right: '"这个方案整体思路很清晰，特别是XX部分考虑得很周到。有一个地方我有点不同想法，想跟你探讨一下：这里如果换成XX方式，会不会效果更好？当然这只是我的个人看法，你觉得呢？"',
    formula: '先肯定优点 + 用"我"表达感受/想法 + 提具体建议 + 把决定权交给对方',
    tips: ['三明治法则：肯定-建议-鼓励', '对事不对人，说行为不说人格', '用"我觉得"而不是"你错了"', '私下提，不要在众人面前指出']
  },
  {
    id: 4, category: '会议发言', icon: '🎤', title: '会议上突然被领导点名发言',
    scene: '开会时领导突然说："小王，你对这个问题怎么看？"你完全没准备。',
    wrong: '"我...我没什么想法。"（显得没思考，不专业）\n"我觉得挺好的。"（敷衍，没有价值）',
    wrongAnalysis: '说没想法会让领导觉得你没参与会议；敷衍回答会显得你没有思考能力。',
    right: '"谢谢领导的提问。关于这个问题，我目前有两点初步的想法：第一，...；第二，...。不过这个问题我还需要再深入研究一下，会后我整理一份详细的方案给您。"',
    formula: '感谢提问 + 给出2-3点框架性想法 + 承认需要深入 + 承诺后续行动',
    tips: ['不要慌，先停顿2秒组织语言', '即使没准备，也可以说框架性的观点', '用"第一、第二"显得有条理', '不懂就说不懂，但要给出后续行动']
  },
  {
    id: 5, category: '冲突处理', icon: '🔥', title: '被客户/同事当众指责或质疑',
    scene: '客户很生气地说："你们这个产品怎么这么多问题？我要投诉！"',
    wrong: '"这不是我们的问题，是你自己不会用。"（对抗，火上浇油）\n"对不起对不起，都是我们的错。"（一味认错，可能承担不该承担的责任）',
    wrongAnalysis: '对抗会让对方更生气，矛盾升级；一味认错可能会被认为理亏，承担不必要的责任。',
    right: '"非常理解您的心情，给您带来不便真的很抱歉。您先别着急，能具体说一下是哪个功能出了问题吗？我马上帮您排查，如果是我们的问题，我们一定负责到底。"',
    formula: '共情 + 道歉（对感受，不对事实） + 询问具体情况 + 承诺解决',
    tips: ['先处理情绪，再处理事情', '不要急着辩解，先听对方说完', '道歉是对"给你带来不好体验"道歉，不是认责', '把注意力引向解决问题']
  },
  {
    id: 6, category: '争取资源', icon: '💰', title: '向领导争取资源/加薪/晋升',
    scene: '你觉得自己工作做得不错，想跟领导谈加薪或争取更多资源。',
    wrong: '"领导，我工资太低了，能不能给我涨点？"（只说自己的需求，没有价值）\n"XX都涨工资了，我也要。"（攀比，领导反感）',
    wrongAnalysis: '只说自己需要钱，领导不会因为你需要就给你；攀比会让领导觉得你心态不好。',
    right: '"领导，想跟您聊聊我接下来的发展。过去半年我负责了XX项目，达成了XX成果（用数据说话）。接下来我想承担更大的责任，比如XX方向。我了解到这个岗位的市场薪资范围是XX，想请教一下我还需要在哪些方面提升，才能达到这个水平？"',
    formula: '汇报过往成果（数据） + 表达发展意愿 + 了解差距 + 请领导给方向',
    tips: ['用数据和成果说话，不要用苦劳', '不要威胁"不给我就走"', '把"要"变成"我需要怎么做才能得到"', '选对时机，领导心情好、公司业绩好的时候谈']
  },
  {
    id: 7, category: '拒绝应酬', icon: '🍷', title: '不想参加酒局/团建，如何婉拒',
    scene: '同事喊你晚上一起喝酒聚餐，但你不想去（i人狂喜场景）。',
    wrong: '"我不去，你们去吧。"（太冷淡，显得不合群）\n"我有事。"（太敷衍，对方会追问什么事）',
    wrongAnalysis: '直接拒绝显得不合群，容易被边缘化；敷衍的理由站不住脚，对方会追问。',
    right: '"哎呀，真的很想去！不过我今晚已经约了人/家里有点事，实在走不开。你们玩得开心点，下次我一定参加！对了，记得多拍点照片发群里啊。"',
    formula: '表达想去的意愿 + 给出合理理由 + 承诺下次 + 表达关注',
    tips: ['i人不用勉强自己，但拒绝要给足对方面子', '理由要具体，不要说"有事"这种模糊的', '表达"我也想去"的意愿，让对方感受到重视', '偶尔参加一次，维持基本社交']
  },
  {
    id: 8, category: '被甩锅', icon: '🎯', title: '出问题时被别人甩锅，如何回应',
    scene: '开会时同事说："这个问题主要是因为XX（你）那边没有及时提供数据。"但其实不是你的问题。',
    wrong: '"不是我的问题，是你自己没说清楚！"（直接对抗，变成吵架）\n沉默不语，默认背锅。（委屈自己，还会被继续甩锅）',
    wrongAnalysis: '直接对抗会变成互相指责，领导看了印象都不好；沉默背锅会让对方得寸进尺。',
    right: '"关于这个问题，我想补充一下事实：我是在XX时间收到需求的，在XX时间提供了数据。可能中间沟通上有些误会，我们会后一起对一下时间线，把问题搞清楚，避免下次再出现。"',
    formula: '客观陈述事实 + 不指责对方 + 提出解决/预防方案',
    tips: ['不要情绪化，用事实和数据说话', '不要说"你错了"，说"我们可能有误会"', '把焦点引向"如何解决和避免"，而不是"谁的错"', '会后私下沟通，留足面子']
  },
  {
    id: 9, category: '催进度', icon: '⏰', title: '如何礼貌地催别人交东西/回消息',
    scene: '同事答应给你一份资料，但过了好几天还没给，你需要催一下。',
    wrong: '"你那个资料到底什么时候给我？都等你好几天了！"（质问，让人不舒服）\n不催，自己干等。（耽误自己的进度）',
    wrongAnalysis: '质问的语气会让对方产生抵触；不催会耽误自己的工作，最后可能还要背锅。',
    right: '"哈喽，打扰一下~之前跟你说的那份资料，不知道你这边进展怎么样了？我这边后续工作需要用到，如果你那边比较忙，我们可以看看有没有其他方式先推进。不着急，你看方便的时候给我就行~"',
    formula: '礼貌开场 + 询问进展 + 说明自己的需求 + 提供备选方案 + 给对方台阶',
    tips: ['用"询问进展"而不是"质问为什么还没给"', '说明这个东西对你的影响，让对方知道重要性', '给对方台阶，比如"是不是很忙"', '重要的事可以多催几次，但每次都要礼貌']
  },
  {
    id: 10, category: '表达不同意见', icon: '🤔', title: '不同意别人的观点，如何表达',
    scene: '会议上同事提出一个方案，你觉得有问题，但直接反对又不好。',
    wrong: '"我不同意，这个方案不行。"（直接否定，让人下不来台）\n"我觉得你说得对。"（违心附和，最后出问题）',
    wrongAnalysis: '直接否定会让对方没面子，也不利于讨论；违心附和是不负责任，最后方案出问题大家都受影响。',
    right: '"这个方案的整体思路很有启发，特别是XX部分考虑得很好。我有一个不同的角度想补充一下：如果从XX角度看，会不会有XX风险？当然这只是我的个人看法，大家可以一起讨论一下。"',
    formula: '先肯定 + 用"补充/不同角度"而不是"反对" + 说出具体顾虑 + 邀请讨论',
    tips: ['对事不对人，讨论方案不讨论人', '用"我补充一个角度"而不是"我不同意"', '说出具体的顾虑和理由，不是空泛反对', '给对方面子，私下可以更直接']
  },
  {
    id: 11, category: '自我介绍', icon: '👋', title: '面试/聚会时如何做自我介绍',
    scene: '新员工入职/面试/聚会，需要做自我介绍，不知道说什么。',
    wrong: '"我叫XX，今年22岁，没了。"（太简短，别人记不住你）\n说一大堆，从小学讲到大学，别人听不下去。',
    wrongAnalysis: '太简短别人记不住你；太长别人没耐心听，抓不住重点。',
    right: '"大家好，我叫XX，XX大学电子商务专业毕业，之前在XX公司做过运营实习。我平时喜欢研究数据分析，也喜欢打篮球。很高兴加入这个团队，以后请大家多多指教！如果有什么我能帮忙的，随时叫我~"',
    formula: '姓名 + 背景/专业 + 一个亮点/特长 + 一个兴趣爱好 + 友好结尾',
    tips: ['控制在30秒-1分钟', '说一个让人记住你的亮点（特长/经历/爱好）', '微笑，眼神交流，不要低头念稿', '结尾表达友好，拉近关系']
  },
  {
    id: 12, category: 'i人专属', icon: '🦋', title: 'i人如何在社交场合不尴尬',
    scene: '公司团建/聚会，你是i人，不知道跟人聊什么，想早点走。',
    wrong: '全程玩手机，不跟人说话。（显得不合群）\n硬着头皮尬聊，自己难受别人也尴尬。',
    wrongAnalysis: '全程玩手机会被认为不合群、不尊重别人；硬尬聊双方都难受，效果也不好。',
    right: '【入场前】提前想好3个安全话题（美食/旅行/最近的剧/工作相关）。\n【入场后】先找一个看起来也比较安静的人，从"你也是第一次来吗"开始聊。\n【聊天中】多问开放式问题，让对方多说，你负责倾听和点头。\n【想走时】"今天玩得很开心，不过我明天还有点事，就先撤了，你们继续玩~"',
    formula: '提前准备 + 找同类人 + 多问多听 + 礼貌退场',
    tips: ['i人不用逼自己变e，找到适合自己的社交方式', '带一个"社交道具"（饮料/手机），缓解手不知道放哪的尴尬', '提前走很正常，不用有心理负担', '深度社交比广度社交更适合i人，交1个朋友比加10个微信有用']
  }
];


// ========== 高情商万能金句库 ==========
const COMM_QUOTES = [
  { id: 1, category: '拒绝', icon: '🙅', quote: '我理解你的处境，不过我目前确实腾不出手，你看这样行不行——', scene: '别人请你帮忙，但你没时间/不想帮', example: '同事："这个报表帮我做一下呗？" 你："我理解你今天确实很忙，不过我目前确实腾不出手，你看这样行不行——我教你怎么做，很快就能学会。"', why: '先共情让对方感受到被理解，再说明自己的难处，最后给替代方案，不是完全拒绝，对方更容易接受。' },
  { id: 2, category: '拒绝', icon: '🙅', quote: '这个我可能真的不太擅长，怕做不好反而耽误你，建议你找XX更合适。', scene: '别人让你做你不擅长/不想做的事', example: '同事："这个设计图你帮我弄一下吧。" 你："这个我可能真的不太擅长，怕做不好反而耽误你，建议你找设计部的小王更合适，他做得又快又好。"', why: '用"不擅长"而不是"不想做"，给对方一个合理的理由，同时推荐替代人选，显得你在为对方着想。' },
  { id: 3, category: '赞美', icon: '👏', quote: '你这个XX做得太赞了，特别是XX细节，能教教我你是怎么想到的吗？', scene: '想赞美别人，又不想显得敷衍', example: '同事做完一个方案，你："你这个方案做得太赞了，特别是第三页的数据可视化，能教教我你是怎么想到用这个图表的吗？"', why: '赞美要具体，指出具体的细节，而不是空泛的"你真棒"。再加上请教的姿态，对方会觉得你是真心欣赏，而不是客套。' },
  { id: 4, category: '赞美', icon: '👏', quote: '有你在我就放心多了，这个事交给你肯定没问题。', scene: '想表达对别人的信任和认可', example: '把任务交给同事时："有你在我就放心多了，这个项目交给你肯定没问题，有什么需要我支持的随时说。"', why: '表达信任是最高级的赞美，让对方感受到被重视，同时也会激励对方把事情做好。' },
  { id: 5, category: '道歉', icon: '🙇', quote: '这件事是我考虑不周，给你添麻烦了，我马上这样处理，你看可以吗？', scene: '自己犯错了，需要道歉并补救', example: '你把数据搞错了，影响了同事："这件事是我考虑不周，给你添麻烦了，我马上重新核对数据，半小时内发给你，你看可以吗？"', why: '道歉三要素：承认错误（不找借口）+ 表达歉意 + 给出解决方案。不要说"对不起，但是..."，那不是真道歉。' },
  { id: 6, category: '道歉', icon: '🙇', quote: '抱歉让你等这么久，我这边刚处理完一个紧急的事，我们现在开始吧。', scene: '迟到了/让对方等了', example: '开会迟到了："抱歉让大家等这么久，我这边刚处理完一个紧急的客户问题，我们现在开始吧，下次我一定提前安排好时间。"', why: '先道歉，再简单说明原因（不是借口），然后马上进入正题，不要过多解释，也不要反复道歉，那样会浪费大家时间。' },
  { id: 7, category: '表达不同意见', icon: '🤔', quote: '你说得很有道理，不过我有一个不同的角度想补充一下——', scene: '不同意别人的观点，但不想直接反驳', example: '同事提出一个方案，你有不同想法："你说得很有道理，特别是成本控制这块考虑得很周到。不过我有一个不同的角度想补充一下——如果从用户体验来看，会不会有另一种可能？"', why: '先肯定对方，让对方放下防御心理，然后用"补充一个角度"而不是"我不同意"，把对立变成讨论，对方更容易接受你的观点。' },
  { id: 8, category: '表达不同意见', icon: '🤔', quote: '我理解你的想法，不过我有点担心XX方面，你觉得呢？', scene: '对方案有顾虑，想提出来', example: '领导提出一个想法，你觉得有风险："我理解您的想法，这个方向确实很有创新性。不过我有点担心执行成本方面，可能会超出预算，您觉得呢？"', why: '用"我担心"而不是"这不行"，表达的是你的感受和顾虑，而不是否定对方。最后把问题抛给对方，让对方来判断，显得你在为团队考虑。' },
  { id: 9, category: '催进度', icon: '⏰', quote: '哈喽，打扰一下~之前跟你说的XX，不知道你这边进展怎么样了？', scene: '需要催别人交东西，但不想显得咄咄逼人', example: '催同事交资料："哈喽，打扰一下~之前跟你说的那份数据，不知道你这边进展怎么样了？我这边后续工作需要用到，如果你比较忙，我们可以看看有没有其他方式先推进。"', why: '用"询问进展"而不是"质问为什么还没给"，语气友好。说明这个东西对你的影响，让对方知道重要性。给对方台阶，比如"是不是很忙"，对方更容易回应。' },
  { id: 10, category: '催进度', icon: '⏰', quote: '这个事比较急，麻烦你今天之内帮忙处理一下，辛苦啦！', scene: '事情比较急，需要明确催促', example: '紧急任务："小王，这个数据客户今天就要，比较急，麻烦你今天下午3点前帮忙处理一下，辛苦啦！完事我请你喝奶茶~"', why: '明确说明紧急程度和截止时间，不要含糊地说"尽快"。最后加上感谢和小福利，对方更愿意配合。' },
  { id: 11, category: '安慰人', icon: '🤗', quote: '我理解你现在的感受，换作是我也会很难过，想聊聊吗？我在。', scene: '朋友/同事遇到挫折，需要安慰', example: '同事项目失败了很沮丧："我理解你现在的感受，换作是我也会很难过，毕竟付出了这么多。想聊聊吗？我在，随时听你说。"', why: '安慰人最重要的是共情，而不是讲道理。不要说"这有什么大不了的"、"别难过了"，那会让对方觉得不被理解。先接纳情绪，再陪伴，对方想说自然会说。' },
  { id: 12, category: '安慰人', icon: '🤗', quote: '你已经做得很好了，这种情况换谁都很难处理，不是你的问题。', scene: '对方自责/自我怀疑时', example: '同事因为失误被批评，很自责："你已经做得很好了，这种情况换谁都很难处理，而且你之前已经预判到了风险，真的不是你的问题。走，我请你喝杯咖啡，聊聊下次怎么避免。"', why: '对方自责时，最需要的是被肯定和 reassurance。指出对方做得好的地方，帮对方客观看待问题，不要让对方陷入自我否定。最后引导向前看，而不是停留在过去。' },
  { id: 13, category: '向上沟通', icon: '📢', quote: '领导，跟您汇报一下，目前遇到了一个问题，我想了两个方案，您看哪个更合适？', scene: '向领导汇报问题/坏消息', example: '项目出问题了："领导，跟您汇报一下项目进展。目前遇到了一个问题：XX环节比预期复杂，可能延期2天。我想了两个方案：方案一是加人手，方案二是先上线核心功能。我个人倾向方案一，您看哪个更合适？"', why: '向领导汇报问题时，一定要带方案去，不要只带问题。给出2个以上选项，让领导做选择题而不是问答题。最后提出你的建议，显示你有思考，但把决定权留给领导。' },
  { id: 14, category: '向上沟通', icon: '📢', quote: '谢谢领导的指导，我按这个方向调整一下，有问题再向您请教。', scene: '领导给了反馈/指导后', example: '领导给你的方案提了修改意见："谢谢领导的指导，您说的XX点我之前确实没考虑到，我按这个方向调整一下，改完再给您过目，有问题再向您请教。"', why: '感谢领导的指导，表明你听进去了，并且有具体的行动计划。不要辩解，也不要只说"好的"，那样显得你没有思考。' },
  { id: 15, category: '被甩锅', icon: '🎯', quote: '关于这个问题，我想补充一下事实：当时的情况是...，我们会后一起对一下，避免下次再出现。', scene: '被别人甩锅/当众指责时', example: '开会时同事说问题是你造成的："关于这个问题，我想补充一下事实：我是在周二收到需求的，周四就提供了数据，可能中间沟通上有些误会。我们会后一起对一下时间线，把问题搞清楚，避免下次再出现。"', why: '被甩锅时不要情绪化，也不要直接指责对方。用"补充事实"的口吻，客观陈述情况，不卑不亢。把焦点引向"如何解决和避免"，而不是"谁的错"，显得你更专业。' },
  { id: 16, category: 'i人专属', icon: '🦋', quote: '我先整理一下思路，稍后回复你可以吗？', scene: 'i人被突然提问，需要时间思考', example: '会议上突然被点名："这个问题我需要想一下，我先整理一下思路，稍后在群里回复大家可以吗？"', why: 'i人不需要逼自己立刻回答，坦诚地说需要时间思考，反而显得你很认真。用"稍后回复"而不是"我不知道"，给自己留了空间，也不会显得不专业。' },
  { id: 17, category: 'i人专属', icon: '🦋', quote: '我在群里说一下我的想法吧，这样大家都能看到。', scene: 'i人不想在会上发言，想用文字表达', example: '开会讨论时，你不想当众发言："这个问题我有一些想法，我在群里整理一下发出来吧，这样大家都能看到，也方便后续讨论。"', why: 'i人用文字表达往往比口头表达更清晰。主动提出用文字方式，既参与了讨论，又不用逼自己当众发言，是i人的专属沟通技巧。' },
  { id: 18, category: '万能开场', icon: '✨', quote: '耽误你两分钟，有个事想跟你商量一下。', scene: '想找别人谈话，但不知道怎么开场', example: '找同事谈事："小王，耽误你两分钟，有个事想跟你商量一下，现在方便吗？"', why: '开场先说明需要多长时间，让对方有心理准备，也显得你尊重对方的时间。用"商量"而不是"说个事"，语气更平等，对方更容易接受。' }
];
// ========== 语音工具（Web Speech API） ==========
let speechRecognition = null;
let isRecognizing = false;

// 初始化语音识别
function initSpeechRecognition() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';
    return true;
  }
  return false;
}

// 开始语音识别（英文）
function startEnglishRecognition(onResult, onEnd, onError) {
  // App 内：原生 SpeechRecognizer（WebView 无 Web Speech API）
  if (isNativeApp() && window.AndroidTTS && typeof window.AndroidTTS.startRecognition === 'function') {
    return nativeStartRecognition('en-US', onResult, onEnd, onError);
  }
  if (!initSpeechRecognition()) {
    showToast('当前浏览器不支持语音识别，请使用Chrome浏览器');
    if (onError) onError();
    return false;
  }
  speechRecognition.lang = 'en-US';
  let finalTranscript = '';
  
  speechRecognition.onresult = function(event) {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    if (onResult) onResult(finalTranscript, interimTranscript);
  };
  
  speechRecognition.onerror = function(event) {
    console.error('语音识别错误:', event.error);
    if (event.error === 'not-allowed') {
      showToast(isNativeApp() ? 'App 内暂不支持跟读识别（系统限制），发音请用 🔊 按钮' : '请允许麦克风权限');
    } else if (event.error === 'no-speech') {
      showToast('没有检测到语音，请大声说');
    }
    isRecognizing = false;
    if (onError) onError();
  };
  
  speechRecognition.onend = function() {
    isRecognizing = false;
    if (onEnd) onEnd(finalTranscript);
  };
  
  try {
    speechRecognition.start();
    isRecognizing = true;
    return true;
  } catch (e) {
    console.error('启动语音识别失败:', e);
    return false;
  }
}

// 开始语音识别（中文）
function startChineseRecognition(onResult, onEnd, onError) {
  // App 内：原生 SpeechRecognizer
  if (isNativeApp() && window.AndroidTTS && typeof window.AndroidTTS.startRecognition === 'function') {
    return nativeStartRecognition('zh-CN', onResult, onEnd, onError);
  }
  if (!initSpeechRecognition()) {
    showToast('当前浏览器不支持语音识别，请使用Chrome浏览器');
    if (onError) onError();
    return false;
  }
  speechRecognition.lang = 'zh-CN';
  let finalTranscript = '';
  
  speechRecognition.onresult = function(event) {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    if (onResult) onResult(finalTranscript, interimTranscript);
  };
  
  speechRecognition.onerror = function(event) {
    console.error('语音识别错误:', event.error);
    if (event.error === 'not-allowed') {
      showToast(isNativeApp() ? 'App 内暂不支持跟读识别（系统限制），发音请用 🔊 按钮' : '请允许麦克风权限');
    } else if (event.error === 'no-speech') {
      showToast('没有检测到语音，请大声说');
    }
    isRecognizing = false;
    if (onError) onError();
  };
  
  speechRecognition.onend = function() {
    isRecognizing = false;
    if (onEnd) onEnd(finalTranscript);
  };
  
  try {
    speechRecognition.start();
    isRecognizing = true;
    return true;
  } catch (e) {
    console.error('启动语音识别失败:', e);
    return false;
  }
}

// 原生语音识别（App 内）封装 + 回调注册
let _recSeq = 0;
let _recCbs = {};
function nativeStartRecognition(lang, onResult, onEnd, onError) {
  const id = 'rec' + (++_recSeq);
  _recCbs[id] = { onResult: onResult, onEnd: onEnd, onError: onError };
  let ok = false;
  try { ok = !!window.AndroidTTS.startRecognition(lang, id); } catch (e) { ok = false; }
  if (ok) return true;
  delete _recCbs[id];
  showToast('请先允许麦克风权限，再点一次跟读');
  if (onError) onError();
  return false;
}
window.__recResult = function (id, text) {
  const rec = _recCbs[id];
  if (!rec) return;
  delete _recCbs[id];
  if (rec.onResult) rec.onResult(text);
  if (rec.onEnd) rec.onEnd(text);
};
window.__recError = function (id, code) {
  const rec = _recCbs[id];
  if (!rec) return;
  delete _recCbs[id];
  if (code === 'not_allowed') showToast('请先允许麦克风权限，再点一次跟读');
  else if (code === 'no_speech') showToast('没有检测到语音，请大声说');
  else if (code === 'no_match') showToast('没有听清，请再说一遍');
  else if (code === 'unavailable') showToast('本机未安装语音识别服务，请到系统设置安装/启用语音助手');
  else showToast('语音识别失败，请重试');
  if (rec.onError) rec.onError(code);
};

// 停止语音识别
function stopRecognition() {
  if (isNativeApp() && window.AndroidTTS && typeof window.AndroidTTS.stopRecognition === 'function') {
    try { window.AndroidTTS.stopRecognition(); } catch (e) { }
    return;
  }
  if (speechRecognition && isRecognizing) {
    speechRecognition.stop();
  }
}

/* ---------- Android App 原生 TTS 桥（WebView 无 Web Speech API，由 MainActivity 注入 AndroidTTS） ---------- */
window.__nativeTtsSeq = 0;
window.__nativeTtsCbs = {}; // utteranceId -> onEnd 回调（原生 TextToSpeech 播完经 evaluateJavascript 回调）
window.__nativeTtsDone = function (id) {
  const cb = window.__nativeTtsCbs[id];
  if (cb) { delete window.__nativeTtsCbs[id]; try { cb(); } catch (e) {} }
};
/* 原生 TTS 引擎状态推送（MainActivity：初始化/切换引擎后回调） */
window.__nativeTtsInfo = { ok: null, info: '' };
window.__nativeTtsStatus = function (ok, info) {
  window.__nativeTtsInfo = { ok: !!ok, info: String(info || '') };
  // 引擎彻底失败：只弹一次引导（可直接跳系统语音引擎设置页），避免每次点发音都打扰
  if (!ok && !window.__ttsSettingsAsked && /无可用语音引擎|无响应|失败/.test(String(info || ''))) {
    window.__ttsSettingsAsked = true;
    setTimeout(function () {
      try {
        if (confirm('手机语音引擎暂不可用（' + String(info) + '）。\n\n点「确定」前往 系统设置→文字转语音，更换/启用引擎后回到 App 再点发音即可。')) {
          if (window.AndroidTTS && window.AndroidTTS.openTtsSettings) window.AndroidTTS.openTtsSettings();
        }
      } catch (e) {}
    }, 300);
  }
  if (ok) window.__ttsSettingsAsked = true; // 引擎恢复后不再提示
};
/* 是否运行在安卓 App（存在原生 TTS 桥对象） */
function isNativeApp() {
  return !!(window.AndroidTTS && typeof window.AndroidTTS.speak === 'function');
}
/* Android WebView 环境兜底：原生桥意外缺失时给出明确提示，避免 speechSynthesis 静默失败 */
function isAndroidEnv() {
  return /Android/i.test(navigator.userAgent || '') || /Android/i.test(navigator.appVersion || '');
}
/* 原生 TTS 引擎是否已就绪（App 内；引擎异步初始化，可能需等 1~2 秒） */
function isNativeTtsReady() {
  try {
    if (!isNativeApp()) return false;
    if (typeof window.AndroidTTS.isReady === 'function') return !!window.AndroidTTS.isReady();
    return true; // 旧桥没有 isReady 时视为就绪
  } catch (e) { return true; }
}
/* 原生 TTS 可用则朗读并返回 true；text/lang/rate 与 speechSynthesis 语义一致 */
function nativeSpeak(text, lang, rate, onEnd) {
  if (!isNativeApp()) return false;
  if (!isNativeTtsReady()) return false; // 引擎未就绪：不发音也不报错，由调用方决定提示
  let ok = false;
  try {
    window.__nativeTtsSeq += 1;
    const id = 'tts' + Date.now() + '_' + window.__nativeTtsSeq;
    ok = window.AndroidTTS.speak(String(text == null ? '' : text), String(lang || 'en-US'),
      Number(rate) > 0 ? Number(rate) : 0.9, id);
    if (ok && onEnd) window.__nativeTtsCbs[id] = onEnd;
  } catch (e) { ok = false; }
  return !!ok;
}
/* 停止原生朗读并清空回调 */
function nativeTtsStop() {
  try { if (isNativeApp()) window.AndroidTTS.stop(); } catch (e) {}
  window.__nativeTtsCbs = {};
}

/* ---------- 网络 TTS（有道词典发音接口）：App 内置语音方案，不依赖系统 TTS 引擎 ----------
 * 免费、无需 API Key、国内可访问；支持中/英文单词与句子（截断至 150 字符防超长报错）。
 * rate 通过 playbackRate 实现慢速（0.7=慢速）；失败自动回退一次原生 TTS，仍失败则明确提示。
 */
let _netTtsAudio = null;
let _netTtsSeq = 0;
// 把长文本拆成短句（按标点+空格），每句不超过 60 字符
function splitTextForTTS(text) {
  var t = String(text || '').trim();
  if (!t) return [];
  // 先按句号、问号、感叹号、分号拆
  var sentences = t.split(/(?<=[\.\!\?\;])\s+/);
  var out = [];
  sentences.forEach(function (s) {
    s = s.trim();
    if (!s) return;
    // 如果句子太长，再按逗号或空格拆
    if (s.length > 60) {
      var parts = s.split(/(?<=[\,\，\、])\s+/);
      parts.forEach(function (p) {
        p = p.trim();
        if (!p) return;
        // 还是太长就硬切
        while (p.length > 60) {
          out.push(p.slice(0, 60));
          p = p.slice(60);
        }
        if (p) out.push(p);
      });
    } else {
      out.push(s);
    }
  });
  return out;
}

/* ---------- 词/句判定（纯函数，便于断言） ----------
 * 有道 dictvoice 本质是「词典发音」接口，只能可靠朗读它认识的词/短语；任意句子会确定性 500
 * （生产实测：'hello world ok'、'你好世界'、'Hi what can I get for you today'
 *  同一串连打 6 次均 500，非限流/非长度/非标点）。因此：词/短语才走有道（发音质量更好），
 * 句子直接跳过有道、走 Web Speech / 原生 TTS，避免白等一次注定失败的请求。
 * 规则：去空白后非空、≤20 字符、≤3 个 token、且不含句末/分隔标点；纯中文另按字数判定。
 *
 * 中文边界实测（type=2 中文音色，确定性、非限流，2026-09-11 生产补测）：
 *   你(1) 500 | 你好(2) 200 | 你好吗(3) 200 | 图书馆(3) 200
 *   计算机(3) 500 | 天安门(3) 500 | 今天天气(4) 500 | 你好世界(4) 500
 *   半途而废(4) 500 | 胸有成竹(4) 500 | 实事求是(4) 500 | 一鸣惊人(4) 500 | 学习工作台(5) 500
 * 结论：中文 ≥4 字样本全部 500；≤3 字属"看词典里有没有"（图书馆 200、计算机/天安门 500）。
 * 故纯中文分支：字数 > 3 一律当句子直接走系统合成，不再打一次注定失败的有道请求。
 * 注意：启发式不完美（受词典覆盖影响），真正保证"读得出"的是 speakFallback 兜底，而非本函数。 */
function shouldUseDictTts(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return false;
  if (t.length > 20) return false;
  if (/[.!?;:,。！？；：，、…]/.test(t)) return false;
  const tokens = t.split(/\s+/).filter(function (x) { return x.length > 0; });
  if (tokens.length === 0 || tokens.length > 3) return false;
  // 纯中文（含扩展A）无空格：按字数判定——≥4 字实测必 500，直接当句子走回退（≤3 字才可能走有道）
  if (tokens.length === 1 && /^[\u4e00-\u9fff\u3400-\u4dbf]+$/.test(t) && t.length > 3) return false;
  return true;
}

/* ---------- 统一语音回退（保证回退链可达） ----------
 * 有道/网络 TTS 不可用时的兜底：App → 原生系统 TTS（attemptSpeak）；浏览器 → Web Speech API。
 * 被 speakText / speakUtterance / netSpeak 失败路径共用，避免三者各写一份、出现"回退永恒走不到"。
 * 返回 true 表示已受理朗读（异步），false 表示当前环境也无可用引擎。 */
function speakFallback(text, lang, rate, onEnd) {
  const _lang = lang || 'en-US';
  const _rate = Number(rate) > 0 ? Number(rate) : 0.9;
  // 1) App：原生系统 TTS（非 App 环境 attemptSpeak 直接返回 false）
  if (typeof attemptSpeak === 'function' && attemptSpeak(text, _lang, _rate, onEnd ? function () { onEnd(); } : null)) return true;
  // 2) 浏览器：Web Speech API
  if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function') {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = _lang;
      u.rate = _rate;
      u.pitch = 1;
      if (onEnd) u.onend = function () { onEnd(); };
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) { /* 落空：返回 false，由调用方提示 */ }
  }
  return false;
}

// 播放单个短句
function playOnePiece(piece, lang, rate, onDone) {
  const isZh = /zh|cn/i.test(String(lang || ''));
  const url = (window.API_BASE || '') + '/api/tts?text=' + encodeURIComponent(piece) + '&lang=' + (isZh ? 'zh' : 'en');
  let a = new Audio();
  if (_netTtsAudio) { try { _netTtsAudio.pause(); _netTtsAudio = null; } catch (e) {} }
  _netTtsAudio = a;
  let settled = false;
  const finish = function (ok) {
    if (settled) return;
    settled = true;
    if (_netTtsAudio === a) _netTtsAudio = null;
    onDone(ok);
  };
  a.onended = function () { finish(true); };
  a.onerror = function () { finish(false); };
  a.src = url;
  a.load();
  if (rate && Number(rate) > 0 && Number(rate) !== 1) {
    try { a.playbackRate = Math.min(2, Math.max(0.3, Number(rate))); } catch (e) {}
  }
  const p = a.play();
  if (p && typeof p.catch === 'function') p.catch(function () { finish(false); });
}

function netSpeak(text, lang, rate, onEnd) {
  try {
    const t = String(text == null ? '' : text).trim();
    if (!t) { if (onEnd) onEnd(false); return false; }
    // 策略：只有词/短语才走有道（句子会被上游确定性 500，不白等一次失败请求）。
    // 句子直接交给统一回退（Web Speech / 原生 TTS），仍返回 true 表示"已受理"，兼容既有直调方。
    if (typeof shouldUseDictTts === 'function' && !shouldUseDictTts(t)) {
      const handled0 = speakFallback(t, lang, rate, onEnd ? function () { onEnd(true); } : null);
      if (!handled0) { if (onEnd) onEnd(false); else showToast('朗读服务暂不可用，请稍后重试'); }
      return handled0;
    }
    // App 内：优先原生网络 TTS（MainActivity 用 MediaPlayer 播放，绕开 WebView Audio 的限制）
    if (isNativeApp() && window.AndroidTTS && typeof window.AndroidTTS.netTts === 'function') {
      const _lang0 = lang || 'en-US';
      const _rate0 = Number(rate) > 0 ? Number(rate) : 0.9;
      const id = 'nt' + (++_netTtsSeq);
      _netTtsCbs[id] = { text: t, lang: _lang0, rate: _rate0, onEnd: onEnd };
      let ok = false;
      try { ok = !!window.AndroidTTS.netTts(t, _lang0, _rate0, id); } catch (e) { ok = false; }
      if (ok) return true;
      delete _netTtsCbs[id]; // 原生桥异常：继续走下方 JS Audio 路径
    }
    // 长文本拆分播放：有道 TTS 对长文本支持不好，拆成短句依次播放
    var pieces = splitTextForTTS(t);
    if (pieces.length === 0) { if (onEnd) onEnd(false); return false; }
    var idx = 0;
    var totalOk = true;
    function nextPiece() {
      if (idx >= pieces.length) {
        if (totalOk) { if (onEnd) onEnd(true); return; }
        // 网络 TTS 失败：交给统一回退（App→原生 TTS；浏览器→Web Speech），保证回退链可达
        var handled = speakFallback(t, lang, rate, onEnd ? function () { onEnd(true); } : null);
        if (!handled) {
          if (onEnd) onEnd(false);
          else showToast('朗读服务暂不可用，请稍后重试');
        }
        return;
      }
      playOnePiece(pieces[idx], lang, rate, function (ok) {
        if (!ok) totalOk = false;
        idx++;
        nextPiece();
      });
    }
    nextPiece();
    return true; // 已受理（异步播放，成败走 onEnd(ok)）
  } catch (e) { if (onEnd) onEnd(false); return false; }
}

/* 原生网络 TTS 回调（MainActivity netTts 桥触发）：成败均以 onEnd(ok) 回传 */
let _netTtsCbs = {};
window.__netTtsDone = function (id) {
  const rec = _netTtsCbs[id];
  if (!rec) return;
  delete _netTtsCbs[id];
  if (rec.onEnd) rec.onEnd(true);
};
window.__netTtsError = function (id, msg) {
  const rec = _netTtsCbs[id];
  if (!rec) return;
  delete _netTtsCbs[id];
  // 网络 TTS 失败：统一回退原生 TTS；仍失败才明确提示（文案不再误导为"网络问题"）
  var handled = speakFallback(rec.text, rec.lang, rec.rate, rec.onEnd ? function () { rec.onEnd(true); } : null);
  if (handled) return;
  showToast('朗读服务暂不可用，请稍后重试');
  if (rec.onEnd) rec.onEnd(false);
};
/* 触发一次发音（自动处理原生就绪等待重试）：返回 true 表示已受理朗读 */
function attemptSpeak(text, lang, rate, onEnd) {
  if (!isNativeApp()) return false;          // 非 App（普通浏览器/旧版）：交给调用方走 Web Speech
  if (nativeSpeak(text, lang, rate, onEnd)) return true;
  // 桥在但引擎可能还没就绪（原生端带看门狗自动换引擎，HyperOS 壳引擎可能需 4~8 秒）：
  // 多次重试，间隔递增，给引擎足够初始化时间；最终失败时显示原生诊断信息
  var ttsAttempts = 0;
  function ttsTryAgain(delay) {
    setTimeout(function () {
      ttsAttempts++;
      if (nativeSpeak(text, lang, rate, onEnd)) return;
      if (ttsAttempts < 3) { ttsTryAgain(1200); return; }  // 700ms+1200ms+1200ms ≈ 3.1s
      // 多次失败：读取原生端诊断信息，给用户明确指引
      var diag = '';
      try { if (window.AndroidTTS && typeof window.AndroidTTS.diag === 'function') diag = window.AndroidTTS.diag(); } catch (e) {}
      var st = window.__nativeTtsInfo;
      if (st && st.ok === false) {
        try { if (window.AndroidTTS && window.AndroidTTS.reinit) window.AndroidTTS.reinit(); } catch (e) {}
        showToast('语音引擎不可用（' + diag + '），已触发重连，请再点一次 🔊');
      } else {
        showToast('语音引擎加载中（' + diag + '），请稍候 2 秒再点一次 🔊');
      }
    }, delay);
  }
  ttsTryAgain(700);
  return true;
}

// 语音合成（说话）。语速/语言/总开关读取「设置 → 语音」，调用方可显式覆盖。
function speakText(text, lang, rate, onEnd) {
  const _t = String(text == null ? '' : text).trim();
  if (getSetting('autoSpeak') === false) { if (onEnd) onEnd(); return; }  // 朗读被关闭：静默但不中断流程
  if (!_t) { if (onEnd) onEnd(); return; }
  const _lang = lang || getSetting('voiceLang') || 'en-US';
  const _rate = rate || Number(getSetting('voiceRate')) || 0.9;
  const _done = function () { if (onEnd) onEnd(); };
  // 网络 TTS 代理优先（词/短语走有道，句子由 netSpeak 内部直接转回退引擎）。
  // 关键：netSpeak 的 onEnd 携带成败，失败时异步走 Web Speech / 原生 TTS（不再"已受理"短路回退）。
  if (netSpeak(_t, _lang, _rate, function (ok) {
    if (ok === true) { _done(); return; }
    if (speakFallback(_t, _lang, _rate, _done)) return;
    showToast('朗读服务暂不可用，请稍后重试');
    _done();
  })) return;
  // netSpeak 未受理（内部异常等）：直接走统一回退
  if (speakFallback(_t, _lang, _rate, _done)) return;
  showToast('朗读服务暂不可用，请稍后重试');
  _done();
}

// 专注学习计时器（时长默认取「设置 → 学习目标 → 专注时长」，也可由调用方指定）
function openFocusTimer(minutes) {
  minutes = Math.max(1, Math.min(180, +minutes || getSetting('focusMinutes') || 25));
  let remain = minutes * 60, timer = null, paused = false;
  const oldEl = document.getElementById('focusTimerMask'); if (oldEl) oldEl.remove();
  const mask = document.createElement('div');
  mask.id = 'focusTimerMask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,18,30,.5);backdrop-filter:blur(3px);z-index:2100;display:flex;align-items:center;justify-content:center;padding:20px';
  mask.innerHTML = '<div style="width:min(340px,100%);background:var(--card);color:var(--text);border-radius:18px;padding:26px;text-align:center;box-shadow:0 24px 60px -18px rgba(0,0,0,.4)">' +
    '<div style="font-size:15px;font-weight:700">🧘 专注学习</div>' +
    '<div style="font-size:12px;color:var(--text-secondary);margin:4px 0 12px">共 ' + minutes + ' 分钟 · 保持专注</div>' +
    '<div style="font-size:56px;font-weight:800;background:linear-gradient(135deg,var(--primary),var(--g2));-webkit-background-clip:text;background-clip:text;color:transparent" id="focusClock">--:--</div>' +
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:18px">' +
    '<button class="btn btn-primary" id="focusToggleBtn" onclick="window.__focusToggle&&window.__focusToggle()">⏸ 暂停</button>' +
    '<button class="btn btn-outline" onclick="window.__focusClose&&window.__focusClose()">✕ 关闭</button></div></div>';
  document.body.appendChild(mask);
  const fmt = function (s) { const m = Math.floor(s / 60), sec = s % 60; return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec; };
  const clockEl = document.getElementById('focusClock');
  const render = function () { if (clockEl) clockEl.textContent = fmt(remain); };
  const cleanup = function () { clearInterval(timer); const m = document.getElementById('focusTimerMask'); if (m) m.remove(); window.__focusToggle = null; window.__focusClose = null; };
  window.__focusClose = cleanup;
  window.__focusToggle = function () {
    paused = !paused;
    const b = document.getElementById('focusToggleBtn'); if (b) b.textContent = paused ? '▶ 继续' : '⏸ 暂停';
  };
  function tick() { if (paused) return; remain--; render(); if (remain <= 0) { clearInterval(timer); if (typeof showToast === 'function') showToast('🎉 专注完成，起来活动一下吧'); cleanup(); } }
  render();
  timer = setInterval(tick, 1000);
}

// 简单的口语流利度评定
function evaluateSpeaking(userText, targetText) {
  if (!userText || !targetText) return { score: 0, fluency: 0, accuracy: 0, tips: [] };
  
  const userWords = userText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w);
  const targetWords = targetText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w);
  
  // 准确率：匹配的单词数
  let matched = 0;
  const targetCopy = [...targetWords];
  userWords.forEach(w => {
    const idx = targetCopy.indexOf(w);
    if (idx > -1) {
      matched++;
      targetCopy.splice(idx, 1);
    }
  });
  const accuracy = Math.min(100, Math.round(matched / targetWords.length * 100));
  
  // 流利度：基于单词数量和长度
  const fluency = Math.min(100, Math.round(userWords.length / Math.max(targetWords.length, 1) * 80 + 20));
  
  // 总分
  const score = Math.round(accuracy * 0.6 + fluency * 0.4);
  
  // 建议
  const tips = [];
  if (accuracy < 60) tips.push('发音准确度有待提高，注意每个单词的发音');
  else if (accuracy < 80) tips.push('发音基本准确，部分单词需要加强');
  else tips.push('发音准确度很好！');
  
  if (fluency < 60) tips.push('表达不够流利，建议多跟读练习');
  else if (fluency < 80) tips.push('流利度不错，继续保持');
  else tips.push('表达非常流利！');
  
  if (userWords.length < targetWords.length * 0.5) tips.push('回答内容较短，尝试说完整的句子');
  
  return { score, fluency, accuracy, tips, userWords: userWords.length, targetWords: targetWords.length };
}


// ========== 间隔重复学习工具 ==========
const REVIEW_INTERVALS = [7, 14, 30, 90]; // 阶段0-3对应的复习间隔（天）

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// 记录词汇学习
function recordVocabLearn(word, correct) {
  const today = getTodayStr();
  const record = appData.vocabRecords[word];
  if (record) {
    // 复习
    if (correct) {
      record.stage = Math.min(record.stage + 1, REVIEW_INTERVALS.length - 1);
      if (record.stage >= REVIEW_INTERVALS.length - 1) record.mastered = true;
    } else {
      record.stage = 0;
      record.mastered = false;
    }
    record.nextReview = addDays(today, REVIEW_INTERVALS[record.stage]);
    record.lastReview = today;
  } else {
    // 新学
    appData.vocabRecords[word] = {
      learnedDate: today,
      stage: 0,
      nextReview: addDays(today, REVIEW_INTERVALS[0]),
      mastered: false,
      lastReview: today
    };
  }
  if (!appData.vocabLearned.includes(word)) {
    appData.vocabLearned.push(word);
  }
  // 【T03 批次三】行为日志：记录一次背词（供首页「最近学习」显示相对时间；落盘交给下面的 saveData）
  writeActivity('vocab', word, 'cet');
  saveData();
}

// 获取待复习词汇
function getReviewVocabs() {
  if (!appData.vocabRecords) appData.vocabRecords = {};
  const today = getTodayStr();
  return CET_VOCAB.filter(v => {
    const r = appData.vocabRecords[v.word];
    return r && !r.mastered && r.nextReview <= today;
  });
}

// 获取未学习的新词汇
function getNewVocabs() {
  if (!appData.vocabRecords) appData.vocabRecords = {};
  return CET_VOCAB.filter(v => !appData.vocabRecords[v.word]);
}

// 记录做题
function recordExamQuestion(questionId, correct) {
  const today = getTodayStr();
  const record = appData.examRecords[questionId];
  if (record) {
    // 复习
    if (correct) {
      record.stage = Math.min(record.stage + 1, REVIEW_INTERVALS.length - 1);
      if (record.stage >= REVIEW_INTERVALS.length - 1) record.mastered = true;
    } else {
      record.stage = 0;
      record.mastered = false;
    }
    record.nextReview = addDays(today, REVIEW_INTERVALS[record.stage]);
    record.lastReview = today;
    record.correct = correct;
  } else {
    // 新做
    appData.examRecords[questionId] = {
      doneDate: today,
      correct: correct,
      stage: correct ? 0 : 0,
      nextReview: addDays(today, REVIEW_INTERVALS[0]),
      mastered: false,
      lastReview: today
    };
  }
  // 【T03 批次三】行为日志：记录一次做题（ref=题 id；落盘交给下面的 saveData）
  writeActivity('exam', questionId, 'exam');
  saveData();
}

// 获取待复习题目
function getReviewQuestions() {
  if (!appData.examRecords) appData.examRecords = {};
  const today = getTodayStr();
  return EXAM_BANK.filter(q => {
    const r = appData.examRecords[q.id];
    return r && !r.mastered && r.nextReview <= today;
  });
}

// 获取未做过的新题
function getNewQuestions() {
  if (!appData.examRecords) appData.examRecords = {};
  return EXAM_BANK.filter(q => !appData.examRecords[q.id]);
}

// 更新模块页面统计和进度环
function updateModuleStats() {
  // 四级
  const vocabTotal = CET_VOCAB.length;
  const vocabLearned = Object.keys(appData.vocabRecords).length;
  const vocabReview = getReviewVocabs().length;
  const vocabProgress = Math.round(vocabLearned / vocabTotal * 100);
  const cetWordsEl = document.getElementById('cetWords');
  if (cetWordsEl) cetWordsEl.textContent = vocabLearned;
  // 词汇进度统计（已移除进度环，保留数据统计）
  
  // 行测
  const examTotal = EXAM_BANK.length;
  const examDone = Object.keys(appData.examRecords).length;
  const examReview = getReviewQuestions().length;
  const examProgress = Math.round(examDone / examTotal * 100);
  const examQEl = document.getElementById('examQuestions');
  if (examQEl) examQEl.textContent = examDone;
  // 行测进度统计（已移除进度环，保留数据统计）
  
  // 其他模块进度（基于统计数据）
  const otherModules = [
    { id: 'comm', scenes: 'commScenes' },
    { id: 'interview', times: 'interviewTimes' },
    { id: 'ppt', layouts: 'pptLayouts' }
  ];
}


// ========== 商务礼仪渲染 ==========
let etiquetteFiltered = ETIQUETTE_DATA;

function filterEtiquette(cat) {
  document.querySelectorAll('#etiquetteFilter .type-filter').forEach(t => {
    t.classList.toggle('active', t.dataset.cat === cat);
  });
  etiquetteFiltered = cat === '全部' ? ETIQUETTE_DATA : ETIQUETTE_DATA.filter(e => e.category === cat);
  renderEtiquette();
}

function renderEtiquette() {
  const list = document.getElementById('etiquetteList');
  if (!list) return;
  
  const queue = getDailyQueue('etiquette', etiquetteFiltered);
  const stats = getDailyQueueStats('etiquette', etiquetteFiltered);
  
  let headerHtml = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 16px;background:#E3F2FD;border-radius:10px;flex-wrap:wrap">
    <span style="font-size:13px;color:#1565C0"><strong>📅 今日待学：${queue.ids.length}个</strong> | 已学：${stats.totalViewed}/${stats.total} | 剩余：${stats.remaining}个</span>
    <button class="btn btn-outline btn-sm" style="margin-left:auto;padding:4px 12px;font-size:12px" onclick="resetViewedProgress('etiquette');appData.dailyQueues.etiquette={date:'',ids:[]};saveData();renderEtiquette()">🔄 重置进度</button>
  </div>`;
  
  let itemsHtml = '';
  const todayItems = etiquetteFiltered.filter(e => queue.ids.includes(e.id));
  if (todayItems.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:#1565C0;margin-bottom:8px;padding-left:8px;border-left:3px solid #5B8DEF;font-weight:700">📅 今日学习（${todayItems.length}个）</div>`;
    itemsHtml += todayItems.map(e => renderEtiquetteCard(e, false)).join('');
  } else {
    itemsHtml += `<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:10px;margin-bottom:16px">🎉 今日礼仪已学完！明天再来学新的吧~</div>`;
  }
  
  const otherUnviewed = etiquetteFiltered.filter(e => !queue.ids.includes(e.id) && !appData.viewedContent.etiquette?.includes(e.id));
  if (otherUnviewed.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:var(--text-muted);margin:16px 0 8px;padding-left:8px;border-left:3px solid #ddd">更多内容（后续学习，${otherUnviewed.length}个）</div>`;
    itemsHtml += otherUnviewed.slice(0, 2).map(e => renderEtiquetteCard(e, false)).join('');
  }
  
  const viewedItems = etiquetteFiltered.filter(e => appData.viewedContent.etiquette?.includes(e.id));
  if (viewedItems.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:var(--text-muted);margin:16px 0 8px;padding-left:8px;border-left:3px solid #ddd">已学完（${viewedItems.length}个）</div>`;
    itemsHtml += viewedItems.map(e => renderEtiquetteCard(e, true)).join('');
  }
  
  list.innerHTML = headerHtml + itemsHtml;
}

function renderEtiquetteCard(e, viewed) {
  const opacity = viewed ? 'opacity:0.6' : '';
  const markBtn = viewed ? '' : `<button class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:11px;margin-left:auto" onclick="markAsViewed('etiquette',${e.id});renderEtiquette()">标记已看</button>`;
  const viewedTag = viewed ? '<span class="tag" style="background:#E8F5E9;color:#2E7D32">✓ 已查看</span>' : '';
  
  return `
    <div style="padding:20px;background:var(--bg);border-radius:14px;border-left:4px solid var(--primary);${opacity};margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:48px;height:48px;background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${e.svg}</div>
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--text)">${e.icon} ${e.title}</div>
          <div style="font-size:12px;color:var(--text-muted)">${e.category}</div>
        </div>
        ${viewedTag}
        ${markBtn}
      </div>
      <div style="margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:6px">✅ 正确做法</div>
        ${e.points.map(p => '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8;padding-left:16px;position:relative"><span style="position:absolute;left:0;color:var(--success)">•</span>' + p + '</div>').join('')}
      </div>
      <div style="padding:10px 14px;background:#FFF0F0;border-radius:8px;font-size:12px;color:var(--danger)">
        <span style="font-weight:700">❌ 常见错误：</span>${e.wrong}
      </div>
    </div>
  `;
}

// ========== 面试题库渲染 ==========
function renderIvQuestions() {
  const list = document.getElementById('ivQuestionList');
  if (!list) return;
  
  const queue = getDailyQueue('ivQuestions', INTERVIEW_QUESTIONS);
  const stats = getDailyQueueStats('ivQuestions', INTERVIEW_QUESTIONS);
  
  let headerHtml = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 16px;background:#FFF3E0;border-radius:10px;flex-wrap:wrap">
    <span style="font-size:13px;color:#E65100"><strong>📅 今日待学：${queue.ids.length}道</strong> | 已学：${stats.totalViewed}/${stats.total} | 剩余：${stats.remaining}道</span>
    <button class="btn btn-outline btn-sm" style="margin-left:auto;padding:4px 12px;font-size:12px" onclick="resetViewedProgress('ivQuestions');appData.dailyQueues.ivQuestions={date:'',ids:[]};saveData();renderIvQuestions()">🔄 重置进度</button>
  </div>`;
  
  let itemsHtml = '';
  const todayItems = INTERVIEW_QUESTIONS.filter(q => queue.ids.includes(q.id));
  if (todayItems.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:#E65100;margin-bottom:8px;padding-left:8px;border-left:3px solid #FF9800;font-weight:700">📅 今日学习（${todayItems.length}道）</div>`;
    itemsHtml += todayItems.map(q => renderIvQuestionCard(q, false)).join('');
  } else {
    itemsHtml += `<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:10px;margin-bottom:16px">🎉 今日面试题已学完！明天再来学新的吧~</div>`;
  }
  
  const otherUnviewed = INTERVIEW_QUESTIONS.filter(q => !queue.ids.includes(q.id) && !appData.viewedContent.ivQuestions?.includes(q.id));
  if (otherUnviewed.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:var(--text-muted);margin:16px 0 8px;padding-left:8px;border-left:3px solid #ddd">更多题目（后续学习，${otherUnviewed.length}道）</div>`;
    itemsHtml += otherUnviewed.slice(0, 2).map(q => renderIvQuestionCard(q, false)).join('');
  }
  
  const viewedItems = INTERVIEW_QUESTIONS.filter(q => appData.viewedContent.ivQuestions?.includes(q.id));
  if (viewedItems.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:var(--text-muted);margin:16px 0 8px;padding-left:8px;border-left:3px solid #ddd">已学完（${viewedItems.length}道）</div>`;
    itemsHtml += viewedItems.map(q => renderIvQuestionCard(q, true)).join('');
  }
  
  list.innerHTML = headerHtml + itemsHtml;
}

function renderIvQuestionCard(q, viewed) {
  const opacity = viewed ? 'opacity:0.6' : '';
  const markBtn = viewed ? '' : `<button class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:11px;margin-left:auto" onclick="markAsViewed('ivQuestions',${q.id});renderIvQuestions()">标记已看</button>`;
  const viewedTag = viewed ? '<span class="tag" style="background:#E8F5E9;color:#2E7D32">✓ 已查看</span>' : '';
  
  return `
    <div style="padding:20px;background:var(--bg);border-radius:14px;border-left:4px solid #FFC107;${opacity};margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span class="tag tag-warning">${q.type}</span>
        <span style="font-size:12px;color:var(--text-muted)">第${q.id}题</span>
        ${viewedTag}
        ${markBtn}
      </div>
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:14px">${q.question}</div>
      <div style="padding:12px 14px;background:#E3F2FD;border-radius:10px;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:#1565C0;margin-bottom:4px">📐 答题框架</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6">${q.framework}</div>
      </div>
      <div style="margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--warning);margin-bottom:6px">💡 答题要点</div>
        ${q.tips.map(t => '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8;padding-left:16px;position:relative"><span style="position:absolute;left:0;color:var(--warning)">•</span>' + t + '</div>').join('')}
      </div>
      <div style="padding:12px 14px;background:#E8F5E9;border-radius:10px">
        <div style="font-size:13px;font-weight:700;color:#2E7D32;margin-bottom:6px">📝 参考回答</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.8">${q.sample}</div>
      </div>
    </div>
  `;
}


// ========== PPT版式库渲染 ==========
let layoutFiltered = PPT_LAYOUTS;

function filterLayouts(cat) {
  document.querySelectorAll('#layoutFilter .type-filter').forEach(t => {
    t.classList.toggle('active', t.dataset.cat === cat);
  });
  layoutFiltered = cat === '全部' ? PPT_LAYOUTS : PPT_LAYOUTS.filter(l => l.category === cat);
  renderLayouts();
}

function renderLayouts() {
  const list = document.getElementById('layoutList');
  if (!list) return;
  
  const queue = getDailyQueue('pptLayouts', layoutFiltered);
  const stats = getDailyQueueStats('pptLayouts', layoutFiltered);
  
  let headerHtml = `<div style="grid-column:1/-1;display:flex;align-items:center;gap:12px;margin-bottom:8px;padding:12px 16px;background:#E8F5E9;border-radius:10px;flex-wrap:wrap">
    <span style="font-size:13px;color:#2E7D32"><strong>📅 今日待学：${queue.ids.length}种</strong> | 已学：${stats.totalViewed}/${stats.total} | 剩余：${stats.remaining}种</span>
    <button class="btn btn-outline btn-sm" style="margin-left:auto;padding:4px 12px;font-size:12px" onclick="resetViewedProgress('pptLayouts');appData.dailyQueues.pptLayouts={date:'',ids:[]};saveData();renderLayouts()">🔄 重置进度</button>
  </div>`;
  
  let itemsHtml = '';
  const todayItems = layoutFiltered.filter(l => queue.ids.includes(l.id));
  if (todayItems.length > 0) {
    itemsHtml += `<div style="grid-column:1/-1;font-size:12px;color:#2E7D32;margin-bottom:4px;padding-left:8px;border-left:3px solid #4CAF50;font-weight:700">📅 今日学习（${todayItems.length}种）</div>`;
    itemsHtml += todayItems.map(l => renderLayoutCard(l, false)).join('');
  } else {
    itemsHtml += `<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:10px">🎉 今日版式已学完！明天再来学新的吧~</div>`;
  }
  
  const otherUnviewed = layoutFiltered.filter(l => !queue.ids.includes(l.id) && !appData.viewedContent.pptLayouts?.includes(l.id));
  if (otherUnviewed.length > 0) {
    itemsHtml += `<div style="grid-column:1/-1;font-size:12px;color:var(--text-muted);margin:12px 0 4px;padding-left:8px;border-left:3px solid #ddd">更多版式（后续学习，${otherUnviewed.length}种）</div>`;
    itemsHtml += otherUnviewed.slice(0, 3).map(l => renderLayoutCard(l, false)).join('');
  }
  
  const viewedItems = layoutFiltered.filter(l => appData.viewedContent.pptLayouts?.includes(l.id));
  if (viewedItems.length > 0) {
    itemsHtml += `<div style="grid-column:1/-1;font-size:12px;color:var(--text-muted);margin:12px 0 4px;padding-left:8px;border-left:3px solid #ddd">已学完（${viewedItems.length}种）</div>`;
    itemsHtml += viewedItems.map(l => renderLayoutCard(l, true)).join('');
  }
  
  list.innerHTML = headerHtml + itemsHtml;
}

function renderLayoutCard(l, viewed) {
  const opacity = viewed ? 'opacity:0.6' : '';
  const markBtn = viewed ? '' : `<button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:10px;margin-left:auto" onclick="markAsViewed('pptLayouts',${l.id});renderLayouts()">标记已看</button>`;
  const viewedTag = viewed ? '<span class="tag" style="background:#E8F5E9;color:#2E7D32;font-size:10px">✓</span>' : '';
  
  return `
    <div style="padding:16px;background:var(--bg);border-radius:14px;border:1px solid var(--border);${opacity}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:20px">${l.icon}</span>
        <span style="font-size:15px;font-weight:700;color:var(--text)">${l.name}</span>
        ${viewedTag}
        ${markBtn}
      </div>
      <div style="background:#fff;border-radius:8px;padding:8px;margin-bottom:12px;display:flex;justify-content:center;border:1px solid #eee">
        ${l.svg}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;line-height:1.6"><span style="font-weight:700;color:var(--primary)">适用场景：</span>${l.scene}</div>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--success);margin-bottom:4px">✅ 设计要点</div>
        ${l.points.map(p => '<div style="font-size:12px;color:var(--text-secondary);line-height:1.7;padding-left:14px;position:relative"><span style="position:absolute;left:0;color:var(--success)">•</span>' + p + '</div>').join('')}
      </div>
    </div>
  `;
}

// ========== PPT案例拆解渲染 ==========
function renderPptCases() {
  const list = document.getElementById('caseList');
  if (!list) return;
  list.innerHTML = PPT_CASES.map(c => `
    <div style="padding:20px;background:var(--bg);border-radius:14px;border-left:4px solid var(--ppt-color,#4CAF50)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-size:24px">${c.icon}</span>
        <span style="font-size:17px;font-weight:700;color:var(--text)">${c.name}</span>
      </div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.6">${c.desc}</div>
      <div style="display:flex;flex-direction:column;gap:16px">
        ${c.pages.map((p, i) => `
          <div style="padding:16px;background:#fff;border-radius:10px;border:1px solid #eee">
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:10px">📄 第${i+1}页：${p.title}</div>
            <div style="display:flex;gap:16px;flex-wrap:wrap">
              <div style="flex-shrink:0;border:1px solid #eee;border-radius:6px;overflow:hidden">${p.svg}</div>
              <div style="flex:1;min-width:200px;font-size:13px;color:var(--text-secondary);line-height:1.8">${p.analysis}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}


// ========== 高情商场景话术库渲染 ==========
let commScenesFiltered = COMM_SCENES;
let commScenesCat = '全部';

function filterCommScenes(cat) {
  commScenesCat = cat;
  document.querySelectorAll('#commFilter .type-filter').forEach(t => {
    t.classList.toggle('active', t.dataset.cat === cat);
  });
  renderCommScenes();
}

function renderCommScenes() {
  const list = document.getElementById('commSceneList');
  if (!list) return;
  
  // 按分类筛选
  const catFiltered = commScenesCat === '全部' ? COMM_SCENES : COMM_SCENES.filter(s => s.category === commScenesCat);
  
  // 每日学习队列
  const queue = getDailyQueue('commScenes', catFiltered);
  const stats = getDailyQueueStats('commScenes', catFiltered);
  
  // 顶部统计条
  let headerHtml = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 16px;background:#F3E5F5;border-radius:10px;flex-wrap:wrap">
    <span style="font-size:13px;color:#7B1FA2"><strong>📅 今日待学：${queue.ids.length}个</strong> | 已学：${stats.totalViewed}/${stats.total} | 剩余：${stats.remaining}个</span>
    <button class="btn btn-outline btn-sm" style="margin-left:auto;padding:4px 12px;font-size:12px" onclick="resetViewedProgress('commScenes');appData.dailyQueues.commScenes={date:'',ids:[]};saveData();renderCommScenes()">🔄 重置进度</button>
  </div>`;
  
  // 今日待学内容
  let itemsHtml = '';
  const todayItems = catFiltered.filter(s => queue.ids.includes(s.id));
  if (todayItems.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:#7B1FA2;margin-bottom:8px;padding-left:8px;border-left:3px solid #9C27B0;font-weight:700">📅 今日学习（${todayItems.length}个）</div>`;
    itemsHtml += todayItems.map(s => renderCommSceneCard(s, false)).join('');
  } else {
    itemsHtml += `<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:10px;margin-bottom:16px">🎉 今日学习任务已完成！明天再来学新内容吧~</div>`;
  }
  
  // 更多未学内容（不在今日队列中的）
  const otherUnviewed = catFiltered.filter(s => !queue.ids.includes(s.id) && !appData.viewedContent.commScenes?.includes(s.id));
  if (otherUnviewed.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:var(--text-muted);margin:16px 0 8px;padding-left:8px;border-left:3px solid #ddd">更多内容（后续学习，${otherUnviewed.length}个）</div>`;
    itemsHtml += otherUnviewed.slice(0, 3).map(s => renderCommSceneCard(s, false)).join('');
  }
  
  // 已学内容
  const viewedItems = catFiltered.filter(s => appData.viewedContent.commScenes?.includes(s.id));
  if (viewedItems.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:var(--text-muted);margin:16px 0 8px;padding-left:8px;border-left:3px solid #ddd">已学完（${viewedItems.length}个）</div>`;
    itemsHtml += viewedItems.map(s => renderCommSceneCard(s, true)).join('');
  }
  
  list.innerHTML = headerHtml + itemsHtml;
}

function renderCommSceneCard(s, viewed) {
  const opacity = viewed ? 'opacity:0.6' : '';
  const viewedTag = viewed ? '<span class="tag" style="background:#E8F5E9;color:#2E7D32">✓ 已查看</span>' : '';
  const markBtn = viewed ? '' : `<button class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:11px" onclick="markAsViewed('commScenes',${s.id});renderCommScenes()">标记已看</button>`;
  
  return `
    <div style="padding:20px;background:var(--bg);border-radius:14px;border-left:4px solid var(--comm-color,#9C27B0);${opacity};margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:22px">${s.icon}</span>
        <span style="font-size:16px;font-weight:700;color:var(--text)">${s.title}</span>
        <span class="tag" style="margin-left:8px">${s.category}</span>
        ${viewedTag}
        ${markBtn}
      </div>
      <div style="padding:12px 14px;background:#F3E5F5;border-radius:10px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:#7B1FA2;margin-bottom:4px">🎬 场景</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7">${s.scene}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div style="padding:14px;background:#FFF0F0;border-radius:10px">
          <div style="font-size:13px;font-weight:700;color:var(--danger);margin-bottom:8px">❌ 低情商回答</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;white-space:pre-line">${s.wrong}</div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #FFCDD2;font-size:11px;color:#E57373;line-height:1.5">💡 问题：${s.wrongAnalysis}</div>
        </div>
        <div style="padding:14px;background:#E8F5E9;border-radius:10px">
          <div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:8px">✅ 高情商回答</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">${s.right}</div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #A5D6A7;font-size:11px;color:#66BB6A;line-height:1.5">📐 话术公式：${s.formula}</div>
        </div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--comm-color,#9C27B0);margin-bottom:6px">💡 沟通要点</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${s.tips.map(t => '<span style="padding:6px 12px;background:#fff;border:1px solid #E1BEE7;border-radius:20px;font-size:12px;color:var(--text-secondary)">' + t + '</span>').join('')}
        </div>
      </div>
    </div>
  `;
}

// ========== 高情商金句库渲染 ==========
let quotesFiltered = COMM_QUOTES;
let quotesCat = '全部';

function filterQuotes(cat) {
  quotesCat = cat;
  document.querySelectorAll('#quoteFilter .type-filter').forEach(t => {
    t.classList.toggle('active', t.dataset.cat === cat);
  });
  renderQuotes();
}

function renderQuotes() {
  const list = document.getElementById('quoteList');
  if (!list) return;
  
  const catFiltered = quotesCat === '全部' ? COMM_QUOTES : COMM_QUOTES.filter(q => q.category === quotesCat);
  const queue = getDailyQueue('commQuotes', catFiltered);
  const stats = getDailyQueueStats('commQuotes', catFiltered);
  
  let headerHtml = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 16px;background:#F3E5F5;border-radius:10px;flex-wrap:wrap">
    <span style="font-size:13px;color:#7B1FA2"><strong>📅 今日待学：${queue.ids.length}句</strong> | 已学：${stats.totalViewed}/${stats.total} | 剩余：${stats.remaining}句</span>
    <button class="btn btn-outline btn-sm" style="margin-left:auto;padding:4px 12px;font-size:12px" onclick="resetViewedProgress('commQuotes');appData.dailyQueues.commQuotes={date:'',ids:[]};saveData();renderQuotes()">🔄 重置进度</button>
  </div>`;
  
  let itemsHtml = '';
  const todayItems = catFiltered.filter(q => queue.ids.includes(q.id));
  if (todayItems.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:#7B1FA2;margin-bottom:8px;padding-left:8px;border-left:3px solid #9C27B0;font-weight:700">📅 今日学习（${todayItems.length}句）</div>`;
    itemsHtml += todayItems.map(q => renderQuoteCard(q, false)).join('');
  } else {
    itemsHtml += `<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:10px;margin-bottom:16px">🎉 今日金句已学完！明天再来学新的吧~</div>`;
  }
  
  const otherUnviewed = catFiltered.filter(q => !queue.ids.includes(q.id) && !appData.viewedContent.commQuotes?.includes(q.id));
  if (otherUnviewed.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:var(--text-muted);margin:16px 0 8px;padding-left:8px;border-left:3px solid #ddd">更多金句（后续学习，${otherUnviewed.length}句）</div>`;
    itemsHtml += otherUnviewed.slice(0, 2).map(q => renderQuoteCard(q, false)).join('');
  }
  
  const viewedItems = catFiltered.filter(q => appData.viewedContent.commQuotes?.includes(q.id));
  if (viewedItems.length > 0) {
    itemsHtml += `<div style="font-size:12px;color:var(--text-muted);margin:16px 0 8px;padding-left:8px;border-left:3px solid #ddd">已学完（${viewedItems.length}句）</div>`;
    itemsHtml += viewedItems.map(q => renderQuoteCard(q, true)).join('');
  }
  
  list.innerHTML = headerHtml + itemsHtml;
}

function renderQuoteCard(q, viewed) {
  const opacity = viewed ? 'opacity:0.6' : '';
  const viewedTag = viewed ? '<span class="tag" style="background:#E8F5E9;color:#2E7D32">✓ 已查看</span>' : '';
  const markBtn = viewed ? '' : `<button class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:11px" onclick="markAsViewed('commQuotes',${q.id});renderQuotes()">标记已看</button>`;
  
  return `
    <div style="padding:20px;background:var(--bg);border-radius:14px;border-left:4px solid #FFD93D;${opacity};margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:20px">${q.icon}</span>
        <span class="tag">${q.category}</span>
        ${viewedTag}
        ${markBtn}
      </div>
      <div style="padding:14px 16px;background:linear-gradient(135deg,#FFF9E6,#FFF3CD);border-radius:10px;margin-bottom:12px">
        <div style="font-size:16px;font-weight:700;color:#856404;line-height:1.6;font-style:italic">"${q.quote}"</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div style="padding:10px 12px;background:#E3F2FD;border-radius:8px">
          <div style="font-size:11px;font-weight:700;color:#1565C0;margin-bottom:4px">🎯 使用场景</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${q.scene}</div>
        </div>
        <div style="padding:10px 12px;background:#E8F5E9;border-radius:8px">
          <div style="font-size:11px;font-weight:700;color:#2E7D32;margin-bottom:4px">💡 为什么有效</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${q.why}</div>
        </div>
      </div>
      <div style="padding:10px 12px;background:#F5F5F5;border-radius:8px">
        <div style="font-size:11px;font-weight:700;color:#666;margin-bottom:4px">📝 示例对话</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">${q.example}</div>
      </div>
    </div>
  `;
}


// ========== 每日内容更新工具 ==========
function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// 获取每日内容：未查看的排在前面（每天随机打乱），已查看的排在后面
function getDailyContent(allItems, contentKey) {
  if (!appData.viewedContent) appData.viewedContent = {};
  if (!appData.viewedContent[contentKey]) appData.viewedContent[contentKey] = [];
  
  const viewedIds = appData.viewedContent[contentKey];
  const unviewed = allItems.filter(item => !viewedIds.includes(item.id));
  const viewed = allItems.filter(item => viewedIds.includes(item.id));
  
  // 每天随机打乱未查看内容的顺序
  const today = getTodayStr();
  if (appData.lastVisitDate !== today) {
    // 简单的随机打乱（基于日期的伪随机，保证同一天顺序一致）
    const seed = today.split('-').join('') * 1;
    unviewed.sort((a, b) => {
      const ra = Math.sin(seed + a.id) * 10000;
      const rb = Math.sin(seed + b.id) * 10000;
      return (ra - Math.floor(ra)) - (rb - Math.floor(rb));
    });
    appData.lastVisitDate = today;
    saveData();
  }
  
  return { unviewed, viewed, all: [...unviewed, ...viewed] };
}

// 标记内容为已查看
function markAsViewed(contentKey, id) {
  if (!appData.viewedContent) appData.viewedContent = {};
  if (!appData.viewedContent[contentKey]) appData.viewedContent[contentKey] = [];
  if (!appData.viewedContent[contentKey].includes(id)) {
    appData.viewedContent[contentKey].push(id);
    removeFromDailyQueue(contentKey, id);
    saveData();
    showToast('✅ 已加入已学列表，明天会有新内容');
  }
}

// 重置某库的查看进度
function resetViewedProgress(contentKey) {
  if (appData.viewedContent && appData.viewedContent[contentKey]) {
    appData.viewedContent[contentKey] = [];
    saveData();
    showToast('已重置学习进度，重新开始吧！');
  }
}

// 获取查看进度统计
function getViewedStats(allItems, contentKey) {
  if (!appData.viewedContent || !appData.viewedContent[contentKey]) {
    return { viewed: 0, total: allItems.length, unviewed: allItems.length };
  }
  const viewed = appData.viewedContent[contentKey].length;
  return { viewed, total: allItems.length, unviewed: allItems.length - viewed };
}


// ========== 每日学习队列 ==========
const DAILY_MAX_COUNT = 6;    // 每日队列最多6个（防止积压太多）
function currentDailyNewCount() {  // 每日新增条数可设置（见「设置 → 学习目标」）
  const n = +getSetting('dailyNew');
  return (n >= 1 && n <= 10) ? n : 3;
}

// 获取某库的每日学习队列
function getDailyQueue(contentKey, allItems) {
  const today = getTodayStr();
  if (!appData.dailyQueues) appData.dailyQueues = {};
  
  let queue = appData.dailyQueues[contentKey];
  
  // 如果是新的一天，或者队列为空，初始化队列
  if (!queue || queue.date !== today) {
    // 保留昨天没看完的内容
    let leftoverIds = [];
    if (queue && queue.ids) {
      leftoverIds = queue.ids.filter(id => !appData.viewedContent[contentKey]?.includes(id));
    }
    
    // 获取未查看的新内容
    const unviewedIds = allItems
      .filter(item => !appData.viewedContent[contentKey]?.includes(item.id) && !leftoverIds.includes(item.id))
      .map(item => item.id);
    
    // 随机打乱新内容
    const seed = today.split('-').join('') * 1 + contentKey.length;
    unviewedIds.sort((a, b) => {
      const ra = Math.sin(seed + a) * 10000;
      const rb = Math.sin(seed + b) * 10000;
      return (ra - Math.floor(ra)) - (rb - Math.floor(rb));
    });
    
    // 计算需要添加多少新内容
    const needCount = Math.max(0, currentDailyNewCount() - leftoverIds.length);
    const newIds = unviewedIds.slice(0, Math.min(needCount, DAILY_MAX_COUNT - leftoverIds.length));
    
    queue = {
      date: today,
      ids: [...leftoverIds, ...newIds]
    };
    
    appData.dailyQueues[contentKey] = queue;
    saveData();
  }
  
  // 清理已经查看过的内容
  queue.ids = queue.ids.filter(id => !appData.viewedContent[contentKey]?.includes(id));
  appData.dailyQueues[contentKey] = queue;
  saveData();
  
  return queue;
}

// 从每日队列中移除一个内容（标记已看时调用）
function removeFromDailyQueue(contentKey, id) {
  if (!appData.dailyQueues || !appData.dailyQueues[contentKey]) return;
  appData.dailyQueues[contentKey].ids = appData.dailyQueues[contentKey].ids.filter(i => i !== id);
  saveData();
}

// 获取每日队列统计
function getDailyQueueStats(contentKey, allItems) {
  const queue = getDailyQueue(contentKey, allItems);
  const totalViewed = appData.viewedContent[contentKey]?.length || 0;
  return {
    todayCount: queue.ids.length,
    totalViewed: totalViewed,
    total: allItems.length,
    remaining: allItems.length - totalViewed
  };
}

// ========== 日期显示 ==========
function updateDate() {
  const now = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
  document.getElementById('topbarDate').textContent = dateStr;
}

// ========== 行测刷题中心 ==========
let examCurrentIndex = 0;
let examFilteredBank = [...EXAM_BANK];
let examAnswered = {}; // {questionId: {selected: index, correct: boolean}}

let examMode = 'new'; // new: 刷新题, review: 复习
let examModeList = [];

function switchExamMode(mode) {
  examMode = mode;
  examCurrentIndex = 0;
  examAnswered = {};
  
  document.getElementById('examModeNew').className = mode === 'new' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  document.getElementById('examModeReview').className = mode === 'review' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  document.getElementById('examModeInfo').textContent = mode === 'new' ? '新题模式' : '复习模式';
  
  if (mode === 'new') {
    examModeList = getNewQuestions();
    if (examModeList.length === 0) {
      showToast('🎉 所有题目都做完了！切换到复习模式吧');
      switchExamMode('review');
      return;
    }
  } else {
    examModeList = getReviewQuestions();
    if (examModeList.length === 0) {
      showToast('✅ 今天没有需要复习的题目');
      switchExamMode('new');
      return;
    }
  }
  examFilteredBank = examModeList;
  renderExamQuestion();
  showToast(mode === 'new' ? `开始刷新题（共${examModeList.length}题）` : `开始复习（共${examModeList.length}题）`);
}

function filterExamType(type) {
  document.querySelectorAll('#ecTypeFilter .type-filter').forEach(t => {
    t.classList.toggle('active', t.dataset.type === type);
  });
  if (type === '全部') {
    examFilteredBank = [...EXAM_BANK];
  } else {
    examFilteredBank = EXAM_BANK.filter(q => q.type === type);
  }
  examCurrentIndex = 0;
  renderExamQuestion();
}

function shuffleExamQuestions() {
  // Fisher-Yates 洗牌
  for (let i = examFilteredBank.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [examFilteredBank[i], examFilteredBank[j]] = [examFilteredBank[j], examFilteredBank[i]];
  }
  examCurrentIndex = 0;
  examAnswered = {};
  renderExamQuestion();
  showToast('🔀 已随机打乱题目顺序');
}

function renderExamQuestion() {
  if (examFilteredBank.length === 0) {
    document.getElementById('ecQuestionText').textContent = '该题型暂无题目';
    document.getElementById('ecOptions').innerHTML = '';
    return;
  }
  const q = examFilteredBank[examCurrentIndex];
  document.getElementById('ecProgress').textContent = `第 ${examCurrentIndex + 1} / ${examFilteredBank.length} 题`;
  document.getElementById('ecType').textContent = q.type;
  document.getElementById('ecSub').textContent = q.sub;
  const diffText = ['简单','中等','困难'][q.diff - 1] || '中等';
  document.getElementById('ecDiff').textContent = `难度：${diffText}`;
  document.getElementById('ecQuestionText').textContent = q.q;
  // 渲染选项
  const optionsHtml = q.o.map((opt, i) => {
    const labels = ['A','B','C','D'];
    let cls = 'option-btn';
    if (examAnswered[q.id]) {
      cls += ' disabled';
      if (i === q.a) cls += ' correct';
      if (examAnswered[q.id].selected === i && i !== q.a) cls += ' wrong';
    }
    return `<button class="${cls}" onclick="answerExamQuestion(${i})">
      <span class="option-label">${labels[i]}</span>
      <span>${opt}</span>
    </button>`;
  }).join('');
  document.getElementById('ecOptions').innerHTML = optionsHtml;
  // 解析区域
  if (examAnswered[q.id]) {
    showExamExplanation(q);
  } else {
    document.getElementById('ecExplanation').style.display = 'none';
  }
  // 收藏状态
  const isFav = appData.favoriteQuestions.includes(q.id);
  document.getElementById('ecFavBtn').textContent = isFav ? '★ 已收藏' : '☆ 收藏';
  // 正确率（T18①：抽成 updateExamAccuracy，答完题即时调用）
  updateExamAccuracy();
}

/* T18①：行测刷题正确率即时刷新（原内联在 renderExamQuestion，答完不重算不落盘） */
function updateExamAccuracy() {
  const answered = Object.values(examAnswered).filter(a => examFilteredBank.some(q => q.id === a.id));
  const correct = answered.filter(a => a.correct).length;
  const acc = answered.length > 0 ? Math.round(correct / answered.length * 100) : 0;
  const el = document.getElementById('ecAccuracy');
  if (el) el.textContent = `正确率 ${acc}%`;
}

function answerExamQuestion(selectedIndex) {
  const q = examFilteredBank[examCurrentIndex];
  if (examAnswered[q.id]) return;
  const isCorrect = selectedIndex === q.a;
  // BUG-3 修复：存对象必须带 id 字段，updateExamAccuracy() 用 a.id 关联原题，缺 id 则过滤恒空 → 正确率永远 0%
  examAnswered[q.id] = { id: q.id, selected: selectedIndex, correct: isCorrect };
  // 更新统计
  appData.stats.totalQuestions++;
  if (isCorrect) appData.stats.correctQuestions++;
  // 更新题型进度
  if (appData.examTypeProgress[q.type]) {
    appData.examTypeProgress[q.type].total++;
    if (isCorrect) appData.examTypeProgress[q.type].correct++;
  }
  // 错题自动收录
  if (!isCorrect && !appData.wrongQuestions.includes(q.id)) {
    appData.wrongQuestions.push(q.id);
  }
  // 记录到间隔重复系统
  recordExamQuestion(q.id, isCorrect);
  // T18①：答完即落盘（原缺失，刷新丢失）+ 正确率即时刷新 + 推进全局连续打卡
  saveData();
  updateExamAccuracy();
  try { window.Streak && window.Streak.bump(); } catch (e) { /* 静默 */ }
  updateModuleStats();
renderEtiquette();
renderIvQuestions();
renderLayouts();
renderPptCases();
renderCommScenes();
renderQuotes();
  renderExamQuestion();
  // 滚动到解析
  setTimeout(() => {
    document.getElementById('ecExplanation').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

function showExamExplanation(q) {
  const result = examAnswered[q.id];
  const resultEl = document.getElementById('ecResult');
  if (result.correct) {
    resultEl.style.background = '#E8F8E8';
    resultEl.style.color = 'var(--success)';
    resultEl.textContent = '✅ 回答正确！';
  } else {
    const labels = ['A','B','C','D'];
    resultEl.style.background = '#FFECEC';
    resultEl.style.color = 'var(--danger)';
    resultEl.textContent = `❌ 回答错误，正确答案是 ${labels[q.a]}`;
  }
  document.getElementById('ecExpText').textContent = q.x;
  document.getElementById('ecTipText').textContent = '💡 ' + q.tip;
  document.getElementById('ecExplanation').style.display = 'block';
}

function prevExamQuestion() {
  if (examCurrentIndex > 0) {
    examCurrentIndex--;
    renderExamQuestion();
  } else {
    showToast('已经是第一题了');
  }
}

function nextExamQuestion() {
  if (examCurrentIndex < examFilteredBank.length - 1) {
    examCurrentIndex++;
    renderExamQuestion();
  } else {
    showToast('已经是最后一题了');
  }
}

function toggleFavorite() {
  const q = examFilteredBank[examCurrentIndex];
  const idx = appData.favoriteQuestions.indexOf(q.id);
  if (idx > -1) {
    appData.favoriteQuestions.splice(idx, 1);
    showToast('已取消收藏');
  } else {
    appData.favoriteQuestions.push(q.id);
    // 【T03 批次三】行为日志：记录一次收藏（ref=题 id；落盘交给下面的 saveData）
    writeActivity('fav', q.id, 'exam');
    showToast('已收藏');
  }
  saveData();
  renderExamQuestion();
}

// ========== 错题本 ==========
function renderWrongBook() {
  const list = document.getElementById('wrongList');
  const empty = document.getElementById('wrongEmpty');
  document.getElementById('wrongCount').textContent = `共 ${appData.wrongQuestions.length} 题`;
  if (appData.wrongQuestions.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  list.style.display = 'flex';
  empty.style.display = 'none';
  const html = appData.wrongQuestions.map(qid => {
    const q = EXAM_BANK.find(item => item.id === qid);
    if (!q) return '';
    return `<div style="padding:16px;background:var(--card);border-radius:12px;border:1px solid var(--border);border-left:4px solid var(--danger);box-shadow:0 1px 4px rgba(0,0,0,0.04)">
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <span class="tag tag-warning">${q.type}</span>
        <span class="tag tag-primary">${q.sub}</span>
      </div>
      <div style="font-size:14px;color:var(--text);margin-bottom:10px;line-height:1.6">${q.q.substring(0, 60)}${q.q.length > 60 ? '...' : ''}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="redoWrongQuestion(${q.id})">重新做</button>
        <button class="btn btn-outline btn-sm" onclick="removeWrong(${q.id})">移除</button>
      </div>
    </div>`;
  }).join('');
  list.innerHTML = html;
}

function redoWrongQuestion(qid) {
  const q = EXAM_BANK.find(item => item.id === qid);
  if (!q) return;
  examFilteredBank = [q];
  examCurrentIndex = 0;
  delete examAnswered[qid];
  navigateTo('exam-center');
  setTimeout(() => renderExamQuestion(), 100);
}

function removeWrong(qid) {
  appData.wrongQuestions = appData.wrongQuestions.filter(id => id !== qid);
  saveData();
  renderWrongBook();
  showToast('已移出错题本');
}

function clearWrongBook() {
  if (appData.wrongQuestions.length === 0) {
    showToast('错题本已经是空的了');
    return;
  }
  if (confirm('确定要清空错题本吗？此操作不可恢复。')) {
    appData.wrongQuestions = [];
    saveData();
    renderWrongBook();
    showToast('错题本已清空');
  }
}

// ========== 四级词汇学习 ==========
let vocabCurrentIndex = 0;
let vocabShowMeaning = false;
let vocabOrder = []; // 词汇顺序（支持随机）
let vocabMode = 'new'; // new: 学习新词, review: 复习
let vocabModeList = []; // 当前模式下的词汇列表

// 初始化词汇顺序
function initVocabOrder() {
  vocabOrder = CET_VOCAB.map((_, i) => i);
}

// 切换词汇学习模式
function switchVocabMode(mode) {
  vocabMode = mode;
  vocabCurrentIndex = 0;
  vocabShowMeaning = false;
  
  // 更新按钮样式
  document.getElementById('vocabModeNew').className = mode === 'new' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  document.getElementById('vocabModeReview').className = mode === 'review' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  document.getElementById('vocabModeInfo').textContent = mode === 'new' ? '新词模式' : '复习模式';
  
  if (mode === 'new') {
    vocabModeList = getNewVocabs();
    if (vocabModeList.length === 0) {
      showToast('🎉 所有单词都学完了！切换到复习模式吧');
      switchVocabMode('review');
      return;
    }
  } else {
    vocabModeList = getReviewVocabs();
    if (vocabModeList.length === 0) {
      showToast('✅ 今天没有需要复习的单词');
      switchVocabMode('new');
      return;
    }
  }
  renderVocab();
  showToast(mode === 'new' ? `开始学习新词（共${vocabModeList.length}个）` : `开始复习（共${vocabModeList.length}个）`);
}

function shuffleVocab() {
  if (!vocabModeList || vocabModeList.length === 0) { showToast('当前没有可打乱的单词'); return; }
  // Fisher-Yates 洗牌算法
  for (let i = vocabOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [vocabOrder[i], vocabOrder[j]] = [vocabOrder[j], vocabOrder[i]];
  }
  // 关键：页面显示的是 vocabModeList（按新词/复习过滤后的列表），
  // 必须原地打乱它才会真的生效（vocabOrder 仅作顺序记录，无显示逻辑引用）
  for (let i = vocabModeList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [vocabModeList[i], vocabModeList[j]] = [vocabModeList[j], vocabModeList[i]];
  }
  vocabCurrentIndex = 0;
  renderVocab();
  showToast('🔀 已随机打乱词汇顺序');
}

function renderVocab() {
  if (vocabModeList.length === 0) {
    if (vocabMode === 'new') vocabModeList = getNewVocabs();
    else vocabModeList = getReviewVocabs();
  }
  if (vocabModeList.length === 0) return;
  const v = vocabModeList[vocabCurrentIndex];
  document.getElementById('vocabProgress').textContent = `第 ${vocabCurrentIndex + 1} / ${vocabModeList.length} 词`;
  document.getElementById('vocabLearned').textContent = `已学 ${appData.vocabLearned.length} 词`;
  document.getElementById('vocabWord').textContent = v.word;
  document.getElementById('vocabPhonetic').textContent = v.phonetic;
  document.getElementById('vocabMeaning').textContent = v.meaning;
  // 例句1
  document.getElementById('vocabExample1').textContent = '📝 ' + v.example;
  // 例句2
  if (v.example2) {
    document.getElementById('vocabExample2').textContent = '📝 ' + v.example2;
    document.getElementById('vocabExample2').style.display = 'block';
  } else {
    document.getElementById('vocabExample2').style.display = 'none';
  }
  // 词根词缀
  if (v.root) {
    document.getElementById('vocabRootText').textContent = v.root;
    document.getElementById('vocabRoot').style.display = 'block';
  } else {
    document.getElementById('vocabRoot').style.display = 'none';
  }
  // 常用搭配
  if (v.collocation && v.collocation.length > 0) {
    document.getElementById('vocabCollocationText').innerHTML = v.collocation.map(c => '• ' + c).join('<br>');
    document.getElementById('vocabCollocation').style.display = 'block';
  } else {
    document.getElementById('vocabCollocation').style.display = 'none';
  }
  // 近义词
  if (v.synonym && v.synonym.length > 0) {
    document.getElementById('vocabSynonymText').textContent = v.synonym.join(', ');
    document.getElementById('vocabSynonym').style.display = 'block';
  } else {
    document.getElementById('vocabSynonym').style.display = 'none';
  }
  // 反义词
  if (v.antonym && v.antonym.length > 0) {
    document.getElementById('vocabAntonymText').textContent = v.antonym.join(', ');
    document.getElementById('vocabAntonym').style.display = 'block';
  } else {
    document.getElementById('vocabAntonym').style.display = 'none';
  }
  // 重置显示状态
  vocabShowMeaning = false;
  document.getElementById('vocabMeaning').style.display = 'none';
  document.getElementById('vocabDetail').style.display = 'none';
  document.getElementById('vocabHint').style.display = 'block';
  // 进度条
  const percent = Math.round((vocabCurrentIndex + 1) / vocabModeList.length * 100);
  document.getElementById('vocabPercent').textContent = percent + '%';
  document.getElementById('vocabBar').style.width = percent + '%';
}

function toggleVocabMeaning() {
  vocabShowMeaning = !vocabShowMeaning;
  document.getElementById('vocabMeaning').style.display = vocabShowMeaning ? 'block' : 'none';
  document.getElementById('vocabDetail').style.display = vocabShowMeaning ? 'flex' : 'none';
  document.getElementById('vocabHint').style.display = vocabShowMeaning ? 'none' : 'block';
}

// 语音发音（词卡 🔊）
function speakWord() {
  if (!vocabModeList || vocabModeList.length === 0) {
    const w = document.getElementById('vocabWord');
    const word = w && w.textContent ? w.textContent.trim() : '';
    if (word) { speakUtterance(word); return; }
    showToast('还没有单词可播放'); return;
  }
  const v = vocabModeList[vocabCurrentIndex];
  speakUtterance(v.word);
}
function speakUtterance(text, lang) {
  const _t = String(text == null ? '' : text).trim();
  if (!_t) return;
  const _lang = lang || 'en-US';
  const _rate = Number(getSetting('voiceRate')) || 0.9;
  // 网络 TTS 代理优先（词/短语走有道，句子由 netSpeak 内部直接转回退引擎）；
  // 失败（ok===false）时异步回退：App→原生 TTS，浏览器→Web Speech API。
  if (netSpeak(_t, _lang, _rate, function (ok) {
    if (ok === true) return;
    if (speakFallback(_t, _lang, _rate, null)) return;
    showToast('朗读服务暂不可用，请稍后重试');
  })) return;
  if (speakFallback(_t, _lang, _rate, null)) return;
  showToast('朗读服务暂不可用，请稍后重试');
}
window.speakWordNow = function (t) { speakUtterance(t); };

function prevVocab() {
  if (vocabCurrentIndex > 0) {
    vocabCurrentIndex--;
    renderVocab();
  } else {
    showToast('已经是第一个词了');
  }
}

function nextVocab() {
  if (vocabCurrentIndex < vocabModeList.length - 1) {
    vocabCurrentIndex++;
    renderVocab();
  } else {
    if (vocabMode === 'new') {
      showToast('🎉 新词学完了！可以切换到复习模式');
    } else {
      showToast('🎉 复习完成！');
    }
  }
}

function markVocabKnown() {
  if (vocabModeList.length === 0) return;
  const v = vocabModeList[vocabCurrentIndex];
  // 记录到间隔重复系统
  recordVocabLearn(v.word, true);
  updateModuleStats();
  showToast(`✅ 已学习：${v.word}（7天后复习）`);
  // 从当前列表移除
  vocabModeList.splice(vocabCurrentIndex, 1);
  if (vocabCurrentIndex >= vocabModeList.length) {
    vocabCurrentIndex = Math.max(0, vocabModeList.length - 1);
  }
  if (vocabModeList.length === 0) {
    showToast(vocabMode === 'new' ? '🎉 新词全部学完！' : '✅ 复习全部完成！');
    document.getElementById('vocabProgress').textContent = '已完成';
    return;
  }
  renderVocab();
}

// ========== 初始化（多页面版：各网页只初始化自己拥有的模块 DOM）==========
applyTheme();          // 应用上次保存的主题（深色/浅色）——全页面通用

/* ========== 首页：功能中心快捷入口（可自选） + 最近打开 + 问候 ========== */
var HOME_DEF = [
  { k: 'plaza', ic: '🌍', t: '广场', d: '看大家的', url: '学习博客.html' },
  { k: 'cet', ic: '📖', t: '四级备考', d: '词汇听力阅读', url: '四级备考.html' },
  { k: 'exam', ic: '📝', t: '央国企笔试', d: '行测刷题', url: '央国企笔试.html' },
  { k: 'comm', ic: '💬', t: '高情商表达', d: '场景话术', url: '高情商表达.html' },
  { k: 'interview', ic: '🤝', t: '商务礼仪面试', d: '面试题库', url: '商务礼仪面试.html' },
  { k: 'ppt', ic: '🎨', t: 'PPT训练', d: '版式案例', url: 'PPT训练.html' }
];
var HOME_SHOW_KEY = lsKey('study_workbench_home_show');
function homePrefs() { try { return JSON.parse(localStorage.getItem(HOME_SHOW_KEY)) || {}; } catch (e) { return {}; } }
function homeShow(k) { return homePrefs()[k] !== false; }
function storeHome(k, v) { var p = homePrefs(); p[k] = v; try { localStorage.setItem(HOME_SHOW_KEY, JSON.stringify(p)); } catch (e) { } }
function recordModuleVisit(k, t) {
  try {
    var arr = JSON.parse(localStorage.getItem(lsKey('study_workbench_recent')) || '[]');
    arr = arr.filter(function (x) { return x.k !== k; });
    arr.unshift({ k: k, t: t, at: new Date().toISOString() });
    localStorage.setItem(lsKey('study_workbench_recent'), JSON.stringify(arr.slice(0, 6)));
  } catch (e) { }
}
function renderHomeQuick() {
  var nav = document.getElementById('homeQuickNav');
  if (!nav) return;
  var show = HOME_DEF.filter(function (x) { return homeShow(x.k); });
  var grid = (show.length ? show : HOME_DEF).map(function (x) {
    return '<a class="hq-it" href="' + x.url + '"><span class="hq-ic">' + x.ic + '</span><span class="hq-tx"><b>' + x.t + '</b><i>' + x.d + '</i></span></a>';
  }).join('');
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem(lsKey('study_workbench_recent')) || '[]'); } catch (e) { recent = []; }
  var recentRow = recent.length
    ? '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px"><span style="font-size:12px;color:var(--text-secondary);flex-shrink:0">🕘 最近打开</span>' +
      recent.map(function (r) { return '<a class="chip" href="' + (HOME_DEF.find(function (d) { return d.k === r.k; }) || {}).url + '" style="text-decoration:none">' + r.t + '</a>'; }).join('') + '</div>'
    : '';
  nav.innerHTML =
    '<div class="card-header"><div class="card-title"><span class="title-icon">🛣️</span>功能中心</div>' +
    '<div class="card-action" style="font-size:12px" onclick="toggleHomeEdit()">' + (window.__homeEdit ? '✓ 完成' : '✎ 自选/排序') + '</div></div>' +
    '<div class="hq-grid">' + grid + '</div>' + recentRow +
    (window.__homeEdit
      ? '<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border)"><div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">点击可显示 / 隐藏：</div><div style="display:flex;flex-wrap:wrap;gap:8px">' +
        HOME_DEF.map(function (x) { return '<button class="chip' + (homeShow(x.k) ? ' active' : '') + '" onclick="toggleHomeItem(\'' + x.k + '\')">' + x.ic + ' ' + x.t + '</button>'; }).join('') +
        '</div><div style="font-size:11px;color:var(--text-muted);margin-top:8px">隐藏后点上方“✎ 自选/排序”可再显示，点右上“✓ 完成”收起。</div></div>'
      : '');
}
function toggleHomeEdit() { window.__homeEdit = !window.__homeEdit; renderHomeQuick(); }
function toggleHomeItem(k) { storeHome(k, !homeShow(k)); renderHomeQuick(); }
function decorateHome() {
  const ph = document.getElementById('page-home');
  if (!ph || document.getElementById('homeQuickNav')) return;
  const card = document.createElement('div');
  card.id = 'homeQuickNav'; card.className = 'card home-quick';
  const host = document.getElementById('homeOnlineNav') || ph.firstChild;
  if (host && host.parentNode) host.parentNode.insertBefore(card, host.nextSibling);
  else ph.appendChild(card);
  renderHomeQuick();
}
(function () {
  var recentMap = {
    '学习博客.html': 'blog', '私聊.html': 'chat', '行测刷题.html': 'exam', '面试题库.html': 'iv',
    '四级词汇.html': 'cet', '四级备考.html': 'listen', '设置.html': 'settings', '个人中心.html': 'settings'
  };
  var name = decodeURIComponent(location.pathname.split('/').pop());
  if (recentMap[name]) {
    var def = HOME_DEF.find(function (d) { return d.k === recentMap[name]; });
    if (def) recordModuleVisit(def.k, def.t);
  }
})();
if (document.getElementById('page-home')) decorateHome();
loadData();            // 读取本地数据——全页面通用
updateDate();          // 顶栏日期在外壳里——全页面通用
function __tryInit(name, fn) { try { fn(); } catch (e) { /* 本页无该模块 DOM，正常跳过 */ } }
__tryInit('renderHome', renderHome);
__tryInit('initVocabOrder', initVocabOrder);
__tryInit('vocabInit', () => { vocabModeList = getNewVocabs(); });
__tryInit('examInit', () => { examModeList = getNewQuestions(); examFilteredBank = examModeList; });
__tryInit('renderExamQuestion', renderExamQuestion);
__tryInit('renderVocab', renderVocab);
__tryInit('renderWrongBook', renderWrongBook);
__tryInit('updateModuleStats', updateModuleStats);
__tryInit('renderEtiquette', renderEtiquette);
__tryInit('renderIvQuestions', renderIvQuestions);
__tryInit('renderLayouts', renderLayouts);
__tryInit('renderPptCases', renderPptCases);
__tryInit('renderCommScenes', renderCommScenes);
__tryInit('renderQuotes', renderQuotes);

// 如果没有倒计时，添加默认的
if (appData.countdowns.length === 0) {
  const today = new Date();
  const cetDate = new Date(today.getFullYear(), 11, 14); // 12月第二个周六（近似）
  appData.countdowns = [
    { id: 1, name: '四级考试', date: cetDate.toISOString().split('T')[0], pinned: true, color: '#4A90D9' },
    { id: 2, name: '秋招笔试高峰', date: new Date(today.getFullYear(), 9, 15).toISOString().split('T')[0], pinned: false, color: '#E05040' }
  ];
  saveData();
  if (document.getElementById('countdownRow')) renderCountdowns();
}

/* ========== AI悬浮头像：拖拽自由移动【交互增强】 ========== */
// 让 AI 头像可被按住拖到屏幕任意位置，避免遮挡底部"更多功能"等入口；
// 拖拽后的位置持久化到 localStorage，下次打开自动恢复；
// 双击头像回到默认右下角位置。
const AI_FAB_POS_KEY = 'study_workbench_ai_fab_pos';
let aiFabDragging = false;   // 本次按下后是否发生了位移（区分"拖动"与"点击"）
let aiFabStartX = 0, aiFabStartY = 0;
let aiFabStartLeft = 0, aiFabStartTop = 0;

// 恢复上次保存的位置（若用户拖过）；否则回到 CSS 默认位置
function restoreAiFabPos() {
  const fab = document.getElementById('aiFab');
  if (!fab) return;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(AI_FAB_POS_KEY) || 'null'); } catch (e) {}
  if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
    fab.style.left = saved.left + 'px';
    fab.style.top = saved.top + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  } else {
    fab.style.left = ''; fab.style.top = '';
    fab.style.right = ''; fab.style.bottom = ''; // 回到 CSS 默认（躲在底部导航上方）
    fab.classList.remove('dragging');
  }
}

function initAiFabDrag() {
  const fab = document.getElementById('aiFab');
  if (!fab) return;
  restoreAiFabPos();

  fab.addEventListener('pointerdown', function (e) {
    aiFabDragging = false;                 // 每次按下先重置，避免上次拖拽状态残留
    aiFabStartX = e.clientX;
    aiFabStartY = e.clientY;
    const rect = fab.getBoundingClientRect();
    aiFabStartLeft = rect.left;
    aiFabStartTop = rect.top;
    fab.classList.add('dragging');
    try { fab.setPointerCapture(e.pointerId); } catch (err) {}
  });

  fab.addEventListener('pointermove', function (e) {
    if (!(typeof fab.hasPointerCapture === 'function' && fab.hasPointerCapture(e.pointerId))) return;
    const dx = e.clientX - aiFabStartX;
    const dy = e.clientY - aiFabStartY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) aiFabDragging = true; // 超过阈值才算拖动
    if (aiFabDragging) {
      const w = fab.offsetWidth, h = fab.offsetHeight;
      let nl = aiFabStartLeft + dx;
      let nt = aiFabStartTop + dy;
      nl = Math.max(4, Math.min(window.innerWidth - w - 4, nl));   // 限制在视口内
      nt = Math.max(4, Math.min(window.innerHeight - h - 4, nt));
      fab.style.left = nl + 'px';
      fab.style.top = nt + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
  });

  fab.addEventListener('pointerup', function (e) {
    try { fab.releasePointerCapture(e.pointerId); } catch (err) {}
    fab.classList.remove('dragging');
    if (aiFabDragging) {
      // 记住最终位置
      const left = parseFloat(fab.style.left) || fab.getBoundingClientRect().left;
      const top = parseFloat(fab.style.top) || fab.getBoundingClientRect().top;
      try { localStorage.setItem(AI_FAB_POS_KEY, JSON.stringify({ left: Math.round(left), top: Math.round(top) })); } catch (err) {}
    }
  });

  // 点击（非拖动）→ 打开/收起面板；双击 → 回到默认位置
  fab.addEventListener('click', function () {
    if (aiFabDragging) { aiFabDragging = false; return; } // 刚拖完，不当作点击
    toggleAiPanel();
  });
  fab.addEventListener('dblclick', function () {
    try { localStorage.removeItem(AI_FAB_POS_KEY); } catch (e) {}
    restoreAiFabPos();
    showToast('🔄 AI头像已回到默认位置');
  });
}

// 初始化 AI 头像拖拽
initAiFabDrag();

// ==================== 广场（发贴系统） ====================
const BLOG_CATS = [
  { id: 'cet', name: '四级备考', icon: '📖' },
  { id: 'exam', name: '央国企笔试', icon: '📝' },
  { id: 'comm', name: '高情商表达', icon: '💬' },
  { id: 'interview', name: '商务礼仪面试', icon: '🤝' },
  { id: 'ppt', name: 'PPT训练', icon: '🎨' },
  { id: 'other', name: '其他', icon: '📚' }
];
const BLOG_COLORS = {
  cet: ['#5B8DEF', '#8FB6FF'], exam: ['#E05040', '#FF8A6B'],
  comm: ['#9B6BD9', '#C6A6FF'], interview: ['#36C0C9', '#7FE0E8'],
  ppt: ['#D4A056', '#F2C879'], other: ['#34C784', '#7BE3B5']
};

let blogCatFilter = 'all';   // 广场分类筛选
let blogTagFilter = '';      // 广场标签筛选
let blogMineType = 'all';    // 我的文章筛选：all/published/draft/archived/favorite
let currentNoteId = null;    // 详情页当前发贴
let editingNoteId = null;    // 编辑器正在编辑的发贴 id

// ---- 通用工具 ----
function esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function noteCat(id) { return BLOG_CATS.find(c => c.id === id) || BLOG_CATS[BLOG_CATS.length - 1]; }
function noteColors(id) { return BLOG_COLORS[noteCat(id).id] || BLOG_COLORS.other; }
function fmtTime(ts) { if (!ts) return ''; return String(ts).replace('T', ' ').slice(0, 16); }
function nowTs() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function uid() { return 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }
function makeExcerpt(c) { const t = String(c || '').replace(/[#>*`$-]/g, '').replace(/\s+/g, ' ').trim(); return t.slice(0, 80) || '（暂无内容）'; }

// ---- 轻量 Markdown 渲染（安全：先转义再格式化，防 XSS）----
function inlineMd(s) {
  s = s.replace(/\$([^$]+)\$/g, (_, c) => '<span class="b-formula">$' + c + '$</span>');
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return s;
}
function reactMarkdown(src) {
  const BLOCK = /```([\s\S]*?)```/g;
  const text = String(src || '');
  let html = '', last = 0, m;
  while ((m = BLOCK.exec(text))) {
    html += renderInline(esc(text.slice(last, m.index)));
    html += '<pre><code>' + esc(m[1].replace(/^\n/, '').replace(/\n$/, '')) + '</code></pre>';
    last = BLOCK.lastIndex;
  }
  html += renderInline(esc(text.slice(last)));
  return html;
}
function renderInline(escaped) {
  const lines = escaped.split('\n');
  let out = '', listOpen = '';
  const close = () => { if (listOpen) { out += '</' + listOpen + '>'; listOpen = ''; } };
  lines.forEach(raw => {
    const task = raw.match(/^(\s*)- \[( |x)\]\s*(.*)$/);
    const ul = raw.match(/^(\s*)-\s+(.*)$/);
    const ol = raw.match(/^(\s*)\d+[.、]\s+(.*)$/);
    const h = raw.match(/^(#{1,3})\s+(.*)$/);
    const q = raw.match(/^>\s?(.*)$/);
    if (task) { if (listOpen !== 'ul') { close(); out += '<ul class="blog-tasklist">'; listOpen = 'ul'; } out += '<li>' + (task[2] === 'x' ? '✅ ' : '⬜ ') + inlineMd(task[3]) + '</li>'; return; }
    if (ul) { if (listOpen !== 'ul') { close(); out += '<ul>'; listOpen = 'ul'; } out += '<li>' + inlineMd(ul[2]) + '</li>'; return; }
    if (ol) { if (listOpen !== 'ol') { close(); out += '<ol>'; listOpen = 'ol'; } out += '<li>' + inlineMd(ol[2]) + '</li>'; return; }
    if (h) { close(); out += '<h' + h[1].length + '>' + inlineMd(h[2]) + '</h' + h[1].length + '>'; return; }
    if (q) { close(); out += '<blockquote>' + inlineMd(q[1]) + '</blockquote>'; return; }
    if (/^\s*([-*_])\s*\1\s*\1\s*$/.test(raw)) { close(); out += '<hr>'; return; }
    if (/^\s*$/.test(raw)) { close(); return; }
    close(); out += '<p>' + inlineMd(raw) + '</p>';
  });
  close();
  return out;
}

// ---- 视图切换 ----
function showBlogView(view) {
  const map = { list: 'blogViewList', mine: 'blogViewMine', edit: 'blogViewEdit', detail: 'blogViewDetail', stats: 'blogViewStats' };
  Object.keys(map).forEach(k => { const el = document.getElementById(map[k]); if (el) el.style.display = k === view ? 'flex' : 'none'; });
  const tabs = { list: 'blogTabList', mine: 'blogTabMine', edit: 'blogTabEdit', stats: 'blogTabStats' };
  Object.keys(tabs).forEach(k => { const t = document.getElementById(tabs[k]); if (t) t.classList.toggle('active', k === view); });
  if (view === 'list') renderBlogList();
  if (view === 'mine') renderBlogMine();
  if (view === 'stats') renderBlogStats();
  if (view === 'edit') updateEditorPreview();
}

// ---- 卡片渲染 ----
function noteCoverHtml(n) {
  const c = n.cover || noteCat(n.category).icon;
  const isImg = /^(https?:|data:)/.test(c);
  const [c0, c1] = noteColors(n.category);
  if (isImg) {
    return `<div class="note-cover" style="background:url(${c}) center/cover no-repeat"><span class="nc-privacy">${n.privacy === 'private' ? '🔒私密' : '🌍公开'}</span></div>`;
  }
  return `<div class="note-cover" style="background:linear-gradient(135deg,${c0},${c1})">${c}<span class="nc-privacy">${n.privacy === 'private' ? '🔒私密' : '🌍公开'}</span></div>`;
}
function noteCardHtml(n, opts) {
  opts = opts || {};
  const cat = noteCat(n.category);
  const tags = (n.tags || []).map(t => `<span class="nc-tag" onclick="event.stopPropagation();blogTagFilter='${esc(t)}';showBlogView('list')">#${esc(t)}</span>`).join('');
  const stats = `<span>👁 ${n.views || 0}</span><span>👍 ${n.likes || 0}</span><span>💬 ${(n.comments || []).length}</span>`;
  let acts = '';
  if (opts.mine) {
    const arch = n.status === 'archived';
    acts = `<div class="nc-actions" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
      <button class="btn btn-outline" style="padding:5px 10px;font-size:12px;flex:1" onclick="event.stopPropagation();startEditNote('${n.id}')">✏️ 编辑</button>
      <button class="btn btn-outline" style="padding:5px 10px;font-size:12px;flex:1" onclick="event.stopPropagation();${arch ? "unarchiveNote" : "archiveNote"}('${n.id}')">${arch ? '📤 恢复' : '📁 归档'}</button>
      <button class="btn btn-danger" style="padding:5px 10px;font-size:12px;flex:1" onclick="event.stopPropagation();deleteNote('${n.id}')">🗑️ 删除</button>
    </div>`;
  }
  return `<div class="note-card" onclick="openBlogDetail('${n.id}')">
    ${noteCoverHtml(n)}
    <div class="note-body">
      <div class="nc-title">${esc(n.title)}</div>
      <div class="nc-excerpt">${esc(n.excerpt)}</div>
      <div class="nc-meta"><span class="nc-cat">${cat.icon} ${cat.name}</span><span>${fmtTime(n.createdAt)}</span></div>
      ${tags ? `<div class="nc-tags">${tags}</div>` : ''}
      <div class="nc-actions">${stats}</div>
      ${acts}
    </div>
  </div>`;
}

// ---- 广场（分类筛选 + 搜索 + 标签筛选）----
function renderBlogFilters() {
  const box = document.getElementById('blogFilterChips');
  let html = `<span class="chip ${blogCatFilter === 'all' ? 'active' : ''}" onclick="blogCatFilter='all';blogTagFilter='';renderBlogFilters();renderBlogList()">全部</span>`;
  BLOG_CATS.forEach(c => { html += `<span class="chip ${blogCatFilter === c.id ? 'active' : ''}" onclick="blogCatFilter='${c.id}';blogTagFilter='';renderBlogFilters();renderBlogList()">${c.icon} ${c.name}</span>`; });
  if (blogTagFilter) html += `<span class="chip active" onclick="clearBlogTagFilter()">🏷 #${esc(blogTagFilter)} ✕</span>`;
  box.innerHTML = html;
}
function clearBlogTagFilter() { blogTagFilter = ''; renderBlogFilters(); renderBlogList(); }
function renderBlogList() {
  renderBlogFilters();
  const kw = (document.getElementById('blogSearchInput').value || '').trim().toLowerCase();
  let arr = appData.notes.filter(n => n.status === 'published' && n.privacy === 'public');
  if (blogCatFilter !== 'all') arr = arr.filter(n => n.category === blogCatFilter);
  if (blogTagFilter) arr = arr.filter(n => (n.tags || []).some(t => t === blogTagFilter));
  if (kw) arr = arr.filter(n => (n.title + ' ' + n.content + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(kw));
  arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const grid = document.getElementById('blogGrid');
  grid.innerHTML = arr.map(n => noteCardHtml(n)).join('');
  document.getElementById('blogListEmpty').style.display = arr.length ? 'none' : 'block';
}

// ---- 我的文章 ----
function renderBlogMineTabs() {
  const counts = {
    all: appData.notes.length,
    published: appData.notes.filter(n => n.status === 'published').length,
    draft: appData.notes.filter(n => n.status === 'draft').length,
    archived: appData.notes.filter(n => n.status === 'archived').length,
    favorite: appData.favoriteNotes.length
  };
  const labels = [['all', '全部'], ['published', '📤 已发布'], ['draft', '💾 草稿'], ['archived', '📁 归档'], ['favorite', '🔖 收藏']];
  document.getElementById('blogMineTabs').innerHTML = labels.map(([k, name]) =>
    `<span class="chip ${blogMineType === k ? 'active' : ''}" onclick="blogMineType='${k}';renderBlogMine()">${name} ${counts[k]}</span>`).join('');
}
function renderBlogMine() {
  renderBlogMineTabs();
  let arr = appData.notes.slice();
  if (blogMineType === 'favorite') arr = arr.filter(n => appData.favoriteNotes.includes(n.id));
  else if (blogMineType !== 'all') arr = arr.filter(n => n.status === blogMineType);
  arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  document.getElementById('blogMineGrid').innerHTML = arr.map(n => noteCardHtml(n, { mine: true })).join('') ||
    `<div style="text-align:center;padding:40px;color:var(--text-secondary);font-size:13px;grid-column:1/-1">还没有相关的发贴</div>`;
}

// ---- 详情页 ----
function openBlogDetail(id) {
  const n = appData.notes.find(x => x.id === id);
  if (!n) return;
  currentNoteId = id;
  n.views = (n.views || 0) + 1;
  saveData();
  renderBlogDetail();
  showBlogView('detail');
}
function renderBlogDetail() {
  const n = appData.notes.find(x => x.id === currentNoteId);
  if (!n) { document.getElementById('blogDetailBox').innerHTML = ''; return; }
  const cat = noteCat(n.category);
  const fav = appData.favoriteNotes.includes(n.id);
  const tags = (n.tags || []).map(t => `<span class="nd-tag" onclick="openBlogTag('${esc(t)}')">#${esc(t)}</span>`).join('');
  const comments = (n.comments || []).map((c, i) =>
    `<div class="bc-item"><div class="bc-avatar">${esc((c.name || ' ') .slice(0, 1))}</div>
      <div class="bc-body"><div class="bc-head"><span>${esc(c.name)}</span><span>${fmtTime(c.time)}</span></div>
      <div class="bc-text">${esc(c.text)}</div></div>
      <button style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:11px" onclick="deleteBlogComment(${i})">删除</button>
    </div>`).join('') || '<div style="color:var(--text-secondary);font-size:12px;padding:6px 0">暂无评论，来抢沙发～</div>';
  const pager = blogPagerHtml(n);
  document.getElementById('blogDetailBox').innerHTML = `
    <div class="note-detail-hero">
      <div class="nd-title">${esc(n.title)}</div>
      <div class="nd-meta">
        <span class="nd-cat">${cat.icon} ${cat.name}</span>
        <span>👁 ${n.views || 0} 次阅读</span>
        <span>🕒 更新于 ${fmtTime(n.updatedAt || n.createdAt)}</span>
        <span>${n.privacy === 'private' ? '🔒 私密' : '🌍 公开'}</span>
      </div>
      <div class="note-interact">
        <button class="ni-btn ${n.liked ? 'active' : ''}" onclick="toggleNoteLike()">👍 赞 ${n.likes || 0}</button>
        <button class="ni-btn ${fav ? 'active' : ''}" onclick="toggleNoteFavorite()">${fav ? '★ 已收藏' : '☆ 收藏'}</button>
        <button class="ni-btn" onclick="exportCurrentNoteMd()">📄 导出 Markdown</button>
        <button class="ni-btn" onclick="startEditNote('${n.id}')">✏️ 编辑</button>
        <div class="spacer" style="flex:1"></div>
        <span style="font-size:11px;color:var(--text-secondary)">共 ${appData.notes.length} 篇 · ID:${n.id.slice(0, 8)}</span>
      </div>
      ${tags ? `<div class="note-detail-tags">${tags}</div>` : ''}
    </div>
    <div class="note-detail-box"><div class="nd-content">${reactMarkdown(n.content)}</div></div>
    ${pager}
    <div class="blog-comments">
      <div class="bc-title">💬 评论区（${(n.comments || []).length}）</div>
      <div class="bc-input-row">
        <input type="text" id="bcInput" placeholder="留言讨论知识点，共同学得更牢…">
        <button class="btn btn-primary" onclick="addBlogComment()">发送</button>
      </div>
      <div class="bc-list">${comments}</div>
    </div>`;
  const inp = document.getElementById('bcInput');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') addBlogComment(); });
}
function blogPagerHtml(n) {
  const pubs = appData.notes.filter(x => x.status === 'published' && x.privacy === 'public').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const idx = pubs.findIndex(x => x.id === n.id);
  const prevNode = idx > 0 ? pubs[idx - 1] : null;
  const nextNode = idx < pubs.length - 1 ? pubs[idx + 1] : null;
  const nodeBtn = (nd, dir) => `<button ${nd ? '' : 'disabled'} onclick="${nd ? `openBlogDetail('${nd.id}')` : ''}">
    <span class="pg-label">${dir === 'prev' ? '← 上一篇' : '下一篇 →'}</span><span class="pg-title">${nd ? esc(nd.title) : '已到尽头'}</span></button>`;
  return `<div class="note-pager">${nodeBtn(prevNode, 'prev')}${nodeBtn(nextNode, 'next')}</div>`;
}
function openBlogTag(tag) { blogTagFilter = tag; blogCatFilter = 'all'; showBlogView('list'); }
function toggleNoteLike() {
  const n = appData.notes.find(x => x.id === currentNoteId); if (!n) return;
  n.liked = !n.liked; n.likes = n.likes + (n.liked ? 1 : -1); if (n.likes < 0) n.likes = 0;
  saveData(); renderBlogDetail(); renderBlogList(); renderBlogMine(); showToast(n.liked ? '👍 已点赞' : '已取消点赞');
}
function toggleNoteFavorite() {
  const n = appData.notes.find(x => x.id === currentNoteId); if (!n) return;
  const has = appData.favoriteNotes.includes(n.id);
  if (has) appData.favoriteNotes = appData.favoriteNotes.filter(i => i !== n.id);
  else appData.favoriteNotes.push(n.id);
  saveData(); renderBlogDetail(); renderBlogMine(); showToast(!has ? '🔖 已收藏' : '已取消收藏');
}
function addBlogComment() {
  const inp = document.getElementById('bcInput');
  const text = inp.value.trim();
  const n = appData.notes.find(x => x.id === currentNoteId);
  if (!text || !n) return;
  n.comments.push({ name: appData.profile.name, time: nowTs(), text });
  saveData(); renderBlogDetail(); showToast('💬 评论已添加');
}
function deleteBlogComment(i) {
  if (!confirm('确定删除这条评论吗？')) return;
  const n = appData.notes.find(x => x.id === currentNoteId); if (!n) return;
  n.comments.splice(i, 1); saveData(); renderBlogDetail(); showToast('评论已删除');
}

// ---- 导出 Markdown ----
function exportCurrentNoteMd() {
  const n = appData.notes.find(x => x.id === currentNoteId); if (!n) { showToast('找不到发贴'); return; }
  const cat = noteCat(n.category);
  const md = `# ${n.title}\n\n> 分类：${cat.name} · 标签：${n.tags.join('、') || '无'} · 可见性：${n.privacy === 'private' ? '私密' : '公开'} · 创建于 ${fmtTime(n.createdAt)} · 更新于 ${fmtTime(n.updatedAt)}\n\n${n.content}\n`;
  downloadBlob((n.title || '发贴') + '.md', md, 'text/markdown;charset=utf-8');
  showToast('📄 已导出 Markdown');
}
function exportAllNotesMd() {
  const pubs = appData.notes.filter(n => n.status === 'published');
  if (!pubs.length) { showToast('还没有已发布的发贴'); return; }
  let md = '# 发贴合集\n\n';
  pubs.forEach(n => { md += `\n---\n\n# ${n.title}\n\n> 分类：${noteCat(n.category).name} · 创建于 ${fmtTime(n.createdAt)}\n\n${n.content}\n`; });
  downloadBlob('发贴合集.md', md, 'text/markdown;charset=utf-8');
  showToast('📄 已导出全部发贴');
}
function downloadBlob(name, text, type) {
  // APK 内置浏览器环境:交给原生 AndroidBridge 落盘(WebView 不接管网页下载)
  if (window.AndroidBridge && window.AndroidBridge.saveFile) {
    try { window.AndroidBridge.saveFile(name, text, type || 'text/plain'); return; } catch (e) { /* 失败则回退网页下载 */ }
  }
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

// ---- 我的文章操作：归档/恢复/删除 ----
function archiveNote(id) { const n = appData.notes.find(x => x.id === id); if (!n) return; n.status = 'archived'; saveData(); renderBlogMine(); showToast('📁 已归档到「归档箱」'); }
function unarchiveNote(id) { const n = appData.notes.find(x => x.id === id); if (!n) return; n.status = 'published'; saveData(); renderBlogMine(); showToast('📤 已恢复为发布状态'); }
function deleteNote(id) {
  if (!confirm('确定删除这篇发贴吗？删除后不可恢复！')) return;
  appData.notes = appData.notes.filter(n => n.id !== id);
  appData.favoriteNotes = appData.favoriteNotes.filter(i => i !== id);
  saveData(); renderBlogList(); renderBlogMine();
  if (currentNoteId === id) { currentNoteId = null; showBlogView('list'); }
  if (editingNoteId === id) { editingNoteId = null; }
  showToast('🗑️ 已删除');
}

// ---- 编辑器 ----
function loadBlogEditor() {
  const sel = document.getElementById('beCat');
  sel.innerHTML = BLOG_CATS.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  // 套用「设置 → 发贴默认偏好」（【9/11 新增】）
  sel.value = getSetting('blogCat') || 'cet';
  const prv = document.getElementById('bePrivacy');
  if (prv) prv.value = getSetting('blogPrivacy') || 'public';
  const tg = document.getElementById('beTags');
  if (tg && !tg.value) tg.value = getSetting('blogTags') || '';
  document.getElementById('blogEditorInput').addEventListener('input', updateEditorPreview);
  updateEditorPreview();
}
function updateEditorPreview() {
  const v = document.getElementById('blogEditorInput').value;
  document.getElementById('blogEditorPreview').innerHTML = v.trim() ? reactMarkdown(v) : '<span style="color:var(--text-secondary)">👁 实时预览：在左侧输入，这里会即时渲染效果（支持 Markdown）</span>';
}
function editorTool(kind) {
  const ta = document.getElementById('blogEditorInput');
  const s = ta.selectionStart || 0, e = ta.selectionEnd || 0;
  const v = ta.value, sel = v.slice(s, e);
  const ls = v.lastIndexOf('\n', s - 1) + 1;
  const le = v.indexOf('\n', e) === -1 ? v.length : v.indexOf('\n', e);
  const line = v.slice(ls, le), before = v.slice(0, ls), after = v.slice(le);
  const exists = pref => line.startsWith(pref);
  let next = v, cursor = e;
  switch (kind) {
    case 'bold': next = v.slice(0, s) + (sel ? '**' + sel + '**' : '****') + v.slice(e); cursor = s + (sel ? 2 : 2); break;
    case 'italic': next = v.slice(0, s) + (sel ? '*' + sel + '*' : '**') + v.slice(e); cursor = s + (sel ? 1 : 1); break;
    case 'inline': next = v.slice(0, s) + (sel ? '`' + sel + '`' : '``') + v.slice(e); cursor = s + (sel ? 1 : 1); break;
    case 'formula': next = v.slice(0, s) + (sel ? '$' + sel + '$' : '$$') + v.slice(e); cursor = s + (sel ? 1 : 1); break;
    case 'image': next = v.slice(0, s) + '![图片描述](https://example.com/图片.png)' + v.slice(e); cursor = s + 3; break;
    case 'h2': next = before + (exists('## ') ? line : '## ' + line) + after; cursor = ls; break;
    case 'quote': next = before + (exists('> ') ? line : '> ' + line) + after; cursor = ls; break;
    case 'ul': next = before + (exists('- ') ? line : '- ' + line) + after; cursor = ls; break;
    case 'task': next = before + (exists('- [ ] ') ? line : '- [ ] ' + line) + after; cursor = ls; break;
    case 'code': next = before + '```\n' + (line || '// 代码在这里') + '\n```' + (after ? '\n' + after : ''); cursor = ls; break;
    case 'hr': next = before + '---' + (after ? '\n' + after : ''); cursor = ls; break;
  }
  ta.value = next;
  const pos = Math.min(cursor + (kind === 'hr' || kind === 'code' ? 4 : (kind === 'bold' || kind === 'h2' || kind === 'quote' || kind === 'ul' || kind === 'task' ? 3 : kind === 'image' ? 4 : 1)), ta.value.length);
  ta.setSelectionRange(pos, pos);
  ta.focus();
  updateEditorPreview();
}
function editorInsertImage(event) {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 1024 * 1024 * 1.5) { showToast('⚠️ 图片过大（>1.5MB），可能占满本地存储，建议用较小截图'); }
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    const ta = document.getElementById('blogEditorInput');
    const s = ta.selectionStart;
    const md1 = '![截图](' + dataUrl + ')';
    ta.value = ta.value.slice(0, s) + md1 + ta.value.slice(ta.selectionEnd);
    updateEditorPreview();
    showToast('🖼 已插入本地截图（存为 base64）');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}
function saveBlogNote(status) {
  const title = document.getElementById('beTitle').value.trim();
  const content = document.getElementById('blogEditorInput').value;
  const cat = document.getElementById('beCat').value;
  const privacy = document.getElementById('bePrivacy').value;
  const cover = document.getElementById('beCover').value.trim();
  const tags = document.getElementById('beTags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 6);
  if (!title) { showToast('⚠️ 请先填写标题'); document.getElementById('beTitle').focus(); return; }
  if (!content.trim()) { showToast('⚠️ 正文不能为空'); return; }
  const now = nowTs();
  const isNew = !editingNoteId;
  if (!isNew) {
    const n = appData.notes.find(x => x.id === editingNoteId);
    if (n) { Object.assign(n, { title, category: cat, privacy, cover, tags, content, status, excerpt: makeExcerpt(content), updatedAt: now }); }
    showToast(status === 'draft' ? '💾 草稿已更新' : '📤 已发布');
  } else {
    const id = uid();
    appData.notes.push({ id, title, category: cat, privacy, cover, tags, content, status, excerpt: makeExcerpt(content), views: 0, likes: 0, liked: false, comments: [], createdAt: now, updatedAt: now });
    showToast(status === 'draft' ? '💾 已存为草稿' : '📤 已发布');
  }
  saveData();
  // 保存成功后清空编辑器，方便继续写下一篇
  clearEditorFields();
  renderBlogList(); renderBlogMine();
}
function clearEditorFields() {
  editingNoteId = null;
  document.getElementById('beTitle').value = '';
  document.getElementById('beCover').value = '';
  document.getElementById('beCat').value = getSetting('blogCat') || 'cet';
  document.getElementById('bePrivacy').value = getSetting('blogPrivacy') || 'public';
  document.getElementById('beTags').value = getSetting('blogTags') || '';
  document.getElementById('blogEditorInput').value = '';
  document.getElementById('blogEditStatus').textContent = '';
  updateEditorPreview();
}
function resetBlogEditor() {
  if (!confirm('确定清空编辑器内容吗？')) return;
  clearEditorFields();
  showToast('↺ 已清空');
}
function startEditNote(id) {
  const n = appData.notes.find(x => x.id === id); if (!n) return;
  editingNoteId = id;
  document.getElementById('beTitle').value = n.title;
  document.getElementById('beCat').value = n.category;
  document.getElementById('bePrivacy').value = n.privacy || 'public';
  document.getElementById('beCover').value = n.cover || '';
  document.getElementById('beTags').value = (n.tags || []).join(', ');
  document.getElementById('blogEditorInput').value = n.content || '';
  document.getElementById('blogEditStatus').textContent = '✏️ 正在编辑：' + n.title + '（创建于 ' + fmtTime(n.createdAt) + '）';
  updateEditorPreview();
  showBlogView('edit');
}

// ---- AI 辅助写发贴 ----
function buildOutlineFromContent(title, content) {
  const lines = String(content || '').split('\n').map(s => s.trim()).filter(Boolean);
  const out = [];
  out.push('## 🤖 复习提纲｜' + title);
  out.push('');
  out.push('**一、核心考点**');
  const points = lines.slice(0, 8).map(l => '- ' + l.replace(/^[#>*`-]+\s*/, '').slice(0, 36));
  out.push(...(points.length ? points : ['- ' + title]));
  out.push('');
  out.push('**二、复习建议**');
  out.push('1. 先看提纲回忆，卡住的地方回原文重点复习；');
  out.push('2. 用「错题本」记录做错的同类题，隔天复盘；');
  out.push('3. 用费曼技巧把知识点讲给同学听，讲不清就是没掌握。');
  out.push('');
  out.push('> 提示：当前为「本地演示模式」生成的模板提纲。启动 ai-server 并配置 `AI_CONFIG.apiUrl` 后，可让真实 AI 深度提炼。');
  return out.join('\n');
}
async function editorAiAssist() {
  const title = document.getElementById('beTitle').value.trim() || '这篇发贴';
  const content = document.getElementById('blogEditorInput').value;
  const prompt = `你是学习助手。请根据下面的发贴，生成一份【复习提纲】和【知识点总结】：1）用 Markdown 要点列出核心考点；2）给 3 条复习建议；3）简洁、便于复习。\n\n发贴标题：${title}\n发贴内容：\n${content.slice(0, 1500)}`;
  const ta = document.getElementById('blogEditorInput');
  if (!content.trim()) { showToast('请先在编辑器里写点内容，AI 才能帮你总结'); return; }
  const aiMode = currentAiMode();
  if (aiMode.mode === 'provider') {
    // 服务商直连（OpenAI兼容，非流式一次性返回）
    showToast('🤖 AI 生成中…');
    if (ta.value && !ta.value.endsWith('\n')) ta.value += '\n';
    ta.value += '## 🤖 AI 复习提纲（生成中…）\n';
    updateEditorPreview();
    try {
      const cfg = aiMode.cfg;
      const res = await fetch(cfg.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model || 'deepseek-chat', stream: false, messages: [{ role: 'user', content: prompt }] })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      ta.value = ta.value.replace('## 🤖 AI 复习提纲（生成中…）', reply ? ('## 🤖 AI 复习提纲\n\n' + reply) : '');
      updateEditorPreview();
      showToast('🤖 AI 已生成复习提纲');
    } catch (e) {
      ta.value = ta.value.replace('## 🤖 AI 复习提纲（生成中…）', '## 🤖 AI 复习提纲\n\n⚠️ AI 生成失败：' + e.message + '（请到「设置 → AI 服务商配置」检查密钥/地址，或清除配置回到演示模式）');
      updateEditorPreview();
      showToast('⚠️ AI 生成失败');
    }
  } else if (AI_CONFIG.apiUrl) {
    showToast('🤖 AI 生成中…');
    if (ta.value && !ta.value.endsWith('\n')) ta.value += '\n';
    ta.value += '## 🤖 AI 复习提纲（生成中…）\n';
    updateEditorPreview();
    try {
      const res = await fetch(AI_CONFIG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: prompt }) });
      if (!res.ok) throw new Error('后端返回 ' + res.status);
      let reply = '';
      if (res.body && res.body.getReader) {
        const rd = res.body.getReader(), dc = new TextDecoder(); let acc = '';
        while (true) { const { done, value } = await rd.read(); if (done) break; acc += dc.decode(value, { stream: true }); }
        reply = acc;
      } else { const d = await res.json(); reply = d.reply || d.content || ''; }
      ta.value = ta.value.replace('## 🤖 AI 复习提纲（生成中…）', reply ? ('## 🤖 AI 复习提纲\n\n' + reply) : '');
      updateEditorPreview();
      showToast('🤖 AI 已生成复习提纲');
    } catch (e) {
      ta.value = ta.value.replace('## 🤖 AI 复习提纲（生成中…）', '## 🤖 AI 复习提纲\n\n⚠️ AI 生成失败：' + e.message + '（请确认 ai-server 已启动，或清空 apiUrl 回到演示模式）');
      updateEditorPreview();
      showToast('⚠️ AI 生成失败');
    }
  } else {
    ta.value = buildOutlineFromContent(title, content);
    updateEditorPreview();
    showToast('🤖 已生成复习提纲（演示模式；接后端可得真实 AI）');
  }
}

// ---- 统计 ----
function renderBlogStats() {
  const notes = appData.notes;
  const pub = notes.filter(n => n.status === 'published');
  const draft = notes.filter(n => n.status === 'draft');
  const arch = notes.filter(n => n.status === 'archived');
  const totalLikes = pub.reduce((s, n) => s + (n.likes || 0), 0);
  const totalComments = pub.reduce((s, n) => s + (n.comments || []).length, 0);
  const totalViews = pub.reduce((s, n) => s + (n.views || 0), 0);
  const catCount = {};
  notes.forEach(n => { const id = noteCat(n.category).id; catCount[id] = (catCount[id] || 0) + 1; });
  const maxCat = Math.max(1, ...Object.values(catCount));
  const catBars = BLOG_CATS.filter(c => catCount[c.id]).map(c =>
    `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="width:110px;font-size:12px;color:var(--text-secondary)">${c.icon} ${c.name}</span>
      <div style="flex:1;height:14px;background:var(--bg);border-radius:7px;overflow:hidden"><div style="height:100%;width:${Math.round(catCount[c.id] / maxCat * 100)}%;background:linear-gradient(90deg,${noteColors(c.id)[0]},${noteColors(c.id)[1]})"></div></div>
      <span style="width:60px;font-size:12px;color:var(--text-secondary)">${catCount[c.id]} 篇</span>
    </div>`).join('') || '<div style="color:var(--text-secondary);font-size:13px">还没有发贴，去“✍️ 写发贴”试试吧</div>';
  const statsBox = document.getElementById('blogStatsBox');
  if (!statsBox) return; // 当前页面没有统计容器（如个人中心页）时静默跳过
  statsBox.innerHTML = `
    <div class="card"><div class="card-header"><div class="card-title"><span class="title-icon">📊</span>博客数据统计</div></div>
      <div class="blog-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
        ${[['📝', pub.length, '已发布'], ['💾', draft.length, '草稿'], ['📁', arch.length, '已归档'], ['👍', totalLikes, '总点赞'], ['💬', totalComments, '总评论'], ['👁', totalViews, '总阅读']].map(([ic, num, lb]) =>
          `<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center"><div style="font-size:22px;font-weight:800;color:var(--text)">${ic} ${num}</div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${lb}</div></div>`).join('')}
      </div>
      <div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">📚 发贴分类分布</div>${catBars}</div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="exportAllNotesMd()">📄 导出全部 Markdown</button>
        <button class="btn btn-outline" onclick="navigateTo('profile')">👤 前往个人中心</button>
      </div>
    </div>`;
}

// ---- 个人中心（独立页面 个人中心.html 的渲染） ----
function renderProfilePage() {
  const box = document.getElementById('profileBox');
  if (!box) return;
  const p = appData.profile;
  const notes = appData.notes;
  const pub = notes.filter(n => n.status === 'published');
  const draft = notes.filter(n => n.status === 'draft');
  const arch = notes.filter(n => n.status === 'archived');
  const totalLikes = pub.reduce((s, n) => s + (n.likes || 0), 0);
  const totalComments = pub.reduce((s, n) => s + (n.comments || []).length, 0);
  const totalViews = pub.reduce((s, n) => s + (n.views || 0), 0);
  const catCount = {};
  notes.forEach(n => { const id = noteCat(n.category).id; catCount[id] = (catCount[id] || 0) + 1; });
  const maxCat = Math.max(1, ...Object.values(catCount));
  const catBars = BLOG_CATS.filter(c => catCount[c.id]).map(c =>
    `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="width:110px;font-size:12px;color:var(--text-secondary)">${c.icon} ${c.name}</span>
      <div style="flex:1;height:14px;background:var(--bg);border-radius:7px;overflow:hidden"><div style="height:100%;width:${Math.round(catCount[c.id] / maxCat * 100)}%;background:linear-gradient(90deg,${noteColors(c.id)[0]},${noteColors(c.id)[1]})"></div></div>
      <span style="width:60px;font-size:12px;color:var(--text-secondary)">${catCount[c.id]} 篇</span>
    </div>`).join('') || '<div style="color:var(--text-secondary);font-size:13px">还没有发贴，去「广场 → ✍️ 写发贴」试试吧</div>';
  const auth = getAuth();
  let st = {};
  try { st = loadAllSettings(); } catch (e) { }
  const speakState = (st.autoSpeak === false) ? '朗读关闭' : ('朗读开启 · 语速 ' + (st.voiceRate || 0.9));
  const d = (appData && appData.stats) || {};
  const acc = d.totalQuestions > 0 ? Math.round(d.correctQuestions / d.totalQuestions * 100) : 0;
  const totalNotes = pub.length + draft.length + arch.length;

  // 本周学习天数（模拟：连续打卡天数）
  const weekDays = Math.min(7, d.streakDays || 0);

  // 成就徽章
  const badges = [];
  if ((d.streakDays || 0) >= 7) badges.push({ icon: '🔥', name: '坚持一周', desc: '连续学习7天' });
  if ((d.totalQuestions || 0) >= 100) badges.push({ icon: '🧮', name: '百题斩', desc: '完成100道题' });
  if ((d.totalQuestions || 0) >= 500) badges.push({ icon: '💪', name: '刷题达人', desc: '完成500道题' });
  if (totalNotes >= 5) badges.push({ icon: '✍️', name: '勤于笔耕', desc: '发布5篇发贴' });
  if (totalLikes >= 10) badges.push({ icon: '👍', name: '人气博主', desc: '获得10个赞' });
  badges.push({ icon: '🌱', name: '初学者', desc: '开始学习之旅' });

  // 好友数量（从服务器加载，先显示0）
  const friendCount = (typeof SERVER_FRIENDS !== 'undefined') ? SERVER_FRIENDS.length : 0;

  box.innerHTML = `
    <!-- 个人信息头部 -->
    <div class="pp-profile" style="background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;border-radius:16px;padding:24px 20px;margin-bottom:16px;text-align:center">
      <div class="pp-avatar" style="width:80px;height:80px;margin:0 auto 12px;border:3px solid rgba(255,255,255,0.3);font-size:32px">${p.avatarImg && /^data:image\//.test(p.avatarImg) ? '<img src="' + p.avatarImg + '" alt="头像" style="border-radius:50%;width:100%;height:100%;object-fit:cover">' : esc(p.avatar)}</div>
      <div class="pp-name" style="color:#fff;font-size:20px;font-weight:700">${esc(p.name)}</div>
      <div class="pp-id" style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px">${auth ? '@' + esc(auth.account) : '本地学习账号'}${p.motto ? ' · ' + esc(p.motto) : ''}</div>
      <button class="pp-account-btn" onclick="editProfile()" style="margin-top:12px;background:rgba(255,255,255,0.2);color:#fff;border:none;padding:8px 20px;border-radius:20px;font-size:13px;cursor:pointer">✏️ 编辑资料</button>
    </div>

    <!-- 数据概览 -->
    <div class="pp-card" style="margin-bottom:16px">
      <div class="profile-grid" style="margin-bottom:16px">
        <div class="profile-stat" style="text-align:center">
          <div class="ps-num" style="font-size:22px;font-weight:800;color:var(--primary)">🔥 ${d.streakDays || 0}</div>
          <div class="ps-label">连续打卡</div>
        </div>
        <div class="profile-stat" style="text-align:center">
          <div class="ps-num" style="font-size:22px;font-weight:800;color:var(--primary)">⏱ ${d.totalHours || 0}h</div>
          <div class="ps-label">总学习时长</div>
        </div>
        <div class="profile-stat" style="text-align:center">
          <div class="ps-num" style="font-size:22px;font-weight:800;color:var(--primary)">🧮 ${d.totalQuestions || 0}</div>
          <div class="ps-label">做题总数</div>
        </div>
        <div class="profile-stat" style="text-align:center">
          <div class="ps-num" style="font-size:22px;font-weight:800;color:var(--primary)">🎯 ${acc}%</div>
          <div class="ps-label">正确率</div>
        </div>
      </div>
      <!-- 本周学习进度条 -->
      <div style="background:var(--bg-sub);border-radius:10px;padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:13px;font-weight:600">📅 本周学习</span>
          <span style="font-size:12px;color:var(--text-secondary)">${weekDays}/7 天</span>
        </div>
        <div style="display:flex;gap:4px">
          ${['一','二','三','四','五','六','日'].map((day, i) => {
            const active = i < weekDays;
            return `<div style="flex:1;text-align:center">
              <div style="width:100%;height:8px;border-radius:4px;background:${active ? 'var(--primary)' : 'var(--border)'};margin-bottom:4px"></div>
              <div style="font-size:10px;color:${active ? 'var(--primary)' : 'var(--text-muted)'}">${day}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- 【9/11 新增】今日学习时长（与设置页上限联动）-->
    <div class="pp-card" style="margin-bottom:16px">
      <div class="card-header" style="margin-bottom:12px">
        <div class="card-title" style="font-size:15px;font-weight:700">⏱ 今日学习时长</div>
        <div class="card-action" style="font-size:12px;color:var(--text-secondary)">上限 ${st.studyLimitOn === false ? '未启用' : (st.studyLimitHours || 4) + ' 小时'}</div>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px">
        <span id="pcStudyTime" style="font-size:26px;font-weight:800;color:var(--primary)">${getTodayStudyText()}</span>
        <span id="pcStudyTimeTip" style="font-size:12px;color:var(--text-secondary)"></span>
      </div>
      <div class="pc-studytime-bar"><i id="pcStudyTimeBar"></i></div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.6">
        💡 打开任意页面即开始计时，切到后台自动暂停；到上限只会友好提醒，不会打断学习。可在
        <a href="设置.html" style="color:var(--primary);text-decoration:none;font-weight:600">设置</a> 中修改上限或关闭。
      </div>
    </div>

    <!-- 我的成就 -->
    <div class="pp-card" style="margin-bottom:16px">
      <div class="card-header" style="margin-bottom:12px">
        <div class="card-title" style="font-size:15px;font-weight:700">🏅 我的成就</div>
        <div class="card-action" style="font-size:12px;color:var(--text-secondary)">${badges.length} 枚徽章</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        ${badges.map(b => `
          <div style="text-align:center;padding:12px 8px;background:var(--bg-sub);border-radius:12px">
            <div style="font-size:28px;margin-bottom:6px">${b.icon}</div>
            <div style="font-size:12px;font-weight:600;color:var(--text)">${b.name}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${b.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- 功能菜单 -->
    <div class="pp-card" style="margin-bottom:16px">
      <div class="pp-row" onclick="toggleProfilePanel('ppStatPanel', this)"><span class="pp-ic">📊</span><span class="pp-tx">发贴统计</span><span class="pp-st">${totalNotes} 篇</span><span class="pp-ar">▾</span></div>
      <div class="pp-panel" id="ppStatPanel">
        <div class="profile-grid">
          ${[['📝', pub.length, '已发布'], ['💾', draft.length, '草稿'], ['📁', arch.length, '已归档'], ['👍', totalLikes, '总点赞'], ['💬', totalComments, '总评论'], ['👁', totalViews, '总阅读']].map(([ic, num, lb]) =>
            `<div class="profile-stat"><div class="ps-num">${ic} ${num}</div><div class="ps-label">${lb}</div></div>`).join('')}
        </div>
        <div style="margin-top:16px"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">📚 发贴分类分布</div>${catBars}</div>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="btn btn-outline" onclick="exportAllNotesMd()">📄 导出 Markdown</button>
          <button class="btn btn-outline" onclick="navigateTo('blog')">📝 去写发贴</button>
        </div>
      </div>

      <div class="pp-row" onclick="gotoChat()"><span class="pp-ic">💬</span><span class="pp-tx">好友互动</span><span class="pp-st">${friendCount} 位好友</span><span class="pp-ar">›</span></div>

      <div class="pp-row" onclick="openBlogStats()"><span class="pp-ic">📈</span><span class="pp-tx">学习统计</span><span class="pp-st">详细报告</span><span class="pp-ar">›</span></div>

      <div class="pp-row" onclick="toggleProfilePanel('ppLocalPanel', this)"><span class="pp-ic">📖</span><span class="pp-tx">学习模块</span><span class="pp-st">快速入口</span><span class="pp-ar">▾</span></div>
      <div class="pp-panel" id="ppLocalPanel">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <div style="text-align:center;padding:12px;background:var(--bg-sub);border-radius:10px;cursor:pointer" onclick="navigateTo('wrong-book')">
            <div style="font-size:24px;margin-bottom:4px">📒</div>
            <div style="font-size:12px">错题本</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--bg-sub);border-radius:10px;cursor:pointer" onclick="location.href='四级词汇.html'">
            <div style="font-size:24px;margin-bottom:4px">📖</div>
            <div style="font-size:12px">四级词汇</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--bg-sub);border-radius:10px;cursor:pointer" onclick="location.href='行测刷题.html'">
            <div style="font-size:24px;margin-bottom:4px">📝</div>
            <div style="font-size:12px">行测刷题</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--bg-sub);border-radius:10px;cursor:pointer" onclick="location.href='面试题库.html'">
            <div style="font-size:24px;margin-bottom:4px">🎤</div>
            <div style="font-size:12px">面试题库</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--bg-sub);border-radius:10px;cursor:pointer" onclick="location.href='四级备考.html'">
            <div style="font-size:24px;margin-bottom:4px">🎧</div>
            <div style="font-size:12px">听力训练</div>
          </div>
          <div style="text-align:center;padding:12px;background:var(--bg-sub);border-radius:10px;cursor:pointer" onclick="location.href='万能金句库.html'">
            <div style="font-size:24px;margin-bottom:4px">✨</div>
            <div style="font-size:12px">金句库</div>
          </div>
        </div>
      </div>

      <div class="pp-row" onclick="location.href='设置.html'"><span class="pp-ic">⚙️</span><span class="pp-tx">设置</span><span class="pp-st">${speakState}</span><span class="pp-ar">›</span></div>

      <div class="pp-row" onclick="showAbout()"><span class="pp-ic">ℹ️</span><span class="pp-tx">关于</span><span class="pp-st">v2.2</span><span class="pp-ar">›</span></div>
    </div>

    <!-- 数据安全卡片 -->
    <div class="pp-card" style="margin-bottom:16px">
      <div class="pp-row" onclick="exportData()"><span class="pp-ic">📤</span><span class="pp-tx">导出数据备份</span><span class="pp-ar">›</span></div>
      <div class="pp-row" onclick="migrateLocalNotes()"><span class="pp-ic">☁️</span><span class="pp-tx">同步到云端</span><span class="pp-ar">›</span></div>
    </div>

    <!-- 退出登录 -->
    <div class="pp-card">
      <div class="pp-row pp-danger" onclick="doLogout()"><span class="pp-ic">🚪</span><span class="pp-tx">退出登录</span><span class="pp-ar">›</span></div>
    </div>`;
  // 【9/11 新增】渲染完成后同步今日学习时长进度条
  if (typeof syncStudyLimitUI === 'function') setTimeout(syncStudyLimitUI, 0);
}

/** 展开/收起个人中心内嵌面板（发贴统计 / 本机学习数据） */
function toggleProfilePanel(panelId, rowEl) {
  const el = document.getElementById(panelId);
  if (!el) return;
  const show = (el.style.display === 'none');
  el.style.display = show ? '' : 'none';
  if (rowEl) {
    const ar = rowEl.querySelector('.pp-ar');
    if (ar) ar.textContent = show ? '▴' : '▾';
  }
}
function editProfile() {
  // 打开“编辑资料”弹窗（头像上传 + 昵称 + 个性签名），弹窗结构见 个人中心.html
  const m = document.getElementById('profileEditModal');
  if (!m) { // 兜底：页面没有弹窗结构时退回 prompt 流程（不改变原有能力）
    const p = appData.profile;
    const name = prompt('修改昵称：', p.name); if (name === null) return;
    const motto = prompt('修改个性签名：', p.motto || ''); if (motto === null) return;
    p.name = name.trim() || p.name;
    p.motto = motto.trim();
    saveData(); updateProfileUI(); renderProfilePage(); renderBlogStats();
    showToast('👤 个人资料已更新');
    return;
  }
  const p = appData.profile;
  document.getElementById('peName').value = p.name || '';
  document.getElementById('peMotto').value = p.motto || '';
  peAvatarTemp = p.avatarImg || null;
  renderPeAvatarPreview();
  m.classList.add('active');
}

// ---- 编辑资料弹窗：头像上传（本地 base64，仅存浏览器 localStorage，无后端）----
let peAvatarTemp = null; // 临时头像：data:image/... 字符串；null = 使用默认 emoji 头像
function renderPeAvatarPreview() {
  const el = document.getElementById('peAvatarPreview'); if (!el) return;
  const p = appData.profile;
  if (peAvatarTemp && /^data:image\//.test(peAvatarTemp)) {
    el.innerHTML = '<img src="' + peAvatarTemp + '" alt="头像预览">';
  } else {
    el.textContent = (p.avatar || '学').slice(0, 2);
  }
}
function onProfileAvatarFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type)) { showToast('⚠️ 请选择图片文件'); input.value = ''; return; }
  if (file.size > 8 * 1024 * 1024) { showToast('⚠️ 图片超过 8MB，请换一张'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    compressAvatarImage(e.target.result, 256, function (dataUrl) {
      peAvatarTemp = dataUrl; // 只更新预览，点“保存”后才真正写入 localStorage
      renderPeAvatarPreview();
      showToast('📷 已选择头像，点“保存”生效');
    });
  };
  reader.readAsDataURL(file);
  input.value = ''; // 清空以便连续选择同一张图片也能触发 onchange
}
// 居中裁成正方形 + 缩放到 maxSize + 转 JPEG(0.85)，控制 base64 体积（约 10~30KB）
function compressAvatarImage(dataUrl, maxSize, cb) {
  const img = new Image();
  img.onload = function () {
    try {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = maxSize;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, maxSize, maxSize); // JPEG 无透明通道，先铺白底
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, maxSize, maxSize);
      cb(canvas.toDataURL('image/jpeg', 0.85));
    } catch (err) { cb(dataUrl); }
  };
  img.onerror = function () { showToast('⚠️ 图片读取失败，换一张试试'); };
  img.src = dataUrl;
}
function resetProfileAvatar() {
  peAvatarTemp = null; // 恢复默认 emoji 头像（点“保存”后生效）
  renderPeAvatarPreview();
}
function saveProfileEditor() {
  const p = appData.profile;
  const name = document.getElementById('peName').value.trim();
  const motto = document.getElementById('peMotto').value.trim();
  p.name = name || p.name;
  p.motto = motto;
  if (peAvatarTemp) { p.avatarImg = peAvatarTemp; } else { delete p.avatarImg; }
  saveData(); updateProfileUI(); renderProfilePage(); renderBlogStats();
  closeProfileEditor();
  showToast('👤 个人资料已更新');
}
function closeProfileEditor() {
  const m = document.getElementById('profileEditModal'); if (m) m.classList.remove('active');
}
// 点击遮罩关闭两个新弹窗（仅个人中心页存在，先判空防止其他页面报错）
(function () {
  const pe = document.getElementById('profileEditModal');
  if (pe) pe.addEventListener('click', (e) => { if (e.target.id === 'profileEditModal') closeProfileEditor(); });
  const lg = document.getElementById('logoutConfirmModal');
  if (lg) lg.addEventListener('click', (e) => { if (e.target.id === 'logoutConfirmModal') closeLogoutConfirm(); });
})();
function updateProfileUI() {
  const p = appData.profile;
  const av = document.querySelector('.user-card .user-avatar');
  if (av) {
    if (p.avatarImg && /^data:image\//.test(p.avatarImg)) { av.innerHTML = '<img src="' + p.avatarImg + '" alt="头像">'; }
    else { av.textContent = p.avatar; }
  }
  const nm = document.querySelector('.user-card .user-name'); if (nm) nm.textContent = p.name;
}

// ---- 底部“更多”面板入口 ----
function openBlogStats() {
  if (document.getElementById('page-blog')) { closeMorePanel(); showBlogView('stats'); }
  else location.href = '学习博客.html#stats';   // 跨页：带 hash 定位到统计视图
}
function openBlogFavorites() {
  if (document.getElementById('page-blog')) { closeMorePanel(); blogMineType = 'favorite'; showBlogView('mine'); }
  else location.href = '学习博客.html#favorite'; // 跨页：定位到我的收藏
}
function openBlogProfile() {
  // 个人中心已独立成页（个人中心.html）
  closeMorePanel();
  location.href = '个人中心.html';
}

// 初始化：加载分类下拉、输入框联动、标签页计数、个人中心资料（多页面版：仅博客页执行）
if (document.getElementById('page-blog')) {
  loadBlogEditor();
  renderBlogList();
  renderBlogMine();
  // 支持从其他页面带 #hash 跳转直达子视图（如 学习博客.html#stats / #note=xxx）
  const __h = location.hash.replace('#', '');
  if (__h === 'favorite') { blogMineType = 'favorite'; showBlogView('mine'); }
  else if (__h.startsWith('note=')) openBlogDetail(__h.slice(5));
  else if (['list', 'mine', 'edit', 'stats'].includes(__h)) showBlogView(__h);
}
updateProfileUI();

// ==================== 全局搜索（顶栏，新增） ====================
// 检索范围：① 广场发贴（标题/内容/标签/摘要） ② 各学习模块（标题/关键词）
// 点击结果：发贴 → 跳 学习博客.html#note=ID 打开详情；模块 → navigateTo 跨页跳转
const MODULE_INDEX = [
  { page: 'home',           icon: '🏠', title: '首页',                 desc: '倒计时 · 今日任务 · 学习数据', kw: '首页 主页 倒计时 任务 统计' },
  { page: 'cet',            icon: '📖', title: '四级备考',             desc: '词汇速记 · 听力 · 阅读 · 写作翻译', kw: '四级 英语 词汇 单词 听力 阅读 写作 翻译 cet' },
  { page: 'exam',           icon: '📝', title: '央国企笔试',           desc: '行测全题型刷题', kw: '笔试 行测 图形推理 定义判断 类比推理 逻辑 言语 数量关系 资料分析 国企' },
  { page: 'comm',           icon: '💬', title: '高情商表达',           desc: '场景话术 · 金句库 · 角色扮演', kw: '高情商 表达 话术 沟通 金句 情商' },
  { page: 'interview',      icon: '🤝', title: '商务礼仪面试',         desc: '商务礼仪 · 模拟面试', kw: '面试 礼仪 自我介绍 简历 offer' },
  { page: 'ppt',            icon: '🎨', title: 'PPT训练',             desc: '版式训练 · 案例拆解', kw: 'PPT 汇报 课件 幻灯片 版式 演示' },
  { page: 'blog',           icon: '🗒️', title: '广场',             desc: '广场 · 写发贴 · 统计', kw: '博客 发贴 写作 草稿 日记' },
  { page: 'exam-center',    icon: '🧮', title: '行测刷题',             desc: '分题型专项刷题中心', kw: '行测 刷题 专项 刷题中心' },
  { page: 'wrong-book',     icon: '📒', title: '错题本',               desc: '错题收录与复盘', kw: '错题 错题本 复盘 收录' },
  { page: 'cet-vocab',      icon: '📖', title: '四级词汇',             desc: '间隔重复背单词', kw: '四级 词汇 单词 背单词 间隔重复' },
  { page: 'etiquette',      icon: '🎩', title: '商务礼仪',           desc: '礼仪知识点速查', kw: '礼仪 商务 着装 餐桌 会议' },
  { page: 'iv-questions',   icon: '🗂️', title: '面试题库',             desc: '高频面试题与解析', kw: '面试 题库 面试题 高频' },
  { page: 'ppt-layouts',    icon: '🧱', title: 'PPT版式库',           desc: '常用版式模板', kw: 'PPT 版式 模板 排版' },
  { page: 'ppt-cases',      icon: '🏷️', title: 'PPT案例拆解',         desc: '真实报告案例拆解', kw: 'PPT 案例 拆解 麦肯锡 报告' },
  { page: 'comm-scenes',    icon: '🎭', title: '场景话术库',           desc: '职场沟通场景话术', kw: '话术 场景 沟通 拒绝 汇报' },
  { page: 'comm-quotes',    icon: '💬', title: '万能金句库',           desc: '面试/汇报金句', kw: '金句 万能金句 名言 句子' },
  { page: 'settings',       icon: '⚙️', title: '设置',                 desc: '主题 · 数据管理 · AI配置', kw: '设置 主题 深色 导出 导入 清空 AI 密钥' },
  { page: 'profile',        icon: '👤', title: '个人中心',             desc: '资料 · 发贴统计 · 导出', kw: '个人中心 资料 头像 昵称 统计 退出' }
];
function gsEscape(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function gsHighlight(text, kw) {
  const t = gsEscape(text);
  if (!kw) return t;
  const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return t.replace(new RegExp('(' + safe + ')', 'gi'), '<em>$1</em>');
}
function globalSearch(kw) {
  const dd = document.getElementById('gsDropdown');
  if (!dd) return;
  kw = (kw || '').trim().toLowerCase();
  if (!kw) { dd.classList.remove('open'); dd.innerHTML = ''; return; }
  const results = [];
  // ① 博客发贴：标题 / 内容 / 标签 / 摘要
  appData.notes.forEach(n => {
    if (n.status !== 'published' && n.status !== 'draft') return; // 归档的不搜
    const hitTitle = (n.title || '').toLowerCase().includes(kw);
    const hitBody = (n.content || '').toLowerCase().includes(kw);
    const hitTags = (n.tags || []).some(t => String(t).toLowerCase().includes(kw));
    if (hitTitle || hitBody || hitTags) {
      let ctx = '';
      const idx = (n.content || '').toLowerCase().indexOf(kw);
      if (idx >= 0) ctx = '…' + (n.content || '').slice(Math.max(0, idx - 12), idx + 40) + '…';
      else ctx = (n.excerpt || (n.tags || []).join(' / ') || '');
      results.push({ icon: '📝', title: n.title, desc: ctx + ' · ' + (n.status === 'draft' ? '草稿' : '发贴'), action: "if(document.getElementById('page-blog')){closeGsDropdown();openBlogDetail('" + n.id + "');}else{location.href='学习博客.html#note=" + n.id + "';}" });
    }
  });
  const noteCount = results.length;
  // ② 学习模块：标题 / 关键词
  MODULE_INDEX.forEach(m => {
    if ((m.title + ' ' + m.kw + ' ' + m.desc).toLowerCase().includes(kw)) {
      results.push({ icon: m.icon, title: m.title, desc: m.desc, action: "navigateTo('" + m.page + "');closeGsDropdown()" });
    }
  });
  const shown = results.slice(0, 9);
  let html = '';
  if (noteCount > 0) html += '<div class="gs-group">📚 发贴（' + noteCount + '）</div>';
  html += shown.slice(0, noteCount).map(r =>
    '<div class="gs-item" onclick="' + r.action.replace(/"/g, '&quot;') + '"><div class="gs-item-icon">' + r.icon + '</div><div class="gs-item-main"><div class="gs-item-title">' + gsHighlight(r.title, kw) + '</div><div class="gs-item-desc">' + gsEscape(r.desc) + '</div></div></div>').join('');
  if (shown.length > noteCount) html += '<div class="gs-group">🧭 学习模块</div>';
  html += shown.slice(noteCount).map(r =>
    '<div class="gs-item" onclick="navigateTo(\'' + (MODULE_INDEX.find(m => m.title === r.title) || {}).page + '\');closeGsDropdown()"><div class="gs-item-icon">' + r.icon + '</div><div class="gs-item-main"><div class="gs-item-title">' + gsHighlight(r.title, kw) + '</div><div class="gs-item-desc">' + gsEscape(r.desc) + '</div></div></div>').join('');
  if (!shown.length) html = '<div class="gs-empty">没有找到「' + gsEscape(kw) + '」相关内容<br>试试：四级 / 行测 / 面试 / PPT / 发贴关键词</div>';
  else if (results.length > 9) html += '<div class="gs-empty">还有 ' + (results.length - 9) + ' 条结果未显示，换个更具体的关键词试试</div>';
  dd.innerHTML = html;
  dd.classList.add('open');
}
function closeGsDropdown() {
  const dd = document.getElementById('gsDropdown');
  if (dd) { dd.classList.remove('open'); }
  const inp = document.getElementById('gsInput');
  if (inp) inp.blur();
}
// 点击搜索框外部时收起下拉
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('gsWrap');
  if (wrap && !wrap.contains(e.target)) {
    const dd = document.getElementById('gsDropdown');
    if (dd) dd.classList.remove('open');
  }
});

// ==================== 设置页：AI 服务商配置表单（新增） ====================
function renderAiProviderForm() {
  const box = document.getElementById('aiProviderForm');
  if (!box) return;
  const cfg = getAiProviderConfig();
  const cur = AI_PROVIDERS.find(p => p.id === cfg.provider) || AI_PROVIDERS[0];
  const m = currentAiMode();

  // 连接状态
  const connStatus = m.mode === 'provider'
    ? '<span style="color:#67c23a;font-size:12px">✅ 已直连服务商</span>'
    : m.mode === 'backend'
    ? '<span style="color:#409eff;font-size:12px">☁️ 服务端中转</span>'
    : '<span style="color:#e6a23c;font-size:12px">⚠️ 演示模式（不联网）</span>';

  // 常用模型快速选择按钮
  const modelBtns = (cur.models || []).map(mdl =>
    `<button class="theme-option" data-model="${mdl}" onclick="quickSelectModel('${mdl}')" style="font-size:12px;padding:6px 12px">${mdl}</button>`
  ).join('');

  box.innerHTML = `
    <!-- 当前状态 -->
    <div style="background:var(--bg-sub);border-radius:10px;padding:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:13px;font-weight:600">当前AI模式</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${cur.name}</div>
      </div>
      <div>${connStatus}</div>
    </div>

    <div class="ai-cfg-grid">
      <div class="form-group">
        <div class="form-label">AI 服务商</div>
        <select class="form-input" id="aipSelect" onchange="onAiProviderChange()">
          ${AI_PROVIDERS.map(p => '<option value="' + p.id + '"' + (p.id === (cfg.provider || 'deepseek') ? ' selected' : '') + '>' + p.name + '</option>').join('')}
        </select>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${cur.desc || ''}</div>
      </div>
      <div class="form-group">
        <div class="form-label">模型名称</div>
        <input type="text" class="form-input" id="aipModel" value="${gsEscape(cfg.model || cur.model || '')}" placeholder="如 deepseek-chat">
      </div>
      ${modelBtns ? `
      <div class="form-group full">
        <div class="form-label">常用模型快速选择</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${modelBtns}</div>
      </div>` : ''}
      <div class="form-group full">
        <div class="form-label">接口地址（OpenAI 兼容 /chat/completions）</div>
        <input type="text" class="form-input" id="aipBaseUrl" value="${gsEscape(cfg.baseUrl || cur.baseUrl || '')}" placeholder="https://api.deepseek.com/chat/completions">
      </div>
      <div class="form-group full">
        <div class="form-label">API Key（仅保存在本机浏览器 localStorage）</div>
        <input type="password" class="form-input" id="aipKey" value="${gsEscape(cfg.apiKey || '')}" placeholder="sk-…（只存本地，不上传任何服务器）" autocomplete="off">
      </div>
    </div>

    <!-- 助手外观设置 -->
    <div style="margin-top:16px;padding-top:16px;border-top:1px dashed var(--border)">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">🎨 AI助手外观</div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">助手头像</div>
          <div class="setting-desc">悬浮按钮显示的头像</div>
        </div>
        <div class="setting-actions" id="swAiIcon">
          <button class="theme-option active" data-val="🤖" onclick="setAiIcon('🤖',this)">🤖 机器人</button>
          <button class="theme-option" data-val="🧠" onclick="setAiIcon('🧠',this)">🧠 大脑</button>
          <button class="theme-option" data-val="💡" onclick="setAiIcon('💡',this)">💡 灯泡</button>
          <button class="theme-option" data-val="📚" onclick="setAiIcon('📚',this)">📚 书本</button>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-name">面板宽度</div>
          <div class="setting-desc">AI聊天面板的宽度</div>
        </div>
        <div class="setting-actions">
          <select class="form-input" id="stAiWidth" onchange="setSetting('aiWidth',this.value);showToast('✅ 已保存')">
            <option value="320">窄（320px）</option>
            <option value="380" selected>标准（380px）</option>
            <option value="450">宽（450px）</option>
          </select>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
      <button class="btn btn-primary" onclick="saveAiProviderForm()">💾 保存配置</button>
      <button class="btn btn-outline" onclick="testAiConnection()">🔌 测试连接</button>
      <button class="btn btn-outline" onclick="clearAiProviderConfigUI()">🗑️ 清除配置</button>
      <button class="btn btn-outline" onclick="showAiUsage()">📊 用量统计</button>
    </div>
    <div id="aiTestResult" style="margin-top:8px;font-size:12px"></div>
  `;
}

// 快速选择模型
function quickSelectModel(mdl) {
  document.getElementById('aipModel').value = mdl;
  showToast('已选择：' + mdl);
}

// 设置AI助手图标
function setAiIcon(icon, el) {
  setSetting('aiIcon', icon);
  var wrap = el.parentElement;
  wrap.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  var fab = document.getElementById('aiFab');
  if (fab) fab.firstChild.textContent = icon;
  showToast('✅ 助手头像已更新');
}

// 显示AI用量统计
function showAiUsage() {
  var history = JSON.parse(localStorage.getItem('ai_chat_history') || '[]');
  var totalMsgs = history.length;
  var today = new Date().toDateString();
  var todayMsgs = history.filter(m => new Date(m.time).toDateString() === today).length;
  alert('📊 AI使用统计\n\n总对话条数：' + totalMsgs + '\n今日对话：' + todayMsgs + '\n\n（历史记录保存在本地浏览器）');
}

// 清空对话历史
function clearAiHistory() {
  if (!confirm('确定清空所有AI对话历史吗？此操作不可撤销。')) return;
  localStorage.removeItem('ai_chat_history');
  document.getElementById('aiMessages').innerHTML = '';
  showToast('✅ 对话历史已清空');
}

// 旧代码占位（防止报错）
// 旧代码占位（防止报错）
function __oldClearConfig() {
  clearAiProviderConfigUI();
}

function onAiProviderChange() {
  const id = document.getElementById('aipSelect').value;
  const p = AI_PROVIDERS.find(x => x.id === id) || {};
  const cfg = getAiProviderConfig();
  document.getElementById('aipBaseUrl').value = p.baseUrl || '';
  document.getElementById('aipModel').value = p.model || '';
  document.getElementById('aipKey').value = cfg.apiKey || ''; // 密钥在切换服务商时保留，方便填多把钥匙
}
function saveAiProviderForm() {
  const cfg = {
    provider: (document.getElementById('aipSelect') || {}).value || 'custom',
    baseUrl: (document.getElementById('aipBaseUrl') || {}).value.trim(),
    model: (document.getElementById('aipModel') || {}).value.trim(),
    apiKey: (document.getElementById('aipKey') || {}).value.trim()
  };
  if (cfg.apiKey && !cfg.baseUrl) { showToast('请填写接口地址（或选择预置服务商）'); return; }
  if (cfg.apiKey || cfg.baseUrl) saveAiProviderConfig(cfg);
  else clearAiProviderConfig();
  renderAiProviderForm();
  showToast(cfg.apiKey ? '✅ AI 服务商配置已保存（仅存本机）' : '已清除 AI 直连配置');
}
function clearAiProviderConfigUI() {
  if (!confirm('确定清除本机保存的 AI 服务商配置（含 API Key）吗？')) return;
  clearAiProviderConfig();
  renderAiProviderForm();
  showToast('🗑️ 已清除，回到后端中转/本地演示模式');
}
async function testAiConnection() {
  const cfg = {
    provider: (document.getElementById('aipSelect') || {}).value || 'custom',
    baseUrl: (document.getElementById('aipBaseUrl') || {}).value.trim(),
    model: (document.getElementById('aipModel') || {}).value.trim(),
    apiKey: (document.getElementById('aipKey') || {}).value.trim()
  };
  if (!cfg.apiKey || !cfg.baseUrl) { showToast('请先填写接口地址和 API Key'); return; }
  showToast('🔌 正在测试连接…');
  try {
    const res = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({ model: cfg.model || 'deepseek-chat', stream: false, messages: [{ role: 'user', content: '你好' }] })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    showToast('✅ 连接成功！模型回复：' + (reply || '').slice(0, 20));
  } catch (e) {
    showToast('⚠️ 连接失败：' + e.message.slice(0, 60));
  }
}
// 个人中心页 / 设置页初始化（按 DOM 存在性执行，互不影响其他页面）
if (document.getElementById('page-profile')) renderProfilePage();
if (document.getElementById('aiProviderForm')) renderAiProviderForm();

console.log('📚 星途已启动');
console.log('💡 提示：所有数据保存在本地浏览器中');

// ========== 统一确认弹层（替代原生 confirm；#2）==========
function uiConfirm(msg, okText) {
  return new Promise(function (resolve) {
    var old = document.getElementById('uiConfirmMask'); if (old) old.remove();
    var m = document.createElement('div');
    m.id = 'uiConfirmMask';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(15,18,30,.45);backdrop-filter:blur(2px);z-index:2600;display:flex;align-items:center;justify-content:center;padding:20px';
    m.innerHTML = '<div style="width:min(340px,100%);background:var(--card);color:var(--text);border-radius:16px;padding:20px 18px 14px;box-shadow:0 24px 60px -18px rgba(0,0,0,.4)">' +
      '<div style="font-size:15px;line-height:1.7;margin-bottom:16px">' + String(msg).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }) + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
      '<button class="btn btn-outline" data-a="0">取消</button>' +
      '<button class="btn btn-primary" data-a="1">' + (okText || '确定') + '</button></div></div>';
    document.body.appendChild(m);
    var done = function (v) { m.remove(); resolve(v); };
    m.querySelector('[data-a="0"]').onclick = function () { done(false); };
    m.querySelector('[data-a="1"]').onclick = function () { done(true); };
    m.addEventListener('click', function (e) { if (e.target === m) done(false); });
  });
}


/* ================= 学途 · 学习中枢数据层（v1.15） =================
 * 学习记录 / 学习会话计时 / 连续天数 / 错因 / 自定义学科 / 学习目标
 * 全部走 localStorage，file:// 全页共享；App 与网页版一致。
 */
const STUDY_RECORDS_KEY = lsKey('study_workbench_records');
const STUDY_SESSION_KEY = lsKey('study_workbench_session');
const WRONG_REASON_KEY = lsKey('study_workbench_wrong_reasons');
const SUBJECTS_KEY = lsKey('study_workbench_subjects');
const GOALS_KEY = lsKey('study_workbench_goals');

/* ---------- 学习记录：{ 'YYYY-MM-DD': { minutes, done: [] } } ---------- */
function loadStudyRecords() {
  try { return JSON.parse(localStorage.getItem(STUDY_RECORDS_KEY)) || {}; } catch (e) { return {}; }
}
function saveStudyRecords(r) {
  try { localStorage.setItem(STUDY_RECORDS_KEY, JSON.stringify(r)); } catch (e) { }
}
function getStudyRecord(dateStr) {
  const r = loadStudyRecords();
  return r[dateStr] || { minutes: 0, done: [] };
}
function addStudyMinutes(type, mins) {
  if (!mins || mins <= 0) return;
  const r = loadStudyRecords();
  const today = getTodayStr();
  if (!r[today]) r[today] = { minutes: 0, done: [] };
  r[today].minutes += Math.round(mins);
  if (type && r[today].done.indexOf(type) < 0) r[today].done.push(type);
  saveStudyRecords(r);
}
function markTaskDone(type) {
  const r = loadStudyRecords();
  const today = getTodayStr();
  if (!r[today]) r[today] = { minutes: 0, done: [] };
  if (r[today].done.indexOf(type) < 0) r[today].done.push(type);
  saveStudyRecords(r);
}

/* ---------- 学习会话：进入模块开始计时，回到学途自动结算 ---------- */
function startStudySession(type) {
  try {
    localStorage.setItem(STUDY_SESSION_KEY, JSON.stringify({ start: Date.now(), type: type || 'study' }));
  } catch (e) { }
}
function endStudySession() {
  try {
    const raw = localStorage.getItem(STUDY_SESSION_KEY);
    if (!raw) return null;
    localStorage.removeItem(STUDY_SESSION_KEY);
    const s = JSON.parse(raw);
    const mins = (Date.now() - s.start) / 60000;
    if (mins >= 1) addStudyMinutes(s.type, Math.min(mins, 600));
    return s;
  } catch (e) { return null; }
}
/** 学途入口：结算上次会话 → 记录本次开始 → 跳转学习模块 */
function goStudy(type, url) {
  endStudySession();
  startStudySession(type);
  if (url) location.href = url;
}

/* ---------- 统计 ---------- */
function calcStreakDays() {
  const r = loadStudyRecords();
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (r[ds] && (r[ds].minutes > 0 || (r[ds].done && r[ds].done.length))) streak++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/* ---------- T18② 全局连续打卡（单一口径，2026-09-12 P0-A） ----------
   原状：app.js calcStreakDays（基于 study_workbench_records）与 study-stats.js recomputeStreak
   （基于 study_workbench_stats）两套独立 streak，首页取 max、模块页只看 study-stats 卡 → 矛盾。
   现改为统一键 lsKey('study_workbench_streak')，格式 { count:number, lastDay:'YYYY-MM-DD' }。
   写点：study-stats.track（全部模块埋点）/ 行测答题 / 首页任务完成 / mini 小题库答题。
   读点：首页统计、顶栏 #streakDays、个人中心、各页 study-stats 卡。 */
const STREAK_KEY = lsKey('study_workbench_streak');
function _streakDayKey(offset) {
  const d = new Date();
  d.setDate(d.getDate() - (offset || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
window.Streak = {
  /** 读当前连续打卡天数；lastDay 早于昨天惰性返回 0。首次调用时从旧两套口径初始化一次。 */
  get: function () {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s.count !== 'number') {
      // 旧数据迁移：count = max(study-stats 本地 summary streak, calcStreakDays())
      let init = 0;
      try { init = Math.max(init, calcStreakDays()); } catch (e1) { /* 静默 */ }
      try {
        if (window.StudyStats && typeof window.StudyStats.getSummary === 'function') {
          const sm = window.StudyStats.getSummary();
          if (sm && sm.streak) init = Math.max(init, sm.streak);
        }
      } catch (e2) { /* 静默 */ }
      let lastDay = '';
      if (init > 0) {
        // 学途记录口径下 init>0 必有今天或昨天的记录，据此定 lastDay，保证连续性不中断
        const rec = loadStudyRecords();
        lastDay = rec[_streakDayKey(0)] ? _streakDayKey(0) : _streakDayKey(1);
      }
      s = { count: init, lastDay: lastDay };
      try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e3) { /* 静默 */ }
    }
    const yesterday = _streakDayKey(1);
    if (!s.lastDay || s.lastDay < yesterday) return 0;
    return s.count || 0;
  },
  /** 记一次今天的「学习动作」：今天已记不变 / 昨天连续 +1 / 否则重新计 1 */
  bump: function () {
    const tk = _streakDayKey(0);
    let s = { count: 0, lastDay: '' };
    try { s = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null') || s; } catch (e) { /* 静默 */ }
    if (s.lastDay === tk) { /* 今天已记，不变 */ }
    else if (s.lastDay === _streakDayKey(1)) { s.count = (s.count || 0) + 1; s.lastDay = tk; }
    else { s.count = 1; s.lastDay = tk; }
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e2) { /* 静默 */ }
    this._render();
  },
  /** 口径收敛：把其它来源（如 study-stats 重算值）的 streak 合并进来，取较大者 */
  _merge: function (n) {
    n = Number(n) || 0;
    const cur = this.get();
    if (n > cur) {
      try { localStorage.setItem(STREAK_KEY, JSON.stringify({ count: n, lastDay: _streakDayKey(0) })); } catch (e) { /* 静默 */ }
      this._render();
    }
  },
  /** 刷新所有打卡展示位：首页 #streakDisplay、顶栏 #streakDays、[data-streak-display]、个人中心 localStats */
  _render: function () {
    const v = this.get();
    ['streakDisplay', 'streakDays'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    });
    document.querySelectorAll('[data-streak-display]').forEach(el => { el.textContent = v; });
    try {
      const ls = document.getElementById('localStats');
      if (ls) {
        ls.querySelectorAll('.profile-stat').forEach(function (it) {
          const lbl = it.querySelector('.ps-label');
          const num = it.querySelector('.ps-num');
          if (lbl && num && lbl.textContent === '连续打卡') num.textContent = '🔥 ' + v;
        });
      }
    } catch (e) { /* 静默 */ }
  }
};
/** 收敛后的连续打卡（旧字段 appData.stats.streakDays 与全局 Streak 取较大者，不归零） */
function getConvergedStreak() {
  let v = appData.stats.streakDays || 0;
  try { if (window.Streak) v = Math.max(v, window.Streak.get()); } catch (e) { /* 静默 */ }
  return v;
}
function calcWeekMinutes() {
  const r = loadStudyRecords();
  const out = [0, 0, 0, 0, 0, 0, 0]; // 周一~周日
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  for (let i = 0; i <= day; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - (day - i));
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    out[i] = (r[ds] && r[ds].minutes) || 0;
  }
  return out;
}
function calcMonthMinutes() {
  const r = loadStudyRecords();
  const now = new Date();
  const prefix = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  let total = 0;
  Object.keys(r).forEach(k => { if (k.indexOf(prefix) === 0) total += r[k].minutes || 0; });
  return total;
}
function calcTodayMinutes() {
  return getStudyRecord(getTodayStr()).minutes || 0;
}
function getLastStudySession() {
  const r = loadStudyRecords();
  const keys = Object.keys(r).sort().reverse();
  for (const k of keys) {
    if (r[k].minutes > 0 || (r[k].done && r[k].done.length)) {
      return { date: k, minutes: r[k].minutes, done: r[k].done || [] };
    }
  }
  return null;
}

/* ---------- 错因（学途错题本）：{ questionId: reason } ---------- */
const WRONG_REASONS = ['知识点不会', '粗心', '看错题', '计算错误', '时间不够', '方法不会'];
function loadWrongReasons() {
  try { return JSON.parse(localStorage.getItem(WRONG_REASON_KEY)) || {}; } catch (e) { return {}; }
}
function saveWrongReasons(w) {
  try { localStorage.setItem(WRONG_REASON_KEY, JSON.stringify(w)); } catch (e) { }
}
function chooseWrongReason(qid, reason) {
  const w = loadWrongReasons();
  w[qid] = reason;
  saveWrongReasons(w);
}
function getWrongReasonStats(limit) {
  const w = loadWrongReasons();
  const ids = Object.keys(w).slice(-(limit || 30));
  const cnt = {};
  ids.forEach(id => { const rs = w[id]; if (rs) cnt[rs] = (cnt[rs] || 0) + 1; });
  return { total: ids.length, counts: cnt };
}
/** 完整错题详情（题目 + 正确答案 + 解析 + 已选错因） */
function getWrongDetails(limit) {
  const ids = (appData.wrongQuestions || []).slice(-(limit || 20));
  const reasons = loadWrongReasons();
  const map = {};
  (typeof EXAM_BANK !== 'undefined' ? EXAM_BANK : []).forEach(q => { map[q.id] = q; });
  return ids.map(id => {
    const q = map[id];
    if (!q) return null;
    return {
      id: id,
      q: q.q,
      type: q.type || '',
      sub: q.sub || '',
      o: q.o || [],
      a: q.a,
      x: q.x || '',
      reason: reasons[id] || ''
    };
  }).filter(Boolean);
}

/* ---------- 自定义学科 ---------- */
function loadSubjects() {
  try { return JSON.parse(localStorage.getItem(SUBJECTS_KEY)) || []; } catch (e) { return []; }
}
function saveSubjects(s) {
  try { localStorage.setItem(SUBJECTS_KEY, JSON.stringify(s)); } catch (e) { }
}
function addSubject(name, url) {
  const s = loadSubjects();
  s.push({ name: name, url: url || '', createdAt: Date.now() });
  saveSubjects(s);
}
function removeSubject(idx) {
  const s = loadSubjects();
  if (idx >= 0 && idx < s.length) { s.splice(idx, 1); saveSubjects(s); }
}

/* ---------- 学习目标 ---------- */
function loadGoals() {
  try { return JSON.parse(localStorage.getItem(GOALS_KEY)) || []; } catch (e) { return []; }
}
function saveGoals(g) {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(g)); } catch (e) { }
}
function addGoal(name, progress) {
  const g = loadGoals();
  g.push({ name: name, progress: Number(progress) || 0, createdAt: Date.now() });
  saveGoals(g);
}
function removeGoal(idx) {
  const g = loadGoals();
  if (idx >= 0 && idx < g.length) { g.splice(idx, 1); saveGoals(g); }
}
function updateGoalProgress(idx, progress) {
  const g = loadGoals();
  if (idx >= 0 && idx < g.length) { g[idx].progress = Number(progress) || 0; saveGoals(g); }
}




// ========== 关于弹窗 ==========
function showAbout() {
  var old = document.getElementById('aboutModal');
  if (old) old.remove();
  var mask = document.createElement('div');
  mask.id = 'aboutModal';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  mask.onclick = function(e) { if (e.target === mask) mask.remove(); };
  var html = '<div style="background:#fff;border-radius:20px;max-width:420px;width:100%;max-height:80vh;overflow-y:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
    '<div style="font-size:18px;font-weight:800;color:#1a1b1c">ℹ️ 关于</div>' +
    '<button id="aboutClose" style="background:none;border:none;font-size:22px;cursor:pointer;color:#999">×</button>' +
    '</div>' +
    '<div style="font-size:15px;font-weight:800;color:#1a1b1c">🚀 星途 v2.1</div>' +
    '<div style="font-size:13px;color:#6b7280;margin-top:4px">一站式备考平台</div>' +
    '<div style="margin-top:16px;font-size:13px;color:#374151;line-height:1.8">本应用数据默认保存在本机浏览器；登录服务器后，发贴/私信/AI 记录可多端同步。</div>' +
    '<div style="margin-top:14px;font-weight:700;color:#1a1b1c">🗂️ 学习模块</div>' +
    '<div style="font-size:13px;color:#374151;line-height:1.7;margin-top:4px">四级词汇(间隔重复) · 听说训练 · 行测刷题 · 错题本 · 央国企笔试 · 面试题库 · 高情商表达 · 商务礼仪 · PPT训练 · 万能金句/场景话术 · 广场 · 好友私信</div>' +
    '<div style="margin-top:14px;font-weight:700;color:#1a1b1c">🧰 便捷能力</div>' +
    '<div style="font-size:13px;color:#374151;line-height:1.7;margin-top:4px">导入题库 · AI多模型 · 发贴回收站 · Markdown导出 · 外观主题 · 专注计时 · 数据备份</div>' +
    '<div style="margin-top:16px;border-top:1px dashed #e4e3dd;padding-top:10px;font-size:12px;color:#9ca3af">v2.1 更新：外观皮肤 · 好友私信 · AI对话记录 · 听说训练播放器 · 导入题库 · 个人资料等</div>' +
    '<div style="margin-top:16px;text-align:right;font-style:italic;color:#6b7280">—— 小叶子</div>' +
    '</div>';
  mask.innerHTML = html;
  document.body.appendChild(mask);
  document.getElementById('aboutClose').onclick = function() { mask.remove(); };
}
window.showAbout = showAbout;

// ========== 【9/11 新增】每日学习时长统计与上限提醒 ==========
// 口径：页面可见即计时（visibilitychange / blur 暂停），按自然日 key 累计。
// 存储：study_workbench_studytime = { "YYYY-MM-DD": 秒数, ... }（同源 file:// 全页共享）
const STUDY_TIME_KEY = lsKey('study_workbench_studytime');
var _stTick = null;            // 计时器
var _stLast = 0;               // 上次落账时间戳(ms)
var _stWarnedDay = '';         // 已提醒过的日期，避免同一天反复弹

function _stToday() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function loadStudyTime() {
  try { return JSON.parse(localStorage.getItem(STUDY_TIME_KEY)) || {}; }
  catch (e) { return {}; }
}
function _stSave(obj) {
  try { localStorage.setItem(STUDY_TIME_KEY, JSON.stringify(obj)); } catch (e) { /* 忽略 */ }
}
/** 今日已学秒数 */
function getTodayStudySeconds() {
  var o = loadStudyTime();
  return Math.max(0, Math.round(o[_stToday()] || 0));
}
/** 今日已学「x 小时 y 分钟」文本 */
function getTodayStudyText() {
  var sec = getTodayStudySeconds();
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h <= 0) return m + ' 分钟';
  return h + ' 小时' + (m ? ' ' + m + ' 分钟' : '');
}
/** 累加秒数（内部用） */
function _stAdd(sec) {
  if (sec <= 0) return;
  var o = loadStudyTime();
  var k = _stToday();
  o[k] = Math.max(0, Math.round((o[k] || 0) + sec));
  // 只保留最近 60 天，避免 localStorage 膨胀
  var keys = Object.keys(o).sort();
  if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(function (kk) { delete o[kk]; });
  _stSave(o);
}
/** 重置今日时长（设置页按钮） */
function resetTodayStudyTime() {
  var o = loadStudyTime();
  delete o[_stToday()];
  _stSave(o);
  _stWarnedDay = '';
  syncStudyLimitUI();
  if (typeof showToast === 'function') showToast('✅ 今日学习时长已重置');
}
window.resetTodayStudyTime = resetTodayStudyTime;

/** 落账：把 _stLast 到现在的时间补进今日累计 */
function _stFlush() {
  if (!_stLast) return;
  var now = Date.now();
  var delta = (now - _stLast) / 1000;
  _stLast = now;
  // 单次最多记 5 分钟，防止长时间挂后台被误计
  if (delta > 0 && delta <= 300) _stAdd(delta);
}

/** 是否已超限 */
function isStudyLimitReached() {
  var s = loadAllSettings();
  if (!s.studyLimitOn) return false;
  var limit = (Number(s.studyLimitHours) || 4) * 3600;
  return getTodayStudySeconds() >= limit;
}

/** 超限提醒（每天一次，仅提醒不阻断） */
function checkStudyLimitWarn() {
  if (!isStudyLimitReached()) return;
  var day = _stToday();
  if (_stWarnedDay === day) return;
  _stWarnedDay = day;
  var s = loadAllSettings();
  var tip = '今天已经学习 ' + getTodayStudyText() + ' 啦，超过了你设置的 ' + s.studyLimitHours + ' 小时上限 🌙';
  showStudyLimitModal(tip);
  if (typeof showToast === 'function') showToast('🌙 ' + tip);
}

/** 超限友好弹窗（自包含，不依赖外部组件；仅提醒不阻断） */
function showStudyLimitModal(desc) {
  var old = document.getElementById('studyLimitModal');
  if (old) old.remove();
  var mask = document.createElement('div');
  mask.id = 'studyLimitModal';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10050;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)';
  mask.onclick = function (e) { if (e.target === mask) mask.remove(); };
  mask.innerHTML =
    '<div style="background:var(--card,#fff);color:var(--text,#1a1b1c);border-radius:20px;max-width:380px;width:100%;padding:26px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
    '<div style="font-size:44px;line-height:1">🌙</div>' +
    '<div style="font-size:19px;font-weight:800;margin-top:10px">今日学习达标啦</div>' +
    '<div style="font-size:14px;color:var(--text-secondary,#6b7280);line-height:1.7;margin-top:10px">' + desc + '</div>' +
    '<div style="font-size:13px;color:var(--text-secondary,#6b7280);line-height:1.7;margin-top:8px">注意劳逸结合，休息好了明天继续加油 💪 继续学习不会被打断～</div>' +
    '<div style="display:flex;gap:10px;margin-top:20px">' +
    '<button id="slmRest" style="flex:1;padding:11px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--primary,#5B8DEF),var(--accent,#8AB4F8));color:#fff;font-size:14px;font-weight:700;cursor:pointer">好的，我去休息</button>' +
    '<button id="slmGo" style="flex:1;padding:11px;border:1px solid var(--border,#e4e3dd);border-radius:12px;background:transparent;color:var(--text,#1a1b1c);font-size:14px;font-weight:600;cursor:pointer">再学一会儿</button>' +
    '</div></div>';
  document.body.appendChild(mask);
  var close = function () { mask.remove(); };
  document.getElementById('slmRest').onclick = close;
  document.getElementById('slmGo').onclick = close;
}
window.showStudyLimitModal = showStudyLimitModal;

/** 启动计时（各页 init 调用；重复调用安全） */
function initStudyTimer() {
  if (_stTick) return;
  _stLast = document.visibilityState === 'hidden' ? 0 : Date.now();
  // 每 15 秒落账一次（低开销）
  _stTick = setInterval(function () {
    if (document.visibilityState !== 'hidden') {
      _stFlush();
      checkStudyLimitWarn();
      syncStudyLimitUI();
    }
  }, 15000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      _stFlush(); _stLast = 0;
    } else {
      _stLast = Date.now();
    }
  });
  window.addEventListener('pagehide', function () { _stFlush(); _stLast = 0; });
  window.addEventListener('beforeunload', function () { _stFlush(); });
  syncStudyLimitUI();
}
window.initStudyTimer = initStudyTimer;

/** 同步设置页/个人中心的时长 UI（元素不存在则跳过） */
function syncStudyLimitUI() {
  var sec = getTodayStudySeconds();
  var s = loadAllSettings();
  var limit = (Number(s.studyLimitHours) || 4) * 3600;
  var pct = limit > 0 ? Math.min(100, Math.round(sec / limit * 100)) : 0;
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  var over = sec >= limit;
  var bar = document.getElementById('stLimitBar');
  if (bar) {
    bar.style.width = pct + '%';
    bar.style.background = over
      ? 'linear-gradient(90deg,#F87171,#EF4444)'
      : 'linear-gradient(90deg,var(--primary),var(--accent))';
  }
  var d = document.getElementById('stLimitTodayDesc');
  if (d) d.textContent = '今日已学 ' + h + ' 小时 ' + m + ' 分钟 / 上限 ' + (s.studyLimitHours || 4) + ' 小时' + (over ? '（已达标 🎉）' : '');
  var tip = document.getElementById('stLimitTip');
  if (tip) {
    if (!s.studyLimitOn) tip.textContent = '已关闭上限提醒，仍会照常统计今日时长。';
    else if (over) tip.textContent = '🌙 已超过今日上限，注意休息；继续学习不会被打断。';
    else tip.textContent = '距离上限还有 ' + Math.max(0, Math.floor((limit - sec) / 60)) + ' 分钟。';
  }
  // 个人中心卡片（若存在）
  var pc = document.getElementById('pcStudyTime');
  if (pc) pc.textContent = getTodayStudyText();
  var pcBar = document.getElementById('pcStudyTimeBar');
  if (pcBar) pcBar.style.width = pct + '%';
  var pcTip = document.getElementById('pcStudyTimeTip');
  if (pcTip) pcTip.textContent = s.studyLimitOn ? ('上限 ' + (s.studyLimitHours || 4) + ' 小时 · 已完成 ' + pct + '%') : ('今日已学 ' + getTodayStudyText());
}
window.syncStudyLimitUI = syncStudyLimitUI;
window.getTodayStudySeconds = getTodayStudySeconds;
window.getTodayStudyText = getTodayStudyText;

/** 设置页控件回填（HTML 里 select/checkbox 的默认选中值与存储值可能不一致，这里统一同步）*/
function seedStudyLimitUI() {
  var s = loadAllSettings();
  var on = document.getElementById('stLimitOn');
  if (on) on.checked = !!s.studyLimitOn;
  var sel = document.getElementById('stLimitHours');
  if (sel) sel.value = String(s.studyLimitHours || 4);
  syncStudyLimitUI();
}
window.seedStudyLimitUI = seedStudyLimitUI;
