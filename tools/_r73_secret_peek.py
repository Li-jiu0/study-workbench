# -*- coding: utf-8 -*-
import io, re, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
targets = [
    (r"D:\下载的文件\学习工作台\assets\ai-config.js", 60),
    (r"D:\下载的文件\学习工作台\Gemini连接问题排查与处理方案.md", 72),
    (r"D:\下载的文件\学习工作台\需求文档-各平台模型状态更新.md", 131),
]
for path, ln in targets:
    with io.open(path, 'rb') as f:
        data = f.read()
    text = data.decode('utf-8')
    lines = text.split('\n')
    print("=====", path, "total lines:", len(lines), "EOL:", "CRLF" if b'\r\n' in data else "LF")
    for i in range(max(0, ln-3), min(len(lines), ln+2)):
        s = lines[i]
        # 打码中间部分再打印
        m = re.search(r'[A-Za-z0-9_\-\.]{16,}', s)
        shown = s
        if m:
            tok = m.group(0)
            shown = s.replace(tok, tok[:10] + "***LEN%d***" % len(tok))
        print("  L%d: %s" % (i+1, shown[:200]))
