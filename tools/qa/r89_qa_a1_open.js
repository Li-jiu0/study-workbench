/* 真实流程：找好友 -> imOpenChat -> 点击 + -> 测弹窗布局 */
(function () {
  var R = { steps: [] };
  function log(s, v) { R.steps.push(s + ' = ' + JSON.stringify(v)); }

  log('imOpenChat type', typeof window.imOpenChat);
  // 找好友 id
  var ids = [];
  try {
    // 尝试从 localStorage 读取好友
    var keys = Object.keys(localStorage);
    R.lsKeys = keys.slice(0, 30);
  } catch (e) { }
  var data = null;
  try { data = JSON.parse(localStorage.getItem('xt_chat_data_v1') || localStorage.getItem('im_data_v1') || 'null'); } catch (e) { }
  R.dataFound = !!data;
  if (data && data.friends) { R.friendIds = Object.keys(data.friends).slice(0, 10); }

  // 直接尝试 DOM 里第一张会话卡
  var sess = document.querySelector('.im-sess');
  R.sessFound = !!sess;
  if (sess) {
    R.sessText = (sess.textContent || '').trim().slice(0, 40);
    sess.click();
    R.afterSessClick_convDisplay = (document.querySelector('#imConv') || {}).style ? document.querySelector('#imConv').style.display : null;
    R.afterSessClick_chatDisplay = document.querySelector('#imChat') ? getComputedStyle(document.querySelector('#imChat')).display : null;
  }

  var conv = document.querySelector('#imConv');
  R.convDisplay = conv ? getComputedStyle(conv).display : null;
  return R;
})();
