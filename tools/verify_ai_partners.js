// 验证 app.js AI 伙伴功能集成点
const fs = require('fs');
const src = fs.readFileSync('D:/下载的文件/学习工作台/assets/app.js', 'utf-8');
const checks = {
  'AI_PARTNERS array': src.includes('const AI_PARTNERS = ['),
  'xiaotu role': src.includes("'id': 'xiaotu'"),
  'coach role': src.includes("'id': 'coach'"),
  'mentor role': src.includes("'id': 'mentor'"),
  'interviewer role': src.includes("'id': 'interviewer'"),
  'buddy role': src.includes("'id': 'buddy'"),
  'getAiPartner': src.includes('function getAiPartner()'),
  'getAiChatKey': src.includes('function getAiChatKey()'),
  'switchAiHistory': src.includes('function switchAiHistory()'),
  'ensureAiPartnerUI': src.includes('function ensureAiPartnerUI()'),
  'ensureAiPartnerUI called': src.includes('ensureAiPartnerUI();'),
  'systemPrompt injection': src.includes('content: getAiPartner().systemPrompt'),
  'renderAiPartnerList': src.includes('function renderAiPartnerList()'),
  'openAiPartnerPicker': src.includes('function openAiPartnerPicker()'),
  'selectAiPartner': src.includes('function selectAiPartner()'),
  'localAiReply demoStyle': src.includes('p.demoStyle && typeof p.demoStyle'),
  'getAiChatKey in pushAiMsg': src.includes('localStorage.setItem(getAiChatKey(),'),
  'legacy import': src.includes("'study_workbench_ai_chat'"),
  'partner emoji in renderAiMessages': src.includes('getAiPartner().emoji'),
  'no old greeting': !src.includes('你好呀👋 我是你的AI学习助手')
};
let pass = 0, fail = 0;
for (const [k, v] of Object.entries(checks)) {
  console.log((v ? 'PASS' : 'FAIL') + '  ' + k);
  v ? pass++ : fail++;
}
console.log('---');
console.log('PASS:', pass, 'FAIL:', fail);
process.exit(fail > 0 ? 1 : 0);
