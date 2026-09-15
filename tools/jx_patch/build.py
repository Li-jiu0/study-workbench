# -*- coding: utf-8 -*-
"""判断推理 解析回填：app.js <-> 题本 <-> 解析 三层对齐"""
import json, io, sys, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TBF = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\判断推理_题本\questions.json"
JXF = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027判断推理（解析）\2027判断推理（解析）_解析.json"
OUTD = r"D:\下载的文件\学习工作台\tools\jx_patch"

CN = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
IMG = re.compile(r'\[IMG:([^\]]+)\]')

# ---------- 载入 ----------
with open(APP, 'r', encoding='utf-8', errors='replace') as f:
    for ln in f:
        if 'var INLINE_JUDGE_BANK' in ln:
            bank = json.loads(ln[ln.index('['):ln.rindex(']')+1]); break
tb = json.load(open(TBF, encoding='utf-8'))['questions']
jx = json.load(open(JXF, encoding='utf-8'))['items']

def imgs(t): return tuple(m.strip() for m in IMG.findall(t or ''))
def norm_fp(t): return re.sub(r'\s+', '', re.sub(r'\[IMG:[^\]]*\]', '', t or ''))[:60]
ANS_TAIL = re.compile(r'故正确答案为\s*([ABCD])')
def jx_ans(x):
    a = (x.get('answer') or '').strip()
    if a: return a[:1].upper()
    m = ANS_TAIL.search(x.get('analysis') or '')
    return m.group(1) if m else ''

# ---------- 通用 DP ----------
def dp_align(A, B, sim, gapA, gapB):
    n, m = len(A), len(B); NEG = -1e18
    dp = [[NEG]*(m+1) for _ in range(n+1)]
    bt = [[0]*(m+1) for _ in range(n+1)]
    dp[0][0] = 0.0
    for i in range(n+1):
        for j in range(m+1):
            if i == 0 and j == 0: continue
            best, b = NEG, 0
            if i > 0 and j > 0:
                v = dp[i-1][j-1] + sim(A[i-1], B[j-1])
                if v > best: best, b = v, 1
            if i > 0:
                v = dp[i-1][j] + gapA
                if v > best: best, b = v, 2
            if j > 0:
                v = dp[i][j-1] + gapB
                if v > best: best, b = v, 3
            dp[i][j] = best; bt[i][j] = b
    pairs = []; i, j = n, m
    while i > 0 or j > 0:
        b = bt[i][j]
        if b == 0: break
        if b == 1: pairs.append((i-1, j-1)); i -= 1; j -= 1
        elif b == 2: i -= 1
        else: j -= 1
    pairs.reverse()
    return pairs

# ================= 第 1 层：app.js <-> 题本 =================
CH_OF_SUB = {'图形推理':1, '定义判断':2, '类比推理':3, '逻辑判断':4}
for b in bank:
    b['_fp'] = norm_fp(b['q']); b['_img'] = imgs(b['q'])
for q in tb:
    q['_fp'] = norm_fp(''.join(q.get('stem') or []))
    q['_img'] = tuple((x or '').split('/')[-1] for x in (q.get('images') or []))

def sim_ab(a, b):
    s = -4.0
    if a['_img'] and b['_img']:
        s += 6.0 if a['_img'] == b['_img'] else -2.0
    if a['_fp'] and a['_fp'] == b['_fp']:
        s += 4.0
    return s

app2tb = {}
for name, ch in CH_OF_SUB.items():
    A = [b for b in bank if b['sub'] == name]
    B = [q for q in tb if q['chapter'] == ch]
    for i, j in dp_align(A, B, sim_ab, -8.0, -1.5):
        app2tb[A[i]['id']] = B[j]
    print(f"[层1] {name}: app {len(A)} / 题本 {len(B)} -> 配对 {sum(1 for b in A if b['id'] in app2tb and app2tb[b['id']] in B)}")
print("[层1] app 覆盖:", len(app2tb), "/", len(bank))
a1 = sum(1 for b in bank if b['id'] in app2tb and app2tb[b['id']].get('a') == b['a'])
print("[层1] 选项答案索引一致率: %d/%d = %.4f" % (a1, len(app2tb), a1/max(1, len(app2tb))))

# ================= 第 2 层：题本 <-> 解析 =================
def jx_chapter(x):
    m = re.match(r'^第([一二三四五六七八九十]+)章', x.get('chapter') or '')
    return CN[m.group(1)] if m else 0
for x in jx: x['_ch'] = jx_chapter(x)

def canon_tb(sk):
    m = re.match(r'^C(\d+)_S(\d+)_K(\d+)_(.*)$', sk or '')
    if not m: return None
    g = m.group(4)
    if g.startswith('卷') or g == 'NA': g = ''
    return (int(m.group(3)), g)

def canon_jx(sk):
    ch = sec = kd = 0; diff = ''
    parts = (sk or '').split('_')
    for p in parts[1:]:
        m = re.match(r'^第([一二三四五六七八九十]+)节', p)
        if m: sec = CN[m.group(1)]; continue
        m = re.match(r'^考点(\d+)', p)
        if m: kd = int(m.group(1)); continue
        if p in ('夯实基础', '高难进阶', '新考法'): diff = p
    return (kd, diff)

def runs(seq, keyf):
    out = []
    for it in seq:
        k = keyf(it)
        if out and out[-1][0] == k: out[-1][1].append(it)
        else: out.append([k, [it]])
    return out

def block_bonus(bt_key, bj_key):
    a, b = canon_tb(bt_key), canon_jx(bj_key)
    if a and b and a == b and (a[0] or a[1]): return 3.0
    return 0.0

def align_blocks(bt, bj, lam=3.0, skip=5.0, maxrun=6):
    """块级序列比对：允许 多对多 合并、允许整块跳过"""
    n, m = len(bt), len(bj); INF = float('inf')
    dp = [[INF]*(m+1) for _ in range(n+1)]
    bk = [[None]*(m+1) for _ in range(n+1)]
    dp[0][0] = 0.0
    for i in range(n+1):
        for j in range(m+1):
            if dp[i][j] == INF: continue
            for a in range(1, min(maxrun, n-i)+1):
                st = sum(len(bt[i+k][1]) for k in range(a))
                if st > 300: break
                for b in range(1, min(maxrun, m-j)+1):
                    sj = sum(len(bj[j+k][1]) for k in range(b))
                    if sj > 300: break
                    bon = block_bonus(bt[i][0], bj[j][0])
                    c = abs(st-sj) + lam*((a-1)+(b-1)) - bon
                    if dp[i][j] + c < dp[i+a][j+b]:
                        dp[i+a][j+b] = dp[i][j] + c
                        bk[i+a][j+b] = (i, j, a, b)
            if i < n:
                c = len(bt[i][1]) + skip
                if dp[i][j] + c < dp[i+1][j]:
                    dp[i+1][j] = dp[i][j] + c; bk[i+1][j] = (i, j, 1, 0)
            if j < m:
                c = len(bj[j][1]) + skip
                if dp[i][j] + c < dp[i][j+1]:
                    dp[i][j+1] = dp[i][j] + c; bk[i][j+1] = (i, j, 0, 1)
    seg = []; i, j = n, m
    while (i, j) != (0, 0):
        pi, pj, a, b = bk[i][j]
        seg.append((pi, pj, a, b)); i, j = pi, pj
    seg.reverse()
    return seg

def sim_tj(p, q):
    s = -1.0
    if (p.get('qid'), q.get('qid')) and p.get('qid') == q.get('qid'): s += 3.0
    if (p.get('answer') or '')[:1].upper() == jx_ans(q): s += 2.0
    return s

tb2jx = {}; seglog = []; pos_pairs = []; dp_pairs = []
for ch in (1, 2, 3, 4):
    T = [q for q in tb if q['chapter'] == ch]
    J = [x for x in jx if x['_ch'] == ch]
    bt = runs(T, lambda q: q['section_key'])
    bj = runs(J, lambda x: x['section_key'])
    seg = align_blocks(bt, bj)
    npos = ndp = 0; nskip_tb = 0
    for pi, pj, a, b in seg:
        if b == 0:
            nskip_tb += sum(len(bt[pi+k][1]) for k in range(a)); continue
        if a == 0: continue
        Tsub = [it for k in range(a) for it in bt[pi+k][1]]
        Jsub = [it for k in range(b) for it in bj[pj+k][1]]
        bt_k = ' + '.join(bt[pi+k][0] for k in range(a))
        bj_k = ' + '.join(bj[pj+k][0] for k in range(b))
        if len(Tsub) == len(Jsub):
            for u, v in zip(Tsub, Jsub):
                tb2jx[id(u)] = v; pos_pairs.append((u, v))
            npos += len(Tsub)
        else:
            for u, v in dp_align(Tsub, Jsub, sim_tj, -2.0, -2.0):
                tb2jx[id(Tsub[u])] = Jsub[v]; dp_pairs.append((Tsub[u], Jsub[v]))
            ndp += len(Jsub)
            seglog.append((ch, bt_k, bj_k, len(Tsub), len(Jsub)))
    print(f"[层2] 第{ch}章: 题本 {len(T)} / 解析 {len(J)} / 段 {len(seg)} / 位置配对 {npos} / qid配对 {ndp} / 整块跳过 {nskip_tb}")

print("[层2] 题本->解析 配对总数:", len(tb2jx), " (位置", len(pos_pairs), ", qid-DP", len(dp_pairs), ")")
used = set(id(v) for v in tb2jx.values())
print("[层2] 未配对解析条目:", sum(1 for x in jx if id(x) not in used), "/", len(jx))
print("[层2] 未配对题本条目:", sum(1 for q in tb if id(q) not in tb2jx), "/", len(tb))
print("[层2] 非等长块段（qid-DP）：")
for s in seglog: print("    第%d章 %s  <->  %s   (%d vs %d)" % s)

# ================= 校验 =================
def agree(pairs):
    o = sum(1 for p, q in pairs if (p.get('answer') or '')[:1].upper() == jx_ans(q))
    return o, len(pairs), (o/len(pairs) if pairs else 0)
o1, n1, r1 = agree(pos_pairs)
o2, n2, r2 = agree(dp_pairs)
print("\n[校验] 位置配对(独立校验) 答案一致率 %d/%d = %.4f" % (o1, n1, r1))
print("[校验] qid-DP配对(半独立) 答案一致率 %d/%d = %.4f" % (o2, n2, r2))

pairs3 = [(b['id'], app2tb[b['id']], tb2jx.get(id(app2tb[b['id']]))) for b in bank if b['id'] in app2tb]
hit = [p for p in pairs3 if p[2] is not None]
print("[校验] app->解析 命中 %d/%d" % (len(hit), len(bank)))
d = [(x['page'] or 0) - (q['page'] or 0) for _, q, x in hit]
bad = sum(1 for i in range(len(d)-1) if d[i+1] < d[i] - 10)
print("[校验] 页码差 %d..%d，剧烈回退次数 %d" % (min(d), max(d), bad))

# ================= 产出 =================
def clean(s):
    s = (s or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    s = re.sub(r'^\s*正文[:：]\s*', '', s)
    return re.sub(r'\n{3,}', '\n\n', s).strip()

items = {}; short = 0
for b in bank:
    if b['id'] not in app2tb: continue
    x = tb2jx.get(id(app2tb[b['id']]))
    if x is None: continue
    t = clean(x.get('analysis'))
    if len(t) < 20: short += 1; continue
    items[str(b['id'])] = t

meta = {"book": "判断推理", "total_in_app": len(bank), "aligned_tiben": len(app2tb),
        "aligned_jiexi": len(items), "answer_agree_rate": round(r1, 4), "items": items}
with open(OUTD + r'\patch_judge.json', 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
print("\n[产出] patch_judge.json  items=%d  过短丢弃=%d" % (len(items), short))

# 证据
ev = []; seen = set()
for b in bank:
    if b['sub'] == '图形推理' and b['id'] in app2tb and '图形推理' not in seen:
        x = tb2jx.get(id(app2tb[b['id']]))
        if x and app2tb[b['id']]['chapter'] == 1 and 's1' in app2tb[b['id']]['section_key']:
            seen.add('图形推理')
            ev.append(dict(sub=b['sub'], id=b['id'], q=re.sub(r'\s+', '', b['q'])[:40],
                           x=re.sub(r'\s+', ' ', (x.get('analysis') or ''))[:80]))
for b in bank:
    if len(ev) >= 3: break
    if b['id'] not in app2tb or b['sub'] in seen: continue
    x = tb2jx.get(id(app2tb[b['id']]))
    if x is None: continue
    seen.add(b['sub'])
    ev.append(dict(sub=b['sub'], id=b['id'], q=re.sub(r'\s+', '', b['q'])[:40],
                   x=re.sub(r'\s+', ' ', (x.get('analysis') or ''))[:80]))
json.dump(ev, open(OUTD + r'\_evidence.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(total_app=len(bank), align_tb=len(app2tb), hit=len(hit), items=len(items),
               rate1=round(a1/max(1, len(app2tb)), 4), pos=(o1, n1, round(r1, 4)),
               dp=(o2, n2, round(r2, 4)), short=short, jx_total=len(jx), tb_total=len(tb),
               seglog=seglog, pagediff=(min(d), max(d), bad)),
          open(OUTD + r'\_stats.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print("[产出] 证据条数:", len(ev))
for e in ev: print("   ", e['sub'], e['id'], '|', e['q'][:36], '\n       ->', e['x'][:76])
