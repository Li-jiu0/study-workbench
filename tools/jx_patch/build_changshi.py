# -*- coding: utf-8 -*-
"""常识判断 解析回填补丁构建
三步：app.js 上线题库 -> 题本源 -> 解析源
只产出补丁 JSON 与报告，不修改任何线上文件。
"""
import json, re, os, collections

APP = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366\assets\app.js'
TIBEN = r'D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\常识判断_题本\2027政治理论与常识判断（题本）.questions.json'
JIEXI = r'D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work\2027政治理论与常识判断（解析）\2027政治理论与常识判断（解析）_解析.json'
OUT = r'D:\下载的文件\学习工作台\tools\jx_patch'

# ---------------- 第 1 步：读上线题库 ----------------
line = None
with open(APP, encoding='utf-8') as f:
    for ln in f:
        if 'var INLINE_CHANGSHI_BANK' in ln:
            line = ln
            break
assert line, 'INLINE_CHANGSHI_BANK not found'
bank = json.loads(line[line.index('['): line.rindex(']') + 1])
print('[1] app.js 上线题库 =', len(bank))

# ---------------- 第 2 步：app.js <-> 题本 指纹对齐 ----------------
IMG = re.compile(r'\[IMG:[^\]]*\]')
WS = re.compile(r'\s+')


def fp(s, n=60):
    s = IMG.sub('', s or '')
    s = WS.sub('', s)
    return s[:n]


tiben = json.load(open(TIBEN, encoding='utf-8'))['questions']
fp2tib = {}
for idx, t in enumerate(tiben):
    fp2tib.setdefault(fp(''.join(t['stem'])), []).append(idx)
print('[2] 题本源 =', len(tiben), ' 唯一指纹 =', len(fp2tib))

app2tib, miss = {}, []
dupe = fixed = 0
for b in bank:
    cand = fp2tib.get(fp(b['q']))
    if not cand:
        miss.append(b['id'])
        continue
    pick = cand[0]
    if len(cand) > 1:
        dupe += 1
        # 同指纹多候选时，优先取答案与上线题库 a 索引一致的那个
        for c in cand:
            a = (tiben[c].get('answer') or '').strip()
            if a in 'ABCD' and 'ABCD'.index(a) == b['a']:
                pick = c
                fixed += 1
                break
    app2tib[b['id']] = pick
print('[2] 对齐 =', len(app2tib), '/', len(bank),
      ' 命中率 = %.2f%%' % (100.0 * len(app2tib) / len(bank)),
      ' 未命中 =', len(miss), ' 多候选 =', dupe)
assert len(app2tib) / len(bank) >= 0.99, '对齐率 < 99%，停止'

# ---------------- 第 3 步：题本 <-> 解析 结构化对齐 ----------------
jiexi = json.load(open(JIEXI, encoding='utf-8'))['items']
print('[3] 解析源 =', len(jiexi))


def ukey(x):
    return (x['pian'], x['chapter'], x['section'], x['difficulty'], x['block'])


units = collections.OrderedDict()
for x in jiexi:
    units.setdefault(ukey(x), []).append(x)

def J(pian, chapter, section, diff, block):
    return (pian, chapter, section, diff, block)


# 题本(part,chapter,node,difficulty) -> 解析分组（组内 qid 连续，按 qid 对齐）
LINK = [
    ((1, 1, 0, '夯实基础'), [J('', '第一章马克思主义哲学', '', '夯实基础', 1),
                             J('第一篇政治理论', '第一篇政治理论', '', '', 1)]),
    ((1, 1, 0, '高难进阶'), [J('第一篇政治理论', '第一篇政治理论', '', '高难进阶', 1)]),
    ((1, 2, 0, '夯实基础'), [J('第一篇政治理论', '第一章理论与政策', '', '夯实基础', 1)]),
    ((1, 2, 0, '高难进阶'), [J('第一篇政治理论', '第一章理论与政策', '', '高难进阶', 1)]),
    ((1, 3, 0, '夯实基础'), [J('第一篇政治理论', '第三章模块练习', '', '', 1)]),
    ((2, 1, 1, '夯实基础'), [J('第二篇常识判断', '第一章人文常识', '第一节文化常识', '夯实基础', 1)]),
    ((2, 1, 1, '高难进阶'), [J('第二篇常识判断', '第一章人文常识', '第一节文化常识', '高难进阶', 1)]),
    ((2, 1, 2, '夯实基础'), [J('第二篇常识判断', '第一章人文常识', '第一节文学常识', '夯实基础', 1)]),
    ((2, 1, 2, '高难进阶'), [J('第二篇常识判断', '第一章人文常识', '第一节文学常识', '高难进阶', 1)]),
    ((2, 1, 3, '夯实基础'), [J('第二篇常识判断', '第一章人文常识', '第三节历史常识', '夯实基础', 1)]),
    ((2, 1, 3, '高难进阶'), [J('第二篇常识判断', '第一章人文常识', '第三节历史常识', '高难进阶', 1)]),
    ((2, 1, 4, '夯实基础'), [J('第二篇常识判断', '第一章人文常识', '第四节模块练习', '', 1)]),
    ((2, 2, 1, '夯实基础'), [J('第二篇常识判断', '第一章人文常识', '第一节物理常识', '夯实基础', 1)]),
    ((2, 2, 1, '高难进阶'), [J('第二篇常识判断', '第一章人文常识', '第一节物理常识', '高难进阶', 1)]),
    ((2, 2, 2, '夯实基础'), [J('第二篇常识判断', '第一章人文常识', '第二节化学常识', '夯实基础', 1)]),
    ((2, 2, 2, '高难进阶'), [J('第二篇常识判断', '第一章人文常识', '第二节化学常识', '高难进阶', 1)]),
    ((2, 2, 3, '夯实基础'), [J('第二篇常识判断', '第一章人文常识', '第三节生物常识', '夯实基础', 1)]),
    ((2, 2, 3, '高难进阶'), [J('第二篇常识判断', '第一章人文常识', '第三节生物常识', '高难进阶', 1)]),
    ((2, 2, 4, '夯实基础'), [J('第二篇常识判断', '第一章人文常识', '第四节科技理论与成就', '夯实基础', 1)]),
    ((2, 2, 4, '高难进阶'), [J('第二篇常识判断', '第一章人文常识', '第四节科技理论与成就', '高难进阶', 1)]),
    ((2, 2, 5, '夯实基础'), [J('第二篇常识判断', '第一章人文常识', '第五节生活常识', '夯实基础', 1)]),
    ((2, 2, 5, '高难进阶'), [J('第二篇常识判断', '第一章人文常识', '第五节生活常识', '高难进阶', 1)]),
    ((2, 3, 1, '夯实基础'), [J('第二篇常识判断', '第三章法律常识', '第一节宪法', '夯实基础', 1)]),
    ((2, 3, 1, '高难进阶'), [J('第二篇常识判断', '第三章法律常识', '第一节宪法', '高难进阶', 1)]),
    ((2, 3, 2, '夯实基础'), [J('第二篇常识判断', '第三章法律常识', '第二节行政法', '夯实基础', 1)]),
    ((2, 3, 2, '高难进阶'), [J('第二篇常识判断', '第三章法律常识', '第二节行政法', '高难进阶', 1)]),
    ((2, 3, 3, '夯实基础'), [J('第二篇常识判断', '第三章法律常识', '第三节民法与民事诉讼法', '夯实基础', 1)]),
    ((2, 3, 3, '高难进阶'), [J('第二篇常识判断', '第三章法律常识', '第三节民法与民事诉讼法', '高难进阶', 1)]),
    ((2, 3, 4, '夯实基础'), [J('第二篇常识判断', '第三章法律常识', '第四节刑法与刑事诉讼法', '夯实基础', 1)]),
    ((2, 3, 4, '高难进阶'), [J('第二篇常识判断', '第三章法律常识', '第四节刑法与刑事诉讼法', '高难进阶', 1)]),
    ((2, 3, 5, '夯实基础'), [J('第二篇常识判断', '第三章法律常识', '第五节商法经济法和社会法', '夯实基础', 1)]),
    ((2, 3, 5, '高难进阶'), [J('第二篇常识判断', '第三章法律常识', '第五节商法经济法和社会法', '高难进阶', 1)]),
    ((2, 3, 6, '夯实基础'), [J('第二篇常识判断', '第三章法律常识', '第六节其他法律法规', '夯实基础', 1)]),
    ((2, 3, 6, '高难进阶'), [J('第二篇常识判断', '第三章法律常识', '第六节其他法律法规', '高难进阶', 1)]),
    ((2, 4, 1, '夯实基础'), [J('第二篇常识判断', '第四章地理常识', '第一节自然环境', '夯实基础', 1)]),
    ((2, 4, 1, '高难进阶'), [J('第二篇常识判断', '第四章地理常识', '第一节自然环境', '高难进阶', 1)]),
    ((2, 4, 2, '夯实基础'), [J('第二篇常识判断', '第四章地理常识', '第一节国情社情', '夯实基础', 1)]),
    ((2, 4, 2, '高难进阶'), [J('第二篇常识判断', '第四章地理常识', '第一节国情社情', '高难进阶', 1)]),
    ((2, 5, 0, '夯实基础'), [J('第二篇常识判断', '第五章经济常识', '', '夯实基础', 1)]),
    ((2, 5, 0, '高难进阶'), [J('第二篇常识判断', '第五章经济常识', '', '高难进阶', 1)]),
]
for tb_key, ks in LINK:
    for k in ks:
        assert k in units, '解析分组缺失: %r' % (k,)
print('[3] 解析分组数 =', len(units), ' LINK 条目 =', len(LINK))

qid2jiexi = {}   # 题本分组key -> {qid: 解析item}
for tb_key, ks in LINK:
    m = {}
    for k in ks:
        for x in units[k]:
            m[x['qid']] = x
    qid2jiexi[tb_key] = m


def tbkey(t):
    return (t['part'], t['chapter'], t['node'] or 0, t['difficulty'])


# 题本 -> 解析
tib2jx, nojx = {}, []
for i, t in enumerate(tiben):
    m = qid2jiexi.get(tbkey(t))
    x = m.get(t['qid']) if m else None
    if x is None:
        nojx.append(i)
    else:
        tib2jx[i] = x
print('[3] 题本->解析 对齐 =', len(tib2jx), '/', len(tiben), ' 未命中 =', len(nojx))

# ---------------- answer 一致率自校验 ----------------
TAIL = re.compile(r'故正确答案为\s*([A-D])')


def jx_ans(x):
    a = (x.get('answer') or '').strip()
    if a in ('A', 'B', 'C', 'D'):
        return a
    m = TAIL.findall(x.get('analysis') or '')
    return m[-1] if m else None


tot = ok = 0
for i, x in tib2jx.items():
    ta = (tiben[i].get('answer') or '').strip()
    ja = jx_ans(x)
    if ta in ('A', 'B', 'C', 'D') and ja:
        tot += 1
        ok += (ta == ja)
agree_all = ok / tot if tot else 0.0
print('[3] answer 一致率(全体) = %d/%d = %.4f' % (ok, tot, agree_all))

# ---------------- 产出补丁 ----------------
def clean(t):
    t = (t or '').replace('\r\n', '\n').replace('\r', '\n')
    t = re.sub(r'^\s*正文[：:]\s*', '', t)
    t = re.sub(r'[ \t]+\n', '\n', t)
    t = re.sub(r'\n{2,}', '\n', t)
    return t.strip()


items, short = {}, 0
patch_tot = patch_ok = 0
for b in bank:
    ti = app2tib.get(b['id'])
    if ti is None:
        continue
    x = tib2jx.get(ti)
    if x is None:
        continue
    ta = (tiben[ti].get('answer') or '').strip()
    ja = jx_ans(x)
    if ta in ('A', 'B', 'C', 'D') and ja:
        patch_tot += 1
        patch_ok += (ta == ja)
    txt = clean(x.get('analysis'))
    if len(txt) < 20:
        short += 1
        continue
    items[str(b['id'])] = txt

agree_patch = patch_ok / patch_tot if patch_tot else 0.0
print('[out] 补丁条目 =', len(items), ' 过短剔除 =', short)
print('[out] answer 一致率(补丁) = %d/%d = %.4f' % (patch_ok, patch_tot, agree_patch))

os.makedirs(OUT, exist_ok=True)
patch = {
    'book': '常识判断',
    'total_in_app': len(bank),
    'aligned_tiben': len(app2tib),
    'aligned_jiexi': len(items),
    'answer_agree_rate': round(agree_patch, 4),
    'items': items,
}
with open(os.path.join(OUT, 'patch_changshi.json'), 'w', encoding='utf-8') as f:
    json.dump(patch, f, ensure_ascii=False, indent=1)
print('[out] written patch_changshi.json')

# 抽样证据
samples = []
c = 0
for b in bank:
    if str(b['id']) in items and c < 3:
        ti = app2tib[b['id']]
        samples.append((b['id'], WS.sub('', IMG.sub('', b['q']))[:40], items[str(b['id'])][:80]))
        c += 1
json.dump({'samples': samples, 'miss_fp': miss, 'nojx': nojx,
           'agree_all': agree_all, 'agree_patch': agree_patch},
          open(os.path.join(OUT, '_meta.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('[out] written _meta.json')
