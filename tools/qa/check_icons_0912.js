// T04 lucide 图标升级 · 断点体检（只读，不改任何文件）
// 1) 载入 icon-map.js 取字典键集
// 2) 扫描全站正式页里所有 data-icon="xxx"
// 3) 报告：字典缺失的图标 / 已换图标的页面 / 还没注入 icon-map.js 的页面
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const ICON_MAP = path.join(ROOT, 'assets', 'icon-map.js');

const sandbox = { window: {}, document: { addEventListener() {}, querySelectorAll: () => [] }, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(ICON_MAP, 'utf8'), sandbox);
const ICONS = (sandbox.window.LUCIDE_ICONS || {});
const keys = Object.keys(ICONS);

const EXCLUDE_DIRS = /^(备份|android|node_modules|\.git|\.workbuddy|docs|tools|server|ai-server)$/;
const EXCLUDE_FILE = /^(settings_|profile_|_preview_|_t)/;

const pages = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && !EXCLUDE_FILE.test(f))
  .map(f => path.join(ROOT, f));

const used = new Map();      // icon -> [pages]
let injected = [], notInjected = [], iconPages = [];

for (const p of pages) {
  const name = path.basename(p);
  const html = fs.readFileSync(p, 'utf8');
  const hasScript = /assets\/icon-map\.js/.test(html);
  (hasScript ? injected : notInjected).push(name);
  const m = html.match(/data-icon="([^"]+)"/g) || [];
  if (m.length) iconPages.push(name + '(' + m.length + ')');
  for (const hit of m) {
    const k = hit.match(/data-icon="([^"]+)"/)[1];
    if (!used.has(k)) used.set(k, []);
    used.get(k).push(name);
  }
}

const missing = [...used.keys()].filter(k => !ICONS[k]);
let out = [];
out.push('字典图标数: ' + keys.length);
out.push('页面引用到的图标种类: ' + used.size);
out.push('❌ 字典缺失(会渲染空白): ' + (missing.length ? missing.join(', ') : '无'));
out.push('已换 data-icon 的页: ' + (iconPages.join(', ') || '无'));
out.push('已注入 icon-map.js 的页(' + injected.length + '): ' + injected.join(', '));
out.push('未注入 icon-map.js 的页(' + notInjected.length + '): ' + notInjected.join(', '));

fs.writeFileSync(process.env.ICON_OUT || 'C:/Users/ATM/AppData/Local/Temp/sw_icons.txt', out.join('\n'), 'utf8');
console.log(out.join('\n'));
