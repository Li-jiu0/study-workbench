# -*- coding: utf-8 -*-
"""解析补丁：独立内容校验 + 择优合并 + 落库 app.js。

校验思路（不看任何一方的汇报，只用内容本身）：
  对每道题取题干/选项的 6-gram，看它在「被选中的解析」里命中多少，
  再与「另一候选解析」和「同书随机解析（基线）」对比。命中率显著高于基线 = 配对正确。
"""
import json, os, io, sys, re, random
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
TREE = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366'
APP = os.path.join(TREE, 'assets', 'app.js')
D = r'D:\下载的文件\学习工作台\tools\jx_patch'
CN = re.compile(r'[^一-鿿A-Za-z0-9]')
IMG = re.compile(r'\[IMG:[^\]]*\]')
BOOKS = {'yanyu': 'INLINE_YANYU_BANK', 'changshi': 'INLINE_CHANGSHI_BANK',
         'judge': 'INLINE_JUDGE_BANK', 'ziliao': 'INLINE_ZILIAO_BANK'}


def norm(s):
    return CN.sub('', IMG.sub('', str(s or '')))


def grams(s, n=6, cap=40):
    s = norm(s)
    if len(s) <= n:
        return [s] if s else []
    g = [s[i:i + n] for i in range(len(s) - n + 1)]
    if len(g) > cap:
        step = len(g) / cap
        g = [g[int(i * step)] for i in range(cap)]
    return g


def load_bank(var):
    for line in open(APP, encoding='utf-8'):
        if ('var %s =' % var) in line:
            a, b = line.find('['), line.rfind(']')
            return json.loads(line[a:b + 1])
    raise SystemExit('missing ' + var)


def score(q, ana):
    """题干+选项 6-gram 在解析正文里的命中率"""
    g = set(grams(q, 6, 40))
    for o in q['o']:
        g |= set(grams(o, 6, 10))
    if not g:
        return 0.0
    a = norm(ana)
    return sum(1 for x in g if x in a) / len(g)


def main():
    random.seed(7)
    merged, report = {}, []
    for book, var in BOOKS.items():
        app = load_bank(var)
        qmap = {str(a['id']): a for a in app}
        mine = json.load(open(os.path.join(D, 'patch_%s.json' % book), encoding='utf-8'))
        sg = json.load(open(os.path.join(D, 'patch_sg_%s.json' % book), encoding='utf-8'))
        pool = list(mine['items'].values()) or list(sg['items'].values())
        takemine = takesg = both = onlymine = onlysg = 0
        sm = ss = sb = n = 0
        items = {}
        for tid, q in qmap.items():
            a, b = mine['items'].get(tid), sg['items'].get(tid)
            if a and b:
                both += 1
                sa, sbb = score(q, a), score(q, b)
                if sa >= sbb:
                    items[tid], takemine, sm = a, takemine + 1, sm + sa
                else:
                    items[tid], takesg, ss = b, takesg + 1, ss + sbb
            elif a:
                onlymine += 1
                items[tid], sm = a, sm + score(q, a)
            elif b:
                onlysg += 1
                items[tid], ss = b, ss + score(q, b)
            else:
                continue
            n += 1
            sb += score(q, random.choice(pool))
        merged[book] = items
        report.append('%-9s app=%-5d 最终有解析=%-5d (%.1f%%) | 双方都有 %d（取我 %d / 取子代理 %d）'
                      ' | 仅我 %d 仅子代理 %d\n'
                      '          内容命中率：选中 %.3f vs 随机基线 %.3f  <-- 显著高于基线即配对正确'
                      % (book, len(app), len(items), len(items) / len(app) * 100,
                         both, takemine, takesg, onlymine, onlysg, (sm + ss) / n, sb / n))
    print('\n'.join(report))
    json.dump(merged, open(os.path.join(D, '_merged.json'), 'w', encoding='utf-8'),
              ensure_ascii=False)
    print('\n合并结果已写入 _merged.json')

    # ---------- 落库 ----------
    if '--apply' in sys.argv:
        html = open(APP, encoding='utf-8').read()
        total = 0
        for book, var in BOOKS.items():
            lines = html.split('\n')
            idx = next(i for i, l in enumerate(lines) if ('var %s =' % var) in l)
            L = lines[idx]
            a, b = L.find('['), L.rfind(']')
            bank = json.loads(L[a:b + 1])
            m = merged[book]
            hit = 0
            for q in bank:
                v = m.get(str(q['id']))
                if v and (not q.get('x') or len(str(q['x'])) < 20):
                    q['x'] = v
                    hit += 1
            total += hit
            lines[idx] = L[:a] + json.dumps(
                bank, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + ';'
            html = '\n'.join(lines)
            print('  %-9s 回填 %d 条' % (book, hit))
        open(APP, 'w', encoding='utf-8').write(html)
        print('共回填 %d 条解析' % total)


if __name__ == '__main__':
    main()
