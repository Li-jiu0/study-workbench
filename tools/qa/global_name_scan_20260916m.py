# -*- coding: utf-8 -*-
"""
跨文件全局名唯一性扫描 -- 2026-09-16 M 波
============================================
找出「同一个全局名出现在 >=2 个不同文件」的冲突(老 WebView 下重复声明会判
该文件 SyntaxError 并整文件拒绝执行 -> 功能静默全挂, node --check 也抓不到)。

扫描范围: 全部根 HTML 内联 <script> + assets/*.js
排除: 备份/ 目录、tools/ 目录、*.bak*、*.backup-*

要扫的(三处都算顶层/全局声明):
  1. var / const / let 顶层声明
  2. function 名字() 顶层函数声明
  3. 隐式全局: 函数体内无 var/const/let 直接赋值 (foo = 1)

白名单(已验证误报, 必须放行):
  - ** 命中 9 处全是 markdown 字符串字面量, 不是指数运算符 (AST 里字符串不是运算符, 自然不计)
  - 对象剩余/展开: [...] 是数组展开(ES2015允许), 只有 {...} 才是对象展开(ES2018禁止); 本扫描只统计 identifier 冲突, 二者都不会进入冲突清单
  - 合规守卫写法 if (typeof window.xxx !== 'function') window.xxx = ... 不算重复声明(不计入裸全局冲突)

输出: 每个全局名 -> 出现在哪几个文件; 仅把 >=2 不同文件 标 FAIL; 末尾给总结。
结果写 UTF-8 文件再 Read (控制台不打印中文)。

用法:
  "C:/Users/ATM/.workbuddy/binaries/python/versions/3.13.12/python.exe" ^
  "D:/下载的文件/学习工作台/tools/qa/global_name_scan_20260916m.py"
(无参数 = 扫全工程基线; 也可传 "文件1,文件2,..." 只扫指定文件)
"""
import os, re, sys, json, subprocess, glob

ROOT = r'D:\下载的文件\学习工作台'
TOOLS = os.path.join(ROOT, 'tools', 'qa')
NODE = r'C:/Users/ATM/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
HELPER = os.path.join(TOOLS, '_globals_scan.js')
IN_JSON = os.path.join(TOOLS, '_globals_in.json')
OUT_JSON = os.path.join(TOOLS, '_globals_out.json')
OUT_REPORT = os.path.join(TOOLS, 'global_name_out_20260916m.txt')

FATAL_KINDS = {'let', 'const', 'class'}  # 这些重复声明会触发 SyntaxError -> 整文件白屏


def collect_files(arg):
    files = []
    if arg:
        if os.path.exists(arg) and os.path.isfile(arg):
            with open(arg, 'r', encoding='utf-8', errors='replace') as fh:
                for l in fh:
                    l = l.strip()
                    if l and not l.startswith('#'):
                        files.append(l)
            return files
        return [x.strip() for x in arg.split(',') if x.strip()]
    # 默认: 全工程
    # 根 HTML
    for p in glob.glob(os.path.join(ROOT, '*.html')):
        nm = os.path.basename(p)
        if '.bak' in nm or '.backup' in nm:
            continue
        files.append(nm)
    # assets/*.js
    for p in glob.glob(os.path.join(ROOT, 'assets', '*.js')):
        nm = os.path.basename(p)
        if '.bak' in nm or '.backup' in nm:
            continue
        files.append('assets/' + nm)
    return files


def is_excluded(rel):
    # 排除 备份/ tools/ *.bak* *.backup-*
    parts = rel.replace('\\', '/').split('/')
    for part in parts[:-1]:
        if part in ('备份', 'tools', 'node_modules', 'bak', 'backup'):
            return True
    base = parts[-1].lower()
    if '.bak' in base or '.backup' in base:
        return True
    return False


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else ''
    rels = collect_files(arg)
    tree_mode = (not arg)
    rels = [r for r in rels if not (tree_mode and is_excluded(r))]
    items = []
    for rel in rels:
        abs = rel if os.path.isabs(rel) else os.path.join(ROOT, rel)
        if not os.path.exists(abs):
            continue
        ext = os.path.splitext(abs)[1].lower()
        kind = 'js' if ext == '.js' else ('html' if ext == '.html' else 'other')
        if kind == 'other':
            continue
        items.append({'rel': rel, 'abs': abs, 'kind': kind})

    open(IN_JSON, 'w', encoding='utf-8').write(json.dumps(items, ensure_ascii=False))
    subprocess.run([NODE, HELPER, IN_JSON, OUT_JSON], cwd=ROOT, capture_output=True, text=True, timeout=300)
    data = json.loads(open(OUT_JSON, 'r', encoding='utf-8').read())

    # 聚合: name -> { files: {rel: [kinds]}, guardedWrites count, guardWrappers, totals }
    name_files = {}      # name -> set(rel)
    name_kinds = {}      # name -> { rel -> set(kinds) }
    tot_bare = 0
    tot_guarded = 0
    tot_guard_wrappers = 0
    tot_exponent = 0
    tot_objspread = 0
    tot_arrspread = 0
    parse_fail = []

    for rel, info in data.items():
        if not isinstance(info, dict):
            continue
        if info.get('skipped'):
            continue
        if not info.get('parseOk', True):
            parse_fail.append(rel)
            continue
        globals_d = info.get('globals', {})
        for nm, kinds in globals_d.items():
            name_files.setdefault(nm, set()).add(rel)
            name_kinds.setdefault(nm, {}).setdefault(rel, set()).update(kinds)
            tot_bare += 1
        gw = info.get('guardedWrites', [])
        tot_guarded += len(gw)
        tot_guard_wrappers += info.get('guardWrappers', 0)
        tot_exponent += info.get('exponent', 0)
        tot_objspread += info.get('objSpread', 0)
        tot_arrspread += info.get('arrSpread', 0)

    # 冲突 + 三档严重度
    #   FATAL : 同一名字在 >=2 个文件里都是 let/const/class -> 必触发 "already declared" SyntaxError -> 整文件白屏(与加载顺序无关)
    #   RISK  : 1 个文件 let/const/class + 另 1 个文件 var/function  -> 取决于脚本加载顺序, 可能崩
    #   WARN  : 仅 var/function/implicit (含 let/const + 纯 implicit 赋值) -> 非致命, 后定义覆盖
    LEX = {'let', 'const', 'class'}
    VARFN = {'var', 'function'}
    conflicts = []
    for nm, fset in name_files.items():
        if len(fset) >= 2:
            kinds_per_file = {f: sorted(name_kinds[nm][f]) for f in fset}
            allk = set()
            for ks in kinds_per_file.values():
                allk.update(ks)
            num_lex = sum(1 for f in fset if (name_kinds[nm][f] & LEX))
            num_varfn = sum(1 for f in fset if (name_kinds[nm][f] & VARFN))
            if num_lex >= 2:
                sev = 'FATAL'
            elif num_lex == 1 and num_varfn >= 1:
                sev = 'RISK'
            else:
                sev = 'WARN'
            conflicts.append({'name': nm, 'files': sorted(fset), 'kinds': kinds_per_file, 'sev': sev})
    conflicts.sort(key=lambda c: ({'FATAL': 0, 'RISK': 1, 'WARN': 2}[c['sev']], c['name']))

    # ---- 报告 ----
    L = []
    L.append('############################################################')
    L.append('# 跨文件全局名唯一性扫描  global_name_scan_20260916m.py')
    L.append('# 项目根: ' + ROOT)
    L.append('# 时间  : ' + __import__('datetime').datetime.now().isoformat())
    L.append('# 扫描文件数: %d (assets js + 根HTML内联)' % len(items))
    L.append('############################################################')
    L.append('')
    L.append('== 白名单校验 (已知误报应被放行) ==')
    L.append('  ** 指数运算符: AST 实计数 = %d (字符串内的 ** 不计入 AST, 故 9 处 markdown 字符串已自然排除)' % tot_exponent)
    L.append('  数组展开 [...] = %d 处 (ES2015 允许, 不报); 对象展开 {...} = %d 处 (ES2018 禁止, 若>0才需关注)' % (tot_arrspread, tot_objspread))
    L.append('  -> 二者均为“运算符/语法形态”, 不会进入 identifier 冲突清单, 确认已放行。')
    L.append('')
    L.append('== 守卫写法覆盖率 (合规全局定义 vs 裸声明) ==')
    L.append('  裸全局定义(计数, 含 var/const/let/function/class/implicit): %d' % tot_bare)
    L.append('  守卫式 window.X= 定义(计数): %d' % tot_guarded)
    L.append('  typeof/!/比较 守卫条件出现次数: %d' % tot_guard_wrappers)
    if (tot_bare + tot_guarded) > 0:
        cov = 100.0 * tot_guarded / (tot_bare + tot_guarded)
        L.append('  守卫覆盖率: %.1f%%' % cov)
    L.append('')
    if parse_fail:
        L.append('== 解析失败文件(escheck 应已拦截, 此处跳过): %d ==' % len(parse_fail))
        for f in parse_fail[:20]:
            L.append('   - ' + f)
        L.append('')
    L.append('== 冲突清单 (同一全局名出现在 >=2 个不同文件) ==')
    L.append('   严重度: FATAL=两文件都是 let/const/class(必崩) | RISK=let/const 配 var/function(看加载顺序) | WARN=仅 var/function/implicit(非致命)')
    if not conflicts:
        L.append('  (无冲突)')
    else:
        for c in conflicts:
            if c['sev'] == 'FATAL':
                tag = 'FATAL(必整文件白屏)'
            elif c['sev'] == 'RISK':
                tag = 'RISK(看加载顺序可能崩)'
            else:
                tag = 'WARN(非致命重声明)'
            L.append('')
            L.append('  [%s] %s  出现于 %d 个文件' % (tag, c['name'], len(c['files'])))
            for f in c['files']:
                L.append('      - %s  : %s' % (f, ','.join(c['kinds'][f])))
    L.append('')
    L.append('============================================================')
    if conflicts:
        nf = sum(1 for c in conflicts if c['sev'] == 'FATAL')
        nr = sum(1 for c in conflicts if c['sev'] == 'RISK')
        nw = sum(1 for c in conflicts if c['sev'] == 'WARN')
        L.append('===== 全局名唯一性: %d 项冲突 (FATAL=%d, RISK=%d, WARN=%d) =====' % (len(conflicts), nf, nr, nw))
    else:
        L.append('===== 全局名唯一性: ALL PASS =====')
    L.append('============================================================')
    L.append('注意: 此刻 12 条工程线仍在改文件, 上方为“半成品快照”基线, 仅记录数字, 勿据此改动任何文件。')

    report = '\n'.join(L)
    open(OUT_REPORT, 'w', encoding='utf-8').write(report)
    nf = sum(1 for c in conflicts if c['sev'] == 'FATAL')
    nr = sum(1 for c in conflicts if c['sev'] == 'RISK')
    nw = sum(1 for c in conflicts if c['sev'] == 'WARN')
    print('REPORT WRITTEN: ' + OUT_REPORT)
    print('CONFLICTS=%d FATAL=%d RISK=%d WARN=%d bare=%d guarded=%d' % (len(conflicts), nf, nr, nw, tot_bare, tot_guarded))


if __name__ == '__main__':
    main()
