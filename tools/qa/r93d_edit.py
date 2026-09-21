# -*- coding: utf-8 -*-
"""R93-4: 视频 URL 任何渲染路径都内嵌 <video controls>（兼容旧存量纯文本消息）。
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

    # ---------- E1: videoUrlSplit 助手（插在 renderMarkdown 前） ----------
    a1 = "  /* ============ 轻量 Markdown 渲染（自实现，无外部库） ============ */\n  function inlineMd(s) {"
    e1 = ("  /* R93-4：识别视频文件 URL（.mp4/.webm/.mov；能力模块 video_url 实际为\n"
          "     .mp4 + X-Tos-Expires 查询串）。返回 [URL 前文本, 视频URL, URL 后文本]\n"
          "     或 null。新消息与旧存量纯文本消息走同一条识别路径——历史消息重渲染\n"
          "     即得内嵌播放器，无需迁移存储格式。 */\n"
          "  function videoUrlSplit(text) {\n"
          "    var s = String(text || '');\n"
          "    var m = /(https?:\\/\\/[^\\s'\"<>]+?\\.(?:mp4|webm|mov)(?:\\?[^\\s'\"<>]*)?)/i.exec(s);\n"
          "    if (!m) { return null; }\n"
          "    return [s.slice(0, m.index), m[1], s.slice(m.index + m[0].length)];\n"
          "  }\n"
          "\n"
          "  /* ============ 轻量 Markdown 渲染（自实现，无外部库） ============ */\n"
          "  function inlineMd(s) {")
    src = rep(a1, e1, 1, 'E1')

    # ---------- E2: renderMarkdown 增加视频 URL 分支（紧跟图片分支之后） ----------
    a2 = ("      var imgM = /^!\\[([^\\]]*)\\]\\((\\S+)\\)$/.exec(line.trim());\n"
          "      if (imgM) {\n"
          "        flushPara();\n"
          "        html += '<p><img class=\"ai-md-img\" src=\"' + escHtml(imgM[2]) + '\" alt=\"' +\n"
          "          escHtml(imgM[1]) + '\" style=\"max-width:100%;border-radius:10px;\"></p>';\n"
          "        continue;\n"
          "      }")
    e2 = ("      var imgM = /^!\\[([^\\]]*)\\]\\((\\S+)\\)$/.exec(line.trim());\n"
          "      if (imgM) {\n"
          "        flushPara();\n"
          "        html += '<p><img class=\"ai-md-img\" src=\"' + escHtml(imgM[2]) + '\" alt=\"' +\n"
          "          escHtml(imgM[1]) + '\" style=\"max-width:100%;border-radius:10px;\"></p>';\n"
          "        continue;\n"
          "      }\n"
          "      // R93-4：视频结果 URL 任何渲染路径都内嵌 <video>（运行时首显与历史重渲染\n"
          "      // 同口径）；3D 的 .zip 不在视频后缀名单内，仍走原展示不误伤。\n"
          "      var vidM = videoUrlSplit(line);\n"
          "      if (vidM) {\n"
          "        flushPara();\n"
          "        if (vidM[1]) { html += '<p>' + inlineMd(escHtml(vidM[1])) + '</p>'; }\n"
          "        html += '<p><video class=\"ai-md-video\" controls preload=\"metadata\" src=\"' +\n"
          "          escHtml(vidM[2]) + '\" style=\"max-width:100%;border-radius:10px;display:block;\"></video></p>';\n"
          "        if (vidM[3]) { html += '<p>' + inlineMd(escHtml(vidM[3])) + '</p>'; }\n"
          "        continue;\n"
          "      }")
    src = rep(a2, e2, 1, 'E2')

    out = src.encode('utf-8')
    open(P, 'wb').write(out)
    rb = open(P, 'rb').read()
    crlf2 = rb.count(b'\r\n'); lone_cr2 = rb.count(b'\r') - crlf2
    log('ai-page AFTER bytes=%d (delta=%d) crlf=%d loneCR=%d' %
        (len(rb), len(rb) - len(raw), crlf2, lone_cr2))
    t = rb.decode('utf-8')
    for name, v in [
        ('videoUrlSplit def == 1', t.count('function videoUrlSplit(') == 1),
        ('videoUrlSplit calls == 2 (def-branch counted via name)', t.count('videoUrlSplit') == 2),
        ('video branch == 1', t.count('ai-md-video') == 1),
        ('3d zip branch intact', t.count('下载模型文件（.zip）') == 1),
        ('runtime <video> DOM path intact', t.count("doc.createElement('video')") == 1),
        ('ES2017 no ?.', t.count('?.') == 0),
        ('ES2017 no ??', t.count('??') == 0),
        ('ES2017 no replaceAll(', t.count('.replaceAll(') == 0),
        ('ES2017 no .at(', t.count('.at(') == 0),
        ('ES2017 no catch{', t.count('catch{') == 0),
        ('ES2017 no backtick', t.count('`') == 0),
    ]:
        log('CHECK %s => %s' % (name, 'PASS' if v else 'FAIL'))

    # ============ AI.html（CRLF）：ai-page.js 版本 20260918e -> f ============
    H = 'AI.html'
    h = open(H, 'rb').read()
    log('AI.html BEFORE bytes=%d crlf=%d' % (len(h), h.count(b'\r\n')))
    old = b'assets/ai-page.js?v=20260918e'
    n = h.count(old)
    log('AI.html ver anchor=%d expect=1' % n)
    if n == 1:
        h = h.replace(old, b'assets/ai-page.js?v=20260918f')
        open(H, 'wb').write(h)
    hb = open(H, 'rb').read()
    log('AI.html AFTER bytes=%d crlf=%d v20260918f(ai-page)=%d v20260918e(ai-page)=%d' %
        (len(hb), hb.count(b'\r\n'),
         hb.count(b'ai-page.js?v=20260918f'), hb.count(b'ai-page.js?v=20260918e')))
except SystemExit:
    pass
except Exception:
    log('EXCEPTION:\n' + traceback.format_exc())

open('tools/qa/_r93d_edit.txt', 'w', encoding='utf-8').write('\n'.join(RES))
