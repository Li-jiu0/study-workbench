# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
for path, ln in [(r"D:\下载的文件\学习工作台\assets\ai-config.js", 50),
                 (r"D:\下载的文件\学习工作台\需求文档-各平台模型状态更新.md", 28)]:
    with io.open(path, 'rb') as f:
        data = f.read()
    lines = data.decode('utf-8').split('\n')
    print("=====", path, "EOL:", "CRLF" if b'\r\n' in data else "LF")
    for i in range(max(0, ln-2), min(len(lines), ln+1)):
        s = lines[i]
        m = re.search(r'[A-Za-z0-9_\-\.]{16,}', s)
        shown = s.replace(m.group(0), m.group(0)[:8] + "***LEN%d***" % len(m.group(0))) if m else s
        print("  L%d: %s" % (i+1, shown[:220]))
