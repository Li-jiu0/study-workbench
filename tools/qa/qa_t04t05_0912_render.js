/* =====================================================================
 * qa_t04t05_0912_render.js —— QA 独立验证 §1 图标真实渲染 + §6 file:// 兼容
 * ---------------------------------------------------------------------
 * 与工程师自检的区别：不停留在「页面里有 data-icon 属性」，而是
 *   1) 真的把 assets/icon-map.js 的源码内联进 jsdom 并执行；
 *   2) 断言每个 [data-icon] 元素的 innerHTML 里真出现了 <svg ...>；
 *   3) 校验 SVG 契约属性（stroke=currentColor / viewBox / width / height / 禁用图元）；
 *   4) 负向用例：字典缺 key 时不抛异常、不清空已有内容。
 * 只读脚本，不修改任何业务文件。
 * 运行：node tools/qa/qa_t04t05_0912_render.js
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(
  path.resolve('D:/下载的文件/学习工作台'), 'tools/verifier/node_modules/jsdom'
));

const R = path.resolve('D:/下载的文件/学习工作台');

// ---------- 极简断言框架 ----------
let PASS = 0, FAIL = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { PASS++; }
  else { FAIL++; failures.push({ name, detail: detail || '' }); }
}
function section(t) { console.log('\n---- ' + t + ' ----'); }

// ---------- 待测页 ----------
const PAGES = [
  '学习工作台.html', '设置.html', '个人中心.html', '工具.html',
  '动态.html', 'blog_wechat.html', '更多.html', '私聊.html',
  '错题本.html', '学习博客.html', '登录.html'
];

const ICON_MAP_SRC = fs.readFileSync(path.join(R, 'assets/icon-map.js'), 'utf8');

/** 去掉全部 <script>（外链与内联），只保留 DOM —— 是为了单独验证注入机制本身 */
function stripScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
             .replace(/<script\b[^>]*\/?>/gi, '');
}

/** 在 </body> 前内联注入 icon-map.js；没有 </body> 就追加到末尾 */
function injectIconMap(html, src) {
  const tag = '<script>' + src + '</script>';
  const i = html.toLowerCase().lastIndexOf('</body>');
  if (i >= 0) return html.slice(0, i) + tag + '\n' + html.slice(i);
  return html + '\n' + tag;
}

function shim(window) {
  // jsdom 未实现的 API，业务代码可能调用
  if (!window.Element.prototype.scrollTo) window.Element.prototype.scrollTo = function () {};
  if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function () {};
  if (!window.HTMLElement.prototype.scrollIntoView) window.HTMLElement.prototype.scrollIntoView = function () {};
  if (!window.matchMedia) window.matchMedia = function () { return { matches: false, addListener() {}, removeListener() {} }; };
}

async function loadPage(file, opts) {
  opts = opts || {};
  let html = fs.readFileSync(path.join(R, file), 'utf8');
  html = stripScripts(html);
  if (opts.extraDom) {
    // 负向用例：把额外 DOM 塞进 body
    const i = html.toLowerCase().lastIndexOf('</body>');
    html = i >= 0 ? html.slice(0, i) + opts.extraDom + html.slice(i) : html + opts.extraDom;
  }
  html = injectIconMap(html, ICON_MAP_SRC);

  const jsdomErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => jsdomErrors.push(String(e && e.message || e)));
  vc.on('error', (m) => jsdomErrors.push('console.error: ' + m));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'file:///' + encodeURI(file),
    virtualConsole: vc
  });
  shim(dom.window);

  // 等 DOMContentLoaded（icon-map 的注入挂在它上面）
  await new Promise((res) => {
    const w = dom.window;
    if (w.document.readyState !== 'loading') return res();
    w.addEventListener('DOMContentLoaded', () => res());
    setTimeout(res, 2000);
  });
  await new Promise((r) => setTimeout(r, 0));
  return { dom, window: dom.window, doc: dom.window.document, jsdomErrors };
}

const SVG_CONTRACT = {
  'stroke="currentColor"': /stroke="currentColor"/,
  'fill="none"': /fill="none"/,
  'viewBox 0 0 24 24': /viewBox="0 0 24 24"/,
  'stroke-width="2"': /stroke-width="2"/,
  'stroke-linecap="round"': /stroke-linecap="round"/,
  'stroke-linejoin="round"': /stroke-linejoin="round"/,
  'xmlns': /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/
};
const FORBIDDEN = [/<mask/i, /<filter/i, /<symbol/i, /<use\b/i, /xlink:href/i];

// =====================================================================
(async function main() {
  console.log('=== QA §1 图标真实渲染（jsdom 真执行 icon-map.js）===');

  // ---- 0. 字典完整性 ----
  section('0. 图标字典契约');
  const dictSrc = ICON_MAP_SRC;
  ok(!/\bfetch\s*\(/.test(dictSrc), 'icon-map.js 不含 fetch 调用');
  ok(!/\bimport\s+[\w{*]/.test(dictSrc) && !/\bexport\s+(default|const|function|\{)/.test(dictSrc),
     'icon-map.js 不含 ES module 语法（import/export）');
  ok(!/\brequire\s*\(/.test(dictSrc), 'icon-map.js 不含 require()（file:// / APK 下不可用）');
  const httpUrls = (dictSrc.match(/https?:\/\/[^\s"')]+/g) || []);
  const nonW3 = httpUrls.filter(u => !/^https?:\/\/www\.w3\.org(\/|$)/.test(u));
  ok(nonW3.length === 0, 'icon-map.js 不含 CDN/外链（仅允许 w3.org 命名空间）',
     '发现外链: ' + nonW3.join(', '));
  ok(/window\.lucideIcon\s*=/.test(dictSrc), '暴露 window.lucideIcon');
  ok(/window\.lucideAutoRender\s*=/.test(dictSrc), '暴露 window.lucideAutoRender');

  // ---- 1. 逐页渲染 ----
  let renderedTotal = 0;
  for (const f of PAGES) {
    section('1. ' + f);
    const { window, doc, jsdomErrors } = await loadPage(f);
    ok(jsdomErrors.length === 0, f + ' 加载无 jsdomError', jsdomErrors.join(' | '));
    ok(typeof window.lucideIcon === 'function', f + ' window.lucideIcon 可用');
    ok(typeof window.lucideAutoRender === 'function', f + ' window.lucideAutoRender 可用');

    const nodes = Array.from(doc.querySelectorAll('[data-icon]'));
    ok(nodes.length > 0 || f === '登录.html', f + ' 存在 [data-icon] 节点（数=' + nodes.length + '）');

    let svgCount = 0;
    const names = new Set();
    for (const el of nodes) {
      const n = el.getAttribute('data-icon');
      names.add(n);
      const html = el.innerHTML || '';
      const hasSvg = /<svg[\s\S]*<\/svg>/i.test(html);
      if (hasSvg) svgCount++;
      else failures.push({ name: f + ' 图标未渲染', detail: 'data-icon=' + n + ' innerHTML=' + JSON.stringify(html.slice(0, 80)) });
      if (hasSvg) {
        for (const k in SVG_CONTRACT) {
          if (!SVG_CONTRACT[k].test(html)) {
            failures.push({ name: f + ' SVG 契约缺失 ' + k, detail: 'data-icon=' + n });
            FAIL++;
          } else PASS++;
        }
        for (const bad of FORBIDDEN) {
          if (bad.test(html)) { failures.push({ name: f + ' SVG 含禁用图元 ' + bad, detail: 'data-icon=' + n }); FAIL++; }
          else PASS++;
        }
        // 尺寸属性
        if (!/<svg[^>]*\bwidth="\d+"/.test(html)) { failures.push({ name: f + ' SVG 缺 width', detail: n }); FAIL++; } else PASS++;
        if (!/<svg[^>]*\bheight="\d+"/.test(html)) { failures.push({ name: f + ' SVG 缺 height', detail: n }); FAIL++; } else PASS++;
        // 不能残留 emoji
        if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html)) {
          failures.push({ name: f + ' 渲染后仍残留 emoji', detail: n + ' => ' + html.slice(0, 60) }); FAIL++;
        } else PASS++;
      }
    }
    ok(svgCount === nodes.length, f + ' 全部 [data-icon] 渲染出 <svg>（' + svgCount + '/' + nodes.length + '）');
    renderedTotal += svgCount;

    // 侧栏 emoji 残留检查（渲染后的可见文本）
    const sidebars = Array.from(doc.querySelectorAll('nav.sidebar'));
    for (const sb of sidebars) {
      const iconSpans = Array.from(sb.querySelectorAll('.nav-icon'));
      for (const sp of iconSpans) {
        const t = (sp.textContent || '').trim();
        if (t) { failures.push({ name: f + ' nav-icon 有可见文本（疑似 emoji 残留）', detail: JSON.stringify(t) }); FAIL++; }
        else PASS++;
      }
    }
    console.log('   [data-icon]=' + nodes.length + ' 已渲染=' + svgCount +
                ' 图标种类=' + names.size + ' -> ' + Array.from(names).join(','));
  }

  // ---- 2. 负向用例：字典缺 key ----
  section('2. 负向用例 · data-icon 值不在字典里');
  {
    const extraDom =
      '<div id="qaNegative">' +
      '<span id="qaUnknown" class="nav-icon" data-icon="__no_such_icon__">KEEPME</span>' +
      '<span id="qaEmpty" class="nav-icon" data-icon="">EMPTY</span>' +
      '<span id="qaNoAttr" class="nav-icon">NOATTR</span>' +
      '<span id="qaValid" class="nav-icon" data-icon="home">SHOULD_GO</span>' +
      '<span id="qaSize" class="nav-icon" data-icon="user" data-icon-size="28">SIZE</span>' +
      '</div>';
    const { window, doc, jsdomErrors } = await loadPage('学习工作台.html', { extraDom });
    ok(jsdomErrors.length === 0, '负向用例无 jsdomError', jsdomErrors.join(' | '));

    const unk = doc.getElementById('qaUnknown');
    ok(unk && unk.innerHTML === 'KEEPME', '未知 icon：不清空原有内容（continue 分支安全）',
       'innerHTML=' + JSON.stringify(unk && unk.innerHTML));
    ok(unk && !/<svg/i.test(unk.innerHTML), '未知 icon：不注入空白 <svg>');
    ok(window.lucideIcon('__no_such_icon__') === '', 'lucideIcon(未知) 返回空串');
    ok(window.lucideIcon('') === '', 'lucideIcon("") 返回空串');
    ok(window.lucideIcon(null) === '', 'lucideIcon(null) 返回空串');

    const empty = doc.getElementById('qaEmpty');
    ok(empty && empty.innerHTML === 'EMPTY', 'data-icon=""：内容保留');

    const noAttr = doc.getElementById('qaNoAttr');
    ok(noAttr && noAttr.innerHTML === 'NOATTR', '无 data-icon 属性：内容保留');

    const valid = doc.getElementById('qaValid');
    ok(valid && /<svg/.test(valid.innerHTML), '合法 icon 正常渲染（对照组）');

    const sz = doc.getElementById('qaSize');
    ok(sz && /width="28"/.test(sz.innerHTML) && /height="28"/.test(sz.innerHTML),
       'data-icon-size=28 生效', sz && sz.innerHTML.slice(0, 100));
    ok(window.lucideIcon('home', 32).indexOf('width="32"') >= 0, 'lucideIcon(name,32) 尺寸替换');

    // 手动触发（动态插入元素后）
    doc.body.insertAdjacentHTML('beforeend', '<span id="qaLate" data-icon="clock"></span>');
    window.lucideAutoRender();
    const late = doc.getElementById('qaLate');
    ok(late && /<svg/.test(late.innerHTML), 'lucideAutoRender() 手动触发可渲染动态插入的元素');

    // 重复渲染幂等
    const before = doc.querySelectorAll('svg').length;
    window.lucideAutoRender();
    window.lucideAutoRender();
    ok(doc.querySelectorAll('svg').length === before, '重复 autoRender 幂等（不叠加 svg）',
       before + ' -> ' + doc.querySelectorAll('svg').length);
  }

  // ---- 3. 字典 key 覆盖：全站用到的 data-icon 值都必须在字典里 ----
  section('3. 全站 data-icon 值覆盖');
  {
    const EXCL = (b) => b === 'settings.html' || /^settings_.*\.html$/.test(b) || /^profile.*\.html$/.test(b) || b === '设置_旧版.html';
    const formal = fs.readdirSync(R).filter(f => /\.html?$/i.test(f) && !EXCL(f));
    const used = new Map();
    for (const f of formal) {
      const s = fs.readFileSync(path.join(R, f), 'utf8');
      let m; const re = /data-icon="([^"]*)"/g;
      while ((m = re.exec(s))) {
        if (!used.has(m[1])) used.set(m[1], new Set());
        used.get(m[1]).add(f);
      }
    }
    // 用一次真实执行拿到字典
    const { window } = await loadPage('学习工作台.html');
    const dict = window.LUCIDE_ICONS || {};
    const keys = Object.keys(dict);
    ok(keys.length >= 14, '字典 key 数 >= 14（架构 §3.3 约束 4），实际 ' + keys.length);
    for (const u of used.keys()) {
      ok(!!dict[u], '全站使用的 data-icon="' + u + '" 在字典中存在',
         '出现在: ' + Array.from(used.get(u)).join(','));
    }
    console.log('   字典 key(' + keys.length + '): ' + keys.join(','));
    console.log('   全站用到(' + used.size + '): ' + Array.from(used.keys()).join(','));
    // 每个字典 value 都是合法 svg
    for (const k of keys) {
      ok(/^<svg[\s\S]*<\/svg>$/.test(dict[k]), '字典[' + k + '] 是完整 <svg> 串');
    }
  }

  console.log('\n=== §1/§6 汇总: 断言 ' + (PASS + FAIL) + ' | 通过 ' + PASS + ' | 失败 ' + FAIL + ' | 渲染 svg 总数 ' + renderedTotal + ' ===');
  if (failures.length) {
    console.log('\n--- 失败明细 ---');
    failures.forEach((f, i) => console.log((i + 1) + '. ' + f.name + (f.detail ? '\n     ' + f.detail : '')));
  }
  process.exitCode = FAIL ? 1 : 0;
})().catch(e => { console.error('HARNESS ERROR', e); process.exitCode = 2; });
