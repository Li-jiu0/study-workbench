// ===================================================================
// E 线独立证伪回归（需求28 内容补全，commit c239d61）
// 文件：assets/mini-exam.js / assets/i-partner.js / assets/mini-comm.js
//        + 高情商表达.html（随 f803f4f 的 i人沟通专区镜像）
// 关键回归：未定义 window.IPartnerLLM 时，本地模板回复链路不得被破坏
//          （jsdom 驱动 send()，实测每条回复内容 + 场景离线可用 + LLM 注入/空回退）
// 输出写入 tools/qa/_e_req28_regression.txt
// ===================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/下载的文件/学习工作台';
const results = [];
function rec(ok, name, extra) { results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? (' :: ' + extra) : '')); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function syntaxOK(rel) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' }); return true; }
  catch (e) { return false; }
}

// ================= Part 1：node --check =================
['assets/mini-exam.js', 'assets/i-partner.js', 'assets/mini-comm.js'].forEach(function (f) {
  rec(syntaxOK(f), 'E1_syntax_ok ' + f);
});

// ================= Part 2：MINI_BANK 结构（mini-exam / mini-comm） =================
const sb = { window: {}, console: console };
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(read('assets/mini-exam.js'), sb, { filename: 'mini-exam.js' });
vm.runInContext(read('assets/mini-comm.js'), sb, { filename: 'mini-comm.js' });
const BANK = sb.window.MINI_BANK;

const comp = BANK['exam-company'];
const compTitles = (comp && comp.items || []).map(function (i) { return i.title; });
rec(!!(comp && comp.mode === 'info'), 'E5a_exam_company_mode_info');
rec(comp.items.length === 8, 'E5b_exam_company_items_8', '实际=' + comp.items.length);
rec(compTitles.some(function (t) { return t.indexOf('历年笔试形式') >= 0; }), 'E5c_new_历年笔试形式');
rec(compTitles.some(function (t) { return t.indexOf('常见题型结构') >= 0; }), 'E5d_new_常见题型结构');
rec(compTitles.some(function (t) { return t.indexOf('时间分配') >= 0; }), 'E5e_new_时间分配');
rec(comp.items.every(function (i) { return i.icon && i.title && i.body && i.body.length > 20; }), 'E5f_exam_company_items_complete');
// 原有 5 条未丢
const compOrig5 = ['国家电网', '中石油', '建筑央企', '金融类国企', '通用备查清单'];
rec(compOrig5.every(function (k) { return compTitles.some(function (t) { return t.indexOf(k) >= 0; }); }),
  'E5g_exam_company_original5_preserved');

const intro = BANK['comm-introvert'];
const introTitles = (intro && intro.items || []).map(function (i) { return i.title; });
rec(!!(intro && intro.mode === 'info'), 'E5h_comm_introvert_mode_info');
rec(intro.items.length === 7, 'E5i_comm_introvert_items_7', '实际=' + intro.items.length);
rec(introTitles.some(function (t) { return t.indexOf('提前准备') >= 0; }), 'E5j_new_提前准备');
rec(introTitles.some(function (t) { return t.indexOf('文字辅助') >= 0; }), 'E5k_new_文字辅助');
rec(intro.items.every(function (i) { return i.icon && i.title && i.body && i.body.length > 20; }), 'E5l_comm_introvert_items_complete');
const introOrig5 = ['充电模式', '一对一的优势', '小步骤热身', '转卖点', '电量管家'];
rec(introOrig5.every(function (k) { return introTitles.some(function (t) { return t.indexOf(k) >= 0; }); }),
  'E5m_comm_introvert_original5_preserved');

// ================= Part 3：i-partner 结构 + 关键回归（jsdom 驱动） =================
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>',
  { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;
try { w.eval(read('assets/i-partner.js')); }
catch (e) { rec(false, 'E2_eval_i-partner', e.name + ' :: ' + e.message); }

const IP = w.IPartner;
rec(!!IP, 'E2a_IPartner_exported');
const partners = IP.getPartners();
rec(partners.length === 5, 'E2b_partners_5', '实际=' + partners.length);
const ids = partners.map(function (p) { return p.id; }).join(',');
rec(ids === 'rabbit,fox,owl,cat,bear', 'E2c_partner_id_order', ids);
rec(partners.every(function (p) { return typeof p.replyStyle === 'string' && p.replyStyle.length > 0; }), 'E2d_replyStyle_kept');
rec(partners.every(function (p) { return typeof p.coachFocus === 'string' && p.coachFocus.length > 0; }), 'E2e_coachFocus_added');

const scenarios = IP.getScenarios();
rec(scenarios.length === 10, 'E4a_scenarios_10', '实际=' + scenarios.length);
rec(scenarios.every(function (s) { return s.key && s.method && s.script; }), 'E4b_scenario_method_script_complete');

partners.forEach(function (p) {
  var sp = IP.buildSystemPrompt(p);
  rec(sp.indexOf(p.name) >= 0 && sp.indexOf(p.replyStyle) >= 0 && sp.indexOf('硬性约束') >= 0,
    'E2f_systemPrompt_' + p.id);
});
const msgs = IP.buildMessages(partners[0], [{ role: 'user', text: '历史一' }], '当前问题');
rec(msgs[0].role === 'system' && msgs[msgs.length - 1].content === '当前问题' && msgs.length === 3,
  'E2g_buildMessages_structure', 'len=' + msgs.length);

// ---------- 关键回归：未定义 IPartnerLLM 时本地模板回复链路 ----------
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function currentChatHtml() {
  var el = w.document.getElementById('ipContent');
  return el ? el.innerHTML : '';
}
function drive(msg) {
  var input = w.document.getElementById('ipChatInput');
  if (!input) { return Promise.reject(new Error('#ipChatInput missing')); }
  input.value = msg;
  w.IPartner.send();
  return sleep(1700).then(currentChatHtml);
}

(async function () {
  IP.open();
  IP.select('rabbit');

  var cases = [
    ['你好', '你好呀', 'greeting'],
    ['谢谢', '不用谢啦', 'thanks'],
    ['再见', '再见啦', 'bye'],
    ['我有点紧张', '别紧张呀', 'encourage'],
    ['随便聊聊', '我在听', 'default'],
    ['我不知道怎么拒绝同事', '你可以直接这样说', 'scenario_offline']
  ];
  for (var i = 0; i < cases.length; i++) {
    var html = await drive(cases[i][0]);
    rec(html.indexOf(cases[i][1]) >= 0, 'E3_noLLM_' + cases[i][2], 'expect="' + cases[i][1] + '"');
  }
  // 场景离线回复应带伙伴口吻（rabbit lead）
  var scHtml = await drive('帮我想想怎么委婉拒绝');
  rec(scHtml.indexOf('这种事确实会有点为难') >= 0, 'E3_scenario_partner_flavor');

  // 注入 LLM：应走 LLM
  var captured = null;
  w.IPartnerLLM = function (payload, cb) { captured = payload; cb('【LLM测试回复】'); };
  var llmHtml = await drive('再帮我练一句');
  rec(llmHtml.indexOf('【LLM测试回复】') >= 0, 'E3b_LLM_reply_used_when_injected');
  rec(!!(captured && captured.systemPrompt && Array.isArray(captured.messages)), 'E3c_LLM_payload_shape');

  // LLM 返回空 → 回退本地模板
  w.IPartnerLLM = function (payload, cb) { cb(''); };
  var fbHtml = await drive('谢谢');
  rec(fbHtml.indexOf('不用谢啦') >= 0, 'E3d_empty_LLM_falls_back_to_local');

  // ================= Part 4：内容红线（仅新增内容） =================
  var newTexts = [];
  comp.items.slice(5).forEach(function (i) { newTexts.push(i.title + ' ' + i.body); });
  intro.items.slice(5).forEach(function (i) { newTexts.push(i.title + ' ' + i.body); });
  scenarios.forEach(function (s) { newTexts.push(s.key + ' ' + s.method + ' ' + s.script); });
  partners.forEach(function (p) { newTexts.push(p.coachFocus || ''); });
  var blob = newTexts.join('\n');

  var companyRe = /(国家电网|中石油|中国石油|中石化|中国石化|中铁|中建|中国铁建|华为|腾讯|阿里|字节|百度|京东|美团|工商银行|农业银行|建设银行|中国银行|招商银行|国家能源|南方电网|中国移动|中国电信|中国联通|烟草|中核|中广核)/g;
  var yearRe = /((?:19|20)\d{2})\s*年/g;
  var finalRe = /(必考|一定考|每次考|历年真题|真题原题|考试原题|固定题型|必然考|据真题)/g;
  var compHit = blob.match(companyRe);
  var yearHit = blob.match(yearRe);
  var finalHit = blob.match(finalRe);
  rec(!compHit, 'E6a_no_specific_company_in_new_content', compHit ? compHit.join(',') : '无');
  rec(!yearHit, 'E6b_no_specific_year_in_new_content', yearHit ? yearHit.join(',') : '无');
  rec(!finalHit, 'E6c_no_realexam_assertion_in_new_content', finalHit ? finalHit.join(',') : '无');

  // ================= Part 5：高情商表达.html 镜像 =================
  var gq = read('高情商表达.html');
  var gqTitles = [];
  var m, tRe = /class="gq-mindset-t">([^<]+)<\/div>/g;
  while ((m = tRe.exec(gq)) !== null) { gqTitles.push(m[1]); }
  rec(gqTitles.length === 7, 'P5a_gq_cards_total_7', '实际=' + gqTitles.length);
  var gqOrig5 = ['充电模式', '一对一的优势', '小步骤热身', '转卖点', '电量管家'];
  rec(gqOrig5.every(function (k) { return gqTitles.some(function (t) { return t.indexOf(k) >= 0; }); }),
    'P5b_gq_original5_preserved');
  rec(gqTitles.some(function (t) { return t.indexOf('提前准备') >= 0; }) && gqTitles.some(function (t) { return t.indexOf('文字辅助') >= 0; }),
    'P5c_gq_two_new_cards_present');
  rec(gq.indexOf('共7条') >= 0, 'P5d_gq_subtitle_says_7');

  // ---------- 输出报告 ----------
  var pass = results.filter(function (r) { return r.indexOf('PASS') === 0; }).length;
  var fail = results.filter(function (r) { return r.indexOf('FAIL') === 0; }).length;
  var lines = [];
  lines.push('===== E 线独立证伪回归：需求28 内容补全（commit c239d61 + 镜像 f803f4f）=====');
  lines.push('运行时间: ' + new Date().toISOString());
  lines.push('');
  lines.push('--- 证伪结果 ---');
  lines.push(results.join('\n'));
  lines.push('');
  lines.push('--- 汇总 ---');
  lines.push('PASS=' + pass + '  FAIL=' + fail);
  lines.push(fail === 0 ? 'RESULT: PASS —— E 线 6 项证伪点 + 镜像项全部通过' : 'RESULT: FAIL —— 见上方 FAIL 明细');
  var out = lines.join('\n');
  fs.writeFileSync(path.join(ROOT, 'tools/qa/_e_req28_regression.txt'), out + '\n');
  console.log(out);
  process.exit(0);
})();
