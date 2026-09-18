# -*- coding: utf-8 -*-
"""L7 自检：EOL/BOM、内联脚本抽取、标签配对、禁用语法、原生弹窗。"""
import os
import re
import subprocess

ROOT = r'D:\下载的文件\学习工作台'
HTML = os.path.join(ROOT, 'AI模拟面试.html')
JS = os.path.join(ROOT, 'assets', 'iv-prep.js')
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
OUT = os.path.join(ROOT, '_tmp_l7_selfcheck.txt')

buf = []


def w(x):
    buf.append(str(x))


raw = open(HTML, 'rb').read()
w('[EOL] AI模拟面试.html CRLF=%d LF=%d BOM=%s size=%d' % (
    raw.count(b'\r\n'), raw.count(b'\n'), raw[:3] == b'\xef\xbb\xbf', len(raw)))
w('[EOL] expect CRLF==LF and BOM True -> %s' % ('OK' if raw.count(b'\r\n') == raw.count(b'\n') and raw[:3] == b'\xef\xbb\xbf' else 'FAIL'))

s = raw.decode('utf-8-sig')

# ---- 禁用语法 ----
banned = {
    'optional-chain ?.': r'\?\.',
    'nullish ??': r'\?\?',
    'replaceAll': r'replaceAll',
    'Object.fromEntries': r'Object\.fromEntries',
    '.at(': r'\.at\(',
    'lookbehind (?<=': r'\(\?<=',
    'lookbehind (?<!': r'\(\?<!',
    'exponent **': r'[A-Za-z0-9_$)\]]\s*\*\*\s*[A-Za-z0-9_$(]',
    'catch-without-binding': r'catch\s*\{',
    'arrow =>': r'=>',
    'object spread {...': r'\{\s*\.\.\.',
    'top-level await': r'(?m)^\s*await\s',
    'alert(': r'(?<![\w$])alert\s*\(',
    'confirm(': r'(?<![\w$])confirm\s*\(',
    'prompt(': r'(?<![\w$])prompt\s*\(',
}
for name, pat in banned.items():
    m = re.findall(pat, s)
    w('[BAN] %-24s hits=%d %s' % (name, len(m), 'OK' if not m else '<<< ' + repr(m[:5])))

# ---- 标签配对（剔除 script/style 内容）----
noscript = re.sub(r'<script[\s\S]*?</script>', '', s)
nostyle = re.sub(r'<style[\s\S]*?</style>', '', noscript)
body = re.sub(r'<style[\s\S]*?</style>', '', noscript)


def pair(txt, tag):
    o = len(re.findall(r'<' + tag + r'[\s>]', txt))
    c = len(re.findall(r'</' + tag + r'>', txt))
    return o, c


for tag in ['div', 'button', 'span', 'textarea', 'ul', 'p', 'svg', 'head', 'body', 'html']:
    o, c = pair(nostyle, tag)
    w('[TAG] %-9s open=%d close=%d %s' % (tag, o, c, 'OK' if o == c else '<<< MISMATCH'))
so = len(re.findall(r'<script[\s>]', s))
sc = len(re.findall(r'</script>', s))
w('[TAG] %-9s open=%d close=%d %s' % ('script', so, sc, 'OK' if so == sc else '<<< MISMATCH'))
# 注释配对
co = s.count('<!--')
cc = s.count('-->')
w('[TAG] comment   open=%d close=%d %s' % (co, cc, 'OK' if co == cc else '<<< MISMATCH'))

# ---- 抽取内联脚本 & node --check ----
blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', s)
w('[JS] inline blocks=%d' % len(blocks))
alljs = ''
for i, b in enumerate(blocks):
    if len(b.strip()) < 20:
        continue
    fp = os.path.join(ROOT, '_tmp_l7_inline_%d.js' % i)
    open(fp, 'w', encoding='utf-8').write(b)
    r = subprocess.run([NODE, '--check', fp], capture_output=True, text=True)
    w('[JS] inline#%d node --check => rc=%d %s' % (i, r.returncode, (r.stderr or '').strip()[:400]))
    alljs += b + '\n'
w('[JS] inline total chars=%d' % len(alljs))

# iv-prep.js
jr = subprocess.run([NODE, '--check', JS], capture_output=True, text=True)
w('[JS] iv-prep.js node --check => rc=%d %s' % (jr.returncode, (jr.stderr or '').strip()[:400]))
jraw = open(JS, 'rb').read()
w('[EOL] iv-prep.js CRLF=%d LF=%d BOM=%s' % (jraw.count(b'\r\n'), jraw.count(b'\n'), jraw[:3] == b'\xef\xbb\xbf'))

# 关键 id / 函数名保留检查
need = ['id="stageBar"', 'id="stageTip"', 'id="setupPanel"', 'id="chatContainer"', 'id="evalPanel"',
        'id="typeOptions"', 'id="posOptions"', 'id="timerValue"', 'id="timerFill"', 'id="timerLabel"',
        'id="progressDots"', 'id="questionInfo"', 'id="chatMessages"', 'id="aiAvatar"', 'id="inputBox"',
        'id="sendBtn"', 'id="prepBtn"', 'id="composer"', 'id="readComposer"', 'id="answerAux"',
        'id="inputTabs"', 'id="tabText"', 'id="tabVoice"', 'id="modeHint"', 'id="evalScores"',
        'id="evalGood"', 'id="evalImprove"', 'id="evalOverall"', 'id="topProgress"',
        'onclick="startInterview()"', 'onclick="sendMessage()"', 'onclick="restartInterview()"',
        'onclick="goBack()"', 'onkeydown="handleKeyDown(event)"', 'onclick="beginAnswering()"',
        'onclick="switchInputMode(\'text\')"', 'onclick="switchInputMode(\'voice\')"',
        'onclick="finishReading()"', 'function ivGotoStage', 'function startInterview',
        'function nextFromReview', 'function generateFeedback', 'function showEvaluation',
        'function markAllStagesDone', 'function setStage', 'var STAGES',
        ]
miss = [n for n in need if n not in s]
w('[KEEP] missing=%d %s' % (len(miss), miss if miss else 'ALL OK'))

# 新函数定义存在
newfns = ['ivGotoStage', 'ivCanGoto', 'ivRenderStageBar', 'ivRenderStageTip', 'ivJumpToStage',
          'ivBindStageBar', 'ivFindSeg', 'ivToggleClass', 'ivStageNo', 'ivBarIndex', 'currentQ',
          'finishReading', 'backToReading', 'backToPreparing', 'reanswerCurrent',
          'armReadingAutoAdvance', 'ivToast', 'ivReadQuery', 'ivBuildSessionQuestions',
          'ivExportApi', 'ivInit', 'ivToggleClass']
miss2 = [n for n in newfns if ('function ' + n) not in s]
w('[NEW] missing=%d %s' % (len(miss2), miss2 if miss2 else 'ALL OK'))

open(OUT, 'w', encoding='utf-8').write('\n'.join(buf))
print('OK')
