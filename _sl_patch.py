# -*- coding: utf-8 -*-
# L10 C12 申论批改：给 申论刷题.html 接 AI 底座（window.callAI）
import io

P = r'D:\下载的文件\学习工作台\申论刷题.html'
src = io.open(P, 'r', encoding='utf-8', newline='').read()
src = src.replace('\r\n', '\n')

def ins(anchor, block, name):
    global src
    n = src.count(anchor)
    if n != 1:
        raise SystemExit('ANCHOR FAIL [%s] count=%d' % (name, n))
    src = src.replace(anchor, block + anchor, 1)
    print('OK  ' + name)

# ---------------- 1) CSS ----------------
CSS_ANCHOR = ".sl-inline { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }\n@media (max-width: 900px) {"
CSS_BLOCK = """.sl-aibox { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg); }
.sl-ai-tip { font-size: 13px; color: var(--text-secondary); line-height: 1.7; margin-bottom: 10px; }
.sl-ai-out { margin-top: 12px; border-top: 1px dashed var(--border); padding-top: 10px; font-size: 14px; line-height: 1.8; color: var(--text); max-height: 460px; overflow-y: auto; word-break: break-word; }
.sl-ai-out:empty { display: none; }
.sl-ai-h { font-size: 15px; font-weight: 700; color: var(--text); margin: 12px 0 6px; }
.sl-ai-p { margin: 4px 0; }
.sl-ai-ul, .sl-ai-ol { margin: 4px 0 8px; padding-left: 22px; }
.sl-ai-ul li, .sl-ai-ol li { margin: 3px 0; }
.sl-ai-hr { height: 1px; background: var(--border); margin: 12px 0; }
.sl-ai-badge { display: inline-block; font-size: 12px; padding: 2px 9px; border-radius: 20px; margin-bottom: 8px; }
.sl-ai-badge.ok { background: var(--primary-light); color: var(--primary); }
.sl-ai-badge.warn { background: var(--warning-light, #FFF1E0); color: var(--warning, #B26A00); }
.sl-ai-loading { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.sl-ai-dots { display: inline-flex; gap: 4px; }
.sl-ai-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--primary); opacity: .35; animation: slAiBlink 1.2s infinite; }
.sl-ai-dots i:nth-child(2) { animation-delay: .2s; }
.sl-ai-dots i:nth-child(3) { animation-delay: .4s; }
@keyframes slAiBlink { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
"""
ins(CSS_ANCHOR, CSS_BLOCK, 'css')

# ---------------- 2) SL 状态字段 ----------------
SL_ANCHOR = "  addForm: false, showFav: false,\n  saveTimer: null, savedTimer: null, confirmCb: null\n};"
SL_BLOCK = """  addForm: false, showFav: false,
  saveTimer: null, savedTimer: null, confirmCb: null,
  // AI 批改状态：busy=请求进行中；token=请求令牌（切题/停止/清空后旧回调作废）；out=按题缓存的批改结果
  ai: { busy: false, token: 0, out: {} }
};"""
ins(SL_ANCHOR, SL_BLOCK, 'sl-state')

# ---------------- 3) 复盘页：作答原文 / 批改模式 ----------------
RV_ANCHOR = "  var my = a.answer || '（还没有作答内容）';\n  var fav = slIsFav(q.id);"
RV_BLOCK = """  var my = a.answer || '（还没有作答内容）';
  var myRaw = a.answer || '';
  var aiMode = slAiModeOf(q);
  var aiCache = SL.ai.out[q.id] || null;
  var fav = slIsFav(q.id);"""
ins(RV_ANCHOR, RV_BLOCK, 'review-vars')

# ---------------- 4) 复盘页：AI 批改区块 ----------------
FOOT_ANCHOR = "    '<div class=\"sl-foot\">' +\n    '<button class=\"btn btn-outline btn-sm\" type=\"button\" data-act=\"prev-q\">上一题</button>' +"
AI_BLOCK = """    '<div style="padding:0 16px 8px">' +
    '<div class="sl-sub"><span class="nav-icon" data-icon="bot" data-icon-size="16"></span>AI 批改 · ' + slEsc(slAiModeName(aiMode)) + '</div>' +
    '<div class="sl-aibox">' +
    '<div class="sl-ai-tip">批改时会把「给定资料 + 作答要求 + 参考答案 + 采分关键词」一起交给 AI，按「' + slEsc(slAiModeName(aiMode)) + '」的口径逐条输出。下面的作答可以直接改，改完点「修改后重新批改」即可重批。</div>' +
    '<textarea class="sl-note" id="slAiEdit" data-act="ai-edit" style="min-height:160px" placeholder="在这里修改你的作答，改完点「修改后重新批改」">' + slEsc(myRaw) + '</textarea>' +
    '<div class="sl-inline" style="margin-top:10px">' +
    '<button class="btn btn-primary btn-sm" type="button" data-act="ai-grade" id="slAiBtn">' + (aiCache ? '修改后重新批改' : 'AI 批改') + '</button>' +
    '<button class="btn btn-outline btn-sm" type="button" data-act="ai-stop" id="slAiStopBtn" style="display:none">停止等待</button>' +
    '<button class="btn btn-outline btn-sm" type="button" data-act="ai-clear" id="slAiClearBtn">清空结果</button>' +
    '<span class="sl-count" id="slAiStatus">' + (aiCache ? slEsc(aiCache.ts + ' 已批改') : '') + '</span>' +
    '</div>' +
    '<div class="sl-ai-out" id="slAiOut">' + slAiOutHtml(q.id) + '</div>' +
    '</div>' +
    '</div>' +
"""
ins(FOOT_ANCHOR, AI_BLOCK, 'review-ai-block')

# ---------------- 5) AI 批改逻辑 ----------------
FUNC_ANCHOR = "/* ---------------- Tab2 · 阅读积累首页 ---------------- */"
FUNC_BLOCK = r"""/* ---------------- Tab1 · AI 批改（接全站 AI 底座 window.callAI） ----------------
   本页不直连任何模型、不读写 Key，统一调用 assets/ai-service.js 暴露的
   window.callAI(funcType, messages, opts)：
     · funcType = 'longtext'（ai-config.js 中该类型描述即「申论批改、面试报告」）
     · opts.max = true，打开长输出上限（maxMode.maxTokens）
     · opts.onChunk 流式回调；老 WebView 没有 ReadableStream 时底座会整段返回，
       页面统一用「AI 正在思考…」加载态 + 增量填充，两种情况下观感一致。
   只在用户点按钮时发请求，不做任何自动发问（公共 Key 限频 10 次/分钟）。
   注：给模型的 messages 固定为两条 user 消息，第二条内容极短且不含任何预设关键词，
   避免被 ai-presets 的关键词命中而直接返回预设短文（底座只匹配最后一条 user 消息）。
-------------------------------------------------------------------------------- */
var SL_AI_MAX_MAT = 6000;   // 给定资料随题上传的字符上限
var SL_AI_MAX_REF = 2500;   // 参考答案上传上限
var SL_AI_WD1 = 8000;       // 慢响应提示阈值
var SL_AI_WD2 = 75000;      // 硬看门狗：超时释放 UI，避免一直转圈

function slAiReady() { return typeof window.callAI === 'function'; }

/* 批改模式：大作文 / 公文题 / 普通小题 */
function slAiModeOf(q) {
  var t = String((q && q.type) || '') + '|' + String((q && q.subType) || '');
  var req = String((q && q.requirement) || '');
  var wl = Number(q && q.wordLimit) || 0;
  if (t.indexOf('作文') >= 0 || t.indexOf('论述') >= 0 || t.indexOf('文章') >= 0) return 'essay';
  if (req.indexOf('写一篇') >= 0 || req.indexOf('作文') >= 0 || req.indexOf('文章') >= 0) return 'essay';
  if (wl >= 800) return 'essay';
  if (t.indexOf('公文') >= 0) return 'doc';
  return 'point';
}
function slAiModeName(m) {
  if (m === 'essay') return '大作文 · 五维评分 + 逐段建议 + 范文片段';
  if (m === 'doc') return '公文题 · 采分点对照 + 格式评分';
  return '小题 · 采分点逐条对照';
}
function slAiClip(s, n) {
  var t = String(s === null || s === undefined ? '' : s);
  if (t.length <= n) return t;
  return t.slice(0, n) + '\n……（原文过长，已截取前 ' + n + ' 字）';
}
function slAiTime() {
  var d = new Date(), h = d.getHours(), m = d.getMinutes();
  return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
}

/* 本地自检：AI 不可用时也要给出有价值的反馈，绝不留白 */
function slAiLocalCheck(q, ans) {
  var n = slCount(ans);
  var lim = Number(q && q.wordLimit) || 0;
  var out = [];
  var zi = '- 字数：' + n + ' 字';
  if (lim) {
    if (n > lim) zi += '（要求不超过 ' + lim + ' 字，超出 ' + (n - lim) + ' 字，建议合并同类要点、删掉重复表述）';
    else if (n < lim * 0.6) zi += '（要求不超过 ' + lim + ' 字，目前偏少，多半还有要点没写全）';
    else zi += '（要求不超过 ' + lim + ' 字，字数合适）';
  }
  out.push(zi);
  var paras = String(ans).split(/\n+/);
  var seg = 0, i;
  for (i = 0; i < paras.length; i++) if (String(paras[i]).replace(/\s/g, '')) seg++;
  out.push('- 段落：' + seg + ' 段' + (seg <= 1 ? '（建议按要点分段/分条，阅卷更清晰）' : ''));
  var m = String(ans).match(/(^|\n)\s*\d{1,2}\s*[.、)]/g);
  out.push('- 分条：' + (m ? m.length : 0) + ' 条' + ((m && m.length >= 3) ? '（条理清晰）' : '（建议用「1. 2. 3.」分条作答）'));
  var kes = (q && q.keyExpressions) ? q.keyExpressions.slice(0, 20) : [];
  var hit = 0, miss = [], j;
  for (j = 0; j < kes.length; j++) {
    var k = String(kes[j] || '').replace(/\s/g, '');
    if (!k) continue;
    if (String(ans).replace(/\s/g, '').indexOf(k) >= 0) hit++;
    else if (miss.length < 5) miss.push(kes[j]);
  }
  if (kes.length) {
    out.push('- 采分词命中：' + hit + ' / ' + kes.length + (miss.length ? '（还没出现：' + miss.join('、') + '）' : ''));
  }
  if (/(我觉得|大概|很多|特别多|应该吧|挺好的|非常非常)/.test(ans)) {
    out.push('- 提醒：出现口语化表述，建议替换为规范表达');
  }
  if (lim && n > lim) out.push('- 提醒：超字数会被直接扣分，优先删例子和重复修饰');
  return '## 本地自检（AI 不可用时自动给出）\n' + out.join('\n') +
    '\n\n以上是按本题字数与采分词做的机械自检，只作参考；网络恢复后点「修改后重新批改」可拿到完整逐条批改。';
}

/* 组装 messages：材料随题必传 */
function slAiPrompt(q, ans, mode) {
  var kes = (q.keyExpressions || []).slice(0, 25);
  var keTxt = '', i;
  for (i = 0; i < kes.length; i++) keTxt += (i + 1) + '. ' + String(kes[i]) + '\n';
  var lim = Number(q.wordLimit) || 0;
  var scoreTxt = q.score ? (q.score + ' 分') : '未标注';
  var head =
    '你是资深申论阅卷老师，请按申论评分规则批改下面这份作答。' +
    '所有判断必须结合【给定资料】和【参考答案要点】，不要泛泛而谈，不要复述题目。\n\n' +
    '【题目信息】\n' +
    '来源：' + (q.source || '真题') + ' · ' + (q.questionNo || '题目') + '\n' +
    '题型：' + (q.type || '') + (q.subType ? ' · ' + q.subType : '') + '\n' +
    '主题：' + slTopicOf(q) + '\n' +
    '分值：' + scoreTxt + '\n' +
    '字数要求：' + (lim ? ('不超过 ' + lim + ' 字') : '未标注') + '\n\n' +
    '【给定资料 · ' + (q.materialTitle || '给定资料') + '】\n' +
    slAiClip(q.material, SL_AI_MAX_MAT) + '\n\n' +
    '【作答要求】\n' + (q.requirement || '（未标注）') + '\n\n' +
    '【参考答案要点】\n' +
    slAiClip(q.referenceAnswer || '（本题暂无参考答案，请依据给定资料与作答要求自行提炼采分点）', SL_AI_MAX_REF) + '\n\n' +
    (keTxt ? ('【规范表达 / 采分关键词】\n' + keTxt + '\n') : '') +
    '【考生作答 · ' + slCount(ans) + ' 字】\n' + ans + '\n\n';

  var tail = '';
  if (mode === 'essay') {
    var full = Number(q.score) || 40;
    var per = Math.max(1, Math.round(full / 5));
    tail =
      '【输出格式】严格按下面四部分输出，用 Markdown 标题与列表，不要加别的章节：\n' +
      '## 一、五维评分（每维满分 ' + per + ' 分）\n' +
      '1. 立意（切题、深刻）：X 分 ｜ 评语……\n' +
      '2. 结构（完整、层次）：X 分 ｜ 评语……\n' +
      '3. 论证（论据贴切、分析充分）：X 分 ｜ 评语……\n' +
      '4. 语言（规范、流畅）：X 分 ｜ 评语……\n' +
      '5. 卷面与字数：X 分 ｜ 评语……\n' +
      '- 合计：X / ' + full + ' 分，档位：一类文 / 二类文 / 三类文 / 四类文\n\n' +
      '## 二、逐段建议\n' +
      '- 第 1 段（开头 / 引论）：问题…… ｜ 改法……\n' +
      '- 第 2 段：……（按考生实际段落逐段给，必须覆盖开头、分论点段、结尾）\n\n' +
      '## 三、主要问题与提升路径\n' +
      '- ……（不超过 4 条，要给出可执行的练习方法）\n\n' +
      '## 四、范文片段（可直接借鉴）\n' +
      '- 片段一（适用话题：……）：……（80-150 字）\n' +
      '- 片段二（适用话题：……）：……（80-150 字）\n';
  } else if (mode === 'doc') {
    tail =
      '【输出格式】严格按下面六部分输出，用 Markdown 标题与列表，不要加别的章节：\n' +
      '## 一、总体评价与预估得分\n' +
      '- 预估得分：X / ' + scoreTxt + '（档位：……）\n' +
      '- 一句话总评：……\n\n' +
      '## 二、格式评分（公文题必评）\n' +
      '1. 标题：有无 ｜ 是否规范 ｜ 扣分……\n' +
      '2. 称谓 / 主送机关：……\n' +
      '3. 正文分段与条理：……\n' +
      '4. 落款：……\n' +
      '5. 日期：……\n' +
      '- 格式小计扣分：X 分\n\n' +
      '## 三、采分点逐条对照\n' +
      '至少 5 条，每条一行，格式：\n' +
      '1. 采分点：…… ｜ 命中：完全命中 / 部分命中 / 未命中 ｜ 依据：…… ｜ 建议：……\n\n' +
      '## 四、主要失分原因\n' +
      '- ……（不超过 4 条）\n\n' +
      '## 五、规范表达替换\n' +
      '1. 原表述「……」→ 建议改为「……」\n\n' +
      '## 六、示范作答\n' +
      '（直接给出符合字数与公文格式要求的示范正文，不要再解释）\n';
  } else {
    tail =
      '【输出格式】严格按下面六部分输出，用 Markdown 标题与列表，不要加别的章节：\n' +
      '## 一、总体评价与预估得分\n' +
      '- 预估得分：X / ' + scoreTxt + '（档位：……）\n' +
      '- 一句话总评：……\n\n' +
      '## 二、采分点逐条对照\n' +
      '至少 5 条，每条一行，格式：\n' +
      '1. 采分点：…… ｜ 命中：完全命中 / 部分命中 / 未命中 ｜ 依据：…… ｜ 建议：……\n\n' +
      '## 三、主要失分原因\n' +
      '- ……（不超过 4 条）\n\n' +
      '## 四、逐条修改建议\n' +
      '1. ……\n\n' +
      '## 五、规范表达替换\n' +
      '1. 原表述「……」→ 建议改为「……」\n\n' +
      '## 六、示范作答\n' +
      '（直接给出不超过字数要求的示范作答正文，不要再解释）\n';
  }
  return [
    { role: 'user', content: head + tail },
    { role: 'user', content: '请严格按上文【输出格式】逐条输出批改结果，不要写多余客套话。' }
  ];
}

/* 极简 Markdown 渲染（只处理标题 / 列表 / 加粗 / 行内代码 / 分隔线） */
function slAiMd(text) {
  var raw = String(text === null || text === undefined ? '' : text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  var lines = raw.split('\n');
  var html = '';
  var inUl = false, inOl = false;
  function closeLists() {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  }
  function inline(t) {
    var s = slEsc(t);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }
  for (var i = 0; i < lines.length; i++) {
    var tr = String(lines[i]).replace(/^[\s　]+/, '').replace(/[\s　]+$/, '');
    if (!tr) { closeLists(); continue; }
    if (/^(-{3,}|={3,}|\*{3,})$/.test(tr)) { closeLists(); html += '<div class="sl-ai-hr"></div>'; continue; }
    var mh = /^(#{1,6})\s*(.*)$/.exec(tr);
    if (mh) { closeLists(); html += '<div class="sl-ai-h">' + inline(mh[2]) + '</div>'; continue; }
    var mu = /^([-*•])\s+(.*)$/.exec(tr);
    if (mu) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul class="sl-ai-ul">'; inUl = true; }
      html += '<li>' + inline(mu[2]) + '</li>';
      continue;
    }
    var mo = /^(\d{1,2})[.、)]\s*(.*)$/.exec(tr);
    if (mo) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol class="sl-ai-ol">'; inOl = true; }
      html += '<li>' + inline(mo[2]) + '</li>';
      continue;
    }
    closeLists();
    html += '<div class="sl-ai-p">' + inline(tr) + '</div>';
  }
  closeLists();
  return html;
}

function slAiBadge(kind) {
  if (kind === 'ok') return '<span class="sl-ai-badge ok">AI 批改完成</span>';
  if (kind === 'degraded') return '<span class="sl-ai-badge warn">本地兜底 · AI 通道不可用</span>';
  if (kind === 'error') return '<span class="sl-ai-badge warn">批改失败</span>';
  if (kind === 'timeout') return '<span class="sl-ai-badge warn">批改超时</span>';
  if (kind === 'offline') return '<span class="sl-ai-badge warn">AI 底座未就绪</span>';
  return '';
}
function slAiOutHtml(qid) {
  var c = SL.ai.out[qid];
  if (!c) return '';
  return slAiBadge(c.kind) + slAiMd(c.text);
}
function slAiRenderOut(text, kind, mode) {
  var box = document.getElementById('slAiOut');
  if (!box) return;
  var html;
  if (kind === 'loading' || kind === 'stream') {
    html = '<div class="sl-ai-loading"><span class="sl-ai-dots"><i></i><i></i><i></i></span>AI 正在思考…</div>';
    if (text) html += slAiMd(text);
  } else {
    html = slAiBadge(kind) + slAiMd(text);
    SL.ai.out[SL.qid] = { text: text, kind: kind, mode: mode, ts: slAiTime() };
  }
  box.innerHTML = html;
  if (kind === 'loading' || kind === 'stream') {
    try { box.scrollTop = box.scrollHeight; } catch (e) { /* 忽略 */ }
  }
}
function slAiSetStatus(t) {
  var st = document.getElementById('slAiStatus');
  if (st) st.textContent = t;
}
function slAiSetBtn(busy) {
  var b = document.getElementById('slAiBtn');
  var s = document.getElementById('slAiStopBtn');
  var c = document.getElementById('slAiClearBtn');
  var rec = SL.ai.out[SL.qid];
  if (b) {
    b.disabled = !!busy;
    b.textContent = busy ? '批改中…' : (rec ? '修改后重新批改' : 'AI 批改');
  }
  if (s) s.style.display = busy ? '' : 'none';
  if (c) c.disabled = !!busy;
  slAiSetStatus(busy ? 'AI 正在思考…' : (rec ? (rec.ts + ' 已批改 · ' + slAiModeName(rec.mode)) : ''));
}
function slAiClear() {
  if (SL.ai.out[SL.qid]) delete SL.ai.out[SL.qid];
  SL.ai.token = SL.ai.token + 1;
  var box = document.getElementById('slAiOut');
  if (box) box.innerHTML = '';
  slAiSetBtn(false);
  slToast('已清空批改结果');
}
function slAiStop() {
  if (!SL.ai.busy) return;
  SL.ai.token = SL.ai.token + 1;
  SL.ai.busy = false;
  slAiSetBtn(false);
  slAiSetStatus('已停止等待，可修改后重新批改');
  slToast('已停止等待');
}
function slAiErrText(err) {
  var m = (err && err.message) ? String(err.message) : '';
  if (err && err.rateLimited) return '- 提问太频繁：公共额度限制 10 次/分钟，请稍等约 1 分钟后再试。';
  if (err && err.status === 401) return '- API Key 无效或已过期（' + m + '）。可在「设置」里填写自己的 Key。';
  if (err && err.status === 429) return '- 触发限频（' + m + '），请稍后再试。';
  if (!m) return '- 网络异常或 AI 服务暂时不可用，请检查网络后重试。';
  return '- ' + m;
}
function slAiOfflineText(q, ans) {
  return '## AI 底座未就绪\n\n' +
    '- 未检测到 window.callAI（assets/ai-service.js 尚未加载或加载失败）\n' +
    '- 处理：刷新页面后重试；若用 APK，请确认网络可访问后再试\n\n' +
    slAiLocalCheck(q, ans);
}

/* 主入口：只在用户点按钮时调用，绝不自动发问 */
function slAiGrade() {
  var q = slCur();
  if (!q) { slToast('请先选择一道题'); return; }
  if (SL.ai.busy) { slToast('正在批改中，请稍候'); return; }
  var ta = document.getElementById('slAiEdit');
  var ans = ta ? String(ta.value || '') : '';
  if (slCount(ans) < 10) { slToast('请先写点作答内容（至少 10 字）再批改'); return; }

  // 修改后重批：把编辑框内容回写存档，离开再回来保持一致
  var old = slAns(q.id) || {};
  if (old.answer !== ans) {
    slSetAns(q.id, { answer: ans, chars: slCount(ans), updated: new Date().toISOString() });
  }

  var mode = slAiModeOf(q);
  var msgs = slAiPrompt(q, ans, mode);
  var token = SL.ai.token + 1;
  SL.ai.token = token;
  SL.ai.busy = true;
  slAiRenderOut('', 'loading', mode);
  slAiSetBtn(true);

  if (!slAiReady()) {
    SL.ai.busy = false;
    slAiSetBtn(false);
    slAiRenderOut(slAiOfflineText(q, ans), 'offline', mode);
    slToast('AI 底座未加载，已给出本地自检');
    return;
  }

  var wd1 = setTimeout(function () {
    if (SL.ai.token === token && SL.ai.busy) slAiSetStatus('AI 正在思考…（响应较慢，请稍候）');
  }, SL_AI_WD1);
  var wd2 = setTimeout(function () {
    if (SL.ai.token !== token || !SL.ai.busy) return;
    SL.ai.busy = false;
    slAiSetBtn(false);
    slAiRenderOut('## 批改超时\n\n等待超过 75 秒仍未拿到完整结果，可能是网络较慢或公共额度拥挤。\n\n' +
      slAiLocalCheck(q, ans), 'timeout', mode);
    slAiSetStatus('批改超时，可修改后重新批改');
    slToast('批改超时，已给出本地自检');
  }, SL_AI_WD2);

  var opts = { max: true };
  opts.onChunk = function (piece, full) {
    if (SL.ai.token !== token) return;
    slAiRenderOut(String(full || ''), 'stream', mode);
  };

  var pr = null;
  try {
    pr = window.callAI('longtext', msgs, opts);
  } catch (e1) {
    clearTimeout(wd1); clearTimeout(wd2);
    SL.ai.busy = false;
    slAiSetBtn(false);
    slAiRenderOut('## 批改失败\n\n' + slAiErrText(e1) + '\n\n' + slAiLocalCheck(q, ans), 'error', mode);
    slToast('批改失败，已给出本地自检');
    return;
  }
  if (!pr || typeof pr.then !== 'function') {
    clearTimeout(wd1); clearTimeout(wd2);
    SL.ai.busy = false;
    slAiSetBtn(false);
    slAiRenderOut(slAiOfflineText(q, ans), 'offline', mode);
    slToast('AI 底座返回异常，已给出本地自检');
    return;
  }

  pr.then(function (res) {
    clearTimeout(wd1); clearTimeout(wd2);
    if (SL.ai.token !== token) return;
    SL.ai.busy = false;
    slAiSetBtn(false);
    var text = (res && res.text) ? String(res.text) : '';
    if (!text) {
      slAiRenderOut('## 批改失败\n\nAI 返回了空内容，可稍后重试。\n\n' + slAiLocalCheck(q, ans), 'error', mode);
      slToast('AI 返回空内容，已给出本地自检');
      return;
    }
    if (res && res.degraded) {
      slAiRenderOut('（当前为本地兜底内容，AI 通道暂不可用。）\n\n' + text + '\n\n' + slAiLocalCheck(q, ans),
        'degraded', mode);
      slToast('AI 暂不可用，已给出本地兜底 + 自检');
      return;
    }
    slAiRenderOut(text, 'ok', mode);
    slToast('批改完成');
  }, function (err) {
    clearTimeout(wd1); clearTimeout(wd2);
    if (SL.ai.token !== token) return;
    SL.ai.busy = false;
    slAiSetBtn(false);
    slAiRenderOut('## 批改失败\n\n' + slAiErrText(err) + '\n\n' + slAiLocalCheck(q, ans), 'error', mode);
    slToast('批改失败，已给出本地自检');
  });
}

"""
ins(FUNC_ANCHOR, FUNC_BLOCK, 'ai-functions')

# ---------------- 6) 事件委托 ----------------
CASE_ANCHOR = "    case 'sel-hl':\n      slDoHighlight(); break;"
CASE_BLOCK = """    case 'ai-grade':
      slAiGrade(); break;
    case 'ai-clear':
      slAiClear(); break;
    case 'ai-stop':
      slAiStop(); break;
    case 'sel-hl':
      slDoHighlight(); break;"""
ins(CASE_ANCHOR, CASE_BLOCK, 'click-cases')

# ---------------- 写回（保持 CRLF） ----------------
out = src.replace('\n', '\r\n')
io.open(P, 'w', encoding='utf-8', newline='').write(out)
print('WRITTEN bytes=%d' % len(out.encode('utf-8')))
