# -*- coding: utf-8 -*-
"""R90 item3 - patch D: 固定块锁 flex（防 flex-shrink 压缩 map/head/foot），使矮屏只剩 list 收缩."""
import os

P = 'D:/下载的文件/学习工作台/assets/xt-region.js'
raw = open(P, 'rb').read()

# head: 加 flex:0 0 auto
old_head = b"      '.xtlp-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-bottom:1px solid #e6e9f0}'+\n"
new_head = b"      '.xtlp-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-bottom:1px solid #e6e9f0}'+\n"
assert raw.count(old_head) == 1, ('D-head', raw.count(old_head))
out = raw.replace(old_head, new_head)

# search: 加 flex:0 0 auto
old_search = b"      '.xtlp-search{display:flex;align-items:center;gap:8px;margin:10px 12px;padding:9px 12px;border-radius:12px;background:#fff;border:1px solid #e6e9f0}'+\n"
new_search = b"      '.xtlp-search{flex:0 0 auto;display:flex;align-items:center;gap:8px;margin:10px 12px;padding:9px 12px;border-radius:12px;background:#fff;border:1px solid #e6e9f0}'+\n"
assert out.count(old_search) == 1, ('D-search', out.count(old_search))
out = out.replace(old_search, new_search)

# map: 加 flex:0 0 auto（防被压缩，保持 168/110 设计值）
old_map = b"      '.xtlp-map{position:relative;height:168px;margin:0 12px;border-radius:14px;overflow:hidden;'+\n"
new_map = b"      '.xtlp-map{flex:0 0 auto;position:relative;height:168px;margin:0 12px;border-radius:14px;overflow:hidden;'+\n"
assert out.count(old_map) == 1, ('D-map', out.count(old_map))
out = out.replace(old_map, new_map)

# foot: 加 flex:0 0 auto
old_foot = b"      '.xtlp-foot{padding:10px 12px 16px;display:flex;gap:10px;background:#fff;border-top:1px solid #e6e9f0}'+\n"
new_foot = b"      '.xtlp-foot{flex:0 0 auto;padding:10px 12px 16px;display:flex;gap:10px;background:#fff;border-top:1px solid #e6e9f0}'+\n"
assert out.count(old_foot) == 1, ('D-foot', out.count(old_foot))
out = out.replace(old_foot, new_foot)

# 同步尺寸: min-height 180 -> 182（clientHeight 因 1px×2 border 少 2px；用 182 保证 clientHeight>=180）
old_lh = b"'.xtlp-list{flex:1 1 auto;min-height:180px;"
new_lh = b"'.xtlp-list{flex:1 1 auto;min-height:182px;"
assert out.count(old_lh) == 1, ('D-lh', out.count(old_lh))
out = out.replace(old_lh, new_lh)

assert out != raw
open(P, 'wb').write(out)
b = open(P, 'rb').read()
crlf = b.count(b'\r\n'); lf = b.count(b'\n') - crlf; cr = b.count(b'\r') - crlf
print('D ok bytes', len(b), 'crlf', crlf, 'loneLF', lf, 'loneCR', cr)
print('head flex ->', b.count(b'.xtlp-head{flex:0 0 auto;'))
print('search flex ->', b.count(b'.xtlp-search{flex:0 0 auto;'))
print('map flex ->', b.count(b'.xtlp-map{flex:0 0 auto;'))
print('foot flex ->', b.count(b'.xtlp-foot{flex:0 0 auto;'))
print('minh182 ->', b.count(b'min-height:182px'))
