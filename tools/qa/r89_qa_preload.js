/* r89_qa_preload.js — 文档创建前注入 localStorage 夹具
 * 关键：file:// 下 localStorage 可用；必须种 study_workbench_auth 否则 app.js L440 跳登录页。
 */
(function () {
  try {
    window.__QA_PRELOAD = true;
    function S(k, v) { try { window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { } }

    /* --- 登录态 --- */
    S('study_workbench_auth', { account: 'qa_r89', loginAt: 1758000000000 });
    S('study_workbench_user', { nickname: 'QA验证员', account: 'qa_r89' });

    /* --- 工线 A2：本机 AI 对话记录（3 个会话，独立于 r89a 的 2 个） --- */
    S('ai_chat_history', [
      { id: 'qa_s1', title: 'QA会话甲', updatedAt: 1758000000000, messages: [{ role: 'user', text: '甲乙丙' }, { role: 'assistant', text: '丁戊己' }] },
      { id: 'qa_s2', title: 'QA会话乙', updatedAt: 1758000100000, messages: [{ role: 'user', text: '庚辛壬' }] },
      { id: 'qa_s3', title: 'QA会话丙', updatedAt: 1758000200000, messages: [{ role: 'user', text: '癸子丑' }, { role: 'assistant', text: '寅卯辰' }] }
    ]);
    S('xt_ai_chat_meta_v1', { lastSync: 1758000200000, serverCount: 7 });

    /* --- 私聊页：本地会话数据 --- */
    var imData = {
      chats: { qa_f1: { id: 'qa_f1', nickname: 'QA测试好友', avatar: 'Q', last: '你好呀', unread: 0, time: 1758000200000 } },
      messages: { qa_f1: [{ senderId: 'qa_f1', content: '你好呀，这是一条用于 QA 验证的测试消息。', kind: 'text', time: 1758000200000 }] }
    };
    S('study_workbench_data@qa_r89::study_im_local_data', imData);
    S('study_im_local_data', imData);
    S('study_workbench_ai_config', { enabled: true, nickname: 'AI学伴', avatar: 'AI' });

    /* --- 测试缝：拦截 window.open / location 跳转，避免 CDP 导航丢上下文 --- */
    window.__QA_NAV = [];
    window.xtmNavHook = function (url) { window.__QA_NAV.push(url); return true; };  // 默认吞掉跳转
    window.xtpNavHook = function (url) { window.__QA_NAV.push(url); return true; };
  } catch (e) { }
})();
