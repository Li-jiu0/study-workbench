# -*- coding: utf-8 -*-
"""构建 patch_ziliao.json + 冲突清单"""
import json, sys, io, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
APP = r"C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
OUT = r"D:\下载的文件\学习工作台\tools\jx_patch"

with open(APP, 'r', encoding='utf-8', errors='replace') as f:
    for ln in f:
        if 'INLINE_ZILIAO_BANK' in ln: line = ln; break
app = json.loads(line[line.find('['):line.rfind(']')+1])
appmap = {q['id']: q for q in app}
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
a2t = {int(k): v for k, v in json.load(open(rf'{OUT}\_app2tb.json', encoding='utf-8')).items()}
AL = {int(k): v for k, v in json.load(open(rf'{OUT}\_tb2jx.json', encoding='utf-8')).items()}
L = ['A', 'B', 'C', 'D']

FURNITURE = re.compile(r'^[\d\s]*(作业题|综合训练)[\d\s]*$')
TAILM = re.compile(r'故正确答案为\s*([ABCD])')

def clean_text(s):
    s = s.replace('\r\n', '\n').replace('\r', '\n')
    lines = [ln.rstrip() for ln in s.split('\n')]
    while lines and not lines[0].strip(): lines.pop(0)
    while lines and not lines[-1].strip(): lines.pop()
    # 去掉纯页码/书眉类行（首尾）
    while lines and FURNITURE.match(lines[-1].strip()): lines.pop()
    # 压连续空行
    out = []
    for ln in lines:
        if ln.strip() == '' and out and out[-1].strip() == '': continue
        out.append(ln)
    t = '\n'.join(out).strip()
    t = re.sub(r'^\s*正文[：:]\s*', '', t)
    t = re.sub(r'\n{3,}', '\n\n', t)
    t = re.sub(r'[\d\s]*(作业题|综合训练)[\d\s]*$', '', t)   # 页眉页脚类 OCR 残片
    return t.strip()

def tail_ans(a):
    m = None
    for m in TAILM.finditer(a):
        pass
    return m.group(1) if m else ''

items = {}
conflicts = {}
drops = 0
agree = 0
pairs = 0
agree_with_tail = 0
n_tail = 0
changed_by_clean = 0

for aid, ti in sorted(a2t.items()):
    ji = AL.get(ti)
    if ji is None: continue
    raw = jx[ji]['analysis'] or ''
    txt = clean_text(raw)
    if txt != raw.strip(): changed_by_clean += 1
    if len(re.sub(r'\s', '', txt)) < 20:
        drops += 1; continue
    items[str(aid)] = txt
    pairs += 1
    app_letter = L[appmap[aid]['a']]
    jx_ans = (jx[ji]['answer'] or '').strip() or tail_ans(jx[ji]['analysis'])
    ta = tail_ans(jx[ji]['analysis'])
    if ta:
        n_tail += 1
        if ta == app_letter: agree_with_tail += 1
    if app_letter == jx_ans: agree += 1
    else:
        conflicts[str(aid)] = {'tiben_idx': ti, 'jiexi_idx': ji, 'app_answer': app_letter,
                               'jiexi_answer': jx_ans, 'jiexi_tail': ta}

print('app items', len(app), 'app->tiben', len(a2t), 'tiben->jiexi(all)', len(AL))
print('app items with jiexi:', pairs, 'dropped(<20字):', drops)
print('answer agree (app vs jiexi field/tail):', agree, '/', pairs, round(agree/pairs, 4))
print('tail-answer available:', n_tail, 'agree:', agree_with_tail, round(agree_with_tail/max(1, n_tail), 4))
print('clean changed', changed_by_clean)
print('conflicts:', len(conflicts))
print('final items:', len(items))

lens = [len(v) for v in items.values()]
print('analysis len min/median/max:', min(lens), sorted(lens)[len(lens)//2], max(lens))
print('items < 100 chars:', sum(1 for v in items.values() if len(v) < 100))

# ---- 材料组连续性（不依赖答案的结构校验）----
gt = collections.OrderedDict()
for i, t in enumerate(tb): gt.setdefault(t['chapter'].replace(' ', ''), []).append(i)
grp_bad = 0; grp_tot = 0; grp_exact = 0
for ch in gt:
    T = gt[ch]
    grps = []
    prev = None
    for ti in T:
        m_ = tb[ti]['material']
        if m_ != prev: grps.append([]); prev = m_
        grps[-1].append(ti)
    for g in grps:
        js = [AL[x] for x in g if x in AL]
        if not js: continue
        grp_tot += 1
        if js == list(range(js[0], js[0]+len(js))):
            grp_exact += 1
            if len(js) == len(g): grp_exact += 0
        else:
            grp_bad += 1
print('material groups:', grp_tot, 'contiguous:', grp_exact, 'broken:', grp_bad)

patch = {
    'book': '资料分析',
    'total_in_app': len(app),
    'aligned_tiben': len(a2t),
    'aligned_jiexi': pairs,
    'answer_agree_rate': round(agree/pairs, 4),
    'items': items,
}
json.dump(patch, open(rf'{OUT}\patch_ziliao.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(conflicts, open(rf'{OUT}\answers_conflict_ziliao.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('saved patch_ziliao.json / answers_conflict_ziliao.json')

# 抽样证据用：id / 问题句前40字 / 解析前80字
ev = {}
for aid in list(items)[:3] + sorted(int(i) for i in items)[len(items)//2:][:1]:
    pass
