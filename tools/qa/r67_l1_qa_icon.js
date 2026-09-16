// R67 线1 图标升级 QA：jsdom 行为断言（emoji 全量 SVG 化 + 行为零回归）
// 只读被测文件；不发真实请求；覆盖：SVG 落位 / emoji 归零 / 交互行为保真
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(process.env.NODE_PATH || 'C:/Users/ATM/node_modules', 'jsdom'));

const BASE = 'D:/下载的文件/学习工作台';
const out = [];
let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; out.push('[PASS] ' + name + (info ? '  ' + info : '')); }
  else { fail++; out.push('[FAIL] ' + name + (info ? '  ' + info : '')); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// 任务书「图标 emoji 归零」清单（含变体选择符与装饰星）
const EMOJIS = ['🔌', '👁', '🔄', '🧠', '⏳', '✅', '❌', '✏', '🗑', '⠿', '🔒', '↑', '↓', '✕', '★', '▾', '▴', '️'];

(async function () {
  // ===== 0) 源码级：两文件 emoji 字符 0 命中 =====
  const htmlSrc = fs.readFileSync(path.join(BASE, 'ai-settings.html'), 'utf8');
  const jsSrc = fs.readFileSync(path.join(BASE, 'assets/ai-settings.js'), 'utf8');
  const hitH = EMOJIS.filter(function (e) { return htmlSrc.indexOf(e) !== -1; });
  const hitJ = EMOJIS.filter(function (e) { return jsSrc.indexOf(e) !== -1; });
  ok('源码: ai-settings.html 图标 emoji 0 命中', hitH.length === 0, hitH.length ? '残留: ' + hitH.join('') : '');
  ok('源码: ai-settings.js 图标 emoji 0 命中（★ 经 \\u2605 转义保留数据解析）', hitJ.length === 0, hitJ.length ? '残留: ' + hitJ.join('') : '');
  ok('源码: html 内联 svg ≥6 处（含页头返回按钮）', (htmlSrc.match(/<svg/g) || []).length >= 6,
     'count=' + (htmlSrc.match(/<svg/g) || []).length);
  ok('源码: js 图标库内联 svg ≥3 行', (jsSrc.match(/<svg/g) || []).length >= 3,
     'count=' + (jsSrc.match(/<svg/g) || []).length);

  // ===== jsdom 环境 =====
  const dom = new JSDOM(htmlSrc, {
    url: 'http://localhost/ai-settings.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const win = dom.window;
  const doc = win.document;
  win.localStorage.clear();
  const now = Date.now();
  win.localStorage.setItem('ai_model_settings', JSON.stringify({
    disabled: {}, order: [], overrides: {}, catModels: {}, categories: [], stars: {},
    health: {
      'glm-4.7-flash': { ok: true, ms: 420, err: null, at: now },
      'glm-4.5-flash': { ok: false, ms: 0, err: 'timeout', at: now }
    }
  }));
  win.localStorage.setItem('ai_custom_models', JSON.stringify([
    { id: 'my-model', name: '我的模型', apiUrl: 'https://example.com/v1/chat/completions', apiKey: 'sk-x', apiFormat: 'openai', types: ['general'], stars: 3 }
  ]));
  win.localStorage.setItem('ai_memory', JSON.stringify(['记忆A']));
  win.aiHealthCheck = function () { return new Promise(function () {}); };
  win.uiConfirm = function () { return Promise.resolve(true); };
  win.eval(fs.readFileSync(path.join(BASE, 'assets/ai-config.js'), 'utf8'));
  win.eval(fs.readFileSync(path.join(BASE, 'assets/ai-settings.js'), 'utf8'));
  await sleep(120);

  const $ = function (id) { return doc.getElementById(id); };

  // ===== 1) HTML 静态按钮 SVG 落位 =====
  const bh = $('setBatchHealth');
  ok('SVG: #setBatchHealth 含内联 svg + 文本 span', !!(bh && bh.querySelector('svg') && $('setBatchHealthTxt')), '');
  ok('SVG: #setBatchHealthTxt 初始文案=批量检测', !!$('setBatchHealthTxt') && $('setBatchHealthTxt').textContent === '批量检测');
  ok('SVG: #setFmKeyEye 含内联 svg', !!($('setFmKeyEye') && $('setFmKeyEye').querySelector('svg')));
  const adv = $('setFmAdvToggle');
  ok('SVG: #setFmAdvToggle 含旋转箭头 svg.xt-adv-arrow + 文本 span',
     !!(adv && adv.querySelector('svg.xt-adv-arrow') && adv.querySelector('span')));
  ok('SVG: #setRedetectAll 含内联 svg', !!($('setRedetectAll') && $('setRedetectAll').querySelector('svg')));
  const memTitle = doc.querySelector('.xt-about-block-t');
  ok('SVG: 记忆管理标题含内联 svg', !!(memTitle && memTitle.querySelector('svg')));

  // ===== 2) JS 动态渲染图标 =====
  const row0 = doc.querySelector('[data-model-id="glm-4.7-flash"]');
  ok('SVG: 模型行拖拽手柄 svg（无 ⠿）', !!(row0 && row0.querySelector('.xt-drag-handle svg') && row0.querySelector('.xt-drag-handle').textContent.indexOf('⠿') === -1));
  ok('SVG: 编辑按钮 svg（无 ✏）', !!(row0.querySelector('[data-edit] svg') && row0.querySelector('[data-edit]').textContent.indexOf('✏') === -1));
  ok('SVG: 上移/下移按钮 svg（无 ↑↓）',
     !!(row0.querySelector('[data-up] svg') && row0.querySelector('[data-down] svg') &&
        row0.querySelector('[data-up]').textContent.indexOf('↑') === -1));
  const starSpan = row0.querySelector('.xt-stars [data-star-n="3"]');
  ok('SVG: 星级实心 svg（点亮=fill currentColor）', !!(starSpan && starSpan.querySelector('svg') &&
     starSpan.querySelector('svg').getAttribute('fill') === 'currentColor'));
  const starOffSpan = doc.querySelector('[data-model-id="qwen2.5-7b"] .xt-stars [data-star-n="4"]');
  ok('SVG: 星级描边 svg（未点亮=fill none）', !!(starOffSpan && starOffSpan.querySelector('svg') &&
     starOffSpan.querySelector('svg').getAttribute('fill') === 'none'));
  const hOk = row0.querySelector('[data-health]');
  ok('SVG: 健康徽章(正常)含 check svg', !!(hOk && hOk.querySelector('svg')));
  const rowFail = doc.querySelector('[data-model-id="glm-4.5-flash"]');
  const hFail = rowFail.querySelector('[data-health]');
  ok('SVG: 健康徽章(失败)含 cross svg', !!(hFail && hFail.querySelector('svg') &&
     hFail.textContent.indexOf('失败') !== -1));
  const rowPend = doc.querySelector('[data-model-id="glm-4-flash"]');
  const hPend = rowPend.querySelector('[data-health]');
  ok('SVG: 健康徽章(待检测)含 svg', !!(hPend && hPend.querySelector('svg')));
  const rowCus = doc.querySelector('[data-model-id="my-model"]');
  ok('SVG: 自定义行删除按钮 svg（无 🗑）', !!(rowCus && rowCus.querySelector('[data-del] svg') &&
     rowCus.querySelector('[data-del]').textContent.indexOf('🗑') === -1));

  // 分类链按钮
  $('setTabFunc').click();
  const catUp = doc.querySelector('[data-cat-up]');
  const catRm = doc.querySelector('[data-cat-rm]');
  ok('SVG: 分类链上移/移出按钮 svg（无 ↑ ✕）',
     !!(catUp && catUp.querySelector('svg') && catRm && catRm.querySelector('svg') &&
        catRm.textContent.indexOf('✕') === -1));

  // 记忆删除按钮
  $('setTabAbout').click();
  const memDel = doc.querySelector('[data-mem-del]');
  ok('SVG: 记忆删除按钮 svg（无 🗑）', !!(memDel && memDel.querySelector('svg')));

  // 表单星级
  $('setTabAdd').click();
  const fs0 = $('setFmStars').querySelector('[data-form-star="1"]');
  ok('SVG: 表单星级按钮 svg（无 ★ 字符）',
     !!(fs0 && fs0.querySelector('svg') && $('setFmStars').textContent.indexOf('★') === -1));

  // Key 状态行锁形 SVG
  $('setTabModels').click();
  doc.querySelector('[data-model-id="glm-4.6v-flash"] [data-edit]').click();
  const ks = $('setFmKeyState');
  ok('SVG: Key 状态行含锁形 svg（无 🔒 emoji）',
     !!(ks && ks.querySelector('svg') && ks.textContent.indexOf('已使用平台内置密钥') !== -1 &&
        ks.textContent.indexOf('🔒') === -1));

  // ===== 3) 行为保真 =====
  ok('行为: 编辑表单打开（事件委托未破）', $('setFmTitle').textContent.indexOf('编辑模型') === 0);
  $('setFmCancel').click();
  doc.querySelector('[data-model-id="qwen2.5-7b"] [data-star-n="4"]').click();
  const stNow = JSON.parse(win.localStorage.getItem('ai_model_settings'));
  ok('行为: 星级点击仍写 stars', stNow.stars['qwen2.5-7b'] === 4);
  $('setFmAdvToggle').click();
  ok('行为: 高级设置展开（display block + .open 类旋转箭头）',
     $('setFmAdv').style.display === 'block' && $('setFmAdvToggle').className.indexOf('open') !== -1);
  $('setFmAdvToggle').click();
  ok('行为: 高级设置折叠复位', $('setFmAdv').style.display === 'none' &&
     $('setFmAdvToggle').className.indexOf('open') === -1);
  $('setBatchHealthTxt').textContent = '检测中 1/24';
  ok('行为: 批量按钮文案 span 可更新（SVG 不被抹掉）',
     $('setBatchHealthTxt').textContent === '检测中 1/24' && !!$('setBatchHealth').querySelector('svg'));

  // ===== 4) 渲染态 emoji 全量归零 =====
  const bodyHtml = doc.body.innerHTML;
  const domHits = EMOJIS.filter(function (e) { return bodyHtml.indexOf(e) !== -1; });
  ok('DOM: 全页渲染后图标 emoji 0 命中', domHits.length === 0, domHits.length ? '残留: ' + domHits.join('') : '');

  out.push('');
  out.push('===== R67 线1 图标测试汇总: PASS=' + pass + ' FAIL=' + fail + ' =====');
  fs.writeFileSync(path.join(BASE, 'tools/qa/r67_icon_qa_result.txt'), out.join('\n'), 'utf8');
  console.log(out.join('\n'));
  console.log('EXIT ' + (fail === 0 ? 0 : 1));
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) {
  fs.writeFileSync(path.join(BASE, 'tools/qa/r67_icon_qa_result.txt'),
    out.join('\n') + '\n[ERROR] ' + (e && e.stack ? e.stack : e), 'utf8');
  console.log('[ERROR] ' + (e && e.stack ? e.stack : e));
  process.exit(2);
});
