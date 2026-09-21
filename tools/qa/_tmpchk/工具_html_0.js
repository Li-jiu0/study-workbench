/* 打开导入题库全屏视图：先由 importer.js 的 openImporter() 初始化向导状态/样式/步骤 DOM，
       再把向导主体 #impBody 从弹层外壳搬进本视图并移除弹层外壳（不改动 importer.js 任何函数）。 */
    function openImporterView() {
      if (!window.openImporter) { location.href = '设置.html'; return; }
      window.openImporter();
      var mask = document.getElementById('impMask');
      var body = document.getElementById('impBody');
      var host = document.getElementById('importerView');
      if (mask && body && host) {
        var wrap = host.querySelector('.importer-view-body');
        // 清掉上一次遗留的 #impBody，避免重复 id 让向导渲染进已被替换的旧节点（表现为点了没反应）
        var olds = wrap.querySelectorAll('#impBody');
        for (var oi = 0; oi < olds.length; oi++) { if (olds[oi] !== body && olds[oi].parentNode) olds[oi].parentNode.removeChild(olds[oi]); }
        wrap.appendChild(body);
        mask.parentNode.removeChild(mask);
      }
      if (host) host.classList.add('open');
    }
    /* 关闭视图并复位向导状态（__impClose 由 importer.js 暴露，负责清空内部状态 S） */
    function closeImporterView() {
      if (typeof window.__impClose === 'function') window.__impClose();
      var host = document.getElementById('importerView');
      if (host) host.classList.remove('open');
    }
    window.openImporterView = openImporterView;
    window.closeImporterView = closeImporterView;

    /* ---------- 我的导入题库（自定义题库列表，来源 assets/importer.js 写入的 localStorage） ---------- */
    function escImp(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function impItemText(it) {
      if (!it) return '(空)';
      if (it.q) return it.q + (it.options && it.options.length ? '（' + it.options.join(' / ').slice(0, 80) + '）' : '');
      if (it.text) return it.text;
      if (it.question) return it.question;
      if (it.word) return it.word + (it.meaning ? '  ' + it.meaning : '');
      return JSON.stringify(it).slice(0, 80);
    }
    function renderImportLibs() {
      var host = document.getElementById('impLibs');
      if (!host) return;
      if (typeof window.__impBanks !== 'function') {
        host.innerHTML = '<div class="imp-libs-t">我的导入题库</div><div class="imp-empty">导入向导尚未就绪（assets/importer.js 未加载），请刷新页面重试。</div>';
        return;
      }
      var banks = window.__impBanks() || {};
      var names = Object.keys(banks);
      if (!names.length) {
        host.innerHTML = '<div class="imp-libs-t">我的导入题库</div><div class="imp-empty">还没有导入记录。导入后会自动按文件名生成自定义题库（例如「自定义·四级词汇表」），出现在这里，可展开查看、也可在导入时选它继续追加。</div>';
        return;
      }
      host.innerHTML = '<div class="imp-libs-t">我的导入题库（' + names.length + '）</div>' + names.map(function (n) {
        var b = banks[n] || {}, items = b.items || [];
        var prev = items.slice(0, 30).map(function (it, i) { return (i + 1) + '. ' + impItemText(it); }).join('\n');
        return '<div class="imp-lib" data-n="' + escImp(n) + '">' +
          '<div class="imp-lib-h" onclick="this.parentNode.classList.toggle(\'open\')">' +
          '<span class="imp-lib-n">📦 ' + escImp(n) + '</span>' +
          '<span class="imp-lib-c">' + items.length + ' 条 · ' + escImp(b.updatedAt || '') + ' ›</span>' +
          '</div>' +
          '<div class="imp-lib-items">' + escImp(prev || '（该题库暂无内容）') + (items.length > 30 ? '\n… 仅显示前 30 条' : '') + '</div>' +
          '<div style="margin-top:6px;text-align:right"><button class="imp-lib-b" onclick="removeImportLib(this)">删除该题库</button></div>' +
          '</div>';
      }).join('');
    }
    function removeImportLib(btn) {
      var box = btn && btn.parentNode ? btn.parentNode : null;
      while (box && box.className && String(box.className).indexOf('imp-lib') < 0) box = box.parentNode;
      var n = box ? box.getAttribute('data-n') : '';
      if (!n) return;
      if (typeof window.__impDelBank === 'function') window.__impDelBank(n);
      renderImportLibs();
      if (typeof window.xtToast === 'function') window.xtToast('info', '已删除自定义题库「' + n + '」');
    }
    window.removeImportLib = removeImportLib;
    window.renderImportLibs = renderImportLibs;
    /* importer.js 导入成功后回调，用于刷新本列表 */
    window.__impAfterImport = renderImportLibs;
    renderImportLibs();
    /* importer.js 带 defer，晚于本内联脚本执行：DOMContentLoaded 时再渲染一次，避免首屏显示“未就绪” */
    window.addEventListener('DOMContentLoaded', renderImportLibs);

    /* 【2026-09-15 用户反馈删除】上面的「考试倒计时」可见区块已移除，
       跟随它的专属渲染逻辑（宿主判空 + 二次渲染监听）也一并删除，避免空转。
       assets/app.js 里的首页倒计时逻辑本身未动 —— 首页「重要倒计时」仍正常工作。 */