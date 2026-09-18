# -*- coding: utf-8 -*-
"""校验：AI模拟面试.html 声明的全局名 / 计划新增的全局名，是否与页面已加载的 assets 冲突。"""
import os
import re

ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, '_tmp_l7_globals.txt')

LOADED = ['assets/xt-polyfill.js', 'assets/config.js', 'assets/icon-map.js',
          'assets/ai-config.js', 'assets/ai-presets.js', 'assets/ai-service.js']

# 本页声明的全局名（来自现网文件）
PAGE = ['INTERVIEW_QUESTIONS', 'currentQuestion', 'userAnswers', 'userResults', 'interviewStarted',
        'timerInterval', 'timeLeft', 'currentTotal', 'timerMode', 'currentStage', 'selectedType',
        'selectedPos', 'STAGES', 'ico', 'owlSvg', 'scrollChat', 'renderDots', 'updateProgress',
        'setStage', 'markAllStagesDone', 'startTimer', 'updateTimerDisplay', 'startInterview',
        'loadQuestion', 'beginAnswering', 'submitAnswer', 'sendMessage', 'autoSubmit', 'nextFromReview',
        'nextQuestion', 'addQuestionMessage', 'addAIMessage', 'addUserMessage', 'showTyping', 'hideTyping',
        'toggleQBlock', 'generateFeedback', 'renderFeedbackCard', 'switchInputMode', 'showEvaluation',
        'restartInterview', 'handleKeyDown', 'goBack']

# 计划新增的全局名
NEW = ['IV_STAGES', 'IV_STAGE_MACHINE', 'IV_STAGE_LABEL', 'IV_STAGE_ACTION',
       'ivToast', 'ivGotoStage', 'ivCanGoto', 'ivStageIndex', 'ivRenderStageBar',
       'SESSION_QUESTIONS', 'PENDING_PREP_Q', 'ivBuildSessionQuestions', 'ivReadQuery',
       'ivStageOf', 'ivRestartCurrentQuestion', 'ivBackToReading', 'ivBackToPreparing', 'ivReanswer',
       'ivStageTip', 'IV_TERMINAL']

buf = []
for rel in LOADED:
    p = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(p):
        buf.append('[MISS] ' + rel)
        continue
    src = open(p, 'r', encoding='utf-8', errors='ignore').read()
    # 去掉字符串/注释的粗略清洗，降低误报
    clean = re.sub(r'/\*[\s\S]*?\*/', ' ', src)
    clean = re.sub(r'//[^\n]*', ' ', clean)
    decls = set()
    decls |= set(re.findall(r'(?:^|[;{}\s])(?:var|let|const)\s+([A-Za-z_$][\w$]*)', clean))
    decls |= set(re.findall(r'(?:^|[;{}\s])function\s+([A-Za-z_$][\w$]*)', clean))
    decls |= set(re.findall(r'window\.([A-Za-z_$][\w$]*)\s*=', clean))
    for n in PAGE + NEW:
        if n in decls:
            buf.append('[COLLIDE] %s declares global <%s>' % (rel, n))
    buf.append('[SCAN] %s -> %d top-level decls' % (rel, len(decls)))

buf.append('')
buf.append('--- page globals not found in loaded assets (safe) ---')
all_decls = set()
for rel in LOADED:
    p = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(p):
        continue
    src = open(p, 'r', encoding='utf-8', errors='ignore').read()
    clean = re.sub(r'/\*[\s\S]*?\*/', ' ', src)
    clean = re.sub(r'//[^\n]*', ' ', clean)
    all_decls |= set(re.findall(r'(?:^|[;{}\s])(?:var|let|const)\s+([A-Za-z_$][\w$]*)', clean))
    all_decls |= set(re.findall(r'(?:^|[;{}\s])function\s+([A-Za-z_$][\w$]*)', clean))
    all_decls |= set(re.findall(r'window\.([A-Za-z_$][\w$]*)\s*=', clean))
for n in PAGE + NEW:
    if n in all_decls:
        buf.append('  !!! ' + n)
buf.append('  (empty above = no collision)')

open(OUT, 'w', encoding='utf-8').write('\n'.join(buf))
print('OK')
