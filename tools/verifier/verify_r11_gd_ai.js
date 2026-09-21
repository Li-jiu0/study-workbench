/* R11 群面（无领导小组讨论）AI 化改造冒烟测试
 * 校验：① 题目列表无「随机抽题」按钮且铺满；② 进入讨论后 #gdMergeBar 隐藏、按钮文案为「← 返回」；
 * ③ #gdTyping 提示存在；④ 用户发言触发 callAI（用桩捕获 payload）；⑤ callAI 不可用时回退本地模板不报错。
 * 运行：node tools/verifier/verify_r11_gd_ai.js   （cwd 任意）
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = path.join(ROOT, '面测.html');

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

function localStorageShim(win) {
  // 项目金标准：必须用 Object.defineProperty 垫 localStorage（老内核语义）
  const store = {};
  try {
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      value: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        clear: () => { for (const k in store) delete store[k]; },
        key: i => Object.keys(store)[i] || null,
        get length() { return Object.keys(store).length; }
      }
    });
  } catch (e) { /* ignore */ }
}

(async function main() {
  const html = fs.readFileSync(HTML, 'utf8');
  const dom = new JSDOM(html, {
    url: 'file://' + HTML.replace(/\\/g, '/'),
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  localStorageShim(window);

  // --- 桩：最小可运行环境（不做全站脚本注入，只验证 group-discussion 自身逻辑） ---
  window.uiConfirm = () => Promise.resolve(true);
  window.toast = () => {};
  window.showToast = () => {};
  window.navigateTo = () => {};
  window.recordStudy = () => {};
  window.GroupDiscussion = undefined;

  // --- 注入 group-discussion.js ---
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'group-discussion.js'), 'utf8');
  window.eval(src);
  const GD = window.GroupDiscussion;
  assert('GroupDiscussion 全局已暴露', !!GD && typeof GD.open === 'function');

  // --- 宿主：面测.html 自带 #gdAiPane 与 #gdMergeBar（勿再造重复 id） ---
  const bar = window.document.getElementById('gdMergeBar');
  const pane = window.document.getElementById('gdAiPane');
  assert('宿主 #gdAiPane 存在于页面', !!pane);
  assert('宿主 #gdMergeBar 存在于页面', !!bar);

  // --- ① 打开：题目列表 ---
  GD.open();
  const content = pane.querySelector('#gdContent');
  assert('题目列表已渲染进 #gdAiPane', !!content && content.innerHTML.length > 100);
  assert('「随机抽题」按钮已删除', content.innerHTML.indexOf('随机抽题') === -1);
  assert('仍有 4 张题目卡', content.querySelectorAll('.gd-card').length === 4, String(content.querySelectorAll('.gd-card').length));
  assert('出现轻量说明条 gd-count-top', !!content.querySelector('.gd-count-top'));
  assert('列表态返回栏可见', bar.style.display !== 'none');

  // --- ② 进入讨论 ---
  GD.select('island');
  const disc = pane.querySelector('.gd-disc-view');
  assert('讨论视图已渲染', !!disc);
  const backBtn = disc.querySelector('.gd-back');
  assert('回退按钮文案为「← 返回」（原「← 换题」）', !!backBtn && backBtn.textContent.indexOf('返回') !== -1, backBtn && backBtn.textContent);
  assert('回退按钮不再是「换题」', !!backBtn && backBtn.textContent.indexOf('换题') === -1);
  assert('进入讨论后 #gdMergeBar 已隐藏（顶部空间还给对话区）', bar.style.display === 'none', 'display=' + bar.style.display);
  assert('「正在思考发言…」提示节点存在', !!disc.querySelector('#gdTyping'));

  // --- ③ AI 接入：桩 callAI 捕获 payload ---
  let captured = null;
  window.callAI = function (funcType, messages, opts) {
    captured = { funcType: funcType, messages: messages, opts: opts };
    return Promise.resolve({ text: '【AI测试发言】我认为应该先定标准。' });
  };
  GD.select('island');   // 重新进入，触发领导者开场
  await new Promise(r => setTimeout(r, 700));
  assert('开场触发了 callAI', !!captured, 'captured=' + JSON.stringify(captured));
  if (captured) {
    assert('callAI funcType=auto', captured.funcType === 'auto');
    const sys = captured.messages.find(m => m.role === 'system');
    assert('system 提示词包含题目与人设', !!sys && sys.content.indexOf('荒岛求生') !== -1 && sys.content.indexOf('领导者') !== -1);
  }
  await new Promise(r => setTimeout(r, 400));
  const msgsAfterOpen = pane.querySelectorAll('#gdMessages .gd-msg').length;
  if (process.env.GD_DEBUG) {
    pane.querySelectorAll('#gdMessages .gd-msg-bubble').forEach(b =>
      console.log('   [dbg] bubble:', b.textContent.slice(0, 50)));
    console.log('   [dbg] messagesHTML len =', pane.querySelector('#gdMessages').innerHTML.length);
  }
  assert('开场后出现 1 条角色消息', msgsAfterOpen === 1, String(msgsAfterOpen));

  // 用户发言 → 角色回应
  const input = pane.querySelector('#gdInput');
  input.value = '我觉得应该优先带急救药品和净水器。';
  captured = null;
  GD.sendUserMessage();
  await new Promise(r => setTimeout(r, 1700));
  const msgsAll = pane.querySelectorAll('#gdMessages .gd-msg').length;
  assert('用户发言已入列', msgsAll >= 2, String(msgsAll));
  assert('用户发言触发了 callAI 回应', !!captured);
  const body = pane.querySelector('#gdMessages').textContent;
  assert('AI 回复已渲染进消息区', body.indexOf('AI测试发言') !== -1);

  // --- ④ 下一轮 ---
  captured = null;
  GD.nextRound();
  await new Promise(r => setTimeout(r, 5500));
  assert('下一轮触发了 callAI（全员发言）', !!captured);

  // --- ⑤ 回退：AI 不可用时回退本地模板，不抛错 ---
  delete window.callAI;
  GD.select('budget');
  await new Promise(r => setTimeout(r, 700));
  const msgsFallback = pane.querySelectorAll('#gdMessages .gd-msg').length;
  assert('无 callAI 时回退本地模板（仍有开场发言）', msgsFallback === 1, String(msgsFallback));

  // --- ⑥ 返回题目列表，返回栏恢复 ---
  GD.back();
  assert('返回题目列表后 #gdMergeBar 恢复显示', bar.style.display !== 'none', 'display=' + bar.style.display);
  assert('列表重新渲染', !!pane.querySelector('#gdContent .gd-card'));

  console.log('\nRESULT: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e && e.stack || e); process.exit(2); });
