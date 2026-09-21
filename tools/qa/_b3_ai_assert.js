/**
 * B3 专用断言：申论刷题.html · C12 AI 批改接线
 * 用法：QA_PORT=8911 node tools/qa/_b3_ai_assert.js
 * 断言：
 *  A. 页面正常加载；typeof callAI
 *  B. 「AI 批改」按钮 #slAiBtn 存在且可点
 *  C. 注入 callAI 桩 → 点击按钮 → 结果渲染进 #slAiBox；加载态按钮禁用+文案
 *  D. 注入抛错 callAI → 不白屏、#slAiBox 有错误提示、无未捕获异常
 *  E. 空白作答时不调用（禁止自动发问 / 限频保护）
 *  F. 未点击时 callAI 调用次数 = 0（禁止自动发问）
 */
const { JSDOM, VirtualConsole } = require('D:\\下载的文件\\学习工作台\\tools\\verifier\\node_modules\\jsdom');
const fs = require('fs');
const QA = require('./_qa_origin.js');

const TARGET = '申论刷题.html';
const log = [];
const R = [];   // assertion results
function say(s) { log.push(String(s)); }
function ok(name, cond, extra) {
  R.push({ name: name, pass: !!cond, extra: extra === undefined ? '' : String(extra) });
  say((cond ? 'PASS  ' : 'FAIL  ') + name + (extra === undefined ? '' : '   [' + extra + ']'));
}

(async () => {
  const src = await QA.resolve();
  say(QA.sourceBanner(src));
  const got = await QA.fetchPage(src.origin, TARGET);
  if (!got.ok) { say('FETCH_FAIL HTTP ' + got.status); console.log('DONE'); return QA.shutdown(src.server); }

  const vc = new VirtualConsole();
  const uncaught = [];
  vc.on('jsdomError', e => uncaught.push('JSDOM_ERR: ' + (e && e.message ? e.message : e)));
  vc.on('error', (...a) => uncaught.push('ERR: ' + a.map(String).join(' ').slice(0, 300)));

  const dom = new JSDOM(got.html, {
    url: got.url, runScripts: 'dangerously', resources: 'usable',
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) { QA.baseBeforeParse(src.origin)(window); }
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 9000));

  // ---------- A ----------
  say('== A. 页面加载 ==');
  say('URL = ' + got.url);
  say('html bytes = ' + got.html.length);
  say('typeof window.callAI = ' + typeof w.callAI);
  ok('A1 页面已渲染（body 文本 > 3000 字符）', (w.document.body.textContent || '').length > 3000, (w.document.body.textContent || '').length);
  w.__calls = 0;                          // 计数桩
  const realCallAI = w.callAI;

  // ---------- F. 未点击时不得调用 ----------
  say('== F. 禁止自动发问 ==');
  // 用计数桩替换，静置 1.5s，看是否有自动调用
  w.callAI = function () { w.__calls++; return Promise.resolve({ text: 'x' }); };
  await new Promise(r => setTimeout(r, 1500));
  ok('F1 静置 1.5s 内 callAI 自动调用次数 = 0', w.__calls === 0, 'calls=' + w.__calls);

  // 打开一道题（进入作答视图），再次确认不自动调用
  const qid = (w.SL && w.SL.data && w.SL.data.length) ? w.SL.data[0].id : (function () {
    const m = got.html.match(/slBootstrap|SL\.data/); return m ? null : null;
  })();
  say('SL.data 长度 = ' + (w.SL && w.SL.data ? w.SL.data.length : 'n/a') + ' ; 首题 id = ' + qid);
  if (qid && typeof w.slGoQuestion === 'function') {
    w.slGoQuestion(qid);
    await new Promise(r => setTimeout(r, 400));
  }
  ok('F2 打开题目后 callAI 仍未自动调用', w.__calls === 0, 'calls=' + w.__calls);

  const btn = w.document.getElementById('slAiBtn');
  const box = w.document.getElementById('slAiBox');
  const ta = w.document.getElementById('slAnswerBox');
  say('#slAiBtn 存在 = ' + !!btn + ' ; #slAiBox 存在 = ' + !!box + ' ; #slAnswerBox 存在 = ' + !!ta);

  // ---------- B ----------
  say('== B. 按钮存在且可点 ==');
  ok('B1 #slAiBtn 存在', !!btn);
  ok('B2 #slAiBox 存在', !!box);
  ok('B3 #slAnswerBox 存在', !!ta);
  ok('B4 按钮初始可用(disabled=false)', btn && btn.disabled === false, btn ? 'disabled=' + btn.disabled : 'no btn');
  ok('B5 按钮文案含「AI 批改」', btn && (btn.textContent || '').indexOf('AI 批改') >= 0, btn ? btn.textContent.replace(/\s+/g, ' ').trim() : '');

  // ---------- E. 空白作答不调用 ----------
  say('== E. 空白作答保护 ==');
  if (btn && ta) {
    ta.value = '';
    w.__calls = 0;
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 300));
    ok('E1 空白作答点击后 callAI 未被调用', w.__calls === 0, 'calls=' + w.__calls);
  }

  // ---------- C. 正常批改（桩） ----------
  say('== C. 注入 callAI 桩 → 点击 → 结果渲染 ==');
  let capturedFuncType = null, capturedMessages = null;
  w.__resolveStub = null;
  w.callAI = function (funcType, messages, opts) {
    w.__calls++;
    capturedFuncType = funcType;
    capturedMessages = messages;
    return new Promise(function (res) { w.__resolveStub = res; });
  };
  if (btn && ta) {
    ta.value = '一是加强组织领导，成立工作专班；二是完善制度保障，明确考核细则；三是强化宣传引导，营造良好氛围。';
    w.__calls = 0;
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 200));

    ok('C1 点击后 callAI 被调用 1 次', w.__calls === 1, 'calls=' + w.__calls);
    ok('C2 funcType 与项目口径一致(longtext)', capturedFuncType === 'longtext', 'funcType=' + capturedFuncType);
    ok('C3 messages 为 [role,content] 结构', !!(capturedMessages && capturedMessages[0] && capturedMessages[0].role === 'user' && typeof capturedMessages[0].content === 'string'), capturedMessages ? 'len=' + String(capturedMessages[0].content).length : 'null');
    ok('C4 prompt 含考生作答内容', !!(capturedMessages && String(capturedMessages[0].content).indexOf('加强组织领导') >= 0));
    // 加载态
    ok('C5 加载期按钮禁用(disabled=true)', btn.disabled === true, 'disabled=' + btn.disabled);
    ok('C6 加载期按钮文案含「AI 正在批改」', (btn.textContent || '').indexOf('AI 正在批改') >= 0, btn.textContent.replace(/\s+/g, ' ').trim());
    ok('C7 加载期 #slAiBox 已展开(on)', box.className.indexOf('on') >= 0, box.className);
    ok('C8 加载期显示「AI 正在批改…」', (box.textContent || '').indexOf('AI 正在批改') >= 0);
    // 结算
    if (w.__resolveStub) w.__resolveStub({ text: '1. 总分：14/20，要点基本齐全。\n2. 采分点对照：组织领导（写到）；制度保障（部分写到）；漏：督导问责。\n3. 主要问题：要点缺失 1 条。\n4. 提分建议：补充督导问责条款。', modelUsedName: 'stub-model' });
    await new Promise(r => setTimeout(r, 300));
    const btxt = (box.textContent || '');
    ok('C9 结果渲染进 #slAiBox', btxt.indexOf('采分点对照') >= 0, btxt.replace(/\s+/g, ' ').slice(0, 120));
    ok('C10 结果含总分', btxt.indexOf('14/20') >= 0);
    ok('C11 结算后按钮恢复可用+文案复原', btn.disabled === false && (btn.textContent || '').indexOf('AI 批改') >= 0, 'disabled=' + btn.disabled + ' txt=' + btn.textContent.replace(/\s+/g, ' ').trim());
    ok('C12 结果含 modelUsedName meta', btxt.indexOf('stub-model') >= 0 || btxt.indexOf('仅供参考') >= 0);
    ok('C13 结果区非错误态(无 sl-ai-err)', box.className.indexOf('sl-ai-err') < 0, box.className);
  }

  // ---------- D. callAI 抛错 → 不白屏 ----------
  say('== D. callAI 抛错降级 ==');
  w.callAI = function () { throw new Error('SYNTHETIC_FAIL_500'); };
  if (btn && ta) {
    ta.value = '测试降级：这是一段用于触发异常分支的作答文本。';
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 300));
    const dtxt = (box.textContent || '');
    ok('D1 同步抛错 → #slAiBox 有错误区块', dtxt.indexOf('AI 暂时不可用') >= 0, dtxt.replace(/\s+/g, ' ').slice(0, 120));
    ok('D2 错误区块带 sl-ai-err 样式', box.className.indexOf('sl-ai-err') >= 0, box.className);
    ok('D3 错误信息含原因', dtxt.indexOf('SYNTHETIC_FAIL_500') >= 0);
    ok('D4 抛错后按钮恢复可用', btn.disabled === false, 'disabled=' + btn.disabled);
    ok('D5 页面其余功能不受影响（题干区仍在）', (w.document.body.textContent || '').indexOf('作答要求') >= 0);
  }
  // 异步 reject
  say('== D\'. callAI 返回 rejected Promise ==');
  w.callAI = function () { var p = Promise.reject(new Error('ASYNC_FAIL_TIMEOUT')); p.catch(function () {}); return p; };
  if (btn && ta) {
    ta.value = '测试异步失败分支的作答文本内容。';
    w.__calls = 0;
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 500));
    const t2 = (box.textContent || '');
    ok("D'1 异步 reject → 错误区块出现", t2.indexOf('AI 暂时不可用') >= 0, t2.replace(/\s+/g, ' ').slice(0, 120));
    ok("D'2 异步错误含原因", t2.indexOf('ASYNC_FAIL_TIMEOUT') >= 0);
    ok("D'3 按钮恢复可用", btn.disabled === false);
  }
  // 限频标识
  say("== D''. rateLimited 提示 ==");
  w.callAI = function () { var e = new Error('too many requests'); e.rateLimited = true; var p = Promise.reject(e); p.catch(function () {}); return p; };
  if (btn && ta) {
    ta.value = '测试限频提示分支。';
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 400));
    ok("D''1 限频提示显示「10 次/分钟」", (box.textContent || '').indexOf('10 次/分钟') >= 0, (box.textContent || '').replace(/\s+/g, ' ').slice(0, 140));
  }

  // ---------- 未捕获异常 ----------
  say('== 未捕获异常 ==');
  say('uncaught: ' + (uncaught.length ? uncaught.join(' | ') : '(无)'));
  const realErrs = uncaught.filter(function (x) { return x.indexOf('navigation to another Document') < 0; });
  ok('X1 无未捕获 JS 异常（排除 jsdom 导航噪声）', realErrs.length === 0, realErrs.join(' | '));

  // ---------- 汇总 ----------
  const pass = R.filter(r => r.pass).length;
  say('');
  say('========== 汇总 ' + pass + '/' + R.length + ' PASS ==========');
  R.forEach(function (r) { say((r.pass ? 'PASS' : 'FAIL') + '  ' + r.name + (r.extra ? '   [' + r.extra + ']' : '')); });

  fs.writeFileSync('D:\\下载的文件\\学习工作台\\_b3_ai_assert.txt', log.join('\n'), 'utf8');
  console.log('DONE  ' + pass + '/' + R.length);
  await QA.shutdown(src.server);
  process.exit(0);
})().catch(function (e) {
  fs.writeFileSync('D:\\下载的文件\\学习工作台\\_b3_ai_assert.txt', log.join('\n') + '\nFATAL ' + (e && e.stack ? e.stack : e), 'utf8');
  console.log('FATAL');
  process.exit(1);
});
