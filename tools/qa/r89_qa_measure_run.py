# -*- coding: utf-8 -*-
"""r89_qa_measure_run.py —— 量 .xtlp 内部高度构成，结果写 _measure_out.txt"""
import os, json, subprocess

BASE = r'D:\下载的文件\学习工作台'
NODE = r'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
OUTF = os.path.join(BASE, 'tools', 'qa', '_measure_out.txt')
lines = []

for vp in [('375', '667'), ('375', '480'), ('320', '480')]:
    OUTJSON = os.path.join(BASE, 'tools', 'qa', 'r89_qa_cdp_out.json')
    if os.path.exists(OUTJSON):
        os.remove(OUTJSON)
    p = subprocess.run([NODE, os.path.join(BASE, 'tools', 'qa', 'r89_qa_cdp.js'),
                        'file:///D:/下载的文件/学习工作台/私聊.html', vp[0], vp[1],
                        os.path.join(BASE, 'tools', 'qa', 'r89_qa_measure.js')],
                       capture_output=True, timeout=120)
    lines.append('=== %sx%s ===' % vp)
    if not os.path.exists(OUTJSON):
        lines.append('  NO_OUTPUT rc=%s' % p.returncode)
        lines.append('  stdout=' + p.stdout.decode('utf-8', 'replace')[:1500])
        lines.append('  stderr=' + p.stderr.decode('utf-8', 'replace')[:1500])
        continue
    d = json.load(open(OUTJSON, encoding='utf-8'))
    if not d.get('ok'):
        lines.append('  NOT_OK exc=' + str(d.get('exception'))[:600])
        continue
    r = d['result']
    if r.get('fatal'):
        lines.append('  FATAL=' + str(r['fatal']))
        continue
    for k in ['rootRect', 'bodyRect', 'headRect', 'searchRect', 'mapRect', 'curlineRect', 'listRect', 'footRect']:
        lines.append('  %-14s %s' % (k, r.get(k)))
    lines.append('  ---')
    for k in ['listHeight', 'footHeight', 'overheadAbove', 'overheadBelow', 'overheadAll',
              'configuredMaxH', 'cssMaxHCap', 'scrollH', 'clientH', 'isActuallyCappedByStyle',
              'gapHeadSearch', 'gapSearchMap', 'gapMapList']:
        lines.append('  %-22s %s' % (k, r.get(k)))
    lines.append('')

open(OUTF, 'w', encoding='utf-8').write('\n'.join(lines))
print('\n'.join(lines))
