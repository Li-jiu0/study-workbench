# -*- coding: utf-8 -*-
"""L7 收尾核查：
1) 新增全局名是否被「其它文件」重复声明（铁律 2）
2) 本任务只应改动 2 个目标文件
"""
import os
import re

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, '_tmp_l7_final.txt')

MINE = {os.path.join(ROOT, 'AI模拟面试.html'), os.path.join(ROOT, 'assets', 'iv-prep.js')}
NEW = ['IV_STAGES', 'IV_BAR_STAGES', 'IV_TERMINAL', 'IV_STAGE_LABEL', 'IV_STAGE_MACHINE',
       'IV_TRANSITIONS', 'IV_BACK_HINT', 'IV_SNAPSHOT', 'IV_CAN_GOTO', 'IV_GOTO',
       'SESSION_QUESTIONS', 'PENDING_PREP_Q', 'readingTimer', 'pendingFeedbackTimer', 'toastTimer',
       'ivToast', 'ivGotoStage', 'ivCanGoto', 'ivRenderStageBar', 'ivRenderStageTip',
       'ivJumpToStage', 'ivBindStageBar', 'ivFindSeg', 'ivToggleClass', 'ivStageNo', 'ivBarIndex',
       'currentQ', 'finishReading', 'backToReading', 'backToPreparing', 'reanswerCurrent',
       'armReadingAutoAdvance', 'ivSnapshot', 'ivExportApi', 'ivReadQuery',
       'ivBuildSessionQuestions', 'ivInit', 'IV_MACHINE_CLIENT', 'IV_BAR_STAGES_CLIENT',
       'IV_TERMINAL_CLIENT', 'IV_STAGE_LABELS_CLIENT', 'IV_BACK_PATHS_CLIENT',
       'IP_shareStages', 'IP_stageLegend']

buf = []
decl_re = {}
for name in NEW:
    decl_re[name] = re.compile(
        r'(^|[;{}\s])(?:var|let|const)\s+' + name + r'\b'
        r'|(^|[;{}\s])function\s+' + name + r'\b'
        r'|window\.' + name + r'\s*='
        r'|(^|[;{}\s])class\s+' + name + r'\b')

hits = {}
scan = 0
for dp, dn, fn in os.walk(ROOT):
    parts = dp.replace(ROOT, '').strip('\\').split('\\')
    if any(p in ('.git', 'node_modules', '备份', 'android', '.tmp_eng', '_w2t1_img', '_tmp_l7_img') for p in parts):
        continue
    for f in fn:
        if not f.endswith(('.html', '.js')):
            continue
        if '.bak' in f:
            continue
        fp = os.path.join(dp, f)
        rel = os.path.relpath(fp, ROOT)
        try:
            t = open(fp, 'r', encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        scan += 1
        for name in NEW:
            if decl_re[name].search(t):
                hits.setdefault(name, []).append(rel)

buf.append('[SCAN] files=%d' % scan)
buf.append('')
buf.append('=== 新增全局名的声明者（应仅出现在本任务 2 个文件中）===')
bad = 0
for name in NEW:
    who = sorted(set(hits.get(name, [])))
    if not who:
        buf.append('  %-28s %s' % (name, '(未在任何文件找到声明 -> 检查是否漏写)'))
        continue
    others = [w for w in who if w not in ('AI模拟面试.html', 'assets\\iv-prep.js', 'assets/iv-prep.js')]
    flag = ''
    if others:
        flag = '  <<< 冲突：' + ', '.join(others)
        bad += 1
    buf.append('  %-28s %s%s' % (name, ', '.join(who), flag))

buf.append('')
buf.append('RESULT: %s (conflicts=%d)' % ('CLEAN' if bad == 0 else 'CONFLICT', bad))

open(OUT, 'w', encoding='utf-8').write('\n'.join(buf))
print('OK conflicts=%d' % bad)
