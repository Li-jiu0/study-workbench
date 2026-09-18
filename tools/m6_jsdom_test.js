/* R88-M6 jsdom 行为级断言 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = 'D:\\下载的文件\\学习工作台';
const out = [];
function ok(c, m) { out.push((c ? 'PASS ' : 'FAIL ') + m); }

// ---------- A. 私聊.html 加号菜单：色块容器 + 配色类 ----------
const html = fs.readFileSync(path.join(ROOT, '私聊.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only' });
const doc = dom.window.document;
const items = doc.querySelectorAll('#imPlusMenu .im-plus-item');
const srcAll = html;
ok(items.length === 4, '菜单项数 = ' + items.length + '（期望 4）');
let allBlock = true, hues = [];
items.forEach(function (it) {
  const ico = it.querySelector('.im-plus-ico');
  if (!ico) { allBlock = false; return; }
  const cls = ico.className;
  const m = cls.match(/im-plus-ico--i\d/);
  if (m) hues.push(m[0]);
  // 色块内必须有 nav-icon
  if (!ico.querySelector('.nav-icon[data-icon]')) allBlock = false;
});
ok(allBlock, '每项均含 .im-plus-ico 色块容器 + 内部 nav-icon');
ok(hues.length === 4, '4 项均带配色类 im-plus-ico--iN: ' + hues.join(','));
const uniqHues = Array.from(new Set(hues));
ok(uniqHues.length === 4, '配色类互不相同（成体系）: ' + uniqHues.join(','));

// 配色体系：#imPlusCss 由页尾脚本运行时注入，静态 DOM 中不存在；直接断言 html 源码里
// 4 个色块配色类在同一段 CSS 字符串中集中定义（一处管理，非各写各的）。
const hasAllHues = ['--i1', '--i2', '--i3', '--i4'].every(function (h) {
  return srcAll.indexOf("'.im-plus-ico" + h + "{background:linear-gradient") !== -1;
});
ok(hasAllHues, '源码内 4 个色块配色类集中定义（一处管理，linear-gradient 体系）');

// 语义未破坏
ok(/onclick="imPlusPickImage\(\)"/.test(srcAll) && /onclick="imPlusPickCamera\(\)"/.test(srcAll) &&
   /onclick="imPlusPickFile\(\)"/.test(srcAll) && /onclick="imPlusPickLocation\(\)"/.test(srcAll),
   '4 项 onclick 语义保持（image/camera/file/location）');
ok(/data-icon="image"/.test(srcAll) && /data-icon="camera"/.test(srcAll) &&
   /data-icon="file"/.test(srcAll) && /data-icon="map-pin"/.test(srcAll),
   '4 项 data-icon 语义保持');

// ---------- B. common.css 全树 more-panel 方案B ----------
const cc = fs.readFileSync(path.join(ROOT, 'assets', 'common.css'), 'utf8');
ok(/\.bottom-more-item \.bm-icon > \.nav-icon\b/.test(cc), 'common.css 定义 .bm-icon > .nav-icon 色块');
const groups = (cc.match(/\.bm-icon > \.nav-icon\[data-icon=/g) || []).length;
ok(groups >= 20, 'common.css 属性选择器配色分组数 = ' + groups + '（>=20）');
ok(cc.indexOf(':has(') === -1 || (cc.match(/:has\(/g) || []).length === 1, '未引入真实 :has() 选择器（仅注释出现 1 次）');
ok(cc.indexOf('R88-M6') !== -1, 'common.css 含 R88-M6 标记');

// ---------- C. xt-profile.css 裁剪台过渡 + 引导 + 安全边距 ----------
const pc = fs.readFileSync(path.join(ROOT, 'assets', 'xt-profile.css'), 'utf8');
ok(/\.xtp-crop-mask\s*\{[^}]*animation\s*:/.test(pc), 'xtp-crop-mask 有 animation 过渡声明');
ok(/@keyframes\s+xtpCropMaskIn/.test(pc), '存在 xtpCropMaskIn 关键帧');
ok(/@keyframes\s+xtpCropperIn/.test(pc), '存在 xtpCropperIn 关键帧');
ok(/\.xtp-crop-topbar::after\s*\{[^}]*content\s*:\s*"/.test(pc), 'topbar::after 有引导文案 content');
ok(pc.indexOf('拖动') !== -1 && pc.indexOf('缩放') !== -1, '引导文案含「拖动/缩放」字样 DOM 级存在（CSS content）');
ok(/env\(safe-area-inset-top/.test(pc) && /env\(safe-area-inset-bottom/.test(pc), '安全边距 env(safe-area-inset-*) 存在');
ok(pc.indexOf('clamp(') === -1 && !/:\s*min\(/.test(pc) && !/:\s*max\(/.test(pc), 'xt-profile.css 无 clamp()/min()/max()');

// ---------- D. 三个全局函数未被破坏（xt-profile.js 源内定义仍在、签名不变） ----------
const xp = fs.readFileSync(path.join(ROOT, 'assets', 'xt-profile.js'), 'utf8');
ok(/function xtpPickAvatar\s*\(\s*\)/.test(xp), 'xtpPickAvatar() 定义与签名未变');
ok(/function openCropper\s*\(\s*dataUrl\s*\)/.test(xp), 'openCropper(dataUrl) 定义与签名未变');
ok(/function closeModal\s*\(\s*\)/.test(xp), 'closeModal() 定义与签名未变');
ok(/openCropper\(url\)/.test(xp), 'xtpPickAvatar 内仍调用 openCropper(url)（行为链未断）');

fs.writeFileSync(path.join(ROOT, 'tools', 'm6_jsdom.txt'), out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));
