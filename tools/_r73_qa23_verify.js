// _r73_qa23_verify.js  --  QA verifier for "moments (dynamic space)" global entry.
// This source is ASCII-only on purpose: in this environment BOTH Python and Node
// mis-decode Chinese *source literals* as GBK, but fs.readFileSync(...,'utf8') decodes
// FILE CONTENT correctly and __dirname gives a correct absolute path. So ROOT is derived
// from __dirname and all Chinese lives in _r73_qa23_cfg.json (read as UTF-8).
// Usage:
//   node _r73_qa23_verify.js            # formal compare (reads baseline.json)
//   node _r73_qa23_verify.js --baseline # record baseline snapshot + report
// Outputs: tools/_r73_qa23_baseline.json / _r73_qa23_baseline.txt / _r73_qa23_result.txt

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ROOT/TOOLS as UTF-8 literals (Node decodes .js source as UTF-8; __dirname comes through as GBK here).
const TOOLS = 'D:/下载的文件/学习工作台/tools';
const ROOT = 'D:/下载的文件/学习工作台';
const APPJS = path.join(ROOT, 'assets', 'app.js');
const NODE = 'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';
const C_JS = path.join(TOOLS, '_r73_qa23_jsdom_check.js');
const BASELINE_JSON = path.join(TOOLS, '_r73_qa23_baseline.json');
const CFG_JSON = path.join(TOOLS, '_r73_qa23_cfg.json');

const cfg = JSON.parse(fs.readFileSync(CFG_JSON, 'utf8'));
const PAGES_32 = cfg.pages_32;
const DYNAMIC_4 = cfg.dynamic_4;
const AI_NO_GRID = cfg.ai_no_grid;
const S = cfg.s;
const REQUIRED_PF_KEYS = ['home', 'cet', 'speaking-demo', 'exam', 'exam-demo', 'comm',
  'roleplay-demo', 'interview', 'interview-demo', 'files', 'ppt', 'blog',
  'exam-center', 'shenlun', 'wrong-book', 'cet-vocab', 'etiquette', 'iv-questions',
  'ppt-layouts', 'ppt-cases', 'comm-scenes', 'comm-quotes', 'profile', 'settings'];

function escapeRx(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function rxCount(s, lit) { return (s.match(new RegExp(escapeRx(lit), 'g')) || []).length; }
function rxIdx(s, lit) { return s.indexOf(lit); }

const results = [];
function add(rid, expect, actual, status, evidence) { results.push({ rid, expect, actual, status, evidence: evidence || '' }); }
function readBuf(p) { return fs.readFileSync(p); }
function bomAndText(buf) {
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return [true, buf.slice(3).toString('utf8')];
  return [false, buf.toString('utf8')];
}
function crlf(buf) { let cr = 0, lf = 0; for (let i = 0; i < buf.length; i++) { if (buf[i] === 0x0D) cr++; else if (buf[i] === 0x0A) lf++; } return [cr, lf]; }
function divFindEnd(s, start) {
  let i = s.indexOf('<div', start);
  if (i < 0) return -1;
  let depth = 0, j = i;
  while (j < s.length) {
    const nd = s.indexOf('<div', j);
    const ed = s.indexOf('</div', j);
    if (ed < 0 && nd < 0) return -1;
    if (nd >= 0 && (ed < 0 || nd < ed)) { depth++; j = nd + 4; }
    else { depth--; j = ed + 6; if (depth === 0) return j; }
  }
  return -1;
}
function extractBlock(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const ob = src.indexOf('{', i);
  if (ob < 0) return null;
  let depth = 0, j = ob;
  while (j < src.length) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(ob, j + 1); }
    j++;
  }
  return null;
}

function main() {
  const isBaseline = process.argv.includes('--baseline');
  const lines = [];
  const log = (s) => { lines.push(s === undefined ? '' : s); };

  log('='.repeat(70));
  log('moments entry verifier  ' + (isBaseline ? 'BASELINE' : 'FORMAL') + '  ' + new Date().toISOString());
  log('='.repeat(70));

  // ---- B ----
  log('\n--- B. line endings & encoding ---');
  const changedFiles = [APPJS].concat(PAGES_32.map((p) => path.join(ROOT, p)));
  const bomSnap = {}, crlfSnap = {};
  for (const fp of changedFiles) {
    const buf = readBuf(fp);
    const [bom, text] = bomAndText(buf);
    const [cr, lf] = crlf(buf);
    const base = path.basename(fp);
    bomSnap[base] = bom; crlfSnap[base] = [cr, lf];
    const pure = (cr === lf && cr > 0);
    const bad = text.indexOf('ï¿½') >= 0 || text.indexOf('�') >= 0;
    add('B1:' + base, 'pure CRLF (cr==lf>0)', 'cr=' + cr + ' lf=' + lf, pure ? 'PASS' : 'FAIL', 'first80=' + JSON.stringify(buf.slice(0, 80).toString('utf8')));
    add('B2:' + base, 'UTF-8 decodable / BOM consistent', 'bom=' + bom, bad ? 'FAIL' : 'PASS', 'badchar=' + bad);
    add('B3:' + base, 'no mojibake chars', 'bad=' + bad, bad ? 'FAIL' : 'PASS');
  }

  // ---- A1 ----
  log('\n--- A1. app.js static structure ---');
  const jsText = bomAndText(readBuf(APPJS))[1];
  const momentsCnt = rxCount(jsText, 'moments');
  const ptBlock = extractBlock(jsText, 'const pageTitles = {');
  const pfBlock = extractBlock(jsText, 'const PAGE_FILES = {');
  const ptOk = !!ptBlock && ptBlock.indexOf(S.moments_title) >= 0;
  const pfOk = !!pfBlock && pfBlock.indexOf(S.moments_file) >= 0;
  add('A1:moments_count', '2', String(momentsCnt), momentsCnt === 2 ? 'PASS' : 'FAIL', 'occurrences=' + momentsCnt);
  add('A1:pageTitles_has_moments', 'contains ' + S.moments_title, String(ptOk), ptOk ? 'PASS' : 'FAIL', ptBlock ? ptBlock.slice(0, 120) : 'block not found');
  add('A1:PAGE_FILES_has_moments', 'contains ' + S.moments_file, String(pfOk), pfOk ? 'PASS' : 'FAIL', pfBlock ? pfBlock.slice(0, 120) : 'block not found');

  // ---- A2/A3/A4 ----
  log('\n--- A2/A3/A4. 32 pages sidebar / position / mobile panel ---');
  const pageSnap = {};
  for (const p of PAGES_32) {
    const fp = path.join(ROOT, p);
    const html = bomAndText(readBuf(fp))[1];
    pageSnap[p] = { mtime: fs.statSync(fp).mtimeMs };
    const dpMoments = rxCount(html, S.data_page_moments);
    const dynCnt = rxCount(html, S.dyn_space);
    let expDyn = (p === AI_NO_GRID) ? 1 : 2;
    if (p === '更多.html') expDyn = 3;
    add('A2:' + p + '[data-page=moments]', '1', String(dpMoments), dpMoments === 1 ? 'PASS' : 'FAIL');
    add('A2:' + p + '[动态空间]', String(expDyn), String(dynCnt), dynCnt === expDyn ? 'PASS' : 'FAIL');

    const bi = html.indexOf(S.nav_blog);
    const mi = html.indexOf(S.nav_moments);
    if (bi < 0 || mi < 0) {
      add('A3:' + p + '[position]', 'after blog / before next nav / no boundary cross', 'blog@' + bi + ' moments@' + mi, 'FAIL', 'blog or moments missing');
      continue;
    }
    const blogEnd = divFindEnd(html, bi);
    const ns = html.indexOf(S.nav_section, blogEnd);
    const ni = html.indexOf('<div class="nav-item"', blogEnd);
    const cand = [ns, ni].filter((x) => x >= 0);
    const nextNav = cand.length ? Math.min.apply(null, cand) : html.length;
    const morePanel = html.indexOf(S.more_panel);
    const bnds = [html.indexOf('</aside>'), html.indexOf('</nav>'), html.indexOf('</body>'), morePanel].filter((x) => x >= 0);
    const boundary = bnds.length ? Math.min.apply(null, bnds) : html.length;
    const okPos = (blogEnd <= mi && mi < nextNav && mi < boundary);
    let ctx = '';
    if (!okPos) { const lo = Math.max(0, mi - 150); ctx = 'ctx300: ' + html.slice(lo, lo + 300).replace(/\n/g, ' '); }
    add('A3:' + p + '[position]', 'blog_end<=moments<nextNav & no boundary cross',
      'blog_end=' + blogEnd + ' moments=' + mi + ' nextNav=' + nextNav + ' boundary=' + boundary, okPos ? 'PASS' : 'FAIL', ctx);

    if (p !== AI_NO_GRID) {
      const gstart = html.indexOf(S.bottom_grid);
      if (gstart < 0) {
        add('A4:' + p + '[grid]', 'grid contains ' + S.dyn_space + '=1', 'no grid', 'FAIL');
      } else {
        const gend = divFindEnd(html, gstart);
        const gseg = gend > 0 ? html.slice(gstart, gend) : '';
        const gcnt = rxCount(gseg, S.dyn_space);
        const inside = gseg.indexOf(S.dyn_space) >= 0;
        add('A4:' + p + '[grid]', '1 (inside grid)', String(gcnt), (gcnt === 1 && inside) ? 'PASS' : 'FAIL', 'grid_len=' + gseg.length);
      }
    }
    if (p === '更多.html') {
      const re = new RegExp(escapeRx(S.morepage_card), 'g');
      let cardContains = 0, firstIdx = -1;
      let m;
      while ((m = re.exec(html))) {
        if (firstIdx < 0) firstIdx = m.index;
        const ce = divFindEnd(html, m.index);
        if (ce > 0 && html.slice(m.index, ce).indexOf(S.dyn_space) >= 0) cardContains++;
      }
      const firstSeg = (firstIdx >= 0 && divFindEnd(html, firstIdx) > 0) ? html.slice(firstIdx, divFindEnd(html, firstIdx)) : '';
      const has = firstSeg.indexOf(S.dyn_space) >= 0;
      add('A4:' + p + '[morecard]', 'first card has it & total 1', 'first=' + has + ' cards_with=' + cardContains, (has && cardContains === 1) ? 'PASS' : 'FAIL');
    }
  }

  // ---- A5 ----
  log('\n--- A5. 4 dynamic pages must NOT change ---');
  const dynSnap = {};
  for (const p of DYNAMIC_4) {
    const fp = path.join(ROOT, p);
    const html = bomAndText(readBuf(fp))[1];
    const dp = rxCount(html, S.data_page_moments);
    const dy = rxCount(html, S.dyn_space);
    const mt = fs.statSync(fp).mtimeMs;
    dynSnap[p] = { dp, dy, mtime: mt };
    const fmt = new Date(mt).toISOString().replace('T', ' ').slice(0, 19);
    add('A5:' + p + '[data-page=moments]', '=baseline', String(dp), isBaseline ? 'BASELINE' : 'REC');
    add('A5:' + p + '[动态空间]', '=baseline', String(dy), isBaseline ? 'BASELINE' : 'REC');
    add('A5:' + p + '[mtime]', '=baseline', fmt, isBaseline ? 'BASELINE' : 'REC');
  }

  // ---- D1 ----
  log('\n--- D1. ES2017 compat (new lines) ---');
  const jsLines = jsText.split('\n');
  const forbidden = [/\?\./, /\?\?/, /Object\.fromEntries/, /\.at\(/, /catch\s*\{/];
  const momLines = [];
  jsLines.forEach((ln, i) => { if (ln.indexOf('moments') >= 0) momLines.push(i); });
  if (!momLines.length) {
    add('D1:moments_lines', 'no ?./??/fromEntries/.at(/catch{', 'no moments lines (baseline)', 'PASS/NA');
  } else {
    const badHits = [];
    momLines.forEach((i) => {
      for (let j = Math.max(0, i - 5); j < Math.min(jsLines.length, i + 6); j++) {
        for (const pat of forbidden) if (pat.test(jsLines[j])) badHits.push('L' + (j + 1) + ':' + jsLines[j].trim().slice(0, 80));
      }
    });
    add('D1:moments_lines', 'no ES2017 new syntax', 'hits:' + (badHits.length ? JSON.stringify(badHits) : 'none'), badHits.length ? 'FAIL' : 'PASS');
  }

  // ---- D2 ----
  log('\n--- D2. node --check assets/app.js ---');
  try {
    const r = spawnSync(NODE, ['--check', APPJS], { encoding: 'utf8' });
    const rc = r.status === null ? (r.error ? 1 : 0) : r.status;
    add('D2:node_check', 'exit 0', 'exit ' + rc, rc === 0 ? 'PASS' : 'FAIL', (r.stderr || '').slice(0, 200));
  } catch (e) {
    add('D2:node_check', 'exit 0', 'EXC ' + e, 'FAIL');
  }

  // ---- E1/E2 ----
  log('\n--- E1/E2. regression guard (route table snapshot) ---');
  const pfVals = {};
  if (pfBlock) {
    for (const k of REQUIRED_PF_KEYS) {
      const m = pfBlock.match(new RegExp("['\"]?" + k.replace(/[-]/g, '\\$&') + "['\"]?\\s*:\\s*['\"]([^'\"]*)['\"]"));
      if (m) pfVals[k] = m[1];
    }
  }
  const ptKeys = ptBlock ? (ptBlock.match(/['\"]?([a-zA-Z0-9\-]+)['\"]?\s*:/g) || []) : [];
  const snapshot = {
    pf_vals: pfVals, pt_keys: ptKeys,
    bom: bomSnap, crlf: crlfSnap,
    dyn: dynSnap, page_mtime: Object.fromEntries(PAGES_32.map((p) => [p, pageSnap[p].mtime])),
    appjs_mtime: fs.statSync(APPJS).mtimeMs
  };
  if (isBaseline || !fs.existsSync(BASELINE_JSON)) {
    fs.writeFileSync(BASELINE_JSON, JSON.stringify(snapshot, null, 2), 'utf8');
    add('E1:required_keys', 'all present', 'missing:' + REQUIRED_PF_KEYS.filter((k) => !(k in pfVals)), 'BASELINE');
    add('E2:pageTitles_keys', 'all present', 'keys=' + ptKeys.length, 'BASELINE');
  } else {
    const base = JSON.parse(fs.readFileSync(BASELINE_JSON, 'utf8'));
    const miss = REQUIRED_PF_KEYS.filter((k) => base.pf_vals[k] !== pfVals[k]);
    add('E1:required_keys', 'values unchanged', 'missing/changed:' + JSON.stringify(miss), miss.length ? 'FAIL' : 'PASS');
    const missPt = base.pt_keys.filter((k) => ptKeys.indexOf(k) < 0);
    add('E2:pageTitles_keys', 'original keys kept', 'lost:' + JSON.stringify(missPt), missPt.length ? 'FAIL' : 'PASS');
    for (const p of DYNAMIC_4) {
      const b = base.dyn[p] || {}, cur = dynSnap[p];
      const changed = (b.dp !== cur.dp) || (b.dy !== cur.dy) || (Math.abs((b.mtime || 0) - cur.mtime) > 1000);
      add('A5:' + p + '[compare]', 'unchanged', 'dp' + b.dp + '->' + cur.dp + ' dy' + b.dy + '->' + cur.dy, changed ? 'FAIL' : 'PASS');
    }
  }

  // ---- C: jsdom ----
  log('\n--- C. jsdom behavior ---');
  if (fs.existsSync(C_JS)) {
    try {
      const r = spawnSync(NODE, [C_JS], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      let outLine = '';
      for (const ln of (r.stdout || '').split('\n')) { const t = ln.trim(); if (t.startsWith('{')) outLine = t; }
      if (outLine) {
        const cj = JSON.parse(outLine);
        const c1 = cj.steps.c1 || {}, c3 = cj.steps.c3 || {}, c4 = cj.steps.c4 || {};
        add('C1:sidebar_node', 'exists/visible/contains ' + S.dyn_space,
          'exists=' + c1.exists + ' text=' + c1.text + ' disp=' + c1.display, c1.pass ? 'PASS' : 'FAIL');
        add('C3:navigateTo_moments', 'no warn & ->动态.html',
          'noWarn=' + c3.noWarn + ' target=' + c3.targetViaTable + ' threw=' + c3.threw, c3.pass ? 'PASS' : 'FAIL');
        add('C4:unknown_page_warn', 'still hits warn branch', 'warned=' + c4.warned, c4.pass ? 'PASS' : 'FAIL');
      } else {
        add('C:jsdom', 'execute', 'no JSON out: ' + (r.stderr || '').slice(0, 200), 'FAIL');
      }
    } catch (e) {
      add('C:jsdom', 'execute', 'EXC ' + e, 'FAIL');
    }
  } else {
    log('C skipped: jsdom check script missing');
  }

  // ---- summary ----
  log('\n' + '='.repeat(70));
  log('SUMMARY');
  log('='.repeat(70));
  const npass = results.filter((x) => x.status === 'PASS').length;
  const nfail = results.filter((x) => x.status === 'FAIL').length;
  const nbase = results.filter((x) => ['BASELINE', 'REC', 'PASS/NA'].indexOf(x.status) >= 0).length;
  log('PASS=' + npass + '  FAIL=' + nfail + '  BASELINE/REC/NA=' + nbase + '  total=' + results.length);
  log('-'.repeat(70));
  for (const x of results) {
    if (['FAIL', 'BASELINE', 'REC', 'PASS/NA'].indexOf(x.status) >= 0)
      log('[' + x.status + '] ' + x.rid + ' | exp=' + x.expect + ' act=' + x.actual + (x.evidence ? ' | ' + x.evidence : ''));
  }
  log('-'.repeat(70));
  log('(full detail in result file)');

  const report = lines.join('\n');
  const outp = TOOLS + '/' + (isBaseline ? '_r73_qa23_baseline.txt' : '_r73_qa23_result.txt');
  fs.writeFileSync(outp, report, 'utf8');
  fs.writeFileSync(outp + '.full', results.map((x) => '[' + x.status + '] ' + x.rid + ' | exp=' + x.expect + ' act=' + x.actual + (x.evidence ? ' | ' + x.evidence : '')).join('\n'), 'utf8');
  log('\nreport written: ' + outp);
  console.log(report);
}

try {
  main();
} catch (e) {
  try {
    fs.writeFileSync(path.join(TOOLS, '_r73_qa23_crash.txt'),
      'CRASH: ' + (e && e.stack ? e.stack : String(e)), 'utf8');
  } catch (_) {}
  process.exit(2);
}
