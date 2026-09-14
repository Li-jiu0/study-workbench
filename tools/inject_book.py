# -*- coding: utf-8 -*-
"""批次八·通用行测题本注入器（资料分析/言语理解/常识判断 复用）。

用法示例：
  python tools/inject_book.py --book 资料分析 --tag ZILIAO --id 3905 ^
      --src "D:\\...\\_ocr_work\\资料分析_题本\\questions.json" ^
      --imgdir "D:\\...\\_ocr_work\\资料分析_题本\\images"

行为：
  1) 复制 --imgdir 下 *.png 到 代码树 assets/images/
  2) 转换题目为 bank 格式 {id,type,sub,diff,q,o[4],a,x,tip}
     - 资料分析等含共享材料时，material 并入题干
     - options 为空但题目有切图（图形/图表选项）→ 用 A/B/C/D 占位
     - options 1~3 个且无图 → 跳过（OCR 漏抓，待补）
  3) 注入 app.js（R50 锚点前），可重复运行（先清理旧块）
"""
import os, json, io, sys, shutil, re, argparse
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
TREE = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366'
APP = os.path.join(TREE, 'assets', 'app.js')
IMG_DST = os.path.join(TREE, 'assets', 'images')
ANCHOR = '/* 【R50】题库分片合并完成后刷新行测首屏。'

ap = argparse.ArgumentParser()
ap.add_argument('--book', required=True)       # 题型名，如 资料分析
ap.add_argument('--tag', required=True)        # 英文标识，如 ZILIAO
ap.add_argument('--id', required=True, type=int)
ap.add_argument('--src', required=True)
ap.add_argument('--imgdir', default='')
ap.add_argument('--subfield', default='chapter_name')
ap.add_argument('--submap', default='', help='子题型名映射，如 "1:片段阅读,2:语句表达"')
args = ap.parse_args()

os.makedirs(IMG_DST, exist_ok=True)

# ---------- 1 复制切图 ----------
if args.imgdir and os.path.isdir(args.imgdir):
    n = sz = 0
    for f in os.listdir(args.imgdir):
        if not f.lower().endswith('.png'):
            continue
        s, d = os.path.join(args.imgdir, f), os.path.join(IMG_DST, f)
        if not os.path.exists(d) or os.path.getsize(s) != os.path.getsize(d):
            shutil.copy2(s, d)
        n += 1
        sz += os.path.getsize(s)
    print('切图复制: %d 张, %.1f MB' % (n, sz / 1048576))
else:
    print('切图目录跳过:', args.imgdir or '(未指定)')

# ---------- 2 转换 ----------
def unwrap(o):
    if isinstance(o, list):
        return o
    if isinstance(o, dict):
        for k in ('items', 'questions', 'data', 'list'):
            if isinstance(o.get(k), list):
                return o[k]
    return []

arr = unwrap(json.load(open(args.src, encoding='utf-8')))
print('源题: %d 条' % len(arr))

DIFF_MAP = {'夯实基础': 1, '提升进阶': 2, '高难进阶': 2, '新考法': 3, '专项集训': 2}
SUBMAP = {}
if args.submap:
    for kv in args.submap.split(','):
        if ':' in kv:
            k, v = kv.split(':', 1)
            SUBMAP[k.strip()] = v.strip()
bank, skipped = [], []
for q in arr:
    opts = q.get('options') or {}
    if not isinstance(opts, dict):
        opts = {chr(65 + k): v for k, v in enumerate(opts)}
    nk = len(opts)
    has_img = bool(q.get('images'))
    if nk >= 4:
        o = [str(opts.get(L, '')).strip() for L in 'ABCD']
    elif nk == 0 and has_img:
        o = ['A', 'B', 'C', 'D']          # 图形/图表选项在切图内
    else:
        skipped.append(q.get('qid'))
        continue
    ans = str(q.get('answer') or '').strip().upper()
    if ans not in ('A', 'B', 'C', 'D'):
        skipped.append(q.get('qid'))
        continue

    stem = q.get('stem') or []
    text = '\n'.join(str(s) for s in stem).strip() if isinstance(stem, list) else str(stem).strip()
    # 共享材料（资料分析的表格/文字资料）并入题干，否则无法作答
    mat = q.get('material') or ''
    if isinstance(mat, list):
        mat = '\n'.join(str(s) for s in mat)
    mat = str(mat).strip()
    if mat and mat not in text:
        text = mat + '\n' + text

    sub = str(q.get(args.subfield) or q.get('chapter') or args.book).strip()
    sub = sub.replace(' ', '')
    if SUBMAP:
        sub = SUBMAP.get(str(q.get('chapter')), SUBMAP.get(sub, sub))
    diff = DIFF_MAP.get(str(q.get('difficulty') or '').strip(), 1)
    bank.append({'id': args.id + len(bank), 'type': args.book, 'sub': sub,
                 'diff': diff, 'q': text, 'o': o, 'a': ord(ans) - 65,
                 'x': '', 'tip': ''})

print('转换 %d 条，跳过 %d 条（qid 样例 %s）' % (len(bank), len(skipped), skipped[:8]))
print('子题型分布:', dict(Counter(b['sub'] for b in bank).most_common(10)))
print('难度分布:', dict(Counter(b['diff'] for b in bank)))
print('含图题: %d' % sum(1 for b in bank if '[IMG:' in b['q']))

# ---------- 3 注入 ----------
compact = json.dumps(bank, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
var = 'INLINE_%s_BANK' % args.tag
key = '[inline-%s]' % args.tag.lower()
block = (
    '\n// ===== 粉笔5000题·%s 内联导入（绕过 file:// fetch 限制）=====\n'
    '(function() {\n'
    '  try {\n'
    '    var %s = %s;\n'
    '    if (typeof mergeExamBankQuestions === \'function\' && Array.isArray(%s)) {\n'
    '      var changed = mergeExamBankQuestions(%s, false);\n'
    '      console.log(\'%s 合并%s题 \' + %s.length + \' 道，实际新增 \' + changed + \' 道\');\n'
    '      if (typeof renderExamQuestion === \'function\') { try { renderExamQuestion(); } catch(e) {} }\n'
    '    } else {\n'
    '      console.warn(\'%s mergeExamBankQuestions 不可用，跳过\');\n'
    '    }\n'
    '  } catch(e) {\n'
    '    console.error(\'%s 导入失败:\', e);\n'
    '  }\n'
    '})();\n\n' % (args.book, var, compact, var, var, key, args.book, var, key, key)
)

html = open(APP, encoding='utf-8').read()
before = len(html)
html = re.sub(r'\n// ===== 粉笔5000题·%s 内联导入.*?\}\)\(\);\n' % args.book, '\n', html, flags=re.S)
print('清理旧块: -%d 字节' % (before - len(html)))
if ANCHOR not in html:
    raise SystemExit('找不到注入锚点')
html = html.replace(ANCHOR, block.lstrip('\n') + ANCHOR, 1)
open(APP, 'w', encoding='utf-8').write(html)
print('已注入 %s（%d 题，%d 字节）' % (var, len(bank), len(block)))
print('DONE')
