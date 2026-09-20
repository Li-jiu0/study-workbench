# -*- coding: utf-8 -*-
"""T02 线A 补丁2：chat-local.js boot() 样式注入追加 .im-loc-card（位置卡片）"""
PATH = r'D:\下载的文件\学习工作台\assets\chat-local.js'

def read_bytes(p):
    with open(p, 'rb') as f:
        return f.read()

data = read_bytes(PATH)
crlf0 = data.count(b'\r\n'); lf0 = data.count(b'\n')
assert lf0 - crlf0 == 0, 'loneLF != 0'
size0 = len(data)

old = "      'body.reduce-motion .im-tn{transition:none}';\r\n"
new = (
    "      'body.reduce-motion .im-tn{transition:none}' +\r\n"
    "      /* R88-I（2026-09-18）：私聊位置消息卡片（纯文字，无坐标，不可跳转）。样式随脚本注入，不改 common.css。 */\r\n"
    "      '.im-loc-card{display:inline-flex;align-items:flex-start;gap:8px;max-width:240px;padding:8px 12px;background:var(--card,#fff);border:1px solid var(--border,#eee);border-radius:10px}' +\r\n"
    "      '.im-loc-ic{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;color:var(--primary,#5B8DEF);margin-top:1px}' +\r\n"
    "      '.im-loc-ic svg{width:18px;height:18px;display:block}' +\r\n"
    "      '.im-loc-text{font-size:14px;line-height:1.5;color:var(--text,#2D3436);word-break:break-word;white-space:pre-wrap}';\r\n"
)
assert data.count(old.encode('utf-8')) == 1, 'style anchor count=%d' % data.count(old.encode('utf-8'))
data = data.replace(old.encode('utf-8'), new.encode('utf-8'), 1)

with open(PATH, 'wb') as f:
    f.write(data)

chk = read_bytes(PATH)
crlf2 = chk.count(b'\r\n'); lf2 = chk.count(b'\n')
assert lf2 - crlf2 == 0, 'loneLF changed'
assert chk.count(b'.im-loc-card') == 1, 'im-loc-card missing'
assert chk.count(b'.im-loc-ic') == 1
print('OK chat-local.js css: %d -> %d B, CRLF=%d, loneLF=%d' % (size0, len(chk), crlf2, lf2 - crlf2))
