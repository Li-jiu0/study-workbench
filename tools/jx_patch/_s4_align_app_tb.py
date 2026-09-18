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
def clean(s):
    return re.sub(r'\s+', '', IMG.sub('', s))

def fp(s, n=60):
    c = clean(s)
    return c[-n:]

# build tiben fingerprint index
tbidx = {}
for i, t in enumerate(tb):
    k = fp(''.join(t['stem']))
    tbidx.setdefault(k, []).append(i)
dup = {k: v for k, v in tbidx.items() if len(v) > 1}
print('tiben fp total', len(tbidx), 'dup fp', len(dup))

# app side: q = '<matid>\n<stem...>'
used = {}
hit = 0
miss = []
for q in app:
    qs = q['q']
    # drop leading material id line
    if '\n' in qs:
        first, rest = qs.split('\n', 1)
    else:
        first, rest = qs, ''
    if re.fullmatch(r'mat\d{3}', first.strip()):
        stem_txt = rest
    else:
        stem_txt = qs
    k = fp(stem_txt)
    cands = tbidx.get(k)
    if cands:
        # prefer unused, and same chapter if available
        ok = None
        sub = q['sub']
        for i in cands:
            if i in used: continue
            if tb[i]['chapter'].replace(' ', '') == sub:
                ok = i; break
        if ok is None:
            for i in cands:
                if i not in used:
                    ok = i; break
        if ok is None:
            ok = cands[0]
        used[ok] = q['id']
        hit += 1
    else:
        miss.append(q['id'])

print('app total', len(app), 'matched', hit, 'rate', round(hit/len(app), 4))
print('miss count', len(miss), 'sample', miss[:20])
# verify answer consistency where matched
agree = 0
dis = []
for ti, aid in used.items():
    t = tb[ti]
    qv = [qq for qq in app if qq['id'] == aid][0]
    L = ['A','B','C','D']
    exp = L.index(t['answer']) if t['answer'] in L else None
    if exp is not None and exp == qv['a']:
        agree += 1
    else:
        dis.append((aid, t['answer'], qv['a']))
print('answer agree app vs tiben:', agree, '/', len(used), round(agree/max(1,len(used)),4))
print('disagree sample', dis[:10])
# order monotonic check
pairs = sorted((ti, aid) for ti, aid in used.items())
prev = 0; mono = True
for ti, aid in pairs:
    if aid < prev: mono = False
    prev = aid
print('tiben-order vs app-id monotonic:', mono)

json.dump({str(aid): ti for ti, aid in used.items()}, open(r'D:\下载的文件\学习工作台\tools\jx_patch\_app2tb.json','w',encoding='utf-8'), ensure_ascii=False)
print('saved _app2tb.json', len(used))
