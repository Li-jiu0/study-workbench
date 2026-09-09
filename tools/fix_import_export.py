# -*- coding: utf-8 -*-
import io, re, os

p = r'D:\下载的文件\学习工作台\assets\app.js'
with io.open(p, encoding='utf-8') as f:
    src = f.read()

# ===== 1. 替换 exportData 函数 =====
old_export = """// ========== 数据导出 / 导入 / 清空 ==========
/**
 * 导出：把 appData 序列化为 JSON 文件下载到本地（文件名带日期）
 */
function exportData() {
  try {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    a.href = url;
    a.download = '学习工作台-数据备份-' + dateStr + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📤 数据已导出为 JSON 文件');
  } catch (e) {
    showToast('导出失败：' + e.message);
  }
}"""

new_export = """// ========== 数据导出 / 导入 / 清空 ==========
/**
 * 导出：把全部 localStorage 序列化为 JSON 文件
 * - APK 环境：通过 AndroidBridge.saveFile 保存到应用下载目录（WebView 不接管 blob 下载）
 * - 浏览器环境：用 blob + a.click() 下载
 */
function exportData() {
  try {
    // 导出全部 localStorage（不只是 appData，还包括 AI配置/聊天历史/私信/设置等）
    var allData = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      var raw = localStorage.getItem(key);
      try { allData[key] = JSON.parse(raw); } catch (e) { allData[key] = raw; }
    }
    var exportObj = {
      version: '1.0',
      app: '学习工作台',
      exportedAt: new Date().toISOString(),
      data: allData
    };
    var dataStr = JSON.stringify(exportObj, null, 2);
    var now = new Date();
    var dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var filename = '学习工作台-数据备份-' + dateStr + '.json';

    // APK 环境：原生桥保存文件
    if (window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function') {
      window.AndroidBridge.saveFile(filename, dataStr, 'application/json');
      showToast('📤 已导出到下载目录：' + filename);
      return;
    }

    // 浏览器环境：blob 下载
    var blob = new Blob([dataStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📤 数据已导出为 JSON 文件');
  } catch (e) {
    showToast('导出失败：' + e.message);
  }
}"""

if old_export in src:
    src = src.replace(old_export, new_export, 1)
    print('OK: exportData replaced')
else:
    print('FAIL: exportData old string not found')
    # 尝试找函数位置
    idx = src.find('function exportData()')
    print('  exportData at index:', idx)
    if idx > 0:
        print('  context:', src[idx:idx+200].replace('\n', ' '))

# ===== 2. 替换 importData 函数 =====
old_import = """/**
 * 导入：读取用户选择的 JSON 备份文件并覆盖当前数据
 * @param {Event} event - 文件选择框的 change 事件
 */
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      // 简单校验：备份文件应包含这些核心字段，防止误导入无关 JSON
      if (!imported.hasOwnProperty('tasks') || !imported.hasOwnProperty('stats')) {
        showToast('⚠️ 文件格式不对，请选择本页面导出的备份文件');
        return;
      }
      appData = imported;
      saveData();
      showToast('📥 导入成功，页面即将刷新生效');
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      showToast('导入失败：' + err.message);
    }
  };
  reader.readAsText(file, 'utf-8');
  // 清空文件选择框，便于下次选择同一文件也能触发 change
  event.target.value = '';
}"""

new_import = """/**
 * 导入：读取 JSON 备份文件并恢复数据
 * 支持两种格式：
 * - 新格式 {version, app, data: {key: value, ...}}：恢复全部 localStorage
 * - 旧格式（直接是 appData 对象）：只恢复 appData（合并，不丢失新字段）
 * @param {Event} event - 文件选择框的 change 事件
 */
function importData(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var imported = JSON.parse(e.target.result);

      // 新格式：恢复全部 localStorage
      if (imported && imported.data && typeof imported.data === 'object') {
        var count = 0;
        var keys = Object.keys(imported.data);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var v = imported.data[k];
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
          count++;
        }
        showToast('📥 导入成功，已恢复 ' + count + ' 项数据，页面即将刷新');
        setTimeout(function() { location.reload(); }, 1200);
        return;
      }

      // 旧格式：只恢复 appData（合并，保留新版本新增字段）
      if (imported && imported.hasOwnProperty && (imported.hasOwnProperty('tasks') || imported.hasOwnProperty('stats'))) {
        appData = Object.assign({}, appData, imported);
        saveData();
        showToast('📥 导入成功（旧格式），页面即将刷新');
        setTimeout(function() { location.reload(); }, 1200);
        return;
      }

      showToast('⚠️ 文件格式不对，请选择本应用导出的备份文件');
    } catch (err) {
      showToast('导入失败：' + err.message);
    }
  };
  reader.readAsText(file, 'utf-8');
  // 清空文件选择框，便于下次选择同一文件也能触发 change
  event.target.value = '';
}"""

if old_import in src:
    src = src.replace(old_import, new_import, 1)
    print('OK: importData replaced')
else:
    print('FAIL: importData old string not found')
    idx = src.find('function importData(event)')
    print('  importData at index:', idx)
    if idx > 0:
        print('  context:', src[idx:idx+300].replace('\n', ' '))

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print('DONE: app.js saved')
