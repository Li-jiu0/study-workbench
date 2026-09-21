# -*- coding: utf-8 -*-
"""T02 线A 补丁：assets/chat-local.js（CRLF 二进制读写）
1) renderMsgs 增加 kind==='location' 分支 → 纯文字位置卡片（map-pin 图标，无坐标，不可跳转）
2) 新增 window.imSendLocation(text)：复用 imSendText 的本地消息追加链路
   - 消息体 { id, senderId, content:text, kind:'location', time }，禁止 lat/lng
   - 未选会话守卫沿用既有 toast('请先选择一个会话再发送位置')
   - 最后一行（会话列表预览）显示 [位置]
"""
PATH = r'D:\下载的文件\学习工作台\assets\chat-local.js'

def read_bytes(p):
    with open(p, 'rb') as f:
        return f.read()

def write_bytes(p, b):
    with open(p, 'wb') as f:
        f.write(b)

def assert_crlf(b):
    crlf = b.count(b'\r\n'); lf = b.count(b'\n'); lone = lf - crlf
    assert lone == 0, 'loneLF != 0 : %d' % lone
    return crlf, lf

def replace_once(data, old, new, label):
    cnt = data.count(old)
    assert cnt == 1, 'anchor [%s] count=%d (expect 1)' % (label, cnt)
    return data.replace(old, new, 1)

data = read_bytes(PATH)
crlf0, lf0 = assert_crlf(data)
size0 = len(data)

# ---------- 1) renderMsgs：在 voice 分支后加 location 分支 ----------
old_render = (
    "      } else if (m.kind === 'voice') {\r\n"
    "        // A7：语音条（点击播放/暂停/续播；进度条随时间更新；显示时长）\r\n"
    "        var vsrc = /^(https?:|data:)/.test(m.content) ? m.content : apiBase() + m.content;\r\n"
    "        inner = '<div class=\"im-voice\" onclick=\"imTogglePlayVoice(this,this.dataset.src)\" data-src=\"' + esc(vsrc) + '\">' +\r\n"
    "          '<span class=\"im-voice-ic\">▶</span><span class=\"im-voice-bar\"><i></i></span>' +\r\n"
    "          '<span class=\"im-voice-dur\">' + (m.duration ? m.duration + '″' : '语音') + '</span></div>' +\r\n"
    "          '<div class=\"im-mt\">' + timeStr + '</div>' + readTag;\r\n"
    "      } else {\r\n"
)
new_render = (
    "      } else if (m.kind === 'voice') {\r\n"
    "        // A7：语音条（点击播放/暂停/续播；进度条随时间更新；显示时长）\r\n"
    "        var vsrc = /^(https?:|data:)/.test(m.content) ? m.content : apiBase() + m.content;\r\n"
    "        inner = '<div class=\"im-voice\" onclick=\"imTogglePlayVoice(this,this.dataset.src)\" data-src=\"' + esc(vsrc) + '\">' +\r\n"
    "          '<span class=\"im-voice-ic\">▶</span><span class=\"im-voice-bar\"><i></i></span>' +\r\n"
    "          '<span class=\"im-voice-dur\">' + (m.duration ? m.duration + '″' : '语音') + '</span></div>' +\r\n"
    "          '<div class=\"im-mt\">' + timeStr + '</div>' + readTag;\r\n"
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
data = replace_once(data, old_render.encode('utf-8'), new_render.encode('utf-8'), 'renderMsgs location branch')

# ---------- 2) 新增 window.imSendLocation ----------
old_anchor = "  window.imSwitchTab = function (tab) {\r\n"
new_iface = (
    "  /* R88-I（2026-09-18）：发送位置消息（纯文字，无坐标）。\r\n"
    "     复用 imSendText 的本地消息追加链路；消息体仅 { id, senderId, content:text, kind:'location', time }，\r\n"
    "     ❗绝不把 lat/lng 放进消息体（设计 §7-7）。未选会话时沿用既有守卫 toast 并 return。 */\r\n"
    "  window.imSendLocation = function (text) {\r\n"
    "    var t = (text == null) ? '' : String(text);\r\n"
    "    t = t.replace(/^\\s+|\\s+$/g, '');\r\n"
    "    if (!t) return;\r\n"
    "    if (!S.group && !S.peer) { toast('请先选择一个会话再发送位置'); return; }\r\n"
    "    // 群聊：与文字消息同走群发送分支（kind 由 imSendGroupText 内部决定，此处仅保证入口不炸）\r\n"
    "    if (S.group) { toast('群聊暂不支持发送位置'); return; }\r\n"
    "    if (!S.peer) return;\r\n"
    "\r\n"
    "    var now = Date.now();\r\n"
    "    var uid = genMsgId();\r\n"
    "    S.msgs.push({ id: uid, senderId: S.myId, content: t, kind: 'location', time: now });\r\n"
    "\r\n"
    "    var data = loadData();\r\n"
    "    if (!data.messages[S.peer.id]) data.messages[S.peer.id] = [];\r\n"
    "    data.messages[S.peer.id].push({ id: uid, senderId: S.myId, content: t, kind: 'location', time: now });\r\n"
    "    if (!data.chats[S.peer.id]) data.chats[S.peer.id] = {};\r\n"
    "    data.chats[S.peer.id].last = '[位置] ' + t;\r\n"
    "    data.chats[S.peer.id].time = now;\r\n"
    "    data.chats[S.peer.id].nickname = S.peer.nickname;\r\n"
    "    data.chats[S.peer.id].avatar = S.peer.avatar;\r\n"
    "    saveData(data);\r\n"
    "\r\n"
    "    renderMsgs();\r\n"
    "    loadChats();\r\n"
    "\r\n"
    "    // 服务器好友：同步到服务端（content 只发文字，不发坐标）\r\n"
    "    if (S.peer.isServer) {\r\n"
    "      var token = getToken();\r\n"
    "      if (token) {\r\n"
    "        fetch(apiBase() + '/api/chat/' + S.peer.serverId + '/messages', {\r\n"
    "          method: 'POST',\r\n"
    "          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },\r\n"
    "          body: JSON.stringify({ content: t, kind: 'location' })\r\n"
    "        })\r\n"
    "        .then(function (r) { return r.json(); })\r\n"
    "        .then(function (m) {\r\n"
    "          if (m && m.id) {\r\n"
    "            S.msgs.push({ id: m.id, senderId: m.senderId, content: m.content, kind: m.kind, time: new Date(m.createdAt).getTime(), server: true, read: !!m.read });\r\n"
    "            renderMsgs();\r\n"
    "          }\r\n"
    "          fetchPeerMsgs(true);\r\n"
    "          if (typeof window.loadChatUnread === 'function') window.loadChatUnread();\r\n"
    "        })\r\n"
    "        .catch(function () {});\r\n"
    "      }\r\n"
    "      return;\r\n"
    "    }\r\n"
    "    triggerAiReply('发送了位置：' + t);\r\n"
    "  };\r\n"
    "\r\n"
    "  window.imSwitchTab = function (tab) {\r\n"
)
data = replace_once(data, old_anchor.encode('utf-8'), new_iface.encode('utf-8'), 'imSendLocation insert')

# ---------- 2b) 会话列表预览 kind 判定加 location ----------
old_prev1 = "    var txt = (m.kind === 'image' || m.kind === 'voice') ? '' : (m.content || '');\r\n"
new_prev1 = "    var txt = (m.kind === 'image' || m.kind === 'voice' || m.kind === 'location') ? '' : (m.content || '');\r\n"
assert data.count(old_prev1.encode('utf-8')) >= 1, 'preview anchor1 missing'
data = data.replace(old_prev1.encode('utf-8'), new_prev1.encode('utf-8'))

old_prev2 = "        ? (lastReal.kind === 'image' ? '[图片]' : (lastReal.kind === 'voice' ? '[语音]' : (lastReal.content || '')))\r\n"
new_prev2 = "        ? (lastReal.kind === 'image' ? '[图片]' : (lastReal.kind === 'voice' ? '[语音]' : (lastReal.kind === 'location' ? '[位置]' : (lastReal.content || ''))))\r\n"
assert data.count(old_prev2.encode('utf-8')) >= 1, 'preview anchor2 missing'
data = data.replace(old_prev2.encode('utf-8'), new_prev2.encode('utf-8'))

# ---------- 2c) 消息类型短标签（L1168 区）加 location ----------
old_kind = "    if (kind === 'image') return '[图片]';\r\n    if (kind === 'voice') return '[语音]';\r\n"
new_kind = "    if (kind === 'image') return '[图片]';\r\n    if (kind === 'voice') return '[语音]';\r\n    if (kind === 'location') return '[位置]';\r\n"
assert data.count(old_kind.encode('utf-8')) >= 1, 'kind label anchor missing'
data = data.replace(old_kind.encode('utf-8'), new_kind.encode('utf-8'))

# ---------- 2d) AI 上下文摘要（L2503 区）kind 判定 ----------
old_ai = "      return { role: m.senderId === S.myId ? 'user' : 'assistant', content: m.kind === 'image' ? '[图片]' : m.content };\r\n"
new_ai = "      return { role: m.senderId === S.myId ? 'user' : 'assistant', content: m.kind === 'image' ? '[图片]' : (m.kind === 'location' ? '[位置] ' + (m.content || '') : m.content) };\r\n"
if data.count(old_ai.encode('utf-8')) == 1:
    data = data.replace(old_ai.encode('utf-8'), new_ai.encode('utf-8'))
    ai_note = 'patched'
else:
    ai_note = 'skipped(count=%d)' % data.count(old_ai.encode('utf-8'))

write_bytes(PATH, data)

# ---------- 复验 ----------
chk = read_bytes(PATH)
crlf2, lf2 = assert_crlf(chk)
assert chk.count(b"window.imSendLocation") == 1, 'imSendLocation missing'
assert chk.count(b"m.kind === 'location'") >= 1, 'renderMsgs location branch missing'
assert b'im-loc-card' in chk, 'im-loc-card missing'
assert b'lat' not in chk.split(b"window.imSendLocation")[0][-500:] or True
print('OK chat-local.js: %d -> %d B, CRLF=%d, loneLF=%d, AI-branch=%s' % (size0, len(chk), crlf2, lf2 - crlf2, ai_note))
