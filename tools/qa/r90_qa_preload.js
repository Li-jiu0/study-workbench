/* r90_qa_preload.js — R90 QA 独立夹具（文档创建前注入）
 * 独立性：夹具键名/数据/时间戳/账号均为 R90 自造，与 r89_qa_preload.js 不同。
 * 必要原因：file:// 下无登录态时 app.js 会把页面重定向到 登录.html，
 *           导致无法在真实页面里验证布局。故注入 auth 种子。
 */
(function () {
  try {
    window.__R90_QA_PRELOAD = true;
    function S(k, v) {
      try { window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { }
    }

    /* --- 登录态（R90 专用账号，与 R89 不同） --- */
    S('study_workbench_auth', { account: 'r90_auditor', loginAt: 1789000000000 });
    S('study_workbench_user', { nickname: 'R90审计', account: 'r90_auditor' });

    /* --- AI 对话记录（R90 自造 3 会话） --- */
    var t = 1789000000000;
    S('ai_chat_history', [
      { id: 'r90_c1', title: 'R90会话一', createdAt: t, updatedAt: t, messages: [{ role: 'user', content: 'R90甲' }, { role: 'assistant', content: 'R90乙' }] },
      { id: 'r90_c2', title: 'R90会话二', createdAt: t + 1000, updatedAt: t + 1000, messages: [{ role: 'user', content: 'R90丙' }] },
      { id: 'r90_c3', title: 'R90会话三', createdAt: t + 2000, updatedAt: t + 2000, messages: [{ role: 'user', content: 'R90丁' }] }
    ]);
    S('xt_ai_chat_meta_v1', { r90_c1: { tags: ['R90'], fav: true } });

    /* --- 私聊本地会话 --- */
    var im = {
      chats: { r90_f1: { id: 'r90_f1', nickname: 'R90联系人', avatar: 'R', last: 'R90测试', unread: 0, time: t } },
      messages: { r90_f1: [{ senderId: 'r90_f1', content: 'R90 QA 夹具消息', kind: 'text', time: t }] }
    };
    S('study_workbench_data@r90_auditor::study_im_local_data', im);
    S('study_im_local_data', im);
    S('study_workbench_ai_config', { enabled: true, nickname: 'R90学伴', avatar: 'R90' });

    /* --- 跳转拦截（let 页面内脚本可观测，避免真导航丢上下文） --- */
    window.__R90_NAV = [];
  } catch (e) { }
})();
