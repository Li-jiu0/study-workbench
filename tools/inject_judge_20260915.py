# -*- coding: utf-8 -*-
"""批次八：注入 判断推理 996 题 + 修复行测切图死链。
1) 复制 数量关系_题本\\crops\\*.png   -> assets/images/（修复已上线 172 处 [IMG:] 死链）
2) 复制 判断推理_题本\\images\\*.png  -> assets/images/
3) 转换判断推理 questions.json 为 bank 格式并注入 app.js（id 2905 起，INLINE_JUDGE_BANK）
"""
import os, json, io, sys, shutil, re, glob

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

OCR = r'D:\下载的文件\行测5000题【26年3月版】（最新27版）\_ocr_work'
TREE = r'C:\Users\ATM\WorkBuddy\Worktrees\学习工作台\main-6599a366'
APP = os.path.join(TREE, 'assets', 'app.js')
IMG_DST = os.path.join(TREE, 'assets', 'images')
START_ID = 2905          # 判断推理 id 区间 2905-3904
BOOK = '判断推理'
SRC_Q = os.path.join(OCR, '判断推理_题本', 'questions.json')

os.makedirs(IMG_DST, exist_ok=True)

# ---------- 1&2 复制切图 ----------
def copy_pngs(src_dir, tag):
    if not os.path.isdir(src_dir):
        print('   跳过（目录不存在）:', src_dir)
        return 0, 0
    n = sz = 0
    for f in os.listdir(src_dir):
        if not f.lower().endswith('.png'):
            continue
        s = os.path.join(src_dir, f)
        d = os.path.join(IMG_DST, f)
        if not os.path.exists(d) or os.path.getsize(s) != os.path.getsize(d):
            shutil.copy2(s, d)
        n += 1
        sz += os.path.getsize(s)
    print('   %s: 复制 %d 张, %.1f MB' % (tag, n, sz / 1048576))
    return n, sz

print('=== 复制切图到 assets/images/ ===')
copy_pngs(os.path.join(OCR, '数量关系_题本', 'crops'), '数量关系crops(修死链)')
copy_pngs(os.path.join(OCR, '判断推理_题本', 'images'), '判断推理images')

# ---------- 3 读题并转换 ----------
def unwrap(o):
    if isinstance(o, list):
        return o
    if isinstance(o, dict):
        for k in ('items', 'questions', 'data', 'list'):
            if isinstance(o.get(k), list):
                return o[k]
    return []

arr = unwrap(json.load(open(SRC_Q, encoding='utf-8')))
print('\n=== 源题 %d 条，字段: %s' % (len(arr), list(arr[0].keys())))

# 子题型映射
SUBS = {1: '图形推理', 2: '定义判断', 3: '类比推理', 4: '逻辑判断'}
# 先看 chapter_name 是否可用
cn = {}
for q in arr:
    cn[str(q.get('chapter_name') or q.get('chapter'))] = cn.get(str(q.get('chapter_name') or q.get('chapter')), 0) + 1
print('chapter_name/chapter 分布:', sorted(cn.items(), key=lambda x: -x[1])[:10])

bank = []
skipped = 0
for i, q in enumerate(arr):
    opts = q.get('options') or {}
    if not isinstance(opts, dict):
        opts = {chr(65 + k): v for k, v in enumerate(opts)}
    letters = sorted(opts.keys())
    has_img = bool(q.get('images'))
    if len(letters) >= 4:
        o = [str(opts.get(L, '')).strip() for L in 'ABCD']
    elif len(letters) == 0 and has_img:
        # 图形推理：四个选项都是图形，已包含在题干切图内，用 A/B/C/D 占位供选择
        o = ['A', 'B', 'C', 'D']
    else:
        skipped += 1
        continue
    ans = str(q.get('answer') or '').strip().upper()
    if ans not in ('A', 'B', 'C', 'D'):
        skipped += 1
        continue
    stem = q.get('stem') or []
    if isinstance(stem, list):
        text = '\n'.join(str(s) for s in stem).strip()
    else:
        text = str(stem).strip()
    ch = q.get('chapter')
    try:
        ch = int(ch)
    except Exception:
        ch = 0
    sub = SUBS.get(ch) or str(q.get('chapter_name') or '判断推理')
    sec = str(q.get('section_key') or '') + str(q.get('group') or '')
    diff = 2 if '高难进阶' in sec else (3 if '新考法' in sec else 1)
    bank.append({
        'id': START_ID + len(bank),
        'type': BOOK,
        'sub': sub,
        'diff': diff,
        'q': text,
        'o': o,
        'a': ord(ans) - 65,
        'x': '',
        'tip': '',
    })

print('转换成功 %d 条，跳过 %d 条（选项不足或无答案）' % (len(bank), skipped))
from collections import Counter
print('子题型分布:', dict(Counter(b['sub'] for b in bank)))
print('难度分布:', dict(Counter(b['diff'] for b in bank)))
withimg = sum(1 for b in bank if '[IMG:' in b['q'])
print('含图题: %d 条' % withimg)

# ---------- 4 注入 app.js ----------
compact = json.dumps(bank, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
block = (
    '\n// ===== 粉笔5000题·判断推理 内联导入（绕过 file:// fetch 限制）=====\n'
    '(function() {\n'
    '  try {\n'
    '    var INLINE_JUDGE_BANK = %s;\n'
    '    if (typeof mergeExamBankQuestions === \'function\' && Array.isArray(INLINE_JUDGE_BANK)) {\n'
    '      var changed = mergeExamBankQuestions(INLINE_JUDGE_BANK, false);\n'
    '      console.log(\'[inline-judge] 合并判断推理题 \' + INLINE_JUDGE_BANK.length + \' 道，实际新增 \' + changed + \' 道\');\n'
    '      if (typeof renderExamQuestion === \'function\') { try { renderExamQuestion(); } catch(e) {} }\n'
    '    } else {\n'
    '      console.warn(\'[inline-judge] mergeExamBankQuestions 不可用，跳过\');\n'
    '    }\n'
    '  } catch(e) {\n'
    '    console.error(\'[inline-judge] 导入失败:\', e);\n'
    '  }\n'
    '})();\n\n' % compact
)

html = open(APP, encoding='utf-8').read()
before = len(html)
html = re.sub(r'\n// ===== 粉笔5000题·判断推理 内联导入.*?\}\)\(\);\n', '\n', html, flags=re.S)
print('\n清理旧块: -%d 字节' % (before - len(html)))
anchor = '/* 【R50】题库分片合并完成后刷新行测首屏。'
if anchor not in html:
    raise SystemExit('找不到注入锚点')
html = html.replace(anchor, block.lstrip('\n') + anchor, 1)
open(APP, 'w', encoding='utf-8').write(html)
print('已注入 app.js（锚点：R50 注释之前），新增 %d 字节' % len(block))
print('DONE')
