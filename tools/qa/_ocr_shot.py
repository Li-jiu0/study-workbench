# -*- coding: utf-8 -*-
"""1) 找出最近 25 分钟内新出现的图片（用户刚粘贴的截图）
   2) 若有 OCR 能力则直接识别图中文字，用来判断是哪一页"""
import os, time, io

ROOTS = [r'C:\Users\ATM\.workbuddy\blobs', r'C:\Users\ATM\AppData\Local\Temp',
         r'C:\Users\ATM\Downloads', r'C:\Users\ATM\Desktop', r'C:\Users\ATM\Pictures',
         r'D:\下载的文件\学习工作台', r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-88ed6fb3']
now = time.time()
WIN = 25 * 60
hits = []
for rt in ROOTS:
    if not os.path.isdir(rt):
        continue
    for dp, dn, fn in os.walk(rt):
        if os.sep + '.git' in dp or 'node_modules' in dp:
            continue
        if dp[len(rt):].count(os.sep) > 4:
            dn[:] = []
            continue
        for f in fn:
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.bmp')):
                p = os.path.join(dp, f)
                try:
                    m = max(os.path.getmtime(p), os.path.getctime(p))
                except Exception:
                    continue
                if now - m <= WIN:
                    hits.append((m, p, os.path.getsize(p)))
hits.sort(reverse=True)

L = ['最近 25 分钟内新增图片（前 20 条）：']
for m, p, sz in hits[:20]:
    L.append('  %s  %8d  %s' % (time.strftime('%m-%d %H:%M:%S', time.localtime(m)), sz, p))

L.append('')
L.append('=== OCR 能力检查 ===')
try:
    import pytesseract
    L.append('pytesseract: 可用')
except Exception as e:
    L.append('pytesseract: 不可用 (%s)' % type(e).__name__)
try:
    from PIL import Image
    L.append('PIL/Pillow: 可用')
except Exception as e:
    L.append('PIL/Pillow: 不可用 (%s)' % type(e).__name__)

L.append('')
L.append('=== 若可 OCR，识别最新一张图 ===')
if hits:
    target = hits[0][1]
    L.append('目标: ' + target)
    try:
        from PIL import Image
        import pytesseract
        txt = pytesseract.image_to_string(Image.open(target), lang='chi_sim')
        L.append(txt[:3000])
    except Exception as e:
        L.append('OCR 失败: %s: %s' % (type(e).__name__, e))

io.open(r'D:\下载的文件\学习工作台\tools\qa\_ocr_shot_out.txt', 'w', encoding='utf-8').write('\n'.join(L))
print('OCR_DONE')
