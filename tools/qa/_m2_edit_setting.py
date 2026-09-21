# -*- coding: utf-8 -*-
"""R88-M2 编辑1：设置.html 把 xt-update.js 的 <script> 从 config.js 之前移到其后。
CRLF 保留：按字节处理。
"""
import os
os.chdir(r"D:/下载的文件/学习工作台")
p = "设置.html"
b = open(p, "rb").read()
orig = len(b)

tag = b'<script src="assets/xt-update.js?v=20260918c" defer></script>'
cfg = b'<script src="assets/config.js?v=20260916O" defer></script>'

# 计数
assert b.count(tag) == 1, "xt-update tag count=%d" % b.count(tag)
assert b.count(cfg) == 1, "config tag count=%d" % b.count(cfg)

# 行级：分离 CRLF 行
lines = b.split(b"\r\n")
# 找到两行索引
i_up = [i for i, l in enumerate(lines) if l.strip() == tag][0]
i_cfg = [i for i, l in enumerate(lines) if l.strip() == cfg][0]
print("before: idx_up=%d idx_cfg=%d total_lines=%d" % (i_up, i_cfg, len(lines)))
assert i_up < i_cfg, "unexpected order"

# 删除 xt-update 行，插入到 cfg 行之后
up_line = lines[i_up]
del lines[i_up]
# cfg 索引因删除可能左移 1
i_cfg2 = [i for i, l in enumerate(lines) if l.strip() == cfg][0]
lines.insert(i_cfg2 + 1, up_line)

out = b"\r\n".join(lines)
# 校验：xt-update 行现在在 config 行之后
i_up2 = [i for i, l in enumerate(out.split(b"\r\n")) if l.strip() == tag][0]
i_cfg3 = [i for i, l in enumerate(out.split(b"\r\n")) if l.strip() == cfg][0]
assert i_up2 == i_cfg3 + 1, "move failed: up=%d cfg=%d" % (i_up2, i_cfg3)

open(p, "wb").write(out)
nb = open(p, "rb").read()
print("after bytes=%d (orig %d) delta=%d" % (len(nb), orig, len(nb) - orig))
cr = nb.count(b"\r"); lf = nb.count(b"\n"); crlf = nb.count(b"\r\n")
print("CR=%d LF=%d CRLF=%d" % (cr, lf, crlf))
print("ORDER_OK xt-update at line %d, config at line %d (1-based)" % (i_up2 + 1, i_cfg3 + 1))
