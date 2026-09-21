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

   R5（2026-09-20）：扩容至 96 个常用表情（笑脸/情绪/手势/爱心/动物分组）。
   e001-e024 的 code 与 char 一字未改（历史消息靠它渲染），仅在尾部【追加】新条目。
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
    { code: 'e024', char: '🌟', name: '闪耀' },
    { code: 'e025', char: '😀', name: '呲牙' },
    { code: 'e026', char: '😃', name: '开心' },
    { code: 'e027', char: '😄', name: '大笑' },
    { code: 'e028', char: '😁', name: '露齿' },
    { code: 'e029', char: '😆', name: '嘻嘻' },
    { code: 'e030', char: '😉', name: '眨眼' },
    { code: 'e031', char: '😋', name: '馋' },
    { code: 'e032', char: '😛', name: '吐舌' },
    { code: 'e033', char: '😍', name: '花痴' },
    { code: 'e034', char: '🤩', name: '星星眼' },
    { code: 'e035', char: '😘', name: '飞吻' },
    { code: 'e036', char: '😗', name: '亲亲' },
    { code: 'e037', char: '😚', name: '么么' },
    { code: 'e038', char: '🙂', name: '微笑脸' },
    { code: 'e039', char: '🙃', name: '倒脸' },
    { code: 'e040', char: '🤔', name: '思索' },
    { code: 'e041', char: '🤨', name: '挑眉' },
    { code: 'e042', char: '😐', name: '无语' },
    { code: 'e043', char: '😑', name: '面无表情' },
    { code: 'e044', char: '😶', name: '沉默' },
    { code: 'e045', char: '😮', name: '吃惊' },
    { code: 'e046', char: '😯', name: '愣住' },
    { code: 'e047', char: '😲', name: '震惊' },
    { code: 'e048', char: '😳', name: '脸红' },
    { code: 'e049', char: '🥺', name: '委屈' },
    { code: 'e050', char: '😢', name: '流泪' },
    { code: 'e051', char: '😞', name: '失望' },
    { code: 'e052', char: '😓', name: '汗' },
    { code: 'e053', char: '😔', name: '难过' },
    { code: 'e054', char: '😪', name: '困倦' },
    { code: 'e055', char: '🤤', name: '流口水' },
    { code: 'e056', char: '😬', name: '咧嘴' },
    { code: 'e057', char: '🤑', name: '财迷' },
    { code: 'e058', char: '🤗', name: '抱抱' },
    { code: 'e059', char: '🤭', name: '捂嘴' },
    { code: 'e060', char: '🤫', name: '噤声' },
    { code: 'e061', char: '🤬', name: '爆粗' },
    { code: 'e062', char: '😱', name: '尖叫' },
    { code: 'e063', char: '👌', name: 'OK' },
    { code: 'e064', char: '👏', name: '鼓掌' },
    { code: 'e065', char: '🙌', name: '举手' },
    { code: 'e066', char: '👐', name: '摊手' },
    { code: 'e067', char: '🤞', name: '比心' },
    { code: 'e068', char: '👋', name: '挥手' },
    { code: 'e069', char: '👊', name: '加油拳' },
    { code: 'e070', char: '✌️', name: '胜利手势' },
    { code: 'e071', char: '🖕', name: '失望手势' },
    { code: 'e072', char: '🤘', name: '摇滚' },
    { code: 'e073', char: '👀', name: '眼睛' },
    { code: 'e074', char: '👅', name: '舌头' },
    { code: 'e075', char: '👄', name: '嘴' },
    { code: 'e076', char: '👂', name: '耳朵' },
    { code: 'e077', char: '👃', name: '鼻子' },
    { code: 'e078', char: '🧠', name: '大脑' },
    { code: 'e079', char: '💡', name: '灵感' },
    { code: 'e080', char: '🦾', name: '肌肉手臂' },
    { code: 'e081', char: '💕', name: '两颗心' },
    { code: 'e082', char: '💖', name: '心动' },
    { code: 'e083', char: '💗', name: '满满的心' },
    { code: 'e084', char: '💛', name: '黄心' },
    { code: 'e085', char: '💚', name: '绿心' },
    { code: 'e086', char: '💙', name: '蓝心' },
    { code: 'e087', char: '💜', name: '紫心' },
    { code: 'e088', char: '💔', name: '心碎' },
    { code: 'e089', char: '⭐', name: '星星' },
    { code: 'e090', char: '✨', name: '闪亮' },
    { code: 'e091', char: '🐶', name: '小狗' },
    { code: 'e092', char: '🐱', name: '小猫' },
    { code: 'e093', char: '🐭', name: '老鼠' },
    { code: 'e094', char: '🐰', name: '兔子' },
    { code: 'e095', char: '🐼', name: '熊猫' },
    { code: 'e096', char: '🦊', name: '狐狸' }
  ];
  var MAP = {};
  LIST.forEach(function (e) { MAP[e.code] = e; });
  window.STUDY_EMOJI = { list: LIST, map: MAP };
})();
