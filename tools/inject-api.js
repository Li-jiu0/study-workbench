/**
 * tools/inject-api.js — 给所有页面注入 assets/api.js（幂等，可重复运行）
 * 规则：在 <script src="assets/app.js"></script> 之后紧跟一行
 *       <script src="assets/api.js?v=版本号"></script>；
 *       登录.html（自有登录逻辑）与 备份/ 目录不处理。
 * 版本号用于强制浏览器刷新缓存（file:// 下旧缓存可能不随磁盘更新）。
 * 用法：node tools/inject-api.js
 *       （每次修改 assets/api.js 后，把下面的 API_VER 改成新值再运行）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['登录.html']);
const API_VER = '20260908b'; // 【改 api.js 后务必更新此版本号再重跑本脚本】

let changed = 0, skipped = 0, total = 0;

for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith('.html')) continue;
  total++;
  if (SKIP.has(f)) { skipped++; continue; }
  const p = path.join(ROOT, f);
  let html = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const tag = '<script src="assets/app.js"></script>';
  const verTag = '<script src="assets/api.js?v=' + API_VER + '"></script>';

  // 已是当前版本 → 跳过
  if (html.includes(verTag)) { skipped++; continue; }

  // 已注入旧版本（无参或旧参）→ 升级为当前版本
  if (/assets\/api\.js(\?v=[^"']*)?/.test(html) && html.includes('<script src="assets/api.js')) {
    html = html.replace(/<script src="assets\/api\.js(\?v=[^"']*)?"><\/script>/, verTag);
    fs.writeFileSync(p, html);
    changed++;
    console.log('  ✓ 升级 api.js 版本 → v=' + API_VER + '：' + f);
    continue;
  }

  // 未注入 → 在 app.js 之后插入
  if (!html.includes(tag)) { console.log('  ! 未找到 app.js 引用，跳过：' + f); skipped++; continue; }
  html = html.replace(tag, tag + '\n' + verTag);
  fs.writeFileSync(p, html);
  changed++;
  console.log('  ✓ 注入 api.js v=' + API_VER + '：' + f);
}

console.log(`\n完成：共 ${total} 个 HTML，更新 ${changed} 个，跳过 ${skipped} 个。`);
