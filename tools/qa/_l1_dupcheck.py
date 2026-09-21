# -*- coding: utf-8 -*-
"""L1 自检：检查 app.js 新增全局名是否被别的文件重复声明（顶层 var/const/let/function）。
只扫描线上代码树：根 *.html + assets/*.js，排除 备份/ tools/ *.bak* / *.backup* / *_smoke.js
结果写入 UTF-8 文件，避免中文路径下 print 崩溃。
"""
import os
import re

ROOT = r'D:\下载的文件\学习工作台'
EXCLUDE_DIRS = {'备份', 'tools', 'node_modules', '.git', 'ai-server'}

NAMES = [
    'AI_PARTNER_ID_ALIAS', 'AI_PARTNERS', 'AI_QUICK_ACTIONS',
    'XT_AI_MODEL_KEY', 'XT_AI_HISTORY_KEY',
    'xtHomeChatId', 'getSharedAiModelId', 'setSharedAiModelId', 'xtAiBuiltinModels',
    'getSharedAiModelName', 'syncHomeChatToShared', 'loadHomeChatFromShared',
    'removeHomeChatFromShared', 'aiPartnerIconHtml', 'aiBaseReady', 'aiStreamCapable',
    'aiStatusText', 'ensureAiModelPicker', 'renderAiModelList', 'aiModelRow',
    'openAiModelPicker', 'closeAiModelPicker', 'selectAiModel', 'ensureAiCardCss',
    'ensureAiQuickBar', 'openFullAiPage', 'normalizeAiPartnerId', 'migrateAiPartnerId',
    'ensureAiPartnerPickerCss', 'ensureAiPartnerUI', 'renderAiPartnerList',
    'openAiPartnerPicker', 'closeAiPartnerPicker', 'selectAiPartner',
    'aiDispatchReply', 'buildAiBaseMessages', 'fetchAssistantReply', 'aiDegradeReply',
    'copyAiText', 'regenerateAiLast', 'openAiQuickActions', 'useAiQuickAction',
    'AI_CHAT_KEY', 'AI_PARTNER_KEY',
]

DECL_RE = {}
for n in NAMES:
    DECL_RE[n] = re.compile(
        r'(?:^|[\s;{}()\[\],])(?:var|let|const)\s+' + re.escape(n) + r'\s*(?:=|;|[\s,])'
        r'|(?:^|[\s;{}()\[\],])function\s+' + re.escape(n) + r'\s*\('
        r'|window\.' + re.escape(n) + r'\s*=',
        re.M)

files = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
    for fn in filenames:
        if fn.endswith('.js') or fn.endswith('.html'):
            if '.bak' in fn or '.backup' in fn or fn.startswith('_'):
                continue
            files.append(os.path.join(dirpath, fn))

out = []
hits = {}
for p in files:
    try:
        with open(p, 'r', encoding='utf-8', errors='ignore') as f:
            src = f.read()
    except Exception as e:
        out.append('READ-FAIL ' + p + ' ' + str(e))
        continue
    # 去掉注释块，避免把注释里的示例代码算成声明
    for n in NAMES:
        for m in DECL_RE[n].finditer(src):
            line = src.count('\n', 0, m.start()) + 1
            rel = os.path.relpath(p, ROOT)
            hits.setdefault(n, []).append(rel + ':' + str(line))

for n in NAMES:
    hs = hits.get(n, [])
    if len(hs) > 1:
        out.append('DUP  ' + n + ' -> ' + ' | '.join(hs))
    else:
        out.append('OK   ' + n + ' -> ' + (hs[0] if hs else 'NOT-FOUND'))

with open(os.path.join(ROOT, 'tools', 'qa', '_l1_dupcheck.out.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
