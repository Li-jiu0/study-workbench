# -*- coding: utf-8 -*-
"""R90 item3 - patch C: assets/xt-region.js (LF) .xtlp 矮屏截断修复."""
import os

P = 'D:/下载的文件/学习工作台/assets/xt-region.js'
raw = open(P, 'rb').read()
NL = b'\n'


def L(*lines):
    return NL.join([l if isinstance(l, bytes) else l.encode('utf-8') for l in lines]) + NL


# ---- C1: .xtlp 加 overflow:hidden 兜底 ----
old_root = b"      '.xtlp{position:fixed;inset:0;z-index:1200;background:#f5f7fb}'+\n"
new_root = b"      '.xtlp{position:fixed;inset:0;z-index:1200;background:#f5f7fb;overflow:hidden}'+\n"
assert raw.count(old_root) == 1, ('C1 anchor', raw.count(old_root))
out = raw.replace(old_root, new_root)

# ---- C2: .xtlp-list flex:1 1 0% -> flex:1 1 auto + min-height:180px ----
old_list = b"      '.xtlp-list{flex:1 1 0%;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;margin:10px 12px 0;background:#fff;border-radius:14px;border:1px solid #e6e9f0}'+\n"
new_list = (
    b"      /* R90 item3: flex:1 1 0% -> 1 1 auto + min-height:180px \xe4\xb8\x8b\xe9\x99\x90\xef\xbc\x88\xe7\x9f\xae\xe5\xb1\x8f\xe4\xb8\x8b\xe4\xbf\x9d\xe8\xaf\x81\xe5\x88\x97\xe8\xa1\xa8\xe5\x8f\xaf\xe7\x94\xa8\xef\xbc\x8c\xe9\x9d\xa0\xe8\x87\xaa\xe8\xba\xab overflow-y \xe6\xbb\x9a\xef\xbc\x89 */\n"
    b"      '.xtlp-list{flex:1 1 auto;min-height:180px;overflow-y:auto;-webkit-overflow-scrolling:touch;margin:10px 12px 0;background:#fff;border-radius:14px;border:1px solid #e6e9f0}'+\n"
)
assert out.count(old_list) == 1, ('C2 anchor', out.count(old_list))
out = out.replace(old_list, new_list)

# ---- C3: 在 .xtlp-cancel 规则后追加 @media (max-height:560px) 块 + 禁 clamp 说明 ----
old_tail = (
    b"      '.xtlp-cancel{flex:none;border:1px solid #e6e9f0;background:transparent;color:#6b7280;border-radius:10px;padding:10px 18px;font-size:14px;cursor:pointer}';\n"
)
new_tail = (
    b"      '.xtlp-cancel{flex:none;border:1px solid #e6e9f0;background:transparent;color:#6b7280;border-radius:10px;padding:10px 18px;font-size:14px;cursor:pointer}'+\n"
    b"      /* R90 item3\xef\xbc\x9a\xe7\x9f\xae\xe5\xb1\x8f\xef\xbc\x88\xe6\x80\xbb\xe9\xab\x98 \xe2\x89\xa4 560px\xef\xbc\x9a480/400 \xe9\x83\xbd\xe8\x90\xbd\xe8\xbf\x9b\xe6\x9d\xa5\xef\xbc\x89\xe6\x94\xb6\xe7\xb4\xa7\xe5\x9b\xba\xe5\xae\x9a\xe9\xab\x98\xe5\xba\xa6\xe5\x9d\x97\xef\xbc\x8c\n"
    b"         \xe9\x81\xbf\xe5\x85\x8d overhead(293px)+\xe5\x88\x97\xe8\xa1\xa8 foot \xe8\xb6\x85\xe5\x87\xba\xe8\xa7\x86\xe5\x8f\xa3\xe5\xaf\xbc\xe8\x87\xb4\xe6\x88\xaa\xe6\x96\xad\xe3\x80\x82\xe5\x85\xa8\xe5\x9b\xba\xe5\xae\x9a\xe5\x80\xbc + @media\xef\xbc\x8c\xe7\xa6\x81 clamp/min/max\xe3\x80\x82 */\n"
    b"      '@media (max-height:560px){'+\n"
    b"        '.xtlp-head{padding:7px 10px}'+\n"
    b"        '.xtlp-search{margin:7px 12px;padding:6px 10px}'+\n"
    b"        '.xtlp-map{height:110px}'+\n"
    b"        '.xtlp-list{margin:7px 12px 0}'+\n"
    b"        '.xtlp-foot{padding:8px 12px 10px}'+\n"
    b"      '}';\n"
)
assert out.count(old_tail) == 1, ('C3 anchor', out.count(old_tail))
out = out.replace(old_tail, new_tail)

# ---- C4: 同步 JS 里的 keep-alive resize 兜底常量（现 maxH=h-300）——
#      R89-B 的 JS 兜底只在「拿不到有效高度」时生效；矮屏现在由 CSS @media 负责，
#      JS 兜底常量维持不动（team-lead 明确 h-300 不动）。此处不改，仅确认存在。
assert out.count(b'listEl.style.maxHeight = maxH + \'px\';') == 2, 'C4 resize guard missing'

assert out != raw
open(P, 'wb').write(out)
b = open(P, 'rb').read()
crlf = b.count(b'\r\n'); lf = b.count(b'\n') - crlf; cr = b.count(b'\r') - crlf
print('C ok bytes', len(b), 'crlf', crlf, 'loneLF', lf, 'loneCR', cr)
print('overflow:hidden ->', b.count(b'z-index:1200;background:#f5f7fb;overflow:hidden'))
print('list flex auto ->', b.count(b'.xtlp-list{flex:1 1 auto;min-height:180px'))
print('media 560 ->', b.count(b'@media (max-height:560px){'))
print('map110 ->', b.count(b"'.xtlp-map{height:110px}'"))
