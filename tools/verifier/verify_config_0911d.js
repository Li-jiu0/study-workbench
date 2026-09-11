/* verify_config_0911d.js —— 校验 assets/config.js 的地址解析逻辑
   场景：
     A) http/https 场景（在线访问）→ API_BASE 应为 ''（走同源相对路径）
     B) file: 场景（本地双击 / 安卓 APK）→ API_BASE 应为服务端绝对地址
   并确认各消费方（api.js / chat.js / chat-local.js）确实读到了同一个值。
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const CFG = fs.readFileSync(path.join(ROOT, 'assets', 'config.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  -> ' + extra : '')); }
}

function loadConfig(url) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: url,
    runScripts: 'outside-only',
  });
  const w = dom.window;
  w.eval(CFG);
  return w;
}

console.log('\n[1] file:// 场景（本地 / APK）');
{
  const w = loadConfig('file:///D:/app/index.html');
  ok('window.STUDY_API_BASE 为绝对地址', /^https?:\/\/.+:\d+$/.test(w.STUDY_API_BASE), w.STUDY_API_BASE);
  ok('window.STUDY_API_SERVER 已导出', !!w.STUDY_API_SERVER, w.STUDY_API_SERVER);
  ok('getApiBase() 与 STUDY_API_BASE 一致',
     w.getApiBase() === w.STUDY_API_BASE,
     w.getApiBase() + ' vs ' + w.STUDY_API_BASE);
  ok('地址含端口 8000', /:8000$/.test(w.STUDY_API_BASE), w.STUDY_API_BASE);
}

console.log('\n[2] http 场景（在线访问）');
{
  const w = loadConfig('http://example.com/index.html');
  ok('STUDY_API_BASE 为空串（走同源相对路径）', w.STUDY_API_BASE === '', JSON.stringify(w.STUDY_API_BASE));
  ok('STUDY_API_SERVER 仍保留绝对地址供参考', !!w.STUDY_API_SERVER, w.STUDY_API_SERVER);
}

console.log('\n[3] https 场景');
{
  const w = loadConfig('https://example.com/index.html');
  ok('STUDY_API_BASE 为空串', w.STUDY_API_BASE === '', JSON.stringify(w.STUDY_API_BASE));
}

console.log('\n[4] 消费方确实读取共享配置');
{
  const api = fs.readFileSync(path.join(ROOT, 'assets', 'api.js'), 'utf8');
  const chat = fs.readFileSync(path.join(ROOT, 'assets', 'chat.js'), 'utf8');
  const chatLocal = fs.readFileSync(path.join(ROOT, 'assets', 'chat-local.js'), 'utf8');
  const login = fs.readFileSync(path.join(ROOT, '登录.html'), 'utf8');

  ok('api.js 引用 window.STUDY_API_BASE', api.includes('window.STUDY_API_BASE'));
  ok('chat.js 引用 window.STUDY_API_BASE', chat.includes('window.STUDY_API_BASE'));
  ok('chat-local.js 引用 window.STUDY_API_BASE', chatLocal.includes('window.STUDY_API_BASE'));
  ok('登录.html 引用 window.STUDY_API_BASE', login.includes('window.STUDY_API_BASE'));

  // 每个调用点的表达式形如 `window.STUDY_API_BASE != null ? ... : ...`，
  // 其中兜底分支不再重复引用，故按 `!= null` 计数才是真实调用点数。
  const nChatLocal = (chatLocal.match(/window\.STUDY_API_BASE != null/g) || []).length;
  ok('chat-local.js 的 7 处调用点全部改到共享配置（实际 ' + nChatLocal + '）', nChatLocal === 7);
}

console.log('\n[5] 页面注入完整性');
{
  const dir = ROOT;
  const files = fs.readdirSync(dir).filter(f =>
    f.endsWith('.html') &&
    !f.startsWith('学习工作台(2)') &&
    !['settings.html', '设置_旧版.html', 'profile.html', 'blog_wechat.html'].includes(f) &&
    !f.startsWith('settings_') && !f.startsWith('profile_')
  );
  let injected = 0, missing = [];
  for (const f of files) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    if (s.includes('assets/config.js')) injected++;
    else if (s.includes('assets/api.js') || s.includes('API_BASE')) missing.push(f);
  }
  ok('所有需要配置的页面都已注入 config.js', missing.length === 0, missing.join(', '));
  console.log('    已注入 ' + injected + ' / ' + files.length + ' 页');
}

console.log('\n========================================');
console.log('  通过 ' + pass + ' / ' + (pass + fail));
console.log('========================================\n');
process.exit(fail ? 1 : 0);
