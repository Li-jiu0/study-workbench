# -*- coding: utf-8 -*-
import json, io, re
from collections import Counter

APP    = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\言语理解_题本\2027言语理解（题本）.questions.json"
JIEXI  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027言语理解（解析）\2027言语理解（解析）_解析.json"
OUT    = r"D:\下载的文件\学习工作台\tools\jx_patch"

IMG = re.compile(r'\[IMG:[^\]]*\]'); WS = re.compile(r'\s+')
LEADNUM = re.compile(r'^[0-9]{1,3}')

def raw(s): return WS.sub('', IMG.sub('', str(s or '')))
def fp_a(s, n=60): return raw(s)[:n]                      # 主指纹:去空白后前60
def fp_b(s, n=60): return LEADNUM.sub('', raw(s))[:n]     # 次指纹:去掉开头题号
def fp_c(s, n=60): return raw(s)[-n:]                     # 尾指纹:后60

def find_bank(p, v):
    for line in io.open(p, encoding='utf-8'):
        i = line.find('var ' + v + ' =')
        if i >= 0:
            s = line.index('[', i); e = line.rindex(']')
            return json.loads(line[s:e+1])

bank = find_bank(APP, 'INLINE_YANYU_BANK')
tb   = json.load(io.open(TIBEN, encoding='utf-8'))['questions']
jx   = json.load(io.open(JIEXI, encoding='utf-8'))['items']
print('层1: app=%d 题本=%d 解析=%d' % (len(bank), len(tb), len(jx)))

# ---------- 层2: app <-> 题本(三级指纹) ----------
idx = {}
for f in (fp_a, fp_b, fp_c):
    d = {}
    for i, t in enumerate(tb): d.setdefault(f(''.join(t.get('stem') or [])), []).append(i)
    idx[f.__name__] = d
app2tb = {}; used = set(); un = []
for b in bank:
    hit = None
    for name, f in (('fp_a', fp_a), ('fp_b', fp_b), ('fp_c', fp_c)):
        c = [i for i in idx[name].get(f(b['q']), []) if i not in used]
        if c: hit = c[0]; break
    if hit is None: un.append(b['id'])
    else: app2tb[b['id']] = hit; used.add(hit)
LET = ['A','B','C','D','E']
ok = tot = 0
for b in bank:
    i = app2tb.get(b['id'])
    if i is None: continue
    ta = str(tb[i].get('answer') or '').strip().upper()[:1]
    aa = str(LET[b['a']] if isinstance(b.get('a'), int) and b['a'] < 5 else b.get('a')).strip().upper()[:1]
    tot += 1; ok += (ta == aa and ta != '')
print('层2: 对齐 %d/%d = %.4f ; 未匹配 %d ; app答案vs题本答案一致 %d/%d = %.4f'
      % (len(app2tb), len(bank), len(app2tb)/len(bank), len(un), ok, tot, ok/max(tot,1)))
if un: print('   未匹配 id(前20):', un[:20])

# ---------- 层3: 题本 <-> 解析(分块顺序对齐) ----------
def groups(items, keyf):
    g = []
    for i, t in enumerate(items):
        k = keyf(t)
        if g and g[-1][0] == k: g[-1][1].append(i)
        else: g.append((k, [i]))
    return g
TG = groups(tb, lambda t: (t.get('chapter'), t.get('node'), str(t.get('node_title') or '').strip(), str(t.get('difficulty') or '').strip()))
JG = groups(jx, lambda t: (str(t.get('chapter') or ''), str(t.get('point') or ''), str(t.get('difficulty') or '')))

tb2jx = {}; ti = ji = 0; pt = pj = 0; jumps = []
while ti < len(TG) and ji < len(JG):
    vt = TG[ti][1]; vj = JG[ji][1]
    n = min(len(vt) - pt, len(vj) - pj)
    if n <= 0: jumps.append(('zero', ti, ji)); break
    for k in range(n): tb2jx[vt[pt+k]] = vj[pj+k]
    if len(vt) - pt != len(vj) - pj:
        jumps.append((ti, ji, TG[ti][0][2], JG[ji][0][1] or '(无考点)', len(vt)-pt, len(vj)-pj))
    pt += n; pj += n
    if pt >= len(vt): ti += 1; pt = 0
    if pj >= len(vj): ji += 1; pj = 0
print('层3: 对齐 %d/%d ; 块大小不一致处 %d 处' % (len(tb2jx), len(tb), len(jumps)))
for j in jumps[:6]: print('   ', j)

def jx_ans(it):
    a = str(it.get('answer') or '').strip().upper()
    if a: return a[0]
    m = re.findall(r'故正确答案为\s*([A-D])', str(it.get('analysis') or ''))
    return m[-1] if m else ''
agree = tot2 = 0; bad = []
for t_i, j_i in sorted(tb2jx.items()):
    ta = str(tb[t_i].get('answer') or '').strip().upper()[:1]; ja = jx_ans(jx[j_i])
    if not ta or not ja: continue
    tot2 += 1
    if ta == ja: agree += 1
    else: bad.append((t_i, j_i, ta, ja))
rate = agree / max(tot2, 1)
print('层3: 题本answer vs 解析answer 一致 %d/%d = %.4f' % (agree, tot2, rate))
print('   不一致样例(前10, 题本idx/解析idx/题本答案/解析答案):', bad[:10])
# 纯顺序(无间隙)对照
pure = sum(1 for i in range(min(len(tb), len(jx)))
           if str(tb[i].get('answer') or '').strip().upper()[:1] == jx_ans(jx[i])
           and str(tb[i].get('answer') or '').strip())
print('   对照-纯顺序一一配对一致率: %d/%d = %.4f' % (pure, min(len(tb), len(jx)), pure/min(len(tb), len(jx))))

# ---------- 产出补丁 ----------
BLANK = re.compile(r'\n{2,}')
def clean(s):
    s = str(s or '')
    s = re.sub(r'(?m)^\s*正文[：:]\s*', '', s)
    s = s.replace('正文：', '')
    s = BLANK.sub('\n', s)
    return s.strip()

items = {}; short = 0
for b in bank:
    ti_ = app2tb.get(b['id'])
    if ti_ is None: continue
    ji_ = tb2jx.get(ti_)
    if ji_ is None: continue
    txt = clean(jx[ji_].get('analysis'))
    if len(txt) < 20: short += 1; continue
    items[str(b['id'])] = txt
print('补丁条目: %d (过短被丢弃 %d)' % (len(items), short))

patch = {'book': '言语理解', 'total_in_app': len(bank), 'aligned_tiben': len(app2tb),
         'aligned_jiexi': len(tb2jx), 'answer_agree_rate': round(rate, 4), 'items': items}
json.dump(patch, io.open(OUT + r'\patch_yanyu.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('已写出 patch_yanyu.json, items=%d' % len(items))

# ---------- 抽样证据 ----------
print('\n=== 抽样证据 ===')
for b in (bank[0], bank[300], bank[600], bank[900], bank[-1]):
    ti_ = app2tb.get(b['id']); ji_ = tb2jx.get(ti_) if ti_ is not None else None
    print('id=%s tb=%s jx=%s | 题本ans=%s 解析ans=%s' % (
        b['id'], ti_, ji_,
        tb[ti_].get('answer') if ti_ is not None else '-',
        jx_ans(jx[ji_]) if ji_ is not None else '-'))
    print('   app题干40:', fp_a(b['q'], 40))
    if ti_ is not None: print('   题本题干40:', fp_a(''.join(tb[ti_].get('stem') or []), 40))
    if ji_ is not None: print('   解析前80:', (jx[ji_].get('analysis') or '')[:80].replace('\n', '/'))
json.dump({'app2tb': {str(k): v for k, v in app2tb.items()}, 'tb2jx': {str(k): v for k, v in tb2jx.items()}},
          io.open(OUT + r'\_align_tmp.json', 'w', encoding='utf-8'), ensure_ascii=False)
