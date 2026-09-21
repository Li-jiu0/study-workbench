/* R55（2026-09-14）：帖子分享「接收侧」—— 读 study_workbench_share_forward_v1 渲染转发卡片。
   数据由广场帖子分享（线4）写入 localStorage；本页只在打开时读一次并渲染预览。
   发送时由 chat-local.js 的 imSendText 调 window.__imConsumeForward() 取出深链拼到正文；
   取消即移除。键缺失 / JSON 非法 / id 为空 → 不渲染、不抛错（零侵入）。
   2026-09-14 修：兼容发送侧的 excerpt 摘要字段与字符串 id（原 Number(id) 会把 'n_001' 判为无效）。 */
(function () {
  'use strict';
  var KEY = 'study_workbench_share_forward_v1';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 发送侧（学习博客.html R55）实际写入契约（只读核对，不改发送侧）：
       {v:1, type:'note', id:String, title:String, excerpt:String, cover:String, url:'…#note=<id>', ts:Number}
     两条兼容要点（2026-09-14 修）：
       1) 摘要字段是 **excerpt**，不是 summary → 两者都兼容（优先 summary，兼容历史/他处写法）；
       2) id 可能是字符串（本地笔记形如 'n_001'）或数字串（在线）→ **只校验非空**，不做 Number 强转，
          否则字符串 id 会被 Number() 变成 NaN 判为无效，卡片直接不渲染。 */
  function parsePayload() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return null;
      var rawId = (p.id != null && p.id !== '') ? p.id : (p.noteId != null ? p.noteId : '');
      var id = String(rawId == null ? '' : rawId).trim();
      if (!id) return null;
      var url = (typeof p.url === 'string' && p.url) ? p.url.trim() : '';
      return {
        id: id,
        url: url,
        title: String(p.title || p.name || '帖子').slice(0, 60),
        summary: String(p.summary || p.excerpt || '').slice(0, 80)
      };
    } catch (e) { return null; }
  }
  function render() {
    var host = document.getElementById('imForwardCard');
    if (!host) return;
    var p = parsePayload();
    if (!p) { host.style.display = 'none'; host.innerHTML = ''; return; }
    host.innerHTML =
      '<div class="im-forward-tag">🔗 转发自帖子</div>' +
      '<div class="im-forward-body"><div style="flex:1;min-width:0">' +
        '<div class="im-forward-title">' + esc(p.title) + '</div>' +
        (p.summary ? '<div class="im-forward-sum">' + esc(p.summary) + '</div>' : '') +
      '</div><div class="im-forward-cancel" onclick="window.__imClearForwardCard()">取消</div></div>';
    host.style.display = 'block';
  }
  window.__imClearForwardCard = function () {
    try { localStorage.removeItem(KEY); } catch (e) { }
    var host = document.getElementById('imForwardCard');
    if (host) { host.style.display = 'none'; host.innerHTML = ''; }
  };
  window.__imConsumeForward = function () {
    var p = parsePayload();
    if (!p) return '';
    window.__imClearForwardCard();
    // 优先用发送侧已拼好的深链 url（自带 #note=<id>）；只有 id 的旧数据再自行拼，不再重新拼 url
    return p.url || ('#note=' + p.id);
  };
  window.__imRenderForwardCard = render;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();