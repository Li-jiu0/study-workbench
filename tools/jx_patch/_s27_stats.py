# -*- coding: utf-8 -*-
import json, sys, io, re, collections, functools
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
OUT = r"D:\下载的文件\学习工作台\tools\jx_patch"
APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
with open(APP, 'r', encoding='utf-8', errors='replace') as f:
    for ln in f:
        if 'INLINE_ZILIAO_BANK' in ln: line = ln; break
app = json.loads(line[line.find('['):line.rfind(']')+1])
appmap = {q['id']: q for q in app}
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
a2t = {int(k): v for k, v in json.load(open(rf'{OUT}\_app2tb.json', encoding='utf-8')).items()}
AL = {int(k): v for k, v in json.load(open(rf'{OUT}\_tb2jx.json', encoding='utf-8')).items()}
conf = json.load(open(rf'{OUT}\answers_conflict_ziliao.json', encoding='utf-8'))
patch = json.load(open(rf'{OUT}\patch_ziliao.json', encoding='utf-8'))
items = patch['items']

IMG = re.compile(r'\[IMG:[^\]]*\]')
PUNCT = set('·…～-—_ \t,，。、？?：:；;()（）""\'\'“”.*#/\\|+')
def clean(s): return re.sub(r'\s+', '', IMG.sub('', s or ''))
def strip_noise(s): return ''.join(c for c in s if c not in PUNCT)
def bg(s): return collections.Counter(s[i:i+2] for i in range(len(s)-1))
def cov(a, b):
    if not a: return 0.0
    return sum(min(v, b.get(k, 0)) for k, v in a.items())/sum(a.values())
def extract_quote(ana):
    a = ana.replace('\n',''); best=''
    for trig in ('题干','题于','题千','题日'):
        p = a.find(trig)
        if 0 <= p < 60:
            q1 = a.find('“',p); q2 = a.find('”',q1+1) if q1>=0 else -1
            if q1>=0 and q2>q1 and q2-q1<=70:
                c = strip_noise(a[q1+1:q2])
                if len(c)>len(best): best=c
    return best
def lcs_ratio(q,t):
    if not q: return 0.0
    prev=[0]*(len(t)+1)
    for c in q:
        cur=[0]
        for k in range(1,len(t)+1):
            cur.append(prev[k-1]+1 if c==t[k-1] else max(prev[k],cur[k-1]))
        prev=cur
    return prev[-1]/len(q)

# 1) 分章节数字（仅统计进入补丁的那批）
per = collections.defaultdict(lambda: [0,0,0])
for aid, ti in a2t.items():
    ji = AL.get(ti)
    ch = appmap[aid]['sub']
    per[ch][0] += 1
    if ji is None: continue
    per[ch][1] += 1
    if ['A','B','C','D'][appmap[aid]['a']] == (jx[ji]['answer'] or '').strip(): per[ch][2] += 1
print('=== 分章节（app题数 / 命中解析 / 答案一致）===')
for ch, (a,b,c) in per.items():
    print(f'  {ch}: {a} / {b} / {c}  ({c/b:.3f})')

# 2) 高置信子集
strong = 0; strong_ag = 0
for aid, ti in a2t.items():
    ji = AL.get(ti)
    if ji is None: continue
    q = extract_quote(jx[ji]['analysis'])
    if len(q) < 5: continue
    r = lcs_ratio(q, strip_noise(clean(''.join(tb[ti]['stem']))))
    if r >= 0.85:
        strong += 1
        if ['A','B','C','D'][appmap[aid]['a']] == (jx[ji]['answer'] or '').strip(): strong_ag += 1
print(f'\n高置信子集（解析正文逐字引用题干 LCS>=0.85）: {strong} 条, 一致 {strong_ag} = {strong_ag/strong:.4f}')

# 3) 冲突文件自洽性
c_tot = len(conf); c_tail = sum(1 for v in conf.values() if v['jiexi_tail'])
c_selfagree = sum(1 for v in conf.values() if v['jiexi_tail'] and v['jiexi_tail']==v['jiexi_answer'])
print(f'冲突 {c_tot} 条：有尾句答案 {c_tail}，其中尾句==answer字段 {c_selfagree}')

# 4) 证据样本
print('\n=== 证据样本 ===')
for sid in ['3905','4405','4563','4838']:
    q = appmap[int(sid)]
    stem = clean(q['q'].split('\n',1)[1] if '\n' in q['q'] else q['q'])
    print(f'id {sid} | {stem[:40]}')
    print(f'    {items[sid].replace(chr(10),"")[:80]}')

# 5) 抽样：冲突 case 展示
print('\n=== 冲突样例（app答案 vs 解析推导）===')
for sid in ['4075','4078','4543','4563','4411','4486']:
    if sid not in conf: continue
    ji = conf[sid]['jiexi_idx']
    print(f'id {sid} app={conf[sid]["app_answer"]} jiexi={conf[sid]["jiexi_answer"]} tail={conf[sid]["jiexi_tail"]}')
    q = appmap[int(sid)]
    print('   opts:', q['o'])
    print('   stem:', clean(q['q'].split('\n',1)[1])[:60])
    a = jx[ji]['analysis'].replace('\n','')
    print('   ana :', a[-160:])
