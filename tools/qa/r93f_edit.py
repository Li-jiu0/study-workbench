# -*- coding: utf-8 -*-
"""R93-5b: 口径变更——回退对话页 composer 开关，改到 ai-settings.js 模型列表「检测状态」旁小开关。
- ai-page.js(LF)：撤 composer UI，保留消费端改读 map（ai_audio_models_v1）
- ai-settings.js(LF)：模型行「检测状态」旁小型有声开关 + 委托
- ai-config.js(CRLF)：Seedance 1.0 pro/fast 条目加 audio:true 轻量标记
- ai-settings.html：ai-settings.js 版本 e->f（AI.html 的 ai-page.js 保持 v=20260918g）
锚点计数 != 1 => ABORT 不写盘（逐文件独立 ABORT，已写文件不受影响）。"""
import sys, traceback

RES = []
def log(s):
    RES.append(s)

def edit_lf(path, ops):
    """ops: list of (old, new, expect, tag)。返回新文本；任一失败抛 ValueError。"""
    raw = open(path, 'rb').read()
    crlf = raw.count(b'\r\n'); lone_cr = raw.count(b'\r') - crlf
    log('%s BEFORE bytes=%d crlf=%d loneCR=%d' % (path, len(raw), crlf, lone_cr))
    if crlf != 0 or lone_cr != 0:
        raise ValueError(path + ' not pure LF')
    src = raw.decode('utf-8')
    for old, new, expect, tag in ops:
        n = src.count(old)
        log('%s %s old_count=%d expect=%d' % (path, tag, n, expect))
        if n != expect:
            raise ValueError('ABORT at %s %s' % (path, tag))
        src = src.replace(old, new)
    return src

def edit_crlf(path, ops):
    raw = open(path, 'rb').read()
    crlf = raw.count(b'\r\n'); lone_lf = raw.count(b'\n') - crlf; lone_cr = raw.count(b'\r') - crlf
    log('%s BEFORE bytes=%d crlf=%d loneLF=%d loneCR=%d' % (path, len(raw), crlf, lone_lf, lone_cr))
    if lone_lf != 0 or lone_cr != 0:
        raise ValueError(path + ' not pure CRLF')
    src = raw.decode('utf-8')
    for old, new, expect, tag in ops:
        n = src.count(old)
        log('%s %s old_count=%d expect=%d' % (path, tag, n, expect))
        if n != expect:
            raise ValueError('ABORT at %s %s' % (path, tag))
        src = src.replace(old, new)
    return src

def write_and_check(path, src, prefix):
    out = src.encode('utf-8')
    open(path, 'wb').write(out)
    rb = open(path, 'rb').read()
    crlf = rb.count(b'\r\n'); lone_lf = rb.count(b'\n') - crlf; lone_cr = rb.count(b'\r') - crlf
    log('%s AFTER bytes=%d (delta=%d) crlf=%d loneLF=%d loneCR=%d' %
        (path, len(rb), len(rb) - prefix, crlf, lone_lf, lone_cr))
    return rb.decode('utf-8')

try:
    # ================= 1) ai-page.js：回退 composer UI + 消费端改读 map =================
    ops = []

    ops.append((
        "  var VIDEO_AUDIO_KEY = 'ai_video_audio_v1';  // R93-5：视频带声音开关（'1'/'0'，默认关）",
        "  var AUDIO_MODELS_KEY = 'ai_audio_models_v1'; // R93-5b：视频带声音 map（{modelId:true}，ai-settings.js 模型列表写入）",
        1, 'R1-key'))

    ops.append((
        "  var state = { messages: [], chatId: null, image: null, audio: null, sending: false };\n"
        "  var aiVideoAudioBtn = null;   // R93-5：视频「带声音」开关按钮引用（DOM 注入，AI.html 不动）",
        "  var state = { messages: [], chatId: null, image: null, audio: null, sending: false };",
        1, 'R2-statevar'))

    ops.append((
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
        "  }",
        "  /* ---------- R93-5b：视频「带声音」状态读取（map 由 ai-settings.js 模型列表写入） ---------- */\n"
        "  function videoAudioOnFor(id) {\n"
        "    try {\n"
        "      var v = localStorage.getItem(AUDIO_MODELS_KEY);\n"
        "      var o = v ? JSON.parse(v) : null;\n"
        "      return !!(o && typeof o === 'object' && o[id] === true);\n"
        "    } catch (e) { return false; }\n"
        "  }",
        1, 'R3-helpers'))

    ops.append((
        "\n    refreshVideoAudioButton();   // R93-5：视频「带声音」开关注入与显隐（仅视频模型显示）",
        "",
        1, 'R4-init'))

    ops.append((
        "\n    refreshVideoAudioButton();   // R93-5：随模型选择刷新开关显隐",
        "",
        1, 'R5-label'))

    ops.append((
        "    var withAudio = (kind === 'video' && videoAudioOn());   /* R93-5：带声音开关（默认关），透传给能力模块 generate_audio */",
        "    var withAudio = (kind === 'video' && videoAudioOnFor(selId));   /* R93-5b：带声音按模型记忆（ai_audio_models_v1 map），默认关 */",
        1, 'R6-consume'))

    src = edit_lf('assets/ai-page.js', ops)
    t = write_and_check('assets/ai-page.js', src, 139831 + 0)
    for name, v in [
        ('no composer remnant btn id', t.count('aiVideoAudioBtn') == 0),
        ('no old key', t.count('ai_video_audio_v1') == 0),
        ('no videoAudioOn(', t.count('videoAudioOn()') == 0),
        ('consumer def == 1', t.count('function videoAudioOnFor(') == 1),
        ('consumer call == 1', t.count('videoAudioOnFor(selId)') == 1),
        ('echo kept', t.count('（带声音）') == 3),
        ('ES2017 clean', t.count('?.') == 0 and t.count('??') == 0 and t.count('catch{') == 0),
    ]:
        log('CHECK ai-page %s => %s' % (name, 'PASS' if v else 'FAIL'))

    # ================= 2) ai-settings.js：模型行「检测状态」旁小开关 =================
    ops = []
    ops.append((
        "  /* 只更新对应行的健康按钮文案与置灰态，不整页重渲染 */",
        "  /* ---------- R93-5b：视频「带声音」小开关（模型列表行内、检测状态旁） ----------\n"
        "     支持集：types 含 video 且模型条目 audio:true（ai-config.js 轻量标记，本期 Seedance 1.0 pro/fast）。\n"
        "     状态按模型 id 记忆在 localStorage ai_audio_models_v1（{modelId:true}），默认关；\n"
        "     消费端 ai-page.js 发送视频任务时读同一 map 决定 generate_audio。 */\n"
        "  var AUDIO_MODELS_KEY = 'ai_audio_models_v1';\n"
        "  function audioMapRead() {\n"
        "    try {\n"
        "      var v = localStorage.getItem(AUDIO_MODELS_KEY);\n"
        "      var o = v ? JSON.parse(v) : null;\n"
        "      return (o && typeof o === 'object' && !isArray(o)) ? o : {};\n"
        "    } catch (e) { return {}; }\n"
        "  }\n"
        "  function audioCapableOf(id) {\n"
        "    var m = findAnyModel(id);\n"
        "    if (!m) { return false; }\n"
        "    var t = typeKeysOf(m);\n"
        "    var isVideo = false;\n"
        "    for (var i = 0; i < t.length; i++) { if (t[i] === 'video') { isVideo = true; break; } }\n"
        "    return isVideo && m.audio === true;\n"
        "  }\n"
        "  function audioOnFor(id) { return audioMapRead()[id] === true; }\n"
        "  function toggleAudioFor(id) {\n"
        "    var map = audioMapRead();\n"
        "    if (map[id] === true) { delete map[id]; } else { map[id] = true; }\n"
        "    try { localStorage.setItem(AUDIO_MODELS_KEY, JSON.stringify(map)); } catch (e) { warnStorage(); }\n"
        "    renderModels();\n"
        "    var on = map[id] === true;\n"
        "    toast('success', on ? '已开启「带声音」（更耗额度，部分型号不支持）' : '已关闭「带声音」');\n"
        "  }\n"
        "  /* 小尺寸开关（高 16px，行内 flex，紧跟检测状态；不挤压行内其他元素） */\n"
        "  function audioToggleHtml(id) {\n"
        "    if (!audioCapableOf(id)) { return ''; }\n"
        "    var on = audioOnFor(id);\n"
        "    return '<span class=\"xt-audio-sw' + (on ? ' on' : '') + '\" data-vidaudio=\"' + esc(id) +\n"
        "      '\" role=\"switch\" aria-checked=\"' + (on ? 'true' : 'false') +\n"
        "      '\" title=\"生成的视频带声音（更耗额度，部分型号不支持）；点击切换\"' +\n"
        "      ' style=\"display:inline-flex;align-items:center;gap:3px;margin-left:6px;vertical-align:middle;cursor:pointer;user-select:none;\">' +\n"
        "      '<span style=\"font-size:11px;color:var(--ai-muted);line-height:1;\">有声</span>' +\n"
        "      '<span style=\"width:26px;height:16px;border-radius:999px;background:' + (on ? '#e8734a' : 'rgba(128,128,128,.35)') +\n"
        "      ';position:relative;display:inline-block;\">' +\n"
        "      '<span style=\"position:absolute;top:2px;left:' + (on ? '12px' : '2px') + ';width:12px;height:12px;border-radius:50%;background:#fff;\"></span>' +\n"
        "      '</span></span>';\n"
        "  }\n"
        "\n"
        "  /* 只更新对应行的健康按钮文案与置灰态，不整页重渲染 */",
        1, 'S1-helpers'))

    ops.append((
        "      '<span class=\"xt-speed\">' + speedHtml(id, model) + '</span>' + healthBoxHtml(id) + '</div>';",
        "      '<span class=\"xt-speed\">' + speedHtml(id, model) + '</span>' + healthBoxHtml(id) + audioToggleHtml(id) + '</div>';",
        1, 'S2-row'))

    ops.append((
        "    el = closestAttr(t, 'data-toggle', host);\n"
        "    if (el) { toggleModel(el.getAttribute('data-toggle')); return; }",
        "    el = closestAttr(t, 'data-toggle', host);\n"
        "    if (el) { toggleModel(el.getAttribute('data-toggle')); return; }\n"
        "    el = closestAttr(t, 'data-vidaudio', host);\n"
        "    if (el) { toggleAudioFor(el.getAttribute('data-vidaudio')); return; }   // R93-5b：有声小开关",
        1, 'S3-delegate'))

    src = edit_lf('assets/ai-settings.js', ops)
    t = write_and_check('assets/ai-settings.js', src, 137022)
    for name, v in [
        ('audioMapRead def == 1', t.count('function audioMapRead()') == 1),
        ('audioCapableOf def == 1', t.count('function audioCapableOf(') == 1),
        ('audioToggleHtml def/call', t.count('function audioToggleHtml(') == 1 and t.count('audioToggleHtml(id)') == 2),
        ('data-vidaudio html+delegate', t.count('data-vidaudio') == 2),
        ('toggleAudioFor def+call', t.count('function toggleAudioFor(') == 1 and t.count('toggleAudioFor(el.getAttribute') == 1),
        ('ES2017 clean', t.count('?.') == 0 and t.count('??') == 0 and t.count('catch{') == 0),
    ]:
        log('CHECK ai-settings %s => %s' % (name, 'PASS' if v else 'FAIL'))

    # ================= 3) ai-config.js（CRLF）：Seedance 条目加 audio:true =================
    ops = []
    ops.append((
        "      model: \"doubao-seedance-1-0-pro-250528\",\r\n      types: [\"video\"],",
        "      model: \"doubao-seedance-1-0-pro-250528\",\r\n      types: [\"video\"],\r\n      audio: true,                   /* R93-5b：支持 generate_audio（设置页「有声」小开关数据源） */",
        1, 'C1-pro'))
    ops.append((
        "      model: \"doubao-seedance-1-0-pro-fast-251015\",\r\n      types: [\"video\"],",
        "      model: \"doubao-seedance-1-0-pro-fast-251015\",\r\n      types: [\"video\"],\r\n      audio: true,                   /* R93-5b：支持 generate_audio（设置页「有声」小开关数据源） */",
        1, 'C2-fast'))
    src = edit_crlf('assets/ai-config.js', ops)
    t = write_and_check('assets/ai-config.js', src, 44754)
    log('CHECK ai-config audio:true count=%d => %s' % (t.count('audio: true'), 'PASS' if t.count('audio: true') == 2 else 'FAIL'))

    # ================= 4) 版本号 =================
    # ai-settings.html: ai-settings.js e -> f
    h = open('ai-settings.html', 'rb').read()
    old = b'assets/ai-settings.js?v=20260918e'
    n = h.count(old)
    log('ai-settings.html ver anchor=%d expect=1' % n)
    if n == 1:
        h = h.replace(old, b'assets/ai-settings.js?v=20260918f')
        open('ai-settings.html', 'wb').write(h)
    hb = open('ai-settings.html', 'rb').read()
    log('ai-settings.html AFTER bytes=%d crlf=%d v20260918f(ai-settings.js)=%d' %
        (len(hb), hb.count(b'\r\n'), hb.count(b'ai-settings.js?v=20260918f')))
    # AI.html: ai-page.js 保持 v=20260918g（本批有改动，确认无降版）
    ai = open('AI.html', 'rb').read()
    log('AI.html ai-page version g=%d (expect 1, keep)' % ai.count(b'ai-page.js?v=20260918g'))
except ValueError as ve:
    log(str(ve))
except Exception:
    log('EXCEPTION:\n' + traceback.format_exc())

open('tools/qa/_r93f_edit.txt', 'w', encoding='utf-8').write('\n'.join(RES))
