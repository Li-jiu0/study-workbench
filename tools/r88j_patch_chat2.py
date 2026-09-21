# -*- coding: utf-8 -*-
"""
R88-J/M7 第二部分 —— 私聊.html（CRLF）：注入 imUploadFile（可配置端点 + 类型分流 + 分类失败提示）。
纯前端上传器，供 M7「真传文件正文」使用（真正的消息落库在 chat-local.js，需另行授权）。
插入点：内联脚本 IIFE 内、boot() 之前。
用法：python tools/r88j_patch_chat2.py [--apply]
"""
import os
import sys

BASE = r"D:\下载的文件\学习工作台"
APPLY = ("--apply" in sys.argv)
HTML = os.path.join(BASE, r"私聊.html")
NL = "\r\n"


def to_lf(s): return s.replace("\r\n", "\n")
def to_nl(s): return to_lf(s).replace("\n", NL)


raw = open(HTML, "rb").read()
txt = to_lf(raw.decode("utf-8"))

A1 = (
    "  function boot() {\n"
    "    injectCss();\n"
)
assert txt.count(A1) == 1, "boot 锚点命中 %d" % txt.count(A1)

N1 = (
    "  /* ==================================================================\n"
    "     R88-J / M7：通用文件上传器 imUploadFile（可配置端点 + 类型分流 + 分类失败提示）\n"
    "     - 端点常量集中管理，便于后续统一替换（文档端点由另一线提供 /api/uploads/file）。\n"
    "     - 前端按 MIME/后缀分流：图片→image、视频→video、音频→voice、其余→file。\n"
    "     - 仅做「上传拿 URL」，不在此处落消息（消息落库在 chat-local.js；本文件不改它）。\n"
    "     ES2017：仅 var/function，无 ?. / ?? / 模板串。\n"
    "     ================================================================== */\n"
    "  var UPLOAD_EP = {\n"
    "    image: '/api/uploads',            // ≤8MB  JPG/PNG/WebP/GIF\n"
    "    imageChat: '/api/uploads/image',  // ≤5MB  JPG/PNG/WebP/GIF（聊天图，更严）\n"
    "    video: '/api/uploads/video',      // ≤50MB MP4/WebM\n"
    "    voice: '/api/uploads/voice',      // ≤2MB  webm/ogg/mp4/wav\n"
    "    file: '/api/uploads/file'         // ≤20MB pdf/docx/xlsx/pptx/zip/rar（另一线提供）\n"
    "  };\n"
    "  var UPLOAD_LIMIT = { image: 8 * 1048576, imageChat: 5 * 1048576, video: 50 * 1048576, voice: 2 * 1048576, file: 20 * 1048576 };\n"
    "\n"
    "  function imApiBase() { return (window.STUDY_API_BASE || 'http://110.42.134.62:8000'); }\n"
    "  function imAuthToken() { try { return localStorage.getItem('study_workbench_token') || ''; } catch (e) { return ''; } }\n"
    "\n"
    "  /** 按 MIME/后缀判定上传类别。 */\n"
    "  function imUploadKind(file) {\n"
    "    var t = String((file && file.type) || '').toLowerCase();\n"
    "    var n = String((file && file.name) || '').toLowerCase();\n"
    "    if (t.indexOf('image/') === 0 || /\\.(png|jpe?g|webp|gif)$/.test(n)) return 'image';\n"
    "    if (t.indexOf('video/') === 0 || /\\.(mp4|webm)$/.test(n)) return 'video';\n"
    "    if (t.indexOf('audio/') === 0 || /\\.(webm|ogg|m4a|wav|mp3)$/.test(n)) return 'voice';\n"
    "    return 'file';\n"
    "  }\n"
    "\n"
    "  /** 人性化大小（B/KB/MB）。 */\n"
    "  function imFmtSize(n) {\n"
    "    var s = Number(n) || 0;\n"
    "    if (s < 1024) return s + ' B';\n"
    "    if (s < 1048576) return (s / 1024).toFixed(1) + ' KB';\n"
    "    return (s / 1048576).toFixed(1) + ' MB';\n"
    "  }\n"
    "\n"
    "  function imUploadToast(msg, err) {\n"
    "    if (typeof window.showToast === 'function') { window.showToast(msg); return; }\n"
    "    if (typeof window.xtToast === 'function') { window.xtToast(err ? 'error' : 'info', msg); return; }\n"
    "  }\n"
    "\n"
    "  /**\n"
    "   * 上传单文件到对应端点。\n"
    "   * @param {File}     file\n"
    "   * @param {Function} cb   cb(err, res)  err=null 表示成功；res={url,kind}\n"
    "   *                        err = { code, kind, msg } 分类失败。\n"
    "   */\n"
    "  function imUploadFile(file, cb) {\n"
    "    var done = (typeof cb === 'function') ? cb : function () {};\n"
    "    if (!file) { done({ code: 'nofile', msg: '未选择文件' }, null); return; }\n"
    "    var kind = imUploadKind(file);\n"
    "    var ep = (kind === 'image') ? UPLOAD_EP.imageChat : UPLOAD_EP[kind];\n"
    "    var limit = UPLOAD_LIMIT[(kind === 'image') ? 'imageChat' : kind];\n"
    "    if (file.size && file.size > limit) {\n"
    "      done({ code: 'too_large', kind: kind, msg: '文件超过 ' + imFmtSize(limit) + '（当前 ' + imFmtSize(file.size) + '）' }, null);\n"
    "      return;\n"
    "    }\n"
    "    var token = imAuthToken();\n"
    "    if (!token) { done({ code: 'noauth', kind: kind, msg: '请先登录后再发送文件' }, null); return; }\n"
    "    var fd = new FormData();\n"
    "    fd.append('file', file);\n"
    "    fetch(imApiBase() + ep, {\n"
    "      method: 'POST',\n"
    "      headers: { 'Authorization': 'Bearer ' + token },\n"
    "      body: fd\n"
    "    }).then(function (r) {\n"
    "      if (r.status === 404) { throw { code: 'not_ready', kind: kind, msg: '服务端尚未开放该类型上传（端点未就绪）' }; }\n"
    "      if (r.status === 400) { throw { code: 'rejected', kind: kind, msg: '文件类型不被接受：' + kind }; }\n"
    "      if (!r.ok) { throw { code: 'http_' + r.status, kind: kind, msg: '上传失败（HTTP ' + r.status + '）' }; }\n"
    "      return r.json();\n"
    "    }).then(function (d) {\n"
    "      if (!d || !d.url) { done({ code: 'no_url', kind: kind, msg: '上传成功但未返回地址' }, null); return; }\n"
    "      done(null, { url: d.url, kind: kind });\n"
    "    }).catch(function (e) {\n"
    "      if (e && e.code) { done(e, null); return; }\n"
    "      done({ code: 'network', kind: kind, msg: '网络异常，上传失败' }, null);\n"
    "    });\n"
    "  }\n"
    "  window.imUploadFile = imUploadFile;\n"
    "  window.imUploadEndpoints = UPLOAD_EP;\n"
    "\n"
    "  function boot() {\n"
    "    injectCss();\n"
)
txt = txt.replace(A1, N1, 1)

out = to_nl(txt).encode("utf-8")
print("APPLY=%s" % APPLY)
print("私聊.html (+imUploadFile) before=%d after=%d delta=%+d" % (len(raw), len(out), len(out) - len(raw)))
if APPLY:
    open(HTML, "wb").write(out)
    b = open(HTML, "rb").read()
    crlf = b.count(b"\r\n"); lone_lf = b.count(b"\n") - crlf; lone_cr = b.count(b"\r") - crlf
    print("  [after] bytes=%d CRLF=%d loneLF=%d loneCR=%d" % (len(b), crlf, lone_lf, lone_cr))
