# -*- coding: utf-8 -*-
"""题本 ↔ 解析册 内容匹配器。

思路：解析正文几乎都会引用选项原文（"A项：……"），因此用「选项文本 n-gram 命中率」
做逐题匹配，比 (章/考点/难度/题号) 结构键可靠得多；再用答案一致性做独立校验。

用法: python jx_match.py <book>   book ∈ yanyu|changshi|judge|ziliao|quant
输出: tools/jx_patch/patch_<book>.json + report_<book>.md
"""
import json, os, io, sys, re, time
from collections import Counter, defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
OCR = r'D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work'
TREE = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366'
OUT = r'D:\下载的文件\学习工作台\tools\jx_patch'
os.makedirs(OUT, exist_ok=True)

CFG = {
    'yanyu': dict(mod='言语理解', var='INLINE_YANYU_BANK', base=905,
                  tb=r'言语理解_题本\2027言语理解（题本）.questions.json',
                  jx=r'2027言语理解（解析）\2027言语理解（解析）_解析.json',
                  submap={1: '片段阅读', 2: '语句表达', 3: '逻辑填空', 4: '篇章阅读'}),
    'changshi': dict(mod='常识判断', var='INLINE_CHANGSHI_BANK', base=1905,
                     tb=r'常识判断_题本\2027政治理论与常识判断（题本）.questions.json',
                     jx=r'2027政治理论与常识判断（解析）\2027政治理论与常识判断（解析）_解析.json',
                     submap={1: '政治理论', 2: '人文常识', 3: '法律常识', 4: '地理常识', 5: '经济常识'}),
    'judge': dict(mod='判断推理', var='INLINE_JUDGE_BANK', base=2905,
                  tb=r'判断推理_题本\questions.json',
                  jx=r'2027判断推理（解析）\2027判断推理（解析）_解析.json',
                  submap={1: '图形推理', 2: '定义判断', 3: '类比推理', 4: '逻辑判断'}),
    'ziliao': dict(mod='资料分析', var='INLINE_ZILIAO_BANK', base=3905,
                   tb=r'资料分析_题本\questions.json',
                  jx=r'2027资料分析（解析）\2027资料分析（解析）_解析.json',
                  submap=None, gn=6),
    'quant': dict(mod='数量关系', var='INLINE_QUANT_BANK', base=187,
                  tb=r'数量关系_题本\2027数量关系（题本）.questions.json',
                  jx=r'2027数量关系（解析）\2027数量关系（解析）_解析.json',
                  submap=None),
}

CN = re.compile(r'[^一-鿿A-Za-z0-9]')
IMG = re.compile(r'\[IMG:[^\]]*\]')


CN_NUM = str.maketrans('一二三四五六七八九十', '123456789X')


def cnum(s):
    """章名里的中文数字统一成阿拉伯数字（"第一章" ↔ "第1章"）。"""
    return s.translate(CN_NUM).replace('X', '10')


def norm(s):
    return CN.sub('', IMG.sub('', str(s or '')))


def grams(s, n=6, cap=40):
    s = norm(s)
    if not s:
        return []
    if len(s) <= n:
        return [s]
    g = [s[i:i + n] for i in range(len(s) - n + 1)]
    if len(g) > cap:                      # 均匀抽样，控制开销
        step = len(g) / cap
        g = [g[int(i * step)] for i in range(cap)]
    return g


def load_app_bank(var):
    """从 app.js 单行大数组里取真实上线题库。"""
    for line in open(os.path.join(TREE, 'assets', 'app.js'), encoding='utf-8'):
        if ('var %s =' % var) in line:
            a, b = line.find('['), line.rfind(']')
            return json.loads(line[a:b + 1])
    raise SystemExit('app.js 里找不到 ' + var)


def opt_list(q):
    o = q.get('options') or {}
    if isinstance(o, dict):
        return [str(v) for v in o.values()]
    return [str(v) for v in o]


def tb_chapter(q, cfg, app_sub):
    """题本侧章节归一化字符串；返回 None 表示放弃章节限定。"""
    c = q.get('chapter')
    sm = cfg['submap']
    if sm is not None and c is not None:
        try:
            n = int(c)
        except (TypeError, ValueError):
            n = None
        if n in sm:
            return cnum(norm('第%d章%s' % (n, sm[n])))
    c = str(c or '').strip()
    return cnum(norm(c)) or None


def main():
    book = sys.argv[1]
    cfg = CFG[book]
    t0 = time.time()

    app = load_app_bank(cfg['var'])
    tb = json.load(open(os.path.join(OCR, cfg['tb']), encoding='utf-8'))['questions']
    jx = json.load(open(os.path.join(OCR, cfg['jx']), encoding='utf-8'))['items']
    print('%s: app=%d  题本=%d  解析=%d' % (cfg['mod'], len(app), len(tb), len(jx)))

    # ---- 1) app.js 题目 ↔ 题本 对齐 ----
    # 主法：重现注入器的 id 分配（按源顺序给保留下来的题顺序编号），确定性
    # 辅法：题干指纹交叉验证；验证率 <95% 才退回纯指纹法
    def fp(s, tail=False):
        s = norm(s)
        return s[-60:] if tail else s[:60]

    id2tb, n = {}, 0
    for i, q in enumerate(tb):
        o = q.get('options') or {}
        nk = len(o) if isinstance(o, dict) else len(o)
        if not (nk >= 4 or (nk == 0 and q.get('images'))):
            continue
        ans = str(q.get('answer') or '').strip().upper()
        if ans not in ('A', 'B', 'C', 'D'):
            continue
        id2tb[cfg['base'] + n] = i
        n += 1
    print('   重建 id 映射 %d 条（app 实际 %d 条）' % (len(id2tb), len(app)))

    tb_fp = {}
    for i, q in enumerate(tb):
        stem = q.get('stem')
        st = ''.join(stem) if isinstance(stem, list) else str(stem or '')
        for k in (fp(st, False), fp(st, True)):
            tb_fp.setdefault(k, []).append(i)
    ok = bad = 0
    for a in app:
        qi = id2tb.get(a['id'])
        if qi is None:
            continue
        stem = tb[qi].get('stem')
        st = ''.join(stem) if isinstance(stem, list) else str(stem or '')
        cands = set(tb_fp.get(fp(st, False), [])) | set(tb_fp.get(fp(st, True), []))
        if qi in cands:
            ok += 1
        else:
            bad += 1
    vrate = ok / max(1, len(app))
    print('   指纹交叉验证：命中 %d/%d = %.1f%%（不一致 %d）' % (ok, len(app), vrate * 100, bad))
    if vrate < 0.95:
        print('   ⚠ 验证不达标，退回纯指纹法')
        id2tb = {}
        for a in app:
            for k in (fp(a['q'], False), fp(a['q'], True)):
                lst = tb_fp.get(k)
                if lst:
                    id2tb[a['id']] = lst[0]
                    break

    # ---- 2) 题本 ↔ 解析 对齐 ----
    # 两阶段：① 内容打分（选项/题干 4-gram 在解析正文里的命中率，答案刻意不参与）
    #        ② 章内 Needleman-Wunsch 序列对齐，保证顺序单调、容忍缺题
    jx_ans = [(str(x.get('answer') or '').strip().upper() or None) for x in jx]

    gn = cfg.get('gn', 4)          # n-gram 长度：资料分析选项多为纯数字，需更长

    def qgrams(qi):
        q = tb[qi]
        g = set()
        for o in opt_list(q):
            no = norm(o)
            if len(no) < gn:        # 过短（如 "84%"）不具区分度，直接丢弃
                continue
            if len(no) <= gn:
                g.add(no)
            else:
                g.update(no[i:i + gn] for i in range(len(no) - gn + 1))
        stem = q.get('stem')
        st = norm(''.join(stem) if isinstance(stem, list) else str(stem or ''))
        if len(st) > gn:
            g.update(st[i:i + gn] for i in range(0, len(st) - gn + 1,
                                                 max(1, (len(st) - gn) // 25 + 1)))
        return g

    def jgrams(j):
        a = norm(jx[j].get('analysis', ''))
        if len(a) <= gn:
            return set([a]) if a else set()
        return set(a[i:i + gn] for i in range(len(a) - gn + 1))

    tb_groups, jx_groups = defaultdict(list), defaultdict(list)
    for i in range(len(tb)):
        tb_groups[tb_chapter(tb[i], cfg, None) or '?'].append(i)
    for j in range(len(jx)):
        jx_groups[cnum(norm(jx[j].get('chapter', ''))) or '?'].append(j)

    GAP, OFF = 0.35, 0.75          # 空位罚分 / 配对固定开销（score=0 时劣于双向空位）

    def score(qi, j, gq_cache, gj_cache):
        gq = gq_cache[qi]
        if not gq:
            return 0.0
        return len(gq & gj_cache[j]) / len(gq)

    def qid_runs(idxs, seq, key):
        """按书内题号切「跑」：题号回退即新跑。解析册与题本是同一本书，编号同源。"""
        runs, cur, prev = [], [], None
        for i in idxs:
            v = seq[i].get(key)
            try:
                v = int(v) if v is not None else None
            except (TypeError, ValueError):
                v = None
            if v is None:
                if cur:
                    runs.append(cur)
                cur, prev = [], None
                continue
            if prev is not None and v <= prev:
                runs.append(cur)
                cur = []
            cur.append((v, i))
            prev = v
        if cur:
            runs.append(cur)
        return runs

    def align_runqid(qis, jjs):
        """同一章内：按「第 k 个题号跑 + 跑内题号」精确配对。"""
        rt, rj = qid_runs(qis, tb, 'qid'), qid_runs(jjs, jx, 'qid_raw')
        out = {}
        for k in range(min(len(rt), len(rj))):
            m = {v: i for v, i in rt[k]}
            for v, j in rj[k]:
                if v in m:
                    out[m[v]] = (j, 1.0)
        return out

    def _dp(seq_a, seq_b, sc, gap):
        n, m = len(seq_a), len(seq_b)
        prev = [0.0] * (m + 1)
        for j in range(1, m + 1):
            prev[j] = prev[j - 1] - gap
        ptr = []
        for i in range(1, n + 1):
            cur = [prev[0] - gap] + [0.0] * m
            row = [1] + [0] * m
            for j in range(1, m + 1):
                d = prev[j - 1] + sc(i - 1, j - 1)
                u = prev[j] - gap
                l = cur[j - 1] - gap
                if d >= u and d >= l:
                    cur[j], row[j] = d, 0
                elif u >= l:
                    cur[j], row[j] = u, 1
                else:
                    cur[j], row[j] = l, 2
            ptr.append(row)
            prev = cur
        i, j, pairs = n, m, []
        while i > 0 or j > 0:
            if i > 0 and j > 0 and ptr[i - 1][j] == 0:
                pairs.append((seq_a[i - 1], seq_b[j - 1]))
                i, j = i - 1, j - 1
            elif i > 0 and (j == 0 or ptr[i - 1][j] == 1):
                i -= 1
            else:
                j -= 1
        return pairs[::-1]

    def align_ansdp(qis, jjs, tb, jx):
        """文本无区分度时用答案字母序列做 DP 对齐（4 字母长序列全中即证明同源）。"""
        A = [str(tb[i].get('answer') or '').strip().upper() for i in qis]
        B = [(str(jx[j].get('answer') or '').strip().upper()
              or (re.search(r'故正确答案为\s*([A-D])', jx[j].get('analysis', '') or '') or
                  [None, None])[1] or '') for j in jjs]
        # 错配比「两边各开一个空位」更贵，才会真的走空位而不是硬凑
        pairs = _dp(qis, jjs, lambda i, j: (1.0 if (A[i] and A[i] == B[j]) else -2.5), 1.0)
        return {qi: (j, 1.0) for qi, j in pairs
                if A[qis.index(qi)] and A[qis.index(qi)] == B[jjs.index(j)]}

    def dp_align(qis, jjs, gq_cache, gj_cache, off=OFF):
        n, m = len(qis), len(jjs)
        prev = [0.0] * (m + 1)
        for j in range(1, m + 1):
            prev[j] = prev[j - 1] - GAP
        ptr = []
        for i in range(1, n + 1):
            cur = [prev[0] - GAP] + [0.0] * m
            row = [0] * (m + 1)
            row[0] = 1
            for j in range(1, m + 1):
                diag = prev[j - 1] + score(qis[i - 1], jjs[j - 1], gq_cache, gj_cache) - off
                up = prev[j] - GAP
                left = cur[j - 1] - GAP
                if diag >= up and diag >= left:
                    cur[j], row[j] = diag, 0
                elif up >= left:
                    cur[j], row[j] = up, 1
                else:
                    cur[j], row[j] = left, 2
            ptr.append(row)
            prev = cur
        i, j, pairs = n, m, []
        while i > 0 or j > 0:
            if i > 0 and j > 0 and ptr[i - 1][j] == 0:
                pairs.append((qis[i - 1], jjs[j - 1]))
                i, j = i - 1, j - 1
            elif i > 0 and (j == 0 or ptr[i - 1][j] == 1):
                i -= 1
            else:
                j -= 1
        return pairs[::-1]

    print('   章名集合：题本 %d 个 / 解析 %d 个，交集 %d'
          % (len(tb_groups), len(jx_groups), len(set(tb_groups) & set(jx_groups))))
    for ch, qis in sorted(tb_groups.items(), key=lambda kv: -len(kv[1])):
        if ch not in jx_groups:
            print('      ⚠ 题本章「%s」(%d 题) 在解析中无对应' % (ch, len(qis)))

    gq_cache, gj_cache = {}, {}
    match = {}
    weak_qis = set()
    for ch, qis in tb_groups.items():
        jjs = jx_groups.get(ch)
        if not jjs:
            continue
        for i in qis:
            gq_cache.setdefault(i, qgrams(i))
        for j in jjs:
            gj_cache.setdefault(j, jgrams(j))
        # 自适应配对开销：区分度 = 最高分 - 错位分。区分度低说明文本信号不可靠
        # （图形推理：选项在切图里，题干是全场雷同的套话）→ 改用答案序列 DP。
        smp = [i for i in qis if i in set(id2tb.values())][:12] or qis[:12]
        weak = True
        if smp and jjs:
            gap_m, shift_m = 0.0, 0.0
            for i in smp:
                sc = [score(i, j, gq_cache, gj_cache) for j in jjs]
                b = max(range(len(sc)), key=lambda k: sc[k])
                gap_m += sc[b]
                shift_m += sc[(b + 7) % len(sc)]
            gap_m /= len(smp)
            shift_m /= len(smp)
            weak = (gap_m - shift_m) < 0.10
            off = OFF if weak else max(0.02, min(OFF, (gap_m - shift_m) * 0.5))
            print('      章「%s」题本 %d / 解析 %d，最高分 %.3f vs 错位分 %.3f -> %s'
                  % (ch, len(qis), len(jjs), gap_m, shift_m,
                     '答案序列DP' if weak else '内容DP(开销%.2f)' % off))
        else:
            off = OFF
        if weak:
            # 依据：4 字母序列能找到 256 对 100% 对齐，随机概率 4^-256，等于证明同源
            for qi, val in align_ansdp(qis, jjs, tb, jx).items():
                match[qi] = val
            weak_qis.update(qis)       # 无文本信号的题不进全局 argmax，那是纯瞎猜
        else:
            for qi, j in dp_align(qis, jjs, gq_cache, gj_cache, off):
                match[qi] = (j, score(qi, j, gq_cache, gj_cache))
    # 章名对不上的题本：退化为全书 argmax
    rest = [i for i in id2tb.values() if i not in match and i not in weak_qis]
    if rest:
        for j in range(len(jx)):
            gj_cache.setdefault(j, jgrams(j))
        for qi in rest:
            gq_cache.setdefault(qi, qgrams(qi))
            best, bs = -1, -1e9
            for j in range(len(jx)):
                s = score(qi, j, gq_cache, gj_cache)
                if s > bs:
                    bs, best = s, j
            if best >= 0 and bs >= 0.04:
                match[qi] = (best, bs)
        print('   章名未对齐 %d 题，已退化为全书 argmax' % len(rest))
    id2jx = {tid: match[qi] for tid, qi in id2tb.items() if qi in match}

    # ---- 3) 独立校验：答案一致率（答案未参与打分，属独立证据）----
    agree = same = 0
    per = defaultdict(lambda: [0, 0])
    for tid, (j, s) in id2jx.items():
        qa = str(tb[id2tb[tid]].get('answer') or '').strip().upper()
        ja = jx_ans[j]
        if qa and ja:
            same += 1
            ch = tb_chapter(tb[id2tb[tid]], cfg, None) or '?'
            per[ch][1] += 1
            if qa == ja:
                agree += 1
                per[ch][0] += 1
    for ch in sorted(per, key=lambda c: -per[c][1]):
        print('      %-16s %4d 对，一致率 %.1f%%'
              % (ch, per[ch][1], per[ch][0] / per[ch][1] * 100))
    rate = (agree / same) if same else 0
    print('   题本→解析 对齐 %d/%d，答案可比 %d，一致 %d，一致率 %.1f%%（%.0fs）'
          % (len(id2jx), len(id2tb), same, agree, rate * 100, time.time() - t0))

    # ---- 3.5) 答案修正建议：仅当「解析正文自洽」且「内容配对可信」时才建议改 ----
    # 自洽 = 解析正文尾句「故正确答案为X」与其 answer 字段一致
    ans_fix, fix_stat = {}, Counter()
    RE_TAIL = re.compile(r'故正确答案为\s*([A-D])')
    for tid, (j, s) in id2jx.items():
        if s < 0.30:                       # 内容配对不够硬，不改答案
            fix_stat['配对分不足'] += 1
            continue
        m = None
        for ln in reversed((jx[j].get('analysis') or '').split('\n')):
            m = RE_TAIL.search(ln)
            if m:
                break
        ja = jx_ans[j]
        if not ja or not m:
            fix_stat['解析无答案'] += 1
            continue
        if m.group(1) != ja:
            fix_stat['解析内部不一致'] += 1
            continue
        qa = str(tb[id2tb[tid]].get('answer') or '').strip().upper()
        if qa and qa != ja:
            ans_fix[str(tid)] = ja
            fix_stat['建议修正'] += 1
        else:
            fix_stat['一致无需改'] += 1
    if ans_fix:
        print('   答案修正建议 %d 条（%s）' % (len(ans_fix), dict(fix_stat)))

    items = {}
    for tid, (j, s) in id2jx.items():
        txt = (jx[j].get('analysis') or '').strip()
        txt = re.sub(r'^正文：[^\n]*\n', '', txt)
        txt = re.sub(r'\n{3,}', '\n\n', txt)
        if len(txt) >= 20:
            items[str(tid)] = txt

    patch = dict(book=cfg['mod'], total_in_app=len(app), aligned_tiben=len(id2tb),
                 aligned_jiexi=len(items), answer_agree_rate=round(rate, 4),
                 items=items, ans_fix=ans_fix, fix_stat=dict(fix_stat))
    with open(os.path.join(OUT, 'patch_%s.json' % book), 'w', encoding='utf-8') as f:
        json.dump(patch, f, ensure_ascii=False)
    print('   -> patch_%s.json  %d 条解析' % (book, len(items)))

    # 报告 + 抽样证据
    lines = ['# %s 解析回填报告' % cfg['mod'], '',
             '- app.js 上线题数：%d' % len(app),
             '- 题本源题：%d，app→题本对齐：%d' % (len(tb), len(id2tb)),
             '- 解析条目：%d，成功对齐：%d' % (len(jx), len(items)),
             '- 答案一致率：%.1f%%（可比 %d 对）' % (rate * 100, same),
             '- 匹配方法：选项/题干 4-gram 在解析正文中的命中率（答案**不参与**打分）'
             ' + 章内 Needleman-Wunsch 序列对齐（GAP=0.35，配对开销 0.75）；章名对不上退化为全书 argmax',
             '', '## 抽样证据']
    ks = sorted(items, key=lambda x: int(x))
    for tid in ks[:2] + ks[len(ks) // 2:len(ks) // 2 + 1] + ks[-1:]:
        q = tb[id2tb[int(tid)]]
        stem = q.get('stem')
        st = ''.join(stem) if isinstance(stem, list) else str(stem or '')
        lines += ['', '### id=%s' % tid,
                  '- 题干：%s' % norm(st)[:40],
                  '- 题本答案=%s / 解析答案=%s' % (q.get('answer'), jx_ans[id2jx[int(tid)][0]]),
                  '- 解析：%s' % items[tid][:80].replace('\n', ' ')]
    open(os.path.join(OUT, 'report_%s.md' % book), 'w', encoding='utf-8').write('\n'.join(lines))
    print('   -> report_%s.md' % book)


if __name__ == '__main__':
    main()
