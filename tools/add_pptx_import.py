# -*- coding: utf-8 -*-
import io, os, re

p = r'D:\下载的文件\学习工作台\assets\importer.js'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# ===== 1. 在 zipEntry 函数后加 zipList 函数（列出 zip 内所有文件名） =====
old_zipentry_end = """    return null;
  }
  async function readDocxText(file) {"""

new_zipentry_end = """    return null;
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
  async function readDocxText(file) {"""

if old_zipentry_end in src:
    src = src.replace(old_zipentry_end, new_zipentry_end, 1)
    print('FIXED: 加 zipList 函数')
else:
    print('SKIP: zipEntry end pattern not found')

# ===== 2. 在 readDocxText 后加 readPptxText 函数 =====
old_docx_end = """    return { ok: true, text: paras.join('\\n') };
  }

  /* ---------- 分目标解析器：返回 {ok, items} ---------- */"""

new_docx_end = """    return { ok: true, text: paras.join('\\n') };
  }

  // 读取 PPT(.pptx) 所有幻灯片文字
  async function readPptxText(file) {
    var buf = await file.arrayBuffer();
    var allNames = zipList(buf);
    // 筛选幻灯片文件 ppt/slides/slideN.xml
    var slideNames = allNames.filter(function (n) {
      return /^ppt\\/slides\\/slide\\d+\\.xml$/.test(n);
    }).sort(function (a, b) {
      var na = parseInt(a.match(/slide(\\d+)/)[1], 10);
      var nb = parseInt(b.match(/slide(\\d+)/)[1], 10);
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
        slides.push('【第' + (si + 1) + '页】\\n' + texts.join('\\n'));
      }
    }
    if (!slides.length) {
      return { ok: false, msg: 'PPT 里没有提取到文字内容（可能是纯图片/扫描件，或文字在图片里无法识别）' };
    }
    return { ok: true, text: slides.join('\\n\\n') };
  }

  /* ---------- 分目标解析器：返回 {ok, items} ---------- */"""

if old_docx_end in src:
    src = src.replace(old_docx_end, new_docx_end, 1)
    print('FIXED: 加 readPptxText 函数')
else:
    print('SKIP: readDocxText end pattern not found')

# ===== 3. __impPick 里加 .pptx 处理 =====
old_pptx = """    else if (ext === 'xlsx') { res = await readXlsxText(f); if (!res.ok) { toast(res.msg); return; } S.text = res.text; }"""
new_pptx = """    else if (ext === 'xlsx') { res = await readXlsxText(f); if (!res.ok) { toast(res.msg); return; } S.text = res.text; }
    else if (ext === 'pptx') { res = await readPptxText(f); if (!res.ok) { toast(res.msg); return; } S.text = res.text; }"""
if old_pptx in src:
    src = src.replace(old_pptx, new_pptx, 1)
    print('FIXED: __impPick 加 .pptx 处理')
else:
    print('SKIP: xlsx pattern not found')

# ===== 4. 文件选择器 accept 加 .pptx =====
old_accept = """accept=\".docx,.txt,.csv,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv\""""
new_accept = """accept=\".docx,.txt,.csv,.xlsx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv\""""
if old_accept in src:
    src = src.replace(old_accept, new_accept, 1)
    print('FIXED: 文件选择器 accept 加 .pptx')
else:
    print('SKIP: accept pattern not found')

# ===== 5. 文件选择按钮旁的提示文字加 PPT =====
old_note = """支持：Word(.docx)、文本(.txt)、表格(.csv/.xlsx)。先选文件，再选导入到哪个题库。<br>内容较多时建议每个目标一个文档；普通文本段落/按行即可识别。"""
new_note = """支持：Word(.docx)、PPT(.pptx)、文本(.txt)、表格(.csv/.xlsx)。先选文件，再选导入到哪个题库。<br>PPT 会逐页提取文字（每页加【第N页】标记）；普通文本段落/按行即可识别。"""
if old_note in src:
    src = src.replace(old_note, new_note, 1)
    print('FIXED: 提示文字加 PPT')
else:
    print('SKIP: note pattern not found')

# ===== 6. 老格式检查加 .ppt =====
old_doc_check = """    if (ext === 'doc') { toast('⚠️ 不支持 .doc 老格式，请用 Word 另存为 .docx 后再导入'); return; }"""
new_doc_check = """    if (ext === 'doc') { toast('⚠️ 不支持 .doc 老格式，请用 Word 另存为 .docx 后再导入'); return; }
    if (ext === 'ppt') { toast('⚠️ 不支持 .ppt 老格式，请用 PowerPoint 另存为 .pptx 后再导入'); return; }"""
if old_doc_check in src:
    src = src.replace(old_doc_check, new_doc_check, 1)
    print('FIXED: 老格式检查加 .ppt')
else:
    print('SKIP: doc check pattern not found')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print()
print('DONE: importer.js saved')
