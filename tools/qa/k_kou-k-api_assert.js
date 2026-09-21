/* 批次 20260913K · kou-k-api 最终自验断言（assets/api.js，含追加范围） */
const fs = require('fs');
const FILE = 'D:/下载的文件/学习工作台/assets/api.js';
const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');
let pass = true;
function ok(m) { console.log('PASS: ' + m); }
function fail(m) { pass = false; console.log('FAIL: ' + m); }
function count(sub) { return lines.filter(l => l.includes(sub)).length; }

console.log('== A. 语法 ==');
console.log('NOTE: node --check 由外层执行并回显');

console.log('== B. K5 云贴评论（上轮成果回归） ==');
src.includes('c.avatarUrl ? apiFileUrl(c.avatarUrl)') ? ok('avatar <img> render present') : fail('avatar render missing');
src.includes('bc-reply') && src.includes('childMap') ? ok('nested bc-reply present') : fail('nested missing');
(src.includes('bc-fold-btn') && src.includes('function toggleBcFold') && src.includes('rawComments.length > 5')) ? ok('fold present') : fail('fold missing');

console.log('== C. 上轮 K6 回归 ==');
count('data-icon="bell" data-icon-size="18"') === 1 ? ok('notifyBell bell') : fail('notifyBell');
count('data-icon="message-square" data-icon-size="18"') === 1 ? ok('chatEntry message-square') : fail('chatEntry');
count("['pen', s.published || 0, '已发布']") === 3 ? ok('six-grid 199/702/1346') : fail('six-grid x' + count("['pen', s.published || 0, '已发布']"));
lines.some(l => l.includes('获评论') && l.includes('data-icon="message-square"')) ? ok('获评论 icon') : fail('获评论 icon');

console.log('== D. 追加清理：旧图标位子串清零 ==');
const gone = [
  "['📝', pub.length", "['📝', s.published", "['📝', s.draft",
  "'📤 已发布']", "'💾 草稿']", "'📁 归档']", "'🔖 收藏']", "'🗑️ 回收站']",
  "icon: '📝'", "'<span>👁 '", "'👍 赞 ${n.likes || 0}'", "'💬 ' + cmt",
  '💬 在线互动</span>', '>💬 好友私信</a>', '🗂️ 我的发贴·回收站', '🔖 我的收藏', '🌍 广场</a>',
  '📚 公开发贴（', '📚 发贴分类分布', '🧭 学习模块',
  '♻️ 恢复</button>', '🗑️ 彻底删除</button>', '🗑️ 删除于 ', '🗑️ 删除</button>',
  '>✏️ 编辑</button>', '✏️ 编辑资料</button>', '🚪 退出登录</button>',
  '>👤 加为好友</button>', '>💬 发消息</button>', '>🗑 删除好友</button>', '>👤 </span>',
  '>📄 导出全部 Markdown</button>', '>📄 导出 Markdown</button>', '>📝 去写发贴</button', '📝 去写发贴</button>',
  '>👤 前往个人中心</button>', '>🎯 学习目标', ">🔥 ' + (d.streakDays", ">⏱ ' + (d.totalHours", ">🧮 ' + (d.totalQuestions", ">🎯 ' + acc",
  '🔍 搜索中…', "'>📱 ", '🔑'
];
gone.forEach(s => { count(s) === 0 ? ok('gone: ' + s) : fail('remains x' + count(s) + ': ' + s); });

console.log('== E. 追加清理：新 data-icon 在位 ==');
const want = [
  ['homeOnlineNav chips', 'data-icon="globe" data-icon-size="12"'],
  ['my-fav chip', 'data-icon="bookmark" data-icon-size="12"'],
  ['noteCardHtml stats', 'data-icon="eye" data-icon-size="12"'],
  ['author fallback user', 'data-icon="user" data-icon-size="14"></span> </span>'],
  ['card actions send/inbox', 'data-icon="send" data-icon-size="12"'],
  ['mine tabs save', "data-icon=\"save\" data-icon-size=\"12\"></span> 草稿"],
  ['trash restore rotate-ccw', 'data-icon="rotate-ccw" data-icon-size="12"'],
  ['detail meta clock', 'data-icon="clock" data-icon-size="12"></span> 更新于'],
  ['detail privacy locked', 'data-icon="locked" data-icon-size="12"></span> 私密'],
  ['detail export download', 'data-icon="download" data-icon-size="14"></span> 导出 Markdown'],
  ['search loading search-icon', 'data-icon="search" data-icon-size="16"></span> 搜索中'],
  ['gs group book-open', 'data-icon="book-open" data-icon-size="14"></span> 公开发贴'],
  ['gs group map', 'data-icon="map" data-icon-size="14"></span> 学习模块'],
  ['goal target', 'data-icon="target" data-icon-size="14" style="vertical-align:-2px"></span> 学习目标'],
  ['study-data fire', 'data-icon="fire" data-icon-size="14"></span> ' + "' + (d.streakDays || 0)"],
  ['study-data clipboard', 'data-icon="clipboard" data-icon-size="14"></span> ' + "' + (d.totalQuestions || 0)"],
  ['tip lightbulb', 'data-icon="lightbulb" data-icon-size="14" style="vertical-align:-2px"></span> 打开任意页面'],
  ['tile book', 'data-icon="book" data-icon-size="22"'],
  ['edit status no-emoji', "textContent = '正在编辑：'"]
];
want.forEach(([n, s]) => { count(s) > 0 ? ok(n + ' present x' + count(s)) : fail(n + ' missing: ' + s); });

console.log('== F. 动态插入 autoRender 兜底 ==');
const ar = count('window.lucideAutoRender) window.lucideAutoRender()');
ar >= 12 ? ok('lucideAutoRender calls x' + ar) : fail('lucideAutoRender calls only x' + ar);

console.log('== G. 残留登记（文案/徽章/注释，不处理） ==');
const re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
let residue = 0;
lines.forEach((l, i) => {
  if (re.test(l)) residue++;
});
console.log('RESIDUE_LINES=' + residue + '（toast 文案 / 徽章墙 / 注释 / 正文，按指示保留）');

console.log(pass ? 'ALL_CHECKS_PASS' : 'HAS_FAILURES');
