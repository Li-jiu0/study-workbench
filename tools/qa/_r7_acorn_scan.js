/* acorn multi-gate syntax scan: find minimum ES version each script needs.
   Old WebView gate: files needing > ES2017 die silently on older Android WebViews.
   Covers: all external scripts of AI.html / ai-settings.html / 个人中心.html / 设置.html / 更多.html
         + inline <script> blocks of those pages.
   Report: _r7_acorn_scan.txt */
'use strict';
const fs = require('fs');
const path = require('path');
let acorn;
try { acorn = require('C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node_modules/@tencent/slidep/node_modules/acorn'); }
catch (e) { console.log('ACORN LOAD FAIL: ' + e.message); process.exit(1); }

const ROOT = 'D:/' + '\u4e0b\u8f7d\u7684\u6587\u4ef6' + '/' + '\u5b66\u4e60\u5de5\u4f5c\u53f0';
const OUT = path.join(ROOT, '_r7_acorn_scan.txt');
const report = [];
function w(s) { report.push(String(s)); }

const VERSIONS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 'latest'];
function minVersion(code) {
  let lastErr = null;
  for (const v of VERSIONS) {
    try {
      acorn.parse(code, { ecmaVersion: v, sourceType: 'script' });
      return { ok: true, min: v };
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, err: lastErr };
}

function featureOf(err) {
  const m = String(err && err.message || '');
  if (/\?\.|optional chaining/i.test(m)) return 'optional-chaining(ES2020)';
  if (/\?\?/i.test(m)) return 'nullish-coalescing(ES2020)';
  if (/class fields|private/i.test(m)) return 'class-fields(ES2022)';
  if (/spread|rest/i.test(m)) return 'object-spread/rest(ES2018)';
  if (/async/i.test(m)) return 'async/await(ES2017)';
  if (/\*\*/.test(m)) return 'exponent(ES2016)';
  if (/logical assignment/i.test(m)) return 'logical-assign(ES2021)';
  return m.slice(0, 80);
}

function scanCode(tag, code) {
  const r = minVersion(code);
  if (r.ok) {
    if (r.min > 2017) {
      const fe = minVersion.recheck;
      w('  ' + tag + ' -> minES=' + r.min + '  ⚠ DIES on old WebView');
      // find first failing location at 2017
      try { acorn.parse(code, { ecmaVersion: 2017, sourceType: 'script' }); }
      catch (e) {
        const ln = e.loc ? e.loc.line : 0;
        const lines = code.split(/\r?\n/);
        w('      first ES2017 failure: line ' + ln + ': ' + (lines[ln - 1] ? lines[ln - 1].trim().slice(0, 140) : '?'));
        w('      feature: ' + featureOf(e));
      }
      return 1;
    }
    w('  ' + tag + ' -> minES=' + r.min + ' (<=2017 OK)');
    return 0;
  }
  w('  ' + tag + ' -> SYNTAX ERROR (even latest): ' + String(r.err && r.err.message).slice(0, 120) + (r.err && r.err.loc ? ' @line ' + r.err.loc.line : ''));
  const ln = r.err && r.err.loc ? r.err.loc.line : 0;
  if (ln) {
    const lines = code.split(/\r?\n/);
    w('      line ' + ln + ': ' + (lines[ln - 1] ? lines[ln - 1].trim().slice(0, 140) : '?'));
  }
  return 1;
}

const PAGES = ['AI.html', 'ai-settings.html', '\u4e2a\u4eba\u4e2d\u5fc3.html', '\u8bbe\u7f6e.html', '\u66f4\u591a.html'];
const extSeen = {};
let badExt = 0, badInline = 0;

w('===== external scripts =====');
for (const page of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const re = /<script\s+src="([^"]+)"[^>]*>/g;
  let m;
  const list = [];
  while ((m = re.exec(html)) !== null) list.push(m[1].split('?')[0]);
  for (const rel of list) {
    if (extSeen[rel]) continue;
    extSeen[rel] = true;
    let code;
    try { code = fs.readFileSync(path.join(ROOT, rel.replace(/\//g, path.sep)), 'utf8'); }
    catch (e) { w('  ' + rel + ' -> READ FAIL ' + e.message); continue; }
    badExt += scanCode(rel, code);
  }
}

w('');
w('===== inline blocks (per page) =====');
for (const page of PAGES) {
  w('== ' + page + ' ==');
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m, i = 0;
  while ((m = re.exec(html)) !== null) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    i++;
    if (!m[2].trim()) continue;
    badInline += scanCode('  inline#' + i + ' @' + page, m[2]);
  }
}

w('');
w('SUMMARY: external needing >2017 or broken = ' + badExt + ' ; inline needing >2017 or broken = ' + badInline);
fs.writeFileSync(OUT, report.join('\n'), 'utf8');
console.log('DONE');
