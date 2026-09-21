# -*- coding: utf-8 -*-
"""批次八：把申论 100 题注入前端。
1) 复制 shenlun-questions.json 到 assets/data/（供 fetch 使用）
2) 生成 assets/data/shenlun-inline.js（window.INLINE_SHENLUN_BANK，供 file:// 直接 script 引入）
3) 在 申论刷题.html 中插入该 script 标签（幂等）
"""
import os, json, io, sys, shutil, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

SRC = r'D:\下载的文件\2026申论100题8月版【推荐看这版】\_ocr_work\shenlun-questions.json'
TREE = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366'
DATA_DIR = os.path.join(TREE, 'assets', 'data')
PAGE = os.path.join(TREE, '申论刷题.html')
V = '20260915'

# 1) 读源
with open(SRC, encoding='utf-8') as f:
    qs = json.load(f)
print('源题数 =', len(qs))

# 字段规整：确保 id/type 存在，补 sub 便于页面筛选
for q in qs:
    q.setdefault('type', '申论')
    q.setdefault('subType', q.get('subType') or '未分类')
    q.setdefault('topic', q.get('topic') or '未分类')
    q.setdefault('book', q.get('book') or '')

os.makedirs(DATA_DIR, exist_ok=True)

# 2) JSON 副本
dst_json = os.path.join(DATA_DIR, 'shenlun-questions.json')
with open(dst_json, 'w', encoding='utf-8') as f:
    json.dump(qs, f, ensure_ascii=False, separators=(',', ':'))
print('写出', dst_json, os.path.getsize(dst_json), '字节')

# 3) 内联 JS（紧凑 JSON，转义 </ 防止破坏 script 标签）
compact = json.dumps(qs, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
js = ('/* 申论题库（批次八 2026-09-15 自动注入，勿手改）\n'
      '   源：2026申论100题8月版 · OCR 结构化，共 %d 题。\n'
      '   本文件与 assets/data/shenlun-questions.json 同源，供 file:// 直接引入。 */\n'
      'window.INLINE_SHENLUN_BANK = %s;\n' % (len(qs), compact))
dst_js = os.path.join(DATA_DIR, 'shenlun-inline.js')
with open(dst_js, 'w', encoding='utf-8') as f:
    f.write(js)
print('写出', dst_js, os.path.getsize(dst_js), '字节')

# 4) 页面插入 script 标签（幂等）
with open(PAGE, encoding='utf-8') as f:
    html = f.read()

TAG = '<script src="assets/data/shenlun-inline.js?v=%s"></script>' % V
if 'shenlun-inline.js' in html:
    print('页面已含 shenlun-inline.js，跳过插入（幂等）')
else:
    # 插到 assets/app.js 引入之后；找不到就插到 </head> 前
    m = re.search(r'(<script[^>]*src="assets/app\.js[^"]*"[^>]*></script>)', html)
    if m:
        pos = m.end()
        html = html[:pos] + '\n  ' + TAG + html[pos:]
        where = 'assets/app.js 之后'
    elif '</head>' in html:
        html = html.replace('</head>', '  ' + TAG + '\n</head>', 1)
        where = '</head> 之前'
    else:
        raise SystemExit('找不到插入点')
    with open(PAGE, 'w', encoding='utf-8') as f:
        f.write(html)
    print('已在页面插入 script 标签（位置：%s）' % where)

print('DONE')
