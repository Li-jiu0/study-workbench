# -*- coding: utf-8 -*-
import json, io, re

TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\言语理解_题本\2027言语理解（题本）.questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027言语理解（解析）\2027言语理解（解析）_解析.json"
tb = json.load(io.open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(io.open(JIEXI, encoding='utf-8'))['items']

def opt_score(t, it):
    """题本4个选项的前5字, 出现在解析正文里的个数(0-4)"""
    a = str(it.get('analysis') or '')
    c = 0
    for v in (t.get('options') or {}).values():
        s = re.sub(r'\s+', '', str(v or ''))[:5]
        if len(s) >= 3 and s in a.replace('\n', '').replace(' ', ''): c += 1
    return c

def stem_score(t, it):
    a = re.sub(r'\s+', '', str(it.get('analysis') or ''))
    s = re.sub(r'\s+', '', ''.join(t.get('stem') or []))
    if len(s) < 20: return 0
    # 题干 6-gram 在解析中出现的比例
    hit = sum(1 for k in range(0, len(s) - 6, 12) if s[k:k+6] in a)
    return hit / max(1, len(range(0, len(s) - 6, 12)))

N = len(jx)
print('窗口(50题) 内 选项命中均值 / 题干6gram命中均值, 以及不同 lag 的选项命中')
print('%-8s %-6s %-6s | lag:-3  -2  -1   0   +1  +2  +3' % ('start', 'opt', 'stem'))
for s in range(0, N - 50, 50):
    o = sum(opt_score(tb[i], jx[i]) for i in range(s, s + 50)) / 50
    st = sum(stem_score(tb[i], jx[i]) for i in range(s, s + 50)) / 50
    lags = []
    for lag in (-3, -2, -1, 0, 1, 2, 3):
        v = []
        for i in range(s, s + 50):
            j = i + lag
            if 0 <= j < N: v.append(opt_score(tb[i], jx[j]))
        lags.append(round(sum(v) / max(len(v), 1), 2))
    print('%-8d %-6.2f %-6.2f | %s' % (s, o, st, lags))

print('\n--- 区段精查: 380-420 ---')
for i in range(380, 420):
    t = tb[i]
    print('tb%-4d [%s] %s' % (i, t.get('answer'), re.sub(r'\s+', '', ''.join(t.get('stem') or []))[:36]))
for i in range(380, 420):
    print('jx%-4d [%s] %s' % (i, str(jx[i].get('answer') or '')[:1], re.sub(r'\s+', '', str(jx[i].get('analysis') or ''))[:60]))
