# -*- coding: utf-8 -*-
"""R88-M1 补丁 C（server/main.py）：CORS 暴露 X-Ai-Model-Used。行尾 CRLF。"""
import sys

P = r"D:\下载的文件\学习工作台\server\main.py"


def read_text(path):
    b = open(path, "rb").read()
    cr = b.count(b"\r")
    crlf = b.count(b"\r\n")
    if cr != crlf:
        print("FATAL: 非纯 CRLF（CR=%d CRLF=%d）" % (cr, crlf))
        sys.exit(2)
    return b.decode("utf-8")


def write_text(path, text):
    open(path, "wb").write(text.encode("utf-8"))
    b = open(path, "rb").read()
    cr = b.count(b"\r")
    crlf = b.count(b"\r\n")
    if cr != crlf:
        print("FATAL: 行尾污染")
        sys.exit(4)
    return len(b)


t = read_text(P)
OLD = (
    "app.add_middleware(\r\n"
    "    CORSMiddleware,\r\n"
    '    allow_origins=["*"],\r\n'
    '    allow_methods=["*"],\r\n'
    '    allow_headers=["*"],\r\n'
    ")"
)
NEW = (
    "app.add_middleware(\r\n"
    "    CORSMiddleware,\r\n"
    '    allow_origins=["*"],\r\n'
    '    allow_methods=["*"],\r\n'
    '    allow_headers=["*"],\r\n'
    "    # R88-M1：APK（file:// 跨域）下前端需读取 /api/ai/chat 的 X-Ai-Model-Used 响应头，\r\n"
    "    # 才能如实记账「实际执行的模型名」；不暴露的话跨域响应头对 JS 不可见。\r\n"
    '    expose_headers=["X-Ai-Model-Used"],\r\n'
    ")"
)
c = t.count(OLD)
if c != 1:
    print("FATAL: 锚点 %d 次" % c)
    sys.exit(3)
t = t.replace(OLD, NEW, 1)
print("OK  [cors-expose]")
n = write_text(P, t)
print("    main.py bytes=%d" % n)
print("PATCH-C(main.py) done.")
