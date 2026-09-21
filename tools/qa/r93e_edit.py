# -*- coding: utf-8 -*-
"""R93-5: 视频生成「带声音」开关 + audio 参数打通。
ai-page.js 纯 LF 二进制编辑 + AI.html(CRLF) 版本号。锚点计数 != 1 => ABORT 不写盘。"""
import sys, traceback

RES = []
def log(s):
    RES.append(s)

try:
    # ============ ai-page.js（纯 LF） ============
    P = 'assets/ai-page.js'
    raw = open(P, 'rb').read()
    crlf = raw.count(b'\r\n'); lone_cr = raw.count(b'\r') - crlf
    log('ai-page BEFORE bytes=%d crlf=%d loneCR=%d' % (len(raw), crlf, lone_cr))
    if crlf != 0 or lone_cr != 0:
        log('ABORT: not pure LF'); raise SystemExit
    src = raw.decode('utf-8')

    def rep(old, new, expect, tag):
        n = src.count(old)
        log('%s old_count=%d expect=%d' % (tag, n, expect))
        if n != expect:
            log('ABORT at %s' % tag); raise SystemExit
        return src.replace(old, new)

    # ---------- E1a: 新 localStorage key 常量 ----------
    a = "  var MEMORY_ITEM_MAX = 200;                  // 单条记忆截断长度（字）"
    n = "  var MEMORY_ITEM_MAX = 200;                  // 单条记忆截断长度（字）\n" + \
        "  var VIDEO_AUDIO_KEY = 'ai_video_audio_v1';  // R93-5：视频带声音开关（'1'/'0'，默认关）"
    src = rep(a, n, 1, 'E1a')

    # ---------- E1b: 按钮引用状态变量 ----------
    a = "  var state = { messages: [], chatId: null, image: null, audio: null, sending: false };"
    n = ("  var state = { messages: [], chatId: null, image: null, audio: null, sending: false };\n"
         "  var aiVideoAudioBtn = null;   // R93-5：视频「带声音」开关按钮引用（DOM 注入，AI.html 不动）")
    src = rep(a, n, 1, 'E1b')

    # ---------- E2: 开关助手 + 注入（紧跟 ensureAudioPreview 之后） ----------
    a = ("    aiAudioLabel = $('aiAudioLabel');\n"
         "    bindById('aiAudioRemove', 'click', clearAudio);\n"
         "  }")
    n = ("    aiAudioLabel = $('aiAudioLabel');\n"
         "    bindById('aiAudioRemove', 'click', clearAudio);\n"
         "  }\n"
         "\n"
         "  /* ---------- R93-5：视频「带声音」开关（仅视频模型显示，状态记忆在本地） ----------\n"
         "     火山 Seedance 默认无声（generate_audio: input.audio === true），此开关把\n"
         "     audio 透传到能力模块；默认关：省额度、兼容性最好、生成更快。 */\n"
         "  function videoAudioOn() { return lsStr(VIDEO_AUDIO_KEY, '0') === '1'; }\n"
         "  function setVideoAudioOn(on) { lsStrSet(VIDEO_AUDIO_KEY, on ? '1' : '0'); }\n"
         "  function syncVideoAudioBtn(b) {\n"
         "    if (!b) return;\n"
         "    var on = videoAudioOn();\n"
         "    b.textContent = on ? '\\ud83d\\udd0a' : '\\ud83d\\udd07';\n"
         "    b.title = '生成的视频' + (on ? '带声音' : '不带声音') + '；开启后更耗额度，部分型号不支持';\n"
         "    b.style.opacity = on ? '1' : '.55';\n"
         "  }\n"
         "  function ensureVideoAudioButton() {\n"
         "    if (aiVideoAudioBtn || !aiMicBtn) return;   // 跟随麦克风按钮（同一父容器，注入范式同 R86）\n"
         "    var b = doc.createElement('button');\n"
         "    b.type = 'button';\n"
         "    b.id = 'aiVideoAudioBtn';\n"
         "    b.className = 'ai-icon-btn';\n"
         "    b.setAttribute('aria-label', '视频带声音');\n"
         "    syncVideoAudioBtn(b);\n"
         "    var host = aiMicBtn.parentNode;\n"
         "    if (!host) return;\n"
         "    if (aiMicBtn.nextSibling) host.insertBefore(b, aiMicBtn.nextSibling);\n"
         "    else host.appendChild(b);\n"
         "    aiVideoAudioBtn = b;\n"
         "    bindEl(b, 'click', function () {\n"
         "      var on = !videoAudioOn();\n"
         "      setVideoAudioOn(on);\n"
         "      syncVideoAudioBtn(aiVideoAudioBtn);\n"
         "      toast(on ? '已开启带声音（更耗额度，部分型号不支持）' : '已关闭带声音');\n"
         "    });\n"
         "  }\n"
         "  function refreshVideoAudioButton() {\n"
         "    ensureVideoAudioButton();\n"
         "    if (!aiVideoAudioBtn) return;\n"
         "    var selId = getSelectedModelId();\n"
         "    var m = getModelById(selId);\n"
         "    var isVideo = !!(m && isCapabilityModel(m) && capModelKind(m) === 'video');\n"
         "    aiVideoAudioBtn.style.display = isVideo ? '' : 'none';\n"
         "  }")
    src = rep(a, n, 1, 'E2')

    # ---------- E3: init 注入 + 首刷 ----------
    a = ("    ensureMicButton();      // R86：麦克风按钮（DOM 注入，AI.html 不动）\n"
         "    ensureAudioPreview();   // R86：语音附件条")
    n = ("    ensureMicButton();      // R86：麦克风按钮（DOM 注入，AI.html 不动）\n"
         "    ensureAudioPreview();   // R86：语音附件条\n"
         "    refreshVideoAudioButton();   // R93-5：视频「带声音」开关注入与显隐（仅视频模型显示）")
    src = rep(a, n, 1, 'E3')

    # ---------- E4: updateModelLabel 统一刷新显隐（selectModel/模式/自定义模型增删都会走这里） ----------
    a = ("      sideBtn.setAttribute('title', '当前模型：' + nm + '（点击查看介绍）');\n"
         "    }\n"
         "  }")
    n = ("      sideBtn.setAttribute('title', '当前模型：' + nm + '（点击查看介绍）');\n"
         "    }\n"
         "    refreshVideoAudioButton();   // R93-5：随模型选择刷新开关显隐\n"
         "  }")
    src = rep(a, n, 1, 'E4')

    # ---------- E5: routeCapabilityModel 透传 audio + 进度/结果回显注明 ----------
    a = ("    var label = (kind === 'video') ? '视频' : '3D 模型';\n"
         "    var input = { prompt: String(text || '') };\n"
         "    if (image) { input.imageUrl = String(image); input.mode = (kind === 'video') ? 'i2v' : 'i23d'; }")
    n = ("    var label = (kind === 'video') ? '视频' : '3D 模型';\n"
         "    var withAudio = (kind === 'video' && videoAudioOn());   /* R93-5：带声音开关（默认关），透传给能力模块 generate_audio */\n"
         "    var input = { prompt: String(text || '') };\n"
         "    if (withAudio) { input.audio = true; }\n"
         "    if (image) { input.imageUrl = String(image); input.mode = (kind === 'video') ? 'i2v' : 'i23d'; }")
    src = rep(a, n, 1, 'E5a')

    a = "      aiB.mdEl.innerHTML = renderMarkdown('正在生成' + label + '…（第 ' + tries + '/' + max + ' 次查询）');"
    n = "      aiB.mdEl.innerHTML = renderMarkdown('正在生成' + label + (withAudio ? '（带声音）' : '') + '…（第 ' + tries + '/' + max + ' 次查询）');"
    src = rep(a, n, 1, 'E5b')

    a = ("        plain = '🎬 ' + label + '已生成（链接约 24 小时内有效，请及时观看 / 保存）：' + url;\n"
         "        aiB.mdEl.innerHTML = renderMarkdown('🎬 ' + label + '已生成（链接约 24 小时内有效，请及时观看 / 保存）：');")
    n = ("        plain = '🎬 ' + label + (withAudio ? '（带声音）' : '') + '已生成（链接约 24 小时内有效，请及时观看 / 保存）：' + url;\n"
         "        aiB.mdEl.innerHTML = renderMarkdown('🎬 ' + label + (withAudio ? '（带声音）' : '') + '已生成（链接约 24 小时内有效，请及时观看 / 保存）：');")
    src = rep(a, n, 1, 'E5c')

    out = src.encode('utf-8')
    open(P, 'wb').write(out)
    rb = open(P, 'rb').read()
    crlf2 = rb.count(b'\r\n'); lone_cr2 = rb.count(b'\r') - crlf2
    log('ai-page AFTER bytes=%d (delta=%d) crlf=%d loneCR=%d' %
        (len(rb), len(rb) - len(raw), crlf2, lone_cr2))
    t = rb.decode('utf-8')
    for name, v in [
        ('VIDEO_AUDIO_KEY const == 1', t.count("var VIDEO_AUDIO_KEY = 'ai_video_audio_v1';") == 1),
        ('videoAudioOn def/calls', t.count('videoAudioOn()') == 4),
        ('ensureVideoAudioButton def == 1', t.count('function ensureVideoAudioButton()') == 1),
        ('refreshVideoAudioButton def == 1', t.count('function refreshVideoAudioButton()') == 1),
        ('refresh calls == 2 (init + label)', t.count('refreshVideoAudioButton();') == 2),
        ('audio pass == 1', t.count('if (withAudio) { input.audio = true; }') == 1),
        ('withAudio def == 1', t.count('var withAudio =') == 1),
        ('progress echo == 1', t.count("(withAudio ? '（带声音）' : '') + '…（第 '") == 1),
        ('success echo == 2', t.count("(withAudio ? '（带声音）' : '') + '已生成") == 2),
        ('ES2017 no ?.', t.count('?.') == 0),
        ('ES2017 no ??', t.count('??') == 0),
        ('ES2017 no replaceAll(', t.count('.replaceAll(') == 0),
        ('ES2017 no .at(', t.count('.at(') == 0),
        ('ES2017 no catch{', t.count('catch{') == 0),
    ]:
        log('CHECK %s => %s' % (name, 'PASS' if v else 'FAIL'))

    # ============ AI.html（CRLF）：ai-page.js 版本 20260918f -> g ============
    H = 'AI.html'
    h = open(H, 'rb').read()
    old = b'assets/ai-page.js?v=20260918f'
    n = h.count(old)
    log('AI.html ver anchor=%d expect=1' % n)
    if n == 1:
        h = h.replace(old, b'assets/ai-page.js?v=20260918g')
        open(H, 'wb').write(h)
    hb = open(H, 'rb').read()
    log('AI.html AFTER bytes=%d crlf=%d v20260918g(ai-page)=%d v20260918f(ai-page)=%d' %
        (len(hb), hb.count(b'\r\n'),
         hb.count(b'ai-page.js?v=20260918g'), hb.count(b'ai-page.js?v=20260918f')))
except SystemExit:
    pass
except Exception:
    log('EXCEPTION:\n' + traceback.format_exc())

open('tools/qa/_r93e_edit.txt', 'w', encoding='utf-8').write('\n'.join(RES))
