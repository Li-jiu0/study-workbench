# -*- coding: utf-8 -*-
"""T02 增量：chat-local.js
1) renderMsgs 增加 kind==='file' 分支 → 文件卡片（图标 + 文件名 + 大小；无 emoji、不可跳转）
2) 新增 window.imSendFile(input)：本地元数据消息（kind:'file'，仅 {name,size,type}，不读 base64）
3) 会话列表预览 / 短标签 / AI 摘要：kind==='file' → '[文件]'
4) boot() 样式注入追加 .im-file-card 系列
"""
PATH = r'D:\下载的文件\学习工作台\assets\chat-local.js'

def read_bytes(p):
    with open(p, 'rb') as f:
        return f.read()

def assert_crlf(b):
    crlf = b.count(b'\r\n'); lf = b.count(b'\n'); lone = lf - crlf
    assert lone == 0, 'loneLF != 0 : %d' % lone
    return crlf, lf

def replace_once(data, old, new, label):
    cnt = data.count(old)
    assert cnt == 1, 'anchor [%s] count=%d (expect 1)' % (label, cnt)
    return data.replace(old, new, 1)

def replace_all(data, old, new, expect, label):
    cnt = data.count(old)
    assert cnt == expect, 'anchor-all [%s] count=%d (expect %d)' % (label, cnt, expect)
    return data.replace(old, new)

data = read_bytes(PATH)
crlf0, lf0 = assert_crlf(data)
size0 = len(data)

# ---- 1) renderMsgs：location 分支后加 file 分支 ----
old_render = (
    "      } else if (m.kind === 'location') {\r\n"
    "        /* R88-I（2026-09-18）：位置消息 —— 纯文字卡片，无坐标、不可跳转（设计 §7-7 硬规则）。\r\n"
    "           图标走 lucideIcon('map-pin')（零 emoji），content 仅存文字地址。 */\r\n"
    "        var locIcon = (typeof window.lucideIcon === 'function') ? window.lucideIcon('map-pin', 18) : '';\r\n"
    "        inner = '<div class=\"im-loc-card\">' +\r\n"
    "          '<span class=\"im-loc-ic\">' + locIcon + '</span>' +\r\n"
    "          '<span class=\"im-loc-text\">' + esc(m.content || '') + '</span>' +\r\n"
    "        '</div>' +\r\n"
    "          '<div class=\"im-mt\">' + timeStr + '</div>' + readTag;\r\n"
    "      } else {\r\n"
)
new_render = (
    "      } else if (m.kind === 'location') {\r\n"
    "        /* R88-I（2026-09-18）：位置消息 —— 纯文字卡片，无坐标、不可跳转（设计 §7-7 硬规则）。\r\n"
    "           图标走 lucideIcon('map-pin')（零 emoji），content 仅存文字地址。 */\r\n"
    "        var locIcon = (typeof window.lucideIcon === 'function') ? window.lucideIcon('map-pin', 18) : '';\r\n"
    "        inner = '<div class=\"im-loc-card\">' +\r\n"
    "          '<span class=\"im-loc-ic\">' + locIcon + '</span>' +\r\n"
    "          '<span class=\"im-loc-text\">' + esc(m.content || '') + '</span>' +\r\n"
    "        '</div>' +\r\n"
    "          '<div class=\"im-mt\">' + timeStr + '</div>' + readTag;\r\n"
    "      } else if (m.kind === 'file') {\r\n"
    "        /* R88-I 增量（2026-09-18）：文件消息 —— 本地元数据卡片（文件名 + 大小），无 emoji、不可跳转。\r\n"
    "           ❗不读文件内容（不落 base64），仅存 name/size/type 元数据，避免撑爆 localStorage。 */\r\n"
    "        var fileIcon = (typeof window.lucideIcon === 'function') ? window.lucideIcon('file', 20) : '';\r\n"
    "        var fname = m.name || m.content || '文件';\r\n"
    "        var fsize = (typeof m.size === 'number' && m.size >= 0) ? imFormatFileSize(m.size) : '';\r\n"
    "        inner = '<div class=\"im-file-card\">' +\r\n"
    "          '<span class=\"im-file-ic\">' + fileIcon + '</span>' +\r\n"
    "          '<span class=\"im-file-meta\">' +\r\n"
    "            '<span class=\"im-file-name\">' + esc(fname) + '</span>' +\r\n"
    "            (fsize ? '<span class=\"im-file-size\">' + esc(fsize) + '</span>' : '') +\r\n"
    "          '</span>' +\r\n"
    "        '</div>' +\r\n"
    "          '<div class=\"im-mt\">' + timeStr + '</div>' + readTag;\r\n"
    "      } else {\r\n"
)
data = replace_once(data, old_render.encode('utf-8'), new_render.encode('utf-8'), 'renderMsgs file branch')

# ---- 2) 新增 imFormatFileSize + window.imSendFile（插在 imSendLocation 之后）----
old_anchor = (
    "    triggerAiReply('发送了位置：' + t);\r\n"
    "  };\r\n"
    "\r\n"
    "  window.imSwitchTab = function (tab) {\r\n"
)
new_iface = (
    "    triggerAiReply('发送了位置：' + t);\r\n"
    "  };\r\n"
    "\r\n"
    "  /* R88-I 增量（2026-09-18）：文件大小人性化（B/KB/MB）。 */\r\n"
    "  function imFormatFileSize(n) {\r\n"
    "    var s = Number(n) || 0;\r\n"
    "    if (s < 1024) return s + ' B';\r\n"
    "    if (s < 1024 * 1024) return (s / 1024).toFixed(1) + ' KB';\r\n"
    "    return (s / 1024 / 1024).toFixed(1) + ' MB';\r\n"
    "  }\r\n"
    "\r\n"
    "  /* R88-I 增量：发送文件消息（本地元数据卡片，kind:'file'）。\r\n"
    "     ❗设计取舍：本批不动服务端，无通用文件上传接口（仅有 /api/uploads/image|voice），\r\n"
    "        故文件消息【只发元数据 name/size/type】，不读文件内容、不落 base64、不写 localStorage 正文，\r\n"
    "        避免大文件撑爆 localStorage（任务书硬约束）。接收侧展示为「文件名 + 大小」卡片，不含可下载正文。\r\n"
    "     与 imSendImage 的适配点一致：输入为 file input 元素。 */\r\n"
    "  var MAX_FILE_BYTES = 20 * 1024 * 1024;\r\n"
    "  window.imSendFile = function (input) {\r\n"
    "    if (!input || !input.files || !input.files[0]) return;\r\n"
    "    var file = input.files[0];\r\n"
    "    try { input.value = ''; } catch (e) { /* 老 WebView 重置失败不影响发送 */ }\r\n"
    "    imSendFileMeta(file);\r\n"
    "  };\r\n"
    "\r\n"
    "  function imSendFileMeta(file) {\r\n"
    "    if (!file) return;\r\n"
    "    if (!S.group && !S.peer) { toast('请先选择一个会话再发送文件'); return; }\r\n"
    "    if (file.size && file.size > MAX_FILE_BYTES) { toast('文件超过 20MB，暂不支持发送'); return; }\r\n"
    "    if (S.group) { toast('群聊暂不支持发送文件'); return; }\r\n"
    "    if (!S.peer) return;\r\n"
    "    var name = String(file.name || '文件');\r\n"
    "    var size = (typeof file.size === 'number') ? file.size : 0;\r\n"
    "    var ftype = String(file.type || '');\r\n"
    "    var now = Date.now();\r\n"
    "    var uid = genMsgId();\r\n"
    "    var rec = { id: uid, senderId: S.myId, content: name, kind: 'file', name: name, size: size, type: ftype, time: now };\r\n"
    "    S.msgs.push(rec);\r\n"
    "\r\n"
    "    var data = loadData();\r\n"
    "    if (!data.messages[S.peer.id]) data.messages[S.peer.id] = [];\r\n"
    "    data.messages[S.peer.id].push({ id: uid, senderId: S.myId, content: name, kind: 'file', name: name, size: size, type: ftype, time: now });\r\n"
    "    if (!data.chats[S.peer.id]) data.chats[S.peer.id] = {};\r\n"
    "    data.chats[S.peer.id].last = '[文件] ' + name;\r\n"
    "    data.chats[S.peer.id].time = now;\r\n"
    "    data.chats[S.peer.id].nickname = S.peer.nickname;\r\n"
    "    data.chats[S.peer.id].avatar = S.peer.avatar;\r\n"
    "    saveData(data);\r\n"
    "\r\n"
    "    renderMsgs();\r\n"
    "    loadChats();\r\n"
    "\r\n"
    "    // 服务器好友：仅同步元数据文本（无二进制），失败静默（本地卡片仍在）\r\n"
    "    if (S.peer.isServer) {\r\n"
    "      var token = getToken();\r\n"
    "      if (token) {\r\n"
    "        fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages', {\r\n"
    "          method: 'POST',\r\n"
    "          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },\r\n"
    "          body: JSON.stringify({ content: '[文件] ' + name, kind: 'text' })\r\n"
    "        })\r\n"
    "        .then(function (r) { return r.json(); })\r\n"
    "        .then(function () { fetchPeerMsgs(true); })\r\n"
    "        .catch(function () {});\r\n"
    "      }\r\n"
    "      return;\r\n"
    "    }\r\n"
    "    triggerAiReply('发送了文件：' + name);\r\n"
    "  }\r\n"
    "\r\n"
    "  window.imSwitchTab = function (tab) {\r\n"
)
data = replace_once(data, old_anchor.encode('utf-8'), new_iface.encode('utf-8'), 'imSendFile insert')

# ---- 3a) 会话列表预览判定：image||voice||location → 加 file ----
old_p1 = "    var txt = (m.kind === 'image' || m.kind === 'voice' || m.kind === 'location') ? '' : (m.content || '');\r\n"
new_p1 = "    var txt = (m.kind === 'image' || m.kind === 'voice' || m.kind === 'location' || m.kind === 'file') ? '' : (m.content || '');\r\n"
data = replace_all(data, old_p1.encode('utf-8'), new_p1.encode('utf-8'), 2, 'preview txt')

# ---- 3b) 预览末条文案：加 file → '[文件]' ----
old_p2 = "        ? (lastReal.kind === 'image' ? '[图片]' : (lastReal.kind === 'voice' ? '[语音]' : (lastReal.kind === 'location' ? '[位置]' : (lastReal.content || ''))))\r\n"
new_p2 = "        ? (lastReal.kind === 'image' ? '[图片]' : (lastReal.kind === 'voice' ? '[语音]' : (lastReal.kind === 'location' ? '[位置]' : (lastReal.kind === 'file' ? '[文件]' : (lastReal.content || '')))))\r\n"
data = replace_all(data, old_p2.encode('utf-8'), new_p2.encode('utf-8'), 2, 'preview last label')

# ---- 3c) 短标签 ----
old_k = "    if (kind === 'location') return '[位置]';\r\n"
new_k = "    if (kind === 'location') return '[位置]';\r\n    if (kind === 'file') return '[文件]';\r\n"
data = replace_once(data, old_k.encode('utf-8'), new_k.encode('utf-8'), 'short label')

# ---- 3d) AI 上下文摘要 ----
old_ai = "      return { role: m.senderId === S.myId ? 'user' : 'assistant', content: m.kind === 'image' ? '[图片]' : (m.kind === 'location' ? '[位置] ' + (m.content || '') : m.content) };\r\n"
new_ai = "      return { role: m.senderId === S.myId ? 'user' : 'assistant', content: m.kind === 'image' ? '[图片]' : (m.kind === 'location' ? '[位置] ' + (m.content || '') : (m.kind === 'file' ? '[文件] ' + (m.name || m.content || '') : m.content)) };\r\n"
data = replace_once(data, old_ai.encode('utf-8'), new_ai.encode('utf-8'), 'ai summary')

# ---- 4) boot() CSS：file-card ----
old_css = "      '.im-loc-text{font-size:14px;line-height:1.5;color:var(--text,#2D3436);word-break:break-word;white-space:pre-wrap}';\r\n"
new_css = (
    "      '.im-loc-text{font-size:14px;line-height:1.5;color:var(--text,#2D3436);word-break:break-word;white-space:pre-wrap}' +\r\n"
    "      /* R88-I 增量（2026-09-18）：文件消息卡片（元数据卡，无 emoji、不可跳转）。 */\r\n"
    "      '.im-file-card{display:inline-flex;align-items:center;gap:10px;max-width:240px;padding:10px 12px;background:var(--card,#fff);border:1px solid var(--border,#eee);border-radius:10px}' +\r\n"
    "      '.im-file-ic{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;color:var(--primary,#5B8DEF)}' +\r\n"
    "      '.im-file-ic svg{width:20px;height:20px;display:block}' +\r\n"
    "      '.im-file-meta{display:inline-flex;flex-direction:column;min-width:0}' +\r\n"
    "      '.im-file-name{font-size:14px;line-height:1.4;color:var(--text,#2D3436);word-break:break-all}' +\r\n"
    "      '.im-file-size{font-size:12px;line-height:1.4;color:var(--text-secondary,#8a8f99);margin-top:2px}';\r\n"
)
data = replace_once(data, old_css.encode('utf-8'), new_css.encode('utf-8'), 'file css')

with open(PATH, 'wb') as f:
    f.write(data)

chk = read_bytes(PATH)
crlf2, lf2 = assert_crlf(chk)
assert chk.count(b'window.imSendFile') == 1, 'imSendFile missing'
assert chk.count(b"m.kind === 'file'") >= 1, 'file render branch missing'
assert chk.count(b'.im-file-card') == 1, 'im-file-card css missing'
assert chk.count(b'imFormatFileSize') == 2, 'imFormatFileSize refs != 2'
open('tools/t02b_chatlocal_verify.txt','w',encoding='utf-8').write(
    'OK chat-local.js: %d -> %d B, CRLF=%d, loneLF=%d\n' % (size0, len(chk), crlf2, lf2 - crlf2))
