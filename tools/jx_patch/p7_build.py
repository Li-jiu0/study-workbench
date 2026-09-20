# -*- coding: utf-8 -*-
import json, io, re

APP   = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\言语理解_题本\2027言语理解（题本）.questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027言语理解（解析）\2027言语理解（解析）_解析.json"
OUT   = r"D:\下载的文件\学习工作台\tools\jx_patch"

IMG = re.compile(r'\[IMG:[^\]]*\]'); WS = re.compile(r'\s+'); LEAD = re.compile(r'^[0-9]{1,3}')
def raw(s): return WS.sub('', IMG.sub('', str(s or '')))
def fp(s): return raw(s)[:60]
def fp2(s): return LEAD.sub('', raw(s))[:60]
def fp3(s): return raw(s)[-60:]

def find_bank(p, v):
    for line in io.open(p, encoding='utf-8'):
        i = line.find('var ' + v + ' =')
        if i >= 0:
            s = line.index('[', i); e = line.rindex(']')
            return json.loads(line[s:e+1])

bank = find_bank(APP, 'INLINE_YANYU_BANK')
tb   = json.load(io.open(TIBEN, encoding='utf-8'))['questions']
jx   = json.load(io.open(JIEXI, encoding='utf-8'))['items']
print('层1 app=%d 题本=%d 解析=%d(app id %d-%d)' % (len(bank), len(tb), len(jx), bank[0]['id'], bank[-1]['id']))

# ---------- 层2 ----------
pool = {}
for f in (fp, fp2, fp3):
    d = {}
    for i, t in enumerate(tb): d.setdefault(f(''.join(t.get('stem') or [])), []).append(i)
    pool[f.__name__] = d
app2tb = {}; used = set(); un = []
for b in bank:
    hit = None
    for name, f in (('fp', fp), ('fp2', fp2), ('fp3', fp3)):
        c = [i for i in pool[name].get(f(b['q']), []) if i not in used]
        if c: hit = c[0]; break
    if hit is None: un.append(b['id'])
    else: app2tb[b['id']] = hit; used.add(hit)
print('层2 对齐 %d/%d = %.4f 未匹配 %d' % (len(app2tb), len(bank), len(app2tb)/len(bank), len(un)))

# ---------- 层3: 单断点搜索(题本多1条) ----------
def jx_ans(it):
    a = str(it.get('answer') or '').strip().upper()
    if a: return a[0]
    m = re.findall(r'故正确答案为\s*([A-D])', str(it.get('analysis') or ''))
    return m[-1] if m else ''
def tans(t): return str(t.get('answer') or '').strip().upper()[:1]
def m(i, j): return 1 if (tans(tb[i]) and jx_ans(jx[j]) and tans(tb[i]) == jx_ans(jx[j])) else 0

N = len(jx)   # 1009
pre = [0] * (N + 1)
for k in range(N): pre[k+1] = pre[k] + m(k, k)
suf = [0] * (N + 2)
for k in range(N - 1, -1, -1): suf[k] = suf[k+1] + m(k + 1, k)
best_b, best_v = max(((b, pre[b] + suf[b]) for b in range(N + 1)), key=lambda x: x[1])
print('层3 单断点搜索: 断点(题本idx)=%d 一致数=%d 参考满分=%d' % (best_b, best_v, N))
cand = sorted(((b, pre[b] + suf[b]) for b in range(N + 1)), key=lambda x: -x[1])[:5]
print('   前5候选(断点,一致数):', cand)

tb2jx = {}
for i in range(len(tb)):
    if i == best_b: continue          # 该题在解析册中缺失, 不配对
    j = i if i < best_b else i - 1
    if 0 <= j < N: tb2jx[i] = j
agree = sum(m(i, tb2jx[i]) for i in tb2jx)
tot   = sum(1 for i in tb2jx if tans(tb[i]) and jx_ans(jx[tb2jx[i]]))
rate  = agree / max(tot, 1)
print('层3 对齐 %d/%d ; answer一致 %d/%d = %.4f' % (len(tb2jx), len(tb), agree, tot, rate))
bad = [(i, tb2jx[i], tans(tb[i]), jx_ans(jx[tb2jx[i]])) for i in sorted(tb2jx)
       if tans(tb[i]) and jx_ans(jx[tb2jx[i]]) and tans(tb[i]) != jx_ans(jx[tb2jx[i]])]
print('   不一致 %d 条, 前10:', bad[:10])

# 内容侧证: 选项命中
def opt_score(t, it):
    a = re.sub(r'\s+', '', str(it.get('analysis') or ''))
    return sum(1 for v in (t.get('options') or {}).values()
               if len(re.sub(r'\s+', '', str(v or ''))) >= 3 and re.sub(r'\s+', '', str(v or ''))[:5] in a)
good = sum(opt_score(tb[i], jx[tb2jx[i]]) for i in tb2jx) / len(tb2jx)
rand = sum(opt_score(tb[i], jx[(tb2jx[i] + 7) % N]) for i in tb2jx) / len(tb2jx)
print('   内容侧证: 选项命中均值 正确配对=%.2f  随机配对=%.2f' % (good, rand))

# ---------- 补丁 ----------
TRIM = 0
def clean(s):
    global TRIM
    s = str(s or '')
    p = s.find('【解析】')
    if p > 0 and p <= 200:             # 去掉 OCR 混入的页眉/提示框碎屑
        s = s[p:]; TRIM += 1
    s = re.sub(r'(?m)^\s*正文[：:]\s*', '', s).replace('正文：', '')
    s = re.sub(r'\n{2,}', '\n', s)
    return s.strip()

items = {}; short = 0
for b in bank:
    i = app2tb.get(b['id'])
    if i is None: continue
    j = tb2jx.get(i)
    if j is None: continue
    txt = clean(jx[j].get('analysis'))
    if len(txt) < 20: short += 1; continue
    items[str(b['id'])] = txt
patch = {'book': '言语理解', 'total_in_app': len(bank), 'aligned_tiben': len(app2tb),
         'aligned_jiexi': len(tb2jx), 'answer_agree_rate': round(rate, 4), 'items': items}
json.dump(patch, io.open(OUT + r'\patch_yanyu.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('\n补丁: items=%d (过短丢弃 %d, 截掉页眉碎屑 %d) -> patch_yanyu.json' % (len(items), short, TRIM))
print('无解析的 app id:', [b['id'] for b in bank if app2tb.get(b['id']) is not None and tb2jx.get(app2tb[b['id']]) is None])
import os
print('文件大小: %.1f KB' % (os.path.getsize(OUT + r'\patch_yanyu.json') / 1024))

# ---------- 抽样 ----------
print('\n=== 抽样证据 ===')
for b in (bank[0], bank[485], bank[700], bank[1000], bank[-3]):
    i = app2tb.get(b['id']); j = tb2jx.get(i) if i is not None else None
    print('id=%s  tb=%s jx=%s | app答=%s 题本答=%s 解析答=%s' % (
        b['id'], i, j, ['A','B','C','D'][b['a']] if isinstance(b['a'], int) else b['a'],
        tans(tb[i]) if i is not None else '-', jx_ans(jx[j]) if j is not None else '-'))
    print('  app题干40 :', fp(b['q'])[:40])
    if i is not None: print('  题本题干40:', fp(''.join(tb[i].get('stem') or []))[:40])
    if j is not None: print('  解析前80  :', re.sub(r'\s+', '', str(jx[j].get('analysis') or ''))[:80])
json.dump({'app2tb': {str(k): v for k, v in app2tb.items()}, 'tb2jx': {str(k): v for k, v in tb2jx.items()},
           'break': best_b, 'rate': rate},
          io.open(OUT + r'\_align_tmp.json', 'w', encoding='utf-8'), ensure_ascii=False)
