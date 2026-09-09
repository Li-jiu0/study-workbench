# -*- coding: utf-8 -*-
import io, os

p = r'D:\下载的文件\学习工作台\assets\importer.js'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# ===== 修复1: CSS var(--g2) 不存在，改成 var(--accent) =====
old_css = "background:linear-gradient(135deg,var(--primary),var(--g2))"
new_css = "background:linear-gradient(135deg,var(--primary),var(--accent))"
if old_css in src:
    src = src.replace(old_css, new_css, 1)
    print('FIXED: CSS var(--g2) -> var(--accent)')
else:
    print('SKIP: CSS var(--g2) not found')

# ===== 修复2: f.text() 兼容性，加 FileReader 兜底 =====
old_text = """    else if (ext === 'csv' || ext === 'txt') { S.text = await f.text(); }"""
new_text = """    else if (ext === 'csv' || ext === 'txt') {
      try {
        if (typeof f.text === 'function') { S.text = await f.text(); }
        else { S.text = await new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsText(f, 'utf-8'); }); }
      } catch (e) { toast('读取文件失败：' + e.message); return; }
    }"""
if old_text in src:
    src = src.replace(old_text, new_text, 1)
    print('FIXED: f.text() 加 FileReader 兜底')
else:
    print('SKIP: f.text() pattern not found')

# ===== 修复3: __impPick 整体加 try/catch，出错时提示 =====
old_pick_start = """  window.__impPick = async function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;"""
new_pick_start = """  window.__impPick = async function (ev) {
    try {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;"""
if old_pick_start in src:
    src = src.replace(old_pick_start, new_pick_start, 1)
    print('FIXED: __impPick 加 try 开始')
else:
    print('SKIP: __impPick start not found')

# 在 __impPick 结束前加 catch
old_pick_end = """    S.target = null; S.parsed = [];
    targetStep();
  };
  window.__impTarget"""
new_pick_end = """    S.target = null; S.parsed = [];
    targetStep();
    } catch (e) { toast('导入向导出错：' + e.message); }
  };
  window.__impTarget"""
if old_pick_end in src:
    src = src.replace(old_pick_end, new_pick_end, 1)
    print('FIXED: __impPick 加 catch 结束')
else:
    print('SKIP: __impPick end not found')

# ===== 修复4: 导入成功后提示更明确（告诉用户去哪里看） =====
old_toast = """    toast('✅ 已导入 ' + r.n + ' 条到' + (__qbReg ? __qbReg()[S.target] || '该题库' : '题库') + (r.skip ? '，跳过 ' + r.skip : ''));"""
new_toast = """    var libName = __qbReg ? (__qbReg()[S.target] || '该题库') : '题库';
    toast('✅ 已导入 ' + r.n + ' 条到「' + libName + '」' + (r.skip ? '，跳过 ' + r.skip + ' 条重复' : '') + '。到对应题库页面点 🧠 可管理');"""
if old_toast in src:
    src = src.replace(old_toast, new_toast, 1)
    print('FIXED: 导入成功提示更明确')
else:
    print('SKIP: 导入成功提示 not found')

# ===== 修复5: readDocxText / readXlsxText 加 DecompressionStream 不可用时的友好提示 =====
# 已经有 try/catch 和返回 {ok:false, msg}，但 msg 可能不够明确
# 在 inflateRaw 返回 null 时，zipEntry 也返回 null，然后 readDocxText 提示"无法解压"
# 这个已经 OK，不需要改

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print()
print('DONE: importer.js saved')
