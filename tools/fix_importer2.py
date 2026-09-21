# -*- coding: utf-8 -*-
import io, os

p = r'D:\下载的文件\学习工作台\assets\importer.js'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# ===== 改进1: __impPick 开头加文件大小检查 =====
old_pick_start = """  window.__impPick = async function (ev) {
    try {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    document.getElementById('impFileName').textContent = f.name;
    var ext = (f.name.split('.').pop() || '').toLowerCase();"""

new_pick_start = """  window.__impPick = async function (ev) {
    try {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    // 文件大小检查
    if (f.size === 0) { toast('⚠️ 文件为空（0 字节），请选择有效的文档文件'); return; }
    if (f.size > 20 * 1024 * 1024) { toast('⚠️ 文件过大（超过 20MB），请选择较小的文档'); return; }
    document.getElementById('impFileName').textContent = f.name;
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    // 老格式 .doc 不支持
    if (ext === 'doc') { toast('⚠️ 不支持 .doc 老格式，请用 Word 另存为 .docx 后再导入'); return; }"""

if old_pick_start in src:
    src = src.replace(old_pick_start, new_pick_start, 1)
    print('FIXED: __impPick 加文件大小和格式检查')
else:
    print('SKIP: __impPick start not found')

# ===== 改进2: readDocxText 解压失败提示更准确 =====
old_docx_fail = """    if (!entry) return { ok: false, msg: '无法解压该 docx（需要支持解压的现代浏览器，或文件已损坏）' };"""
new_docx_fail = """    if (!entry) return { ok: false, msg: '无法读取该 docx：文件可能已损坏、为空，或不是有效的 Word 文档。请用 Word 打开确认文件正常后另存为 .docx 再试。' };"""
if old_docx_fail in src:
    src = src.replace(old_docx_fail, new_docx_fail, 1)
    print('FIXED: readDocxText 失败提示更准确')
else:
    print('SKIP: readDocxText fail msg not found')

# ===== 改进3: readXlsxText 失败提示更准确 =====
old_xlsx_fail = """    if (!wb) return { ok: false, msg: '无法读取该 Excel（需现代浏览器支持解压）' };"""
new_xlsx_fail = """    if (!wb) return { ok: false, msg: '无法读取该 Excel：文件可能已损坏或不是有效的 .xlsx 文件（不支持 .xls 老格式）' };"""
if old_xlsx_fail in src:
    src = src.replace(old_xlsx_fail, new_xlsx_fail, 1)
    print('FIXED: readXlsxText 失败提示更准确')
else:
    print('SKIP: readXlsxText fail msg not found')

# ===== 改进4: 解析后如果识别 0 条，给更友好的提示 =====
old_preview_empty = """      '<div class="imp-pv">' + (first || '未能识别出内容，请检查文档格式') + '</div>';"""
new_preview_empty = """      '<div class="imp-pv">' + (first || '未能识别出内容。\\n\\n请检查：\\n1. 文档是否有实际文字内容（不是纯图片/扫描件）\\n2. 四级词汇：每行一个单词（可加音标/释义）\\n3. 行测题：题干 + A/B/C/D 选项 + 答案 + 解析，每题之间空一行\\n4. 面试题：每行一个问题') + '</div>';"""
if old_preview_empty in src:
    src = src.replace(old_preview_empty, new_preview_empty, 1)
    print('FIXED: 预览为空时提示更详细')
else:
    print('SKIP: preview empty msg not found')

# ===== 改进5: accept 属性加上 .doc 提示（虽然不支持但让用户知道） =====
old_accept = """accept=\".docx,.txt,.csv,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv\""""
# 这个已经 OK，不需要改
print('SKIP: accept 属性已 OK')

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print()
print('DONE: importer.js saved')
