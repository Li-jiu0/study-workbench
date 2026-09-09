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
    var css = '.imp-mask{position:fixed;inset:0;background:rgba(15,18,30,.5);backdrop-filter:blur(3px);z-index:2300;display:flex;align-items:center;justify-content:center;padding:16px}.imp-box{background:var(--card);color:var(--text);width:min(680px,100%);max-height:90vh;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px -18px rgba(0,0,0,.4)}.imp-head{display:flex;align-items:center;gap:8px;padding:12px 16px;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff}.imp-head b{flex:1}.imp-x{background:rgba(255,255,255,.18);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer}.imp-body{overflow-y:auto;padding:16px;flex:1}.imp-step{font-size:12px;color:var(--text-secondary);margin-bottom:10px}.imp-file{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.imp-note{font-size:12px;color:var(--text-muted);margin-top:8px;line-height:1.7}.imp-tg{display:flex;gap:10px;flex-wrap:wrap}.imp-tg .imp-t{flex:1;min-width:170px;border:1.5px solid var(--border);border-radius:14px;padding:14px;cursor:pointer;background:var(--card)}.imp-tg .imp-t.on{border-color:var(--primary);background:var(--primary-light)}.imp-tg .imp-t .ic{font-size:22px}.imp-tg .imp-t .nm{font-weight:700;font-size:14px;margin:4px 0 2px}.imp-tg .imp-t .ds{font-size:12px;color:var(--text-secondary)}.imp-pv{border:1px solid var(--border);border-radius:12px;background:var(--bg);max-height:180px;overflow:auto;padding:10px;font-size:12px;line-height:1.7;white-space:pre-wrap;color:var(--text-secondary);margin-bottom:12px}.imp-res{display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:8px}.imp-acts{display:flex;gap:10px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--border)}';
    var st = document.createElement('style'); st.id = 'impStyle'; st.textContent = css; (document.head || document.documentElement).appendChild(st);
  }

  var S = null;
  function toast(m) { if (typeof showToast === 'function') { showToast(m); return; } if (typeof alert === 'function') alert(m); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function closeI() { var m = document.getElementById('impMask'); if (m) m.remove(); S = null; }

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
    var tg = __qbReg ? __qbReg() : {};
    var cards = [
      { k: 'cet', ic: '📖', nm: '四级词汇', ds: '每行：单词、音标(可选)、释义' },
      { k: 'exam', ic: '🧮', nm: '行测刷题', ds: '题干 + A/B/C/D 选项 + 答案 + 解析' },
      { k: 'iv', ic: '🤝', nm: '面试题库', ds: '每题一段文字（问题/要点/参考）' },
      { k: 'quotes', ic: '💬', nm: '万能金句', ds: '每行一条金句/话术文字' },
      { k: 'scenes', ic: '🎭', nm: '场景话术', ds: '每行一条场景话术文字' },
      { k: 'etiquet', ic: '🎩', nm: '商务礼仪', ds: '每行一条礼仪要点文字' },
      { k: 'layouts', ic: '🧱', nm: 'PPT版式', ds: '每行一条版式/技巧文字' }
    ].filter(function (c) { return tg[c.k]; });
    var on = cards.map(function (c) { return '<div class="imp-t' + (c.k === S.target ? ' on' : '') + '" data-k="' + c.k + '" onclick="__impTarget(\'' + c.k + '\')"><div class="ic">' + c.ic + '</div><div class="nm">' + c.nm + '</div><div class="ds">' + c.ds + '</div></div>'; }).join('');
    shell('第 2 步：要把这份内容导入到哪个题库？', function () {
      return '<div class="imp-tg">' + on + '</div>' +
        '<div id="impPreviewBox"></div>' +
        '<div class="imp-acts" style="padding:0;border:none;justify-content:flex-start;margin-top:12px">' +
        '<button class="btn btn-outline" onclick="__impBackFile()">← 换文件</button>' +
        '<button class="btn btn-primary" id="impDo" onclick="__impDo()">导入</button></div>';
    });
  }
  function showPreview() {
    var key = S.target;
    var parsed = [];
    if (key === 'cet') parsed = parseCet(S.text);
    else if (key === 'exam') parsed = parseExam(S.text);
    else parsed = parseTextCards(S.text);
    S.parsed = parsed;
    var box = document.getElementById('impPreviewBox');
    var first = parsed.slice(0, 6).map(function (it) {
      var head = key === 'exam' ? it.q : (key === 'cet' ? (it.word + ' ' + it.meaning).slice(0, 60) : (it.question || it.text || '').slice(0, 60));
      return esc(head);
    }).join('\n');
    box.innerHTML = '<div style="font-weight:700;color:var(--text);margin:4px 0 6px">预览（识别 ' + parsed.length + ' 条，前几条）</div>' +
      '<div class="imp-pv">' + (first || '未能识别出内容。\n\n请检查：\n1. 文档是否有实际文字内容（不是纯图片/扫描件）\n2. 四级词汇：每行一个单词（可加音标/释义）\n3. 行测题：题干 + A/B/C/D 选项 + 答案 + 解析，每题之间空一行\n4. 面试题：每行一个问题') + '</div>';
    var doBtn = document.getElementById('impDo');
    if (doBtn) { doBtn.style.display = parsed.length ? '' : 'none'; }
  }

  window.__impPick = async function (ev) {
    try {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    // 文件大小检查
    if (f.size === 0) { toast('⚠️ 文件为空（0 字节），请选择有效的文档文件'); return; }
    if (f.size > 20 * 1024 * 1024) { toast('⚠️ 文件过大（超过 20MB），请选择较小的文档'); return; }
    document.getElementById('impFileName').textContent = f.name;
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    // 老格式 .doc 不支持
    if (ext === 'doc') { toast('⚠️ 不支持 .doc 老格式，请用 Word 另存为 .docx 后再导入'); return; }
    if (ext === 'ppt') { toast('⚠️ 不支持 .ppt 老格式，请用 PowerPoint 另存为 .pptx 后再导入'); return; }
    var res;
    if (ext === 'docx') { res = await readDocxText(f); if (!res.ok) { toast(res.msg); return; } S.text = res.text; }
    else if (ext === 'xlsx') { res = await readXlsxText(f); if (!res.ok) { toast(res.msg); return; } S.text = res.text; }
    else if (ext === 'pptx') { res = await readPptxText(f); if (!res.ok) { toast(res.msg); return; } S.text = res.text; }
    else if (ext === 'csv' || ext === 'txt') {
      try {
        if (typeof f.text === 'function') { S.text = await f.text(); }
        else { S.text = await new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsText(f, 'utf-8'); }); }
      } catch (e) { toast('读取文件失败：' + e.message); return; }
    }
    else { toast('暂只支持 .docx / .txt / .csv / .xlsx'); return; }
    S.rawName = f.name;
    ev.target.value = '';
    S.target = null; S.parsed = [];
    targetStep();
    } catch (e) { toast('导入向导出错：' + e.message); }
  };
  window.__impTarget = function (k) { S.target = k; S.parsed = []; targetStep(); showPreview(); };
  window.__impBackFile = function () { fileStep(); };
  window.__impDo = function () {
    if (!S.target) { toast('请先选择目标题库'); return; }
    var items = S.parsed || [];
    if (!items.length) { toast('没有可导入的内容'); return; }
    var r = __qbImportRaw(S.target, items);
    if (!r.ok) { toast(r.msg || '导入失败'); return; }
    var libName = __qbReg ? (__qbReg()[S.target] || '该题库') : '题库';
    toast('✅ 已导入 ' + r.n + ' 条到「' + libName + '」' + (r.skip ? '，跳过 ' + r.skip + ' 条重复' : '') + '。到对应题库页面点 🧠 可管理');
    closeI();
  };
  window.__impClose = closeI;
  window.__impParse = function (key, text) { return key === 'cet' ? parseCet(text) : key === 'exam' ? parseExam(text) : parseTextCards(text); };
  window.__impExtractDocx = readDocxText;

  function openImporter() {
    TARGETS = regs();
    ensureCss();
    S = { text: '', rawName: '', target: null, parsed: [] };
    var m = document.createElement('div'); m.id = 'impMask'; m.className = 'imp-mask';
    m.innerHTML = '<div class="imp-box"><div class="imp-head"><b>📥 导入题库</b><button class="imp-x" onclick="__impClose()">✕</button></div><div class="imp-body" id="impBody"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) closeI(); });
    fileStep();
  }
  window.openImporter = openImporter;
})();
