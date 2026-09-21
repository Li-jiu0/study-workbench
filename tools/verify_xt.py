# -*- coding: utf-8 -*-
import zipfile, os, hashlib, re
apk = r'D:\下载的文件\学习工作台\学习工作台-安卓App.apk'
tmp = os.path.join(os.environ['TEMP'], 'apkverify7')
os.makedirs(tmp, exist_ok=True)
shutil = __import__('shutil')
shutil.copy2(apk, os.path.join(tmp, 'app.apk'))
with open(apk, 'rb') as f:
    print('MD5:', hashlib.md5(f.read()).hexdigest())
with zipfile.ZipFile(apk) as z:
    names = z.namelist()
    print('学途.html in apk:', 'assets/学途.html' in names)
    xt = z.read('assets/学途.html').decode('utf-8', errors='replace')
    for sym in ['xtSwitch', 'renderHome', 'renderStudy', 'renderExam', 'renderNotes', 'renderMe',
                'goStudy', 'startStudySession', 'getWrongDetails', 'chooseWrongReason',
                'loadSubjects', 'loadGoals', 'openVoiceTrain', 'toggleAiPanel',
                'app.js?v=20260913t', 'voiceplayer.js']:
        print('学途 %-24s: %s' % (sym, xt.count(sym)))
    js = z.read('assets/assets/app.js').decode('utf-8', errors='replace')
    for sym in ['STUDY_RECORDS_KEY', 'WRONG_REASON_KEY', 'SUBJECTS_KEY', 'GOALS_KEY',
                'calcStreakDays', 'calcWeekMinutes', 'calcMonthMinutes', 'getWrongReasonStats',
                'loadStudyRecords', 'endStudySession', 'goStudy']:
        print('app.js %-24s: %s' % (sym, js.count(sym)))
    # 登录门禁跳转目标
    m = re.search(r"location\.href\s*=\s*['\"]([^'\"]+)['\"]", js)
    for mm in re.finditer(r"登录\.html", js):
        i = mm.start()
        seg = js[max(0, i - 260):i + 40].replace('\n', ' ')
        print('LOGIN-GATE @', i, ':', seg[-260:])
