# -*- coding: utf-8 -*-
"""R92-A 编辑脚本 v2（按实测行尾：ai-page.js/ai-service.js = LF，AI.html = CRLF）：
A) ai-page.js：askAI 前置能力型模型路由（video/3d -> xtRunCapability）
B) ai-service.js：xtRunCapability 支持 cap.run 异步链路 + 守卫式导出
C) AI.html：ai-service.js / ai-page.js 版本号 d -> e 强刷缓存
二进制读写、逐条唯一命中断言、写后回读校验。结果 → tools/qa/r92a_edit_result.txt
"""
import os

ROOT = r'D:\下载的文件\学习工作台'
JS_PAGE = os.path.join(ROOT, 'assets', 'ai-page.js')
JS_SVC = os.path.join(ROOT, 'assets', 'ai-service.js')
HTML_AI = os.path.join(ROOT, 'AI.html')
OUT = os.path.join(ROOT, 'tools', 'qa', 'r92a_edit_result.txt')

log = []
def w(s):
    log.append(str(s))

def eol_stats(data):
    crlf = data.count(b'\r\n')
    lone_cr = 0
    idx = 0
    while True:
        i = data.find(b'\r', idx)
        if i < 0:
            break
        if data[i+1:i+2] != b'\n':
            lone_cr += 1
        idx = i + 1
    return crlf, lone_cr

def rep(data, old, new, name):
    cnt = data.count(old)
    if cnt != 1:
        raise SystemExit('ABORT: %s count=%d' % (name, cnt))
    nd = data.replace(old, new, 1)
    w('[OK] %s (old %d B -> new %d B)' % (name, len(old), len(new)))
    return nd

def JL(*lines):
    return b'\n'.join((x.encode('utf-8') if isinstance(x, str) else x) for x in lines)

# ================= A) ai-page.js（LF） =================
with open(JS_PAGE, 'rb') as f:
    a0 = f.read()
ac0, ar0 = eol_stats(a0)
w('ai-page.js BEFORE: size=%d crlf=%d loneCR=%d (expect 0/0 pure LF)' % (len(a0), ac0, ar0))
if ac0 or ar0:
    raise SystemExit('ABORT: ai-page.js 行尾非纯 LF')

p1_old = b'  function askAI(text, image) {'
p1_new = JL(
"""  /* ============ R92-A：能力型模型路由（video / 3d） ============ */
  /* predictFuncType 只按输入文字猜功能，不知道用户选了什么模型：选中 types 含
     'video'（或 '3d'）的模型时，普通对话链路 chat/completions 必然失败（视频/3D
     是分钟级异步任务，走的是异步任务端点）。此处在 askAI 前置检查选中模型的
     types，命中即改走 xtRunCapability 直连链路（ai-service.js 守卫式导出；
     ai-cap-video.js / ai-cap-3d.js 内部完成 创建→轮询→取结果→上报用量），
     其余路由（普通对话 / 翻译 / 推理 / 生图）一律不变。 */
  var CAP_MODEL_TYPES = ['video', '3d'];

  function isCapabilityModel(m) {
    if (!m || !m.types || typeof m.types.length !== 'number') { return false; }
    for (var i = 0; i < m.types.length; i++) {
      for (var j = 0; j < CAP_MODEL_TYPES.length; j++) {
        if (String(m.types[i]) === CAP_MODEL_TYPES[j]) { return true; }
      }
    }
    return false;
  }

  function capModelKind(m) {
    if (!m || !m.types || typeof m.types.length !== 'number') { return ''; }
    for (var i = 0; i < m.types.length; i++) {
      var t = String(m.types[i]);
      if (t === 'video') { return 'video'; }
      if (t === '3d') { return '3d'; }
    }
    return '';
  }

  /** 命中能力型模型：接管本次发送并返回 true（异步完成后自行收尾）；否则返回 false 走原路由 */
  function routeCapabilityModel(aiB, text, image) {
    var selId = getSelectedModelId();
    if (!selId || selId === 'auto') { return false; }
    var m = getModelById(selId);
    if (!m || !isCapabilityModel(m)) { return false; }
    var kind = capModelKind(m);
    var run = (typeof window !== 'undefined') ? window.xtRunCapability : null;
    if (typeof run !== 'function') {
      removeTyping(aiB);
      var missMsg = '视频 / 3D 能力模块未加载，请刷新页面后重试。';
      aiB.mdEl.innerHTML = renderMarkdown(missMsg);
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: missMsg });
      setSendBusy(false);
      saveCurrentChat();
      return true;
    }
    var label = (kind === 'video') ? '视频' : '3D 模型';
    var input = { prompt: String(text || '') };
    if (image) { input.imageUrl = String(image); input.mode = (kind === 'video') ? 'i2v' : 'i23d'; }
    var progressShown = false;
    run(selId, input, { onProgress: function (p) {
      if (!progressShown) { removeTyping(aiB); progressShown = true; }
      var tries = (p && typeof p.tries === 'number') ? p.tries : 0;
      var max = (p && typeof p.max === 'number') ? p.max : 120;
      aiB.mdEl.innerHTML = renderMarkdown('正在生成' + label + '…（第 ' + tries + '/' + max + ' 次查询）');
      scrollBottom();
    } }).then(function (r) {
      removeTyping(aiB);
      var u = (r && r.result) ? r.result : {};
      var url = u.url ? String(u.url) : '';
      var plain;
      if (!url) {
        plain = '（' + label + '生成完成但未返回文件地址）';
        aiB.mdEl.innerHTML = renderMarkdown(plain);
      } else if (kind === 'video') {
        plain = '🎬 ' + label + '已生成（链接约 24 小时内有效，请及时观看 / 保存）：' + url;
        aiB.mdEl.innerHTML = renderMarkdown('🎬 ' + label + '已生成（链接约 24 小时内有效，请及时观看 / 保存）：');
        var vid = doc.createElement('video');
        vid.src = url; vid.controls = true;
        vid.setAttribute('style', 'max-width:100%;border-radius:10px;margin-top:6px;display:block;');
        aiB.mdEl.appendChild(vid);
      } else {
        plain = '🧊 ' + label + '已生成（结果为 .zip 压缩包，内含模型文件）：' + url;
        aiB.mdEl.innerHTML = renderMarkdown('🧊 ' + label + '已生成（结果为 .zip 压缩包，内含模型文件）：');
        var lk = doc.createElement('a');
        lk.href = url; lk.target = '_blank'; lk.rel = 'noopener';
        lk.textContent = '⬇ 下载模型文件（.zip）';
        lk.setAttribute('style', 'display:inline-block;margin-top:6px;');
        aiB.mdEl.appendChild(lk);
      }
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: plain });
      setSendBusy(false);
      saveCurrentChat();
    })['catch'](function (err) {
      removeTyping(aiB);
      var msg = (err && err.message) ? String(err.message) : '生成失败，请稍后重试';
      aiB.mdEl.innerHTML = renderMarkdown('⚠️ ' + label + '生成失败：' + msg);
      showMsgActions(aiB);
      state.messages.push({ role: 'ai', content: '⚠️ ' + label + '生成失败：' + msg });
      setSendBusy(false);
      saveCurrentChat();
      toast(label + '生成失败');
    });
    return true;
  }

  function askAI(text, image) {""".replace('\r\n', '\n'))

p2_old = b"    var funcType = predictFuncType(text, !!image);\n"
p2_new = JL(
"""    var funcType = predictFuncType(text, !!image);""",
"""    /* R92-A：选中模型 types 含 'video' / '3d' 时走能力直连链路（详见 routeCapabilityModel） */""",
"""    if (routeCapabilityModel(aiB, text, image)) { return; }""",
)

a = a0
a = rep(a, p1_old, p1_new, 'P1 insert capability routing before askAI')
a = rep(a, p2_old, p2_new, 'P2 askAI hook after predictFuncType')

with open(JS_PAGE, 'wb') as f:
    f.write(a)
with open(JS_PAGE, 'rb') as f:
    a1 = f.read()
ac1, ar1 = eol_stats(a1)
w('ai-page.js AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(a1), ac1, ar1, len(a1)-len(a0)))
if ac1 or ar1 or a1 != a:
    raise SystemExit('ABORT: ai-page.js 写后校验失败')
w('[OK] ai-page.js 回读一致，纯 LF')

# ================= B) ai-service.js（LF） =================
with open(JS_SVC, 'rb') as f:
    s0 = f.read()
sc0, sr0 = eol_stats(s0)
w('ai-service.js BEFORE: size=%d crlf=%d loneCR=%d (expect 0/0 pure LF)' % (len(s0), sc0, sr0))
if sc0 or sr0:
    raise SystemExit('ABORT: ai-service.js 行尾非纯 LF')

s1_old = JL(
"""    try {""",
"""      var result = await xtCallCapability(cap, mc, capInput, o, sink);""",
)
s1_new = JL(
"""    try {""",
"""      var result;
      if (typeof cap.run === "function") {
        /* R92-A：异步能力（video / 3d）自带 run(ctx, onProgress)——创建→轮询→取结果→
           上报模型平台用量全在能力模块内部完成。xtCallCapability 是单发请求链路，
           撑不住分钟级异步任务（视频退到它只会拿到 taskId 拿不到结果）。 */
        var capCfg = getConfig();
        var capProvider = (mc && mc.provider && capCfg && capCfg.providers) ? capCfg.providers[mc.provider] : null;
        var runRes = await cap.run({ modelCfg: mc, provider: capProvider, input: capInput },
                                   (typeof o.onProgress === "function") ? o.onProgress : null);
        if (!runRes || runRes.ok === false) {
          var re = makeError((runRes && runRes.err) ? String(runRes.err) : ("能力执行失败：" + cap.key), 0, "CAP_RUN");
          re.modelId = mc ? mc.id : "";
          re.modelName = mc ? mc.name : "";
          throw re;
        }
        result = runRes.result;
        if (sink && typeof sink === "object") {
          sink.capUsage = (runRes.usage && typeof runRes.usage === "object") ? runRes.usage : null;
        }
      } else {
        result = await xtCallCapability(cap, mc, capInput, o, sink);
      }""",
)

s2_old = b'    window.callAI = callAI;\n'
s2_new = JL(
"""    window.callAI = callAI;""",
"""    // R92-A：能力直连入口（video / 3d 等 types 模型）；守卫式挂载，避免全局名冲突""",
"""    if (typeof window.xtRunCapability !== "function") window.xtRunCapability = xtRunCapability;""",
)

s = s0
s = rep(s, s1_old, s1_new, 'S1 xtRunCapability: cap.run async dispatch')
s = rep(s, s2_old, s2_new, 'S2 export window.xtRunCapability')

with open(JS_SVC, 'wb') as f:
    f.write(s)
with open(JS_SVC, 'rb') as f:
    s1f = f.read()
sc1, sr1 = eol_stats(s1f)
w('ai-service.js AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(s1f), sc1, sr1, len(s1f)-len(s0)))
if sc1 or sr1 or s1f != s:
    raise SystemExit('ABORT: ai-service.js 写后校验失败')
w('[OK] ai-service.js 回读一致，纯 LF')

# ================= C) AI.html（CRLF，单行替换与行尾无关） =================
with open(HTML_AI, 'rb') as f:
    h0 = f.read()
hc0, hr0 = eol_stats(h0)
w('AI.html BEFORE: size=%d crlf=%d loneCR=%d (expect loneCR=0)' % (len(h0), hc0, hr0))
if hr0:
    raise SystemExit('ABORT: AI.html 行尾异常')
c1_old = b'assets/ai-service.js?v=20260918d'
c1_new = b'assets/ai-service.js?v=20260918e'
c2_old = b'assets/ai-page.js?v=20260918d'
c2_new = b'assets/ai-page.js?v=20260918e'
h = rep(h0, c1_old, c1_new, 'C1 AI.html ai-service.js d -> e')
h = rep(h, c2_old, c2_new, 'C2 AI.html ai-page.js d -> e')
with open(HTML_AI, 'wb') as f:
    f.write(h)
with open(HTML_AI, 'rb') as f:
    h1 = f.read()
hc1, hr1 = eol_stats(h1)
w('AI.html AFTER: size=%d crlf=%d loneCR=%d (delta=%+d B)' % (len(h1), hc1, hr1, len(h1)-len(h0)))
if hr1 or h1 != h:
    raise SystemExit('ABORT: AI.html 写后校验失败')
w('[OK] AI.html 回读一致')

# ================= 命中核验 =================
checks = [
    ('ai-page: routeCapabilityModel def+hook =2', a1.count(b'routeCapabilityModel') == 2),
    ('ai-page: CAP_MODEL_TYPES =1', a1.count(b'CAP_MODEL_TYPES') == 1),
    ('ai-page: i2v / i23d 模式接好', a1.count(b"'i2v'") >= 1 and a1.count(b"'i23d'") >= 1),
    ('ai-page: <video> 回显 =1', a1.count(b"createElement('video')") == 1),
    ('ai-page: xtRunCapability 引用 =1', a1.count(b'window.xtRunCapability') == 1),
    ('ai-page: 原链路 callAI 调用保留', a1.count(b'callAI(funcType, apiMessages, opts)') == 1),
    ('ai-svc: cap.run dispatch =1', s1f.count(b'typeof cap.run === "function"') == 1),
    ('ai-svc: export xtRunCapability =1', s1f.count(b'window.xtRunCapability') == 1),
    ('ai-svc: xtCallCapability 原链路保留', s1f.count(b'await xtCallCapability(cap, mc, capInput, o, sink)') == 1),
    ('AI.html: ai-page.js v=20260918e =1', h1.count(b'assets/ai-page.js?v=20260918e') == 1),
    ('AI.html: ai-service.js v=20260918e =1', h1.count(b'assets/ai-service.js?v=20260918e') == 1),
    ('AI.html: 旧 v=20260918d（page/svc）=0', h1.count(b'ai-page.js?v=20260918d') == 0 and h1.count(b'ai-service.js?v=20260918d') == 0),
]
allpass = True
for name, ok in checks:
    w('[%s] %s' % ('PASS' if ok else 'FAIL', name))
    if not ok:
        allpass = False
w('EDIT_ALL=%s' % ('PASS' if allpass else 'FAIL'))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(log))
print('edit-done')
