# -*- coding: utf-8 -*-
import os, re, json
base = r'D:\下载的文件\学习工作台'
js = open(os.path.join(base, r'assets\ai-settings.js'), 'rb').read().decode('utf-8')
names = ['normLastSort','dedupKeepOrder','soleCategoryOfModel','migrateCatSchema','isProbeNoAutoId',
         'doRunHealthCheck','usableIds','visibleModels','saveLastSort','retiredRank','catKeyOfModel',
         'catOrderIndex','catLabelOf','sortByCategory','isRetiredModel','isRetiredId','retiredBadgeOf',
         'introSec','buildSortCatOptions','restoreSortUI','toggleHideUnavailable','familyGroupsHtml',
         'recordHealth','pendingHealthIds','runHealthCheck','mapToAiList','selectModel','renderFuncTypes']
rep = {}
for n in names:
    decls = len(re.findall(r'function\s+' + n + r'\s*\(', js))
    rep[n] = decls
# 顶层 var 名
topvars = re.findall(r'^  var ([A-Za-z_$][\w$]*)', js, re.M)
from collections import Counter
dup = {k: v for k, v in Counter(topvars).items() if v > 1}
rep['_dup_toplevel_var'] = dup
rep['_toplevel_var_names'] = sorted(set(topvars))
with open(os.path.join(base,'tools','_t03_dup_out.json'),'w',encoding='utf-8') as w:
    w.write(json.dumps(rep, ensure_ascii=False, indent=1))
print('done')
