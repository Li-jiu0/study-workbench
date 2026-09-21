# -*- coding: utf-8 -*-
import json, io, re, sys
from collections import Counter, OrderedDict

APP    = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\言语理解_题本\2027言语理解（题本）.questions.json"
JIEXI  = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027言语理解（解析）\2027言语理解（解析）_解析.json"
OUTDIR = r"D:\下载的文件\学习工作台\tools\jx_patch"

IMG = re.compile(r'\[IMG:[^\]]*\]')
WS  = re.compile(r'\s+')
DASH = re.compile(r'[-—－―一]{1,}')

def norm_key(s):
    s = str(s or '')
    s = IMG.sub('', s)
    s = WS.sub('', s)
    s = DASH.sub('-', s)
    return s

def fp(s, n=60):
    s = IMG.sub('', str(s or ''))
    s = WS.sub('', s)
    return s[:n]

# ---------- 1. app.js ----------
def find_bank(path, varname):
    with io.open(path, 'r', encoding='utf-8') as f:
        for line in f:
            i = line.find('var ' + varname + ' =')
            if i >= 0:
                s = line.index('[', i)
                e = line.rindex(']')
                return json.loads(line[s:e+1])
    return None

bank = find_bank(APP, 'INLINE_YANYU_BANK')
tb_raw = json.load(io.open(TIBEN, encoding='utf-8'))
tb = tb_raw['questions']
jx_raw = json.load(io.open(JIEXI, encoding='utf-8'))
jx = jx_raw['items']

print('=== 层1 ===')
print('app题数:', len(bank), ' id范围:', min(b['id'] for b in bank), '-', max(b['id'] for b in bank))
print('题本数:', len(tb), ' 解析数:', len(jx))

# ---------- 2. app <-> 题本 指纹对齐 ----------
pool = {}
for i, t in enumerate(tb):
    pool.setdefault(fp(''.join(t.get('stem') or [])), []).append(i)

app2tb = {}
used = set()
unmatched = []
for b in bank:
    k = fp(b['q'])
    cands = [i for i in pool.get(k, []) if i not in used]
    if not cands:
        # 放宽到 40 字符
        k2 = fp(b['q'], 40)
        cands = [i for i in pool.get(k2, []) if i not in used]
    if cands:
        app2tb[b['id']] = cands[0]
        used.add(cands[0])
    else:
        unmatched.append(b['id'])
print('\n=== 层2 app<->题本 ===')
print('对齐数:', len(app2tb), '/', len(bank), ' 率: %.4f' % (len(app2tb)/len(bank)))
print('未匹配 app id:', unmatched[:20], '共', len(unmatched))

# 答案一致性交叉校验(app a 索引 vs 题本 answer 字母)
LET = ['A','B','C','D','E']
ok = 0; tot = 0
for b in bank:
    i = app2tb.get(b['id'])
    if i is None: continue
    ta = str(tb[i].get('answer') or '').strip().upper()
    aa = LET[b['a']] if isinstance(b.get('a'), int) and b['a'] < len(LET) else str(b.get('a')).strip().upper()
    tot += 1
    if ta and ta[0] == aa[:1]: ok += 1
print('app答案 vs 题本答案 一致率: %d/%d = %.4f' % (ok, tot, ok/max(tot,1)))

# ---------- 3. 题本 <-> 解析 ----------
CN = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
def chap_num(name):
    m = re.match(r'\s*第([一二三四五六七八九十])章', str(name or ''))
    return CN.get(m.group(1)) if m else None

jx_chap_names = OrderedDict()
for it in jx:
    n = chap_num(it.get('chapter'))
    if n: jx_chap_names.setdefault(n, str(it.get('chapter')).strip())
print('\n解析章节映射:', dict(jx_chap_names))

def tb_key(t):
    c = jx_chap_names.get(int(t.get('chapter') or 0), 'C%s' % t.get('chapter'))
    p = norm_key(t.get('node_title'))
    d = norm_key(t.get('difficulty'))
    if p and d: return '%s_%s_%s' % (c, p, d)
    if d: return '%s_%s' % (c, d)
    return c

def jx_key(it):
    c = str(it.get('chapter') or '').strip()
    p = norm_key(it.get('point'))
    d = norm_key(it.get('difficulty'))
    if p and d: return '%s_%s_%s' % (c, p, d)
    if d: return '%s_%s' % (c, d)
    return c

tk = [tb_key(t) for t in tb]
jk = [jx_key(i) for i in jx]

# 分组(连续同 key)
def groups(keys):
    g = []
    for i, k in enumerate(keys):
        if g and g[-1][0] == k: g[-1][1].append(i)
        else: g.append((k, [i]))
    return g
TG = groups(tk); JG = groups(jk)
print('题本分组数:', len(TG), ' 解析分组数:', len(JG))
print('题本分组键唯一数:', len(set(k for k,_ in TG)), ' 解析:', len(set(k for k,_ in JG)))
common = set(k for k,_ in TG) & set(k for k,_ in JG)
print('共同键数:', len(common))
only_tb = [(k,len(v)) for k,v in TG if k not in common]
only_jx = [(k,len(v)) for k,v in JG if k not in common]
print('仅题本有的分组:', only_tb[:15])
print('仅解析有的分组:', only_jx[:15])

# 贪心按 key 顺序对齐(允许跳过不匹配的组)
tb2jx = {}
ti = 0; ji = 0
log = []
while ti < len(TG) and ji < len(JG):
    kt, vt = TG[ti]; kj, vj = JG[ji]
    if kt == kj:
        n = min(len(vt), len(vj))
        for x in range(n): tb2jx[vt[x]] = vj[x]
        if len(vt) != len(vj):
            log.append(('size_diff', kt, len(vt), len(vj)))
        ti += 1; ji += 1
    else:
        # 尝试向前看 2 组寻找同 key
        found = None
        for d in (1, 2):
            if ji + d < len(JG) and JG[ji+d][0] == kt: found = d; break
        if found is None:
            for d in (1, 2):
                if ti + d < len(TG) and TG[ti+d][0] == kj:
                    log.append(('skip_tb', TG[ti][0], len(TG[ti][1]))); ti += d; found = 'tb'; break
        if found == 'tb': continue
        if isinstance(found, int):
            log.append(('skip_jx', JG[ji][0], len(JG[ji][1]))); ji += found; continue
        log.append(('force', kt, kj, len(vt), len(vj)))
        n = min(len(vt), len(vj))
        for x in range(n): tb2jx[vt[x]] = vj[x]
        ti += 1; ji += 1
print('\n=== 层3 题本<->解析 ===')
print('对齐数:', len(tb2jx), '/', len(tb))
print('异常组(前20):', log[:20], '共', len(log))

# answer 一致率
def jx_ans(it):
    a = str(it.get('answer') or '').strip().upper()
    if a: return a[0]
    m = re.findall(r'故正确答案为\s*([A-DA-D])', str(it.get('analysis') or ''))
    return m[-1] if m else ''

agree = 0; tot2 = 0; disagree = []
for ti_, ji_ in tb2jx.items():
    ta = str(tb[ti_].get('answer') or '').strip().upper()[:1]
    ja = jx_ans(jx[ji_])
    if not ta or not ja: continue
    tot2 += 1
    if ta == ja: agree += 1
    else: disagree.append((ti_, ta, ja))
print('题本answer vs 解析answer 一致: %d/%d = %.4f' % (agree, tot2, agree/max(tot2,1)))
print('不一致样例(前10):', [(tb[i].get('qid'), a, b) for i,a,b in disagree[:10]])

# 抽样证据
print('\n=== 抽样 ===')
for b in (bank[0], bank[len(bank)//2], bank[-1]):
    i = app2tb.get(b['id']); j = tb2jx.get(i) if i is not None else None
    print('--- app id', b['id'], ' tb_idx', i, ' jx_idx', j)
    print('  题干40:', fp(b['q'], 40))
    print('  题本40:', fp(''.join(tb[i]['stem']), 40) if i is not None else 'NA')
    print('  解析80:', (jx[j].get('analysis') or 'NA')[:80].replace('\n','/') if j is not None else 'NA')
    print('  ans: app', b['a'], 'tb', tb[i].get('answer') if i is not None else '-', 'jx', jx_ans(jx[j]) if j is not None else '-')

json.dump({'app2tb': {str(k): v for k, v in app2tb.items()},
           'tb2jx': {str(k): v for k, v in tb2jx.items()},
           'agree': agree, 'tot': tot2},
          io.open(OUTDIR + r'\_align_tmp.json', 'w', encoding='utf-8'), ensure_ascii=False)
