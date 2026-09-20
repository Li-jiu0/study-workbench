# -*- coding: utf-8 -*-
import io
with io.open(r'D:\下载的文件\学习工作台\四级词汇.html', encoding='utf-8') as f:
    html = f.read()
i = html.find('id="toast"')
print('=== toast ===')
print(html[max(0, i - 120):i + 200])
i2 = html.find('ai-input')
print('=== ai input area ===')
print(html[i2 - 250:i2 + 700])
