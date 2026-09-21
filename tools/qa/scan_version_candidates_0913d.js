#!/usr/bin/env node
/*
 * 批次五 · 第①步：正则列版本候选（只扫不改）
 * ---------------------------------------------------------------------------
 * 目标：把全站所有「资源引用」清点出来，逐条归类，得到「可加静态 ?v= 的候选」。
 *
 * 扫描范围：
 *   · 根目录 *.html（32 个）
 *   · assets/*.js、assets/*.css（排除 *.bak-* / *.removed）
 *   · assets/emoji/manifest.js
 *   · data/*.js
 *
 * 每条引用输出一行：
 *   文件:行号 | 类型 | 原始引用 | 已带版本号? | 分类
 *
 * 类型：script-src / link-href[:rel] / img-src[:srcset|data-attr] /
 *       media-src / css-url / css-url:style-attr / js-fetch-path / emoji / other
 * 分类：LOCAL_STATIC / EXTERNAL / DATA_URI / DYNAMIC / ALREADY_VERSIONED / COMMENTED
 *
 * 历史踩坑点（必须处理准）：
 *   1. 区分真实引用行 vs 注释（HTML <!-- --> / CSS /* * / / JS // 与 /* * /）
 *   2. 抓内联 <script> 里的 fetch('assets/data/xxx.json') 与字符串常量路径
 *   3. <link> 区分 rel=stylesheet / icon / apple-touch-icon / manifest / preload
 *   4. 运行时 fetch/XHR/import 的 JSON 数据路径单独成节
 *
 * 只读：本脚本不写除 tools/qa/ 下两个报告文件之外的任何文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// ===========================================================================
// 1. 注释掩码（逐字符标记「是否位于注释内」）
// ===========================================================================
// 正则字面量后允许出现的关键字（`return /re/`）：这些词结尾是字母，但后面 / 是正则而非除号
const JS_KEYWORDS_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'do', 'else', 'case', 'yield', 'await', 'throw',
]);

function wordBefore(s, i) {
  let j = i - 1;
  while (j >= 0 && /[A-Za-z0-9_$]/.test(s[j])) j--;
  return s.slice(j + 1, i);
}

// 判定此处 `/` 是否为正则起始：前一「有效字符」若为 标识符/数字/`)`/`]`/引号 → 除号；否则为正则
function regexAllowed(s, i) {
  let j = i - 1;
  while (j >= 0 && (s[j] === ' ' || s[j] === '\t' || s[j] === '\r' || s[j] === '\n')) j--;
  if (j < 0) return true;
  const p = s[j];
  if (/[A-Za-z0-9_$)\]}'"`]/.test(p)) {
    // 仅当紧邻的是「正则前缀关键字」时才允许（如 return /x/）
    const w = wordBefore(s, i);
    return JS_KEYWORDS_BEFORE_REGEX.has(w);
  }
  return true;
}

function maskJS(s) {
  const n = s.length;
  const mask = new Uint8Array(n);
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') {           // 行注释
      let j = i;
      while (j < n && s[j] !== '\n') { mask[j] = 1; j++; }
      i = j; continue;
    }
    if (c === '/' && s[i + 1] === '*') {           // 块注释
      let j = i; mask[i] = 1; mask[i + 1] = 1; j = i + 2;
      while (j < n) {
        if (s[j] === '*' && s[j + 1] === '/') { mask[j] = 1; mask[j + 1] = 1; j += 2; break; }
        mask[j] = 1; j++;
      }
      i = j; continue;
    }
    if (c === '"' || c === "'" || c === '`') {      // 字符串字面量
      const q = c; let j = i + 1;
      while (j < n) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === q) { j++; break; }
        j++;
      }
      i = j; continue;
    }
    if (c === '/' && regexAllowed(s, i)) {          // 正则字面量（关键：避免把 /[&<>"']/ 里的 " 当成字符串开头）
      let j = i + 1, inClass = false;
      while (j < n) {
        const d = s[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '\n') break;
        if (d === '[') { inClass = true; j++; continue; }
        if (d === ']') { inClass = false; j++; continue; }
        if (d === '/' && !inClass) { j++; break; }
        j++;
      }
      while (j < n && /[A-Za-z]/.test(s[j])) j++;    // 正则 flags
      i = j; continue;
    }
    i++;
  }
  return mask;
}

function maskCSS(s) {
  const n = s.length;
  const mask = new Uint8Array(n);
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') {
      let j = i; mask[i] = 1; mask[i + 1] = 1; j = i + 2;
      while (j < n) {
        if (s[j] === '*' && s[j + 1] === '/') { mask[j] = 1; mask[j + 1] = 1; j += 2; break; }
        mask[j] = 1; j++;
      }
      i = j; continue;
    }
    if (c === '"' || c === "'") {
      const q = c; let j = i + 1;
      while (j < n) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === q) { j++; break; } j++; }
      i = j; continue;
    }
    i++;
  }
  return mask;
}

function maskHTML(html) {
  const n = html.length;
  const mask = new Uint8Array(n);
  let m;
  // HTML 注释
  const cre = /<!--[\s\S]*?-->/g;
  while ((m = cre.exec(html))) {
    for (let k = m.index; k < m.index + m[0].length; k++) mask[k] = 1;
  }
  // <script> 内联 JS 的注释一并纳入
  const sre = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  while ((m = sre.exec(html))) {
    const attrs = m[1], inner = m[2];
    const start = m.index + ('<script' + attrs + '>').length;
    const jm = maskJS(inner);
    for (let k = 0; k < inner.length; k++) if (jm[k]) mask[start + k] = 1;
  }
  // <style> 内联 CSS 的注释一并纳入
  const tre = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  while ((m = tre.exec(html))) {
    const attrs = m[1], inner = m[2];
    const start = m.index + ('<style' + attrs + '>').length;
    const cm = maskCSS(inner);
    for (let k = 0; k < inner.length; k++) if (cm[k]) mask[start + k] = 1;
  }
  return mask;
}

// ===========================================================================
// 2. 行号索引（二分）
// ===========================================================================
function makeLineIndex(s) {
  const arr = [0];
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') arr.push(i + 1);
  return arr;
}
function lineAt(arr, idx) {
  let lo = 0, hi = arr.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= idx) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans + 1;
}

// ===========================================================================
// 3. 分类 / 版本号判断
// ===========================================================================
const ASSET_RE = /\.(js|css|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|mp3|mp4|webm|m4a|txt|xml)(\b|$)/i;

function hasVersion(v) { return /[?&]v=/i.test(v); }

function categorize(literal, rawValue) {
  const v = String(literal != null ? literal : rawValue).trim();
  if (/^https?:\/\//i.test(v) || /^\/\//.test(v)) return 'EXTERNAL';
  if (/^(data:|blob:)/i.test(v)) return 'DATA_URI';
  if (/^#/.test(v)) return 'INTERNAL';           // SVG 渐变/片段引用，非文件
  if (hasVersion(v)) return 'ALREADY_VERSIONED';
  return 'LOCAL_STATIC';
}

// 归一化路径（去查询串/锚点/前导 ./），用于「被多处引用」统计
function normPath(s) {
  if (s == null) return null;
  let v = String(s).trim().replace(/^['"]|['"]$/g, '');
  if (/^https?:\/\//i.test(v) || /^\/\//.test(v) || /^(data:|blob:)/i.test(v)) return v;
  v = v.replace(/[?#].*$/, '').replace(/^\.\//, '');
  return v;
}

// 从一行参数表达式中取「第一个实参」（按顶层逗号切分）
function firstArg(s) {
  let depth = 0, inStr = false, q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === q) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) return s.slice(0, i);
  }
  return s;
}

// 分析一个 fetch/xhr/import 的实参表达式：返回 {raw, literal, dynamic}
function analyzeExpr(expr) {
  const t = String(expr).trim();
  let m;
  if ((m = /^(['"])([\s\S]*)\1$/.exec(t))) return { raw: t, literal: m[2], dynamic: false };
  if ((m = /^`([\s\S]*)`$/.exec(t))) {
    if (/\$\{/.test(m[1])) return { raw: t, literal: null, dynamic: true };
    return { raw: t, literal: m[1], dynamic: false };
  }
  return { raw: t, literal: null, dynamic: true };
}

// ===========================================================================
// 4. 通用扫描核心
// ===========================================================================
function makeScanner(ctx) {
  // ctx: { text, file, offset, lineBase, isComment }
  const li = makeLineIndex(ctx.text);
  const used = new Set();
  const ranges = [];   // JS 路径表达式区间，供 generic 去重
  const out = [];

  function emit(type, idx, raw, opts) {
    opts = opts || {};
    if (!opts.force && used.has(idx)) return;
    used.add(idx);
    const abs = ctx.offset + idx;
    const line = ctx.lineBase + lineAt(li, idx) - 1;
    const commented = ctx.isComment(abs);
    let versioned = '-';
    let category;
    if (commented) {
      category = 'COMMENTED';
      versioned = (opts.literal && hasVersion(opts.literal)) ? 'YES' : 'NO';
    } else {
      category = opts.category || categorize(opts.literal, raw);
      if (category === 'ALREADY_VERSIONED') versioned = 'YES';
      else if (category === 'LOCAL_STATIC') versioned = 'NO';
      else versioned = '-';
    }
    out.push({
      file: ctx.file, line, type, raw: String(raw), literal: opts.literal != null ? String(opts.literal) : null,
      versioned, category,
    });
  }

  function emitJsPath(type, expr, idx) {
    const a = analyzeExpr(expr);
    ranges.push([idx, idx + a.raw.length]);
    if (a.dynamic) {
      emit(type, idx, a.raw, { category: 'DYNAMIC', literal: null });
    } else {
      emit(type, idx, a.raw, { literal: a.literal });
    }
  }

  return { emit, emitJsPath, ranges, out, used };
}

// --- HTML 级扫描（link / script / img / media / style-attr） ---
// 提取某属性值；若值不是「干净路径」（含 + 拼接 / 引号 / 空白 / 变量），判定为 DYNAMIC。
function extractAttr(tag, name) {
  const re = new RegExp('(?<![\\w-])' + name.replace(/-/g, '\\-') + '\\s*=\\s*(["\\\'])([\\s\\S]*?)\\1', 'i');
  const m = re.exec(tag);
  if (!m) return null;
  const value = m[2];
  const offset = tag.indexOf(m[0]) + m[0].indexOf(m[2]);
  const isPath = value.length > 0 && /^[\w./\-@%:]+$/.test(value);
  return { value, offset, dynamic: !isPath };
}

function scanHTMLTags(text, sc) {
  const { emit } = sc;
  let m;
  // <link ...>
  const lre = /<link\b[^>]*>/gi;
  while ((m = lre.exec(text))) {
    const tag = m[0];
    const hm = /\bhref\s*=\s*(['"])([^'"]+)\1/i.exec(tag);
    if (!hm) continue;
    const relm = /\brel\s*=\s*(['"])([^'"]+)\1/i.exec(tag);
    const rel = relm ? relm[2].trim().toLowerCase() : '';
    let kind = 'other';
    if (/(^|\s)stylesheet(\s|$)/.test(rel)) kind = 'stylesheet';
    else if (/(^|\s)apple-touch-icon/.test(rel)) kind = 'apple-touch-icon';
    else if (/(^|\s)icon/.test(rel)) kind = 'icon';
    else if (/(^|\s)manifest(\s|$)/.test(rel)) kind = 'manifest';
    else if (/(^|\s)preload(\s|$)/.test(rel)) kind = 'preload';
    else if (/(^|\s)prefetch(\s|$)/.test(rel)) kind = 'prefetch';
    else if (/(^|\s)dns-prefetch(\s|$)/.test(rel)) kind = 'dns-prefetch';
    else if (/(^|\s)modulepreload(\s|$)/.test(rel)) kind = 'modulepreload';
    else if (rel) kind = rel.split(/\s+/)[0];
    const idx = m.index + tag.indexOf(hm[2]);
    emit('link-href/' + kind, idx, hm[2], { literal: hm[2] });
  }
  // <script ... src>
  const sre = /<script\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1/gi;
  while ((m = sre.exec(text))) {
    const url = m[2];
    const idx = m.index + m[0].indexOf(url);
    emit('script-src', idx, url, { literal: url });
  }
  // <img ...>（含运行时用 JS 拼接出来的 <img>，后者一律 DYNAMIC）
  const ire = /<img\b[^>]*>/gi;
  while ((m = ire.exec(text))) {
    const tag = m[0];
    const pub = (name, type) => {
      const av = extractAttr(tag, name);
      if (!av) return;
      const rawVal = av.value || tag.trim().slice(0, 70);
      if (av.dynamic) emit(type, m.index + av.offset, rawVal, { category: 'DYNAMIC', literal: null });
      else emit(type, m.index + av.offset, av.value, { literal: av.value });
    };
    pub('src', 'img-src');
    pub('data-src', 'img-src/data-attr');
    pub('data-original', 'img-src/data-attr');
    const ssm = /\bsrcset\s*=\s*(['"])([^'"]*)\1/i.exec(tag);
    if (ssm) {
      let off = m.index + tag.indexOf(ssm[2]);
      for (const part of ssm[2].split(',')) {
        const u = part.trim().split(/\s+/)[0];
        if (u && /^[\w./\-@%]+$/.test(u)) emit('img-src/srcset', off, u, { force: true, literal: u });
        off += part.length + 1;
      }
    }
  }
  // <audio|video|source|iframe|embed ...> 的 src / poster
  const mre = /<(audio|video|source|iframe|embed|track)\b[^>]*>/gi;
  while ((m = mre.exec(text))) {
    const tag = m[0];
    const pub = (name, type) => {
      const av = extractAttr(tag, name);
      if (!av) return;
      const rawVal = av.value || tag.trim().slice(0, 70);
      if (av.dynamic) emit(type, m.index + av.offset, rawVal, { category: 'DYNAMIC', literal: null });
      else emit(type, m.index + av.offset, av.value, { literal: av.value });
    };
    pub('src', 'media-src/' + m[1].toLowerCase());
    pub('poster', 'media-src/poster');
  }
  // SVG 渐变/片段引用：fill/stroke="url(#id)"
  const svgre = /(?:fill|stroke)\s*=\s*(["'])url\(\s*([^)]*?)\s*\)\1/gi;
  while ((m = svgre.exec(text))) {
    emit('css-url:svg-ref', m.index + m[0].indexOf('url(') + 4, m[2], { force: true, literal: m[2] });
  }
  // 内联 style="...url(...)"
  const stre = /\bstyle\s*=\s*(['"])([\s\S]*?)\1/gi;
  while ((m = stre.exec(text))) {
    const body = m[2];
    const base = m.index + m[0].indexOf(body);
    const ure = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let um;
    while ((um = ure.exec(body))) {
      emit('css-url:style-attr', base + um.index + um[0].indexOf(um[2]), um[2], { force: true, literal: um[2] });
    }
  }
}

// --- CSS 级扫描（url(...)） ---
function scanCSSUrls(text, sc) {
  const { emit } = sc;
  const ure = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let m;
  while ((m = ure.exec(text))) {
    emit('css-url', m.index + m[0].indexOf(m[2]), m[2], { literal: m[2] });
  }
}

// --- 通用 assets/... 与 data/... 路径兜底扫描（跳过已在 JS 表达式区间内的） ---
function scanGenericPaths(text, sc, isGenericType) {
  const { emit, ranges } = sc;
  const gre = /((?:\.{1,2}\/)*(?:assets|data)\/[\w\-./@]+\.[A-Za-z0-9]+)/g;
  let m;
  while ((m = gre.exec(text))) {
    const p = m[1];
    const idx = m.index + m[0].indexOf(p);
    if (ranges.some(([a, b]) => idx >= a && idx < b)) continue; // 已由 fetch 表达式覆盖
    // 若路径紧邻中文/全角字符，多半是「提示文案里的路径」（如『…：data/x.js 未注入』）
    const before = idx > 0 ? text[idx - 1] : '';
    const after = text[idx + p.length] || '';
    const CJK = /[\u3000-\u9fff\uff00-\uffef]/;
    let type = 'other';
    if (CJK.test(before) || CJK.test(after)) type = 'other/prose-mention';
    else if (/emoji/i.test(p)) type = 'emoji';
    else if (/\.(js)(\b|$)/i.test(p)) type = 'other/js-string-path';
    else if (/\.json(\b|$)/i.test(p)) type = 'other/json-string-path';
    emit(type, idx, p, { literal: p });
  }
}

// --- JS 级扫描（fetch / xhr / import） ---
function scanJSRefs(text, sc) {
  const { emitJsPath } = sc;
  let m;
  // fetch(...)
  const fre = /\bfetch\s*\(([^]*?)\)/g;
  while ((m = fre.exec(text))) {
    const arg = firstArg(m[1]).trim();
    if (!arg) continue;
    const idx = m.index + m[0].indexOf(m[1]) + m[1].indexOf(firstArg(m[1]));
    emitJsPath('js-fetch-path', arg, idx);
  }
  // XMLHttpRequest.open(method, url)
  const xre = /\.open\s*\(\s*(['"])([A-Za-z]+)\1\s*,\s*([^]*?)\)/g;
  while ((m = xre.exec(text))) {
    const arg = firstArg(m[3]).trim();
    if (!arg) continue;
    const idx = m.index + m[0].indexOf(m[3]) + m[3].indexOf(firstArg(m[3]));
    emitJsPath('js-xhr-path', arg, idx);
  }
  // 动态 import('...')
  const imre = /\bimport\s*\(\s*([^)]+)\)/g;
  while ((m = imre.exec(text))) {
    const arg = firstArg(m[1]).trim();
    if (!arg) continue;
    const idx = m.index + m[0].indexOf(m[1]) + m[1].indexOf(firstArg(m[1]));
    emitJsPath('js-import-path', arg, idx);
  }
}

// ===========================================================================
// 5. 对外扫描入口
// ===========================================================================
const refs = [];

function scanHTMLFile(rel, content) {
  const mask = maskHTML(content);
  const lineIndex = makeLineIndex(content);
  const isComment = (abs) => mask[abs] === 1;

  // (a) 整文件 HTML 标签扫描
  const scAll = makeScanner({ text: content, file: rel, offset: 0, lineBase: 1, isComment });
  scanHTMLTags(content, scAll);
  scanGenericPaths(content, scAll);
  refs.push(...scAll.out);

  // (b) 内联 <script> 块
  const sre = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = sre.exec(content))) {
    if (/\bsrc\s*=/.test(m[1])) continue; // 外链脚本无内联正文
    const inner = m[2];
    const start = m.index + ('<script' + m[1] + '>').length;
    const lineBase = lineAt(lineIndex, start);
    const sc = makeScanner({ text: inner, file: rel, offset: start, lineBase, isComment });
    scanJSRefs(inner, sc);
    scanGenericPaths(inner, sc);
    refs.push(...sc.out);
  }

  // (c) 内联 <style> 块
  const tre = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  while ((m = tre.exec(content))) {
    const inner = m[2];
    const start = m.index + ('<style' + m[1] + '>').length;
    const lineBase = lineAt(lineIndex, start);
    const sc = makeScanner({ text: inner, file: rel, offset: start, lineBase, isComment });
    scanCSSUrls(inner, sc);
    refs.push(...sc.out);
  }
}

function scanJSFile(rel, content) {
  const mask = maskJS(content);
  const isComment = (abs) => mask[abs] === 1;
  const sc = makeScanner({ text: content, file: rel, offset: 0, lineBase: 1, isComment });
  scanJSRefs(content, sc);
  scanGenericPaths(content, sc);
  refs.push(...sc.out);
}

function scanCSSFile(rel, content) {
  const mask = maskCSS(content);
  const isComment = (abs) => mask[abs] === 1;
  const sc = makeScanner({ text: content, file: rel, offset: 0, lineBase: 1, isComment });
  scanCSSUrls(content, sc);
  scanGenericPaths(content, sc);
  refs.push(...sc.out);
}

// ===========================================================================
// 6. 收集待扫文件
// ===========================================================================
function collectFiles() {
  const files = [];
  for (const f of fs.readdirSync(ROOT)) if (f.toLowerCase().endsWith('.html')) files.push(f);
  const assetsDir = path.join(ROOT, 'assets');
  for (const f of fs.readdirSync(assetsDir)) {
    if (!/\.(js|css)$/i.test(f)) continue;
    if (/\.bak/i.test(f) || /\.removed/i.test(f)) continue;
    files.push('assets/' + f);
  }
  const emojiManifest = path.join(ROOT, 'assets', 'emoji', 'manifest.js');
  if (fs.existsSync(emojiManifest)) files.push('assets/emoji/manifest.js');
  const dataDir = path.join(ROOT, 'data');
  if (fs.existsSync(dataDir)) {
    for (const f of fs.readdirSync(dataDir)) {
      if (!f.endsWith('.js')) continue;
      if (/\.bak/i.test(f) || /\.removed/i.test(f)) continue;
      files.push('data/' + f);
    }
  }
  return files;
}

// ===========================================================================
// 7. 主流程
// ===========================================================================
function main() {
  const files = collectFiles();
  const scanned = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
    } catch (e) {
      continue;
    }
    scanned.push(rel);
    try {
      if (rel.endsWith('.html')) scanHTMLFile(rel, content);
      else if (rel.endsWith('.css')) scanCSSFile(rel, content);
      else scanJSFile(rel, content);
    } catch (e) {
      refs.push({ file: rel, line: 0, type: 'SCAN-ERROR', raw: String(e && e.message), literal: null, versioned: '-', category: 'ERROR' });
    }
  }

  // 排序：文件 → 行 → 类型
  refs.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
  });

  // ---- 统计矩阵 ----
  const categories = ['LOCAL_STATIC', 'ALREADY_VERSIONED', 'EXTERNAL', 'DATA_URI', 'INTERNAL', 'DYNAMIC', 'COMMENTED', 'ERROR'];
  const matrix = {};
  for (const r of refs) {
    matrix[r.type] = matrix[r.type] || {};
    matrix[r.type][r.category] = (matrix[r.type][r.category] || 0) + 1;
  }
  const types = Object.keys(matrix).sort();

  const matrixLines = [];
  matrixLines.push('类别矩阵（类型 × 分类）:');
  const header = '类型'.padEnd(26) + categories.map(c => c.padStart(17)).join('');
  matrixLines.push(header);
  for (const t of types) {
    let row = t.padEnd(26);
    for (const c of categories) {
      const v = matrix[t][c] || 0;
      row += String(v).padStart(17);
    }
    matrixLines.push(row);
  }
  // 合计行
  const totals = {};
  for (const c of categories) totals[c] = refs.filter(r => r.category === c).length;
  matrixLines.push('合计'.padEnd(26) + categories.map(c => String(totals[c]).padStart(17)).join(''));

  // ---- 版本号取值分布（区分已带版本号资源里的具体版本） ----
  const verDist = {};
  for (const r of refs) {
    if (r.category !== 'ALREADY_VERSIONED') continue;
    const mm = /[?&]v=([^&#'"]+)/.exec(r.literal || r.raw || '');
    if (mm) verDist[mm[1]] = (verDist[mm[1]] || 0) + 1;
  }
  const verLines = ['版本号取值分布（ALREADY_VERSIONED 条目）:'];
  for (const [k, c] of Object.entries(verDist).sort()) verLines.push('  v=' + k + '  ×' + c);

  // 非当前版本（≠20260913c）的条目，供版本一致性核对
  const nonCurrent = refs.filter(r =>
    r.category === 'ALREADY_VERSIONED' && !/[?&]v=20260913c(\b|&|#|$)/.test(r.literal || r.raw || ''));
  const nonCurrentLines = ['非当前版本（≠20260913c）条目: 共 ' + nonCurrent.length + ' 条'];
  for (const r of nonCurrent) nonCurrentLines.push('  ' + r.file + ':' + r.line + ' | ' + r.type + ' | ' + r.raw);

  // ---- 数据文件路径（静态字符串常量里出现的 JSON/data 路径，可加版本号的重点） ----
  const dataPathRefs = refs.filter(r => {
    if (r.category === 'COMMENTED' || r.category === 'DYNAMIC') return false;
    const v = r.literal || r.raw || '';
    return /(^|[^A-Za-z0-9_])(assets\/data\/|data\/)[A-Za-z0-9_\-.@]+/.test(v) || /\.json(\b|$)/i.test(v);
  });

  // ---- 运行时 fetch 数据路径清单 ----
  const fetchRefs = refs.filter(r =>
    (r.type === 'js-fetch-path' || r.type === 'js-xhr-path' || r.type === 'js-import-path') &&
    !/SCAN-ERROR/.test(r.type));
  const fetchData = fetchRefs.filter(r => {
    const v = r.literal || r.raw || '';
    return /assets\/data|assets\/emoji|\.json|\.js/i.test(v) || /assets\//i.test(v);
  });

  // ---- 被多处引用的资源 ----
  const group = {};
  for (const r of refs) {
    if (r.category === 'COMMENTED' || r.category === 'DYNAMIC' || r.category === 'ERROR') continue;
    if (/prose-mention/.test(r.type)) continue;   // UI 文案里提到的路径不算引用
    if (/srcset|data-attr/.test(r.type)) continue;
    const np = normPath(r.literal || r.raw);
    if (!np) continue;
    if (!ASSET_RE.test(np) && !/\.json/i.test(np)) continue;
    if (/^(data:|blob:)/i.test(np)) continue;
    group[np] = group[np] || [];
    group[np].push(r);
  }
  const multi = Object.entries(group).filter(([, arr]) => arr.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  // ---- 组装报告 ----
  const L = [];
  L.push('批次五 · 第①步：版本候选全量清单（只扫不改）');
  L.push('生成时间: ' + new Date().toISOString());
  L.push('项目根: ' + ROOT);
  L.push('扫描文件数: ' + scanned.length + '  （HTML ' + scanned.filter(f => f.endsWith('.html')).length +
    ' / JS ' + scanned.filter(f => f.endsWith('.js')).length + ' / CSS ' + scanned.filter(f => f.endsWith('.css')).length + '）');
  L.push('引用条目总数: ' + refs.length);
  L.push('格式: 文件:行号 | 类型 | 原始引用 | 已带版本号? | 分类');
  L.push('');
  L.push('============================================================');
  L.push('【A】类别矩阵（类型 × 分类）');
  L.push('============================================================');
  L.push(...matrixLines);
  L.push('');
  L.push(...verLines);
  L.push('');
  L.push(...nonCurrentLines);
  L.push('');
  L.push('============================================================');
  L.push('【B】运行时 fetch/XHR/import 数据路径清单（重点）');
  L.push('============================================================');
  if (fetchRefs.length === 0) L.push('（无）');
  for (const r of fetchRefs) {
    L.push(r.file + ':' + r.line + ' | ' + r.type + ' | ' + r.raw + ' | ' + r.versioned + ' | ' + r.category);
  }
  L.push('');
  L.push('--- 仅含 assets/data | assets/emoji | .json 的 fetch 数据路径 ---');
  if (fetchData.length === 0) L.push('（无）');
  for (const r of fetchData) {
    L.push(r.file + ':' + r.line + ' | ' + r.type + ' | ' + r.raw + ' | ' + r.versioned + ' | ' + r.category);
  }
  L.push('');
  L.push('注（人工核对 app.js 后补充，非正则可判）：');
  L.push('  · app.js:377 const EXAM_BANK_LEGACY = \'assets/data/exam-bank.json\' → 被 loadExamBankShard(EXAM_BANK_LEGACY) 以变量形式 fetch。');
  L.push('  · app.js:378 const EXAM_BANK_EXT_INDEX = \'assets/data/exam-bank-ext-index.json\' → 以变量形式 fetch（app.js:417）。');
  L.push('  · 14 个 exam-bank-ext-*.json 分片的路径【不在代码里】——运行时读 assets/data/exam-bank-ext-index.json 的 shards[].file 后逐片 fetch（app.js:420-431）。');
  L.push('    因此分片路径是「数据驱动 / 运行时可变的」，正则阶段无法枚举，必须靠「给索引文件本身加版本号」连带失效（见第②/③步设计）。');
  L.push('');
  L.push('============================================================');
  L.push('【B2】静态字符串常量里的数据文件路径（非 fetch 直连，但同样是数据请求源）');
  L.push('============================================================');
  if (dataPathRefs.length === 0) L.push('（无）');
  for (const r of dataPathRefs) {
    L.push(r.file + ':' + r.line + ' | ' + r.type + ' | ' + r.raw + ' | ' + r.versioned + ' | ' + r.category);
  }
  L.push('');
  L.push('============================================================');
  L.push('【C】被多处引用的资源（同一资源 ≥2 处引用）');
  L.push('============================================================');
  if (multi.length === 0) L.push('（无）');
  for (const [np, arr] of multi) {
    L.push(np + '  ×' + arr.length);
    for (const r of arr) L.push('    ← ' + r.file + ':' + r.line + ' (' + r.type + ')');
  }
  L.push('');
  L.push('============================================================');
  L.push('【D】全量引用明细');
  L.push('============================================================');
  for (const r of refs) {
    L.push(r.file + ':' + r.line + ' | ' + r.type + ' | ' + r.raw + ' | ' + r.versioned + ' | ' + r.category);
  }

  const reportDir = path.join(ROOT, 'tools', 'qa');
  fs.mkdirSync(reportDir, { recursive: true });
  const fullPath = path.join(reportDir, '_version_candidates_0913d.txt');
  fs.writeFileSync(fullPath, L.join('\n') + '\n', 'utf8');

  // ---- 精简摘要（供快速阅读）----
  const S = [];
  S.push('SUMMARY 批次五第①步');
  S.push('扫描文件: ' + scanned.length + ' / 引用条目: ' + refs.length);
  S.push('');
  S.push('[矩阵]');
  S.push(...matrixLines);
  S.push('');
  S.push(...verLines);
  S.push('');
  S.push('[静态数据文件路径（字符串常量/JSON）] 共 ' + dataPathRefs.length + ' 条');
  for (const r of dataPathRefs) S.push(r.file + ':' + r.line + ' | ' + r.type + ' | ' + r.raw + ' | ' + r.category);
  S.push('');
  S.push('[fetch 数据路径] 共 ' + fetchData.length + ' 条');
  for (const r of fetchData) S.push(r.file + ':' + r.line + ' | ' + r.type + ' | ' + r.raw + ' | ' + r.category);
  S.push('');
  S.push('[被多处引用] 共 ' + multi.length + ' 组');
  for (const [np, arr] of multi) S.push(np + ' ×' + arr.length + '  [' + arr.map(r => r.file + ':' + r.line).join(', ') + ']');
  S.push('');
  S.push('[LOCAL_STATIC 静态资源清单（可加 ?v= 候选）]');
  const localSet = {};
  for (const r of refs) {
    if (r.category !== 'LOCAL_STATIC') continue;
    const np = normPath(r.literal || r.raw);
    if (!np) continue;
    localSet[np] = localSet[np] || { types: new Set(), refs: [] };
    localSet[np].types.add(r.type);
    localSet[np].refs.push(r.file + ':' + r.line);
  }
  for (const [np, o] of Object.entries(localSet).sort()) {
    S.push(np + '  [' + [...o.types].join(',') + ']  ×' + o.refs.length + '  ' + o.refs.slice(0, 6).join(', ') + (o.refs.length > 6 ? ' …' : ''));
  }
  S.push('');
  S.push('[ALREADY_VERSIONED 已带版本号]');
  const alreadySet = {};
  for (const r of refs) {
    if (r.category !== 'ALREADY_VERSIONED') continue;
    const np = normPath(r.literal || r.raw);
    alreadySet[np] = alreadySet[np] || [];
    alreadySet[np].push(r.file + ':' + r.line);
  }
  for (const [np, arr] of Object.entries(alreadySet).sort()) S.push(np + '  ×' + arr.length);
  S.push('');
  S.push('[COMMENTED 注释内引用] 共 ' + refs.filter(r => r.category === 'COMMENTED').length + ' 条');
  for (const r of refs.filter(x => x.category === 'COMMENTED')) S.push(r.file + ':' + r.line + ' | ' + r.type + ' | ' + r.raw);
  S.push('');
  S.push('[DYNAMIC 动态/拼接] 共 ' + refs.filter(r => r.category === 'DYNAMIC').length + ' 条');
  for (const r of refs.filter(x => x.category === 'DYNAMIC')) S.push(r.file + ':' + r.line + ' | ' + r.type + ' | ' + r.raw);
  S.push('');
  S.push('[EXTERNAL]');
  const extSet = {};
  for (const r of refs) { if (r.category === 'EXTERNAL') { const np = normPath(r.literal || r.raw); extSet[np] = (extSet[np] || 0) + 1; } }
  for (const [np, c] of Object.entries(extSet).sort()) S.push(np + '  ×' + c);
  S.push('');
  S.push('[DATA_URI] 共 ' + refs.filter(r => r.category === 'DATA_URI').length + ' 条');
  S.push('[ERROR] 共 ' + refs.filter(r => r.category === 'ERROR').length + ' 条');
  for (const r of refs.filter(x => x.category === 'ERROR')) S.push(r.file + ' | ' + r.raw);

  const sumPath = path.join(reportDir, '_version_candidates_0913d.summary.txt');
  fs.writeFileSync(sumPath, S.join('\n') + '\n', 'utf8');

  process.stdout.write('OK refs=' + refs.length + ' files=' + scanned.length + '\n');
  process.stdout.write('full=' + fullPath + '\nsummary=' + sumPath + '\n');
}

main();
