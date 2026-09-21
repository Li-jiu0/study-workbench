# -*- coding: utf-8 -*-
"""
跨线文件冲突自动检测 -- 2026-09-16 M 波
========================================
给定多条工程线各自声明的“独占文件清单”，自动算出两两交集是否为空
(防止并发写覆盖)。

用法:
  "C:/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python.exe" ^
  "D:/下载的文件/学习工作台/tools/qa/crossline_conflict_20260916m.py" [mapping.json]

  - 不给参数: 使用内置的 13 条线独占清单(来自主理人派活表)做自检。
  - 给 mapping.json: {"线名": ["文件1","文件2",...], ...}，自动算两两交集。

mapping 文件约定: JSON 对象，key=线名，value=该线独占文件(相对项目根)。
结果写 UTF-8 文件再 Read。
"""
import os, sys, json

ROOT = r'D:\下载的文件\学习工作台'
TOOLS = os.path.join(ROOT, 'tools', 'qa')

# 内置 13 条线独占清单 (来自派活表)
DEFAULT_MAP = {
    '任务一':   ['assets/app.js'],
    '任务二':   ['assets/ai-service.js'],
    '任务三':   ['AI.html', 'assets/ai-page.js'],
    '任务四':   ['工具.html', 'assets/common.css'],
    '任务五':   ['assets/cet-read.js'],
    '任务六':   ['assets/voiceplayer.js', '英语.html'],
    '任务七':   ['AI模拟面试.html', 'assets/iv-prep.js'],
    '任务八':   ['演示.html', 'assets/ppt-tips.js', 'assets/data-ppt-tips.js'],
    '任务九':   ['PPT版式库.html', 'assets/data-ppt-templates.js', 'assets/tpl-preview.js'],
    '任务十':   ['申论刷题.html'],
    '任务十一': ['错题本.html'],
    '任务十二': ['个人中心.html'],
    '任务十三': ['学习概括.html', 'assets/notify.js'],
}

def load_map():
    if len(sys.argv) > 1:
        p = sys.argv[1]
        if os.path.exists(p):
            return json.loads(open(p, 'r', encoding='utf-8').read())
        # 也接受直接传 JSON 字符串
        try:
            return json.loads(p)
        except Exception:
            pass
    return DEFAULT_MAP

def main():
    mp = load_map()
    lines = list(mp.keys())
    conflicts = []
    for i in range(len(lines)):
        for j in range(i + 1, len(lines)):
            a, b = lines[i], lines[j]
            inter = sorted(set(mp[a]) & set(mp[b]))
            if inter:
                conflicts.append((a, b, inter))

    L = []
    L.append('############################################################')
    L.append('# 跨线文件冲突检测  crossline_conflict_20260916m.py')
    L.append('# 参与线数: %d' % len(lines))
    L.append('############################################################')
    L.append('')
    L.append('== 各线独占清单 ==')
    for k in lines:
        L.append('  %-8s : %s' % (k, ', '.join(mp[k]) if mp[k] else '(空)'))
    L.append('')
    L.append('== 两两交集 ==')
    if not conflicts:
        L.append('  (无冲突, 所有线的独占文件两两不相交)')
    else:
        for a, b, inter in conflicts:
            L.append('  [%s] x [%s] 交集: %s' % (a, b, ', '.join(inter)))
    L.append('')
    L.append('============================================================')
    L.append('===== 总结: %s =====' % ('ALL DISJOINT (无冲突)' if not conflicts else '%d 对冲突' % len(conflicts)))
    L.append('============================================================')

    report = '\n'.join(L)
    out_path = os.path.join(TOOLS, 'crossline_conflict_out_20260916m.txt')
    open(out_path, 'w', encoding='utf-8').write(report)
    print('REPORT WRITTEN: ' + out_path)
    print('CONFLICTS=%d' % len(conflicts))

if __name__ == '__main__':
    main()
