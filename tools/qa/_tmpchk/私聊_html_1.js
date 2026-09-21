/* C1 20260913k：「加好友」「群聊」入口由弹窗改为 tab 页面视图。
   实现方式：
   1. 把 #imGroupModal / #imAddFriendModal 整体节点搬进侧栏面板宿主（DOM 位置变化、id 不变），
      chat-local.js 的弹窗函数（imOpenGroupCreator / imOpenAddFriendModal 等）原样保留并复用——
      其内部均按 id / querySelector 查找，搬家后依然命中，入口不再弹浮层；
   2. 包装 imSwitchTab：groups / addfriend 两个 tab 走面板视图（隐藏 #imList、显示面板宿主、
      复用原弹窗函数填充内容），其余 tab 走原逻辑并恢复列表；
   3. 包装关闭函数：面板内 Esc / ✕ 关闭后自动回到「会话」tab，避免侧栏挂空面板。 */
(function () {
  'use strict';

  var activePanel = null; // 当前面板 tab：null | 'groups' | 'addfriend'

  function $id(x) { return document.getElementById(x); }

  /* ============ W1-T3（2026-09-15 批次九）：联系管理员入口的 tab 归属 + 未读角标兜底 ============
     1) #acEntry 只在「好友」tab（data-tab="friends"）可见，其余 4 个 tab 收起 —— 它是 #imList
        之外的静态节点，原来的 showPanel / hidePanels / imSwitchTab 都不管它，所以 5 个 tab 全可见。
     2) 未读角标兜底：assets/admin-contact.js（R43）把管理员来信未读数渲染进 #acEntryBadge
        （位于 #acEntry 内部）。整行隐藏会连带藏掉未读提醒，故此处把 #acEntryBadge 的**内联状态**
        （style.display + textContent，admin-contact.js 每 5s 由 refreshEntryBadge() 写入）
        单向镜像到「好友」tab 标签上的 #acTabBadge —— 不改 admin-contact.js，也不额外发请求。
        读的是内联 style 而非计算样式，因此 #acEntry 被 display:none 时依然能读到真实未读状态。 */
  var AC_TAB = 'friends';
  var acTabNow = '';   // 当前 tab（由 syncAcEntry 记录，未切换过时回落到 currentTab()）

  function syncAcEntry(tab) {
    acTabNow = tab;
    var e = $id('acEntry');
    if (e) e.style.display = (tab === AC_TAB) ? '' : 'none';
  }

  function acActiveTab() { return acTabNow || currentTab(); }

  function currentTab() {
    var on = document.querySelector('.im-tab.active');
    return on ? (on.getAttribute('data-tab') || 'chats') : 'chats';
  }

  function acUnreadText() {
    var b = $id('acEntryBadge');
    if (!b) return '';
    if (b.style.display === 'none') return '';
    return String(b.textContent || '').replace(/^\s+|\s+$/g, '');
  }

  function syncAcTabBadge() {
    var tab = document.querySelector('.im-tab[data-tab="' + AC_TAB + '"]');
    if (!tab) return;
    var dot = $id('acTabBadge');
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'im-tab-badge';
      dot.id = 'acTabBadge';
    }
    if (dot.parentNode !== tab) tab.appendChild(dot);
    /* 已在「好友」tab 时 #acEntry 本身可见且自带 #acEntryBadge，镜像角标不再显示，避免同源双显 */
    var txt = (acActiveTab() === AC_TAB) ? '' : acUnreadText();
    if (txt) { dot.textContent = txt; dot.style.display = ''; }
    else { dot.textContent = ''; dot.style.display = 'none'; }
  }

  /* 1. 搬家：模态节点移入侧栏面板宿主（幂等，只搬一次）
        R56（2026-09-14）：imGroupModal 不再搬家 —— 「群聊」tab 改为承载「我的群聊」列表
        （chat-local.js renderGroupsTab），建群弹层恢复为独立的 .im-overlay 浮层，
        由列表顶部「+ 发起群聊」按钮触发 imOpenGroupCreator()。 */
  function relocateModals() {
    [['imAddFriendModal', 'imPanelAddFriend']].forEach(function (p) {
      var modal = $id(p[0]), host = $id(p[1]);
      if (modal && host && modal.parentElement !== host) host.appendChild(modal);
    });
  }

  /* 2. 面板显隐：进入面板 tab 时隐藏会话列表并复用原弹窗函数填充内容 */
  function showPanel(tab) {
    var modalId = tab === 'groups' ? 'imGroupModal' : 'imAddFriendModal';
    if (tab === 'groups' && typeof window.imOpenGroupCreator === 'function') window.imOpenGroupCreator();
    else if (tab === 'addfriend' && typeof window.imOpenAddFriendModal === 'function') window.imOpenAddFriendModal();
    var modal = $id(modalId);
    if (!modal || modal.style.display === 'none') {
      // 原函数因未登录等条件只 toast 未开面板 → 回退会话 tab，侧栏不留空白
      window.imSwitchTab('chats');
      return;
    }
    var list = $id('imList');
    if (list) list.style.display = 'none';
    ['imPanelGroups', 'imPanelAddFriend'].forEach(function (hid) {
      var h = $id(hid);
      if (h) h.classList.toggle('active', hid === (tab === 'groups' ? 'imPanelGroups' : 'imPanelAddFriend'));
    });
    activePanel = tab;
  }

  function hidePanels() {
    var list = $id('imList');
    if (list) list.style.display = '';
    ['imPanelGroups', 'imPanelAddFriend'].forEach(function (hid) {
      var h = $id(hid);
      if (h) h.classList.remove('active');
    });
    activePanel = null;
  }

  /* 3. 包装 imSwitchTab（须在 chat-local.js 加载后执行） */
  function patchSwitchTab() {
    if (typeof window.imSwitchTab !== 'function' || window.__imSwitchTabPatched) return;
    var real = window.imSwitchTab;
    window.imSwitchTab = function (tab) {
      /* W1-T3：#acEntry 仅「好友」tab 可见（放在最前，showPanel 回退到 chats 时会再进一次本函数） */
      syncAcEntry(tab);
      syncAcTabBadge();   // 切 tab 即时刷新镜像角标，不等下一轮 1s 轮询
      /* R56（2026-09-14）：'groups' 不再是「面板 tab」——它现在承载「我的群聊」列表
         （chat-local.js renderGroupsTab 渲染到 #imList），建群弹层改为列表内按钮触发的浮层。
         只有 'addfriend' 仍走面板视图。 */
      if (tab === 'addfriend') {
        real(tab);        // 复用原逻辑：tab 高亮切换 + 列表占位渲染（渲染结果被面板覆盖）
        showPanel(tab);
        return;
      }
      hidePanels();
      real(tab);
    };
    window.__imSwitchTabPatched = true;
  }

  /* 4. 包装关闭函数：面板处于激活态时关闭后回到会话 tab */
  function patchClosers() {
    [['imCloseGroupCreator'], ['imCloseAddFriendModal']].forEach(function (p) {
      var name = p[0], fn = window[name];
      if (typeof fn !== 'function' || fn.__imPanelPatched) return;
      var wrapped = function () {
        fn();
        if (activePanel) window.imSwitchTab('chats');
      };
      wrapped.__imPanelPatched = true;
      window[name] = wrapped;
    });
  }

  function init() {
    relocateModals();
    patchSwitchTab();
    patchClosers();
    /* W1-T3 首屏状态：默认 tab 是 chats → #acEntry 收起；并启动角标镜像（1s 轮询 #acEntryBadge 内联状态） */
    syncAcEntry(currentTab());
    syncAcTabBadge();
    setInterval(syncAcTabBadge, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();