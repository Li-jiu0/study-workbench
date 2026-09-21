#!/usr/bin/env node
/**
 * tools/qa/check_apk_assets_0912.js —— 批次五 T05 · APK 资源白名单校验
 * （寇豆码 / engineer，2026-09-12）
 *
 * 背景（PRD §5 R-9 / 项目铁律「代码修好 ≠ 包里有」）：
 *   icon-map.js 漏打包 → APK 内全站侧栏图标渲染空白（data-icon 找不到字典，静默）
 *   subpage-router.js 漏打包 → 设置/个人中心所有 [data-subpage] 默认 display:none，
 *                              分组卡全部不可点（静默失效）
 * 二者在 file:// 与 http:// 下都正常，只在 APK 内暴露，因此必须独立校验「包里有没有」。
 *
 * 三种模式：
 *   1) 传 APK 路径   ：node tools/qa/check_apk_assets_0912.js <xxx.apk>
 *      → 用 Node 内置 zlib 解 APK(zip)，逐条比对 assets/ 条目
 *   2) 不带参数      ：默认找 学习工作台-安卓App.apk；找不到则退化为「静态一致性校验」
 *   3) 静态一致性校验：扫描根目录正式页引用的所有 assets/* 引用，断言磁盘上都存在
 *      （即便没打 APK，也能提前抓出「页面引用了包里没有的文件」）
 *
 * 退出码：0 = 全部通过；1 = 有缺失/告警；2 = 崩溃
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_APK = path.join(ROOT, '学习工作台-安卓App.apk');

/** 批次五本批新增 / 静默失效风险最高的资源（硬断言，路径相对项目根） */
const CRITICAL_ASSETS = [
  'assets/icon-map.js',       // 批次五新增：缺 → 全站侧栏图标空白
  'assets/subpage-router.js', // 批次五新增：缺 → 设置/个人中心所有分组卡不可点
  'assets/common.css',
  'assets/polish.css',
  'assets/app.js',
  'assets/config.js',
  'assets/chat-local.js',
  'assets/emoji/manifest.js', // 子目录资源：旧 build-apk.sh 用 cp 不带 -r 会静默漏掉
  'assets/quest.js',          // 任务/打卡体系：缺 → 每日任务模块静默失效
  'assets/study-stats.js'     // 学习统计：缺 → 统计卡片空白（2026-09-09 旧包实际缺失）
];

/**
 * 包内弧名 → 站点相对路径。
 * merge_apk.py 写的是 `assets/` + <相对 stage 的路径>：
 *   html      → assets/学习工作台.html
 *   js/css    → assets/assets/icon-map.js   ← 两层 assets/
 * 统一剥掉最外层的 Android assets/ 前缀。
 */
function toSiteRel(apkName) {
  let s = apkName;
  while (s.indexOf('assets/assets/') === 0) s = s.slice('assets/'.length);
  return s;
}

const EXCLUDE_FILE_RE = /^(settings|profile|_preview_|_t|_)/;
const EXCLUDE_FILE_SET = new Set(['设置_旧版.html']);

let pass = 0;
let fail = 0;
const FAILS = [];

/**
 * 拦截 console.log，把所有输出同时收集到 LOG，便于收尾时落盘成证据文件。
 * （早期版本只打印了「结果已写入 xxx.txt」却从未真正写文件，属自欺式日志，已修正。）
 */
const LOG = [];
const _origConsoleLog = console.log.bind(console);
console.log = function () {
  const line = Array.prototype.map.call(arguments, (a) => String(a)).join(' ');
  LOG.push(line);
  _origConsoleLog.apply(console, arguments);
};
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label + (detail ? '  -> ' + detail : '')); }
  else {
    fail++; FAILS.push(label + (detail ? ' | ' + detail : ''));
    console.log('  FAIL  ' + label + '  *** FAIL ***' + (detail ? '  -> ' + detail : ''));
  }
}

/* ------------------------------------------------------------------ *
 * 极简 ZIP 读取器：只需要 namelist，APK 条目用 deflate / stored 均可
 * ------------------------------------------------------------------ */
function readZipEntryNames(apkPath) {
  const buf = fs.readFileSync(apkPath);
  // 从尾部回溯找 End Of Central Directory（EOCD）签名 0x06054b50
  let eocd = -1;
  const maxScan = Math.min(buf.length, 66000);
  for (let i = buf.length - 22; i >= buf.length - maxScan && i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('找不到 EOCD，文件可能不是有效的 zip/apk：' + apkPath);

  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  let cdOff = buf.readUInt32LE(eocd + 16);
  // ZIP64：0xFFFFFFFF 时改用 zip64 EOCD locator
  if (cdOff === 0xFFFFFFFF || total === 0xFFFF) {
    const loc = eocd - 20;
    if (loc >= 0 && buf.readUInt32LE(loc) === 0x07064b50) {
      const z64Off = Number(buf.readBigUInt64LE(loc + 8));
      cdOff = z64Off;
    }
  }

  const names = [];
  let p = cdOff;
  for (let n = 0; n < 0xFFFF && p < buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break; // 中央目录头签名
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    // 条目名：Buffer.toString('utf8') 已能正确处理中文文件名（merge_apk.py 会置 UTF-8 标志位）。
    // 个别工具写入的条目可能不是合法 UTF-8，此时退化为 latin1 保底，绝不因单条异常中断整体校验。
    let name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name.indexOf('\uFFFD') >= 0) {
      name = buf.toString('latin1', p + 46, p + 46 + nameLen);
    }
    // 压缩前大小：对 stored 条目即为实际大小（够用于存在性判断）
    names.push({ name, method, compSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
    if (cdSize && p >= cdOff + cdSize) break;
  }
  return { buf, names };
}

/* ------------------------------------------------------------------ *
 * 静态一致性：根目录正式页引用的 assets/* 是否都在磁盘上
 * ------------------------------------------------------------------ */
function collectReferencedAssets() {
  const refs = new Map(); // relPath(assets/xxx) -> [pages]
  const files = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => !EXCLUDE_FILE_RE.test(f))
    .filter((f) => !EXCLUDE_FILE_SET.has(f))
    .filter((f) => fs.statSync(path.join(ROOT, f)).isFile());
  for (const f of files) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // 只取真实资源引用（src="assets/…" / href="assets/…"），剥掉 ?v= 版本号
    const re = /(?:src|href)\s*=\s*"(assets\/[^"]+?)(\?v=[0-9A-Za-z._]+)?"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const rel = m[1].replace(/\\/g, '/');
      if (!refs.has(rel)) refs.set(rel, []);
      refs.get(rel).push(f);
    }
  }
  return refs;
}

function main() {
  const argApk = process.argv.slice(2).find((a) => a.toLowerCase().endsWith('.apk'));
  const apkPath = argApk ? path.resolve(argApk) : DEFAULT_APK;

  console.log('===== [1] 静态一致性：正式页引用的 assets/* 是否都在磁盘 =====');
  const refs = collectReferencedAssets();
  const missingOnDisk = [];
  for (const [rel, pages] of refs) {
    if (!fs.existsSync(path.join(ROOT, rel.replace(/\//g, path.sep)))) {
      missingOnDisk.push(rel + '（引用自 ' + pages.join(', ') + '）');
    }
  }
  check('共扫描到 ' + refs.size + ' 个被页面引用的 assets 资源，全部存在于磁盘',
    missingOnDisk.length === 0, missingOnDisk.join(' | ') || '无缺失');

  // 磁盘上 assets/ 全量清单
  const diskAssets = [];
  (function rec(dir, prefix) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? prefix + '/' + e.name : e.name;
      if (e.isDirectory()) rec(path.join(dir, e.name), rel);
      else diskAssets.push('assets/' + rel.replace(/\\/g, '/'));
    }
  })(path.join(ROOT, 'assets'), '');

  const referencedOnly = [...refs.keys()];
  const unreferenced = diskAssets.filter((a) => referencedOnly.indexOf(a) < 0);
  console.log('  INFO  assets/ 磁盘文件 ' + diskAssets.length + ' 个；其中未被任何正式页引用 ' +
    unreferenced.length + ' 个' + (unreferenced.length ? '：' + unreferenced.join(', ') : ''));

  console.log('\n===== [2] APK 打包校验 =====');
  if (!fs.existsSync(apkPath)) {
    console.log('  SKIP  未找到 APK（' + apkPath + '），跳过包内校验。');
    console.log('        打包后重跑：node tools/qa/check_apk_assets_0912.js <apk路径>');
  } else {
    const { buf, names } = readZipEntryNames(apkPath);
    const apkAssets = new Set(
      names.map((e) => e.name).filter((n) => n.indexOf('assets/') === 0)
    );
    const apkSite = new Set([...apkAssets].map(toSiteRel));
    // rel 传项目根相对路径（如 assets/icon-map.js）
    const has = (rel) => apkSite.has(rel);
    const apkEntryOf = (rel) => {
      // 反查包内原始弧名，供内容抽查用
      const cand = names.map((e) => e.name).filter((n) => toSiteRel(n) === rel);
      return cand.length ? cand[0] : null;
    };

    console.log('  INFO  APK: ' + apkPath + '（' + Math.round(buf.length / 1024) + ' KB）');
    console.log('  INFO  包内 assets/ 条目总数 ' + apkAssets.size);
    const inApkAssets = [...apkSite].filter((n) => n.indexOf('assets/') === 0);
    console.log('  INFO  包内站点资源（assets/*）' + inApkAssets.length + ' 个：');
    inApkAssets.slice().sort().forEach((n) => console.log('          ' + n));

    for (const a of CRITICAL_ASSETS) {
      check('APK 内含 ' + a, has(a), has(a) ? '' : '包内未找到 assets/' + a);
    }

    // 全量：磁盘上每个 assets/ 文件都应该进包
    const notInApk = diskAssets.filter((a) => !has(a));
    check('磁盘 assets/ 下全部 ' + diskAssets.length + ' 个文件都进了 APK',
      notInApk.length === 0, notInApk.join(', ') || '');

    // 被页面引用但包里没有（真正会导致静默失效的）
    const refNotInApk = referencedOnly.filter((a) => !has(a));
    check('页面引用的 ' + referencedOnly.length + ' 个 assets 资源全部进了 APK',
      refNotInApk.length === 0, refNotInApk.join(', ') || '');

    // 关键内容抽查：icon-map.js 里必须有字典；subpage-router.js 必须有 data-subpage
    const spot = [
      { file: 'assets/icon-map.js', needle: 'LUCIDE_ICONS', note: '图标字典' },
      { file: 'assets/subpage-router.js', needle: 'data-subpage', note: '子页面路由' }
    ];
    for (const s of spot) {
      const entryName = apkEntryOf(s.file);
      if (!entryName) { check('抽查 ' + s.file + ' 内容含 ' + s.needle, false, '条目不存在'); continue; }
      try {
        const e = names.find((x) => x.name === entryName);
        const lh = buf.readUInt32LE(e.localOff) === 0x04034b50 ? e.localOff : -1;
        if (lh < 0) { check('抽查 ' + s.file + ' 内容含 ' + s.needle, false, 'local header 异常'); continue; }
        const nLen = buf.readUInt16LE(lh + 26);
        const xLen = buf.readUInt16LE(lh + 28);
        const cSize = buf.readUInt32LE(lh + 18);
        const start = lh + 30 + nLen + xLen;
        const raw = buf.slice(start, start + cSize);
        const text = e.method === 0 ? raw.toString('utf8') : zlib.inflateRawSync(raw).toString('utf8');
        check('抽查 APK 内 ' + s.file + ' 含 "' + s.needle + '"（' + s.note + '）',
          text.indexOf(s.needle) >= 0, '大小=' + text.length + ' 字节');
      } catch (err) {
        check('抽查 APK 内 ' + s.file + ' 含 "' + s.needle + '"', false, String(err && err.message));
      }
    }

    /* ---- [3] 包内 HTML 抽查：打包期剔除 api.js 的那一刀有没有误伤 ----
     * android/build_apk.py 对 html 执行整行删除（^.*<script src="assets/api\.js.*$）。
     * 若这一刀误伤 icon-map.js / subpage-router.js，则：
     *   · icon-map.js 丢失       → APK 内全站侧栏图标空白
     *   · subpage-router.js 丢失 → 设置/个人中心所有 [data-subpage] 默认隐藏，分组卡不可点
     * 而这两种情况在 file:// 与 http:// 下都完全正常——正是本项目最典型的静默失效，
     * 只有把包内 HTML 原文解出来比对才能发现。
     * 期望值以仓库源码为准（实测）：icon-map.js 24 页、subpage-router.js 仅 2 页。
     */
    console.log('\n===== [3] 包内 HTML 抽查（打包期 api.js 剔除是否误伤）=====');

    /** 解包并还原指定条目的文本内容（STORED 直接读，DEFLATE 用 inflateRaw） */
    const inflateEntry = (rel) => {
      const entryName = apkEntryOf(rel);
      if (!entryName) return null;
      const e = names.find((x) => x.name === entryName);
      if (!e || buf.readUInt32LE(e.localOff) !== 0x04034b50) return null;
      const nLen = buf.readUInt16LE(e.localOff + 26);
      const xLen = buf.readUInt16LE(e.localOff + 28);
      const cSize = buf.readUInt32LE(e.localOff + 18);
      const start = e.localOff + 30 + nLen + xLen;
      const raw = buf.slice(start, start + cSize);
      try {
        return e.method === 0 ? raw.toString('utf8') : zlib.inflateRawSync(raw).toString('utf8');
      } catch (err) {
        return null;
      }
    };

    // 期望：所有打进包的正式页（排除草稿/小写 settings/旧版）都应带 icon-map.js
    const PAGES_ICON_MAP = fs.readdirSync(ROOT)
      .filter((f) => f.endsWith('.html'))
      .filter((f) => !EXCLUDE_FILE_RE.test(f))
      .filter((f) => !EXCLUDE_FILE_SET.has(f))
      .filter((f) => fs.statSync(path.join(ROOT, f)).isFile())
      .filter((f) => {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        return src.indexOf('assets/icon-map.js') >= 0;
      });
    const PAGES_ROUTER = fs.readdirSync(ROOT)
      .filter((f) => f.endsWith('.html'))
      .filter((f) => fs.statSync(path.join(ROOT, f)).isFile())
      .filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('assets/subpage-router.js') >= 0);

    console.log('  INFO  源码期望：icon-map.js 引用页 ' + PAGES_ICON_MAP.length +
      ' 个；subpage-router.js 引用页 ' + PAGES_ROUTER.length + ' 个（' + PAGES_ROUTER.join(', ') + '）');

    let iconMapLost = [];
    let apiResidue = [];
    let dataIconLost = [];
    let readFail = [];
    let iconPages = [];
    let noSidebarPages = [];
    for (const hp of PAGES_ICON_MAP) {
      const rel = 'assets/' + hp; // html 在包内是 assets/<页名>（单层；js/css 才是 assets/assets/）
      const html = inflateEntry(rel);
      if (html === null) { readFail.push(hp); continue; }

      // 只判定“真实的 script 标签”。页面注释里提到 assets/api.js 是完全正常的
      // （例如 个人中心.html:157「逻辑见 assets/api.js 的 editProfile()」），
      // 用裸子串匹配会把注释误判成残留，早期版本即在此误报，已修正。
      if (/<script[^>]*assets\/api\.js/.test(html)) apiResidue.push(hp);
      if (html.indexOf('assets/icon-map.js') < 0) iconMapLost.push(hp);

      // data-icon 的期望值以源码为准：登录页等无侧栏页面（无 nav class="sidebar"）
      // 本就没有 data-icon，不应强求；只对源码里确实有 data-icon 的页面做断言。
      const srcHasIcon = fs.readFileSync(path.join(ROOT, hp), 'utf8').indexOf('data-icon') >= 0;
      if (srcHasIcon) {
        iconPages.push(hp);
        if (html.indexOf('data-icon') < 0) dataIconLost.push(hp);
      } else {
        noSidebarPages.push(hp);
      }
    }
    if (noSidebarPages.length) {
      console.log('  INFO  以下 ' + noSidebarPages.length + ' 页源码无侧栏图标，跳过 data-icon 断言：' +
        noSidebarPages.join(', '));
    }
    check('包内全部 ' + PAGES_ICON_MAP.length + ' 个 HTML 均可解包读取',
      readFail.length === 0, readFail.join(', ') || '');
    check('包内 HTML 已剔除 api.js 的 <script> 标签（离线环境要求）',
      apiResidue.length === 0, apiResidue.join(', ') || '无残留');
    check('包内 HTML 全部保留 icon-map.js 引用（未被 api.js 剔除误伤）',
      iconMapLost.length === 0, iconMapLost.join(', ') || '无丢失');
    check('包内 ' + iconPages.length + ' 个含侧栏图标的页面均保留 data-icon 标记',
      dataIconLost.length === 0, dataIconLost.join(', ') || '无丢失');

    let routerLost = [];
    for (const hp of PAGES_ROUTER) {
      const html = inflateEntry('assets/' + hp);
      if (html === null || html.indexOf('assets/subpage-router.js') < 0) routerLost.push(hp);
    }
    check('包内 ' + PAGES_ROUTER.length + ' 个页面保留 subpage-router.js 引用（' +
      PAGES_ROUTER.join(', ') + '）',
      routerLost.length === 0, routerLost.join(', ') || '无丢失');
  }

  console.log('\n===== 汇总 =====');
  console.log('通过 ' + pass + ' / ' + (pass + fail) + ' 项，失败 ' + fail + ' 项');
  if (FAILS.length) { console.log('失败清单：'); FAILS.forEach((f) => console.log('  - ' + f)); }
  // 真实落盘（早期版本只打印「结果已写入」却从未写文件，属自欺式日志，已修正）
  const outFile = path.join(__dirname, '_apk_assets_check.txt');
  try {
    fs.writeFileSync(outFile, LOG.join('\n') + '\n', 'utf8');
    console.log('\n（结果已写入 ' + path.relative(ROOT, outFile).replace(/\\/g, '/') + '）');
  } catch (err) {
    console.log('\n（结果落盘失败：' + String(err && err.message) + '）');
  }
  process.exit(fail === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.log('CRASH: ' + (e && (e.stack || e.message || e)));
  process.exit(2);
}
