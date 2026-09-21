// 验证「他人点开我的主页」能看见个人资料：直接调用 api.js 的 renderUserHome
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/下载的文件/学习工作台';

const html = fs.readFileSync(path.join(ROOT, '个人中心.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/个人中心.html', pretendToBeVisual: true });
const w = dom.window;
w.API_BASE = '';

// 先加载 app.js（提供 esc / loadAllSettings 等）
try { w.eval(fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8')); } catch (e) { console.log('[app.js]', e.message); }
// 再加载 api.js（其后加载，覆盖为在线版）
try { w.eval(fs.readFileSync(path.join(ROOT, 'assets/api.js'), 'utf8')); } catch (e) { console.log('[api.js]', e.message); }

let pass = 0, fail = 0;
function check(l, c, d) { if (c) { pass++; console.log('  ✔ ' + l + (d ? '  → ' + d : '')); } else { fail++; console.log('  ✘ ' + l + '  *** 失败 ***' + (d ? '  → ' + d : '')); } }

// 模拟服务端 /api/users/{id} 的返回
const fakeUser = {
  id: 9,
  nickname: '探针用户',
  username: 'probe2',
  avatarUrl: null,
  motto: '每天进步一点点',
  bio: '这是用于验证公开主页展示的个人简介，长度超过十个字。',
  city: '杭州',
  goal: '上岸央国企',
  tags: '四级,行测,央国企',
  createdAt: '2026-09-11 11:04',
  isMe: false,
  stats: { published: 3, likes: 12, comments: 5, views: 88 },
  notes: []
};

console.log('========== 「他人视角」公开主页渲染 ==========');
console.log('函数就绪: renderUserHome =', typeof w.renderUserHome, ', _tagChips =', typeof w._tagChips, ', _goalLine =', typeof w._goalLine);

// 造一个容器
const box = w.document.createElement('div');
box.id = 'otherHome';
w.document.body.appendChild(box);

// 拦截 api()：/api/users/9 返回 fakeUser，其余返回空
w.api = function (p) {
  if (/^\/api\/users\/\d+/.test(p)) return Promise.resolve(fakeUser);
  if (/friends|relationship/.test(p)) return Promise.resolve({ friends: false, isFriend: false });
  return Promise.resolve({});
};

async function run() {
  let rendered = '';
  try {
    if (typeof w.renderUserHome === 'function') {
      await w.renderUserHome(9, box);
      rendered = box.innerHTML;
    }
  } catch (e) { console.log('  [renderUserHome 调用异常]', e.message); }
  if (!rendered) rendered = w.document.body.innerHTML;

  // 断言关键信息是否出现在页面上
  check('显示昵称', rendered.includes('探针用户'));
  check('显示个性签名', rendered.includes('每天进步一点点'));
  check('显示个人简介', rendered.includes('这是用于验证公开主页展示的个人简介'));
  check('显示所在城市', rendered.includes('杭州'));
  check('显示学习目标', rendered.includes('上岸央国企'));
  check('显示备考标签-四级', rendered.includes('四级'));
  check('显示备考标签-行测', rendered.includes('行测'));
  check('显示备考标签-央国企', rendered.includes('央国企'));
  check('显示加入时间', rendered.includes('2026-09-11'));
  check('显示创作数据', rendered.includes('12') || rendered.includes('88'));
  check('不泄露手机号', !/1[3-9]\d{9}/.test(rendered));
  check('不泄露性别符号', !/♂|♀/.test(rendered));
  check('不泄露年龄', !/\d+岁/.test(rendered));
  check('不泄露生日', !/2003-05-20/.test(rendered));

  // 直接验证两个渲染辅助函数
  if (typeof w._tagChips === 'function') {
    const chips = w._tagChips('四级,行测，央国企,  ,四级 ');
    const n = (chips.match(/<span class="pp-tag">/g) || []).length;
    check('_tagChips 中文逗号分割+去重+去空', n === 3, '实际生成 ' + n + ' 个标签');
    check('_tagChips 空值返回空串', w._tagChips('') === '');
  }
  if (typeof w._goalLine === 'function') {
    check('_goalLine 有值时带 🎯', w._goalLine('上岸').includes('🎯'));
    check('_goalLine 空值返回空串', w._goalLine('') === '');
  }

  console.log('');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项  ' + (fail === 0 ? '✅ 全部通过' : '❌ 存在失败'));
  process.exit(fail === 0 ? 0 : 1);
}
run();
