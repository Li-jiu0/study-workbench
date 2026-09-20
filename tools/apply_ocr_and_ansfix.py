# -*- coding: utf-8 -*-
"""2026-09-15c：① OCR 噪声清洗 ② 资料分析答案修正（只改 q/o/x 与 ziliao 的 a）。

依据：
 - OCR 规则来自 tools/jx_patch/ocr_fix_map.json（71 条，均为「非法词→合法词」的形近替换，
   已抽查 Top10 规则的真实上下文，逐条判读无误）。
 - 资料分析答案修正来自 patch_ziliao.json 的 ans_fix（187 条），
   条件极严：内容配对得分 ≥0.30 且解析正文尾句「故正确答案为X」与解析册答案字段自洽。
   证据：6/6 人工复核 + 24 种选项置换检验 + 解析册自洽 214/215。
"""
import json, os, io, sys, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
TREE = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366'
APP = os.path.join(TREE, 'assets', 'app.js')
D = r'D:\下载的文件\学习工作台\tools\jx_patch'

rules = json.load(open(os.path.join(D, 'ocr_fix_map.json'), encoding='utf-8'))['rules']
ans_fix = json.load(open(os.path.join(D, 'patch_ziliao.json'), encoding='utf-8')).get('ans_fix', {})
print('OCR 规则 %d 条；资料分析答案修正 %d 条' % (len(rules), len(ans_fix)))


def clean(s):
    if not s:
        return s
    for r in rules:
        if r['from'] in s:
            s = s.replace(r['from'], r['to'])
    return s


lines = open(APP, encoding='utf-8').read().split('\n')
tot_ocr = tot_ans = 0
for i, L in enumerate(lines):
    m = re.match(r'\s*var (INLINE_[A-Z]+_BANK) = \[', L)
    if not m:
        continue
    var = m.group(1)
    a, b = L.find('['), L.rfind(']')
    bank = json.loads(L[a:b + 1])
    n_ocr = n_ans = 0
    for q in bank:
        for k in ('q', 'x', 'tip'):
            if isinstance(q.get(k), str) and q[k]:
                nv = clean(q[k])
                if nv != q[k]:
                    q[k] = nv
                    n_ocr += 1
        if isinstance(q.get('o'), list):
            for j in range(len(q['o'])):
                if isinstance(q['o'][j], str) and q['o'][j]:
                    nv = clean(q['o'][j])
                    if nv != q['o'][j]:
                        q['o'][j] = nv
                        n_ocr += 1
        if var == 'INLINE_ZILIAO_BANK':
            letter = ans_fix.get(str(q.get('id')))
            if letter and letter in 'ABCD':
                idx = ord(letter) - 65
                if q.get('a') != idx:
                    q['a'] = idx
                    n_ans += 1
    lines[i] = L[:a] + json.dumps(bank, ensure_ascii=False,
                                  separators=(',', ':')).replace('</', '<\\/') + ';'
    print('  %-22s %5d 题 | OCR 修正 %4d 处 | 答案修正 %3d 题'
          % (var, len(bank), n_ocr, n_ans))
    tot_ocr += n_ocr
    tot_ans += n_ans

open(APP, 'w', encoding='utf-8').write('\n'.join(lines))
print('合计：OCR 修正 %d 处，资料分析答案修正 %d 题' % (tot_ocr, tot_ans))
