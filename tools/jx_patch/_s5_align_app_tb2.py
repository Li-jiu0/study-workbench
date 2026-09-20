# -*- coding: utf-8 -*-
import json, sys, io, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
with open(APP, 'r', encoding='utf-8', errors='replace') as f:
    for ln in f:
        if 'INLINE_ZILIAO_BANK' in ln: line = ln; break
app = json.loads(line[line.find('['):line.rfind(']')+1])
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']

IMG = re.compile(r'\[IMG:[^\]]*\]')
def clean(s): return re.sub(r'\s+', '', IMG.sub('', s))
def fp(s, n=60):
    c = clean(s); return c[-n:]

tbidx = {}
for i, t in enumerate(tb):
    key = (t['chapter'].replace(' ', ''), t.get('material') or '', fp(''.join(t['stem'])))
    tbidx.setdefault(key, []).append(i)
dups = {k: v for k, v in tbidx.items() if len(v) > 1}
print('composite keys', len(tbidx), 'dup', len(dups))
for k, v in list(dups.items())[:5]:
    print('  dup key', k[0], k[1], k[2][:30], '->', v)

used = {}
miss = []
for q in app:
    qs = q['q']
    first, _, rest = qs.partition('\n')
    mid = first.strip() if re.fullmatch(r'mat\d{3}', first.strip()) else ''
    stem_txt = rest if mid else qs
    key = (q['sub'], mid or None, fp(stem_txt))
    cands = tbidx.get(key)
    if not cands:
        miss.append(q['id']); continue
    pick = None
    for i in cands:
        if i not in used: pick = i; break
    if pick is None: pick = cands[0]
    used[pick] = q['id']

print('matched', len(used), '/', len(app), 'miss', len(miss), miss[:20])
L = ['A','B','C','D']
agree = 0; dis = []
for ti, aid in used.items():
    t = tb[ti]; qv = next(x for x in app if x['id'] == aid)
    exp = L.index(t['answer']) if t['answer'] in L else None
    if exp == qv['a']: agree += 1
    else: dis.append((aid, ti, t['answer'], qv['a'], t['material'], qv['q'][:60]))
print('answer agree', agree, '/', len(used), round(agree/len(used), 4))
for d in dis[:10]: print('  DIS', d)
prev = -1; mono = True
for ti in sorted(used):
    if used[ti] < prev: mono = False
    prev = used[ti]
print('monotonic', mono)
json.dump({str(aid): ti for ti, aid in used.items()}, open(r'D:\下载的文件\学习工作台\tools\jx_patch\_app2tb.json','w',encoding='utf-8'), ensure_ascii=False)
print('saved', len(used))
