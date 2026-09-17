/* =====================================================================
   importer.js —— “导入题库”向导
   ---------------------------------------------------------------------
   从 Word(.docx)/txt/CSV 读取内容 → 选择导入到哪个题库(四级词汇/行测/面试)
   → 按目标格式解析 → 入库(经由 qbank 的 __qbImportRaw，存本机并合入对应题库)。
   依赖：qbank.js（提供 __qbImportRaw / __qbReg）；docx 用浏览器原生 DecompressionStream 解压。
   用法：openImporter()
   ===================================================================== */
(function () {
  'use strict';
  if (window.__IMPORTER__) return;
  window.__IMPORTER__ = 1;

  var TARGETS = null; // {key: label}
  function regs() { try { return window.__qbReg ? __qbReg() : {}; } catch (e) { return {}; } }

  function ensureCss() {
    if (document.getElementById('impStyle')) return;
    var css = '.imp-mask{position:fixed;inset:0;background:rgba(15,18,30,.5);backdrop-filter:blur(3px);z-index:2300;display:flex;align-items:center;justify-content:center;padding:16px}.imp-box{background:var(--card);color:var(--text);width:100%;max-width:680px;max-height:90vh;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px -18px rgba(0,0,0,.4)}.imp-head{display:flex;align-items:center;gap:8px;padding:12px 16px;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff}.imp-head b{flex:1}.imp-x{background:rgba(255,255,255,.18);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer}.imp-body{overflow-y:auto;padding:16px;flex:1}.imp-step{font-size:12px;color:var(--text-secondary);margin-bottom:10px}.imp-file{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.imp-note{font-size:12px;color:var(--text-muted);margin-top:8px;line-height:1.7}.imp-tg{display:flex;gap:10px;flex-wrap:wrap}.imp-tg .imp-t{flex:1;min-width:170px;border:1.5px solid var(--border);border-radius:14px;padding:14px;cursor:pointer;background:var(--card)}.imp-tg .imp-t.on{border-color:var(--primary);background:var(--primary-light)}.imp-tg .imp-t .ic{font-size:22px}.imp-tg .imp-t .nm{font-weight:700;font-size:14px;margin:4px 0 2px}.imp-tg .imp-t .ds{font-size:12px;color:var(--text-secondary)}.imp-pv{border:1px solid var(--border);border-radius:12px;background:var(--bg);max-height:180px;overflow:auto;padding:10px;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;color:var(--text-secondary);margin-bottom:12px}.imp-res{display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:8px}.imp-acts{display:flex;gap:10px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--border)}@media (max-width:560px){.imp-tg .imp-t{min-width:0;flex:1 1 100%}.imp-box{max-height:92vh}.imp-head b{white-space:normal}.imp-note,.imp-step{word-break:break-word}}';
    var st = document.createElement('style'); st.id = 'impStyle'; st.textContent = css; (document.head || document.documentElement).appendChild(st);
  }

  var S = null;
  /* 统一提示：优先 xtToast → showToast → 自建 DOM toast。严禁 alert/confirm/prompt（静默失败即为此前的“导不进去”） */
  function toast(m, st) {
    var msg = String(m == null ? '' : m);
    try { if (typeof window.xtToast === 'function') { window.xtToast(st || 'info', msg); return; } } catch (e) { }
    try { if (typeof window.showToast === 'function') { window.showToast(msg); return; } } catch (e2) { }
    try { if (typeof showToast === 'function') { showToast(msg); return; } } catch (e3) { }
    try {
      var d = document.createElement('div');
      d.textContent = msg;
      d.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:4000;background:rgba(20,22,34,.92);color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;max-width:80vw;line-height:1.6';
      document.body.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2600);
    } catch (e4) { }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function closeI() { var m = document.getElementById('impMask'); if (m) m.remove(); S = null; }

  /* ---------- 自定义题库（按文件名自动建立，存本机 localStorage） ----------
     与 qbank.js 的内置题库(REG) 解耦：导入向导自带一个“按文件名”的自定义题库表，
     写入 localStorage['study_workbench_imports'] = { "<自定义库名>": {label,type,items,updatedAt} }。
     导入成功后无论选内置还是自定义目标，都按文件名自动建立/覆盖一个自定义题库，
     重复导入同名文件整体替换（合理行为，避免无限新建同名库）。 */
  var IMPORTS_KEY = 'study_workbench_imports';
  function safeFileName(name) {
    var n = (name || '未命名文件').replace(/\.[^.]+$/, '');
    n = n.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
    return (n || '未命名文件').slice(0, 40);
  }
  function loadImportBanks() { try { return JSON.parse(localStorage.getItem(IMPORTS_KEY)) || {}; } catch (e) { return {}; } }
  function saveImportBanks(m) { try { localStorage.setItem(IMPORTS_KEY, JSON.stringify(m)); } catch (e) { } }
  function upsertImportBank(name, type, items, module) {
    var m = loadImportBanks();
    var prev = m[name] || {};
    /* 需求13：记录「归属分组」——导入到内置题库时取该库名（如「四级词汇 / 行测刷题 / 面试题库」），
       仅存为自定义题库时归入「题库」；我的文件.html 读取该字段做模块分组展示。 */
    m[name] = {
      label: name,
      type: type,
      items: (items || []).slice(),
      updatedAt: new Date().toISOString().slice(0, 10),
      module: module || prev.module || '题库'
    };
    saveImportBanks(m);
    return (items || []).length;
  }
  function detectType(key) {
    if (key === 'cet') return 'cet';
    if (key === 'exam') return 'exam';
    if (key === 'iv') return 'iv';
    return 'text';
  }

  /* ---------- 字节/文本工具 ---------- */
  async function readXlsxText(file) {
    var buf = await file.arrayBuffer();
    var NSr = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    var wb = await zipEntry(buf, 'xl/workbook.xml');
    if (!wb) return { ok: false, msg: '无法读取该 Excel：文件可能已损坏或不是有效的 .xlsx 文件（不支持 .xls 老格式）' };
    var doc = new DOMParser().parseFromString(toText(wb), 'application/xml');
    var sheet = doc.getElementsByTagNameNS('*', 'sheet')[0];
    var rid = sheet ? (sheet.getAttributeNS(NSr, 'id') || sheet.getAttribute('r:id') || '') : '';
    var target = 'xl/worksheets/sheet1.xml';
    var relsEntry = await zipEntry(buf, 'xl/_rels/workbook.xml.rels');
    if (relsEntry) {
      var rd = new DOMParser().parseFromString(toText(relsEntry), 'application/xml');
      var rels = rd.getElementsByTagNameNS('*', 'Relationship');
      for (var i = 0; i < rels.length; i++) {
        var rel = rels[i];
        if (rel.getAttribute('Id') === rid) { target = rel.getAttribute('Target') || target; break; }
      }
    }
    if (target.charAt(0) !== '/') target = 'xl/' + target; else target = target.slice(1);
    var sheetEntry = await zipEntry(buf, target);
    if (!sheetEntry) return { ok: false, msg: '找不到工作表内容' };
    var shared = [];
    var ss = await zipEntry(buf, 'xl/sharedStrings.xml');
    if (ss) {
      var sd = new DOMParser().parseFromString(toText(ss), 'application/xml');
      var sis = sd.getElementsByTagNameNS('*', 'si');
      for (var j = 0; j < sis.length; j++) {
        var t = '';
        var ts = sis[j].getElementsByTagNameNS('*', 't');
        for (var k = 0; k < ts.length; k++) t += ts[k].textContent || '';
        shared.push(t);
      }
    }
    var sd2 = new DOMParser().parseFromString(toText(sheetEntry), 'application/xml');
    var rows = sd2.getElementsByTagNameNS('*', 'row');
    var lines = [];
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].getElementsByTagNameNS('*', 'c');
      var vals = [];
      for (var ci = 0; ci < cells.length; ci++) {
        var c = cells[ci], val = '';
        var ty = c.getAttribute('t') || '';
        var v = c.getElementsByTagNameNS('*', 'v')[0];
        if (ty === 's') { var ix = v ? parseInt(v.textContent, 10) : -1; val = (ix >= 0 && shared[ix] != null) ? shared[ix] : ''; }
        else if (ty === 'inlineStr') { var ist = c.getElementsByTagNameNS('*', 't'); for (var ti = 0; ti < ist.length; ti++) val += ist[ti].textContent || ''; }
        else val = v ? (v.textContent || '') : '';
        vals.push(val.trim());
      }
      if (vals.some(function (x) { return x; })) lines.push(vals.join('\t'));
    }
    return { ok: true, text: lines.join('\n') };
  }
  function parseTextCards(text) {
    return lines(text).map(function (ln) { return { text: ln.replace(/^\s*[\d\.\-\*•]+\s*/, '') }; });
  }
  function toText(u8) { try { return new TextDecoder('utf-8').decode(u8); } catch (e) { return ''; } }
  /* 读取 txt/csv：去 BOM → 先按 UTF-8 严格解码 → 失败/出现乱码字符时回退 GBK/GB18030/Big5（避免中文文件读出乱码或 0 条） */
  async function readTextFile(f) {
    var buf = await f.arrayBuffer();
    var u8 = new Uint8Array(buf);
    if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) u8 = u8.subarray(3);
    if (!u8.length) return '';
    var txt = null;
    try { txt = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { txt = null; }
    if (txt == null || /\uFFFD/.test(txt)) {
      var alts = ['gbk', 'gb18030', 'big5'];
      for (var i = 0; i < alts.length; i++) {
        try { var t2 = new TextDecoder(alts[i]).decode(u8); if (t2 && !/\uFFFD/.test(t2)) { txt = t2; break; } } catch (e2) { }
      }
    }
    if (txt == null) txt = toText(u8);
    return txt;
  }
  async function inflateRaw(u8) {
    var mk = function (fmt) {
      try { var ds = new DecompressionStream(fmt); return new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer(); }
      catch (e) { return null; }
    };
    try { var a = await mk('deflate-raw'); if (a) return new Uint8Array(a); } catch (e) { }
    try { var b = await mk('deflate'); if (b) return new Uint8Array(b); } catch (e) { }
    return null;
  }
  async function zipEntry(buf, wanted) {
    var u = new Uint8Array(buf), dv = new DataView(buf), eocd = -1;
    for (var i = u.length - 22; i >= Math.max(0, u.length - 22 - 65536); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return null;
    var cdOff = dv.getUint32(eocd + 16, true);
    for (var p = cdOff; p < u.length; ) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), cmtLen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = toText(u.subarray(p + 46, p + 46 + nameLen));
      if (name === wanted) {
        var ln = dv.getUint16(lho + 26, true), le = dv.getUint16(lho + 28, true);
        var comp = u.subarray(lho + 30 + ln + le, lho + 30 + ln + le + csize);
        if (method === 0) return comp;
        return await inflateRaw(comp);
      }
      p = p + 46 + nameLen + extraLen + cmtLen;
    }
    return null;
  }
  // 列出 zip 内所有文件名（用于 pptx 枚举幻灯片）
  function zipList(buf) {
    var u = new Uint8Array(buf), dv = new DataView(buf), eocd = -1;
    for (var i = u.length - 22; i >= Math.max(0, u.length - 22 - 65536); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return [];
    var cdOff = dv.getUint32(eocd + 16, true);
    var names = [];
    for (var pp = cdOff; pp < u.length; ) {
      if (dv.getUint32(pp, true) !== 0x02014b50) break;
      var nameLen = dv.getUint16(pp + 28, true), extraLen = dv.getUint16(pp + 30, true), cmtLen = dv.getUint16(pp + 32, true);
      var name = toText(u.subarray(pp + 46, pp + 46 + nameLen));
      names.push(name);
      pp = pp + 46 + nameLen + extraLen + cmtLen;
    }
    return names;
  }
  async function readDocxText(file) {
    var buf = await file.arrayBuffer();
    var entry = await zipEntry(buf, 'word/document.xml');
    if (!entry) return { ok: false, msg: '无法读取该 docx：文件可能已损坏、为空，或不是有效的 Word 文档。请用 Word 打开确认文件正常后另存为 .docx 再试。' };
    var xml = toText(entry);
    var doc;
    try { doc = new DOMParser().parseFromString(xml, 'application/xml'); } catch (e) { return { ok: false, msg: '文档解析失败' }; }
    var NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    var paras = [];
    var ps = doc.getElementsByTagNameNS(NS, 'p');
    if (!ps.length) { try { ps = doc.getElementsByTagName('w:p'); } catch (e2) { ps = []; } }
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i], t = '';
      var ts = p.getElementsByTagNameNS(NS, 't');
      if (!ts.length) { try { ts = p.getElementsByTagName('w:t'); } catch (e3) { ts = []; } }
      for (var j = 0; j < ts.length; j++) { t += ts[j].textContent || ''; }
      var tabs = p.getElementsByTagNameNS(NS, 'tab');
      if (tabs.length) t += ' ';
      paras.push(t.trim());
    }
    return { ok: true, text: paras.join('\n') };
  }

  // 读取 PPT(.pptx) 所有幻灯片文字
  async function readPptxText(file) {
    var buf = await file.arrayBuffer();
    var allNames = zipList(buf);
    // 筛选幻灯片文件 ppt/slides/slideN.xml
    var slideNames = allNames.filter(function (n) {
      return /^ppt\/slides\/slide\d+\.xml$/.test(n);
    }).sort(function (a, b) {
      var na = parseInt(a.match(/slide(\d+)/)[1], 10);
      var nb = parseInt(b.match(/slide(\d+)/)[1], 10);
      return na - nb;
    });
    if (!slideNames.length) {
      return { ok: false, msg: '无法读取该 PPT：未找到幻灯片内容，文件可能已损坏或不是有效的 .pptx 文件（不支持 .ppt 老格式）' };
    }
    var NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    var slides = [];
    for (var si = 0; si < slideNames.length; si++) {
      var entry = await zipEntry(buf, slideNames[si]);
      if (!entry) continue;
      var xml = toText(entry);
      var doc;
      try { doc = new DOMParser().parseFromString(xml, 'application/xml'); } catch (e) { continue; }
      // 提取所有 <a:t> 文字
      var texts = [];
      var ts = doc.getElementsByTagNameNS(NS_A, 't');
      if (!ts.length) { try { ts = doc.getElementsByTagName('a:t'); } catch (e2) { ts = []; } }
      for (var ti = 0; ti < ts.length; ti++) {
        var txt = (ts[ti].textContent || '').trim();
        if (txt) texts.push(txt);
      }
      if (texts.length) {
        slides.push('【第' + (si + 1) + '页】\n' + texts.join('\n'));
      }
    }
    if (!slides.length) {
      return { ok: false, msg: 'PPT 里没有提取到文字内容（可能是纯图片/扫描件，或文字在图片里无法识别）' };
    }
    return { ok: true, text: slides.join('\n\n') };
  }

  /* ---------- 分目标解析器：返回 {ok, items} ---------- */
  function lines(text) { return (text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s; }); }

  function parseCet(text) {
    var out = [];
    lines(text).forEach(function (ln) {
      var s = ln.replace(/^\s*[\d\.\-\*•]+\s*/, '').trim();
      if (!s) return;
      // 尝试 word + 音标 + 释义
      var m = s.match(/^([A-Za-z][A-Za-z\-\' ]+?)\s+([\/\[].*?[\/\]])\s*(.*)$/);
      var word, phonetic = '', meaning = '';
      if (m) { word = m[1]; phonetic = m[2]; meaning = m[3]; }
      else {
        // word \t meaning 或 word — meaning 或 word：meaning
        var mm = s.match(/^([A-Za-z][A-Za-z\-\' ]+?)\s*(?:[\t—–:：]\s*|\s+\-\s+|\s+)\s*(.*)$/);
        if (mm) { word = mm[1]; meaning = mm[2]; } else { word = s; meaning = ''; }
      }
      if (meaning.indexOf('例：') >= 0) { var sp = meaning.split(/例[:：]/); meaning = sp[0].trim(); }
      if (!meaning) meaning = '(未识别释义)';
      out.push({ word: word.trim(), phonetic: phonetic, meaning: meaning });
    });
    return out;
  }
  function parseExam(text) {
    var blocks = (text || '').split(/\n\s*\n/).map(function (b) { return b.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean); }).filter(function (b) { return b.length; });
    var out = [];
    blocks.forEach(function (blk) {
      var opts = [], qLines = [], exp = '', tip = '', answer = -1;
      var qDone = false;
      blk.forEach(function (ln) {
        var om = ln.match(/^\s*([A-Da-d])[\.\、\)）\s]\s*(.*)$/);
        if (om) { opts.push(om[2].trim()); if (qLines.length) qDone = true; return; }
        var am = ln.match(/^(?:答案|正确答案)\s*[:：]?\s*([A-Da-d])/);
        if (am) { answer = ['A', 'B', 'C', 'D'].indexOf(am[1].toUpperCase()); qDone = true; return; }
        var em = ln.match(/^解析\s*[:：]\s*(.*)$/);
        if (em) { exp = em[1]; qDone = true; return; }
        var tm = ln.match(/^(?:提示|技巧)\s*[:：]\s*(.*)$/);
        if (tm) { tip = tm[1]; qDone = true; return; }
        if (!qDone && opts.length === 0) qLines.push(ln);
      });
      var q = qLines.join(' ').replace(/^\s*\d+[\.\、\s]\s*/, '');
      if (!q && opts.length) q = '（缺题干）';
      if (q && opts.length >= 2) {
        out.push({ q: q, options: opts.slice(0, 4), answer: (answer >= 0 && answer < opts.length) ? answer : (answer >= 0 && answer < 4 ? answer : 0), exp: exp, tip: tip, type: '自定义', sub: '导入' });
      }
    });
    return out;
  }
  function parseIv(text) {
    var out = [];
    lines(text).forEach(function (ln) {
      var s = ln.replace(/^\s*\d+[\.\、\s]\s*/, '');
      out.push({ question: s, type: '', framework: '', tips: [], sample: '' });
    });
    return out;
  }

  /* ---------- UI ---------- */
  function shell(title, bodyFn) {
    var box = document.getElementById('impBody');
    box.innerHTML = '<div class="imp-step">' + title + '</div>' + bodyFn();
  }
  function fileStep() {
    shell('第 1 步：选择文件（Word .docx / 文本 .txt / 表格 .csv）', function () {
      return '<div class="imp-file">' +
        '<button class="btn btn-primary" onclick="document.getElementById(\'impFile\').click()">📄 选择文件</button>' +
        '<span id="impFileName" style="font-size:13px;color:var(--text-secondary)">未选择</span>' +
        '<input type="file" id="impFile" accept=".docx,.txt,.csv,.xlsx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv" style="display:none" onchange="__impPick(event)">' +
        '</div>' +
        '<div class="imp-note">支持：Word(.docx)、PPT(.pptx)、文本(.txt)、表格(.csv/.xlsx)。先选文件，再选导入到哪个题库。<br>PPT 会逐页提取文字（每页加【第N页】标记）；普通文本段落/按行即可识别。</div>';
    });
  }
  function targetStep() {
    // 防御：依赖 qbank.js 暴露的 __qbReg；若组件未加载也不要让整步崩溃（避免裸 __qbReg 触发 ReferenceError）
    var tg = {};
    try { if (typeof window.__qbReg === 'function') tg = window.__qbReg() || {}; } catch (e) { tg = {}; }
    var std = [
      { k: 'cet', ic: '📖', nm: '四级词汇', ds: '每行：单词、音标(可选)、释义' },
      { k: 'exam', ic: '🧮', nm: '行测刷题', ds: '题干 + A/B/C/D 选项 + 答案 + 解析' },
      { k: 'iv', ic: '🤝', nm: '面试题库', ds: '每题一段文字（问题/要点/参考）' },
      { k: 'quotes', ic: '💬', nm: '万能金句', ds: '每行一条金句/话术文字' },
      { k: 'scenes', ic: '🎭', nm: '场景话术', ds: '每行一条场景话术文字' },
      { k: 'etiquet', ic: '🎩', nm: '商务礼仪', ds: '每行一条礼仪要点文字' },
      { k: 'layouts', ic: '🧱', nm: 'PPT版式', ds: '每行一条版式/技巧文字' }
    ].filter(function (c) { return tg[c.k]; });

    var banks = loadImportBanks();
    var curName = '自定义·' + safeFileName(S.rawName);
    var card = function (c) {
      return '<div class="imp-t' + (c.k === S.target ? ' on' : '') + '" data-k="' + esc(c.k) + '" onclick="__impTarget(\'' + esc(c.k) + '\')"><div class="ic">' + c.ic + '</div><div class="nm">' + esc(c.nm) + '</div><div class="ds">' + esc(c.ds) + '</div></div>';
    };
    var stdHtml = std.map(card).join('');
    var customCards = Object.keys(banks).map(function (n) {
      return { k: n, ic: '📦', nm: n, ds: '自定义题库 · ' + ((banks[n].items || []).length) + ' 条（点它作为导入目标）' };
    });
    if (banks[curName] == null) customCards.unshift({ k: curName, ic: '➕', nm: curName, ds: '为本次文件新建自定义题库（点它作为导入目标）' });
    var customHtml = customCards.map(card).join('');

    var parsedTotal = lines(S.text).length;
    shell('第 2 步：要把这份内容导入到哪个题库？', function () {
      return '<div class="imp-res">已读取文件：<b>' + esc(S.rawName) + '</b> · 共 ' + parsedTotal + ' 行/段，解析出 <b>' + ((S.parsed && S.parsed.length) || 0) + '</b> 条可入库内容</div>' +
        (std.length
          ? '<div style="font-weight:700;margin:8px 0 4px">① 内置题库（导入后立即可在对应页面刷题/查看）</div><div class="imp-tg">' + stdHtml + '</div>'
          : '<div class="imp-note">⚠️ 内置题库组件未加载（qbank.js），请刷新本页后重试；你仍可选择下方“自定义题库”完成导入。</div>') +
        '<div style="font-weight:700;margin:10px 0 4px">② 自定义题库（按文件名自动建立，可重复导入覆盖）</div><div class="imp-tg">' + (customHtml || '<div class="imp-note">暂无，导入后会自动生成</div>') + '</div>' +
        '<div id="impPreviewBox"></div>' +
        '<div class="imp-acts" style="padding:0;border:none;justify-content:flex-start;margin-top:12px">' +
        '<button class="btn btn-outline" onclick="__impBackFile()">← 换文件</button>' +
        '<button class="btn btn-primary" id="impDo" onclick="__impDo()">导入</button></div>';
    });
  }
  /* 自定义题库的目标：按库里已存的类型解析；新库按文件内容自动判定类型（选项/答案→行测；音标→词汇） */
  function autoType(text) {
    var t = String(text || '');
    if (/^\s*[A-Da-d][\.\、\)）]\s*\S/m.test(t) || /(?:答案|正确答案)\s*[:：]?\s*[A-Da-d]/m.test(t)) return 'exam';
    if (/^\s*[A-Za-z][A-Za-z\-\' ]{0,20}\s*[\/\[][^\/\]]{1,30}[\/\]]/m.test(t)) return 'cet';
    return 'text';
  }
  function parseKeyOf(k) {
    if (isBuiltin(k)) return k;
    var b = (S && S.banks) ? S.banks[k] : loadImportBanks()[k];
    if (b && b.type) return b.type;
    return (S && S.ftype) ? S.ftype : 'text';
  }
  function parseFor(k, text) {
    var pk = parseKeyOf(k);
    if (pk === 'cet') return parseCet(text);
    if (pk === 'exam') return parseExam(text);
    return parseTextCards(text);
  }
  function showPreview() {
    var key = S.target;
    var parsed = parseFor(key, S.text);
    S.parsed = parsed;
    var box = document.getElementById('impPreviewBox');
    var first = parsed.slice(0, 6).map(function (it) {
      var head = key === 'exam' ? it.q : (key === 'cet' ? (it.word + ' ' + it.meaning).slice(0, 60) : (it.question || it.text || '').slice(0, 60));
      return esc(head);
    }).join('\n');
    box.innerHTML = '<div style="font-weight:700;color:var(--text);margin:4px 0 6px">预览（识别 ' + parsed.length + ' 条，前几条）</div>' +
      '<div class="imp-pv">' + (first || '未能识别出内容。\n\n请检查：\n1. 文档是否有实际文字内容（不是纯图片/扫描件）\n2. 四级词汇：每行一个单词（可加音标/释义）\n3. 行测题：题干 + A/B/C/D 选项 + 答案 + 解析，每题之间空一行\n4. 面试题：每行一个问题') + '</div>';
    var doBtn = document.getElementById('impDo');
    if (doBtn) {
      doBtn.style.display = '';
      if (parsed.length) { doBtn.disabled = false; doBtn.textContent = '✅ 导入 ' + parsed.length + ' 条到「' + labelOf(key) + '」'; }
      else { doBtn.disabled = true; doBtn.textContent = '解析出 0 条，无法导入'; }
    }
  }
  function labelOf(k) {
    try { var r = (typeof window.__qbReg === 'function') ? window.__qbReg() : {}; if (r[k]) return r[k]; } catch (e) { }
    return k || '题库';
  }

  window.__impPick = async function (ev) {
    try {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    // 文件大小检查
    if (f.size === 0) { toast('⚠️ 文件为空（0 字节），请选择有效的文档文件'); return; }
    if (f.size > 20 * 1024 * 1024) { toast('⚠️ 文件过大（超过 20MB），请选择较小的文档'); return; }
    var nameEl = document.getElementById('impFileName');
    if (nameEl) nameEl.textContent = '⏳ 正在读取 ' + f.name + ' …（' + Math.max(1, Math.round(f.size / 1024)) + ' KB）';
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    // 老格式 .doc 不支持
    if (ext === 'doc') { if (nameEl) nameEl.textContent = f.name; toast('⚠️ 不支持 .doc 老格式：请用 Word 打开后「另存为 .docx」，或把内容复制到 .txt 再导入', 'warning'); return; }
    if (ext === 'ppt') { if (nameEl) nameEl.textContent = f.name; toast('⚠️ 不支持 .ppt 老格式：请用 PowerPoint 另存为 .pptx 后再导入', 'warning'); return; }
    var res;
    try {
    if (ext === 'docx') { res = await readDocxText(f); if (!res.ok) { if (nameEl) nameEl.textContent = f.name; toast('⚠️ 第 1 步：' + res.msg, 'error'); return; } S.text = res.text; }
    else if (ext === 'xlsx') { res = await readXlsxText(f); if (!res.ok) { if (nameEl) nameEl.textContent = f.name; toast('⚠️ 第 1 步：' + res.msg, 'error'); return; } S.text = res.text; }
    else if (ext === 'pptx') { res = await readPptxText(f); if (!res.ok) { if (nameEl) nameEl.textContent = f.name; toast('⚠️ 第 1 步：' + res.msg, 'error'); return; } S.text = res.text; }
    else if (ext === 'csv' || ext === 'txt') {
        S.text = await readTextFile(f);
    }
    else { if (nameEl) nameEl.textContent = f.name; toast('⚠️ 暂不支持 .' + (ext || '未知') + ' 格式：请提供 .docx / .pptx / .txt / .csv / .xlsx 文件', 'warning'); return; }
    } catch (err) {
      if (nameEl) nameEl.textContent = f.name;
      toast('⚠️ 第 1 步读取文件失败：' + (err && err.message ? err.message : err) + '。若为 .docx/.xlsx/.pptx，请确认文件未损坏、未被加密', 'error');
      return;
    }
    if (!String(S.text || '').trim()) {
      if (nameEl) nameEl.textContent = f.name;
      toast('⚠️ 第 1 步：文件里没有读到任何文字。若是扫描件/纯图片 PDF 转成的 Word，请先做文字识别；也可把内容复制到 .txt 再导入', 'error');
      return;
    }
    S.rawName = f.name;
    S.ftype = autoType(S.text);
    S.banks = loadImportBanks();
    ev.target.value = '';
    S.target = null; S.parsed = [];
    targetStep();
    } catch (e) { toast('⚠️ 导入向导出错：' + (e && e.message ? e.message : e), 'error'); }
  };
  window.__impTarget = function (k) { S.target = k; S.parsed = []; targetStep(); showPreview(); };
  window.__impBackFile = function () { fileStep(); };
  function isBuiltin(k) {
    try { return !!(window.__qbReg && window.__qbReg()[k]); } catch (e) { return false; }
  }
  function itemKey(it) {
    return String(it && (it.text || it.q || it.question || it.word || it.title || '')).replace(/\s+/g, ' ').trim();
  }
  window.__impDo = function () {
    if (!S) { toast('⚠️ 向导未打开，请从「工具 → 导入题库」重新进入', 'warning'); return; }
    if (!String(S.text || '').trim()) { toast('⚠️ 第 1 步：还没读到文件内容，请先选择文件', 'warning'); return; }
    if (!S.target) { toast('⚠️ 第 2 步：请先点一个题库卡片（内置题库或自定义题库）', 'warning'); return; }
    var items = (S.parsed && S.parsed.length) ? S.parsed : (parseFor(S.target, S.text) || []);
    S.parsed = items;
    if (!items.length) {
      toast('⚠️ 第 2 步：解析出 0 条内容，请检查文件是否为 .txt/.csv/.docx/.xlsx/.pptx，且每行/每段含题干与选项', 'warning');
      return;
    }
    var btn = document.getElementById('impDo');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 正在导入 ' + items.length + ' 条…'; }
    try {
      var banks = loadImportBanks();
      var curName = '自定义·' + safeFileName(S.rawName);
      var curType = (banks[curName] && banks[curName].type) || S.ftype || 'text';
      var toBuiltin = isBuiltin(S.target);
      var extra = '';

      /* ① 内置题库：走 qbank.js 的 __qbImportRaw（必须判空，工具.html 未加载 qbank.js，裸调用会 ReferenceError 静默失败） */
      if (toBuiltin) {
        if (typeof window.__qbImportRaw !== 'function') {
          toast('⚠️ 内置题库组件（qbank.js）未加载，无法写入「' + labelOf(S.target) + '」。请刷新页面后重试，或改选下方「自定义题库」', 'error');
          if (btn) { btn.disabled = false; btn.textContent = '✅ 导入 ' + items.length + ' 条到「' + labelOf(S.target) + '」'; }
          return;
        }
        var r = window.__qbImportRaw(S.target, items) || { ok: false, msg: '未知原因' };
        if (!r.ok) {
          toast('⚠️ 第 3 步：写入「' + labelOf(S.target) + '」失败：' + (r.msg || '未知原因') + '。请改选下方「自定义题库」完成导入', 'error');
          if (btn) { btn.disabled = false; btn.textContent = '✅ 导入 ' + items.length + ' 条到「' + labelOf(S.target) + '」'; }
          return;
        }
        if (r.n <= 0) {
          toast('⚠️ 第 3 步：' + items.length + ' 条全部未通过「' + labelOf(S.target) + '」的格式校验' + (r.skip ? '（跳过 ' + r.skip + ' 条）' : '') + '。内容已存为自定义题库「' + curName + '」，也可换一个题库再试', 'warning');
        } else {
          extra = '到「' + labelOf(S.target) + '」' + (r.skip ? '（跳过 ' + r.skip + ' 条重复/不合规）' : '');
        }
      }

      /* ② 自定义题库：按文件名自动建库，写 localStorage['study_workbench_imports']。
         需求13：内置目标时把该题库名写入 module（归属分组），我的文件.html 据此分组展示卡片。 */
      var curModule = toBuiltin ? labelOf(S.target) : '题库';
      if (toBuiltin || S.target === curName || !banks[S.target]) {
        // 同一文件重复导入 → 整体替换（避免每次新建一个同名库）
        upsertImportBank(curName, curType, items, curModule);
        if (!toBuiltin) extra = '到自定义题库「' + curName + '」（' + items.length + ' 条，' + (banks[curName] ? '已覆盖更新' : '已新建') + '）';
      } else {
        // 目标为其它已存在的自定义库 → 追加并按内容去重
        var old = (banks[S.target].items || []).slice();
        var seen = {};
        old.forEach(function (x) { var k = itemKey(x); if (k) seen[k] = 1; });
        var add = items.filter(function (it) { var k = itemKey(it); if (!k || seen[k]) return false; seen[k] = 1; return true; });
        upsertImportBank(S.target, banks[S.target].type || curType, old.concat(add), banks[S.target].module || '题库');
        upsertImportBank(curName, curType, items, curModule);
        extra = '到自定义题库「' + S.target + '」（新增 ' + add.length + ' 条，跳过 ' + (items.length - add.length) + ' 条重复）';
      }

      var curN = ((loadImportBanks()[curName] || {}).items || []).length;
      var tip = '✅ 已导入 ' + items.length + ' 条' + (extra || ('到「' + labelOf(S.target) + '」')) +
        (toBuiltin ? '；并已自动保存为自定义题库「' + curName + '」' + (curN ? '（' + curN + ' 条）' : '') : '');
      toast(tip, 'success');

      /* ③ R72-9：可选登记到「我的文件」——数据键为唯一真相，登记函数为可选增强。
         跨页调用可能不存在（我的文件.html 未加载该脚本时 window.xtFilesRegister 为 undefined），
         故 typeof 守卫 + try/catch；未加载时静默跳过，由 我的文件.html 渲染时汇总数据键。 */
      try {
        if (typeof window.xtFilesRegister === 'function') {
          var regModule = isBuiltin(S.target) ? labelOf(S.target) : (S.target || curName);
          var regTitle = toBuiltin ? (curName + '（到 ' + labelOf(S.target) + '）') : ('自定义·' + safeFileName(S.rawName));
          window.xtFilesRegister({
            id: 'imp:' + (toBuiltin ? labelOf(S.target) : S.target) + ':' + curName,
            title: regTitle,
            kind: 'bank',
            module: regModule || '题库',
            source: 'import',
            items: items.length,
            size: 0,
            createdAt: new Date().toISOString(),
            payload: { name: curName, type: curType, count: items.length }
          });
        }
      } catch (eReg) { /* 登记为可选增强：失败绝不影响导入主流程 */ }

      /* ③ 收尾：刷新宿主页面的题库列表 → 关闭向导 */
      try { if (typeof window.__impAfterImport === 'function') window.__impAfterImport(); } catch (e) { }
      var view = document.getElementById('importerView');
      if (view && typeof window.closeImporterView === 'function') window.closeImporterView();
      else closeI();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '✅ 导入 ' + items.length + ' 条'; }
      toast('⚠️ 第 3 步导入失败：' + (e && e.message ? e.message : e), 'error');
    }
  };
  /* 供宿主页面（工具.html）展示 / 删除自定义题库 */
  window.__impBanks = loadImportBanks;
  window.__impBankKey = IMPORTS_KEY;
  window.__impDelBank = function (name) {
    var m = loadImportBanks(); if (m[name]) { delete m[name]; saveImportBanks(m); return true; } return false;
  };
  window.__impClose = closeI;
  window.__impParse = function (key, text) { return key === 'cet' ? parseCet(text) : key === 'exam' ? parseExam(text) : parseTextCards(text); };
  window.__impExtractDocx = readDocxText;

  function openImporter() {
    TARGETS = regs();
    ensureCss();
    S = { text: '', rawName: '', target: null, parsed: [], ftype: 'text', banks: loadImportBanks() };
    var m = document.createElement('div'); m.id = 'impMask'; m.className = 'imp-mask';
    m.innerHTML = '<div class="imp-box"><div class="imp-head"><b>📥 导入题库</b><button class="imp-x" onclick="__impClose()">✕</button></div><div class="imp-body" id="impBody"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) closeI(); });
    fileStep();
  }
  window.openImporter = openImporter;
})();
