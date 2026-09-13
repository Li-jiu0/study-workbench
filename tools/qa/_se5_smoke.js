/* SE-5 需求28 内容补全 冒烟自测：校验三个 assets 文件的结构与回复可生成 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const out = [];
function log(s) { out.push(String(s)); }
function assert(ok, name) { log((ok ? '[PASS] ' : '[FAIL] ') + name); }

// ---- 1/2. MINI_BANK 数据（mini-exam.js / mini-comm.js）----
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['assets/mini-exam.js', 'assets/mini-comm.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const BANK = sandbox.window.MINI_BANK;

const company = BANK['exam-company'];
assert(company && company.mode === 'info', 'exam-company 仍为 info 模式');
const titles = company.items.map(i => i.title);
assert(company.items.length === 8, 'exam-company 条目数=8（原5+新增3），实际=' + company.items.length);
assert(titles.some(t => t.indexOf('历年笔试形式') !== -1), '含「历年笔试形式：怎么组织」');
assert(titles.some(t => t.indexOf('常见题型结构') !== -1), '含「常见题型结构(通用)」');
assert(titles.some(t => t.indexOf('时间分配') !== -1), '含「时间分配与做题顺序」');
log('  · 企业定向库各条 body 长度：' + company.items.map(i => i.title + '=' + i.body.length).join(' | '));
assert(company.items.every(i => i.icon && i.title && i.body && i.body.length > 20), '企业定向库每条 icon/title/body 完整');

const introvert = BANK['comm-introvert'];
assert(introvert && introvert.mode === 'info', 'comm-introvert 仍为 info 模式');
const itTitles = introvert.items.map(i => i.title);
assert(introvert.items.length === 7, 'comm-introvert 条目数=7（原5+新增2），实际=' + introvert.items.length);
assert(itTitles.some(t => t.indexOf('提前准备') !== -1), '含「提前准备：开口前先写三行」');
assert(itTitles.some(t => t.indexOf('文字辅助') !== -1), '含「文字辅助：说不出就先打字」');
log('  · i人专区各条 body 长度：' + introvert.items.map(i => i.title + '=' + i.body.length).join(' | '));
assert(introvert.items.every(i => i.icon && i.title && i.body && i.body.length > 20), 'i人专区每条 icon/title/body 完整');
assert(itTitles.indexOf('承认“充电模式”') !== -1, '原有 5 条未被破坏');

// ---- 3. i-partner.js ----
const sb2 = {
  window: {},
  console,
  document: { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, getElementById: () => null },
  setTimeout,
  Math,
  JSON
};
sb2.globalThis = sb2;
vm.createContext(sb2);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/i-partner.js'), 'utf8'), sb2, { filename: 'assets/i-partner.js' });
const IP = sb2.window.IPartner;
assert(!!IP, 'IPartner 已挂载');
const partners = IP.getPartners();
assert(partners.length === 5, '5 人格数量不变，实际=' + partners.length);
assert(partners.every(p => typeof p.replyStyle === 'string' && p.replyStyle.length > 0), '每个伙伴保留 replyStyle');
assert(partners.map(p => p.id).join(',') === 'rabbit,fox,owl,cat,bear', '伙伴 id 顺序不变：' + partners.map(p => p.id).join(','));
const scenarios = IP.getScenarios();
assert(scenarios.length === 10, '场景话术库 10 条，实际=' + scenarios.length);
assert(scenarios.every(s => s.key && s.method && s.script), '每条场景含 method 与可直接照说的 script');

// 系统提示词（供真 LLM 使用）
partners.forEach(p => {
  const sp = IP.buildSystemPrompt(p);
  assert(sp.indexOf(p.name) !== -1 && sp.indexOf(p.replyStyle) !== -1, '系统提示词含人设与 replyStyle：' + p.name);
  assert(sp.indexOf('硬性约束') !== -1, '系统提示词含禁臆造约束：' + p.name);
});

// 真 LLM 接入路径：注入 window.IPartnerLLM，验证能拿到 systemPrompt/messages
let captured = null;
sb2.window.IPartnerLLM = function (payload, cb) { captured = payload; cb('【LLM测试回复】'); };
const msgs = IP.buildMessages(partners[2], [{ role: 'user', text: '我不知道怎么拒绝同事' }], '帮帮我');
assert(msgs[0].role === 'system' && msgs[msgs.length - 1].content === '帮帮我', 'buildMessages 结构正确（system+历史+user）');
assert(msgs.length === 3, 'buildMessages 条数=3（system+1历史+user），实际=' + msgs.length);

fs.writeFileSync(path.join(__dirname, '_se5_smoke.txt'), out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));
