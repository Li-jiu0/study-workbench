# -*- coding: utf-8 -*-
"""W2-T2 交付抽查（team lead 复核，不看报告看事实）"""
import io, os, re, subprocess
ROOT = r'D:\下载的文件\学习工作台'
OUT = os.path.join(ROOT, 'tools', 'qa', '_w2t2_audit.txt')
NODE = r'C:\Users\ATM\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
L = []

def rd(p):
    return io.open(os.path.join(ROOT, p), encoding='utf-8', errors='replace').read()

for grp, pats in [
    ('chat-local.js 符号', [(r'function imRecallEligible', 1), (r'function imRecallDeny', 1),
                            (r'function imRecallEntryHtml', 0), (r'function imAskRecall', 1),
                            (r'function imDoRecall', 1), (r'function imShowMsgMenu', 1),
                            (r'imRecallEligible\s*\(', None), (r'im-recall-btn', 0)]),
    ('私聊.html 符号', [(r'\.im-recall-btn', 0), (r'im-msg-menu', None), (r"chat-local\.js\?v=20260915c", 1)]),
]:
    f = 'assets/chat-local.js' if grp.startswith('chat-local') else '私聊.html'
    s = rd(f)
    L.append('== %s ==' % grp)
    for pat, exp in pats:
        n = len(re.findall(pat, s))
        mark = '' if exp is None else ('OK' if n == exp else 'NG(exp %d)' % exp)
        L.append('  %-34s count=%-3d %s' % (pat, n, mark))

BAN = [('?.', r'\?\.[A-Za-z0-9_(\["]'), ('??', r'\?\?'), ('replaceAll', r'\breplaceAll\s*\('),
       ('Object.fromEntries', r'Object\s*\.\s*fromEntries'), ('.at(', r'\.\s*at\s*\(\s*-?\d+\s*\)'),
       ('lookbehind', r'\(\?<[=!]'), ('native dialog', r'(?<![A-Za-z0-9_.])(alert|confirm|prompt)\s*\(')]
L.append('== 禁用语法复核 ==')
for f in ['assets/chat-local.js', '私聊.html']:
    s = rd(f)
    hits = ['%s=%d' % (n, len(re.findall(p, s))) for n, p in BAN if re.findall(p, s)]
    L.append('  %-22s %s' % (f, (', '.join(hits)) if hits else '全 0'))

p = subprocess.run([NODE, '--check', os.path.join(ROOT, 'assets/chat-local.js')], capture_output=True)
L.append('== node --check ==')
L.append('  chat-local.js rc=%d %s' % (p.returncode, (p.stderr or b'').decode('utf-8', 'replace')[:200]))

def git(a):
    q = subprocess.run(['git', '-C', ROOT, '-c', 'core.quotepath=false'] + a, capture_output=True)
    try: return q.returncode, q.stdout.decode('utf-8')
    except Exception: return q.returncode, q.stdout.decode('gbk', errors='replace')
rc, o = git(['diff', '--stat', 'HEAD'])
L.append('== 当前工作区改动 ==')
L.append(o[-1200:])
rc, o = git(['status', '--short'])
L.append('== 未跟踪（仅看是否新增了预期外的 WEB 文件）==')
for line in o.splitlines():
    if line.strip().startswith('??') and not any(x in line for x in ('tools/', '_', '备份')):
        L.append('  ' + line)

io.open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print('AUDIT_DONE')
