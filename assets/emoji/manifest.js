/* =====================================================================
   manifest.js —— 星途表情清单（P0-2 增量 2026-09-11）
   ---------------------------------------------------------------------
   方案：[emoji:xx] 文本语法 + Unicode 表情字符渲染（系统字体，零资源文件，
   file:// 离线可用，后端零改动）。消息仍为 kind=text，全链路一致。

   用法：
     发送侧：把选中的表情编码为 "[emoji:e001]" 拼进文本；
     渲染侧：chat-local.js 的 renderContent() 先 esc 再把 [emoji:xx]
             替换为 STUDY_EMOJI.map[code].char（防 XSS：先转义后替换）。

   【后续扩展点】若未来接入 PNG 表情资源，把 char 换成 file 字段
   并让 renderContent() 输出 <img class="chat-emoji"> 即可。
   ===================================================================== */
(function () {
  'use strict';
  var LIST = [
    { code: 'e001', char: '😊', name: '微笑' },
    { code: 'e002', char: '😂', name: '破涕为笑' },
    { code: 'e003', char: '🥰', name: '喜欢' },
    { code: 'e004', char: '😎', name: '得意' },
    { code: 'e005', char: '😭', name: '大哭' },
    { code: 'e006', char: '🤔', name: '思考' },
    { code: 'e007', char: '😤', name: '奋斗' },
    { code: 'e008', char: '😴', name: '困了' },
    { code: 'e009', char: '👍', name: '点赞' },
    { code: 'e010', char: '💪', name: '加油' },
    { code: 'e011', char: '🔥', name: '打卡' },
    { code: 'e012', char: '📚', name: '学习' },
    { code: 'e013', char: '✍️', name: '刷题' },
    { code: 'e014', char: '🎯', name: '目标' },
    { code: 'e015', char: '⏰', name: '倒计时' },
    { code: 'e016', char: '🏆', name: '胜利' },
    { code: 'e017', char: '🙏', name: '感谢' },
    { code: 'e018', char: '🤝', name: '合作' },
    { code: 'e019', char: '🎉', name: '庆祝' },
    { code: 'e020', char: '❤️', name: '爱心' },
    { code: 'e021', char: '😅', name: '尴尬' },
    { code: 'e022', char: '😭', name: '累哭' },
    { code: 'e023', char: '🚀', name: '起飞' },
    { code: 'e024', char: '🌟', name: '闪耀' }
  ];
  var MAP = {};
  LIST.forEach(function (e) { MAP[e.code] = e; });
  window.STUDY_EMOJI = { list: LIST, map: MAP };
})();
