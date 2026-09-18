# -*- coding: utf-8 -*-
import json, sys, io, re, collections, random
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
TIBEN = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\资料分析_题本\questions.json"
JIEXI = r"D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027资料分析（解析）\2027资料分析（解析）_解析.json"
tb = json.load(open(TIBEN, encoding='utf-8'))['questions']
jx = json.load(open(JIEXI, encoding='utf-8'))['items']
IMG = re.compile(r'\[IMG:[^\]]*\]')
def clean(s): return re.sub(r'\s+', '', IMG.sub('', s or ''))
def bg(s): return collections.Counter(s[i:i+2] for i in range(len(s)-1))
def cov(a, b):
    if not a: return 0.0
    hit = sum(min(v, b.get(k, 0)) for k, v in a.items())
    return hit / sum(a.values())

gt = collections.OrderedDict(); gj = collections.OrderedDict()
for i, t in enumerate(tb): gt.setdefault(t['chapter'].replace(' ', ''), []).append(i)
for i, j in enumerate(jx): gj.setdefault(j['chapter'].replace(' ', ''), []).append(i)

T = gt['第一章表格资料']; J = gj['第一章表格资料']
print('local cov matrix rows=T25..30 cols=J25..31 (ans)', )
hdr = '       ' + ' '.join(f'{jx[J[c]]["answer"]}({c:>2})' for c in range(25, 32))
print(hdr)
for r in range(25, 31):
    a = bg(clean(''.join(tb[T[r]]['stem'])))
    row = [round(cov(a, bg(clean(jx[J[c]]['analysis']))), 2) for c in range(25, 32)]
    print(f'T{r}({tb[T[r]]["answer"]})', row)

# global stats: within-material-group neighbors vs true
random.seed(1)
print()
print('random cross cov sample:', [round(cov(bg(clean(''.join(tb[random.randrange(len(tb))]['stem']))), bg(clean(jx[random.randrange(len(jx))]['analysis']))), 3) for _ in range(8)])
