# -*- coding: utf-8 -*-
"""T02 增量：icon-map.js 新增 "file" 图标（CRLF 二进制读写）
锚点：'package' 块结束后（L287 '    ),'）。
"""
PATH = r'D:\下载的文件\学习工作台\assets\icon-map.js'

def read_bytes(p):
    with open(p, 'rb') as f:
        return f.read()

data = read_bytes(PATH)
crlf0 = data.count(b'\r\n'); lf0 = data.count(b'\n')
assert lf0 - crlf0 == 0, 'icon-map.js loneLF != 0'
size0 = len(data)

old = (
    "    \"package\": svg(\r\n"
    "      '<path d=\"m7.5 4.27 9 5.15\"/>' +\r\n"
    "      '<path d=\"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z\"/>' +\r\n"
    "      '<path d=\"m3.3 7 8.7 5 8.7-5\"/>' +\r\n"
    "      '<path d=\"M12 22V12\"/>'\r\n"
    "    ),\r\n"
    "    \"inbox\": svg(\r\n"
)
new = (
    "    \"package\": svg(\r\n"
    "      '<path d=\"m7.5 4.27 9 5.15\"/>' +\r\n"
    "      '<path d=\"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z\"/>' +\r\n"
    "      '<path d=\"m3.3 7 8.7 5 8.7-5\"/>' +\r\n"
    "      '<path d=\"M12 22V12\"/>'\r\n"
    "    ),\r\n"
    "    /* R88-I 增量（2026-09-18）：文件图标（私聊「发送文件」菜单项 / 文件消息卡片）。\r\n"
    "       lucide 官方 file 路径，24x24 viewBox，仅 path 基础图元。 */\r\n"
    "    \"file\": svg(\r\n"
    "      '<path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\"/>' +\r\n"
    "      '<path d=\"M14 2v4a2 2 0 0 0 2 2h4\"/>'\r\n"
    "    ),\r\n"
    "    \"inbox\": svg(\r\n"
)
assert data.count(old.encode('utf-8')) == 1, 'package/inbox anchor count=%d' % data.count(old.encode('utf-8'))
data = data.replace(old.encode('utf-8'), new.encode('utf-8'), 1)

with open(PATH, 'wb') as f:
    f.write(data)

chk = read_bytes(PATH)
crlf2 = chk.count(b'\r\n'); lf2 = chk.count(b'\n')
assert lf2 - crlf2 == 0, 'loneLF changed'
assert chk.count(b'"file": svg(') == 1, 'file icon missing'
print('OK icon-map.js: %d -> %d B, CRLF=%d, loneLF=%d' % (size0, len(chk), crlf2, lf2 - crlf2))
